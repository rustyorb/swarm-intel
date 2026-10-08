# Evidence Policy — design

Date: 2026-10-08. Author: Fable (SCANNING). Decision text from Kyle, verbatim
where it matters.

## Why

Fringe Mode changed the verdict shape (Evidence Docket, open leads,
provenance tags) but the source rubric stayed institutional in every mode:
"10 = official records, peer-reviewed … 3-4 = uncited claims … 0-2 =
known-unreliable", repeated at synthesis as ledger tiers, with every search
query doubled into the news category. The conditioner then inherited the
bias and wrote "relies on anonymous online forums" as a failure-mode signal
and "[community lore] never forms a building-block of the final map" into a
directive that governed the whole swarm. Kyle: "Fringe is a verdict shape.
Evidence policy is a source religion. They got welded once and the rubric
outvoted the costume."

## Decisions

1. **Separate control.** `SwarmConfig.evidencePolicy`:
   `"mainstream-first" | "parity" | "fringe-first"`. A three-detent control in
   the launch panel, independent of the Fringe switch.
2. **Defaulted, not clicked.** Flipping Fringe on sets `fringe-first`;
   flipping it off sets `mainstream-first`. Either can then be knocked to any
   detent without touching Fringe. Parity is the middle detent, never a
   default.
3. **Replace the scale, don't annotate it.** The institutional 0-10 scale and
   the ledger tiers are deleted in every mode. The only axis is **chain of
   custody**: did we get the artifact; is the repost the original; can the
   identifier (contract number, docket, patent, DOI, archive URL) be opened.
   Publisher is context, never the score. The phrase "known-unreliable" is
   gone.
4. **Search mix is code.** The news-category doubling in `gatherLiveContext`
   runs only under `mainstream-first` and `parity`. Under `fringe-first` it is
   off, and the query planner must cover the named lanes: archives/FOIA
   reading rooms, practitioner communities (forums, Discords, mailing lists,
   Substacks, podcasts), primary documents (patents, filings, court records,
   contracts), original-era press. Under `parity` the planner covers those
   lanes AND mainstream press. Under `mainstream-first` behaviour is as today.
5. **The conditioner gets the policy first**, with one forbidden failure
   mode spelled out: "the source is an anonymous forum" is not slippage;
   slippage is a claim with no artifact behind it. Provenance tags describe
   chain of custody, not permission to use: a [community lore] item with a
   recoverable original is evidence.
6. **One line in every prompt** (conditioner, orchestrator, agent, synthesis,
   VEX, interrogation): "The user owns the evidence policy. Apply it. Do not
   substitute your own judgment about which sources deserve weight."
7. **Operator Directives.** A free-text box in Settings, persisted with the
   settings, injected into every prompt above the rubric as standing
   instructions from the user that outrank the defaults. The rubric itself is
   built from the policy so the directives are not fighting it.

## Policy text (server, `EVIDENCE_POLICY_BLOCK(policy)`)

Common to all three:

> EVIDENCE POLICY — {NAME}. The user owns the evidence policy. Apply it. Do
> not substitute your own judgment about which sources deserve weight.
> CHAIN-OF-CUSTODY SCORING (the only credibility axis, 0-10): 10 = you read
> the primary artifact itself (the filing, the scan, the original post, the
> dataset) at a resolvable location; 7-9 = a faithful copy or transcript whose
> original is identified and could be opened; 4-6 = a secondary account that
> names its primary source; 1-3 = a claim with no artifact behind it. Who
> published it is context you may note, never the score. Never label a
> source "unreliable" from memory; score what you actually traced.

Then per policy:

- mainstream-first: institutional and press sources are the spine; practitioner
  and archival material is corroboration. (Today's behaviour, minus the scale.)
- parity: institutional, press, archival, and practitioner sources carry equal
  standing; a claim is strong when independent lanes converge, weak when one
  lane echoes itself, regardless of which lane.
- fringe-first: archival, primary-document, practitioner-community, and
  original-era sources are the spine; mainstream summaries are context and are
  not required. A finding supported by a traced community artifact outranks an
  untraced institutional summary.

## Surfaces

- `server.ts`: `EVIDENCE_POLICY_BLOCK`, `OPERATOR_DIRECTIVES_BLOCK(settings)`;
  `planSearchQueries` takes the policy and requires lanes; `gatherLiveContext`
  takes `newsLane`; `runUniversalStream` gets an options arg carrying the
  policy; conditioner, initiate (both paths), agent-run (`citationRules`
  rewritten), synthesize (ledger rules rewritten), red team, interrogation
  all inject the block and the directives.
- Client: `SwarmConfig.evidencePolicy`, launch-panel control, fringe-toggle
  defaulting, config persistence; `settings.operatorDirectives` with a
  Settings textarea; both already travel on every request.
- README: feature-log row, launch-panel description.

## Testing

Probe: one fringe-first agent run on a fringe topic prints the query plan
(lanes present, no news doubling in the server log) and a report whose scores
cite chain of custody. One mainstream-first run still shows the news lane.
Browser: the control defaults with the Fringe switch and holds an independent
choice; Operator Directives text appears in a conditioner output.
