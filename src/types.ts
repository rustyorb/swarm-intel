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

export type SessionStatus = "idle" | "assembling" | "approval" | "researching" | "synthesizing" | "completed" | "failed";

export interface SwarmConfig {
  agentCount: number;
  depth: "recon" | "standard" | "deep";
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
  agents: Agent[];
  synthesizedReport?: string;
  status: SessionStatus;
  error?: string;
  config?: SwarmConfig;
  chat?: ChatMessage[];
  favorite?: boolean;
  tags?: string[];
  label?: string;
}
