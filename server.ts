import express from "express";
import path from "path";
import os from "os";
import net from "net";
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

// .env keys are the durable option — browser-stored keys are per-origin
// (host:port) and vanish whenever the port changes.
function envKeyFor(provider: string): string {
  const envKeys: Record<string, string> = {
    gemini: process.env.GEMINI_API_KEY || "",
    openrouter: process.env.OPENROUTER_API_KEY || "",
    openai: process.env.OPENAI_API_KEY || "",
    anthropic: process.env.ANTHROPIC_API_KEY || "",
    venice: process.env.VENICE_API_KEY || "",
  };
  return envKeys[provider] || "";
}

function getModelAndKey(taskRole: "orchestrator" | "agent" | "synthesis", settings: any) {
  let provider = "gemini";
  let model = "gemini-3.5-flash";
  let apiKey = "";
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

  if (!apiKey) {
    apiKey = envKeyFor(provider);
  }
  if (!baseUrl) {
    if (provider === "lmstudio") baseUrl = process.env.LMSTUDIO_BASE_URL || "http://localhost:1234/v1";
    else if (provider === "ollama") baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
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
  // Gemini receives the schema natively; every other provider must see it in
  // the prompt or each model invents its own JSON shape.
  if (responseSchema) {
    fullPrompt += `\n\nThe JSON MUST conform exactly to this schema (property names and nesting are mandatory):\n${JSON.stringify(responseSchema)}`;
  }

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

    // Stream chunks are Uint8Array — String(chunk) would render comma-joined
    // byte values, so decode them as UTF-8 text.
    const sseDecoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of reader) {
      buffer += typeof chunk === "string" ? chunk : sseDecoder.decode(chunk, { stream: true });
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

  // Stream chunks are Uint8Array — String(chunk) would render comma-joined
  // byte values, so decode them as UTF-8 text.
  const sseDecoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of reader) {
    buffer += typeof chunk === "string" ? chunk : sseDecoder.decode(chunk, { stream: true });
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
  // 3369 stays clear of common dev/Docker ports (3000 = Open WebUI, etc.);
  // override with PORT in .env if needed.
  const BASE_PORT = Number(process.env.PORT) || 3369;

  // Parse JSON payloads (support larger payload size for multiple research reports)
  app.use(express.json({ limit: "15mb" }));

  // API Health Endpoint — env_keys reports which providers have server-side
  // .env keys (booleans only) so the Settings UI can enable fetching.
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      api_key_set: !!apiKey,
      env_keys: {
        gemini: !!envKeyFor("gemini"),
        openrouter: !!envKeyFor("openrouter"),
        openai: !!envKeyFor("openai"),
        anthropic: !!envKeyFor("anthropic"),
        venice: !!envKeyFor("venice"),
      },
    });
  });

  // Fetch Models Endpoint for testing connection and loading available models
  app.post("/api/settings/fetch-models", async (req, res) => {
    try {
      const { provider, baseUrl } = req.body;
      if (!provider) {
        return res.status(400).json({ error: "Provider is required." });
      }
      const provKey = req.body.apiKey || envKeyFor(provider);

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
          } else if (result.agents && typeof result.agents === "object") {
            // Some models return agents as an object map instead of an array
            agentsList = Object.values(result.agents);
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

      if (cleanAgents.length === 0) {
        console.error("Orchestrator returned no agent array. Raw result:", JSON.stringify(result).slice(0, 600));
        throw new Error("Orchestrator returned no agents — the model produced JSON without an agent list. Try a different orchestrator model or provider.");
      }

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
      const { topic, reports, settings, config, critiques } = req.body;
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

      let critiquesBlock = "";
      let critiqueDirective = "";
      if (Array.isArray(critiques) && critiques.length > 0) {
        const critiquesContext = critiques
          .filter((c: any) => c && c.critique)
          .map((c: any) => `### RED TEAM CRITIQUE OF ${c.agentName || "Specialist"} (${c.agentRole || "Investigator"})\n${c.critique}\n---\n`)
          .join("\n");
        if (critiquesContext) {
          critiquesBlock = `\n\nRED TEAM CRITIQUES:\nThe following adversarial cross-examinations were produced by VEX, Chief Adversarial Officer, who ruthlessly stress-tested each specialist report. Each critique flags weak evidence, blind spots, counter-evidence, and a confidence verdict (High/Medium/Low).\n\n${critiquesContext}`;
          critiqueDirective = `\n\n## 4.5 Red Team Findings & Rebuttals
- The swarm was subjected to an adversarial red-team review by VEX. Address EVERY material critique raised above.
- For each critique, either (a) rebut it with specific evidence drawn from the specialist reports, or (b) concede it and explicitly adjust the affected conclusions elsewhere in this synthesis.
- Do NOT ignore any LOW-confidence verdict: where a specialist report was rated Low reliability, state plainly how that constrains the overall confidence of this synthesis.`;
        }
      }

      const prompt = `OVERARCHING TOPIC: "${topic}"

You are the Lead Swarm Orchestrator. Your mission is to synthesize the following expert investigative reports into a single, comprehensive, publication-grade analytical document.

SPECIALIST REPORTS:
${reportsContext}${critiquesBlock}

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
- Identify gaps or areas requiring further future investigation.${critiqueDirective}

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

  // 3.5. Red Team Endpoint - VEX adversarially cross-examines a single specialist report via SSE
  app.post("/api/research/redteam-stream", async (req, res) => {
    try {
      const { topic, agent, report, settings } = req.body;
      if (!topic || !agent || !report) {
        return res.status(400).json({ error: "Topic, agent, and report are required for a red team review." });
      }

      console.log(`Red Team cross-examination: VEX vs ${agent.name} (${agent.role}) for topic: "${topic}"`);

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ type: "ping" })}\n\n`);

      const systemInstruction = "You are VEX, Chief Adversarial Officer — a ruthless, brilliant red-team analyst. You exist to stress-test intelligence, never to flatter it. You are sharp, specific, and unsparing, but intellectually honest: your objective is to make the final synthesis stronger by exposing every weakness in the specialist's work.";

      const prompt = `OVERARCHING TOPIC: "${topic}"

You are cross-examining a specialist report submitted by ${agent.name}, a ${agent.role}.
Their assigned investigative angle was: "${agent.investigativeAngle || "n/a"}".

SPECIALIST REPORT UNDER REVIEW:
${report}

Conduct a ruthless adversarial cross-examination of this report. Be sharp and specific — cite the report's OWN claims when you attack them. Do not hedge, do not flatter, do not merely summarize the report back. Structure your critique in Markdown with EXACTLY these four sections:

## 1. Weak Evidence & Overreach
Identify claims that are unsupported, speculative, or asserted with more confidence than the evidence warrants. Quote or paraphrase the specific claims you are challenging.

## 2. Blind Spots & Missing Angles
Identify what this report failed to consider — stakeholders, data, counter-scenarios, or second-order effects it ignored.

## 3. Counter-Evidence & Alternative Interpretations
Offer concrete counter-evidence or alternative readings of the same facts that would undercut the report's conclusions.

## 4. Confidence Verdict
State an overall reliability verdict of exactly HIGH, MEDIUM, or LOW, followed by a single-sentence justification. Use this exact format: "**Verdict: MEDIUM** — <one-line justification>".

Keep the whole cross-examination tight and high-signal: roughly 400-700 words. Write as VEX, in the first person, with an incisive prosecutorial tone.`;

      const pingInterval = setInterval(() => {
        res.write(`data: ${JSON.stringify({ type: "ping" })}\n\n`);
      }, 5000);

      try {
        await runUniversalStream(
          "agent",
          settings,
          prompt,
          systemInstruction,
          false,
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
      console.error("Error in /api/research/redteam-stream:", error);
      res.write(`data: ${JSON.stringify({ type: "error", error: error.message || "Red team review failed." })}\n\n`);
      res.end();
    }
  });

  // 4. Interrogation Room Endpoint - Chat with the completed swarm via SSE (grounded, no web search)
  app.post("/api/research/interrogate-stream", async (req, res) => {
    try {
      const { topic, question, respondent, agents, synthesizedReport, chatHistory, settings } = req.body;

      if (!question || typeof question !== "string" || !question.trim()) {
        return res.status(400).json({ error: "A non-empty question is required." });
      }
      if (!agents || !Array.isArray(agents) || agents.length === 0) {
        return res.status(400).json({ error: "A non-empty agents array is required." });
      }

      const isPanel = respondent === "panel";
      const targetAgent = isPanel ? null : agents.find((a: any) => a && a.id === respondent);

      console.log(`Interrogating swarm [${isPanel ? "PANEL" : (targetAgent ? targetAgent.name : respondent)}] for topic: "${topic}"`);

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ type: "ping" })}\n\n`);

      // Build the grounding intelligence dossier
      let intelligence = "";
      if (isPanel) {
        intelligence += `## CONSOLIDATED SYNTHESIS\n${synthesizedReport || "(no synthesis available)"}\n\n`;
        intelligence += agents
          .filter((a: any) => a && a.report)
          .map((a: any) => `## SPECIALIST REPORT — ${a.name} (${a.role})\nInvestigative angle: ${a.investigativeAngle || "n/a"}\n\n${a.report}`)
          .join("\n\n---\n\n");
      } else {
        intelligence += `## CONSOLIDATED SYNTHESIS (shared context)\n${(synthesizedReport || "(no synthesis available)").slice(0, 4000)}\n\n`;
        if (targetAgent) {
          intelligence += `## YOUR OWN FULL REPORT — ${targetAgent.name} (${targetAgent.role})\nInvestigative angle: ${targetAgent.investigativeAngle || "n/a"}\n\n${targetAgent.report || "(no report on file)"}`;
        }
      }

      const history = Array.isArray(chatHistory) ? chatHistory.slice(-8) : [];
      const historyBlock = history.length
        ? "\n\nPRIOR CONVERSATION:\n" + history.map((m: any) => `${m.role === "user" ? "USER" : (m.speaker || "SWARM")}: ${m.content}`).join("\n")
        : "";

      let systemInstruction: string;
      let prompt: string;
      let taskRole: "synthesis" | "agent";

      if (isPanel) {
        taskRole = "synthesis";
        systemInstruction = "You are the Swarm Intelligence panel — the collective voice of the specialist agents plus the lead orchestrator who synthesized their findings. You answer follow-up interrogations strictly from the intelligence already gathered, never from outside knowledge.";
        prompt = `TOPIC: "${topic}"

A user is interrogating the swarm with a follow-up question. Answer using ONLY the intelligence dossier below. Do not introduce outside facts and do not speculate beyond what the specialists reported.

INTELLIGENCE DOSSIER:
${intelligence}${historyBlock}

USER QUESTION: "${question}"

RESPONSE REQUIREMENTS:
- Answer strictly from the intelligence above. If it does not cover the question, say so plainly, state exactly what is missing, and name which specialist angle (by role) would need a follow-up investigation to close the gap.
- Attribute key points to the specialists who made them, by name, where relevant (e.g., "Dr. Vance's analysis indicates..."). Surface where the specialists agree and where they diverge.
- Keep the answer focused and high-signal: roughly 300-600 words in clean, standard Markdown.`;
      } else {
        taskRole = "agent";
        const name = targetAgent?.name || "Specialist";
        const role = targetAgent?.role || "Investigator";
        systemInstruction = `You are ${name}, an expert ${role} who investigated this topic as part of a research swarm. You are being interrogated directly about your findings. Stay fully in persona and answer only from the intelligence you gathered.`;
        prompt = `TOPIC: "${topic}"

A user is interrogating you directly about your investigation. Stay fully in persona: answer in the FIRST PERSON, in your own voice and expertise as a ${role}. Answer using ONLY the intelligence below — your own report is authoritative, and the synthesis is provided for shared context. Do not invent facts beyond what you reported.

YOUR INVESTIGATION & SHARED CONTEXT:
${intelligence}${historyBlock}

USER QUESTION: "${question}"

RESPONSE REQUIREMENTS:
- Respond in character as ${name}, first person, drawing on your expertise as a ${role}.
- Answer strictly from the intelligence above. If your investigation did not cover the question, say so directly and suggest which angle — yours or a colleague's — would need a follow-up investigation.
- Keep it focused and high-signal: roughly 300-600 words in clean, standard Markdown.`;
      }

      const pingInterval = setInterval(() => {
        res.write(`data: ${JSON.stringify({ type: "ping" })}\n\n`);
      }, 5000);

      try {
        await runUniversalStream(
          taskRole,
          settings,
          prompt,
          systemInstruction,
          false,
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
      console.error("Error in /api/research/interrogate-stream:", error);
      res.write(`data: ${JSON.stringify({ type: "error", error: error.message || "Interrogation failed." })}\n\n`);
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

  // The base port may already be taken by other local services (Docker
  // containers, Open WebUI, etc.) — walk upward to the first free port.
  // On Windows, Docker Desktop's port proxy doesn't hold ports exclusively,
  // so a second bind can "succeed" without EADDRINUSE. Binding alone is not
  // a reliable test: probe each candidate and skip any port that answers.
  const isPortServing = (port: number) =>
    new Promise<boolean>((resolve) => {
      const probe = net.connect({ port, host: "127.0.0.1" });
      const done = (taken: boolean) => {
        probe.destroy();
        resolve(taken);
      };
      probe.once("connect", () => done(true));
      probe.once("error", () => done(false));
      probe.setTimeout(400, () => done(false));
    });

  let freePort = BASE_PORT;
  while (await isPortServing(freePort)) {
    console.log(`Port ${freePort} is already in use — trying ${freePort + 1}`);
    freePort++;
    if (freePort > BASE_PORT + 20) {
      console.error(`No free port found in range ${BASE_PORT}-${BASE_PORT + 20}.`);
      process.exit(1);
    }
  }

  const listenOn = (port: number, attemptsLeft: number) => {
    const server = app.listen(port, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${port}`);
      for (const infos of Object.values(os.networkInterfaces())) {
        for (const info of infos || []) {
          if (info.family === "IPv4" && !info.internal) {
            console.log(`  LAN: http://${info.address}:${port}`);
          }
        }
      }
    });
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE" && attemptsLeft > 0) {
        console.log(`Port ${port} is in use — trying ${port + 1}`);
        listenOn(port + 1, attemptsLeft - 1);
      } else {
        throw err;
      }
    });
  };
  listenOn(freePort, 20);
}

startServer();
