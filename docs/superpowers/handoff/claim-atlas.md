# Handoff: Claim Atlas (interactive evidence graph)

Date: 2026-07-19
Branch: `worktree-agent-a5d705d6579e96671` (fast-forwarded to main `0ba076f` — includes Fringe Mode + War Room — before feature work began)

## What this feature is

A post-run "who stands behind what" view for a completed research session. One LLM
extraction pass distills the specialists' reports into 8-20 major factual claims;
each claim records which agents' reports support it, which dispute it, and 1-4
cited sources. The result renders as a full-screen SVG graph: agents on the
perimeter, claims in a themed grid in the middle, solid agent-colored edges for
support, dashed red (`#ef4444`) edges for dispute. Clicking a claim opens a side
panel with the full text, supporter/disputer rosters, and sources.

## File-by-file

### `src/types.ts`
- New `AtlasClaim` interface: `{ id, text, theme, supporters, disputers, sources }`.
  `supporters`/`disputers` are agent ids from the same session; `sources` are URLs
  or plain source names as the reports cited them.
- `ResearchSession.claimAtlas?: AtlasClaim[]` — populated on demand the first time
  the Atlas is opened, then reused (it round-trips through localStorage history
  like `leads` and `critiques` do).

### `server.ts`
- New endpoint `POST /api/research/extract-claims` (section comment `3.6`, placed
  after the Red Team endpoint). Plain JSON, not SSE.
- Body: `{ reports: [{agentId, agentName, agentRole, report}], synthesizedReport, settings }`.
- Input bounding: each report sliced to 8,000 chars, synthesis to 10,000 — slices
  rather than rejects so extraction always runs even on deep-depth sessions.
- Uses `generateUnifiedJSON("orchestrator", ...)` with a `Type.OBJECT` response
  schema, modeled directly on the `/api/research/extract-leads` pattern.
- Sanitization decisions worth knowing:
  - Claim ids are **reissued** sequentially (`claim-1...claim-N`) regardless of
    model output — unlike leads, claims never carry across sessions, so stable
    unique ids beat preserving model ids.
  - Supporter/disputer entries that aren't valid agent ids are mapped back from
    agent *names* (case-insensitive) when possible — several models emit names
    where ids were requested — otherwise dropped.
  - Claims with zero supporters AND zero disputers are dropped (no edges = not
    renderable in the graph).
  - Cap: 24 claims, 4 sources per claim, sources deduped.

### `src/components/ClaimAtlas.tsx` (new, self-contained)
- Props: `{ session, atlas, getAgentColorHex, onClose }`.
- Overlay chrome follows `ReaderMode.tsx`: `fixed inset-0 z-50 bg-bg-primary`,
  h-14 top bar, Esc-to-close listener, X button. The dotted-grid backdrop is
  copied from `SwarmNetwork.tsx` (house style).
- Layout is deterministic (no physics): fixed `viewBox 1200x800`; agents on an
  ellipse (rx 520 / ry 330) starting at 12 o'clock, same angle formula as
  SwarmNetwork; claims in a centered grid whose column count steps with volume
  (≤8 claims → 2 cols, ≤15 → 3, else 4) so 10 claims don't sprawl and 24 fit
  inside the ring.
- Themes: order of first appearance drives both the tint (from `THEME_PALETTE`,
  deliberately not the agent palette) and the grid sort (same-theme claims sit
  adjacent = the "grouping"). A theme legend sits bottom-left; an edge legend
  (solid = supports, dashed red = disputes) sits in the top bar.
- Selection model: click a claim to select (its edges go to 0.95 opacity,
  everything else recedes to 0.06; uninvolved agents dim), click again / click
  empty canvas / panel X to deselect. Unselected state: support edges 0.3,
  dispute edges 0.55 (disputes deliberately pop), agents with no edges at all
  render dimmed.
- Claim text renders as at most two ellipsized SVG text lines via a rough
  char-budget wrapper (`wrapTwoLines`) — deterministic, no text measurement.
  A small red dot on a claim's top-right corner marks "has disputers".
- Side panel: sources that look like URLs (`^https?://`) render as links with
  `target="_blank" rel="noopener noreferrer"`; everything else renders as text.

### `src/App.tsx`
- Imports: `Network` (lucide), `ClaimAtlas`, `AtlasClaim`.
- State: `showAtlas`, `extractingAtlas` (declared next to `showReader`).
- `handleOpenAtlas` (placed after `handlePrintDossier`): if `session.claimAtlas`
  exists → open immediately; else POST `/api/research/extract-claims` with all
  agents that have a `report`, persist via `setSession` + `saveToHistory` (the
  exact pattern leads/critiques use), then open. Failures `addLog(..., "warning")`
  and leave the UI untouched — retry is just another click. The `setSession`
  after extraction is an id-guarded functional update: if the user restored a
  different session from the Knowledge Library while extraction was in flight,
  the stale result must not clobber live state (history, keyed by id, is safe
  either way).
- Toolbar: an icon button (Network icon) in the completed-session results
  toolbar, immediately after the Reader Mode (BookOpenText) button. While
  extracting it shows `RefreshCw` with `animate-spin` and is disabled.
- Overlay rendered next to the ReaderMode overlay block, gated on
  `showAtlas && session?.claimAtlas?.length`.

### `README.md`
- Added the `/api/research/extract-claims` row to the API Reference table
  (repo CLAUDE.md requires the table stay current). Note: the pre-existing
  `/api/research/extract-leads` route is *also* missing from that table — left
  alone as out of scope for this change.

## What is untested

**No API keys exist in this environment, so nothing was runtime-tested.**
`npm run lint` (`tsc --noEmit`) passes cleanly — that is the only verification
performed. Specifically unexercised:

- The extraction prompt/schema against any real provider (Gemini native schema
  path AND the prompt-embedded schema path for OpenAI-compatible providers).
- Quality of model output: theme label reuse (the prompt asks for 3-6 themes;
  a model that emits one theme per claim degrades grouping to pure tinting),
  supporter attribution accuracy, source quality.
- The SVG layout at real data volumes (verified only by arithmetic: 24 claims /
  9 agents fit the viewBox; very long agent names may clip slightly at the
  extreme left/right perimeter nodes).
- localStorage round-trip of `claimAtlas` through history restore (follows the
  identical serialization path as `leads`, so risk is low).
- Behavior when a claim references an agent later dismissed from the roster
  (edges/panel rows for unknown ids are skipped by design — untested).

## Manual test steps (human with keys)

1. `npm run dev`, open the app (default port 3369), configure a provider key in
   Settings (or `.env`).
2. Run a small session: pick a sample topic, `agentCount` 3-4, depth "recon",
   approve the team, let it run to `completed`.
3. In the results toolbar (right of the tab strip), hover the button between
   Reader Mode and Print — tooltip should read "Open the Claim Atlas...".
4. Click it. Expect: button swaps to a spinner and disables; activity log shows
   "ATLAS: mapping major claims..."; on success a log line "ATLAS: N claim(s)
   mapped across M specialist report(s)" and the overlay opens.
5. In the overlay verify: agents around the edge with correct colors/initials
   /names; claims in a centered grid, tinted, same-theme claims adjacent; theme
   legend bottom-left; solid colored edges; dashed red edges only where a
   dispute exists (red dot on those claims); dispute count in the top-bar legend.
6. Click a claim: its edges highlight, others fade, side panel shows full text,
   supporters, disputers, sources (URLs clickable, open in new tab). Click empty
   canvas → deselects. Esc → closes overlay.
7. Reopen via the button — must open instantly with NO new API call (watch the
   server console; no "Extracting claim atlas" line).
8. Reload the page, restore the session from the Knowledge Library, click Atlas
   again — still instant (claimAtlas survived localStorage).
9. Failure path: temporarily break the orchestrator key, run a fresh session,
   click Atlas — expect a warning line "ATLAS: claim extraction failed (...)" in
   the log, no crash, button re-enabled for retry.
10. Volume check: run a "deep" session with 7+ agents and confirm readability at
    the resulting claim count (grid should go to 3-4 columns).
