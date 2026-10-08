export type AgentStatus = "idle" | "working" | "completed" | "failed";

export interface Agent {
  id: string;
  name: string;
  role: string;
  investigativeAngle: string;
  colorTheme: string;
  status: AgentStatus;
  report?: string;
  error?: string;
  // How this agent's run was web-grounded: native provider search, injected
  // SearXNG results, or none (model memory only — treat findings as stale).
  grounding?: { mode: "native" | "injected" | "none"; detail: string };
  // Per-agent model assignment chosen at the approval screen; when unset the
  // global agent model mapping applies.
  modelOverride?: { provider: string; model: string };
  // Generated headshot served from /portraits/<key>.png; absent → pixel avatar.
  portraitUrl?: string;
}

// Real pipeline stage of a running agent, driven by server `stage` SSE
// events. Replaces the simulated progress bar.
export type StageName = "queued" | "planning" | "searching" | "reading" | "reasoning" | "writing" | "done" | "failed";

export interface AgentTelemetry {
  stage: StageName;
  wave?: number;
  pages?: number;
  hits?: number;
  startedAt: number;
  stageSince: number;
  words: number;
  finishedAt?: number;
}

export type SessionStatus = "idle" | "assembling" | "approval" | "researching" | "redteaming" | "synthesizing" | "completed" | "failed";

export interface SwarmConfig {
  // "auto" lets the orchestrator size the swarm from its analysis of the
  // research need; a number pins the count.
  agentCount: number | "auto";
  depth: "recon" | "standard" | "deep";
  redTeam?: boolean;
  // Case-file mode for edge/esoteric/heterodox territory: investigation-native
  // personas, non-mainstream sourcing, Evidence Docket synthesis, open leads.
  fringeMode?: boolean;
  // Draft the swarm exclusively from the user's saved Agent Library — the
  // orchestrator selects (never invents) personas. Default on-the-fly
  // generation is untouched when off.
  rosterMode?: boolean;
  // Directive Conditioner: expand the topic into a full research directive
  // (primary question, epistemic categories, coverage, failure modes,
  // deliverables, research behaviour, success condition) before launch. The
  // user's input is kept verbatim beneath it. Default on; false bypasses.
  conditionDirective?: boolean;
  // Generate a headshot per agent at assembly (Gemini image model, cached
  // per persona on the server). Default on; false bypasses.
  portraits?: boolean;
}

// A reusable specialist persona saved by the user. In Roster Mode the
// orchestrator drafts exclusively from these: identity (id/name/role/color)
// is locked, and only the per-mission assignment is tailored to the topic,
// derived from the persona's standing specialty (investigativeAngle).
export interface SavedAgent {
  id: string;
  name: string;
  role: string;
  investigativeAngle: string;
  colorTheme: string;
  savedAt: string;
  timesDeployed?: number;
  portraitUrl?: string;
}

// A followable investigative thread from a fringe-mode Evidence Docket. The
// case accumulates across follow-up commissions: leads open here are worked
// or closed by later swarms.
export interface Lead {
  id: string;
  text: string;
  status: "open" | "worked" | "dead-end";
}

// A major factual claim distilled from the swarm's reports for the Claim
// Atlas evidence graph. supporters/disputers hold agent ids from this
// session; sources are the URLs or source names the reports cited for it.
export interface AtlasClaim {
  id: string;
  text: string;
  theme: string;
  supporters: string[];
  disputers: string[];
  sources: string[];
}

export interface RedTeamCritique {
  agentId: string;
  agentName: string;
  agentRole: string;
  critique: string;
}

// Condensed context carried into a follow-up run from its parent session, so
// the new swarm builds on established findings instead of re-deriving them.
export interface PriorContext {
  parentSessionId: string;
  parentTopic: string;
  // What the user asked the follow-up to chase (gaps, open questions).
  directive: string;
  // Condensed parent synthesis.
  synthesis: string;
  // Recent interrogation-room exchanges that motivated the follow-up.
  chatExcerpt: string;
  // Open leads carried from the parent case file (fringe mode).
  leads?: Lead[];
  // Sentinel Mode: this follow-up is a DELTA SWEEP — the swarm hunts changes
  // since the prior run instead of extending it, and the synthesis becomes a
  // Delta Briefing.
  delta?: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  respondent: string;        // "panel" or agent id
  respondentName: string;    // "Full Panel" or agent name
  respondentColor?: string;  // agent colorTheme, undefined for panel
  content: string;
  timestamp: string;
}

export interface ResearchSession {
  id: string;
  topic: string;
  // The topic exactly as the user typed it. When the Directive Conditioner
  // ran, `topic` holds the full conditioned directive (what every pipeline
  // call sends) and this holds the short original for titles and relaunch.
  rawTopic?: string;
  timestamp: string;
  // Wall-clock bounds of the run, for the stats strip.
  startedAt?: number;
  completedAt?: number;
  // Orchestrator's diagnosis of what the research need requires — the agents
  // are sprouted from this analysis.
  needAnalysis?: string;
  // Present when this session is a follow-up commissioned from a prior run.
  priorContext?: PriorContext;
  agents: Agent[];
  synthesizedReport?: string;
  status: SessionStatus;
  error?: string;
  config?: SwarmConfig;
  critiques?: RedTeamCritique[];
  chat?: ChatMessage[];
  // Fringe-mode case file: leads extracted from the synthesis docket.
  leads?: Lead[];
  // Catalytic terms: loaded names/symbols that surfaced in reports WITHOUT
  // having been assigned in any investigative angle — the "snowball" the
  // swarm's own post-mortem asked for. Synthesis must address each one.
  catalyticTerms?: { term: string; why: string }[];
  // Sentinel Mode: session is under standing watch — the library offers
  // manual Delta Sweep runs against it (no scheduling; user-triggered only).
  watch?: boolean;
  // Claim Atlas evidence graph, extracted on demand the first time the
  // Atlas overlay is opened for this session (then reused from here).
  claimAtlas?: AtlasClaim[];
  favorite?: boolean;
  tags?: string[];
  label?: string;
}

// Display title for a session: the user's original topic when the
// Directive Conditioner expanded it, else the topic itself.
export const sessionTitle = (s: { topic: string; rawTopic?: string }): string => s.rawTopic ?? s.topic;
