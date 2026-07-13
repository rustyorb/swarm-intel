import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

// Load environment variables
dotenv.config();

// Validate Gemini API Key
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("WARNING: GEMINI_API_KEY environment variable is not set. Gemini API calls will fail.");
}

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

const generateWithRetry = async (params: any, retries = 4, baseDelayMs = 15000): Promise<any> => {
  for (let i = 0; i < retries; i++) {
    try {
      return await ai.models.generateContent(params);
    } catch (error: any) {
      const isRateLimitOrOverload = 
        error?.status === 429 || 
        error?.status === 503 || 
        error?.status === 'RESOURCE_EXHAUSTED' ||
        error?.message?.includes('429') ||
        error?.message?.includes('503') ||
        error?.message?.includes('quota');

      if (i < retries - 1 && isRateLimitOrOverload) {
        // Look for a retry delay in the error if provided, otherwise fallback to exponential backoff with random jitter
        let delay = baseDelayMs * Math.pow(1.5, i) + Math.floor(Math.random() * 4000);
        if (error?.message) {
          const match = error.message.match(/Please retry in ([\d.]+)s/);
          if (match && match[1]) {
            delay = (parseFloat(match[1]) * 1000) + 1500; // Add 1.5s buffer
          }
        }
        
        console.warn(`[API] Rate limit/Overload encountered. Retrying in ${delay}ms... (Attempt ${i + 1} of ${retries})`);
        await new Promise(res => setTimeout(res, delay));
      } else {
        throw error;
      }
    }
  }
};

const generateStreamWithRetry = async (params: any, retries = 4, baseDelayMs = 15000): Promise<any> => {
  for (let i = 0; i < retries; i++) {
    try {
      const responseStream = await ai.models.generateContentStream(params);
      // Wait for the first chunk to ensure the stream actually starts and we catch early rate limit errors
      const iterator = responseStream[Symbol.asyncIterator]();
      const firstChunk = await iterator.next();
      
      // If we get here, it succeeded. We create a generator to yield the first chunk then the rest
      async function* wrappedStream() {
        if (!firstChunk.done) {
          yield firstChunk.value;
          yield* iterator;
        }
      }
      return wrappedStream();
    } catch (error: any) {
      const isRateLimitOrOverload = 
        error?.status === 429 || 
        error?.status === 503 || 
        error?.status === 'RESOURCE_EXHAUSTED' ||
        error?.message?.includes('429') ||
        error?.message?.includes('503') ||
        error?.message?.includes('quota');

      if (i < retries - 1 && isRateLimitOrOverload) {
        let delay = baseDelayMs * Math.pow(1.5, i) + Math.floor(Math.random() * 4000);
        if (error?.message) {
          const match = error.message.match(/Please retry in ([\d.]+)s/);
          if (match && match[1]) {
            delay = (parseFloat(match[1]) * 1000) + 1500; // Add 1.5s buffer
          }
        }
        
        console.warn(`[API Stream] Rate limit/Overload encountered. Retrying in ${delay}ms... (Attempt ${i + 1} of ${retries})`);
        await new Promise(res => setTimeout(res, delay));
      } else {
        throw error;
      }
    }
  }
};

// -------------------------------------------------------------
// Universal Multi-Provider Routing & LLM Execution Helpers
// -------------------------------------------------------------

function extractJSON(text: string): any {
  let cleanText = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleanText);
  } catch (e) {
    const firstBrace = cleanText.indexOf("{");
    const firstBracket = cleanText.indexOf("[");
    
    let startIdx = -1;
    let endIdx = -1;
    
    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      startIdx = firstBrace;
      endIdx = cleanText.lastIndexOf("}");
    } else if (firstBracket !== -1) {
      startIdx = firstBracket;
      endIdx = cleanText.lastIndexOf("]");
    }
    
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const JSONStr = cleanText.substring(startIdx, endIdx + 1);
      try {
        return JSON.parse(JSONStr);
      } catch (innerError: any) {
        throw new Error(`Candidate JSON located but parsing failed: ${innerError.message}. Content: ${JSONStr}`);
      }
    }
    throw new Error(`Failed to locate any valid JSON array or block in model response: ${text}`);
  }
}

function getModelAndKey(taskRole: "orchestrator" | "agent" | "synthesis", settings: any) {
  let provider = "gemini";
  let model = "gemini-3.5-flash";
  let apiKey = process.env.GEMINI_API_KEY || "";
  let baseUrl = "";

  if (settings && settings.modelMapping && settings.modelMapping[taskRole]) {
    const mapping = settings.modelMapping[taskRole];
    provider = mapping.provider || "gemini";
    model = mapping.model || "gemini-3.5-flash";
    
    if (settings.providers && settings.providers[provider]) {
      const prov = settings.providers[provider];
      apiKey = prov.apiKey || "";
      baseUrl = prov.baseUrl || "";
    }
  }

  if (provider === "gemini" && !apiKey) {
    apiKey = process.env.GEMINI_API_KEY || "";
  }

  return { provider, model, apiKey, baseUrl };
}

async function callOpenAICompatible(url: string, apiKey: string, body: any): Promise<any> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upstream API status ${response.status}: ${errorText || response.statusText}`);
  }
  return await response.json();
}

async function callAnthropic(apiKey: string, body: any): Promise<any> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API status ${response.status}: ${errorText || response.statusText}`);
  }
  return await response.json();
}

async function generateUnifiedJSON(
  taskRole: "orchestrator" | "agent" | "synthesis",
  settings: any,
  prompt: string,
  systemInstruction: string,
  responseSchema?: any
): Promise<any> {
  const { provider, model, apiKey, baseUrl } = getModelAndKey(taskRole, settings);

  if (provider === "gemini") {
    const client = new GoogleGenAI({ apiKey });
    const response = await client.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema,
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ] as any
      }
    });

    const text = response.text;
    if (!text) throw new Error(`Empty response from Gemini orchestrator using model: ${model}`);
    return extractJSON(text);
  }

  let fullPrompt = `${systemInstruction}\n\nUser request:\n${prompt}`;
  fullPrompt += `\n\nCRITICAL: Respond ONLY with a valid, raw JSON representation matching the required schema. Do NOT wrap output in markdown enclosures like \`\`\`json. Your response must parse directly as a raw JSON string.`;

  let responseText = "";

  if (provider === "anthropic") {
    const result = await callAnthropic(apiKey, {
      model,
      messages: [{ role: "user", content: fullPrompt }],
      max_tokens: 4000
    });
    responseText = result.content?.[0]?.text || "";
  } else {
    let targetUrl = "https://api.openai.com/v1/chat/completions";
    if (provider === "openrouter") targetUrl = "https://openrouter.ai/api/v1/chat/completions";
    else if (provider === "venice") targetUrl = "https://api.venice.ai/api/v1/chat/completions";
    else if (provider === "lmstudio") targetUrl = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
    else if (provider === "ollama") targetUrl = `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;

    const result = await callOpenAICompatible(targetUrl, apiKey, {
      model,
      messages: [{ role: "user", content: fullPrompt }],
      response_format: { type: "json_object" }
    });
    responseText = result.choices?.[0]?.message?.content || "";
  }

  if (!responseText) throw new Error(`No content returned from ${provider} model: ${model}.`);
  return extractJSON(responseText);
}

async function runUniversalStream(
  taskRole: "orchestrator" | "agent" | "synthesis",
  settings: any,
  prompt: string,
  systemInstruction: string,
  hasSearch: boolean,
  onChunk: (text: string) => void
): Promise<void> {
  const { provider, model, apiKey, baseUrl } = getModelAndKey(taskRole, settings);

  if (provider === "gemini") {
    const client = new GoogleGenAI({ apiKey });
    const responseStream = await client.models.generateContentStream({
      model: model,
      contents: prompt,
      config: {
        systemInstruction,
        ...(hasSearch ? { tools: [{ googleSearch: {} }] } : {}),
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ] as any
      }
    });

    for await (const chunk of responseStream) {
      if (chunk.text) {
        onChunk(chunk.text);
      }
    }
    return;
  }

  if (provider === "anthropic") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: `${systemInstruction}\n\n${prompt}` }],
        max_tokens: 4000,
        stream: true
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic streaming status ${response.status}: ${errText}`);
    }

    const reader = response.body as any;
    if (!reader) throw new Error("Anthropic response body is empty.");

    let buffer = "";
    for await (const chunk of reader) {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const cleanLine = line.trim();
        if (!cleanLine) continue;

        if (cleanLine.startsWith("data: ")) {
          try {
            const parsed = JSON.parse(cleanLine.substring(6));
            if (parsed.type === "content_block_delta" && parsed.delta?.text) {
              onChunk(parsed.delta.text);
            }
          } catch (e) {
            // Ignore partial chunk parsing errors
          }
        }
      }
    }
    return;
  }

  // OpenAI-compatible providers
  let targetUrl = "https://api.openai.com/v1/chat/completions";
  if (provider === "openrouter") targetUrl = "https://openrouter.ai/api/v1/chat/completions";
  else if (provider === "venice") targetUrl = "https://api.venice.ai/api/v1/chat/completions";
  else if (provider === "lmstudio") targetUrl = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  else if (provider === "ollama") targetUrl = `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;

  const response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: prompt }
      ],
      stream: true
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`${provider.toUpperCase()} streaming status ${response.status}: ${errText}`);
  }

  const reader = response.body as any;
  if (!reader) throw new Error(`${provider.toUpperCase()} response body is empty.`);

  let buffer = "";
  for await (const chunk of reader) {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const cleanLine = line.trim();
      if (!cleanLine) continue;
      if (cleanLine === "data: [DONE]") continue;

      if (cleanLine.startsWith("data: ")) {
        try {
          const parsed = JSON.parse(cleanLine.substring(6));
          const text = parsed.choices?.[0]?.delta?.content || "";
          if (text) {
            onChunk(text);
          }
        } catch (e) {
          // Ignore partial chunk JSON parses
        }
      }
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Parse JSON payloads (support larger payload size for multiple research reports)
  app.use(express.json({ limit: "15mb" }));

  // API Health Endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", api_key_set: !!apiKey });
  });

  // Fetch Models Endpoint for testing connection and loading available models
  app.post("/api/settings/fetch-models", async (req, res) => {
    try {
      const { provider, apiKey: provKey, baseUrl } = req.body;
      if (!provider) {
        return res.status(400).json({ error: "Provider is required." });
      }

      let models: string[] = [];

      if (provider === "gemini") {
        try {
          const client = new GoogleGenAI({ apiKey: provKey || process.env.GEMINI_API_KEY || "" });
          const response = await client.models.list() as any;
          for (const m of response) {
            if (m.name) {
              models.push(m.name.replace("models/", ""));
            }
          }
          models = models.filter((name: string) => name.includes("gemini") || name.includes("learnlm"));
        } catch (err) {
          // Fallback to standard active Gemini models
          models = ["gemini-3.5-flash", "gemini-3.1-pro-preview", "gemini-3.1-flash-lite"];
        }
      } else if (provider === "openai") {
        const url = "https://api.openai.com/v1/models";
        const response = await fetch(url, {
          headers: { "Authorization": `Bearer ${provKey}` }
        });
        if (!response.ok) {
          throw new Error(`OpenAI API responded with status ${response.status}`);
        }
        const data = await response.json() as any;
        models = data.data.map((m: any) => m.id).filter((id: string) => id.includes("gpt") || id.includes("o1") || id.includes("o3"));
      } else if (provider === "openrouter") {
        const url = "https://openrouter.ai/api/v1/models";
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`OpenRouter API responded with status ${response.status}`);
        }
        const data = await response.json() as any;
        models = data.data.map((m: any) => m.id);
      } else if (provider === "anthropic") {
        // Return standard well-known Anthropic models alphabetically
        models = [
          "claude-3-5-sonnet-latest",
          "claude-3-5-sonnet-20241022",
          "claude-3-5-haiku-latest",
          "claude-3-5-haiku-20241022",
          "claude-3-opus-latest",
          "claude-3-opus-20240229",
          "claude-3-sonnet-20240229",
          "claude-3-haiku-20240307"
        ];
      } else if (provider === "venice") {
        const url = "https://api.venice.ai/api/v1/models";
        const response = await fetch(url, {
          headers: { "Authorization": `Bearer ${provKey}` }
        });
        if (!response.ok) {
          throw new Error(`Venice API responded with status ${response.status}`);
        }
        const data = await response.json() as any;
        models = data.data.map((m: any) => m.id);
      } else if (provider === "lmstudio") {
        const base = baseUrl.replace(/\/$/, "");
        let response;
        try {
          response = await fetch(`${base}/models`);
        } catch (e) {
          response = await fetch(`${base}/v1/models`);
        }
        if (!response.ok) {
          throw new Error(`LM Studio responded with status ${response.status}`);
        }
        const data = await response.json() as any;
        models = data.data.map((m: any) => m.id);
      } else if (provider === "ollama") {
        const base = baseUrl.replace(/\/$/, "");
        const response = await fetch(`${base}/api/tags`);
        if (!response.ok) {
          throw new Error(`Ollama responded with status ${response.status}`);
        }
        const data = await response.json() as any;
        models = data.models.map((m: any) => m.name);
      }

      // Filter empty/nulls and sort alphabetically
      models = models.filter((m: any) => !!m).sort((a: string, b: string) => a.localeCompare(b));

      res.json({ models });
    } catch (error: any) {
      console.error(`Error fetching models for ${req.body.provider}:`, error);
      res.status(500).json({ error: error.message || "Failed to fetch models from provider." });
    }
  });

  // 1. Swarm Assembly Endpoint - Breaks a topic down into 5-7 parallel agents
  app.post("/api/research/initiate", async (req, res) => {
    try {
      const { topic, settings, config } = req.body;
      if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
        return res.status(400).json({ error: "A valid research topic is required." });
      }

      const rawCount = config && typeof config.agentCount === "number" ? config.agentCount : 6;
      const agentCount = Math.max(3, Math.min(9, Math.round(rawCount)));
      const depth = config && config.depth ? config.depth : "standard";

      let depthHint = "";
      if (depth === "recon") {
        depthHint = "\nDEPTH MODE — RECON: Keep each agent's angle tightly scoped and narrowly focused for rapid tactical coverage. Avoid sprawling, open-ended mandates.";
      } else if (depth === "deep") {
        depthHint = "\nDEPTH MODE — DEEP: Make each agent's angle maximally ambitious and far-reaching, probing edge cases, second-order effects, and deep technical frontiers.";
      }

      console.log(`Assembling research swarm for topic: "${topic}" (${agentCount} agents, ${depth} depth)`);

      const prompt = `Analyze the user's research topic: "${topic}".
Break this topic down into exactly ${agentCount} distinct, parallel specialist research perspectives.
For each perspective, design an elite research agent with a unique creative name (e.g. Dr. Aris Vance, Agent Cipher, Investigator Kaelen), a highly specialized role/title (e.g. Cryptographic Analyst, Geopolitical Strategist), a detailed investigative instruction/angle, and a visual theme color.
Ensure the angles cover the full breadth of the topic from different aspects (e.g. technical engineering, socioeconomic impact, historical context, ethical concerns, futuristic outlook, structural analysis, etc.).${depthHint}`;

      const systemInstruction = "You are an elite Research Swarm Orchestrator. Your task is to break down research requests into cohesive, complementary parallel investigative tracks run by specialized, interesting digital persona agents.";

      const responseSchema = {
        type: Type.OBJECT,
        description: "An object containing the list of assembled specialized research agents.",
        properties: {
          agents: {
            type: Type.ARRAY,
            description: "List of specialized research agents assembled for the topic.",
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING, description: "A unique short alphanumeric ID for the agent, e.g. agent-1" },
                name: { type: Type.STRING, description: "A unique, creative name for the specialist agent (e.g., Dr. Aris Vance, Agent Cipher)" },
                role: { type: Type.STRING, description: "A detailed role or specialty title (e.g., Cryptographic Analyst, Geopolitical Strategist)" },
                investigativeAngle: { type: Type.STRING, description: "A specific investigative query/angle this agent will focus on, detailing what they must explore" },
                colorTheme: { type: Type.STRING, description: "A color name matching their role (choose one of: cyan, emerald, rose, amber, purple, indigo, blue, fuchsia)" },
              },
              required: ["id", "name", "role", "investigativeAngle", "colorTheme"],
            },
          }
        },
        required: ["agents"]
      };

      const result = await generateUnifiedJSON("orchestrator", settings, prompt, systemInstruction, responseSchema);
      
      let agentsList: any[] = [];
      if (result) {
        if (Array.isArray(result)) {
          agentsList = result;
        } else if (Array.isArray(result.agents)) {
          agentsList = result.agents;
        } else if (typeof result === "object") {
          // Robust fallback: find any array property in the returned object
          const foundArray = Object.values(result).find(val => Array.isArray(val));
          if (foundArray) {
            agentsList = foundArray as any[];
          }
        }
      }

      // Safeguard IDs and structure
      const cleanAgents = agentsList.map((a: any, idx: number) => ({
        id: a.id || `agent-${idx + 1}`,
        name: a.name || `Specialist ${idx + 1}`,
        role: a.role || "Swarm Investigator",
        investigativeAngle: a.investigativeAngle || `Analyze dimension ${idx + 1}`,
        colorTheme: a.colorTheme || "cyan"
      }));

      res.json({ agents: cleanAgents });
    } catch (error: any) {
      console.error("Error in /api/research/initiate:", error);
      res.status(500).json({ error: error.message || "Failed to assemble research agents." });
    }
  });

  // 1.5. Regenerate Single Agent Endpoint with Nudge
  app.post("/api/research/regenerate-agent", async (req, res) => {
    try {
      const { topic, agents, agentIdToRegenerate, nudge, settings } = req.body;
      if (!topic || !agents || !agentIdToRegenerate) {
        return res.status(400).json({ error: "Topic, agents list, and agentIdToRegenerate are required." });
      }

      console.log(`Regenerating agent ${agentIdToRegenerate} for topic: "${topic}" with nudge: "${nudge || "none"}"`);

      const otherAgents = agents.filter((a: any) => a.id !== agentIdToRegenerate);
      const otherAgentsContext = otherAgents
        .map((a: any) => `- ${a.name} (${a.role}): ${a.investigativeAngle}`)
        .join("\n");

      const prompt = `Topic: "${topic}"
Existing research team:
${otherAgentsContext || "None"}

The user wants to replace/regenerate the specialist agent node that has ID: "${agentIdToRegenerate}".
${nudge ? `The user provided the following design NUDGE/CRITIQUE to guide this new agent's role and focus: "${nudge}"` : "Please refresh this agent to complement the rest of the team."}

Design a fresh, new replacement research specialist agent.
The replacement agent MUST have a unique, creative name (completely different from other existing agents), a highly specialized role/title, a detailed investigative instruction/angle, and a theme color (one of: cyan, emerald, rose, amber, purple, indigo, blue, fuchsia).
Ensure the new agent is distinct and does not replicate the other existing agents, but complements them perfectly.`;

      const systemInstruction = "You are an elite Research Swarm Orchestrator. Your task is to design a high-fidelity specialized agent to replace an existing node in a research team, strictly adhering to the user's focus nudge.";

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: "Must be the exact ID of the agent being replaced: " + agentIdToRegenerate },
          name: { type: Type.STRING, description: "A unique, creative name for the replacement specialist agent" },
          role: { type: Type.STRING, description: "A detailed role or specialty title for the replacement agent" },
          investigativeAngle: { type: Type.STRING, description: "A specific investigative query/angle addressing the nudge and topic" },
          colorTheme: { type: Type.STRING, description: "A color name (choose one of: cyan, emerald, rose, amber, purple, indigo, blue, fuchsia)" },
        },
        required: ["id", "name", "role", "investigativeAngle", "colorTheme"],
      };

      const replacementAgent = await generateUnifiedJSON("orchestrator", settings, prompt, systemInstruction, responseSchema);
      
      // Make sure the ID is correct
      replacementAgent.id = agentIdToRegenerate;

      res.json({ agent: replacementAgent });
    } catch (error: any) {
      console.error("Error in /api/research/regenerate-agent:", error);
      res.status(500).json({ error: error.message || "Failed to regenerate specialist agent." });
    }
  });

  // 2. Agent Research Run Endpoint - Executes a single agent investigation via SSE
  app.post("/api/research/agent-run-stream", async (req, res) => {
    try {
      const { topic, agent, settings, config } = req.body;
      if (!topic || !agent) {
        return res.status(400).json({ error: "Topic and agent configuration are required." });
      }

      const depth = config && config.depth ? config.depth : "standard";

      console.log(`Running streaming agent investigation: ${agent.name} (${agent.role}) for topic: "${topic}" [${depth}]`);

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ type: "ping" })}\n\n`);

      let prompt: string;
      if (depth === "recon") {
        prompt = `You are ${agent.name}, a specialized research agent working as a ${agent.role}.
The overarching research project is: "${topic}".
Your specific investigative assignment is: "${agent.investigativeAngle}".

Deliver a FOCUSED TACTICAL BRIEF of approximately 500-800 words. Be sharp, dense, and high-signal. Cut all filler and padding.
Structure your response with Markdown:
- A brief 'Role Perspective' (2-3 sentences on how a ${agent.role} frames this issue).
- 'Key Findings' as a set of tight, information-rich bullet points.
- 'Critical Insights' capturing the 2-4 most consequential takeaways.

Utilize web search to ground your points. Write in your persona, first person. Prioritize precision over volume.`;
      } else if (depth === "deep") {
        prompt = `You are ${agent.name}, a specialized research agent working as a ${agent.role}.
The overarching research project is: "${topic}".
Your specific investigative assignment is: "${agent.investigativeAngle}".

Conduct an EXTENSIVE, IN-DEPTH investigation based on your role and instructions. You must think deeply, utilize web searches extensively, and provide a massive, comprehensive professional specialist report. Do not hold back; elaborate significantly on every point.
Structure your response beautifully with Markdown:
- Use clear headers.
- Include a 'Role Perspective' section detailing how a ${agent.role} uniquely views this issue.
- Include 'Detailed Findings' with robust analysis, structured points, data, and technical breakdowns.
- Include 'Critical Insights' with deep thinking, interconnected consequences, and future implications.
- Include 'Methodology & Data Vectors' detailing what parameters you considered.

DEEP-ANALYSIS REQUIREMENTS (mandatory):
- Provide QUANTIFIED data, figures, and estimates wherever possible (ranges, magnitudes, timelines, costs).
- Include AT LEAST ONE Markdown table organizing key data, comparisons, or metrics.
- Include a 'Scenario Analysis' section modeling best-case, base-case, and worst-case trajectories.
- Include a 'Contrarian Considerations' section that challenges the prevailing assumptions of your own analysis.

Be exhaustive, verbose, informative, and write in your persona. Do not speak about yourself in the third person. Provide publication-grade, extremely high-quality content.`;
      } else {
        prompt = `You are ${agent.name}, a specialized research agent working as a ${agent.role}.
The overarching research project is: "${topic}".
Your specific investigative assignment is: "${agent.investigativeAngle}".

Conduct an EXTENSIVE, IN-DEPTH investigation based on your role and instructions. You must think deeply, utilize web searches extensively, and provide a massive, comprehensive professional specialist report. Do not hold back; elaborate significantly on every point.
Structure your response beautifully with Markdown:
- Use clear headers.
- Include a 'Role Perspective' section detailing how a ${agent.role} uniquely views this issue.
- Include 'Detailed Findings' with robust analysis, structured points, data, and technical breakdowns.
- Include 'Critical Insights' with deep thinking, interconnected consequences, and future implications.
- Include 'Methodology & Data Vectors' detailing what parameters you considered.

Be exhaustive, verbose, informative, and write in your persona. Do not speak about yourself in the third person. Provide publication-grade, extremely high-quality content.`;
      }

      const pingInterval = setInterval(() => {
        res.write(`data: ${JSON.stringify({ type: "ping" })}\n\n`);
      }, 5000);

      try {
        await runUniversalStream(
          "agent",
          settings,
          prompt,
          `You are ${agent.name}, an expert ${agent.role}. Respond with absolute rigor and intellectual depth, matching your specialized role.`,
          true,
          (text: string) => {
            res.write(`data: ${JSON.stringify({ type: "chunk", text })}\n\n`);
          }
        );

        clearInterval(pingInterval);
        res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
        res.end();
      } catch (error: any) {
        clearInterval(pingInterval);
        throw error;
      }
    } catch (error: any) {
      console.error("Error in /api/research/agent-run-stream:", error);
      res.write(`data: ${JSON.stringify({ type: "error", error: error.message || "Streaming failed." })}\n\n`);
      res.end();
    }
  });

  // 3. Consolidated Synthesis Endpoint - Compiles final synthesis report
  app.post("/api/research/synthesize-stream", async (req, res) => {
    try {
      const { topic, reports, settings, config } = req.body;
      if (!topic || !reports || !Array.isArray(reports)) {
        return res.status(400).json({ error: "Topic and reports array are required." });
      }

      const depth = config && config.depth ? config.depth : "standard";

      console.log(`Synthesizing ${reports.length} reports for topic: "${topic}" via SSE [${depth}]`);

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ type: "ping" })}\n\n`);

      const reportsContext = reports
        .filter(r => r && r.report)
        .map((r) => `### AGENT: ${r.agentName || "Specialist"}\n**ROLE:** ${r.agentRole || "Investigator"}\n**FINDINGS:**\n${r.report}\n---\n`)
        .join("\n");

      if (!reportsContext) {
        return res.status(400).json({ error: "No valid specialist reports found to synthesize." });
      }

      console.log(`Synthesis Context size: ${reportsContext.length} chars`);

      let depthDirective = "";
      if (depth === "recon") {
        depthDirective = "\n\nDEPTH DIRECTIVE — RECON: Produce a SHARP EXECUTIVE SYNTHESIS, roughly 40% more concise than a standard report. Prioritize the highest-signal conclusions, trim elaboration, and keep every section tight and decision-oriented.";
      } else if (depth === "deep") {
        depthDirective = "\n\nDEPTH DIRECTIVE — DEEP: Maximize retention of technical nuance. Preserve quantified data, edge cases, dissenting views, tables, and scenario analyses surfaced by the specialists. Favor comprehensiveness and analytical rigor over brevity.";
      }

      const prompt = `OVERARCHING TOPIC: "${topic}"

You are the Lead Swarm Orchestrator. Your mission is to synthesize the following expert investigative reports into a single, comprehensive, publication-grade analytical document.

SPECIALIST REPORTS:
${reportsContext}

REQUIRED OUTPUT STRUCTURE:
# ${topic}: Swarm Intelligence Synthesis

## 1. Executive Summary
- High-level distillation of core discoveries.
- The "Bottom Line Up Front" (BLUF).

## 2. Investigative Tracks & Methodology
- Overview of the parallel expertise utilized in this swarm.
- How the different specialist angles (technical, social, ethical, etc.) interconnected.

## 3. Synthesized Expert Insights
- Deep-dive analysis categorized by theme.
- Do NOT just list reports. BLEND the insights together to form a coherent narrative.
- Use sub-headers for major thematic pillars.

## 4. Conflict, Consensus & Uncertainty
- Where did specialists agree?
- Where were there disagreements or trade-offs?
- Identify gaps or areas requiring further future investigation.

## 5. Strategic Trajectory & Recommendations
- Forward-looking implications.
- Actionable steps or logical consequences.

## 6. Synthesis Conclusion
- Final summarizing statement.

STYLE GUIDELINES:
- Tone: Academic, rigorous, insightful, and authoritative.
- Depth: Be extremely detailed. Retain the technical nuances from the specialist reports.
- Flow: Ensure a smooth narrative transition between sections.
- Markdown: Use clean, standard Markdown.${depthDirective}`;

      const pingInterval = setInterval(() => {
        res.write(`data: ${JSON.stringify({ type: "ping" })}\n\n`);
      }, 5000);

      try {
        let synthesizedReport = "";
        await runUniversalStream(
          "synthesis",
          settings,
          prompt,
          "You are the Lead Swarm Orchestrator. You specialize in synthesizing multiple distinct, expert perspectives into highly detailed, comprehensive, publication-grade analytical reports. Ensure maximal detail and deep thinking.",
          false,
          (text: string) => {
            synthesizedReport += text;
            res.write(`data: ${JSON.stringify({ type: "chunk", text })}\n\n`);
          }
        );

        clearInterval(pingInterval);
        console.log(`Synthesis generation complete. Response text length: ${synthesizedReport.length}`);
        res.write(`data: ${JSON.stringify({ type: "done", text: synthesizedReport })}\n\n`);
        res.end();
      } catch (error: any) {
        clearInterval(pingInterval);
        throw error;
      }
    } catch (error: any) {
      console.error("Error in /api/research/synthesize-stream:", error);
      res.write(`data: ${JSON.stringify({ type: "error", error: error.message || "Synthesis failed." })}\n\n`);
      res.end();
    }
  });

  // Vite middleware / client routing setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
