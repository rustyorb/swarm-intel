# Directive Conditioner — design

Date: 2026-10-08. Author: Fable (SCANNING), with Kyle.

## Why

The best run this app has produced (LIMEN transformation map, 2026-10-05, deep,
8 agents, Red Team on) used an 8,158-word topic: a 2,000-word research
directive written by ChatGPT followed by a 6,000-word project overview fenced
as authoritative context. Every earlier run that felt thin or over-hedged used
a plain topic. The server prompts were identical in both cases. The input was
the variable.

The directive did the orchestrator's job by hand: it stated the primary
question, what the goal was and was not, the epistemic categories every claim
had to land in, the functions that had to be covered, the known failure modes,
seven numbered deliverables with their shape, when to use the web, and a
success condition. The orchestrator today writes 60 to 140 words of need
analysis from whatever it is given.

This spec adds a server-side step that writes that directive for any topic, so
a one-sentence topic gets the LIMEN treatment automatically. It also fixes two
bugs found while diagnosing this, and resolves two prompt conflicts that the
conditioner would otherwise inherit.

## Scope

In scope, in this order:

1. Phase 0a: synthesis double-fire (every run pays for two syntheses).
2. Phase 0b: stream parsers ignore provider finish reasons and error events.
3. Phase 1: the Directive Conditioner.
4. Phase 2: prompt-conflict cleanup the conditioner touches (search honesty
   wording, fringe-mode verdict line, VEX critique authority).

Out of scope: multi-pass synthesis, context budgeting, agent-level changes,
UI redesign. Those are separate specs if the conditioner makes runs bigger.

## Phase 0a: synthesis double-fire

**Bug.** `src/App.tsx` triggers synthesis from inside a React state updater:

```ts
setTimeout(() => {
  setSession(prev => {
    if (prev) runSynthesis(prev, validReports, critiques);
    return prev;
  });
}, 0);
```

`src/main.tsx` wraps the app in `StrictMode`, which invokes state updaters
twice in development. `npm run dev` is the only way this app is run, so every
synthesis has fired twice. Evidence: all six persisted runs are pairs created
15 to 31 ms apart with identical `inputs.json` and different `synthesis.md`.
Whichever stream finishes last wins the session.

**Fix.** Side effects never live in updaters. Capture the current session
snapshot the caller already holds (the agent-run loop and the Red Team loop
both have it), and call `runSynthesis` directly with the `synthesizing` status
applied to that snapshot. If a ref to the latest session is needed to avoid a
stale closure, use a `useRef` mirror of `session`, read it once, and call.
Verification: run a recon swarm and confirm `runs/` gains exactly one
directory and the server log prints one `Synthesizing N reports` line.

## Phase 0b: finish reasons and stream errors

**Bug.** Both stream parsers in `runUniversalStream` only read text deltas.
The Anthropic parser ignores `message_delta.stop_reason` and `error` events.
The OpenAI-compatible parser ignores `choices[0].finish_reason` and error
payloads. A response cut at the provider's token limit, or a mid-stream
provider error, resolves as success, is persisted, and is announced as done.
None of the six saved syntheses were actually truncated, so this is latent.

**Fix.**

- Anthropic: on an `error` event, throw with the provider's message. On
  `message_delta` with `stop_reason: "max_tokens"`, set a `truncated` flag.
- OpenAI-compatible: on a parsed chunk carrying `error`, throw with its
  message. On `finish_reason: "length"`, set `truncated`.
- Gemini: on a chunk whose `candidates[0].finishReason` is `MAX_TOKENS`, set
  `truncated`; on `SAFETY` or `RECITATION`, throw.
- `runUniversalStream` returns `{ truncated: boolean }`. Callers that persist
  or announce completion (agent-run, synthesize) append a visible marker line
  to the output when truncated:
  `\n\n> ⚠ OUTPUT TRUNCATED: the provider stopped at its output token limit.`
  and log a warning. Interrogation, debate and Red Team log only.
- Thrown errors already propagate as SSE `error` events through existing
  catch blocks. No new client handling is needed.

## Phase 1: Directive Conditioner

### Behaviour

When a fresh swarm is initiated with the conditioner on, the server expands
the user's topic into a full research directive before the need analysis
runs. The directive becomes the topic for everything downstream: need
analysis, agent assignments, agent runs, Red Team, synthesis, interrogation,
catalytic terms, leads, claims. The user's original text is preserved
verbatim inside the directive. There is no review gate.

### Toggle

`SwarmConfig` gains `conditionDirective?: boolean`. The launch panel gets a
toggle beside Red Team and Fringe Mode, labelled "Directive Conditioner",
default on. The server treats `config.conditionDirective !== false` as on, so
saved configs from before this change condition by default.

### When it runs

Only in `/api/research/initiate`, and only when `priorContext` is absent.
Follow-ups and Sentinel delta sweeps already carry a directive and prior
context, and pass through unchanged. Roster Mode runs the conditioner too;
the roster path is after it in the route.

### What the conditioner produces

One LLM call via `runUniversalStream` with role `orchestrator`, `hasSearch`
false, text accumulated. Not the JSON path: a 2,000-word markdown document
inside a JSON field is fragile under `extractJSON` and the schema retry.

The model writes **only the directive**, never the context. The server then
assembles the conditioned topic:

```
<directive from model>

---

# AUTHORITATIVE CONTEXT (verbatim user input, do not summarize it back)

<rawTopic, unchanged>
```

This is the no-truncation guarantee. The model never sees an opportunity to
shorten or paraphrase the user's input because the server appends it.

### Directive skeleton

The conditioner prompt carries the LIMEN directive's skeleton as the required
structure, with the LIMEN content stripped. Section order:

1. Title line.
2. Framing: what the task is, what it is not, what has already been done if
   the input says so.
3. `# PRIMARY QUESTION`: one sentence in a blockquote, then the goal.
4. `# CRITICAL DESIGN PRINCIPLE`: the one constraint that changes how agents
   should think, when the input implies one. Omit if none.
5. `# REQUIRED EPISTEMIC SEPARATION`: labelled categories every claim must be
   tagged with. Standard mode: established fact, reported claim, inference,
   open question. Fringe mode: the fringe provenance tags already used by
   the fringe synthesis structure.
6. `# COVERAGE`: the components, entities, functions or angles that must be
   addressed. Derived from the input; the conditioner may add obvious
   adjacent ones but marks them "(added)".
7. `# KNOWN FAILURE MODES`: traps specific to this topic that agents must
   check for. At least three, each one line.
8. `# REQUIRED DELIVERABLES`: numbered outputs with the shape of each (table,
   list, matrix, pipeline), sized to depth: recon three, standard five, deep
   seven. These must be things the synthesis structure can hold.
9. `# RESEARCH BEHAVIOR`: when to use the web and when not to, phrased for
   this pipeline (injected SearXNG results plus full-page extracts, two-wave
   deepening in agent runs).
10. `# SUCCESS CONDITION`: what a passing answer looks like, in the user's
    terms.

### Improvement, not replacement

The prompt instructs: if the input already contains a primary question,
deliverables, constraints or any of the sections above, carry them into the
directive verbatim and fill only the gaps. A LIMEN-grade paste should come
out with its own sections intact and at most a success condition or failure
modes added. If the input is one sentence, every section is written fresh.

### Machine-aware

The prompt tells the conditioner the active configuration so the directive
fits the pipeline: depth and its word floors, agent count or auto, Red Team
on or off, fringe mode, how grounding works, and that synthesis ends with a
Source Ledger. It must not write deliverables the synthesis structure cannot
hold, and must not instruct agents to use tools they do not have.

### Guards

- The conditioner never researches. The prompt says so, and `hasSearch` is
  false.
- Minimum output: if the result is under 300 words or lacks a
  `# PRIMARY QUESTION` header, discard it, log a warning, and proceed with
  the raw topic. The conditioner never blocks a run.
- On any error from the call, same fallback.
- Input ceiling: if the raw topic exceeds 12,000 words, skip conditioning and
  log why. The context fence would push the orchestrator past most models'
  windows.
- Timeout: reuse `JSON_CALL_TIMEOUT_MS`.

### Response and client state

`/api/research/initiate` returns, in addition to `agents` and
`needAnalysis`:

- `directive`: the full conditioned topic, or absent when conditioning was
  off, skipped or fell back.
- `rawTopic`: the input as received.

`ResearchSession` gains `rawTopic?: string`. The client sets:

- `session.topic` = `directive` when present, else the raw topic. Every
  downstream call already sends `session.topic`, so nothing else changes.
  This is exactly the LIMEN configuration that proved out.
- `session.rawTopic` = the input. Used wherever the topic is shown as a
  title: the session header, the history list, the Knowledge Library card,
  the dossier title, Reader Mode heading. A helper `sessionTitle(session)`
  returns `rawTopic ?? topic` and replaces direct `topic` reads at those
  sites.

The ops log gets two entries when conditioning ran: a system line
`DIRECTIVE CONDITIONER: expanded 14 → 1,830 words`, and an info line
containing the directive text, so it is visible without a review gate.

### Persistence

`persistRunFile` already writes `inputs.json` with the topic at synthesis
time; it will now carry the conditioned topic. Add `rawTopic` to that JSON
and to `meta.json` so `runs/` is readable by title.

## Phase 2: prompt conflicts the conditioner would inherit

Three edits in `server.ts`, each small.

1. **Search honesty.** The shared GROUNDING RULES block says "NEVER claim to
   have searched, queried, or checked any engine, database, or source
   yourself." The SEARCH HONESTY block then tells Gemini and Anthropic to run
   real queries with their tool and cite them. Reword the shared line to:
   "Never describe a search you did not actually run. The LIVE WEB SEARCH
   RESULTS block lists the searches the research system ran for you; if you
   have a web search tool, searches you run with it are yours to report, by
   their exact query." The non-native `noOwnSearch` line stays as is.
2. **Fringe verdict.** The DENSITY MANDATE's "ANSWER THE PRIMARY QUESTION
   FIRST: open with the pick, the ranking, the verdict" applies to every
   structure. In fringe mode replace that bullet with: "OPEN WITH THE FILE'S
   STATE: what the evidence currently supports, what it does not, and the
   strongest open lead. Insufficient to conclude is a valid opening."
3. **VEX authority.** The synthesis directive "Address EVERY material
   critique … rebut or concede" treats an unresearched review as equal to
   researched findings. Reword: "VEX reviewed each report without web access;
   critiques are internal consistency checks, not new evidence. Address each
   material critique: rebut it from the specialist evidence, concede it, or
   note that it raises a question the sweep did not test. A critique with no
   evidence behind it does not outrank a sourced finding. Where VEX rated a
   report Low, say how that bounds confidence." The Red Team call itself
   stays without search; giving VEX search is a separate decision.

## Testing

There is no test framework. Verification is manual against the dev server:

- Phase 0a: one recon run, one `runs/` directory, one server log line.
- Phase 0b: point synthesis at LM Studio with a small `max_tokens` set on
  the model, confirm the truncation marker appears and the log warns. Point
  at a bad OpenRouter model id, confirm the error reaches the UI.
- Phase 1: initiate with a one-sentence topic, read the directive in the ops
  log, confirm it has every section and the verbatim context fence. Initiate
  with the LIMEN directive pasted, confirm its sections survive unchanged.
  Toggle off, confirm the topic passes through and `directive` is absent.
  Confirm the header and history show the short title.
- Phase 2: read the assembled prompts in the server log for a standard run
  and a fringe run.
- `npm run lint` clean throughout.

## Order of work

0a, 0b, then Phase 1 server, Phase 1 client, Phase 2. Each phase is its own
commit. Phase 1's conditioner prompt is drafted from the LIMEN skeleton, then
run through Kyle's prompt amplifiers as a second opinion before it is
finalised; the better version ships.
