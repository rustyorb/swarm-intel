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
}

// A followable investigative thread from a fringe-mode Evidence Docket. The
// case accumulates across follow-up commissions: leads open here are worked
// or closed by later swarms.
export interface Lead {
  id: string;
  text: string;
  status: "open" | "worked" | "dead-end";
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
  timestamp: string;
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
  // Sentinel Mode: session is under standing watch — the library offers
  // manual Delta Sweep runs against it (no scheduling; user-triggered only).
  watch?: boolean;
  favorite?: boolean;
  tags?: string[];
  label?: string;
}
