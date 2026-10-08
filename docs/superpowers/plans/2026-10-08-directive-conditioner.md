# Directive Conditioner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand any research topic into a LIMEN-grade directive before the swarm launches, and fix the two stream bugs found while diagnosing why plain topics underperform.

**Architecture:** One new server-side LLM step inside `/api/research/initiate` writes a directive; the server appends the user's input verbatim as fenced context and the result becomes `session.topic` for every downstream call. The client keeps `session.rawTopic` for titles. Two parser fixes in `runUniversalStream` and one state-updater fix in the client precede it.

**Tech Stack:** Express + tsx (`server.ts`), React 18 + Vite (`src/App.tsx`, `src/types.ts`), no test framework; verification is `npm run lint` (tsc) plus manual runs against the dev server on port 3369.

Spec: `docs/superpowers/specs/2026-10-08-directive-conditioner-design.md`.

## Global Constraints

- `npm run lint` must pass after every task.
- No new dependencies.
- The conditioner never blocks a run: any failure falls back to the raw topic.
- The user's input is appended by the server, never rewritten by the model.
- Follow-ups and delta sweeps (`priorContext` present) are never conditioned.
- Each phase is its own commit with the attribution trailer.

---

### Task 1: Phase 0a — synthesis fires once

**Files:**
- Modify: `src/App.tsx:1601-1610` (end of `runParallelResearch`)

**Interfaces:**
- Consumes: `sessionSaveRef` (`useRef<ResearchSession | null>`, line 1012), `runSynthesis(currentSession, compiledReports, critiques)` (line 1612).
- Produces: nothing new.

- [ ] **Step 1: Replace the updater-side-effect with a direct call**

Replace lines 1601-1610:

```ts
    // Trigger synthesis
    setSession(prev => {
      if (!prev) return null;
      return { ...prev, status: "synthesizing" as SessionStatus };
    });
    setTimeout(() => {
      setSession(prev => {
        if (prev) {
          runSynthesis(prev, validReports, critiques);
        }
        return prev;
      });
    }, 0);
```

with:

```ts
    // Trigger synthesis. Never from inside a state updater: React Strict
    // Mode (src/main.tsx) runs updaters twice in dev, which fired two
    // syntheses per run. Read the latest session from the save-ref mirror
    // and call once.
    const latest = sessionSaveRef.current ?? currentSession;
    const synthSession: ResearchSession = {
      ...latest,
      status: "synthesizing" as SessionStatus,
      catalyticTerms,
      critiques,
    };
    setSession(prev => prev ? { ...prev, status: "synthesizing" as SessionStatus } : null);
    void runSynthesis(synthSession, validReports, critiques);
```

- [ ] **Step 2: Lint**

Run: `npm run lint`. Expected: no output, exit 0.

- [ ] **Step 3: Verify**

Start the dev server, run a recon swarm with 3 agents on any topic. Expected: the server log prints exactly one `Synthesizing N reports` line and `runs/` gains exactly one new directory.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "fix: synthesis fired twice per run (Strict Mode double-invoked the updater)"
```

---

### Task 2: Phase 0b — stream parsers honour finish reasons and errors

**Files:**
- Modify: `server.ts:913-1120` (`runUniversalStream`), `server.ts:1770-1787` (agent-run call), `server.ts:1965-1985` (synthesis call).

**Interfaces:**
- Produces: `runUniversalStream(...): Promise<{ truncated: boolean }>`. Existing callers that ignore the return value keep working.
- Produces: `const TRUNCATION_MARKER = "\n\n> ⚠ OUTPUT TRUNCATED: the provider stopped at its output token limit. The report above is incomplete.";`

- [ ] **Step 1: Change the signature and add the marker constant**

Above `runUniversalStream`, add:

```ts
const TRUNCATION_MARKER = "\n\n> ⚠ OUTPUT TRUNCATED: the provider stopped at its output token limit. The report above is incomplete.";
```

Change `): Promise<void> {` to `): Promise<{ truncated: boolean }> {` and add `let truncated = false;` as the first line of the body (before `const { provider, ... }`).

- [ ] **Step 2: Gemini**

Replace the chunk loop:

```ts
    for await (const chunk of responseStream) {
      if (chunk.text) {
        onChunk(chunk.text);
      }
    }
    return;
```

with:

```ts
    for await (const chunk of responseStream) {
      if (chunk.text) {
        onChunk(chunk.text);
      }
      const finish = chunk.candidates?.[0]?.finishReason as string | undefined;
      if (finish === "MAX_TOKENS") truncated = true;
      else if (finish === "SAFETY" || finish === "RECITATION" || finish === "PROHIBITED_CONTENT") {
        throw new Error(`Gemini stopped the stream: finishReason=${finish}.`);
      }
    }
    return { truncated };
```

- [ ] **Step 3: Anthropic**

Replace the inner parse:

```ts
            const parsed = JSON.parse(cleanLine.substring(6));
            if (parsed.type === "content_block_delta" && parsed.delta?.text) {
              onChunk(parsed.delta.text);
            }
```

with:

```ts
            const parsed = JSON.parse(cleanLine.substring(6));
            if (parsed.type === "content_block_delta" && parsed.delta?.text) {
              onChunk(parsed.delta.text);
            } else if (parsed.type === "message_delta" && parsed.delta?.stop_reason === "max_tokens") {
              truncated = true;
            } else if (parsed.type === "error") {
              throw new Error(`Anthropic stream error: ${parsed.error?.message || JSON.stringify(parsed.error || parsed)}`);
            }
```

The `try { ... } catch (e) { /* ignore partial */ }` around it would swallow the throw. Change that catch to rethrow real errors:

```ts
          } catch (e: any) {
            if (e instanceof SyntaxError) continue; // partial chunk
            throw e;
          }
```

and change the Anthropic branch's trailing `return;` to `return { truncated };`.

- [ ] **Step 4: OpenAI-compatible**

Replace the inner parse:

```ts
          const parsed = JSON.parse(cleanLine.substring(6));
          const text = parsed.choices?.[0]?.delta?.content || "";
          if (text) {
            onChunk(text);
          }
```

with:

```ts
          const parsed = JSON.parse(cleanLine.substring(6));
          if (parsed.error) {
            throw new Error(`${provider.toUpperCase()} stream error: ${parsed.error.message || JSON.stringify(parsed.error)}`);
          }
          const text = parsed.choices?.[0]?.delta?.content || "";
          if (text) {
            onChunk(text);
          }
          if (parsed.choices?.[0]?.finish_reason === "length") truncated = true;
```

Same catch change as Step 3. Add `return { truncated };` as the last line of the function.

- [ ] **Step 5: Agent-run caller appends the marker**

In `/api/research/agent-run-stream`, change `await runUniversalStream(` to `const { truncated } = await runUniversalStream(` and before `res.write(... type: "done" ...)` add:

```ts
        if (truncated) {
          console.warn(`[Truncation] ${agent.name}: provider hit its output token limit.`);
          res.write(`data: ${JSON.stringify({ type: "chunk", text: TRUNCATION_MARKER })}\n\n`);
        }
```

- [ ] **Step 6: Synthesis caller appends the marker**

In `/api/research/synthesize-stream`, change `await runUniversalStream(` to `const { truncated } = await runUniversalStream(` and before `console.log(\`Synthesis generation complete...` add:

```ts
        if (truncated) {
          console.warn("[Truncation] synthesis: provider hit its output token limit.");
          synthesizedReport += TRUNCATION_MARKER;
          res.write(`data: ${JSON.stringify({ type: "chunk", text: TRUNCATION_MARKER })}\n\n`);
        }
```

- [ ] **Step 7: Lint, verify, commit**

Run: `npm run lint`. Expected: exit 0.

Verify: with the server running, POST a bad model id through the UI (Settings → orchestrator model `nonexistent-model` on OpenRouter) and initiate; the Assembly Error must name the provider error. Restore the model.

```bash
git add server.ts
git commit -m "fix: stream parsers surface provider errors and flag token-limit truncation"
```

---

### Task 3: Phase 1 server — conditioner function and prompt

**Files:**
- Modify: `server.ts` — add after `formatPriorContextBlock` (line ~690).

**Interfaces:**
- Produces:
  - `interface ConditionerConfig { depth: "recon" | "standard" | "deep"; fringe: boolean; redTeam: boolean; agentCount: number | "auto"; }`
  - `async function conditionDirective(rawTopic: string, settings: any, cfg: ConditionerConfig): Promise<string | null>` — returns the directive text only, or null on skip/fallback.
  - `function assembleConditionedTopic(directive: string, rawTopic: string): string`
- Consumes: `runUniversalStream`, `JSON_CALL_TIMEOUT_MS`.

- [ ] **Step 1: Add the constants, prompt builder, assembler and function**

```ts
// -------------------------------------------------------------
// Directive Conditioner
// -------------------------------------------------------------
// The best runs this app has produced used a full research DIRECTIVE as the
// topic (primary question, epistemic categories, coverage, failure modes,
// numbered deliverables, research behaviour, success condition) followed by
// the user's own context. Plain one-line topics underperform with the same
// prompts. This step writes that directive for any input. The model writes
// ONLY the directive; the server appends the user's input verbatim, so
// nothing the user wrote can be shortened or lost.

interface ConditionerConfig {
  depth: "recon" | "standard" | "deep";
  fringe: boolean;
  redTeam: boolean;
  agentCount: number | "auto";
}

const CONDITIONER_MAX_INPUT_WORDS = 12000;
const CONDITIONER_MIN_OUTPUT_WORDS = 300;

const CONDITIONER_SYSTEM = "You are the Directive Conditioner for a multi-agent research swarm. You turn a research request into a complete, machine-fitted research directive. You structure; you never research, never answer the question, and never restate the user's context back to them.";

const CONTEXT_FENCE_HEADER = "# AUTHORITATIVE CONTEXT (verbatim user input — treat as the project baseline; do not summarize it back)";

function assembleConditionedTopic(directive: string, rawTopic: string): string {
  return `${directive.trim()}\n\n---\n\n${CONTEXT_FENCE_HEADER}\n\n${rawTopic.trim()}`;
}

function buildConditionerPrompt(rawTopic: string, cfg: ConditionerConfig): string {
  const deliverableCount = cfg.depth === "recon" ? 3 : cfg.depth === "deep" ? 7 : 5;
  const wordTarget = cfg.depth === "recon" ? "900-1,400" : cfg.depth === "deep" ? "1,800-2,600" : "1,300-2,000";
  const agentFloors = cfg.depth === "recon" ? "800-1,200" : cfg.depth === "deep" ? "5,000-8,000" : "2,500-4,000";
  const synthFloor = cfg.depth === "recon" ? "1,500-2,500" : cfg.depth === "deep" ? "8,000-12,000" : "4,000-6,000";
  const epistemic = cfg.fringe
    ? `Use the case-file provenance tags this pipeline already enforces: [primary text], [community lore], [witness testimony], [documented anomaly], [official record], [verified]. Add [design choice] and [open question] if the request is about building or deciding something.`
    : `Define four to six labelled categories every claim must be tagged with. Default set: ESTABLISHED FACT (sourced, uncontested), REPORTED CLAIM (sourced, contested or single-source), INFERENCE (the agent's reasoning from facts), DESIGN CHOICE (a recommendation, not a finding), OPEN QUESTION (could not be settled this run). Rename or extend them to fit the request's domain.`;
  const verdictLine = cfg.fringe
    ? "This is a CASE FILE run: the synthesis opens with the state of the evidence and may legitimately conclude insufficient-to-conclude. The success condition must not demand a verdict."
    : "The synthesis opens with the direct answer to the primary question (the pick, the ranking, the verdict, the design). The success condition must say what that answer looks like.";

  return `Today's date is ${new Date().toDateString()}.

THE PIPELINE THIS DIRECTIVE WILL DRIVE (write for this machine, not for a chatbot):
- An orchestrator reads the directive, writes a need analysis, and sprouts ${cfg.agentCount === "auto" ? "3-9" : cfg.agentCount} specialist agents from it. Each agent runs SEQUENTIALLY and writes a ${agentFloors}-word report (depth: ${cfg.depth.toUpperCase()}).
- Every agent is web-grounded: the server runs SearXNG searches planned from the directive and the agent's assignment, fetches full page text from the top-ranked hits, and injects both into the agent's prompt; deep runs add a second search wave written from the first wave's results. Agents can quote and cite only what those searches return (plus native search on Gemini/Anthropic). They have no code execution, no file access, no databases.
- ${cfg.redTeam ? "A Red Team pass (VEX) cross-examines each report WITHOUT web access before synthesis." : "No Red Team pass this run."}
- A single synthesis model folds every report into one ${synthFloor}-word document with a fixed structure (executive summary, tracks and methodology, thematic insights, conflict/consensus/uncertainty, recommendations, conclusion, Source Ledger). ${verdictLine}
- Deliverables you specify must be things that structure can hold: tables, matrices, ranked lists, labelled sections, pipelines. Nothing interactive, nothing that needs tools the agents lack.

THE RESEARCH REQUEST (verbatim; the server will append this under an AUTHORITATIVE CONTEXT fence after your directive, so do NOT copy, summarize, or paraphrase it back):
<<<REQUEST
${rawTopic.trim()}
REQUEST>>>

YOUR JOB: write the DIRECTIVE that sits above that context. ${wordTarget} words of Markdown. Required sections, in this order, with these exact top-level headers:

# <TITLE> — RESEARCH DIRECTIVE
Two to six sentences of framing: what this run must produce, what it must NOT do (no broad histories, no restating context, no re-deriving what the request already establishes), and what the request already treats as settled.

# PRIMARY QUESTION
One question in a blockquote, then two to four sentences on the goal: what a useful answer is for, and what it is not for.

# CRITICAL DESIGN PRINCIPLE
The one constraint that most changes how agents should think about this request (for example: who the real decision-maker is, what must never be inherited, what the answer must be optimized for). If the request implies none, write one that sharpens the primary question. One short header line plus one paragraph.

# REQUIRED EPISTEMIC SEPARATION
${epistemic} One line per category: the label and the rule for using it.

# COVERAGE
The components, entities, functions, angles or candidates that MUST be addressed, as a bulleted list derived from the request. You may add obvious adjacent items; mark each added one "(added)". Agents are forbidden from skipping any listed item.

# KNOWN FAILURE MODES
At least ${cfg.depth === "recon" ? 3 : 5} traps specific to THIS topic (not generic research advice), each as a short bold name and one line on how an agent would detect it.

# REQUIRED DELIVERABLES
Exactly ${deliverableCount} numbered deliverables. For each: a short name, the shape (table with named columns / ranked list / matrix / labelled section / pipeline), and one line on what it must contain. These become the backbone of the synthesis; make them concrete enough that a missing one is obvious.

# RESEARCH BEHAVIOR
When agents should use live web search and when they should rely on the authoritative context; which kinds of sources are primary for this request; what "already known" means here so agents do not re-research it; and the rule that absence from a limited search is never evidence of absence.

# SUCCESS CONDITION
What a passing synthesis looks like, in the requester's own terms: three to six bullet points that could be checked against the final document.

RULES:
- IMPROVE, DO NOT REPLACE. If the request already contains any of these sections or their equivalents (a stated primary question, deliverables, constraints, failure modes, a success condition), carry that material into the matching section VERBATIM and fill only what is missing. A request that is already a full directive should come out nearly unchanged plus the sections it lacked.
- Never research, never answer the question, never invent facts about the subject. Your knowledge of the domain may shape COVERAGE and KNOWN FAILURE MODES; it may not supply findings.
- Never copy or summarize the request text into the directive except where the IMPROVE rule requires carrying a section forward.
- Write in direct imperative prose. No preamble, no closing remarks, no commentary about this task. Output the directive only, starting with the title header.`;
}

async function conditionDirective(rawTopic: string, settings: any, cfg: ConditionerConfig): Promise<string | null> {
  const inputWords = rawTopic.trim().split(/\s+/).filter(Boolean).length;
  if (inputWords > CONDITIONER_MAX_INPUT_WORDS) {
    console.warn(`[Conditioner] skipped: input is ${inputWords} words (ceiling ${CONDITIONER_MAX_INPUT_WORDS}).`);
    return null;
  }
  const prompt = buildConditionerPrompt(rawTopic, cfg);
  let acc = "";
  try {
    await Promise.race([
      runUniversalStream("orchestrator", settings, prompt, CONDITIONER_SYSTEM, false, (t) => { acc += t; }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`conditioner timed out after ${JSON_CALL_TIMEOUT_MS / 1000}s`)), JSON_CALL_TIMEOUT_MS)),
    ]);
  } catch (err: any) {
    console.warn(`[Conditioner] failed, using raw topic: ${err?.message || err}`);
    return null;
  }
  const directive = acc.trim();
  const outWords = directive.split(/\s+/).filter(Boolean).length;
  if (outWords < CONDITIONER_MIN_OUTPUT_WORDS || !/^#\s*PRIMARY QUESTION/m.test(directive)) {
    console.warn(`[Conditioner] output rejected (${outWords} words, primary-question header ${/^#\s*PRIMARY QUESTION/m.test(directive) ? "present" : "missing"}); using raw topic.`);
    return null;
  }
  console.log(`[Conditioner] expanded ${inputWords} → ${outWords} directive words.`);
  return directive;
}
```

- [ ] **Step 2: Lint and commit**

Run: `npm run lint`. Expected: exit 0 (the function is unused for now; tsc does not flag unused functions).

```bash
git add server.ts
git commit -m "feat(server): directive conditioner function and prompt"
```

---

### Task 4: Phase 1 server — wire the conditioner into initiate and persistence

**Files:**
- Modify: `server.ts:1242-1270` (initiate head), `server.ts:1292` and `:1399` (`RESEARCH REQUEST`), `server.ts:1388` and `:1569` (returns), `server.ts:1802-1820` and `:1981-1983` (synthesize persistence).

**Interfaces:**
- Produces: `/api/research/initiate` response gains `rawTopic: string` always and `directive: string` (the full conditioned topic) when conditioning ran.
- Produces: `/api/research/synthesize-stream` accepts optional `rawTopic` and writes it into `inputs.json` and `meta.json`; the run directory slug uses it.

- [ ] **Step 1: Initiate head**

After `const delta = !!(priorContext && priorContext.delta);` insert:

```ts
      // Roster Mode needs its library before anything is spent on conditioning.
      if (roster && savedAgents.length < 2) {
        return res.status(400).json({ error: "Roster Mode needs at least 2 agents in your Agent Library. Save specialists from a swarm (bookmark icon on their card) or forge them in the Agent Library, then relaunch." });
      }

      // Directive Conditioner: fresh runs only (follow-ups and delta sweeps
      // already carry a directive and prior context). Default ON; the
      // client sends conditionDirective: false to bypass.
      const rawTopic = String(topic);
      const wantsConditioning = !priorBlock && !(config && config.conditionDirective === false);
      let effectiveTopic = rawTopic;
      let conditioned: string | null = null;
      if (wantsConditioning) {
        const directive = await conditionDirective(rawTopic, settings, {
          depth,
          fringe,
          redTeam: !!(config && config.redTeam),
          agentCount: pinnedCount ?? "auto",
        });
        if (directive) {
          conditioned = assembleConditionedTopic(directive, rawTopic);
          effectiveTopic = conditioned;
        }
      }
```

Remove the now-duplicate `if (savedAgents.length < 2) { return res.status(400)... }` inside the `if (roster) {` block.

- [ ] **Step 2: Use the effective topic in both orchestrator prompts**

Line 1292: `RESEARCH REQUEST: "${topic}"${followUpFraming2}` → `RESEARCH REQUEST: "${effectiveTopic}"${followUpFraming2}`.
Line 1399: `RESEARCH REQUEST: "${topic}"${followUpFraming}` → `RESEARCH REQUEST: "${effectiveTopic}"${followUpFraming}`.
The `console.log(\`Assembling ...for topic: "${topic}"` line: change `"${topic}"` to `"${rawTopic.slice(0, 120)}"${conditioned ? " [conditioned]" : ""}`.

- [ ] **Step 3: Return the directive**

Line 1388: `return res.json({ agents: rosterAgents, needAnalysis: rosterNeedAnalysis });` → `return res.json({ agents: rosterAgents, needAnalysis: rosterNeedAnalysis, rawTopic, ...(conditioned ? { directive: conditioned } : {}) });`
Line 1569: `res.json({ agents: cleanAgents, needAnalysis });` → `res.json({ agents: cleanAgents, needAnalysis, rawTopic, ...(conditioned ? { directive: conditioned } : {}) });`

- [ ] **Step 4: Persistence carries rawTopic**

In `/api/research/synthesize-stream`: destructure `rawTopic` from `req.body`; `const title = typeof rawTopic === "string" && rawTopic.trim() ? rawTopic : topic;`; the run dir uses `slugify(title)`; `inputs.json` JSON gains `rawTopic: title`; `meta.json` JSON gains `rawTopic: title`.

- [ ] **Step 5: Lint, verify, commit**

Run: `npm run lint`. Expected: exit 0.

Verify with curl against the running server (uses the orchestrator model from `.env` keys; spends one call):

```bash
curl -s -X POST http://localhost:3369/api/research/initiate -H "Content-Type: application/json" -d '{"topic":"Best open-weight LLM under 14B parameters for tool-calling on a single 24GB GPU as of this month","settings":{},"config":{"agentCount":3,"depth":"recon"}}' | python3 -c "import json,sys; d=json.load(sys.stdin); print(list(d.keys())); print(len(d.get('directive','').split()),'directive words'); print(d.get('directive','')[:1500])"
```

Expected: keys include `agents`, `needAnalysis`, `rawTopic`, `directive`; the directive has every required header and ends with the AUTHORITATIVE CONTEXT fence followed by the topic sentence. Then the same call with `"conditionDirective":false` in config: no `directive` key.

```bash
git add server.ts
git commit -m "feat(server): run the directive conditioner in initiate; persist rawTopic with runs"
```

---

### Task 5: Phase 1 client — types, toggle, session wiring, titles

**Files:**
- Modify: `src/types.ts` (`SwarmConfig`, `ResearchSession`, new `sessionTitle` helper)
- Modify: `src/App.tsx` (config parse ~590-605, toggle JSX after Red Team block ~400, `handleInitiateResearch` ~1068-1160, `runSynthesis` payload ~1621, relaunch/restore sites 1199, 1216, 1223, 2090, 2091, 2101, 2243, 2330, 2771, 3028, 3272, 3274, 695, 905)
- Modify: `src/components/ClaimAtlas.tsx:147`, `src/components/KnowledgeLibrary.tsx:70,78`, `src/lib/dossier.tsx:238,395`

**Interfaces:**
- Produces: `SwarmConfig.conditionDirective?: boolean`, `ResearchSession.rawTopic?: string`, `export const sessionTitle = (s: { topic: string; rawTopic?: string }) => s.rawTopic ?? s.topic;` in `src/types.ts`.

- [ ] **Step 1: Types**

In `SwarmConfig` add after `rosterMode?: boolean;`:

```ts
  // Directive Conditioner: expand the topic into a full research directive
  // (primary question, epistemic categories, coverage, failure modes,
  // deliverables, research behaviour, success condition) before launch. The
  // user's input is kept verbatim beneath it. Default on; false bypasses.
  conditionDirective?: boolean;
```

In `ResearchSession` add after `topic: string;`:

```ts
  // The topic exactly as the user typed it. When the Directive Conditioner
  // ran, `topic` holds the full conditioned directive (what every pipeline
  // call sends) and this holds the short original for titles and relaunch.
  rawTopic?: string;
```

At the end of `src/types.ts`:

```ts
// Display title for a session: the user's original topic when the
// Directive Conditioner expanded it, else the topic itself.
export const sessionTitle = (s: { topic: string; rawTopic?: string }): string => s.rawTopic ?? s.topic;
```

- [ ] **Step 2: Config parse and default**

In the `useState<SwarmConfig>` initializer, add to the returned object: `conditionDirective: parsed.conditionDirective !== false,` and change the fallback to `return { agentCount: "auto", depth: "standard", conditionDirective: true };`.

- [ ] **Step 3: Toggle**

Add `const CONDITIONER_HEX = "#f59e0b";` next to `FRINGE_HEX`. After the Red Team toggle `</div>` (before the component's closing `</div>`), add:

```tsx
      {/* Directive Conditioner toggle */}
      <div className={compact ? "mt-3" : "mt-4"}>
        <button
          onClick={() => onChange({ ...config, conditionDirective: config.conditionDirective === false })}
          className="w-full flex items-center justify-between gap-3 bg-bg-surface border border-border-warm hover:border-border-hi-warm rounded-lg px-3 py-2 transition-all cursor-pointer"
          title="Expand the topic into a full research directive before the swarm launches"
        >
          <div className="flex items-center gap-2 min-w-0 text-left">
            <Sparkles
              className="w-3.5 h-3.5 flex-shrink-0 transition-colors"
              style={{ color: config.conditionDirective !== false ? CONDITIONER_HEX : undefined }}
            />
            <div className="min-w-0">
              <div
                className="text-[9px] font-mono uppercase tracking-widest font-bold transition-colors"
                style={{ color: config.conditionDirective !== false ? CONDITIONER_HEX : undefined }}
              >
                Directive Conditioner
              </div>
              {!compact && (
                <div className="text-[9px] font-mono text-text-muted mt-0.5">
                  Expand the topic into a full research directive before launch
                </div>
              )}
            </div>
          </div>
          <span
            className={`relative w-9 h-5 rounded-full flex-shrink-0 transition-colors ${config.conditionDirective !== false ? "" : "bg-border-warm"}`}
            style={config.conditionDirective !== false ? { background: CONDITIONER_HEX } : undefined}
          >
            <span
              className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-text-primary transition-transform"
              style={{ transform: config.conditionDirective !== false ? "translateX(16px)" : "translateX(0)" }}
            />
          </span>
        </button>
      </div>
```

- [ ] **Step 4: Initiate wiring**

In `handleInitiateResearch`, `newSession` gains `rawTopic: searchTopic,`. After `const data = await response.json();` add:

```ts
      // Directive Conditioner result: the conditioned directive becomes the
      // topic every downstream call sends; rawTopic keeps the short title.
      const conditioned: string = typeof data.directive === "string" && data.directive.trim() ? data.directive : "";
      if (conditioned) {
        const inWords = searchTopic.trim().split(/\s+/).filter(Boolean).length;
        const outWords = conditioned.split(/\s+/).filter(Boolean).length;
        addLog("ORCHESTRATOR", `DIRECTIVE CONDITIONER: expanded ${inWords.toLocaleString()} → ${outWords.toLocaleString()} words.`, "system");
        addLog("ORCHESTRATOR", conditioned, "info");
        setSession(prev => prev ? { ...prev, topic: conditioned, rawTopic: searchTopic } : null);
      } else if (!priorContext && swarmConfig.conditionDirective !== false) {
        addLog("ORCHESTRATOR", "Directive Conditioner fell back to the raw topic (see server log).", "warning");
      }
```

In `runSynthesis` payload add `rawTopic: currentSession.rawTopic,`.

- [ ] **Step 5: Titles and relaunch**

Import `sessionTitle` from `./types` in `src/App.tsx`, `src/components/ClaimAtlas.tsx`, `src/components/KnowledgeLibrary.tsx`, `src/lib/dossier.tsx` (match each file's existing import path for types).

Replace:
- `App.tsx:695` `session.topic.toLowerCase()` → `sessionTitle(session).toLowerCase()`
- `App.tsx:905` `${session.topic} - Consolidated Synthesis` → `${sessionTitle(session)} - Consolidated Synthesis`
- `App.tsx:1199` `parentTopic: session.topic,` → `parentTopic: sessionTitle(session),`
- `App.tsx:1216` `"${watched.topic}"` → `"${sessionTitle(watched)}"`
- `App.tsx:1223` `parentTopic: watched.topic,` → `parentTopic: sessionTitle(watched),`
- `App.tsx:2090` `setTopic(hist.topic);` → `setTopic(sessionTitle(hist));`
- `App.tsx:2091`, `:3274` `hist.label || hist.topic` / `s.label || s.topic` → `hist.label || sessionTitle(hist)` / `s.label || sessionTitle(s)`
- `App.tsx:2101` `"{hist.label || hist.topic}"` → `"{hist.label || sessionTitle(hist)}"`
- `App.tsx:2243` `"{session.topic}"` → `"{sessionTitle(session)}"`
- `App.tsx:2330`, `:2771` `handleInitiateResearch(session.topic, session.priorContext)` → `handleInitiateResearch(sessionTitle(session), session.priorContext)`
- `App.tsx:3028` `{session.topic}` → `{sessionTitle(session)}`
- `App.tsx:3272` `setTopic(s.topic);` → `setTopic(sessionTitle(s));`
- `ClaimAtlas.tsx:147` `{session.topic}` → `{sessionTitle(session)}`
- `KnowledgeLibrary.tsx:70` `return s.label || s.topic;` → `return s.label || sessionTitle(s);`
- `KnowledgeLibrary.tsx:78` `if (s.label && s.label !== s.topic) fields.push({ where: "topic", text: s.topic });` → `if (s.label && s.label !== sessionTitle(s)) fields.push({ where: "topic", text: sessionTitle(s) });`
- `dossier.tsx:238` `{session.topic}` → `{sessionTitle(session)}`
- `dossier.tsx:395` `escapeHtml(session.topic)` → `escapeHtml(sessionTitle(session))`

- [ ] **Step 6: Lint, verify, commit**

Run: `npm run lint`. Expected: exit 0.

Verify in the browser pane: the launch panel shows the Directive Conditioner toggle on; initiate a one-sentence topic; the ops log shows the `DIRECTIVE CONDITIONER: expanded` line and the directive text; the session header still shows the one-sentence topic; History lists it by the short title. Toggle off, relaunch, no conditioner lines.

```bash
git add src/types.ts src/App.tsx src/components/ClaimAtlas.tsx src/components/KnowledgeLibrary.tsx src/lib/dossier.tsx
git commit -m "feat(ui): Directive Conditioner toggle, rawTopic titles, conditioned topic wiring"
```

---

### Task 6: Phase 2 — prompt conflict cleanup

**Files:**
- Modify: `server.ts:945` (shared grounding rule), `server.ts:1952` (density mandate opening bullet), `server.ts:1859-1861` (VEX directive).

- [ ] **Step 1: Search honesty**

Replace the bullet:

```
- NEVER claim to have searched, queried, or checked any engine, database, or source yourself. If your report includes a methodology section, it must describe exactly the queries listed above and what they returned — nothing else. Do NOT invent a null ("no coverage", "no results") for a search that was never run.
```

with:

```
- Never describe a search you did not actually run. The LIVE WEB SEARCH RESULTS block lists the searches the research system ran for you; if you have a web search tool of your own, searches you run with it are yours to report, by their exact query. A methodology section describes exactly those searches and what they returned — nothing else. Do NOT invent a null ("no coverage", "no results") for a search that was never run.
```

- [ ] **Step 2: Fringe opening**

Change the DENSITY MANDATE's first bullet to be mode-dependent. Replace:

```
- ANSWER THE PRIMARY QUESTION FIRST: open with the direct answer the user asked for — the pick, the ranking, the verdict — before any background. The user's constraints and technical context CALIBRATE the verdict; they are supporting material, never the headline or the organizing frame.
```

with:

```
${fringe
        ? "- OPEN WITH THE FILE'S STATE: what the evidence currently supports, what it does not, and the strongest open lead — before any background. \"Insufficient to conclude\" is a valid opening. The user's constraints and context CALIBRATE that reading; they are supporting material, never the headline."
        : "- ANSWER THE PRIMARY QUESTION FIRST: open with the direct answer the user asked for — the pick, the ranking, the verdict — before any background. The user's constraints and technical context CALIBRATE the verdict; they are supporting material, never the headline or the organizing frame."}
```

- [ ] **Step 3: VEX authority**

Replace the three bullets under `## 4.5 Red Team Findings & Rebuttals`:

```
- The swarm was subjected to an adversarial red-team review by VEX. Address EVERY material critique raised above.
- For each critique, either (a) rebut it with specific evidence drawn from the specialist reports, or (b) concede it and explicitly adjust the affected conclusions elsewhere in this synthesis.
- Do NOT ignore any LOW-confidence verdict: where a specialist report was rated Low reliability, state plainly how that constrains the overall confidence of this synthesis.
```

with:

```
- VEX reviewed each specialist report WITHOUT web access. Critiques are internal consistency checks on the evidence as written — they are not new evidence and do not outrank a sourced finding.
- Address each material critique in one of three ways: (a) rebut it with specific evidence from the specialist reports; (b) concede it and adjust the affected conclusions elsewhere in this synthesis; or (c) note that it raises a question this sweep did not test, and carry it into the follow-up recommendations. A critique with no evidence behind it earns (c), not a concession.
- Where VEX rated a specialist report Low reliability, state plainly how that bounds the confidence of the conclusions that depend on it.
```

- [ ] **Step 4: Lint, commit**

Run: `npm run lint`. Expected: exit 0.

```bash
git add server.ts
git commit -m "prompts: resolve search-honesty, fringe-verdict and VEX-authority conflicts"
```

---

### Task 7: Docs and handoff

**Files:**
- Modify: `README.md` (API Reference rows for `initiate` and `synthesize-stream`), `HANDOFF.md` (new top entry), `docs/superpowers/plans/2026-10-08-directive-conditioner.md` (tick boxes).

- [ ] **Step 1: README API rows**

In the API Reference table, extend the `POST /api/research/initiate` row's response description with `rawTopic` and `directive` (present when the Directive Conditioner ran), and the `POST /api/research/synthesize-stream` row's request with optional `rawTopic`. Add a short "Directive Conditioner" paragraph under the pipeline description: what it does, that it is a launch-panel toggle defaulting on, and that the original input is appended verbatim.

- [ ] **Step 2: HANDOFF.md**

Add a dated entry at the top following the existing format: Done (the four commits), In flight (none), Next (run a real deep swarm with the conditioner on and compare against the LIMEN run; then decide on multi-pass synthesis), Watch out (conditioner adds one orchestrator-model call per fresh run; `runs/` pairs before today are the double-fire, not two user runs).

- [ ] **Step 3: Commit**

```bash
git add README.md HANDOFF.md docs/superpowers/plans/2026-10-08-directive-conditioner.md
git commit -m "docs: README API rows, HANDOFF entry for directive conditioner"
```
