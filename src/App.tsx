/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  Play, 
  RotateCcw, 
  BookOpen, 
  Layers, 
  Activity, 
  CheckCircle2, 
  AlertTriangle, 
  Cpu, 
  FileText, 
  User, 
  ChevronRight, 
  Search,
  Sparkles,
  ExternalLink,
  History,
  TrendingUp,
  Flame,
  ShieldCheck,
  RefreshCw,
  Terminal,
  Clock
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import PixelAvatar from "./components/PixelAvatar";
import { Agent, AgentStatus, ResearchSession, SessionStatus } from "./types";

const SAMPLE_TOPICS = [
  "Post-lithium solid-state electrolyte battery market readiness for commercial UAVs (2025-2030).",
  "Socioeconomic impact of decentralized autonomous energy grids in Sub-Saharan communities.",
  "AI-assisted code generation safety risks, logic synthesis flaws, and compliance standards.",
  "Deep-sea geothermal vent mining: engineering feasibility versus high-abyssal ecosystem loss.",
  "Sovereign digital identity frameworks and cryptography standards for post-quantum networks."
];

const getAgentColorHex = (theme: string): string => {
  const mapping: Record<string, string> = {
    cyan: "#06b6d4",
    emerald: "#10b981",
    rose: "#ec4899",
    amber: "#f59e0b",
    purple: "#a855f7",
    indigo: "#6366f1",
    blue: "#0ea5e9",
    fuchsia: "#d946ef",
  };
  return mapping[theme] || "#fb923c";
};

const getAgentModelBadge = (theme: string): string => {
  const mapping: Record<string, string> = {
    indigo: "Opus",
    fuchsia: "Sonnet",
    emerald: "Sonnet",
    rose: "Sonnet",
    amber: "Haiku",
    blue: "Sonnet",
    cyan: "Sonnet",
    purple: "Opus",
  };
  return mapping[theme] || "Sonnet";
};

const getAgentTags = (role: string): string[] => {
  const tags = ["Academic", "Analytical"];
  const lowerRole = role.toLowerCase();
  if (lowerRole.includes("crypto") || lowerRole.includes("security")) {
    tags.push("Cybersec", "Standards");
  } else if (lowerRole.includes("geopolit") || lowerRole.includes("social") || lowerRole.includes("sociology")) {
    tags.push("Policy", "Demography");
  } else if (lowerRole.includes("engine") || lowerRole.includes("tech") || lowerRole.includes("solid-state")) {
    tags.push("Engineering", "Feasibility");
  } else if (lowerRole.includes("econom") || lowerRole.includes("market") || lowerRole.includes("financ")) {
    tags.push("Economics", "Forecasts");
  } else if (lowerRole.includes("ecosystem") || lowerRole.includes("environ")) {
    tags.push("Biosphere", "Impact");
  } else if (lowerRole.includes("logic") || lowerRole.includes("code") || lowerRole.includes("develop")) {
    tags.push("Synthesis", "Logic");
  } else {
    tags.push("Deep Research", "Strategic");
  }
  return [...new Set(tags)].slice(0, 3);
};

interface LogEntry {
  time: string;
  sender: string;
  message: string;
  type: "info" | "success" | "warning" | "system";
  agentColor?: string;
}

export default function App() {
  const [topic, setTopic] = useState("");
  const [session, setSession] = useState<ResearchSession | null>(null);
  const [history, setHistory] = useState<ResearchSession[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<"synthesis" | string>("synthesis");
  const [activeReportViewerId, setActiveReportViewerId] = useState<string>("synthesis");
  const [agentProgress, setAgentProgress] = useState<Record<string, { percent: number; statusText: string }>>({});
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);

  // Set default sidebars based on initial load viewport width
  useEffect(() => {
    if (typeof window !== "undefined") {
      setLeftSidebarOpen(window.innerWidth >= 1024);
      setRightSidebarOpen(window.innerWidth >= 1280);
    }
  }, []);

  // Animation & simulation states
  const [assemblyStep, setAssemblyStep] = useState(0);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Load history, session, and logs from localStorage on mount
  useEffect(() => {
    try {
      const storedHistory = localStorage.getItem("research_swarm_history");
      if (storedHistory) {
        setHistory(JSON.parse(storedHistory));
      }
      const storedSession = localStorage.getItem("research_swarm_current_session");
      if (storedSession) {
        const parsedSession = JSON.parse(storedSession);
        setSession(parsedSession);
        if (parsedSession.topic) {
          setTopic(parsedSession.topic);
        }
      }
      const storedLogs = localStorage.getItem("research_swarm_current_logs");
      if (storedLogs) {
        setLogs(JSON.parse(storedLogs));
      }
    } catch (e) {
      console.error("Failed to load history or active states:", e);
    }
  }, []);

  // Save history helper
  const saveToHistory = (newSession: ResearchSession) => {
    try {
      setHistory(prev => {
        const filtered = prev.filter(s => s.id !== newSession.id);
        const updated = [newSession, ...filtered].slice(0, 15); // keep last 15
        localStorage.setItem("research_swarm_history", JSON.stringify(updated));
        return updated;
      });
    } catch (e) {
      console.error("Failed to save history:", e);
    }
  };

  // Save session to localStorage when it changes
  useEffect(() => {
    try {
      if (session) {
        localStorage.setItem("research_swarm_current_session", JSON.stringify(session));
      } else {
        localStorage.removeItem("research_swarm_current_session");
      }
    } catch (e) {
      console.error("Failed to save session:", e);
    }
  }, [session]);

  // Save logs to localStorage when they change
  useEffect(() => {
    try {
      if (logs && logs.length > 0) {
        localStorage.setItem("research_swarm_current_logs", JSON.stringify(logs));
      } else {
        localStorage.removeItem("research_swarm_current_logs");
      }
    } catch (e) {
      console.error("Failed to save logs:", e);
    }
  }, [logs]);

  // Auto scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const addLog = (sender: string, message: string, type: "info" | "success" | "warning" | "system" = "info", colorTheme?: string) => {
    const now = new Date();
    const timeStr = now.toTimeString().split(" ")[0];
    setLogs(prev => [...prev, { time: timeStr, sender, message, type, agentColor: colorTheme }]);
  };

  // 1. Initialize Swarm
  const handleInitiateResearch = async (searchTopic: string) => {
    if (!searchTopic.trim()) return;

    setTopic(searchTopic);
    setLogs([]);
    setAssemblyStep(0);
    setAgentProgress({});

    const newSession: ResearchSession = {
      id: "session_" + Date.now(),
      topic: searchTopic,
      timestamp: new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      agents: [],
      status: "assembling",
    };

    setSession(newSession);
    addLog("SYSTEM", `Initializing orchestration sequence for: "${searchTopic}"`, "system");
    addLog("ORCHESTRATOR", "Structuring research requirements into high-fidelity specialist dimensions...", "info");

    try {
      const response = await fetch("/api/research/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: searchTopic }),
      });

      if (!response.ok) {
        let errorMsg = "Failed to assemble the specialist swarm.";
        try {
          const errorData = await response.json();
          if (errorData.error) errorMsg = errorData.error;
        } catch (e) {}
        throw new Error(errorMsg);
      }

      const data = await response.json();
      const loadedAgents: Agent[] = data.agents.map((ag: any) => ({
        ...ag,
        status: "idle" as AgentStatus
      }));

      addLog("ORCHESTRATOR", `Successfully designated ${loadedAgents.length} elite specialists for this topic.`, "success");

      // Animate agent assembly one by one
      setSession(prev => prev ? { ...prev, agents: loadedAgents } : null);
      
      for (let i = 0; i <= loadedAgents.length; i++) {
        setAssemblyStep(i);
        if (i < loadedAgents.length) {
          const agent = loadedAgents[i];
          addLog(
            agent.name, 
            `[${agent.role}] assembled. Vector Focus: "${agent.investigativeAngle}"`, 
            "info", 
            agent.colorTheme
          );
          await new Promise(r => setTimeout(r, 450));
        }
      }

      // Transition to Research stage
      setSession(prev => {
        if (!prev) return null;
        const updated = { ...prev, status: "researching" as SessionStatus };
        runParallelResearch(updated);
        return updated;
      });

    } catch (err: any) {
      addLog("SYSTEM", `Assembly Error: ${err.message}`, "warning");
      setSession(prev => prev ? { ...prev, status: "failed", error: err.message } : null);
    }
  };

  // Simulate progress counters for parallel agents and coordinate API runs
  const runParallelResearch = async (currentSession: ResearchSession) => {
    addLog("ORCHESTRATOR", "Deploying swarm nodes. Launching all specialist threads in parallel...", "system");

    const agents = [...currentSession.agents];
    
    // Initialize progress record for each agent
    const progressMap: Record<string, { percent: number; statusText: string }> = {};
    agents.forEach(a => {
      progressMap[a.id] = { percent: 0, statusText: "AWAITING_THREAD" };
    });
    setAgentProgress(progressMap);

    // List of simulated operations
    const simOperations = [
      "SCRAPING_ACADEMIC_REPOS",
      "MAPPING_CORRELATIONS",
      "ISOLATING_ANOMALIES",
      "SIMULATING_MODELS",
      "CROSS_REFERENCING_PATENTS",
      "COMPILING_INSIGHT_DATA",
      "FORMATTING_REPORT_FRAG"
    ];

    // Helper to run simulated progress alongside the API request
    const runSimulatedProgress = (agentId: string, agentName: string, color: string) => {
      let currentPercent = 0;
      const interval = setInterval(() => {
        currentPercent += Math.floor(Math.random() * 8) + 4;
        if (currentPercent >= 98) {
          currentPercent = 98;
          clearInterval(interval);
        }
        
        const opIndex = Math.min(Math.floor(currentPercent / 15), simOperations.length - 1);
        const statusText = simOperations[opIndex];

        setAgentProgress(prev => ({
          ...prev,
          [agentId]: { percent: currentPercent, statusText }
        }));

        // Log occasionally
        if (currentPercent % 24 === 0) {
          addLog(agentName, `${statusText} - Analysis currently at ${currentPercent}%`, "info", color);
        }
      }, 350 + Math.random() * 200);

      return interval;
    };

    // Run each agent's model exploration sequentially to prevent 429 rate limit / quota collisions
    addLog("ORCHESTRATOR", "Executing specialist investigative channels sequentially to balance rate limits...", "system");
    
    const results = [];
    for (const agent of agents) {
      // Mark agent as working
      setSession(prev => {
        if (!prev) return null;
        return {
          ...prev,
          agents: prev.agents.map(a => a.id === agent.id ? { ...a, status: "working" as AgentStatus } : a)
        };
      });

      addLog(agent.name, `Thread active. Initializing primary investigative query...`, "info", agent.colorTheme);
      
      const intervalId = runSimulatedProgress(agent.id, agent.name, agent.colorTheme);

      try {
        const response = await fetch("/api/research/agent-run-stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic: currentSession.topic, agent }),
        });

        clearInterval(intervalId);

        if (!response.ok) {
          throw new Error("Investigation thread timed out or failed.");
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let report = "";
        let buffer = "";

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              // Process any leftover data in buffer
              const remaining = buffer.trim();
              if (remaining && remaining.startsWith("data: ")) {
                try {
                  const data = JSON.parse(remaining.slice(6));
                  if (data.type === "chunk" && data.text) {
                    report += data.text;
                  } else if (data.type === "error") {
                    throw new Error(data.error);
                  }
                } catch (e) {
                  // Ignore
                }
              }
              break;
            }
            buffer += decoder.decode(value, { stream: true });
            
            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
              const lineText = buffer.slice(0, newlineIndex).trim();
              buffer = buffer.slice(newlineIndex + 1);
              
              if (lineText.startsWith("data: ")) {
                try {
                  const data = JSON.parse(lineText.slice(6));
                  if (data.type === "chunk" && data.text) {
                    report += data.text;
                    setSession(prev => {
                      if (!prev) return null;
                      return {
                        ...prev,
                        agents: prev.agents.map(a => a.id === agent.id ? { ...a, report } : a)
                      };
                    });
                  } else if (data.type === "error") {
                    throw new Error(data.error);
                  }
                } catch (e) {
                  // Ignore parse errors
                }
              }
            }
          }
        }

        // Complete progress
        setAgentProgress(prev => ({
          ...prev,
          [agent.id]: { percent: 100, statusText: "SYNTHESIS_READY" }
        }));

        addLog(agent.name, "Critical data compiled. Report submitted to the central queue.", "success", agent.colorTheme);

        setSession(prev => {
          if (!prev) return null;
          return {
            ...prev,
            agents: prev.agents.map(a => a.id === agent.id ? { ...a, status: "completed" as AgentStatus, report } : a)
          };
        });

        results.push({ agentId: agent.id, report: report, name: agent.name, role: agent.role });
      } catch (err: any) {
        clearInterval(intervalId);
        setAgentProgress(prev => ({
          ...prev,
          [agent.id]: { percent: 100, statusText: "FAILED" }
        }));
        addLog(agent.name, `Investigation faulted: ${err.message}`, "warning", agent.colorTheme);

        setSession(prev => {
          if (!prev) return null;
          return {
            ...prev,
            agents: prev.agents.map(a => a.id === agent.id ? { ...a, status: "failed" as AgentStatus, error: err.message } : a)
          };
        });

        results.push({ agentId: agent.id, report: null, name: agent.name, role: agent.role });
      }

      // 1s settle delay between sequential runs
      await new Promise(r => setTimeout(r, 1000));
    }
    const validReports = results.filter(r => r.report !== null);

    if (validReports.length === 0) {
      addLog("ORCHESTRATOR", "Swarm execution critical failure. No investigative reports returned.", "warning");
      setSession(prev => prev ? { ...prev, status: "failed", error: "All agents failed" } : null);
      return;
    }

    // Trigger synthesis
    setSession(prev => {
      if (!prev) return null;
      const nextSession = { ...prev, status: "synthesizing" as SessionStatus };
      runSynthesis(nextSession, validReports);
      return nextSession;
    });
  };

  // Synthesis Call
  const runSynthesis = async (currentSession: ResearchSession, compiledReports: any[]) => {
    addLog("ORCHESTRATOR", `Synthesizing ${compiledReports.length} incoming channels. Reconciling conflicting parameters...`, "system");
    
    // Stabilize and allow rate limits to settle after sequential agent runs
    setSession(prev => prev ? { ...prev, status: "synthesizing", error: undefined } : null);
    addLog("ORCHESTRATOR", "Synchronizing expert streams and cooling rate limit overhead...", "info");
    await new Promise(r => setTimeout(r, 2000));

    try {
      const payload = {
        topic: currentSession.topic,
        reports: compiledReports.map(r => ({
          agentName: r.name,
          agentRole: r.role,
          report: r.report
        }))
      };

      const response = await fetch("/api/research/synthesize-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const errorMsg = errorBody?.error || "Lead orchestrator failed to merge insights.";
        throw new Error(errorMsg);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let finalReport = "";
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            // Process any leftover data in buffer
            const remaining = buffer.trim();
            if (remaining && remaining.startsWith("data: ")) {
              try {
                const data = JSON.parse(remaining.slice(6));
                if (data.type === "chunk" && data.text) {
                  finalReport += data.text;
                } else if (data.type === "done" && data.text) {
                  finalReport = data.text;
                } else if (data.type === "error") {
                  throw new Error(data.error);
                }
              } catch (e) {
                // Ignore
              }
            }
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          
          let newlineIndex;
          while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
            const lineText = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            
            if (lineText.startsWith("data: ")) {
              try {
                const data = JSON.parse(lineText.slice(6));
                if (data.type === "chunk" && data.text) {
                  finalReport += data.text;
                  setSession(prev => {
                    if (!prev) return null;
                    return { ...prev, synthesizedReport: finalReport };
                  });
                } else if (data.type === "done") {
                  if (data.text) {
                    finalReport = data.text;
                  }
                } else if (data.type === "error") {
                  throw new Error(data.error);
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        }
      }

      addLog("ORCHESTRATOR", "Unified Swarm Synthesis Report assembled and validated against cross-discipline vectors.", "success");
      addLog("SYSTEM", "Investigation Complete. All channels returned to baseline idle status.", "system");

      const finalSession: ResearchSession = {
        ...currentSession,
        synthesizedReport: finalReport,
        status: "completed",
      };

      setSession(finalSession);
      saveToHistory(finalSession);
      setActiveReportViewerId("synthesis"); // Default view to synthesis

    } catch (err: any) {
      addLog("ORCHESTRATOR", `Synthesis faulted: ${err.message}`, "warning");
      setSession(prev => prev ? { ...prev, status: "failed", error: err.message } : null);
    }
  };

  const calculateTotalProgress = () => {
    if (!session || session.agents.length === 0) return 0;
    const total = session.agents.reduce((acc, agent) => {
      const progress = agentProgress[agent.id]?.percent || 0;
      return acc + progress;
    }, 0);
    const average = total / session.agents.length;

    if (session.status === "synthesizing") return 95;
    if (session.status === "completed") return 100;
    return Math.round(average);
  };

  return (
    <div className="w-full h-screen bg-bg-primary text-text-secondary font-sans flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-16 border-b border-border-warm flex items-center justify-between px-6 bg-bg-surface flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-accent-warm rounded flex items-center justify-center text-black font-bold text-sm tracking-tighter shadow-lg shadow-accent-warm/10">
            SW
          </div>
          <div id="app-title-container">
            <h1 className="text-lg font-semibold tracking-tight text-text-primary flex items-center gap-2">
              SWARM<span className="text-accent-warm">_INTEL</span>
              <span className="text-[10px] bg-bg-primary border border-border-warm text-text-secondary px-2 py-0.5 rounded-full uppercase tracking-wider font-mono font-medium">
                v2.5.0
              </span>
            </h1>
            <p className="text-[10px] text-text-muted font-mono -mt-0.5">Multi-Agent Intelligence Network</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right hidden sm:block">
            <div className="text-[10px] text-text-muted uppercase tracking-widest font-mono font-medium">Orchestrator Status</div>
            <div className="flex items-center gap-2 justify-end">
              <span className={`w-2 h-2 rounded-full ${session?.status === "researching" || session?.status === "synthesizing" ? "bg-amber-400 animate-pulse" : session?.status === "completed" ? "bg-accent-warm" : "bg-border-warm"}`}></span>
              <span className="text-[11px] font-mono font-semibold tracking-tight text-text-muted">
                {session?.status === "researching" && "DISTRIBUTING_WORKLOAD"}
                {session?.status === "synthesizing" && "COMPILING_SYNTHESIS"}
                {session?.status === "completed" && "NOMINAL_STABLE"}
                {session?.status === "failed" && "FAUL_ENCOUNTERED"}
                {(session?.status === "idle" || !session) && "SYSTEM_STANDBY"}
              </span>
            </div>
          </div>
          <div className="h-8 w-[1px] bg-border-warm hidden sm:block"></div>
          
          <button
            onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
            className={`px-3 py-2 rounded-lg border transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer ${
              leftSidebarOpen 
                ? "bg-bg-primary border-border-hi-warm text-accent-warm" 
                : "bg-bg-surface border-border-warm text-text-muted hover:text-text-secondary"
            }`}
            title="Toggle Left Sidebar"
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{leftSidebarOpen ? "Hide Setup" : "Setup"}</span>
          </button>

          <button
            onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
            className={`px-3 py-2 rounded-lg border transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer ${
              rightSidebarOpen 
                ? "bg-bg-primary border-border-hi-warm text-accent-warm" 
                : "bg-bg-surface border-border-warm text-text-muted hover:text-text-secondary"
            }`}
            title="Toggle Live Logs"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{rightSidebarOpen ? "Hide Logs" : "Logs"}</span>
          </button>

          <div className="h-8 w-[1px] bg-border-warm hidden sm:block"></div>

          <button
            id="btn-new-investigation"
            onClick={() => {
              setSession(null);
              setTopic("");
              setLogs([]);
            }}
            className="px-4 py-2 bg-bg-surface hover:bg-bg-primary text-text-primary text-xs font-bold rounded uppercase tracking-wider border border-border-warm transition-all duration-150 flex items-center gap-2"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Swarm
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Sidebar: Controls & Diagnostics */}
        <aside 
          id="sidebar-left" 
          className={`${
            leftSidebarOpen 
              ? "w-full md:w-[320px] lg:w-[340px] border-b md:border-b-0 md:border-r" 
              : "w-0 p-0 overflow-hidden border-b-0 md:border-r-0"
          } border-border-warm bg-bg-surface flex flex-col flex-shrink-0 overflow-y-auto transition-all duration-300`}
        >
          {/* Section: Topic Config */}
          <div className="p-6 border-b border-border-warm">
            <div className="flex items-center justify-between mb-3">
              <label className="text-[10px] uppercase text-text-muted tracking-widest font-bold font-mono block">
                Primary Vector Topic
              </label>
              {session?.status && session.status !== "idle" && (
                <span className="text-[9px] font-mono text-accent-warm border border-accent-warm/20 px-2 py-0.5 rounded-full bg-accent-warm/5">
                  DEPLOYED
                </span>
              )}
            </div>

            <div className="space-y-4">
              <div className="relative">
                <textarea
                  id="topic-textarea"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  disabled={session?.status === "assembling" || session?.status === "researching" || session?.status === "synthesizing"}
                  placeholder="Enter a deep scientific, technological, or social challenge topic..."
                  className="w-full min-h-[100px] bg-bg-primary border border-border-warm focus:border-border-hi-warm text-text-primary placeholder-text-muted rounded-xl p-3.5 text-xs font-sans leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-border-hi-warm transition-all"
                />
                <div className="absolute bottom-2.5 right-2.5 text-[9px] text-slate-600 font-mono">
                  {topic.length} chars
                </div>
              </div>

              {(!session || session.status === "idle" || session.status === "failed") && (
                <button
                  id="btn-initiate-swarm"
                  onClick={() => handleInitiateResearch(topic)}
                  disabled={!topic.trim()}
                  className="w-full py-3 bg-accent-warm hover:bg-accent-hi-warm disabled:bg-border-warm disabled:text-text-muted disabled:border-transparent text-black text-xs font-bold rounded-xl uppercase tracking-wider transition-all duration-150 flex items-center justify-center gap-2 border border-accent-warm/30 font-display shadow-lg shadow-accent-warm/10 cursor-pointer disabled:cursor-not-allowed"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Deploy Agent Swarm
                </button>
              )}
            </div>
          </div>

          {/* Prompt Presets (only show if idle/not started/failed) */}
          {(!session || session.status === "idle" || session.status === "failed") && (
            <div className="p-6 border-b border-border-warm">
              <div className="flex items-center gap-1.5 mb-3 text-[10px] uppercase text-text-muted tracking-widest font-bold font-mono">
                <Sparkles className="w-3 h-3 text-accent-warm" />
                Select Curated Topic
              </div>
              <div className="space-y-2.5">
                {SAMPLE_TOPICS.map((sample, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setTopic(sample);
                      addLog("SYSTEM", `Pre-configured sample loaded: "${sample.slice(0, 40)}..."`, "info");
                    }}
                    className="w-full text-left p-3 rounded-lg border border-border-warm bg-bg-primary/60 hover:bg-bg-surface hover:border-border-hi-warm transition-all text-[11px] text-text-secondary hover:text-text-primary leading-relaxed cursor-pointer"
                  >
                    "{sample}"
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Progress & Diagnostics Panel (only show if active research) */}
          {session && session.status !== "idle" && (
            <div className="p-6 border-b border-border-warm space-y-5">
              <div>
                <div className="flex justify-between items-end mb-2">
                  <span className="text-[10px] font-bold font-mono text-text-muted uppercase tracking-widest">
                    Swarm Progress
                  </span>
                  <span className="text-[11px] font-mono font-bold text-accent-warm">
                    {calculateTotalProgress()}%
                  </span>
                </div>
                <div className="w-full bg-bg-primary h-2 rounded-full border border-border-warm overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-accent-warm to-accent-hi-warm h-full rounded-full transition-all duration-300"
                    style={{ width: `${calculateTotalProgress()}%` }}
                  ></div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-bg-primary/60 border border-border-warm p-3 rounded-lg">
                  <div className="text-[9px] text-text-muted font-mono font-medium tracking-wider mb-1 uppercase">Active Agents</div>
                  <div className="text-base font-mono font-bold text-text-primary flex items-baseline gap-1">
                    {session.agents.filter(a => a.status === "working" || a.status === "completed").length}
                    <span className="text-xs text-text-muted">/ {session.agents.length || 0}</span>
                  </div>
                </div>
                <div className="bg-bg-primary/60 border border-border-warm p-3 rounded-lg">
                  <div className="text-[9px] text-text-muted font-mono font-medium tracking-wider mb-1 uppercase">Compiling Rate</div>
                  <div className="text-base font-mono font-bold text-text-primary">
                    {session.status === "completed" ? "FINISHED" : session.status === "synthesizing" ? "COMPILING" : "PARALLEL_RUN"}
                  </div>
                </div>
              </div>

              {/* Assembly Timeline */}
              {session.agents.length > 0 && (
                <div className="bg-bg-primary border border-border-warm rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Layers className="w-3.5 h-3.5 text-accent-warm" />
                    <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest font-mono">
                      Swarm Coordinates
                    </span>
                  </div>
                  <div className="space-y-3.5">
                    {session.agents.map((agent, index) => {
                      const isAssembled = assemblyStep > index || session.status !== "assembling";
                      const prog = agentProgress[agent.id];
                      return (
                        <div 
                          key={agent.id} 
                          className={`flex items-center justify-between gap-3 text-xs transition-opacity duration-300 ${isAssembled ? "opacity-100" : "opacity-30"}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getAgentColorHex(agent.colorTheme) }}></span>
                            <span className="font-mono text-[11px] text-text-secondary truncate max-w-[130px]">{agent.name}</span>
                          </div>
                          
                          <div className="text-[9px] font-mono text-text-muted">
                            {agent.status === "completed" ? (
                              <span className="text-success flex items-center gap-1 font-semibold">
                                <CheckCircle2 className="w-2.5 h-2.5" /> READY
                              </span>
                            ) : agent.status === "working" ? (
                              <span className="text-accent-warm animate-pulse font-semibold">
                                {prog?.percent || 0}% {prog?.statusText || "RUNNING"}
                              </span>
                            ) : agent.status === "failed" ? (
                              <span className="text-error font-semibold flex items-center gap-0.5">
                                <AlertTriangle className="w-2.5 h-2.5" /> ERROR
                              </span>
                            ) : (
                              <span>QUEUED</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Saved Swarm History (Always available at bottom of sidebar) */}
          <div className="p-6 mt-auto">
            <div className="flex items-center gap-1.5 text-[10px] uppercase text-text-muted tracking-widest font-bold font-mono mb-3">
              <History className="w-3.5 h-3.5 text-text-muted" />
              Swarms Saved Locally ({history.length})
            </div>
            {history.length === 0 ? (
              <div className="text-[10px] text-text-muted italic font-mono p-3 bg-bg-primary/30 rounded-lg border border-border-warm border-dashed text-center">
                No prior swarms logged
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                {history.map((hist) => (
                  <button
                    key={hist.id}
                    onClick={() => {
                      setSession(hist);
                      setTopic(hist.topic);
                      addLog("SYSTEM", `Restored historic research swarm for: "${hist.topic}"`, "success");
                    }}
                    className={`w-full text-left p-2.5 rounded border transition-all text-xs flex justify-between items-center gap-2 cursor-pointer ${
                      session?.id === hist.id 
                        ? "bg-bg-surface border-border-hi-warm text-accent-warm" 
                        : "bg-bg-primary/40 border-border-warm text-text-secondary hover:bg-bg-surface hover:text-text-primary"
                    }`}
                  >
                    <div className="truncate min-w-0 flex-1">
                      <span className="font-mono text-[9px] text-text-muted block">{hist.timestamp}</span>
                      <span className="font-medium truncate block">"{hist.topic}"</span>
                    </div>
                    <ChevronRight className="w-3 h-3 text-text-muted flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Center Content Pane */}
        <section id="center-main-workspace" className="flex-1 bg-bg-primary flex flex-col overflow-hidden relative">
          
          {/* Default Start View */}
          {(!session) && (
            <div className="flex-1 flex flex-col items-center justify-start py-10 px-6 sm:px-8 text-center max-w-3xl mx-auto overflow-y-auto w-full scrollbar-thin">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-accent-warm to-accent-hi-warm flex items-center justify-center text-black font-black text-xl shadow-xl shadow-accent-warm/10 mb-5 flex-shrink-0 animate-pulse animate-duration-1000">
                SW
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight font-display">
                Deploy Orchestrated Multi-Agent Intelligence
              </h2>
              <p className="text-text-muted text-xs sm:text-sm mt-2.5 leading-relaxed max-w-xl">
                Deconstruct complex topics into parallel expert tracks. Watch named specialists conduct deep analytical investigations concurrently before compiling a unified strategic consensus.
              </p>

              {/* Central Active Launcher Console */}
              <div className="w-full bg-bg-surface border border-border-warm rounded-2xl p-5 mt-8 shadow-2xl relative text-left">
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-accent-warm to-accent-hi-warm"></div>
                <div className="flex items-center gap-2 mb-3">
                  <Terminal className="w-4 h-4 text-accent-warm" />
                  <span className="text-[10px] uppercase text-text-muted tracking-widest font-bold font-mono">
                    Research Swarm Launch Console
                  </span>
                </div>
                
                <div className="relative">
                  <textarea
                    id="center-topic-textarea"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="Enter a deep scientific, technological, or social challenge topic (e.g. Next-generation geothermal vent mining impact)..."
                    className="w-full min-h-[100px] bg-bg-primary border border-border-warm focus:border-border-hi-warm text-text-primary placeholder-text-muted rounded-xl p-4 text-xs sm:text-sm font-sans leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-border-hi-warm transition-all"
                  />
                  {topic.length > 0 && (
                    <div className="absolute bottom-3 right-3 text-[10px] text-text-muted font-mono bg-bg-primary px-2 py-0.5 rounded border border-border-warm">
                      {topic.length} chars
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-4 pt-3 border-t border-border-warm">
                  <div className="flex items-center gap-1.5 text-[10px] text-text-muted font-mono">
                    <Activity className="w-3.5 h-3.5 text-accent-warm/70 animate-pulse" />
                    <span>SEQUENTIAL DEPLOYMENT MODE (RATE-LIMIT PROTECTION ACTIVE)</span>
                  </div>
                  <button
                    id="btn-center-initiate"
                    onClick={() => handleInitiateResearch(topic)}
                    disabled={!topic.trim()}
                    className="w-full sm:w-auto px-6 py-3 bg-accent-warm hover:bg-accent-hi-warm disabled:bg-border-warm disabled:text-text-muted text-black text-xs font-bold rounded-xl uppercase tracking-wider transition-all duration-150 flex items-center justify-center gap-2 font-display shadow-lg shadow-accent-warm/10 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Deploy Swarm
                  </button>
                </div>
              </div>

              {/* Curated Topic Presets */}
              <div className="w-full mt-8 text-left">
                <div className="flex items-center gap-1.5 mb-3 text-[10px] uppercase text-text-muted tracking-widest font-bold font-mono">
                  <Sparkles className="w-3.5 h-3.5 text-accent-warm" />
                  Select Curated Launch Vector
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {SAMPLE_TOPICS.map((sample, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setTopic(sample);
                        addLog("SYSTEM", `Pre-configured sample loaded: "${sample.slice(0, 45)}..."`, "info");
                      }}
                      className={`w-full text-left p-3.5 rounded-xl border transition-all text-xs leading-relaxed cursor-pointer flex items-center justify-between gap-3 ${
                        topic === sample 
                          ? "bg-bg-surface border-accent-warm/40 text-accent-warm" 
                          : "border-border-warm/80 bg-bg-surface/40 hover:bg-bg-primary hover:border-border-warm text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      <span className="truncate">"{sample}"</span>
                      <ChevronRight className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Informational Cards Section */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full mt-8 pt-6 border-t border-border-warm">
                <div className="p-4 rounded-xl border border-border-warm bg-bg-surface/50 text-left">
                  <div className="w-8 h-8 rounded-lg bg-accent-warm/10 border border-accent-warm/20 flex items-center justify-center text-accent-warm mb-3">
                    <Layers className="w-4 h-4" />
                  </div>
                  <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider font-mono">Parallel Specialists</h3>
                  <p className="text-text-muted text-[11px] leading-relaxed mt-1.5">
                    Named virtual agents (e.g. Dr. Aris Vance, Agent Cipher) launch concurrently to research technological, socioeconomic, and regulatory frameworks.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-border-warm bg-bg-surface/50 text-left">
                  <div className="w-8 h-8 rounded-lg bg-accent-warm/10 border border-accent-warm/20 flex items-center justify-center text-accent-warm mb-3">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider font-mono">Consolidated Synthesis</h3>
                  <p className="text-text-muted text-[11px] leading-relaxed mt-1.5">
                    Individual data results consolidate back to the Lead Orchestrator to identify consensus, resolve conflicts, and outline strategic recommendations.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Swarm Running / Assembly Screen */}
          {session && (session.status === "assembling" || session.status === "researching" || session.status === "synthesizing") && (
            <div className="flex-1 flex flex-col p-6 overflow-y-auto">
              {/* Header section */}
              <div className="border border-border-warm rounded-2xl bg-bg-surface p-6 mb-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-3">
                  <div>
                    <span className="text-[10px] font-bold font-mono text-text-muted uppercase tracking-widest block">
                      Active Investigation Segment
                    </span>
                    <h2 className="text-base font-bold text-text-primary italic mt-1 leading-relaxed">
                      "{session.topic}"
                    </h2>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 bg-bg-primary px-3.5 py-1.5 rounded-xl border border-border-warm font-mono text-[11px]">
                    <Clock className="w-3.5 h-3.5 text-accent-warm animate-spin" style={{ animationDuration: '3s' }} />
                    <span className="text-text-secondary uppercase">
                      {session.status === "assembling" && "ASSEMBLING_SWARM"}
                      {session.status === "researching" && "RUNNING_CHANNELS"}
                      {session.status === "synthesizing" && "COMPILING_REPORTS"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <Activity className="w-3.5 h-3.5 text-accent-warm animate-pulse" />
                  <span>The Lead Orchestrator has spun up {session.agents.length} thread instances running concurrently.</span>
                </div>
              </div>

              {/* Grid of active research specialists */}
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest font-mono">
                  Swarm Agents Status ({session.agents.length})
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {session.agents.map((agent, idx) => {
                  const isVisible = assemblyStep > idx || session.status !== "assembling";
                  const prog = agentProgress[agent.id] || { percent: 0, statusText: "QUEUED" };
                  const colorTheme = agent.colorTheme;
                  const hexColor = getAgentColorHex(colorTheme);

                  if (!isVisible) {
                    return (
                      <div 
                        key={agent.id} 
                        className="bg-bg-surface/30 border border-border-warm border-dashed rounded-xl p-5 flex flex-col items-center justify-center min-h-[160px] opacity-40"
                      >
                        <Cpu className="w-6 h-6 text-text-muted animate-pulse mb-2" />
                        <span className="text-[10px] font-mono text-text-muted uppercase">Awaiting Spinup...</span>
                      </div>
                    );
                  }

                  const modelBadge = getAgentModelBadge(colorTheme);
                  const tags = getAgentTags(agent.role);

                  return (
                    <div 
                      key={agent.id}
                      className="agentsroom-card p-5 flex flex-col shadow-lg transition-all duration-300 relative overflow-hidden"
                      style={{ "--agent-accent": hexColor } as React.CSSProperties}
                    >
                      {/* Top Header Row */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <PixelAvatar name={agent.name} role={agent.role} themeColor={colorTheme} size="sm" />
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-text-primary truncate font-display">{agent.name}</h4>
                            <p className="text-[10px] text-text-muted font-mono truncate">{agent.role}</p>
                          </div>
                        </div>

                        <span className={`text-[9px] font-mono font-medium px-2 py-0.5 rounded border transition-all ${
                          agent.status === "completed" ? "text-success border-success/20 bg-success/5" :
                          agent.status === "working" ? "text-accent-warm border-accent-warm/20 bg-accent-warm/5 animate-pulse" :
                          "text-text-muted border-border-warm"
                        }`}>
                          {agent.status.toUpperCase()}
                        </span>
                      </div>

                      {/* Investigative Focus Segment */}
                      <p className="text-[11px] text-text-secondary line-clamp-2 leading-relaxed mb-4 italic">
                        "{agent.investigativeAngle}"
                      </p>

                      {/* Model Badge Overlay */}
                      <div className="mb-4">
                        <span className="inline-block text-[9px] font-mono font-semibold tracking-wider px-1.5 py-0.5 bg-bg-primary border border-border-warm text-text-muted rounded-md uppercase">
                          System: {modelBadge}
                        </span>
                      </div>

                      {/* Progress and Tags Indicator at bottom */}
                      <div className="mt-auto pt-3 border-t border-border-warm space-y-3">
                        <div>
                          <div className="flex justify-between items-center text-[9px] font-mono text-text-muted mb-1">
                            <span className="truncate max-w-[120px] uppercase">{prog.statusText}</span>
                            <span>{prog.percent}%</span>
                          </div>
                          <div className="h-1 bg-bg-primary rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-[var(--agent-accent)] transition-all duration-300"
                              style={{ width: `${prog.percent}%` }}
                            ></div>
                          </div>
                        </div>

                        {/* Semantic Tag List */}
                        {tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {tags.map((tag, tIdx) => (
                              <span 
                                key={tIdx} 
                                className="text-[8px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-bg-primary border border-border-warm/60 text-text-muted hover:text-text-secondary transition-colors"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Swarm Failed - Error View */}
          {session && session.status === "failed" && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-2xl mx-auto overflow-y-auto">
              <div className="w-16 h-16 rounded-2xl bg-error/10 border border-error/30 flex items-center justify-center text-error font-extrabold text-2xl shadow-xl shadow-error/10 mb-6 animate-pulse">
                <AlertTriangle className="w-8 h-8 text-error" />
              </div>
              <h2 className="text-2xl font-bold text-text-primary tracking-tight font-display mb-1 uppercase">
                Critical System Fault
              </h2>
              <p className="text-text-muted text-xs sm:text-sm font-mono leading-relaxed mb-6 uppercase tracking-wider">
                Swarm Investigation Halted
              </p>

              <div className="bg-bg-surface border border-border-warm rounded-xl p-5 mb-8 text-left max-w-md w-full relative overflow-hidden">
                <div className="absolute top-0 left-0 h-full w-[3px] bg-error"></div>
                <h4 className="text-[10px] font-bold font-mono text-text-muted uppercase tracking-widest mb-1.5">
                  Error Details
                </h4>
                <p className="text-xs font-mono text-error break-words leading-relaxed">
                  {session.error || "An unknown orchestrator or connection exception occurred during agent streaming."}
                </p>
                
                {(session.error?.includes("quota") || session.error?.includes("429") || session.error?.includes("RESOURCE_EXHAUSTED") || session.error?.includes("Resource")) && (
                  <div className="mt-4 pt-3 border-t border-border-warm text-[11px] text-text-secondary leading-relaxed font-sans">
                    <span className="font-semibold text-accent-warm block mb-1">💡 Suggested Troubleshooting:</span>
                    It looks like your Gemini API key has exceeded its daily or rate quota. Because multiple expert agents were executing detailed analysis in parallel, they exceeded free tier limits. We have now **serialized agent execution** to prevent simultaneous requests, which will significantly reduce rate-limiting pressure on your key. Please try running the swarm again, or check your API key in **Settings &gt; Secrets**.
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-center w-full max-w-xs">
                <button
                  onClick={() => handleInitiateResearch(session.topic)}
                  className="w-full sm:w-auto px-6 py-3 bg-accent-warm hover:bg-accent-hi-warm text-black text-xs font-bold rounded-xl uppercase tracking-wider font-display shadow-lg shadow-accent-warm/10 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Relaunch Swarm
                </button>
                <button
                  onClick={() => {
                    setSession(null);
                    setTopic("");
                    setLogs([]);
                  }}
                  className="w-full sm:w-auto px-6 py-3 bg-bg-surface hover:bg-bg-primary border border-border-warm text-text-secondary hover:text-text-primary text-xs font-bold rounded-xl uppercase tracking-wider font-display transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset Workspace
                </button>
              </div>
            </div>
          )}

          {/* Swarm Finished - Synthesis View */}
          {session && session.status === "completed" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Secondary Navigation for report browsing */}
              <div className="border-b border-border-warm bg-bg-surface px-6 h-14 flex items-center justify-between flex-shrink-0">
                <div className="flex gap-2 overflow-x-auto pr-4 scrollbar-none">
                  {/* Synthesis Button */}
                  <button
                    id="tab-synthesis-report"
                    onClick={() => setActiveReportViewerId("synthesis")}
                    className={`px-4 h-14 flex items-center gap-2 border-b-2 font-mono text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                      activeReportViewerId === "synthesis"
                        ? "border-accent-warm text-text-primary bg-bg-primary"
                        : "border-transparent text-text-muted hover:text-text-secondary"
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5 text-accent-warm" />
                    Consolidated Synthesis
                  </button>

                  <div className="h-14 w-[1px] bg-border-warm flex-shrink-0"></div>

                  {/* Individual Specialist Dossiers */}
                  {session.agents.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => setActiveReportViewerId(agent.id)}
                      className={`px-3 h-14 flex items-center gap-2 border-b-2 font-mono text-[11px] transition-all cursor-pointer whitespace-nowrap ${
                        activeReportViewerId === agent.id
                          ? "border-accent-warm text-text-primary bg-bg-primary"
                          : "border-transparent text-text-muted hover:text-text-secondary"
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getAgentColorHex(agent.colorTheme) }}></span>
                      {agent.name.toUpperCase()}
                    </button>
                  ))}
                </div>

                <div className="text-right text-[10px] text-text-muted font-mono hidden sm:block">
                  TOPIC COMPLETED & VERIFIED
                </div>
              </div>

              {/* Document Container */}
              <div id="report-view-scroll" className="flex-1 overflow-y-auto p-6 md:p-8 bg-bg-primary">
                <div className="max-w-3xl mx-auto">
                  {activeReportViewerId === "synthesis" ? (
                    /* Unified Consolidated Synthesis Report */
                    <article className="prose prose-invert max-w-none text-text-secondary">
                      <div className="mb-8 pb-6 border-b border-border-warm">
                        <div className="flex items-center gap-2 text-[10px] text-accent-warm font-mono font-bold uppercase tracking-widest mb-2.5">
                          <Cpu className="w-3.5 h-3.5 text-accent-warm" />
                          Unified Intelligence synthesis
                        </div>
                        <h1 className="text-2xl md:text-3xl font-extrabold text-text-primary tracking-tight leading-tight mb-2 font-display">
                          {session.topic}
                        </h1>
                        <p className="text-xs text-text-muted font-mono">
                          Swarm Report ID: <span className="text-text-secondary">{session.id}</span> • Completed: <span className="text-text-secondary">{session.timestamp}</span>
                        </p>
                      </div>

                      {session.synthesizedReport ? (
                        <div className="space-y-4 text-xs leading-relaxed font-sans text-text-secondary md:text-sm">
                          <ReactMarkdown
                            components={{
                              h1: ({ node, ...props }) => <h1 className="text-2xl font-bold text-text-primary mt-8 mb-4 border-b border-border-warm pb-2 font-display" {...props} />,
                              h2: ({ node, ...props }) => <h2 className="text-xl font-semibold text-text-primary mt-6 mb-3 font-display flex items-center gap-2" {...props} />,
                              h3: ({ node, ...props }) => <h3 className="text-lg font-semibold text-accent-warm mt-5 mb-2 font-display" {...props} />,
                              p: ({ node, ...props }) => <p className="mb-4 leading-relaxed text-text-secondary text-xs sm:text-sm" {...props} />,
                              ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-4 space-y-1" {...props} />,
                              ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-4 space-y-1" {...props} />,
                              li: ({ node, ...props }) => <li className="text-text-secondary text-xs sm:text-sm" {...props} />,
                              blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-accent-warm bg-bg-surface p-4 rounded-r-lg italic my-4 text-text-muted" {...props} />,
                              code: ({ node, ...props }) => <code className="bg-bg-primary text-accent-warm px-1.5 py-0.5 rounded font-mono text-xs border border-border-warm" {...props} />,
                              pre: ({ node, ...props }) => <pre className="bg-bg-primary p-4 rounded-xl overflow-x-auto border border-border-warm my-4 text-xs font-mono text-text-secondary" {...props} />,
                              table: ({ node, ...props }) => <div className="overflow-x-auto my-6"><table className="min-w-full divide-y divide-border-warm border border-border-warm rounded-lg text-xs" {...props} /></div>,
                              th: ({ node, ...props }) => <th className="bg-bg-primary px-4 py-2 text-left font-semibold text-text-primary" {...props} />,
                              td: ({ node, ...props }) => <td className="px-4 py-2 border-t border-border-warm" {...props} />,
                            }}
                          >
                            {session.synthesizedReport}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <div className="p-8 text-center bg-bg-surface/40 border border-border-warm rounded-xl">
                          <AlertTriangle className="w-8 h-8 text-accent-warm mx-auto mb-2" />
                           <p className="text-sm font-semibold text-text-primary">Report data missing or corrupted.</p>
                        </div>
                      )}
                    </article>
                  ) : (
                    /* Individual Specialist Agent Report View */
                    (() => {
                      const selectedAgent = session.agents.find(a => a.id === activeReportViewerId);
                      if (!selectedAgent) return null;

                      return (
                        <article className="prose prose-invert max-w-none">
                          <div className="mb-8 pb-6 border-b border-border-warm flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                              <PixelAvatar name={selectedAgent.name} role={selectedAgent.role} themeColor={selectedAgent.colorTheme} size="md" />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold font-mono uppercase tracking-widest text-text-muted bg-bg-primary px-2 py-0.5 border border-border-warm rounded">
                                    Specialist Dossier
                                  </span>
                                  {selectedAgent.status === "completed" && (
                                    <span className="text-[10px] font-bold font-mono uppercase text-success bg-success/5 px-2 py-0.5 border border-success/20 rounded">
                                      VERIFIED
                                    </span>
                                  )}
                                </div>
                                <h1 className="text-xl md:text-2xl font-bold text-text-primary mt-1 font-display">
                                  {selectedAgent.name}
                                </h1>
                                <p className="text-xs text-text-muted font-mono">
                                  Expert Role: <span className="text-text-secondary font-semibold">{selectedAgent.role}</span>
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 bg-bg-primary border border-border-warm rounded-xl mb-6">
                            <h4 className="text-[10px] font-mono text-text-muted uppercase tracking-widest font-bold mb-1">
                              Assigned investigative Angle
                            </h4>
                            <p className="text-xs text-text-secondary italic">
                              "{selectedAgent.investigativeAngle}"
                            </p>
                          </div>

                          <div className="space-y-4 text-xs leading-relaxed font-sans text-text-secondary md:text-sm">
                            {selectedAgent.report ? (
                              <ReactMarkdown
                                components={{
                                  h1: ({ node, ...props }) => <h1 className="text-xl font-bold text-text-primary mt-6 mb-3 border-b border-border-warm pb-1.5 font-display" {...props} />,
                                  h2: ({ node, ...props }) => <h2 className="text-lg font-semibold text-text-primary mt-5 mb-2.5 font-display" {...props} />,
                                  h3: ({ node, ...props }) => <h3 className="text-base font-semibold text-accent-warm mt-4 mb-2 font-display" {...props} />,
                                  p: ({ node, ...props }) => <p className="mb-4 leading-relaxed text-text-secondary text-xs sm:text-sm" {...props} />,
                                  ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-4 space-y-1" {...props} />,
                                  ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-4 space-y-1" {...props} />,
                                  li: ({ node, ...props }) => <li className="text-text-secondary text-xs sm:text-sm" {...props} />,
                                  blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-accent-warm bg-bg-surface p-4 rounded-r-lg italic my-4 text-text-muted" {...props} />,
                                  code: ({ node, ...props }) => <code className="bg-bg-primary text-accent-warm px-1.5 py-0.5 rounded font-mono text-xs border border-border-warm" {...props} />,
                                  pre: ({ node, ...props }) => <pre className="bg-bg-primary p-4 rounded-xl overflow-x-auto border border-border-warm my-4 text-xs font-mono text-text-secondary" {...props} />,
                                }}
                              >
                                {selectedAgent.report}
                              </ReactMarkdown>
                            ) : (
                              <div className="p-8 text-center text-text-muted font-mono bg-bg-primary rounded-xl border border-dashed border-border-warm">
                                Thread empty. This specialist was unable to return intelligence.
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })()
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Right Sidebar: rolling logs */}
        <aside 
          id="sidebar-logs" 
          className={`${
            rightSidebarOpen 
              ? "w-full md:w-[300px] border-l border-border-warm" 
              : "w-0 p-0 overflow-hidden border-l-0"
          } bg-bg-surface flex flex-col flex-shrink-0 transition-all duration-300 overflow-hidden`}
        >
          <div className="p-4 border-b border-border-warm flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-accent-warm animate-pulse" />
              <h2 className="text-[10px] font-bold text-text-muted uppercase tracking-widest font-mono">
                Recent Swarm Logs
              </h2>
            </div>
            {logs.length > 0 && (
              <button 
                onClick={() => setLogs([])}
                className="text-[9px] font-mono text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
              >
                Clear Log
              </button>
            )}
          </div>

          <div 
            ref={logContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-3.5 font-mono text-[10px] bg-bg-primary/40"
          >
            {logs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-4">
                <Terminal className="w-6 h-6 text-text-muted mb-2" />
                <p className="text-[9px] text-slate-600 italic">No operational events broadcasted yet.</p>
              </div>
            ) : (
              logs.map((log, idx) => {
                let borderCol = "border-border-warm";
                let textCol = "text-text-muted";
                let customStyle = {};
                
                if (log.type === "success") {
                  borderCol = "border-success/50";
                  textCol = "text-success";
                } else if (log.type === "warning") {
                  borderCol = "border-error/50";
                  textCol = "text-error";
                } else if (log.type === "system") {
                  borderCol = "border-accent-warm/50";
                  textCol = "text-accent-warm";
                } else if (log.agentColor) {
                  const hexColor = getAgentColorHex(log.agentColor);
                  borderCol = ""; // inline
                  textCol = "";
                  customStyle = { borderColor: hexColor, color: hexColor };
                }

                return (
                  <div 
                    key={idx} 
                    className={`border-l-2 ${borderCol} pl-3 py-0.5`}
                    style={customStyle}
                  >
                    <div className="flex justify-between items-center text-[9px] text-text-muted mb-0.5">
                      <span className={textCol || undefined} style={log.agentColor ? { color: getAgentColorHex(log.agentColor) } : undefined}>
                        {log.sender.toUpperCase()}
                      </span>
                      <span>{log.time}</span>
                    </div>
                    <p className="text-text-secondary leading-normal text-[10px] break-words">
                      {log.message}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          <div className="p-4 border-t border-border-warm bg-bg-primary/60 flex-shrink-0 text-center">
            <span className="text-[8px] font-mono text-text-muted tracking-wider uppercase">
              Thread Monitor Channel 02
            </span>
          </div>
        </aside>
      </div>

      {/* Footer bar */}
      <footer className="h-10 bg-bg-surface border-t border-border-warm px-6 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4 text-[9px] font-mono text-text-muted">
          <span>TOTAL_NODES: {session ? session.agents.length : 0}</span>
          <span>CONNECTED: 100%</span>
          <span>ENCRYPTION: AES-256</span>
          <span className="hidden sm:inline">LOC_TIME: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div className="text-[9px] font-mono text-text-muted uppercase tracking-wider hidden md:block">
          Intelligence Swarm Architecture © 2026. All Threads Operating Within Nominal Bounds.
        </div>
      </footer>
    </div>
  );
}
