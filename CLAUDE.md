# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — runs `tsx server.ts`: one process serving both the Express API and the Vite dev middleware (HMR). No separate frontend server.
- `npm run lint` — `tsc --noEmit`. This is the only check; there is no ESLint/Prettier and no test framework.
- `npm run build` — `vite build` for the SPA, then esbuild bundles the server to `dist/server.cjs`. `npm start` serves that bundle (set `NODE_ENV=production`).
- Smoke test: `node test.js` POSTs `/api/research/initiate` against a running dev server on port 3000 — note the server now defaults to **3369**, so adjust the port or set `PORT`. It spends a real orchestrator API call.
- Port: defaults to `3369` (not 3000 as the README says), probes upward up to +20 if busy, binds `0.0.0.0`. Override with `PORT` in `.env`.

## Architecture

Single-user local research app: browser SPA → local Express proxy → LLM provider APIs. The browser never holds provider keys; every call goes through `server.ts`.

**`server.ts` (~1,500 lines) is the entire backend.** Key internals, top to bottom:

- `getModelAndKey(taskRole, settings)` — per-role routing. The three pipeline roles (`orchestrator`, `agent`, `synthesis`) can each target a different provider/model, sent by the client per-request from its Settings state. Key precedence: browser-Settings key wins, `.env` var (via `envKeyFor`) is the fallback. Unconfigured roles fall back to Gemini.
- Provider adapters: Gemini uses the `@google/genai` SDK (`generateWithRetry` / `generateStreamWithRetry`, 4 retries, 15s base backoff on 429/503); OpenAI, OpenRouter, Venice, LM Studio, Ollama share `callOpenAICompatible`; Anthropic has `callAnthropic`.
- Web grounding is two-mode: providers in `NATIVE_SEARCH_PROVIDERS` (gemini, anthropic, openrouter, venice) use their built-in search; all others get SearXNG results fetched server-side (`searxngSearch` / `gatherLiveContext`, needs `SEARXNG_BASE_URL`) injected into the prompt.
- `generateUnifiedJSON` — provider-agnostic structured-output path for the orchestrator. LLM JSON is parsed leniently via `extractJSON`/`parseFirstBalanced`; on schema mismatch it retries once with a corrective prompt appended.
- `runUniversalStream` — provider-agnostic SSE streaming used by all four `*-stream` endpoints. SSE events are `data:` JSON with `type: ping|chunk|done|error`; a 5s ping keeps connections alive.

**`src/App.tsx` (~3,400 lines) is the entire frontend state machine** — pipeline phases (topic → team approval/nudge → sequential agent runs → optional Red Team → synthesis), settings, viewer, and export live here. Agents run sequentially by design (rate limits). Extracted components: `SwarmNetwork` (Mission Control viz), `KnowledgeLibrary`, `InterrogationRoom`, `ReaderMode`, `PixelAvatar`, and `lib/dossier.tsx` (HTML export). Shared types are in `src/types.ts`.

**Persistence is localStorage only** (`research_swarm_settings`, `research_swarm_history`, `research_swarm_current_session`, `research_swarm_current_logs`). No database; history caps at 50 sessions with favorite-preserving eviction.

## Conventions & gotchas

- `@` import alias resolves to the project **root** (not `src/`) — see `vite.config.ts`.
- Do not modify the `DISABLE_HMR` handling in `vite.config.ts`; it exists so AI-agent edit sessions don't thrash the file watcher.
- The API surface (8 routes under `/api`) and the SSE event contract are documented in the README's API Reference table; keep it updated when adding routes.
- The README's port references (3000) predate the move to 3369.
