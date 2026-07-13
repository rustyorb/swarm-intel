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

export interface ResearchSession {
  id: string;
  topic: string;
  timestamp: string;
  agents: Agent[];
  synthesizedReport?: string;
  status: SessionStatus;
  error?: string;
  config?: SwarmConfig;
}
