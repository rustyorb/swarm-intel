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

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Parse JSON payloads (support larger payload size for multiple research reports)
  app.use(express.json({ limit: "15mb" }));

  // API Health Endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", api_key_set: !!apiKey });
  });

  // 1. Swarm Assembly Endpoint - Breaks a topic down into 5-7 parallel agents
  app.post("/api/research/initiate", async (req, res) => {
    try {
      const { topic } = req.body;
      if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
        return res.status(400).json({ error: "A valid research topic is required." });
      }

      console.log(`Assembling research swarm for topic: "${topic}"`);

      const prompt = `Analyze the user's research topic: "${topic}".
Break this topic down into 5 to 7 distinct, parallel specialist research perspectives.
For each perspective, design an elite research agent with a unique creative name (e.g. Dr. Aris Vance, Agent Cipher, Investigator Kaelen), a highly specialized role/title (e.g. Cryptographic Analyst, Geopolitical Strategist), a detailed investigative instruction/angle, and a visual theme color.
Ensure the angles cover the full breadth of the topic from different aspects (e.g. technical engineering, socioeconomic impact, historical context, ethical concerns, futuristic outlook, structural analysis, etc.).`;

      const response = await generateWithRetry({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are an elite Research Swarm Orchestrator. Your task is to break down research requests into cohesive, complementary parallel investigative tracks run by specialized, interesting digital persona agents.",
          responseMimeType: "application/json",
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
          ],
          responseSchema: {
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
          },
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error("No response received from the orchestrator model.");
      }

      let cleanText = text.replace(/```json/gi, "").replace(/```/g, "").trim();
      let agents;
      try {
        agents = JSON.parse(cleanText);
      } catch (parseError: any) {
        console.error("Failed to parse JSON response:", text);
        throw new Error("Failed to parse the orchestrator model response: " + parseError.message);
      }
      res.json({ agents });
    } catch (error: any) {
      console.error("Error in /api/research/initiate:", error);
      res.status(500).json({ error: error.message || "Failed to assemble research agents." });
    }
  });

  // 1.5. Regenerate Single Agent Endpoint with Nudge
  app.post("/api/research/regenerate-agent", async (req, res) => {
    try {
      const { topic, agents, agentIdToRegenerate, nudge } = req.body;
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

      const response = await generateWithRetry({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are an elite Research Swarm Orchestrator. Your task is to design a high-fidelity specialized agent to replace an existing node in a research team, strictly adhering to the user's focus nudge.",
          responseMimeType: "application/json",
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
          ],
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING, description: "Must be the exact ID of the agent being replaced: " + agentIdToRegenerate },
              name: { type: Type.STRING, description: "A unique, creative name for the replacement specialist agent" },
              role: { type: Type.STRING, description: "A detailed role or specialty title for the replacement agent" },
              investigativeAngle: { type: Type.STRING, description: "A specific investigative query/angle addressing the nudge and topic" },
              colorTheme: { type: Type.STRING, description: "A color name (choose one of: cyan, emerald, rose, amber, purple, indigo, blue, fuchsia)" },
            },
            required: ["id", "name", "role", "investigativeAngle", "colorTheme"],
          },
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error("No response received from the orchestrator model.");
      }

      let cleanText = text.replace(/```json/gi, "").replace(/```/g, "").trim();
      let replacementAgent = JSON.parse(cleanText);
      
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
      const { topic, agent } = req.body;
      if (!topic || !agent) {
        return res.status(400).json({ error: "Topic and agent configuration are required." });
      }

      console.log(`Running streaming agent investigation: ${agent.name} (${agent.role}) for topic: "${topic}"`);

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ type: "ping" })}\n\n`);

      const prompt = `You are ${agent.name}, a specialized research agent working as a ${agent.role}.
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

      const pingInterval = setInterval(() => {
        res.write(`data: ${JSON.stringify({ type: "ping" })}\n\n`);
      }, 5000);

      try {
        // We use generateStreamWithRetry to handle rate limits
        const responseStream = await generateStreamWithRetry({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            systemInstruction: `You are ${agent.name}, an expert ${agent.role}. Respond with absolute rigor and intellectual depth, matching your specialized role.`,
            tools: [{ googleSearch: {} }],
            safetySettings: [
              { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
              { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
              { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
              { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ]
          },
        });

        clearInterval(pingInterval);

        for await (const chunk of responseStream) {
          if (chunk.text) {
            res.write(`data: ${JSON.stringify({ type: "chunk", text: chunk.text })}\n\n`);
          }
        }
        
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
      const { topic, reports } = req.body;
      if (!topic || !reports || !Array.isArray(reports)) {
        return res.status(400).json({ error: "Topic and reports array are required." });
      }

      console.log(`Synthesizing ${reports.length} reports for topic: "${topic}" via SSE`);

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
- Markdown: Use clean, standard Markdown.`;

      const pingInterval = setInterval(() => {
        res.write(`data: ${JSON.stringify({ type: "ping" })}\n\n`);
      }, 5000);

      try {
        const responseStream = await generateStreamWithRetry({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            systemInstruction: "You are the Lead Swarm Orchestrator. You specialize in synthesizing multiple distinct, expert perspectives into highly detailed, comprehensive, publication-grade analytical reports. Ensure maximal detail and deep thinking.",
            tools: [{ googleSearch: {} }],
            safetySettings: [
              { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
              { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
              { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
              { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ]
          },
        });

        clearInterval(pingInterval);

        let synthesizedReport = "";
        for await (const chunk of responseStream) {
          if (chunk.text) {
            synthesizedReport += chunk.text;
            res.write(`data: ${JSON.stringify({ type: "chunk", text: chunk.text })}\n\n`);
          }
        }
        
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
