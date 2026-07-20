# Fringe Mode — Design (approved 2026-07-19)

A Mission Parameters toggle for edge/esoteric/heterodox research (UFO/UAP, occult, hidden history, frontier science, AI-research edges). Flips the pipeline from verdict-oriented reporting to **case-file investigation**: accumulate evidence, log provenance, keep the case open until evidence closes it.

## Scope (Option C, tight)

1. **Toggle** — `fringeMode: boolean` in Mission Parameters UI; rides on every `/api/research/*` request; persists with the session; archived fringe swarms reopen as fringe.
2. **Prompt variants (server.ts)** — when `fringeMode` is set:
   - *Orchestrator*: frames mission analysis as "opening a case file"; sprouts investigation-native archetypes fitted to the topic (FOIA hound, insider-practitioner, historian of heterodoxy, anomaly cataloguer, lore cartographer, frontier-lab watcher).
   - *Agents*: case-file directives — document the territory on its own terms, no reflexive debunking, provenance-tag major claims (primary text / community lore / witness testimony / documented anomaly / official record / verified), end with an **Open Leads** section of specific followable threads.
   - *Synthesis*: **Evidence Docket** shape — Case Status (accumulating / converging / contested / cold), Evidence Catalog, Converging Threads, Contradictions, consolidated Open Leads. "Insufficient to conclude" is a valid status.
3. **Fringe sourcing** — SearXNG path generates archive/patent/preprint/forum/declassified-biased queries plus a couple mainstream baseline queries; native-search providers get equivalent in-prompt sourcing directives; ops log labels grounding "fringe".
4. **Persistent case file** — Open Leads extracted as structured `leads[]` on the session (id, text, status: open/worked/dead-end) via one extra lenient-JSON extraction call after synthesis. Library shows OPEN CASE badge + lead count. Follow-up commissions inject open leads; follow-up synthesis updates lead statuses.
5. **VEX** — in fringe mode becomes *case auditor* (chain of custody, circular citations, single-witness load, contaminated testimony), never topic-level debunker.
6. **Verification** — `npm run lint` clean; live `/api/research/initiate` smoke with fringe on/off comparing persona output; regular mode unchanged when flag off.

## Non-goals
Sentinel/delta machinery, scheduled re-runs, source whitelists/blacklists, fringe-specific UI theme beyond the toggle and badges.
