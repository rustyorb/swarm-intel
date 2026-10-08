# Mission Control, live — design

Date: 2026-10-08. Author: Fable (SCANNING). Pre-approved by Kyle ("preapprove all
following plans to your recommendations").

## Why

While a swarm runs, the center view shows a progress ring driven by a random
timer and status labels picked from a canned list (SIMULATING_MODELS at 45-59
percent, whatever the agent is doing). It even posts fake lines into the ops
log. Meanwhile the real signals exist and go unshown: the query plan, the
grounding counts, the second search wave, the model thinking before its first
token, and the report streaming into state word by word. On a deep run an
agent is working for ten minutes and the user watches theater. Kyle's words:
"I don't see much anyways, just what's in the right sidebar."

This spec replaces the theater with the real pipeline, shows the text as it
arrives, exposes the conditioned directive, gives agents faces, and stops a
reset from leaving server calls burning.

## Scope

1. Real stage telemetry from the server, consumed by the client. The fake
   progress simulation is deleted.
2. A live stream pane in the center view: the active agent's report (or the
   synthesis) rendering as it streams, with stage timeline, word count,
   elapsed time, and a "model reasoning" state before the first token.
3. A directive viewer: button in the run header, tab in the results view; the
   ops log stops carrying the full directive.
4. Reset aborts in-flight client requests (initiate, agent runs, synthesis).
5. Agent portraits generated once per persona, stored on disk, shown on cards,
   network nodes, modals, result tabs and the Agent Library.
6. A run stats strip on the completed view: elapsed, words, sources, grounding.
7. Per-chunk session writes during agent streaming are throttled like the
   synthesis already is.

Out of scope: dossier export changes beyond what falls out of `sessionTitle`,
server-side cancellation of provider calls, cost accounting.

## 1. Stage telemetry

New SSE event on `agent-run-stream` and `synthesize-stream`:

```
{ type: "stage", stage: "planning" | "searching" | "reading" | "reasoning" | "writing",
  wave?: 1 | 2, pages?: number, hits?: number }
```

Emission points in `server.ts`:

- agent-run: `planning` before `planSearchQueries`.
- `gatherLiveContext` gains an optional `onStage` callback: `searching`
  (wave 1) before the first wave, `searching` (wave 2) before the second,
  `reading` with `pages` before page extraction.
- `runUniversalStream` gains an optional `onStage` callback, threads it into
  `gatherLiveContext`, emits `reasoning` once the prompt is final and the
  provider call is about to start, and `writing` on the first non-blank chunk.
- synthesize-stream: `reasoning` before the call, `writing` on first chunk.

Client state replaces the simulation:

```ts
interface AgentTelemetry {
  stage: "queued" | "planning" | "searching" | "reading" | "reasoning" | "writing" | "done" | "failed";
  wave?: number; pages?: number; hits?: number;
  startedAt: number;        // run start
  stageSince: number;       // last stage change
  words: number;            // live word count of the streamed report
  finishedAt?: number;
}
```

`agentProgress` (percent + statusText) is kept as a derived view so
`SwarmNetwork` keeps working: percent = planning 6, searching w1 18, w2 32,
reading 42, reasoning 50, writing 50 + 45 × min(1, words / floor), done 100,
where floor is 1,000 / 3,000 / 6,000 words for recon / standard / deep.
statusText = "PLANNING QUERIES", "SEARCHING · WAVE 1", "SEARCHING · WAVE 2",
"READING 9 PAGES", "MODEL REASONING 0:42", "WRITING · 1,234 WORDS". The
reasoning timer ticks once a second from `stageSince`.

`simOperations`, `runSimulatedProgress`, and their fake log lines are deleted.

## 2. Live stream pane

A panel above the agent grid/network while status is researching, redteaming
or synthesizing. Contents:

- Header: avatar, name, role, color accent; stage chips in pipeline order
  with the current one lit; elapsed clock; live word count and words/second.
- Body: the streaming report rendered as markdown (same renderer config the
  Red Team tribunal uses, with the agent's color), auto-scrolled to the
  bottom while "Follow live" is on. Scrolling up turns Follow off; a button
  turns it back on.
- Before the first token: a centered "model is reasoning" state with the
  timer and the grounding summary already known (hits, pages).
- During synthesis the pane shows the Lead Orchestrator, the synthesis text,
  and the same clock and word count. During Red Team the existing tribunal
  block stays; the pane shows the last completed agent's report, muted.
- Tabs on the pane list every agent; the live one is default. Clicking a
  completed agent shows its report in the pane. The existing full-screen
  modal stays as the way to read a finished report at length.

Rendering is throttled: the pane reads a `displayText` state updated at most
every 400 ms from a ref the stream loop writes into, same pattern the
synthesis flush uses. The per-chunk `setSession` in the agent loop becomes a
400 ms throttle too, with a final write on completion.

## 3. Directive viewer

When `session.topic !== sessionTitle(session)`, the run header shows a
"DIRECTIVE · 1,969 words" button. It opens a right-side drawer with the
directive rendered as markdown, a copy button, and a section list built from
`# ` headers for jumping. The completed results view gets a "Directive" tab
before the agent tabs. The ops log line on launch becomes a one-liner:
"DIRECTIVE CONDITIONER: expanded 37 → 1,969 words. Open it from the header."

## 4. Reset aborts

A `runAbortRef: AbortController` is created at initiate and passed as
`signal` to every pipeline fetch (initiate, agent-run, red team, catalytic,
synthesis, leads, claims). Reset aborts it, logs "Run cancelled", and the
loops exit on the abort error without marking the session failed. Server
routes do not cancel provider calls (out of scope) but the agent-run and
synthesize routes log "client disconnected" on `req.on("close")`.

## 5. Agent portraits

Server route `POST /api/research/agent-portrait`
`{ name, role, investigativeAngle, colorTheme, fringe }` → `{ url }`.

- Key: sha1 of `name|role` so the same persona always gets the same file;
  Roster Mode agents therefore keep their face across runs.
- Model: `gemini-3.1-flash-image` through the server's Gemini key via
  `@google/genai` `generateContent` with `responseModalities: ["IMAGE"]`;
  the inline PNG is written to `portraits/<key>.png` (gitignored) and served
  by `express.static` at `/portraits/`. 512 px square.
- Prompt: a square head-and-shoulders portrait of a named specialist, stylized
  as a retro-futurist intelligence operative: dark warm-black background,
  amber rim light, cyber-noir, fine film grain, painterly, centered,
  no text, no logos, no watermark; accent color from the theme. Fringe mode
  adds "case-file investigator, noir". Role and angle inform wardrobe and
  props. One line forbids real-person likeness.
- Failure returns `{ url: null }`; the client keeps the pixel avatar.
- Client: on team arrival (before approval) the client requests portraits for
  all agents in parallel, non-blocking, and sets `agent.portraitUrl` as each
  lands. `Agent` and `SavedAgent` gain `portraitUrl?: string`;
  `saveAgentToLibrary` carries it. Toggle "Agent Portraits" in the launch
  panel, default on (`SwarmConfig.portraits`, undefined means on).
- `PixelAvatar` gains `portraitUrl?: string`; when set it renders the image
  inside the same frame and falls back to the pixel grid if the image fails
  to load.

## 6. Run stats

`ResearchSession` gains `startedAt?: number` (set at initiate) and
`completedAt?: number` (set when synthesis finishes). The completed view
header shows a strip: elapsed, agents, total agent words, synthesis words,
unique cited URLs across all reports, and grounding modes (N injected,
M native, K none). Computed on render; no new persistence beyond the two
timestamps.

## Testing

Manual against the dev server, with the probe scripts for the server side:

- `scripts/agent_probe.py` prints stage events in order with timestamps.
- A recon run in the browser: the pane follows the active agent, the
  reasoning timer shows before the first token, the word count climbs, the
  grid card shows real stage labels, no SIMULATING_MODELS anywhere, the
  directive button opens the drawer, portraits appear on cards within ~30 s
  of team arrival, Reset mid-run stops the loop and logs the cancel, the
  completed view shows the stats strip and the Directive tab.
- `npm run lint` clean throughout.
