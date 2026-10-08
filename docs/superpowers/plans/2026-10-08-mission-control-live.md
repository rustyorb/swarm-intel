# Mission Control Live Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan was executed inline by its author in the same session; tasks name files, interfaces and verification rather than carrying full code listings.

**Goal:** Replace the fake run progress with real pipeline telemetry, show reports as they stream, expose the directive, abort on reset, give agents portraits, and show run stats.

**Architecture:** Server emits `stage` SSE events from the two streaming routes via optional `onStage` callbacks threaded through `runUniversalStream` and `gatherLiveContext`. The client keeps a per-agent telemetry map and derives the old `{percent, statusText}` shape from it so `SwarmNetwork` is untouched. A new `LiveWire` component renders the streaming text from a throttled state. Portraits are a new server route writing PNGs to `portraits/` served statically.

**Tech Stack:** Express + tsx, React 18, react-markdown + remark-gfm, framer-motion (already used by SwarmNetwork), lucide-react, `@google/genai` 2.x for image generation.

Spec: `docs/superpowers/specs/2026-10-08-mission-control-live-design.md`.

## Global Constraints

- `npm run lint` passes after every task.
- No new dependencies.
- `SwarmNetwork` keeps consuming `agentProgress: Record<string, { percent: number; statusText: string }>`.
- Every new fetch takes the run `AbortSignal`.
- Server edits are batched and the dev server restarted between Kyle's runs, never during one.
- One commit per task, attribution trailer on each.

---

### Task 1: Server stage telemetry

**Files:** `server.ts` — `gatherLiveContext` (add `onStage?` param), `runUniversalStream` (add `onStage?` param, thread into gather, emit `reasoning` and `writing`), agent-run route (emit `planning`, forward `stage` events as SSE), synthesize route (forward `stage`).

**Interfaces:**
- `type StageInfo = { stage: "planning" | "searching" | "reading" | "reasoning" | "writing"; wave?: number; pages?: number; hits?: number }`
- `runUniversalStream(..., deepenSearch?, onStage?: (s: StageInfo) => void)`
- `gatherLiveContext(queries, refine?, onStage?)`
- SSE: `data: {"type":"stage","stage":"searching","wave":1}`

- [x] Add the type and the callback params; emit at the five points.
- [x] `scripts/agent_probe.py` prints stage events with elapsed seconds.
- [x] Verify with the probe: order is planning → searching 1 → (searching 2) → reading → reasoning → writing → done.
- [x] Lint, commit: `server: real stage telemetry on agent and synthesis streams`.

### Task 2: Client telemetry replaces the simulation

**Files:** `src/App.tsx` (agent loop, `agentProgress`, new `agentTelemetry` state, derived progress helper), `src/types.ts` (`AgentTelemetry`, `StageName`).

**Interfaces:**
- `const [agentTelemetry, setAgentTelemetry] = useState<Record<string, AgentTelemetry>>({})`
- `deriveProgress(t: AgentTelemetry, depth): { percent: number; statusText: string }`
- `agentProgress` becomes a `useMemo` over `agentTelemetry` plus a 1 s tick for the reasoning timer.

- [x] Delete `simOperations`, `runSimulatedProgress`, the interval plumbing and the fake log lines.
- [x] Handle `stage` events in the agent loop; count words on chunks; set `done`/`failed`.
- [x] Throttle the per-chunk `setSession` to 400 ms with a final flush.
- [x] Lint, verify in the browser (card labels are real), commit: `ui: real per-agent stages replace the simulated progress`.

### Task 3: LiveWire pane

**Files:** Create `src/components/LiveWire.tsx`; modify `src/App.tsx` (render above grid/network during researching/redteaming/synthesizing; `activeAgentId` state; `liveText` throttled state fed by the agent loop and the synthesis loop).

**Interfaces:**
- `<LiveWire agents telemetry activeAgentId selectedId onSelect text mode="agent"|"synthesis" synthesisWords startedAt getColorHex />`

- [x] Build the component: header, stage chips, clock, word count, follow-live toggle, markdown body, reasoning placeholder.
- [x] Wire the agent loop and synthesis loop to feed `liveText` (ref + 400 ms flush).
- [x] Lint, verify in the browser, commit: `ui: LiveWire pane streams the active report in the center view`.

### Task 4: Directive viewer

**Files:** `src/App.tsx` (header button, drawer, results tab), ops-log line.

- [x] Drawer component inline in App: markdown render, copy, header list.
- [x] Results view: "Directive" tab when conditioned.
- [x] Ops log: one-liner instead of the full directive.
- [x] Lint, verify, commit: `ui: directive viewer (header drawer + results tab)`.

### Task 5: Reset aborts in-flight requests

**Files:** `src/App.tsx` (`runAbortRef`, signal on every pipeline fetch, reset handler, abort handling in loops), `server.ts` (log client disconnect on the two streaming routes).

- [x] Lint, verify (reset mid-run stops the loop, logs cancel, no "failed" state), commit: `ui: reset aborts in-flight run requests`.

### Task 6: Agent portraits

**Files:** `server.ts` (route + static), `.gitignore` (`portraits/`), `src/types.ts` (`portraitUrl` on `Agent` and `SavedAgent`, `SwarmConfig.portraits`), `src/components/PixelAvatar.tsx` (`portraitUrl` prop), `src/App.tsx` (request after team arrival, toggle, pass-through to avatars, library save), `src/components/SwarmNetwork.tsx`, `AgentLibrary.tsx`, `InterrogationRoom.tsx` (pass `portraitUrl`).

**Interfaces:**
- `POST /api/research/agent-portrait { name, role, investigativeAngle, colorTheme, fringe } → { url: string | null }`

- [x] Server route with sha1 cache, Gemini image call, PNG write, static serving.
- [x] Client wiring and toggle (default on).
- [x] Verify: curl the route once (cost ~$0.04), then a run shows portraits on cards and nodes.
- [x] Lint, commit: `feat: agent portraits (Gemini image gen, cached per persona)`.

### Task 7: Run stats strip

**Files:** `src/types.ts` (`startedAt`, `completedAt`), `src/App.tsx` (set timestamps; strip in completed header).

- [x] Lint, verify on a completed session, commit: `ui: run stats strip on completed view`.

### Task 8: Docs

- [x] README: feature log row v3.3.0, API table rows (`agent-portrait`, `stage` SSE event), UI version badge.
- [x] HANDOFF entry. Commit.
