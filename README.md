# Swarm Intel

**A local research swarm: assemble a team of specialist AI personas, run them in parallel, and synthesize their findings into one publication-grade report.**

![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat&logo=tailwindcss&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat&logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?style=flat&logo=express&logoColor=white)
![License](https://img.shields.io/badge/License-Apache--2.0-blue?style=flat)

> **Personal, local tool.** Swarm Intel runs as a single-user app on your own machine. It proxies your provider API keys through a local Express server and stores everything in browser `localStorage`. It is not hardened for multi-user or production deployment: no auth, no per-client rate limiting, no persistence layer beyond the browser.

---

## What is this?

You give Swarm Intel a research topic. An **orchestrator** model breaks it into 5 to 7 distinct investigative angles and designs a named specialist agent for each (e.g. *Dr. Aris Vance, Cryptographic Analyst*). You review and refine that team, then each agent runs a deep investigation and streams back a markdown report. Finally, a **synthesis** pass blends every report into a single consolidated document.

- 🧠 **Orchestrated swarm assembly** — one prompt becomes a complementary team of 5 to 7 specialist personas, each with a role, an investigative angle, and a theme color.
- ✋ **Human-in-the-loop approval** — before any research runs, nudge an individual agent with a plain-language critique to regenerate just that node, or rebuild the whole team.
- 📡 **Live streaming reports** — each agent's report streams token-by-token over Server-Sent Events (SSE) into its own tab.
- 🐢 **Sequential execution by design** — agents run one at a time to stay under provider rate limits, with automatic retry and backoff on 429/503.
- 🔀 **Multi-provider, per-role routing** — mix and match Gemini, OpenAI, Anthropic, OpenRouter, Venice, LM Studio, and Ollama, and assign a different provider/model to the orchestrator, the agents, and the synthesis step.
- 🔒 **Keys stay server-side** — the browser never sees a provider key; every call is proxied through the local Express server.
- 💾 **Everything persists locally** — history, the current session, activity logs, and settings all live in `localStorage`.

---

## 🏗️ Architecture

The browser SPA never talks to a provider directly. It calls the local Express server, which selects the right provider and model for each task role and forwards the request with your key attached.

```mermaid
flowchart LR
    subgraph Browser["Browser SPA — React 19 + Vite"]
        UI[Topic Input & Approval UI]
        Viewer[Report Viewer]
        Settings[Settings Modal]
        LS[(localStorage)]
    end

    subgraph Server["Express Proxy — tsx, port 3000"]
        Router{Per-role Model Router}
    end

    subgraph Providers["Provider APIs"]
        Gemini[Gemini]
        OpenAI[OpenAI]
        Anthropic[Anthropic]
        OpenRouter[OpenRouter]
        Venice[Venice]
        LMStudio[LM Studio]
        Ollama[Ollama]
    end

    UI <--> Router
    Viewer <--> Router
    Settings <--> Router
    UI -. persist .-> LS

    Router --> Gemini
    Router --> OpenAI
    Router --> Anthropic
    Router --> OpenRouter
    Router --> Venice
    Router --> LMStudio
    Router --> Ollama
```

### The research pipeline

```mermaid
sequenceDiagram
    actor User
    participant SPA as Browser SPA
    participant API as Express Proxy
    participant LLM as Provider APIs

    User->>SPA: Enter research topic
    SPA->>API: POST /api/research/initiate
    API->>LLM: Orchestrator assembles 5-7 agents
    LLM-->>API: Agent personas (JSON)
    API-->>SPA: Team returned for approval

    loop Approval / nudge
        User->>SPA: Nudge or regenerate an agent
        SPA->>API: POST /api/research/regenerate-agent
        API->>LLM: Redesign a single node
        LLM-->>API: Replacement agent
        API-->>SPA: Updated agent card
    end

    User->>SPA: Approve the swarm

    loop For each agent (sequential)
        SPA->>API: POST /api/research/agent-run-stream
        API->>LLM: Deep investigation (with web search)
        LLM-->>API: Streamed markdown
        API-->>SPA: SSE chunks
    end

    SPA->>API: POST /api/research/synthesize-stream
    API->>LLM: Blend all reports
    LLM-->>API: Streamed synthesis
    API-->>SPA: SSE chunks
    SPA->>User: Consolidated report in the viewer
```

---

## 📸 Screenshots

Screenshots are captured per release and stored under [`assets/screenshots/`](assets/screenshots/). This section is updated with images alongside tagged releases.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js 22+**
- A **Gemini API key** for the default configuration ([Google AI Studio](https://aistudio.google.com/apikey)). Other providers are optional and configured in the app's Settings modal.

### Install and run

```bash
# 1. Install dependencies
npm install

# 2. Configure your key
cp .env.example .env
#   then edit .env and set GEMINI_API_KEY

# 3. Start the dev server (Vite + Express, single process)
npm run dev
```

Open **http://localhost:3000** and enter a research topic.

> The server binds to `0.0.0.0:3000`, so it is reachable from other devices on your LAN. Keep that in mind since your provider keys are proxied through it.

### Scripts

| Script | Command | Purpose |
| --- | --- | --- |
| `npm run dev` | `tsx server.ts` | Run Express with Vite in middleware mode (hot reload) on port 3000. |
| `npm run build` | `vite build` + `esbuild` | Bundle the SPA and compile the server to `dist/server.cjs`. |
| `npm start` | `node dist/server.cjs` | Serve the production build (set `NODE_ENV=production`). |
| `npm run lint` | `tsc --noEmit` | Type-check the whole project. |
| `npm run clean` | `rm -rf dist server.js` | Remove build artifacts. |

---

## 🔌 Providers & Model Routing

Keys and base URLs are entered in the **Settings modal** (Providers tab). The server also exposes a "fetch models" call so the UI can test a connection and list the models each provider offers. The Gemini key can also come from the server's `.env`, which is why Gemini works out of the box.

| Provider | Auth | Default base URL | Notes |
| --- | --- | --- | --- |
| **Gemini** | API key (Settings or `GEMINI_API_KEY` in `.env`) | Google endpoint (built in) | Default provider. Agent runs use Google Search grounding. |
| **OpenAI** | API key (`Authorization: Bearer`) | `https://api.openai.com/v1` | Chat Completions API. |
| **Anthropic** | API key (`x-api-key`) | `https://api.anthropic.com/v1` | Messages API, `anthropic-version: 2023-06-01`. |
| **OpenRouter** | API key (`Authorization: Bearer`) | `https://openrouter.ai/api/v1` | OpenAI-compatible; aggregates many models. |
| **Venice** | API key (`Authorization: Bearer`) | `https://api.venice.ai/api/v1` | OpenAI-compatible. |
| **LM Studio** | none (local) | `http://localhost:1234/v1` | OpenAI-compatible local server. |
| **Ollama** | none (local) | `http://localhost:11434` | Local models via the OpenAI-compatible chat endpoint. |

### Routing roles

Each stage of the pipeline can be pointed at a different provider and model in the **Settings modal (Routing tab)**:

- **Orchestrator** — assembles the swarm and regenerates individual agents. Returns structured JSON, so a capable instruction-following model works best.
- **Agent** — runs each specialist's deep investigation. This is where most tokens are spent; on Gemini it uses web search grounding.
- **Synthesis** — merges all specialist reports into the final consolidated document.

A common setup is a fast, cheap model for the orchestrator and a stronger model for agents and synthesis. Everything falls back to Gemini (`gemini-3.5-flash`) if a role is left unconfigured.

---

## 🛰️ API Reference

All routes are served by `server.ts` on port 3000.

| Method | Path | Purpose | Response |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Liveness check; reports whether the server-side Gemini key is set. | JSON |
| `POST` | `/api/settings/fetch-models` | Test a provider connection and list its available models. | JSON |
| `POST` | `/api/research/initiate` | Orchestrator assembles 5 to 7 specialist agents for a topic. | JSON |
| `POST` | `/api/research/regenerate-agent` | Redesign a single agent, optionally guided by a user nudge. | JSON |
| `POST` | `/api/research/agent-run-stream` | Run one agent's deep investigation. | SSE |
| `POST` | `/api/research/synthesize-stream` | Blend all specialist reports into the final report. | SSE |
| `POST` | `/api/research/interrogate-stream` | Answer a follow-up question grounded in the session's reports, as the full panel or a single specialist in persona. | SSE |

The two streaming endpoints emit `data:` events with a `type` field of `ping`, `chunk`, `done`, or `error`. A 5-second `ping` keeps the connection alive during long generations.

---

## 📁 Project Structure

```
swarm-intel/
├── server.ts               # Express proxy: routing, retries, SSE streaming, all /api routes
├── src/
│   ├── App.tsx             # Single-page app: pipeline flow, approval UI, settings, viewer
│   ├── main.tsx            # React entry point
│   ├── types.ts            # Agent / ResearchSession / status types
│   ├── index.css           # Tailwind entry + styles
│   └── components/
│       ├── PixelAvatar.tsx # Generative agent avatars
│       └── SwarmNetwork.tsx # Mission Control network visualization
├── assets/
│   └── screenshots/        # Release screenshots
├── .env.example            # GEMINI_API_KEY, APP_URL
├── metadata.json           # App name and capability metadata
├── package.json
└── vite.config.ts
```

### Persistence

The app keeps state in the browser under these `localStorage` keys:

| Key | Contents |
| --- | --- |
| `research_swarm_settings` | Provider keys, base URLs, and per-role model routing. |
| `research_swarm_history` | Past research sessions. |
| `research_swarm_current_session` | The in-progress or last-viewed session. |
| `research_swarm_current_logs` | Activity log for the current session. |

---

## 🧰 Tech Stack

- **Frontend:** React 19, Vite 6, Tailwind CSS 4, `react-markdown`, `motion`, `lucide-react`
- **Server:** Express 4 run through `tsx`, `@google/genai` for the Gemini SDK, native `fetch` for every other provider
- **Language & tooling:** TypeScript 5.8, `esbuild` for the production server bundle

---

## 📓 Feature Log

| Version | Feature |
| --- | --- |
| v2.6.0 | Mission Control — live animated swarm network visualization (orchestrator hub, agent nodes, packet flows, live progress rings; Grid/Network toggle) |
| v2.7.0 | Swarm Config — mission parameters (swarm size 3–9, Recon/Standard/Deep depth modes honored by all three pipeline stages), custom specialist recruitment with live avatar preview, and node dismissal at approval |
| v2.8.0 | Interrogation Room — chat with the completed swarm: follow-up questions answered strictly from the reports, streamed live, with respondent selection (Full Panel synthesis voice or any specialist in persona); chats persist with the session |

---

## 📄 License

Released under the Apache-2.0 License.
