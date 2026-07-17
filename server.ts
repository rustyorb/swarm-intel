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

// Parses the FIRST balanced JSON object/array starting at the first opening
// char — rescues responses where the model emits valid JSON followed by
// trailing prose or a second JSON blob.
function parseFirstBalanced(text: string, openChar: "{" | "[", closeChar: "}" | "]"): any | null {
  const start = text.indexOf(openChar);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch (e) {
          return null;
        }
      }
    }
  }
  return null;
}

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
        const balanced = parseFirstBalanced(cleanText, "{", "}") ?? parseFirstBalanced(cleanText, "[", "]");
        if (balanced !== null) return balanced;
        throw new Error(`Candidate JSON located but parsing failed: ${innerError.message}. Content: ${JSONStr.slice(0, 600)}`);
      }
    }
    throw new Error(`Failed to locate any valid JSON array or block in model response: ${text.slice(0, 600)}`);
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

// -------------------------------------------------------------
// Live Web Grounding
// -------------------------------------------------------------
// Gemini, Anthropic, OpenRouter, and Venice can run real web search natively,
// so hasSearch is wired into their request bodies. Every other provider
// (LM Studio, Ollama, plain OpenAI chat) has no live internet access — for
// those the server runs SearXNG queries itself and injects the results into
// the prompt, otherwise the model silently answers from stale training data
// while claiming to have "searched".

const SEARXNG_BASE_URL = (process.env.SEARXNG_BASE_URL || "http://localhost:8888").replace(/\/$/, "");

const NATIVE_SEARCH_PROVIDERS = new Set(["gemini", "anthropic", "openrouter", "venice"]);

interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

async function searxngSearch(query: string, maxResults = 8): Promise<SearchHit[]> {
  const url = `${SEARXNG_BASE_URL}/search?q=${encodeURIComponent(query)}&format=json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`SearXNG responded with status ${response.status}`);
    const data = await response.json() as any;
    return (data.results || []).slice(0, maxResults).map((r: any) => ({
      title: r.title || "(untitled)",
      url: r.url || "",
      snippet: (r.content || "").slice(0, 500),
    }));
  } finally {
    clearTimeout(timer);
  }
}

// Runs all queries in parallel, dedupes by URL, and formats a grounding block
// for prompt injection. Returns hitCount 0 when SearXNG is unreachable or dry.
async function gatherLiveContext(queries: string[]): Promise<{ block: string; hitCount: number }> {
  const seen = new Set<string>();
  const hits: SearchHit[] = [];
  const settled = await Promise.allSettled(queries.map((q) => searxngSearch(q)));
  for (const result of settled) {
    if (result.status !== "fulfilled") {
      console.warn(`[Grounding] SearXNG query failed: ${result.reason?.message || result.reason}`);
      continue;
    }
    for (const hit of result.value) {
      if (!hit.url || seen.has(hit.url)) continue;
      seen.add(hit.url);
      hits.push(hit);
    }
  }
  if (hits.length === 0) return { block: "", hitCount: 0 };

  const today = new Date().toISOString().slice(0, 10);
  const lines = hits.slice(0, 16).map(
    (h, i) => `[${i + 1}] ${h.title}\n    URL: ${h.url}\n    ${h.snippet}`
  );
  const block = `LIVE WEB SEARCH RESULTS (retrieved ${today} via live search — current, real-world data):\n${lines.join("\n")}`;
  return { block, hitCount: hits.length };
}

export interface GroundingInfo {
  mode: "native" | "injected" | "none";
  detail: string;
}

// -------------------------------------------------------------
// Follow-Up Runs
// -------------------------------------------------------------
// A follow-up session carries condensed context from its parent run so the
// orchestrator targets the gaps and agents build on established findings
// instead of re-deriving them.

function formatPriorContextBlock(priorContext: any): string {
  if (!priorContext || typeof priorContext !== "object") return "";
  const synthesis = String(priorContext.synthesis || "").slice(0, 12000);
  const chatExcerpt = String(priorContext.chatExcerpt || "").slice(0, 4000);
  const directive = String(priorContext.directive || "").trim();
  const parentTopic = String(priorContext.parentTopic || "").trim();
  if (!synthesis && !directive) return "";

  return `PRIOR INVESTIGATION CONTEXT (this is a FOLLOW-UP run — an earlier swarm already researched the topic below):
ORIGINAL TOPIC: "${parentTopic}"

PRIOR SYNTHESIZED FINDINGS (condensed — treat as established ground):
${synthesis || "(no synthesis on file)"}
${chatExcerpt ? `\nINTERROGATION EXCHANGES THAT MOTIVATED THIS FOLLOW-UP:\n${chatExcerpt}\n` : ""}
FOLLOW-UP DIRECTIVE FROM THE USER: "${directive}"`;
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

    const requestBody: any = {
      model,
      messages: [{ role: "user", content: fullPrompt }],
    };
    // LM Studio rejects response_format "json_object" (it only accepts
    // "json_schema"), and Ollama ignores it — the schema travels in the
    // prompt for those; hosted providers still get the strict-JSON hint.
    if (provider !== "lmstudio" && provider !== "ollama") {
      requestBody.response_format = { type: "json_object" };
    }
    const result = await callOpenAICompatible(targetUrl, apiKey, requestBody);
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
  onChunk: (text: string) => void,
  searchQueries?: string[],
  onGrounding?: (info: GroundingInfo) => void
): Promise<void> {
  const { provider, model, apiKey, baseUrl } = getModelAndKey(taskRole, settings);

  // Providers without native search get live SearXNG results injected into
  // the prompt; if that fails the model is told to caveat staleness instead
  // of silently roleplaying a web search it never ran.
  if (hasSearch && !NATIVE_SEARCH_PROVIDERS.has(provider)) {
    try {
      const queries = searchQueries && searchQueries.length > 0 ? searchQueries : [prompt.slice(0, 200)];
      const { block, hitCount } = await gatherLiveContext(queries);
      if (hitCount > 0) {
        prompt = `${block}\n\n---\n\n${prompt}\n\nGROUNDING RULES (mandatory): You have NO live internet access of your own — the LIVE WEB SEARCH RESULTS above are your only source of current information. Ground every time-sensitive claim in them and cite the numbered sources inline with their URLs. Where the live results do not cover a point, state that explicitly instead of presenting memorized training data as current.`;
        onGrounding?.({ mode: "injected", detail: `${hitCount} live search results injected (${provider} has no native web search)` });
      } else {
        prompt = `${prompt}\n\nWARNING: No live web data could be retrieved for this run. You must explicitly flag that your findings come from model training data and may be outdated, and date-stamp any claim that could have changed.`;
        onGrounding?.({ mode: "none", detail: `Live search unavailable (SearXNG at ${SEARXNG_BASE_URL} returned no results) — falling back to model knowledge` });
      }
    } catch (err: any) {
      console.warn(`[Grounding] Live context gathering failed: ${err.message}`);
      prompt = `${prompt}\n\nWARNING: No live web data could be retrieved for this run. You must explicitly flag that your findings come from model training data and may be outdated, and date-stamp any claim that could have changed.`;
      onGrounding?.({ mode: "none", detail: `Live search failed (${err.message}) — falling back to model knowledge` });
    }
  }

  if (provider === "gemini") {
    if (hasSearch) onGrounding?.({ mode: "native", detail: "Gemini Google Search grounding active" });
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
    if (hasSearch) onGrounding?.({ mode: "native", detail: "Anthropic web_search server tool active" });
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
        max_tokens: hasSearch ? 8000 : 4000,
        ...(hasSearch ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 8 }] } : {}),
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

  // OpenRouter and Venice run web search server-side when asked; the results
  // are woven into the completion by the provider itself.
  let searchExtras: Record<string, any> = {};
  if (hasSearch && provider === "openrouter") {
    searchExtras = { plugins: [{ id: "web" }] };
    onGrounding?.({ mode: "native", detail: "OpenRouter web plugin active" });
  } else if (hasSearch && provider === "venice") {
    searchExtras = { venice_parameters: { enable_web_search: "on", enable_web_citations: true } };
    onGrounding?.({ mode: "native", detail: "Venice web search active" });
  }

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
      ...searchExtras,
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
          // models.list() returns a Pager, which is only ASYNC-iterable — a
          // plain for..of throws and used to silently trigger the fallback.
          const pager = await client.models.list({ config: { pageSize: 100 } });
          for await (const m of pager as any) {
            if (m.name) {
              models.push(m.name.replace("models/", ""));
            }
          }
          models = models.filter((name: string) => name.includes("gemini") || name.includes("learnlm"));
        } catch (err: any) {
          console.warn(`[Models] Gemini model listing failed (${err?.message || err}) — serving fallback list.`);
          models = ["gemini-3.5-flash", "gemini-3.1-pro-preview", "gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-2.5-pro"];
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
        const response = await fetch("https://api.anthropic.com/v1/models?limit=100", {
          headers: { "x-api-key": provKey, "anthropic-version": "2023-06-01" }
        });
        if (!response.ok) {
          throw new Error(`Anthropic API responded with status ${response.status}`);
        }
        const data = await response.json() as any;
        models = data.data.map((m: any) => m.id);
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
      const { topic, settings, config, priorContext } = req.body;
      if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
        return res.status(400).json({ error: "A valid research topic is required." });
      }
      const priorBlock = formatPriorContextBlock(priorContext);

      // "auto" (or anything non-numeric) lets the orchestrator size the swarm
      // from its analysis of the research need; a number pins the count.
      const rawCount = config ? config.agentCount : "auto";
      const pinnedCount = typeof rawCount === "number" ? Math.max(3, Math.min(9, Math.round(rawCount))) : null;
      const depth = config && config.depth ? config.depth : "standard";

      let depthHint = "";
      if (depth === "recon") {
        depthHint = "\nDEPTH MODE — RECON: Keep each agent's assignment tightly scoped and narrowly focused for rapid tactical coverage. Avoid sprawling, open-ended mandates.";
      } else if (depth === "deep") {
        depthHint = "\nDEPTH MODE — DEEP: Make each agent's assignment maximally ambitious and far-reaching, probing edge cases, second-order effects, and deep technical frontiers.";
      }

      console.log(`Assembling ${priorBlock ? "FOLLOW-UP " : ""}research swarm for topic: "${topic}" (${pinnedCount ?? "auto"} agents, ${depth} depth)`);

      const today = new Date().toDateString();
      const followUpFraming = priorBlock
        ? `\n\n${priorBlock}\n\nFOLLOW-UP RULES: The prior findings above are ESTABLISHED GROUND. Diagnose the follow-up need itself — the gaps, open questions, and weak spots the directive targets. Sprout agents aimed squarely at what is missing or unresolved; do NOT field agents to re-cover ground the prior run already settled (unless the directive is to verify or challenge it).`
        : "";
      const prompt = `Today's date is ${today}.

RESEARCH REQUEST: "${topic}"${followUpFraming}

Work in two phases.

PHASE 1 — ANALYZE THE RESEARCH NEED (this drives everything else):
Before thinking about any team, diagnose what this request actually requires:
- What kind of question is it (technical evaluation, market scan, product comparison, historical inquiry, scientific review, investigation of a person/organization/event, local or situational lookup, how-to, etc.)?
- What must a genuinely useful answer contain, and what evidence would settle it?
- Which domains of expertise are truly required — and, just as important, which classic research angles are IRRELEVANT to this particular need?
Write this diagnosis up as a concise mission analysis of 60-140 words (the "needAnalysis" field).

PHASE 2 — SPROUT THE TEAM FROM THE ANALYSIS:
Design ${pinnedCount ? `exactly ${pinnedCount}` : "between 3 and 9 (your call — exactly as many as the need demands, no padding)"} specialist research agents, each derived directly from a requirement identified in Phase 1.
- Every agent must map to a concrete requirement of THIS request. Do NOT apply a stock template of perspectives (technical / socioeconomic / historical / ethical / futuristic) unless your analysis shows that angle is genuinely needed here.
- If the need is narrow, prefer a small team of tightly targeted agents over generic filler roles.
- Give each agent a unique creative persona name, a specialty title a real expert in this exact problem space would hold, a specific investigative assignment stating what they must find out and which kinds of sources or evidence to chase, and a theme color.${depthHint}`;

      const systemInstruction = "You are an elite Research Swarm Orchestrator. You first diagnose what a research request truly needs, then assemble a bespoke team of specialist digital persona agents shaped entirely by that diagnosis — never by a fixed template of roles.";

      const responseSchema = {
        type: Type.OBJECT,
        description: "An object containing the mission analysis and the list of specialized research agents derived from it.",
        properties: {
          needAnalysis: {
            type: Type.STRING,
            description: "Concise diagnosis (60-140 words) of what this research need actually requires and which expertise it demands."
          },
          agents: {
            type: Type.ARRAY,
            description: "List of specialized research agents assembled for the topic.",
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING, description: "A unique short alphanumeric ID for the agent, e.g. agent-1" },
                name: { type: Type.STRING, description: "A unique, creative persona name for the specialist agent" },
                role: { type: Type.STRING, description: "A specialty title a real expert in this exact problem space would hold" },
                investigativeAngle: { type: Type.STRING, description: "A specific investigative assignment stating what this agent must find out and which sources/evidence to chase" },
                colorTheme: { type: Type.STRING, description: "A color name matching their role (choose one of: cyan, emerald, rose, amber, purple, indigo, blue, fuchsia)" },
              },
              required: ["id", "name", "role", "investigativeAngle", "colorTheme"],
            },
          }
        },
        required: ["needAnalysis", "agents"]
      };

      // Some models wrap each agent one level deep ({"agent-1": {...}}) —
      // unwrap before validating.
      const normalizeAgentItem = (a: any): any => {
        if (!a || typeof a !== "object") return a;
        if (!a.name && !a.role && !a.investigativeAngle) {
          const vals = Object.values(a);
          if (vals.length === 1 && vals[0] && typeof vals[0] === "object") return vals[0];
        }
        return a;
      };
      const isUsableAgent = (a: any): boolean =>
        !!a && typeof a === "object" &&
        typeof a.investigativeAngle === "string" && a.investigativeAngle.trim().length > 0 &&
        ((typeof a.name === "string" && a.name.trim().length > 0) || (typeof a.role === "string" && a.role.trim().length > 0));

      // Some models echo the schema back with the real data nested inside
      // (e.g. {properties: {agents: {items: [...]}}}) — breadth-first scan for
      // the first array that actually contains usable agents.
      const findAgentArrayDeep = (root: any): any[] => {
        const queue: any[] = [root];
        let guard = 0;
        while (queue.length > 0 && guard++ < 300) {
          const node = queue.shift();
          if (!node || typeof node !== "object") continue;
          if (Array.isArray(node)) {
            const normalized = node.map(normalizeAgentItem).filter(isUsableAgent);
            if (normalized.length >= 2) return normalized;
            for (const v of node) queue.push(v);
          } else {
            for (const v of Object.values(node)) queue.push(v);
          }
        }
        return [];
      };

      const findNeedAnalysisDeep = (root: any): string => {
        const queue: any[] = [root];
        let guard = 0;
        while (queue.length > 0 && guard++ < 300) {
          const node = queue.shift();
          if (!node || typeof node !== "object" || Array.isArray(node)) {
            if (Array.isArray(node)) for (const v of node) queue.push(v);
            continue;
          }
          const val = node.needAnalysis;
          if (typeof val === "string" && val.trim()) return val.trim();
          if (val && typeof val === "object" && typeof val.value === "string" && val.value.trim()) return val.value.trim();
          for (const v of Object.values(node)) if (v && typeof v === "object") queue.push(v);
        }
        return "";
      };

      // Silently shipping placeholder "Specialist N" agents when a model goes
      // off-schema defeats the whole need-driven design — validate and retry
      // once with a corrective instruction instead.
      let agentsList: any[] = [];
      let needAnalysis = "";
      let lastError: any = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        const attemptPrompt = attempt === 1
          ? prompt
          : `${prompt}\n\nIMPORTANT: Your previous response did not match the required JSON schema. Return ONLY a single raw JSON object — no schema echo, no markdown, nothing after the closing brace — with a "needAnalysis" string and an "agents" array of FLAT objects, each having exactly these string keys: id, name, role, investigativeAngle, colorTheme.`;

        let result: any = null;
        try {
          result = await generateUnifiedJSON("orchestrator", settings, attemptPrompt, systemInstruction, responseSchema);
        } catch (err: any) {
          lastError = err;
          console.warn(`[Initiate] Attempt ${attempt}: orchestrator response unparseable — ${err.message}`);
          continue;
        }

        let list: any[] = [];
        if (result) {
          if (Array.isArray(result)) {
            list = result;
          } else if (Array.isArray(result.agents)) {
            list = result.agents;
          } else if (typeof result === "object") {
            // Robust fallback: find any array property in the returned object
            const foundArray = Object.values(result).find(val => Array.isArray(val));
            if (foundArray) {
              list = foundArray as any[];
            } else if (result.agents && typeof result.agents === "object") {
              // Some models return agents as an object map instead of an array
              list = Object.values(result.agents);
            }
          }
        }

        list = list.map(normalizeAgentItem).filter(isUsableAgent);
        // Schema-echo and other nesting mishaps: hunt for the agents wherever
        // the model buried them before burning a retry.
        if (list.length < 2 && result && typeof result === "object") {
          list = findAgentArrayDeep(result);
        }

        if (list.length >= 2) {
          agentsList = list;
          needAnalysis = result && typeof result.needAnalysis === "string"
            ? result.needAnalysis.trim()
            : findNeedAnalysisDeep(result);
          break;
        }
        console.warn(`[Initiate] Attempt ${attempt}: orchestrator output unusable (${list.length} valid agents). Raw: ${JSON.stringify(result).slice(0, 800)}`);
      }

      if (agentsList.length === 0) {
        throw new Error(`Orchestrator failed to produce a valid agent roster after a retry — the model returned output that does not match the required structure${lastError ? ` (${lastError.message?.slice(0, 200)})` : ""}. Try a different orchestrator model or provider.`);
      }

      // Safeguard IDs and structure
      const cleanAgents = agentsList.slice(0, 9).map((a: any, idx: number) => ({
        id: a.id || `agent-${idx + 1}`,
        name: a.name || `Specialist ${idx + 1}`,
        role: a.role || "Swarm Investigator",
        investigativeAngle: a.investigativeAngle,
        colorTheme: a.colorTheme || "cyan"
      }));

      res.json({ agents: cleanAgents, needAnalysis });
    } catch (error: any) {
      console.error("Error in /api/research/initiate:", error);
      res.status(500).json({ error: error.message || "Failed to assemble research agents." });
    }
  });

  // 1.5. Regenerate Single Agent Endpoint with Nudge
  app.post("/api/research/regenerate-agent", async (req, res) => {
    try {
      const { topic, agents, agentIdToRegenerate, nudge, settings, needAnalysis } = req.body;
      if (!topic || !agents || !agentIdToRegenerate) {
        return res.status(400).json({ error: "Topic, agents list, and agentIdToRegenerate are required." });
      }

      console.log(`Regenerating agent ${agentIdToRegenerate} for topic: "${topic}" with nudge: "${nudge || "none"}"`);

      const otherAgents = agents.filter((a: any) => a.id !== agentIdToRegenerate);
      const otherAgentsContext = otherAgents
        .map((a: any) => `- ${a.name} (${a.role}): ${a.investigativeAngle}`)
        .join("\n");

      const prompt = `Topic: "${topic}"
${needAnalysis ? `Mission analysis of the research need (the replacement must serve a real requirement identified here, not a generic template role):\n${needAnalysis}\n` : ""}Existing research team:
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
      const { topic, agent, settings, config, priorContext } = req.body;
      if (!topic || !agent) {
        return res.status(400).json({ error: "Topic and agent configuration are required." });
      }

      const depth = config && config.depth ? config.depth : "standard";
      const priorBlock = formatPriorContextBlock(priorContext);

      console.log(`Running streaming agent investigation: ${agent.name} (${agent.role}) for topic: "${topic}" [${depth}]`);

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ type: "ping" })}\n\n`);

      // Anti-stale-data guardrails: every agent knows today's date, must
      // prefer live web findings over memory, and must cite sources.
      const today = new Date().toDateString();
      const datePreamble = `Today's date is ${today}. Your training data predates this — treat live web information as authoritative over memorized knowledge, and date-stamp any claim that could have changed since your training.`;
      const citationRules = `SOURCE RULES: Ground your findings in live web sources retrieved during this investigation and cite them inline (source name + URL). If a point cannot be verified against live sources, explicitly mark it as unverified model knowledge.`;

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

      if (priorBlock) {
        prompt = `${prompt}\n\n${priorBlock}\n\nFOLLOW-UP RULES: The prior findings above are established context — do NOT re-derive or restate them at length. Your job is to EXTEND: chase your specific assignment, verify or challenge prior claims where your assignment demands it, and flag clearly anything you find that contradicts the prior report.`;
      }
      prompt = `${datePreamble}\n\n${prompt}\n\n${citationRules}`;

      // Queries for the injected-grounding fallback (providers without native
      // web search); native-search providers run their own queries instead.
      const currentYear = new Date().getFullYear();
      const searchQueries = [
        String(topic).slice(0, 220),
        String(agent.investigativeAngle || "").slice(0, 220),
        `${String(topic).slice(0, 160)} latest ${currentYear}`,
      ].filter((q) => q.trim().length > 0);

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
          },
          searchQueries,
          (info) => {
            console.log(`[Grounding] ${agent.name}: ${info.mode} — ${info.detail}`);
            res.write(`data: ${JSON.stringify({ type: "grounding", mode: info.mode, detail: info.detail })}\n\n`);
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
      const { topic, reports, settings, config, critiques, priorContext } = req.body;
      if (!topic || !reports || !Array.isArray(reports)) {
        return res.status(400).json({ error: "Topic and reports array are required." });
      }
      const priorBlock = formatPriorContextBlock(priorContext);

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

      const followUpContextBlock = priorBlock
        ? `\n\n${priorBlock}\n\nThis synthesis concludes a FOLLOW-UP investigation commissioned against the prior findings above.`
        : "";
      const followUpSectionDirective = priorBlock
        ? `\n\n## 4.7 Follow-Up Integration
- This was a follow-up run. State explicitly what the new investigation ADDS to, CONFIRMS in, or OVERTURNS from the prior report.
- Address the user's follow-up directive point by point: what is now answered, and what remains open.
- Where new findings contradict the prior report, say so plainly and state which conclusion should now be trusted and why.`
        : "";

      const prompt = `OVERARCHING TOPIC: "${topic}"

You are the Lead Swarm Orchestrator. Your mission is to synthesize the following expert investigative reports into a single, comprehensive, publication-grade analytical document.

SPECIALIST REPORTS:
${reportsContext}${critiquesBlock}${followUpContextBlock}

REQUIRED OUTPUT STRUCTURE:
# ${topic}: Swarm Intelligence Synthesis

## 1. Executive Summary
- High-level distillation of core discoveries.
- The "Bottom Line Up Front" (BLUF).

## 2. Investigative Tracks & Methodology
- Overview of the parallel expertise utilized in this swarm.
- How the different specialist angles fielded for this particular mission interconnected.

## 3. Synthesized Expert Insights
- Deep-dive analysis categorized by theme.
- Do NOT just list reports. BLEND the insights together to form a coherent narrative.
- Use sub-headers for major thematic pillars.

## 4. Conflict, Consensus & Uncertainty
- Where did specialists agree?
- Where were there disagreements or trade-offs?
- Identify gaps or areas requiring further future investigation.${critiqueDirective}${followUpSectionDirective}

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
