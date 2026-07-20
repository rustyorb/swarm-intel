# Handoff: Sentinel Mode (standing watches with delta briefings)

Date: 2026-07-19
Branch: `worktree-agent-a23b84def323cc22b` (fast-forwarded onto main at `0ba076f` — War Room — before work began, because the spec depends on the fringe `structureBody` ternary introduced in `6fb3182`)

## What this feature is

A completed session in the Knowledge Library can be placed under a **standing watch** ("Sentinel"). A watched session offers a manual **Delta Sweep**: a follow-up commission whose auto-generated directive asks *what has changed since the prior run*. The whole existing follow-up pipeline is reused; a single `delta: true` flag on `PriorContext` flips the server prompts into change-detection mode, and the synthesis becomes a **Delta Briefing** instead of the standard structure. There is deliberately **no scheduling/cron** — sweeps are user-triggered only.

## File-by-file

### `src/types.ts`
- `PriorContext.delta?: boolean` — marks a follow-up as a delta sweep.
- `ResearchSession.watch?: boolean` — session is under standing watch.

Both are optional, so old localStorage archives and imported JSON stay valid with no migration.

### `src/components/KnowledgeLibrary.tsx`
- New props `onToggleWatch(id)` and `onDeltaSweep(session)` threaded through `KnowledgeLibraryProps` → `LibraryCard` (same pattern as `onToggleFavorite`).
- **Sentinel toggle**: a `Radar` icon button in the card's action row, rendered **only for `status === "completed"`** sessions (a sweep needs a settled synthesis to diff against). Teal `#14b8a6` when armed — inline-styled like the fringe chip's `#8b5cf6`, because teal is not in the Tailwind theme palette.
- **WATCHING chip**: teal chip in the depth/nodes chip row when `session.watch` is set (mirrors the FRINGE chip markup exactly).
- **Delta Sweep button**: labeled teal button in the action row, rendered only when `session.watch` is on; calls `onDeltaSweep(session)`.

### `src/App.tsx`
- `toggleWatch(id)` — library mutation helper next to `toggleFavorite`; flips `watch` and persists via `persistHistory`.
- `handleDeltaSweep(watched)` — builds a `PriorContext` the same way `handleLaunchFollowUp` does (synthesis capped at 9000 chars, last-8 chat excerpt, fringe leads carried forward), plus `delta: true` and the auto-generated directive:
  `Delta sweep as of <toDateString()>: what has changed regarding "<topic>" since <session.timestamp>? Focus exclusively on new developments, corrections, and anything that confirms or overturns the prior findings.`
  It guards on `synthesizedReport` being present, closes the library, and calls `handleInitiateResearch(directive, prior)` — the directive is the new session's topic, exactly like a hand-typed follow-up.
- The existing "FOLLOW-UP commission" log line in `handleInitiateResearch` now branches: delta sweeps log "SENTINEL delta sweep — hunting changes..." instead.
- `KnowledgeLibrary` render site passes `onToggleWatch={toggleWatch}` and `onDeltaSweep={handleDeltaSweep}`.

### `server.ts`
New section "Sentinel Mode — delta sweep prompt blocks" (directly after the fringe blocks, same const-per-stage pattern):
- `DELTA_ORCHESTRATOR_DIRECTIVE` — appended to the follow-up framing in `/api/research/initiate` when `priorContext.delta` is truthy: agents must be sprouted as change-detectors over slices of the prior synthesis, not field re-surveyors.
- `DELTA_AGENT_RULES` — appended after the FOLLOW-UP RULES in `/api/research/agent-run-stream`: report ONLY new/changed/corrected material, tag findings NEW/CHANGED/CORRECTED/CONFIRMED, and state "No change detected — <area>" explicitly for stable ground.
- `DELTA_SYNTHESIS_STRUCTURE(topic)` — `# <topic>: Delta Briefing` with sections: 1. Sweep Summary, 2. What's New, 3. What Changed, 4. What Was Overturned, 5. What Stands Confirmed, 6. Watch Items.

In `/api/research/synthesize-stream`, the `structureBody` ternary is now three-way: **delta wins over fringe**, then fringe, then standard. Non-obvious decisions, also noted inline:
- The delta branch renumbers the red-team directive to `## 7` (like fringe renumbers it to `## 8`), so a red-teamed sweep still gets its audit section.
- The delta branch **drops** `followUpSectionDirective` ("Follow-Up Integration") on purpose — sections 2–5 of the briefing *are* the follow-up integration; appending it would duplicate the document's whole purpose.
- Delta detection is `!!(priorContext && priorContext.delta)` in all three endpoints — it rides on `priorContext`, not on `config`, because a sweep is a property of the commission, not a user-facing mode toggle.
- The fringe mission line / style guidelines in the synthesis prompt were left keyed on `fringe` alone; the REQUIRED OUTPUT STRUCTURE block carries the delta intent. A fringe+delta session gets investigative tone with the Delta Briefing structure, which is the intended "delta wins" behavior.

Endpoint console.logs now include the mode (`DELTA-SWEEP` / `, delta`) for traceability.

No new API routes were added (README API table therefore untouched).

## Verified

- `npm run lint` (`tsc --noEmit`): **clean** (baseline was also clean).
- Live UI verification against a dev server on port 3390 with a seeded fake completed session in localStorage:
  - Radar toggle appears only on the completed card; clicking it arms teal state, shows the WATCHING chip and Delta Sweep button, and persists `watch: true` to `research_swarm_history`.
  - Clicking Delta Sweep closes the library, logs "SENTINEL delta sweep...", and POSTs `/api/research/initiate` with `priorContext.delta: true` and the exact spec-format directive (payload captured via fetch intercept).
  - Server logged `Assembling DELTA-SWEEP research swarm for topic: ...` before failing at the provider call — **this environment has no API keys, so nothing past the provider boundary could be runtime-tested.**
  - Test data was cleared and the test server stopped afterward.

## NOT tested (needs a human with keys)

The three delta prompt paths were never executed against a real model. Specifically unverified:
1. Whether the orchestrator actually produces change-hunting agent assignments (vs. generic re-survey roles).
2. Whether agents obey DELTA RULES (deltas only + explicit "no change detected" entries).
3. Whether the synthesis actually emits the six-section Delta Briefing, and how the renumbered `## 7` red-team section renders when Red Team is enabled on a sweep.
4. Fringe + delta combined: Delta Briefing structure with fringe personas/leads carried through, and lead extraction (`/api/research/extract-leads`) running against a Delta Briefing instead of an Evidence Docket — the leads extractor prompt references the docket's "Open Leads" section, which a Delta Briefing does not have; expect it to fall back to carried-lead status updates only. If that proves too lossy, consider mapping "Watch Items" to leads in a follow-up change.

## Manual test steps (human with keys)

1. `npm run dev`, open the app, configure a provider key in Settings (or `.env`).
2. Run any small topic to completion (Recon depth, pinned 3 agents keeps it cheap).
3. Open **Library** → the completed card shows a Radar button in its action row. Click it: card gains a teal WATCHING chip and a teal **Delta Sweep** button; refresh the page and confirm both persist.
4. Click **Delta Sweep**. Expect: library closes, log line "SENTINEL delta sweep — hunting changes since prior mission: ...", and a new assembly whose agent assignments read as "what has changed about X since the prior run".
5. Approve the team and let it run. Each agent report should contain only deltas plus explicit "No change detected — ..." lines.
6. The final synthesis must be titled `<directive>: Delta Briefing` with sections Sweep Summary / What's New / What Changed / What Was Overturned / What Stands Confirmed / Watch Items. (Note the H1 uses the session topic, which for a sweep is the auto-generated directive sentence — verbose but consistent with how follow-ups already title themselves. Flag if it reads too ugly in practice.)
7. Repeat step 4 with **Red Team** enabled → briefing gains `## 7. Red Team Findings & Rebuttals`.
8. Repeat from step 2 with **Fringe Mode** on → sweep should still produce a Delta Briefing (delta wins), with provenance-tagged findings; check the leads panel afterward per the NOT-tested note above.
9. Radar again on the watched card stands the watch down (chip and Sweep button disappear).
