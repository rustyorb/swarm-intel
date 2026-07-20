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
  Clock,
  Copy,
  Download,
  Check,
  X,
  Settings,
  Key,
  Server,
  Globe,
  Database,
  Save,
  Minus,
  Plus,
  UserPlus,
  SlidersHorizontal,
  MessagesSquare,
  FileDown,
  Printer,
  BookOpenText,
  LibraryBig,
  ShieldAlert,
  Eye,
  Users,
  BookmarkPlus,
  BookmarkCheck
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import PixelAvatar from "./components/PixelAvatar";
import SwarmNetwork from "./components/SwarmNetwork";
import InterrogationRoom from "./components/InterrogationRoom";
import ReaderMode from "./components/ReaderMode";
import KnowledgeLibrary from "./components/KnowledgeLibrary";
import AgentLibrary from "./components/AgentLibrary";
import { buildDossierHtml } from "./lib/dossier";
import { Agent, AgentStatus, Lead, PriorContext, RedTeamCritique, ResearchSession, SavedAgent, SessionStatus, SwarmConfig } from "./types";

const REDTEAM_HEX = "#ec4899";
const FRINGE_HEX = "#8b5cf6";
const ROSTER_HEX = "#3b82f6";

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

// Cosmetic RPG character-sheet flavor — deterministic per agent, no functional meaning
const RPG_STATUS: Record<string, string> = {
  idle: "READY",
  working: "ON QUEST",
  completed: "QUEST DONE",
  failed: "FALLEN",
};

const getAgentSheet = (name: string, role: string) => {
  const s = name + role;
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = s.charCodeAt(i) + ((h << 5) - h);
  }
  h = Math.abs(h);
  return {
    level: 12 + (h % 48),
    stats: [
      { label: "INT", value: 8 + ((h >>> 3) % 11) },
      { label: "WIS", value: 8 + ((h >>> 7) % 11) },
      { label: "ARC", value: 8 + ((h >>> 11) % 11) },
      { label: "LCK", value: 8 + ((h >>> 15) % 11) },
    ],
  };
};

interface LogEntry {
  time: string;
  sender: string;
  message: string;
  type: "info" | "success" | "warning" | "system";
  agentColor?: string;
}

const AGENT_COLOR_PALETTE = ["cyan", "emerald", "rose", "amber", "purple", "indigo", "blue", "fuchsia"];

const DEPTH_OPTIONS: { id: SwarmConfig["depth"]; label: string; desc: string }[] = [
  { id: "recon", label: "Recon", desc: "Fast tactical brief" },
  { id: "standard", label: "Standard", desc: "Balanced dossier" },
  { id: "deep", label: "Deep", desc: "Exhaustive analysis" },
];

// Pre-launch mission parameter controls (swarm size + research depth).
// `compact` renders the tighter left-sidebar mirror without descriptions.
function MissionParameters({
  config,
  onChange,
  compact = false,
  libraryCount = 0,
}: {
  config: SwarmConfig;
  onChange: (config: SwarmConfig) => void;
  compact?: boolean;
  // Saved Agent Library size — Roster Mode needs at least 2.
  libraryCount?: number;
}) {
  // Count runs AUTO ← 3 … 9: stepping below 3 hands sizing to the
  // orchestrator, which sprouts as many agents as the research need demands.
  const decCount = () => {
    if (config.agentCount === "auto") return;
    onChange({ ...config, agentCount: config.agentCount <= 3 ? "auto" : config.agentCount - 1 });
  };
  const incCount = () => {
    onChange({ ...config, agentCount: config.agentCount === "auto" ? 3 : Math.min(9, config.agentCount + 1) });
  };
  const activeDepth = DEPTH_OPTIONS.find((d) => d.id === config.depth) || DEPTH_OPTIONS[1];

  return (
    <div className={`bg-bg-primary border border-border-warm rounded-xl ${compact ? "p-3" : "p-3.5"}`}>
      {!compact && (
        <div className="flex items-center gap-1.5 mb-3 text-[9px] uppercase text-text-muted tracking-widest font-bold font-mono">
          <SlidersHorizontal className="w-3 h-3 text-accent-warm" />
          Mission Parameters
        </div>
      )}
      <div className={compact ? "space-y-3" : "grid grid-cols-1 sm:grid-cols-2 gap-4"}>
        {/* Swarm Size */}
        <div>
          <div className="text-[9px] font-mono uppercase tracking-widest font-bold text-text-muted mb-2">
            Swarm Size
          </div>
          <div className="flex items-center justify-between bg-bg-surface border border-border-warm rounded-lg px-2 py-1.5">
            <button
              onClick={decCount}
              disabled={config.agentCount === "auto"}
              className="w-6 h-6 rounded-md flex items-center justify-center text-text-secondary hover:text-accent-warm hover:bg-bg-primary transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              title="Decrease swarm size (below 3 switches to AUTO)"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <div
              className="flex items-baseline gap-1.5"
              title={config.agentCount === "auto" ? "The orchestrator sizes the swarm from its analysis of the research need" : undefined}
            >
              <span className="text-lg font-mono font-bold text-accent-warm tabular-nums leading-none">
                {config.agentCount === "auto" ? "AUTO" : config.agentCount}
              </span>
              <span className="text-[8px] font-mono uppercase tracking-widest text-text-muted">
                {config.agentCount === "auto" ? "need-driven" : "nodes"}
              </span>
            </div>
            <button
              onClick={incCount}
              disabled={config.agentCount !== "auto" && config.agentCount >= 9}
              className="w-6 h-6 rounded-md flex items-center justify-center text-text-secondary hover:text-accent-warm hover:bg-bg-primary transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              title="Increase swarm size"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Research Depth */}
        <div>
          <div className="text-[9px] font-mono uppercase tracking-widest font-bold text-text-muted mb-2">
            Research Depth
          </div>
          <div className="flex items-center gap-1 bg-bg-surface border border-border-warm rounded-lg p-0.5">
            {DEPTH_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => onChange({ ...config, depth: opt.id })}
                className={`flex-1 py-1 rounded-md text-[9px] font-mono font-bold uppercase tracking-widest transition-all cursor-pointer border ${
                  config.depth === opt.id
                    ? "bg-bg-primary border-border-hi-warm text-accent-warm"
                    : "border-transparent text-text-muted hover:text-text-secondary"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {!compact && (
            <div className="text-[9px] font-mono text-text-muted mt-1.5 pl-0.5">
              {activeDepth.desc}
            </div>
          )}
        </div>
      </div>

      {/* Roster Mode toggle — draft only from the saved Agent Library */}
      <div className={compact ? "mt-3" : "mt-4"}>
        <button
          onClick={() => onChange({ ...config, rosterMode: !config.rosterMode })}
          disabled={!config.rosterMode && libraryCount < 2}
          className="w-full flex items-center justify-between gap-3 bg-bg-surface border border-border-warm hover:border-border-hi-warm rounded-lg px-3 py-2 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          title={libraryCount < 2 && !config.rosterMode
            ? "Roster Mode needs at least 2 saved agents — bookmark specialists from a swarm or forge them in the Agent Library"
            : "Draft the swarm exclusively from your saved Agent Library — the orchestrator selects and tasks personas, never invents them"}
        >
          <div className="flex items-center gap-2 min-w-0 text-left">
            <Users
              className="w-3.5 h-3.5 flex-shrink-0 transition-colors"
              style={{ color: config.rosterMode ? ROSTER_HEX : undefined }}
            />
            <div className="min-w-0">
              <div
                className="text-[9px] font-mono uppercase tracking-widest font-bold transition-colors"
                style={{ color: config.rosterMode ? ROSTER_HEX : undefined }}
              >
                Roster Mode
              </div>
              {!compact && (
                <div className="text-[9px] font-mono text-text-muted mt-0.5">
                  Draft only from your Agent Library ({libraryCount} saved)
                </div>
              )}
            </div>
          </div>
          <span
            className={`relative w-9 h-5 rounded-full flex-shrink-0 transition-colors ${config.rosterMode ? "" : "bg-border-warm"}`}
            style={config.rosterMode ? { background: ROSTER_HEX } : undefined}
          >
            <span
              className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-text-primary transition-transform"
              style={{ transform: config.rosterMode ? "translateX(16px)" : "translateX(0)" }}
            />
          </span>
        </button>
      </div>

      {/* Fringe Mode case-file toggle */}
      <div className={compact ? "mt-3" : "mt-4"}>
        <button
          onClick={() => onChange({ ...config, fringeMode: !config.fringeMode })}
          className="w-full flex items-center justify-between gap-3 bg-bg-surface border border-border-warm hover:border-border-hi-warm rounded-lg px-3 py-2 transition-all cursor-pointer"
          title="Case-file mode for fringe/esoteric territory: investigation-native specialists, non-mainstream sourcing, Evidence Docket synthesis with open leads"
        >
          <div className="flex items-center gap-2 min-w-0 text-left">
            <Eye
              className="w-3.5 h-3.5 flex-shrink-0 transition-colors"
              style={{ color: config.fringeMode ? FRINGE_HEX : undefined }}
            />
            <div className="min-w-0">
              <div
                className="text-[9px] font-mono uppercase tracking-widest font-bold transition-colors"
                style={{ color: config.fringeMode ? FRINGE_HEX : undefined }}
              >
                Fringe Mode
              </div>
              {!compact && (
                <div className="text-[9px] font-mono text-text-muted mt-0.5">
                  Case-file investigation for edge territory
                </div>
              )}
            </div>
          </div>
          <span
            className={`relative w-9 h-5 rounded-full flex-shrink-0 transition-colors ${config.fringeMode ? "" : "bg-border-warm"}`}
            style={config.fringeMode ? { background: FRINGE_HEX } : undefined}
          >
            <span
              className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-text-primary transition-transform"
              style={{ transform: config.fringeMode ? "translateX(16px)" : "translateX(0)" }}
            />
          </span>
        </button>
      </div>

      {/* Red Team adversarial toggle */}
      <div className={compact ? "mt-3" : "mt-4"}>
        <button
          onClick={() => onChange({ ...config, redTeam: !config.redTeam })}
          className="w-full flex items-center justify-between gap-3 bg-bg-surface border border-border-warm hover:border-border-hi-warm rounded-lg px-3 py-2 transition-all cursor-pointer"
          title="Toggle an adversarial red-team critique pass before synthesis"
        >
          <div className="flex items-center gap-2 min-w-0 text-left">
            <ShieldAlert
              className="w-3.5 h-3.5 flex-shrink-0 transition-colors"
              style={{ color: config.redTeam ? REDTEAM_HEX : undefined }}
            />
            <div className="min-w-0">
              <div
                className="text-[9px] font-mono uppercase tracking-widest font-bold transition-colors"
                style={{ color: config.redTeam ? REDTEAM_HEX : undefined }}
              >
                Red Team
              </div>
              {!compact && (
                <div className="text-[9px] font-mono text-text-muted mt-0.5">
                  Adversarial critique pass before synthesis
                </div>
              )}
            </div>
          </div>
          <span
            className={`relative w-9 h-5 rounded-full flex-shrink-0 transition-colors ${config.redTeam ? "" : "bg-border-warm"}`}
            style={config.redTeam ? { background: REDTEAM_HEX } : undefined}
          >
            <span
              className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-text-primary transition-transform"
              style={{ transform: config.redTeam ? "translateX(16px)" : "translateX(0)" }}
            />
          </span>
        </button>
      </div>
    </div>
  );
}

const DEFAULT_SETTINGS = {
  providers: {
    gemini: { apiKey: "", baseUrl: "", enabled: true, fetchedModels: ["gemini-3.5-flash", "gemini-3.1-pro-preview", "gemini-3.1-flash-lite"] },
    openrouter: { apiKey: "", baseUrl: "", enabled: false, fetchedModels: [] as string[] },
    anthropic: { apiKey: "", baseUrl: "", enabled: false, fetchedModels: [] as string[] },
    openai: { apiKey: "", baseUrl: "", enabled: false, fetchedModels: [] as string[] },
    venice: { apiKey: "", baseUrl: "", enabled: false, fetchedModels: [] as string[] },
    lmstudio: { apiKey: "", baseUrl: "http://localhost:1234/v1", enabled: false, fetchedModels: [] as string[] },
    ollama: { apiKey: "", baseUrl: "http://localhost:11434", enabled: false, fetchedModels: [] as string[] },
  },
  modelMapping: {
    orchestrator: { provider: "gemini", model: "gemini-3.5-flash" },
    agent: { provider: "gemini", model: "gemini-3.5-flash" },
    synthesis: { provider: "gemini", model: "gemini-3.5-flash" },
  }
};

// Hydrate persisted state synchronously in useState initializers. Loading via
// a mount effect races the save effects (which fire on mount with default
// state) — under StrictMode's double-mount that deterministically overwrites
// everything stored, wiping settings/session/logs on every page load.
function loadStoredSession(): ResearchSession | null {
  try {
    const stored = localStorage.getItem("research_swarm_current_session");
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    // A reload kills the async loops that drive live sessions; restoring one
    // mid-flight leaves the UI frozen at that stage with no errors.
    if (["assembling", "researching", "redteaming", "synthesizing"].includes(parsed.status)) {
      parsed.status = "failed";
      parsed.error = "Session was interrupted by a page reload before it finished. Start a new run.";
    }
    return parsed;
  } catch (e) {
    console.error("Failed to load session:", e);
    return null;
  }
}

export default function App() {
  const [topic, setTopic] = useState(() => loadStoredSession()?.topic || "");
  const [session, setSession] = useState<ResearchSession | null>(loadStoredSession);
  const [history, setHistory] = useState<ResearchSession[]>(() => {
    try {
      const stored = localStorage.getItem("research_swarm_history");
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error("Failed to load history:", e);
      return [];
    }
  });
  const [logs, setLogs] = useState<LogEntry[]>(() => {
    try {
      const stored = localStorage.getItem("research_swarm_current_logs");
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error("Failed to load logs:", e);
      return [];
    }
  });
  const [activeTab, setActiveTab] = useState<"synthesis" | string>("synthesis");
  const [activeReportViewerId, setActiveReportViewerId] = useState<string>("synthesis");
  const [agentProgress, setAgentProgress] = useState<Record<string, { percent: number; statusText: string }>>({});
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settings, setSettings] = useState<typeof DEFAULT_SETTINGS>(() => {
    try {
      const stored = localStorage.getItem("research_swarm_settings");
      if (stored) {
        const parsed = JSON.parse(stored);
        // Migrate old Gemini models to gemini-3.5-flash if they are mapped
        if (parsed.modelMapping) {
          const roles: ("orchestrator" | "agent" | "synthesis")[] = ["orchestrator", "agent", "synthesis"];
          roles.forEach(role => {
            if (parsed.modelMapping[role] && parsed.modelMapping[role].provider === "gemini") {
              const model = parsed.modelMapping[role].model;
              if (!model || model.includes("1.5") || model.includes("2.0") || model.includes("2.5") || model === "gemini-pro") {
                parsed.modelMapping[role].model = "gemini-3.5-flash";
              }
            }
          });
        }
        if (parsed.providers && parsed.providers.gemini) {
          // Always overwrite fetchedModels for Gemini with the active 2026 ones
          parsed.providers.gemini.fetchedModels = ["gemini-3.5-flash", "gemini-3.1-pro-preview", "gemini-3.1-flash-lite"];
        }
        return parsed;
      }
    } catch (err) {
      console.warn("Stored settings parsing or migration failed:", err);
    }
    return DEFAULT_SETTINGS;
  });
  const [settingsTab, setSettingsTab] = useState<"providers" | "routing">("providers");
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<Record<string, { success: boolean; message: string }>>({});

  const handleFetchModels = async (providerName: string) => {
    setTestingConnection(providerName);
    setConnectionStatus(prev => ({ ...prev, [providerName]: { success: false, message: "Validating API link..." } }));
    
    try {
      const providerConfig = settings.providers[providerName as keyof typeof settings.providers];
      const response = await fetch("/api/settings/fetch-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: providerName,
          apiKey: providerConfig.apiKey,
          baseUrl: providerConfig.baseUrl
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || `Server responded with status ${response.status}`);
      }

      const data = await response.json();
      const models = data.models || [];
      
      if (models.length === 0) {
        throw new Error("No models returned by provider.");
      }

      // Update settings
      setSettings(prev => {
        const updatedProviders = {
          ...prev.providers,
          [providerName]: {
            ...prev.providers[providerName as keyof typeof prev.providers],
            fetchedModels: models,
            enabled: true
          }
        };
        return {
          ...prev,
          providers: updatedProviders
        };
      });

      setConnectionStatus(prev => ({
        ...prev,
        [providerName]: { success: true, message: `Success! ${models.length} models loaded.` }
      }));
      addLog("SYSTEM", `Successfully fetched and cached ${models.length} models for ${providerName.toUpperCase()}`, "success");
    } catch (err: any) {
      setConnectionStatus(prev => ({
        ...prev,
        [providerName]: { success: false, message: err.message || "Failed to validate credentials." }
      }));
      addLog("SYSTEM", `Failed to validate credentials for ${providerName.toUpperCase()}: ${err.message}`, "warning");
    } finally {
      setTestingConnection(null);
    }
  };

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

  const [viewingCompletedAgent, setViewingCompletedAgent] = useState<Agent | null>(null);
  const [showReader, setShowReader] = useState(false);
  const [regeneratingAgentId, setRegeneratingAgentId] = useState<string | null>(null);
  const [nudgeTexts, setNudgeTexts] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [redTeamCurrentAgentId, setRedTeamCurrentAgentId] = useState<string | null>(null);
  const [redTeamStreamingCritique, setRedTeamStreamingCritique] = useState("");
  const [swarmViewMode, setSwarmViewMode] = useState<"grid" | "network">(
    () => (localStorage.getItem("research_swarm_view_mode") as "grid" | "network") || "network"
  );

  useEffect(() => {
    localStorage.setItem("research_swarm_view_mode", swarmViewMode);
  }, [swarmViewMode]);

  const [swarmConfig, setSwarmConfig] = useState<SwarmConfig>(() => {
    try {
      const stored = localStorage.getItem("research_swarm_config");
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          agentCount: typeof parsed.agentCount === "number" ? Math.max(3, Math.min(9, parsed.agentCount)) : "auto",
          depth: ["recon", "standard", "deep"].includes(parsed.depth) ? parsed.depth : "standard",
          ...(parsed.fringeMode === true ? { fringeMode: true } : {}),
          ...(parsed.rosterMode === true ? { rosterMode: true } : {}),
        };
      }
    } catch (e) {
      // Ignore malformed config
    }
    return { agentCount: "auto", depth: "standard" };
  });

  useEffect(() => {
    localStorage.setItem("research_swarm_config", JSON.stringify(swarmConfig));
  }, [swarmConfig]);

  // Agent Library: user-saved specialist personas, independent of sessions.
  // Roster Mode drafts exclusively from this list.
  const [agentLibrary, setAgentLibrary] = useState<SavedAgent[]>(() => {
    try {
      const stored = localStorage.getItem("research_swarm_agent_library");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed.filter((a: any) => a && a.id && a.name && a.role && a.investigativeAngle);
        }
      }
    } catch (e) {
      // Ignore malformed library
    }
    return [];
  });
  const [showAgentLibrary, setShowAgentLibrary] = useState(false);

  useEffect(() => {
    localStorage.setItem("research_swarm_agent_library", JSON.stringify(agentLibrary));
  }, [agentLibrary]);

  const isAgentInLibrary = (agent: { name: string; role: string }) =>
    agentLibrary.some(s => s.name === agent.name && s.role === agent.role);

  // Saving an already-saved persona (same name+role) refreshes its specialty
  // and color instead of duplicating it.
  const saveAgentToLibrary = (agent: { name: string; role: string; investigativeAngle: string; colorTheme: string }) => {
    setAgentLibrary(prev => {
      const existing = prev.find(s => s.name === agent.name && s.role === agent.role);
      if (existing) {
        return prev.map(s => s.id === existing.id
          ? { ...s, investigativeAngle: agent.investigativeAngle, colorTheme: agent.colorTheme }
          : s);
      }
      return [...prev, {
        id: `saved-${Date.now()}-${prev.length}`,
        name: agent.name,
        role: agent.role,
        investigativeAngle: agent.investigativeAngle,
        colorTheme: agent.colorTheme,
        savedAt: new Date().toLocaleDateString(),
      }];
    });
    addLog("SYSTEM", `${agent.name} (${agent.role}) saved to the Agent Library.`, "success", agent.colorTheme);
  };

  // Custom specialist recruitment modal (approval stage)
  const [showRecruitModal, setShowRecruitModal] = useState(false);
  const [recruitName, setRecruitName] = useState("");
  const [recruitRole, setRecruitRole] = useState("");
  const [recruitAngle, setRecruitAngle] = useState("");
  const [recruitColor, setRecruitColor] = useState("cyan");

  const handleCopyReport = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSaveReport = (text: string, title: string) => {
    if (!text) return;
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 50);
    link.setAttribute("download", `${safeTitle}_report.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportDossier = () => {
    if (!session) return;
    const html = buildDossierHtml(session);
    const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const safeTitle = session.topic.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 50);
    link.setAttribute("download", `${safeTitle}_dossier.html`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    addLog("SYSTEM", "Mission dossier compiled and exported as a standalone HTML file.", "success");
  };

  const handlePrintDossier = () => {
    if (!session) return;
    const html = buildDossierHtml(session);
    const win = window.open("", "_blank");
    if (!win) {
      // Popup blocked — fall back to downloading the styled HTML instead.
      handleExportDossier();
      addLog("SYSTEM", "Print window was blocked by the browser. Dossier downloaded as HTML instead.", "warning");
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    const triggerPrint = () => win.print();
    if (win.document.readyState === "complete") {
      setTimeout(triggerPrint, 350);
    } else {
      win.onload = () => setTimeout(triggerPrint, 350);
    }
    addLog("SYSTEM", "Paper-ready print view opened. Choose \"Save as PDF\" to archive the dossier.", "system");
  };

  const handleApproveAndStartResearch = () => {
    if (!session) return;
    const updated: ResearchSession = { ...session, status: "researching" };
    setSession(updated);
    setTimeout(() => {
      runParallelResearch(updated);
    }, 0);
  };

  const handleDismissAgent = (agentId: string) => {
    if (!session || session.agents.length <= 2) return;
    const target = session.agents.find(a => a.id === agentId);
    setSession(prev => prev ? { ...prev, agents: prev.agents.filter(a => a.id !== agentId) } : null);
    if (target) {
      addLog("ORCHESTRATOR", `Specialist ${target.name} dismissed from the swarm roster.`, "warning", target.colorTheme);
    }
  };

  const handleRecruitSpecialist = () => {
    if (!session) return;
    const name = recruitName.trim();
    const role = recruitRole.trim();
    const angle = recruitAngle.trim();
    if (!name || !role || !angle) return;

    const newAgent: Agent = {
      id: "agent-custom-" + Date.now(),
      name,
      role,
      investigativeAngle: angle,
      colorTheme: recruitColor,
      status: "idle",
    };

    setSession(prev => prev ? { ...prev, agents: [...prev.agents, newAgent] } : null);
    addLog("ORCHESTRATOR", `Custom specialist ${name} recruited into the active swarm.`, "success", recruitColor);
    setShowRecruitModal(false);
    setRecruitName("");
    setRecruitRole("");
    setRecruitAngle("");
    setRecruitColor("cyan");
  };

  const handleRegenerateSingleAgent = async (agentId: string) => {
    if (!session) return;
    const nudge = nudgeTexts[agentId] || "";
    setRegeneratingAgentId(agentId);
    
    addLog("ORCHESTRATOR", `Requesting revision for Agent Node [${agentId}]... Nudge: "${nudge || "none"}"`, "system");
    
    try {
      const response = await fetch("/api/research/regenerate-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: session.topic,
          agents: session.agents,
          agentIdToRegenerate: agentId,
          nudge: nudge,
          needAnalysis: session.needAnalysis || "",
          settings: settings
        }),
      });

      if (!response.ok) {
        let errorMsg = "Failed to regenerate agent.";
        try {
          const errorData = await response.json();
          if (errorData.error) errorMsg = errorData.error;
        } catch (e) {}
        throw new Error(errorMsg);
      }

      const data = await response.json();
      const newAgent: Agent = {
        ...data.agent,
        status: "idle" as AgentStatus
      };

      setSession(prev => {
        if (!prev) return null;
        return {
          ...prev,
          agents: prev.agents.map(a => a.id === agentId ? newAgent : a)
        };
      });

      addLog("ORCHESTRATOR", `Agent Node [${agentId}] revised successfully as ${newAgent.name} [${newAgent.role}].`, "success", newAgent.colorTheme);
      
      setNudgeTexts(prev => {
        const copy = { ...prev };
        delete copy[agentId];
        return copy;
      });
    } catch (err: any) {
      addLog("SYSTEM", `Agent Revision Error: ${err.message}`, "warning");
    } finally {
      setRegeneratingAgentId(null);
    }
  };

  const getActiveReportContentAndTitle = (): { text: string; title: string } => {
    if (!session) return { text: "", title: "" };
    if (activeReportViewerId === "synthesis") {
      return { 
        text: session.synthesizedReport || "", 
        title: `${session.topic} - Consolidated Synthesis` 
      };
    }
    const agent = session.agents.find(a => a.id === activeReportViewerId);
    return { 
      text: agent?.report || "", 
      title: agent ? `${agent.name} (${agent.role}) - Specialist Dossier` : "" 
    };
  };

  // Which providers have server-side .env keys — lets the Settings UI enable
  // model fetching without a browser-entered key.
  const [envKeys, setEnvKeys] = useState<Record<string, boolean>>({});
  useEffect(() => {
    fetch("/api/health")
      .then(r => r.json())
      .then(data => setEnvKeys(data.env_keys || {}))
      .catch(() => {});
  }, []);

  // Save settings helper
  useEffect(() => {
    try {
      localStorage.setItem("research_swarm_settings", JSON.stringify(settings));
    } catch (e) {
      console.error("Failed to save settings:", e);
    }
  }, [settings]);

  // Save history helper
  const saveToHistory = (newSession: ResearchSession) => {
    try {
      setHistory(prev => {
        const filtered = prev.filter(s => s.id !== newSession.id);
        const updated = [newSession, ...filtered].slice(0, 50); // keep last 50
        localStorage.setItem("research_swarm_history", JSON.stringify(updated));
        return updated;
      });
    } catch (e) {
      console.error("Failed to save history:", e);
    }
  };

  // Persist an updated history array to localStorage as we mutate it.
  const persistHistory = (updated: ResearchSession[]) => {
    try {
      localStorage.setItem("research_swarm_history", JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to save history:", e);
    }
    return updated;
  };

  // Library mutation helpers — each updates state AND localStorage.
  const toggleFavorite = (id: string) => {
    setHistory(prev => persistHistory(prev.map(s => (s.id === id ? { ...s, favorite: !s.favorite } : s))));
  };

  const renameSession = (id: string, label: string) => {
    const trimmed = label.trim();
    setHistory(prev => persistHistory(prev.map(s => (s.id === id ? { ...s, label: trimmed || undefined } : s))));
  };

  const deleteSession = (id: string) => {
    setHistory(prev => persistHistory(prev.filter(s => s.id !== id)));
  };

  const setSessionTags = (id: string, tags: string[]) => {
    setHistory(prev => persistHistory(prev.map(s => (s.id === id ? { ...s, tags } : s))));
  };

  const importSessions = (incoming: ResearchSession[]) => {
    setHistory(prev => {
      const byId = new Map<string, ResearchSession>();
      prev.forEach(s => byId.set(s.id, s));
      incoming.forEach(s => byId.set(s.id, s)); // imported wins
      const recency = (s: ResearchSession) => {
        const m = /(\d{10,})/.exec(s.id);
        if (m) return Number(m[1]);
        const t = Date.parse(s.timestamp);
        return isNaN(t) ? 0 : t;
      };
      const merged = Array.from(byId.values()).sort((a, b) => recency(b) - recency(a));
      // Enforce cap 50, evicting non-favorites first (favorites are never dropped before them).
      let capped = merged;
      if (merged.length > 50) {
        const favorites = merged.filter(s => s.favorite);
        const others = merged.filter(s => !s.favorite);
        const room = Math.max(0, 50 - favorites.length);
        capped = [...favorites, ...others.slice(0, room)].sort((a, b) => recency(b) - recency(a));
      }
      return persistHistory(capped);
    });
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

  // 1. Initialize Swarm. An optional priorContext turns this into a
  // follow-up run seeded with a parent session's findings.
  const handleInitiateResearch = async (searchTopic: string, priorContext?: PriorContext) => {
    if (!searchTopic.trim()) return;

    if (swarmConfig.rosterMode && agentLibrary.length < 2) {
      addLog("SYSTEM", "Roster Mode is on but the Agent Library has fewer than 2 saved agents. Save specialists or disable Roster Mode.", "warning");
      return;
    }

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
      config: swarmConfig,
      ...(priorContext ? { priorContext } : {}),
    };

    setSession(newSession);
    addLog("SYSTEM", `Initializing orchestration sequence for: "${searchTopic}"`, "system");
    if (priorContext) {
      addLog("ORCHESTRATOR", `FOLLOW-UP commission — carrying forward findings from prior mission: "${priorContext.parentTopic}"`, "system");
    }
    addLog("ORCHESTRATOR", "Structuring research requirements into high-fidelity specialist dimensions...", "info");

    try {
      const response = await fetch("/api/research/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: searchTopic,
          settings: settings,
          config: swarmConfig,
          priorContext,
          // Roster Mode drafts from the saved library; omit otherwise to keep
          // the default payload unchanged.
          ...(swarmConfig.rosterMode ? { savedAgents: agentLibrary } : {}),
        }),
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
      const loadedAgents: Agent[] = (data.agents || []).map((ag: any) => ({
        ...ag,
        status: "idle" as AgentStatus
      }));

      if (loadedAgents.length === 0) {
        throw new Error("The orchestrator returned zero agents. Check the orchestrator model in Settings — some models fail to produce the required JSON structure.");
      }

      // Roster Mode: drafted agents keep their library ids — tally deployments.
      if (swarmConfig.rosterMode) {
        const deployedIds = new Set(loadedAgents.map(a => a.id));
        setAgentLibrary(prev => prev.map(s => deployedIds.has(s.id)
          ? { ...s, timesDeployed: (s.timesDeployed || 0) + 1 }
          : s));
      }

      const needAnalysis: string = typeof data.needAnalysis === "string" ? data.needAnalysis : "";
      if (needAnalysis) {
        addLog("ORCHESTRATOR", `Mission analysis: ${needAnalysis}`, "info");
      }
      addLog("ORCHESTRATOR", `Sprouted ${loadedAgents.length} specialists tailored to this research need.`, "success");

      // Initialize progress states for each assembled agent
      const initialProgress: Record<string, { percent: number; statusText: string }> = {};
      loadedAgents.forEach(a => {
        initialProgress[a.id] = { percent: 0, statusText: "AWAITING_THREAD" };
      });
      setAgentProgress(initialProgress);

      // Animate agent assembly one by one
      setSession(prev => prev ? { ...prev, agents: loadedAgents, needAnalysis } : null);
      
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

      // Transition to Approval stage
      setSession(prev => {
        if (!prev) return null;
        addLog("ORCHESTRATOR", "Swarm assembly complete. Thread locks engaged. Awaiting specialist team verification...", "system");
        return { ...prev, status: "approval" as SessionStatus };
      });

    } catch (err: any) {
      addLog("SYSTEM", `Assembly Error: ${err.message}`, "warning");
      setSession(prev => prev ? { ...prev, status: "failed", error: err.message } : null);
    }
  };

  // Commission a follow-up swarm from a completed session: condense its
  // findings + recent interrogation into a PriorContext and launch a new run.
  const handleLaunchFollowUp = (directive: string) => {
    if (!session || !directive.trim()) return;
    const chatExcerpt = (session.chat ?? [])
      .slice(-8)
      .map(m => `${m.role === "user" ? "USER" : m.respondentName}: ${m.content.slice(0, 500)}`)
      .join("\n");
    const prior: PriorContext = {
      parentSessionId: session.id,
      parentTopic: session.topic,
      directive: directive.trim(),
      synthesis: (session.synthesizedReport || "").slice(0, 9000),
      chatExcerpt,
      // Fringe case files pass their ledger forward so the follow-up swarm
      // works the open leads instead of restarting the case.
      ...(session.leads && session.leads.length ? { leads: session.leads } : {}),
    };
    handleInitiateResearch(directive.trim(), prior);
  };

  // Simulate progress counters for parallel agents and coordinate API runs
  const runParallelResearch = async (currentSession: ResearchSession) => {
    addLog("ORCHESTRATOR", "Deploying swarm nodes. Launching all specialist threads in parallel...", "system");

    const agents = [...currentSession.agents];
    
    // Initialize progress record for each agent safely
    setAgentProgress(prev => {
      const copy = { ...prev };
      agents.forEach(a => {
        if (!copy[a.id]) {
          copy[a.id] = { percent: 0, statusText: "AWAITING_THREAD" };
        }
      });
      return copy;
    });

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
          body: JSON.stringify({ topic: currentSession.topic, agent, settings: settings, config: currentSession.config, priorContext: currentSession.priorContext }),
        });

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
                let data: any = null;
                try {
                  data = JSON.parse(remaining.slice(6));
                } catch (e) {
                  // Ignore partial parse errors
                }
                if (data?.type === "chunk" && data.text) {
                  report += data.text;
                } else if (data?.type === "error") {
                  throw new Error(data.error || "Stream error.");
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
                let data: any = null;
                try {
                  data = JSON.parse(lineText.slice(6));
                } catch (e) {
                  // Ignore partial parse errors
                }
                if (data?.type === "chunk" && data.text) {
                  report += data.text;
                  setSession(prev => {
                    if (!prev) return null;
                    return {
                      ...prev,
                      agents: prev.agents.map(a => a.id === agent.id ? { ...a, report } : a)
                    };
                  });
                } else if (data?.type === "grounding") {
                  // Surface whether this run is actually internet-grounded
                  addLog(
                    agent.name,
                    `Web grounding: ${data.detail}`,
                    data.mode === "none" ? "warning" : "info",
                    agent.colorTheme
                  );
                } else if (data?.type === "error") {
                  throw new Error(data.error || "Stream error.");
                }
              }
            }
          }
        }

        if (!report.trim()) {
          throw new Error("Provider returned no content. Check API key and model in Settings, and the server console for details.");
        }

        clearInterval(intervalId);

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
    const validReports = results.filter(r => r.report && r.report.trim());

    if (validReports.length === 0) {
      addLog("ORCHESTRATOR", "Swarm execution critical failure. No investigative reports returned.", "warning");
      setSession(prev => prev ? { ...prev, status: "failed", error: "All agents failed" } : null);
      return;
    }

    // Optional adversarial Red Team pass: VEX cross-examines each specialist report before synthesis.
    const critiques: RedTeamCritique[] = [];
    if (currentSession.config?.redTeam) {
      setSession(prev => prev ? { ...prev, status: "redteaming" as SessionStatus } : null);
      addLog("ORCHESTRATOR", "Deploying VEX adversarial review...", "system");

      for (const vr of validReports) {
        const agentObj = agents.find(a => a.id === vr.agentId);
        setRedTeamCurrentAgentId(vr.agentId);
        setRedTeamStreamingCritique("");
        addLog("VEX", `Cross-examining ${vr.name} [${vr.role}]...`, "info", "rose");

        try {
          const response = await fetch("/api/research/redteam-stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              topic: currentSession.topic,
              agent: { id: vr.agentId, name: vr.name, role: vr.role, investigativeAngle: agentObj?.investigativeAngle || "" },
              report: vr.report,
              settings: settings,
              config: currentSession.config,
            }),
          });

          if (!response.ok) {
            throw new Error("Adversarial review thread failed.");
          }

          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          let critiqueText = "";
          let buffer = "";

          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                const remaining = buffer.trim();
                if (remaining && remaining.startsWith("data: ")) {
                  let data: any = null;
                  try {
                    data = JSON.parse(remaining.slice(6));
                  } catch (e) {
                    // Ignore partial parse errors
                  }
                  if (data?.type === "chunk" && data.text) {
                    critiqueText += data.text;
                  } else if (data?.type === "error") {
                    throw new Error(data.error || "Stream error.");
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
                  let data: any = null;
                  try {
                    data = JSON.parse(lineText.slice(6));
                  } catch (e) {
                    // Ignore partial parse errors
                  }
                  if (data?.type === "chunk" && data.text) {
                    critiqueText += data.text;
                    setRedTeamStreamingCritique(critiqueText);
                  } else if (data?.type === "error") {
                    throw new Error(data.error || "Stream error.");
                  }
                }
              }
            }
          }

          if (!critiqueText.trim()) {
            throw new Error("Empty cross-examination returned.");
          }

          critiques.push({ agentId: vr.agentId, agentName: vr.name, agentRole: vr.role, critique: critiqueText });
          // Progressively surface critiques so the tribunal UI and Red Team tab stream live.
          setSession(prev => prev ? { ...prev, critiques: [...critiques] } : null);
          addLog("VEX", `Verdict rendered on ${vr.name}'s report.`, "info", "rose");
        } catch (err: any) {
          addLog("VEX", `Cross-examination of ${vr.name} skipped: ${err.message}`, "warning", "rose");
        }

        // Brief settle delay between adversarial reviews.
        await new Promise(r => setTimeout(r, 800));
      }

      setRedTeamCurrentAgentId(null);
      setRedTeamStreamingCritique("");
      addLog("ORCHESTRATOR", "Adversarial review complete. Handing critiques to synthesis...", "system");
    }

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
  };

  // Synthesis Call
  const runSynthesis = async (currentSession: ResearchSession, compiledReports: any[], critiques: RedTeamCritique[] = []) => {
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
        })),
        critiques: critiques.map(c => ({
          agentName: c.agentName,
          agentRole: c.agentRole,
          critique: c.critique
        })),
        settings: settings,
        config: currentSession.config,
        priorContext: currentSession.priorContext
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
              let data: any = null;
              try {
                data = JSON.parse(remaining.slice(6));
              } catch (e) {
                // Ignore partial parse errors
              }
              if (data?.type === "chunk" && data.text) {
                finalReport += data.text;
              } else if (data?.type === "done" && data.text) {
                finalReport = data.text;
              } else if (data?.type === "error") {
                throw new Error(data.error || "Stream error.");
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
              let data: any = null;
              try {
                data = JSON.parse(lineText.slice(6));
              } catch (e) {
                // Ignore partial parse errors
              }
              if (data?.type === "chunk" && data.text) {
                finalReport += data.text;
                setSession(prev => {
                  if (!prev) return null;
                  return { ...prev, synthesizedReport: finalReport };
                });
              } else if (data?.type === "done") {
                if (data.text) {
                  finalReport = data.text;
                }
              } else if (data?.type === "error") {
                throw new Error(data.error || "Stream error.");
              }
            }
          }
        }
      }

      if (!finalReport.trim()) {
        throw new Error("Synthesis returned no content — the provider stream was empty. Check model settings and the server console.");
      }

      addLog("ORCHESTRATOR", "Unified Swarm Synthesis Report assembled and validated against cross-discipline vectors.", "success");

      // Fringe mode: extract the docket's Open Leads as structured case-file
      // data (and update the status of leads carried from a parent case).
      // Non-fatal — the docket itself already contains the leads as prose.
      let caseLeads: Lead[] | undefined;
      if (currentSession.config?.fringeMode) {
        try {
          addLog("SYSTEM", "CASE FILE: extracting open leads from the evidence docket...", "system");
          const leadsResponse = await fetch("/api/research/extract-leads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              synthesis: finalReport,
              priorLeads: currentSession.priorContext?.leads || [],
              settings: settings,
            }),
          });
          if (leadsResponse.ok) {
            const leadsData = await leadsResponse.json();
            if (Array.isArray(leadsData.leads) && leadsData.leads.length > 0) {
              caseLeads = leadsData.leads;
              const openCount = leadsData.leads.filter((l: Lead) => l.status === "open").length;
              addLog("SYSTEM", `CASE FILE: ${leadsData.leads.length} lead(s) on the ledger — ${openCount} open. Case remains active.`, "success");
            }
          } else {
            addLog("SYSTEM", "CASE FILE: lead extraction failed — leads remain in the docket prose only.", "warning");
          }
        } catch (leadErr: any) {
          addLog("SYSTEM", `CASE FILE: lead extraction failed (${leadErr.message}) — leads remain in the docket prose only.`, "warning");
        }
      }

      addLog("SYSTEM", "Investigation Complete. All channels returned to baseline idle status.", "system");

      const finalSession: ResearchSession = {
        ...currentSession,
        synthesizedReport: finalReport,
        status: "completed",
        ...(critiques.length ? { critiques } : {}),
        ...(caseLeads ? { leads: caseLeads } : {}),
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

    if (session.status === "redteaming") return 92;
    if (session.status === "synthesizing") return 95;
    if (session.status === "completed") return 100;
    return Math.round(average);
  };

  const { text: activeText, title: activeTitle } = getActiveReportContentAndTitle();

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
                v3.1.0
              </span>
            </h1>
            <p className="text-[10px] text-text-muted font-mono -mt-0.5">Multi-Agent Intelligence Network</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right hidden sm:block">
            <div className="text-[10px] text-text-muted uppercase tracking-widest font-mono font-medium">Orchestrator Status</div>
            <div className="flex items-center gap-2 justify-end">
              <span className={`w-2 h-2 rounded-full ${session?.status === "researching" || session?.status === "redteaming" || session?.status === "synthesizing" ? "bg-amber-400 animate-pulse" : session?.status === "completed" ? "bg-accent-warm" : "bg-border-warm"}`}></span>
              <span className="text-[11px] font-mono font-semibold tracking-tight text-text-muted">
                {session?.status === "researching" && "DISTRIBUTING_WORKLOAD"}
                {session?.status === "redteaming" && "ADVERSARIAL_REVIEW"}
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

          <button
            id="btn-open-library"
            onClick={() => setLibraryOpen(true)}
            className="px-3 py-2 rounded-lg border border-border-warm bg-bg-surface hover:bg-bg-primary text-text-muted hover:text-text-secondary transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
            title="Open the Knowledge Library"
          >
            <LibraryBig className="w-3.5 h-3.5 text-accent-warm" />
            <span className="hidden md:inline">Library</span>
          </button>
          <button
            id="btn-open-agent-library"
            onClick={() => setShowAgentLibrary(true)}
            className="px-3 py-2 rounded-lg border border-border-warm bg-bg-surface hover:bg-bg-primary text-text-muted hover:text-text-secondary transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
            title="Open the Agent Library — saved specialists for Roster Mode"
          >
            <Users className="w-3.5 h-3.5" style={{ color: ROSTER_HEX }} />
            <span className="hidden md:inline">Agents</span>
            {history.length > 0 && (
              <span className="text-[9px] font-mono bg-bg-primary border border-border-warm text-text-secondary px-1.5 py-0.5 rounded-full leading-none">
                {history.length}
              </span>
            )}
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

          <button
            id="btn-open-settings"
            onClick={() => setShowSettingsModal(true)}
            className="px-4 py-2 bg-bg-surface hover:bg-bg-primary text-text-primary text-xs font-bold rounded uppercase tracking-wider border border-border-warm transition-all duration-150 flex items-center gap-2 cursor-pointer"
            title="Configure API Keys, Base URLs, and Model Mappings"
          >
            <Settings className="w-3.5 h-3.5 text-accent-warm animate-hover-spin" />
            <span>Settings</span>
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
                  disabled={session?.status === "assembling" || session?.status === "researching" || session?.status === "redteaming" || session?.status === "synthesizing"}
                  placeholder="Enter a deep scientific, technological, or social challenge topic..."
                  className="w-full min-h-[100px] bg-bg-primary border border-border-warm focus:border-border-hi-warm text-text-primary placeholder-text-muted rounded-xl p-3.5 text-xs font-sans leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-border-hi-warm transition-all"
                />
                <div className="absolute bottom-2.5 right-2.5 text-[9px] text-slate-600 font-mono">
                  {topic.length} chars
                </div>
              </div>

              {(!session || session.status === "idle" || session.status === "failed") && (
                <MissionParameters config={swarmConfig} onChange={setSwarmConfig} compact libraryCount={agentLibrary.length} />
              )}

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
                    {session.status === "completed" ? "FINISHED" : session.status === "synthesizing" ? "COMPILING" : session.status === "redteaming" ? "RED_TEAM" : "PARALLEL_RUN"}
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
              <div className="space-y-1.5">
                {history.slice(0, 5).map((hist) => (
                  <button
                    key={hist.id}
                    onClick={() => {
                      setSession(hist);
                      setTopic(hist.topic);
                      addLog("SYSTEM", `Restored historic research swarm for: "${hist.label || hist.topic}"`, "success");
                    }}
                    className={`w-full text-left p-2.5 rounded border transition-all text-xs flex justify-between items-center gap-2 cursor-pointer ${
                      session?.id === hist.id
                        ? "bg-bg-surface border-border-hi-warm text-accent-warm"
                        : "bg-bg-primary/40 border-border-warm text-text-secondary hover:bg-bg-surface hover:text-text-primary"
                    }`}
                  >
                    <div className="truncate min-w-0 flex-1">
                      <span className="font-mono text-[9px] text-text-muted block">{hist.timestamp}</span>
                      <span className="font-medium truncate block">"{hist.label || hist.topic}"</span>
                    </div>
                    <ChevronRight className="w-3 h-3 text-text-muted flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setLibraryOpen(true)}
              className="w-full mt-2 flex items-center justify-center gap-1.5 text-[10px] font-mono uppercase tracking-wider font-bold text-text-muted hover:text-accent-warm bg-bg-primary/40 hover:bg-bg-surface border border-border-warm rounded-lg py-2 transition-colors cursor-pointer"
            >
              <LibraryBig className="w-3 h-3" />
              Open Library
              <ChevronRight className="w-3 h-3" />
            </button>
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

                <div className="mt-4">
                  <MissionParameters config={swarmConfig} onChange={setSwarmConfig} libraryCount={agentLibrary.length} />
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
          {session && (session.status === "assembling" || session.status === "approval" || session.status === "researching" || session.status === "redteaming" || session.status === "synthesizing") && (
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
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className="text-[9px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-md bg-bg-primary border border-border-warm text-text-muted">
                        NODES: <span className="text-accent-warm">{typeof session.config?.agentCount === "number" ? session.config.agentCount : session.agents.length}</span>
                      </span>
                      <span className="text-[9px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-md bg-bg-primary border border-border-warm text-text-muted">
                        DEPTH: <span className="text-accent-warm">{(session.config?.depth ?? "standard").toUpperCase()}</span>
                      </span>
                      {session.priorContext && (
                        <span
                          className="text-[9px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-md bg-accent-warm/10 border border-accent-warm/40 text-accent-warm"
                          title={`Follow-up of: "${session.priorContext.parentTopic}"`}
                        >
                          FOLLOW-UP
                        </span>
                      )}
                      {session.config?.fringeMode && (
                        <span
                          className="text-[9px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-md border"
                          style={{ color: FRINGE_HEX, borderColor: `${FRINGE_HEX}66`, background: `${FRINGE_HEX}1a` }}
                          title="Fringe Mode — case-file investigation"
                        >
                          FRINGE
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 bg-bg-primary px-3.5 py-1.5 rounded-xl border border-border-warm font-mono text-[11px]">
                    {session.status === "approval" ? (
                      <ShieldCheck className="text-accent-warm w-3.5 h-3.5" />
                    ) : session.status === "redteaming" ? (
                      <ShieldAlert className="w-3.5 h-3.5" style={{ color: REDTEAM_HEX }} />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-accent-warm animate-spin" style={{ animationDuration: "3s" }} />
                    )}
                    <span className="text-text-secondary uppercase font-semibold">
                      {session.status === "assembling" && "ASSEMBLING_SWARM"}
                      {session.status === "approval" && "AWAITING_APPROVAL"}
                      {session.status === "researching" && "RUNNING_CHANNELS"}
                      {session.status === "redteaming" && "RED_TEAM_REVIEW"}
                      {session.status === "synthesizing" && "COMPILING_REPORTS"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <Activity className="w-3.5 h-3.5 text-accent-warm animate-pulse" />
                  <span>
                    {session.status === "approval"
                      ? "The specialist team configuration is finalized and awaiting your tactical validation."
                      : `The Lead Orchestrator has spun up ${session.agents.length} thread instances running concurrently.`
                    }
                  </span>
                </div>

                {session.needAnalysis && (
                  <div className="mt-3.5 bg-bg-primary border border-border-warm rounded-lg px-3.5 py-2.5">
                    <div className="text-[9px] font-mono uppercase tracking-widest font-bold text-accent-warm mb-1">
                      Mission Analysis — why this team
                    </div>
                    <p className="text-[11px] text-text-secondary leading-relaxed">
                      {session.needAnalysis}
                    </p>
                  </div>
                )}

                {session.status === "approval" && (
                  <div className="mt-5 pt-5 border-t border-border-warm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="max-w-xl">
                      <h4 className="text-xs font-bold text-accent-warm uppercase tracking-widest font-mono mb-1">
                        Tactical Swarm Control Board
                      </h4>
                      <p className="text-[11px] text-text-muted leading-relaxed">
                        Customize any agent node focus by entering an adjustment nudge directly on their card below. Alternatively, regenerate all nodes to rebuild a fresh, multi-disciplinary team.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2.5 w-full md:w-auto">
                      <button
                        onClick={() => setShowRecruitModal(true)}
                        className="flex-1 md:flex-initial h-9 px-4 bg-bg-surface hover:bg-bg-primary border border-border-warm text-text-secondary hover:text-text-primary text-[10px] font-bold rounded-lg uppercase tracking-wider font-mono transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        title="Manually recruit a custom specialist node"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Recruit Specialist
                      </button>
                      <button
                        onClick={() => handleInitiateResearch(session.topic, session.priorContext)}
                        className="flex-1 md:flex-initial h-9 px-4 bg-bg-surface hover:bg-bg-primary border border-border-warm text-text-secondary hover:text-text-primary text-[10px] font-bold rounded-lg uppercase tracking-wider font-mono transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        title="Reroll and regenerate all agents from scratch"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reroll Swarm
                      </button>
                      <button
                        onClick={handleApproveAndStartResearch}
                        className="flex-1 md:flex-initial h-9 px-5 bg-accent-warm hover:bg-accent-hi-warm text-black text-[10px] font-bold rounded-lg uppercase tracking-wider font-mono transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-accent-warm/15 font-semibold"
                        title="Approve agents and start research immediately"
                      >
                        <Play className="w-3.5 h-3.5 fill-black" />
                        Approve & Launch
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Red Team Tribunal — live adversarial cross-examination */}
              {session.status === "redteaming" && (() => {
                const critiqueAgents = session.agents.filter(a => a.status === "completed");
                const currentAgent = session.agents.find(a => a.id === redTeamCurrentAgentId);
                const doneIds = new Set((session.critiques || []).map(c => c.agentId));
                return (
                  <div
                    className="mb-6 rounded-2xl border bg-bg-surface p-5 relative overflow-hidden"
                    style={{ borderColor: `${REDTEAM_HEX}66` }}
                  >
                    <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: REDTEAM_HEX }} />

                    {/* VEX identity block */}
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: `${REDTEAM_HEX}1a`, border: `1px solid ${REDTEAM_HEX}55` }}
                      >
                        <ShieldAlert className="w-6 h-6" style={{ color: REDTEAM_HEX }} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold font-display" style={{ color: REDTEAM_HEX }}>VEX</h3>
                          <span
                            className="text-[9px] font-mono uppercase tracking-widest font-bold px-2 py-0.5 rounded-md"
                            style={{ color: REDTEAM_HEX, background: `${REDTEAM_HEX}12`, border: `1px solid ${REDTEAM_HEX}33` }}
                          >
                            Red Team Tribunal
                          </span>
                        </div>
                        <p className="text-[10px] text-text-muted font-mono">Chief Adversarial Officer</p>
                      </div>
                    </div>

                    {/* Cross-examining ticker */}
                    <div className="flex items-center gap-2 mb-4 text-[10px] font-mono uppercase tracking-widest font-bold">
                      <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: REDTEAM_HEX }} />
                      <span style={{ color: REDTEAM_HEX }}>
                        CROSS-EXAMINING: {currentAgent ? currentAgent.name : "STANDBY"}
                      </span>
                    </div>

                    {/* Per-agent review chips */}
                    <div className="flex flex-wrap gap-2 mb-4">
                      {critiqueAgents.map(a => {
                        const isDone = doneIds.has(a.id);
                        const isReviewing = a.id === redTeamCurrentAgentId && !isDone;
                        return (
                          <span
                            key={a.id}
                            className="text-[9px] font-mono uppercase tracking-wider px-2 py-1 rounded-md flex items-center gap-1.5 border"
                            style={
                              isDone
                                ? { color: REDTEAM_HEX, borderColor: `${REDTEAM_HEX}44`, background: `${REDTEAM_HEX}10` }
                                : isReviewing
                                ? { color: REDTEAM_HEX, borderColor: `${REDTEAM_HEX}66`, background: `${REDTEAM_HEX}1a` }
                                : undefined
                            }
                          >
                            {isDone ? (
                              <Check className="w-2.5 h-2.5" />
                            ) : isReviewing ? (
                              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: REDTEAM_HEX }} />
                            ) : (
                              <span className="w-1.5 h-1.5 rounded-full bg-text-muted" />
                            )}
                            <span className={isDone || isReviewing ? "" : "text-text-muted"}>{a.name}</span>
                          </span>
                        );
                      })}
                    </div>

                    {/* Current critique streaming live */}
                    <div
                      className="rounded-xl border p-4 bg-bg-primary/40 max-h-[380px] overflow-y-auto"
                      style={{ borderColor: `${REDTEAM_HEX}33` }}
                    >
                      {redTeamStreamingCritique ? (
                        <div className="space-y-3 text-xs leading-relaxed font-sans text-text-secondary md:text-sm">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              h1: ({ node, ...props }) => <h1 className="text-lg font-bold text-text-primary mt-4 mb-2 font-display" {...props} />,
                              h2: ({ node, ...props }) => <h2 className="text-base font-semibold mt-4 mb-2 font-display" style={{ color: REDTEAM_HEX }} {...props} />,
                              h3: ({ node, ...props }) => <h3 className="text-sm font-semibold mt-3 mb-1.5 font-display" style={{ color: REDTEAM_HEX }} {...props} />,
                              p: ({ node, ...props }) => <p className="mb-3 leading-relaxed text-text-secondary text-xs sm:text-sm" {...props} />,
                              ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-3 space-y-1" {...props} />,
                              ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-3 space-y-1" {...props} />,
                              li: ({ node, ...props }) => <li className="text-text-secondary text-xs sm:text-sm" {...props} />,
                              blockquote: ({ node, ...props }) => (
                                <blockquote
                                  className="border-l-4 bg-bg-surface p-3 rounded-r-lg italic my-3 text-text-muted"
                                  style={{ borderColor: REDTEAM_HEX }}
                                  {...props}
                                />
                              ),
                              strong: ({ node, ...props }) => <strong className="font-bold text-text-primary" {...props} />,
                              code: ({ node, ...props }) => <code className="bg-bg-primary px-1.5 py-0.5 rounded font-mono text-xs border border-border-warm" style={{ color: REDTEAM_HEX }} {...props} />,
                            }}
                          >
                            {redTeamStreamingCritique}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-[11px] font-mono text-text-muted">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ color: REDTEAM_HEX }} />
                          Compiling adversarial cross-examination...
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Grid of active research specialists */}
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest font-mono">
                  Swarm Agents Status ({session.agents.length})
                </h3>
                {(session.status === "researching" || session.status === "redteaming" || session.status === "synthesizing") && (
                  <div className="flex items-center gap-1 bg-bg-surface border border-border-warm rounded-lg p-0.5">
                    <button
                      onClick={() => setSwarmViewMode("grid")}
                      className={`px-2.5 py-1 text-[9px] font-mono font-bold uppercase tracking-widest rounded-md transition-all cursor-pointer ${
                        swarmViewMode === "grid"
                          ? "bg-bg-primary border border-border-hi-warm text-accent-warm"
                          : "text-text-muted hover:text-text-secondary"
                      }`}
                    >
                      Grid
                    </button>
                    <button
                      onClick={() => setSwarmViewMode("network")}
                      className={`px-2.5 py-1 text-[9px] font-mono font-bold uppercase tracking-widest rounded-md transition-all cursor-pointer ${
                        swarmViewMode === "network"
                          ? "bg-bg-primary border border-border-hi-warm text-accent-warm"
                          : "text-text-muted hover:text-text-secondary"
                      }`}
                    >
                      Network
                    </button>
                  </div>
                )}
              </div>

              {swarmViewMode === "network" && (session.status === "researching" || session.status === "redteaming" || session.status === "synthesizing") ? (
                <SwarmNetwork
                  agents={session.agents}
                  agentProgress={agentProgress}
                  sessionStatus={session.status}
                  onSelectAgent={(a) => {
                    if (a.status === "completed") setViewingCompletedAgent(a);
                  }}
                />
              ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {session.agents.map((agent, idx) => {
                  const isVisible = assemblyStep > idx || session.status !== "assembling";
                  const prog = agentProgress[agent.id] || { percent: 0, statusText: "QUEUED" };
                  const colorTheme = agent.colorTheme;
                  const hexColor = getAgentColorHex(colorTheme);
                  const isCompleted = agent.status === "completed";

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
                  const sheet = getAgentSheet(agent.name, agent.role);

                  return (
                    <div 
                      key={agent.id}
                      onClick={() => {
                        if (isCompleted) {
                          setViewingCompletedAgent(agent);
                        }
                      }}
                      className={`rpg-card ${isCompleted ? "rpg-card-live cursor-pointer" : ""}`}
                      style={{ "--agent-accent": hexColor } as React.CSSProperties}
                    >
                      <div className="rpg-card-inner">
                      <div className="rpg-dither"></div>

                      {/* Header: portrait, nameplate, class, level */}
                      <div className="flex items-start gap-3 px-4 pt-3.5">
                        <div className="rpg-portrait">
                          <PixelAvatar name={agent.name} role={agent.role} themeColor={colorTheme} size="md" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="rpg-nameplate truncate">{agent.name}</h4>
                          <p className="rpg-class truncate mt-1">{agent.role}</p>
                          <div className="mt-1.5">
                            <span className={`rpg-status inline-block ${
                              agent.status === "completed" ? "text-success border-success/30 bg-success/10" :
                              agent.status === "working" ? "text-accent-warm border-accent-warm/30 bg-accent-warm/10 animate-pulse" :
                              agent.status === "failed" ? "text-error border-error/30 bg-error/10" :
                              "text-text-muted border-border-hi-warm bg-bg-primary/60"
                            }`}>
                              {RPG_STATUS[agent.status] || agent.status.toUpperCase()}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                          <span className="rpg-level">LV {sheet.level}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              saveAgentToLibrary(agent);
                            }}
                            className="w-5 h-5 rounded-md flex items-center justify-center transition-all cursor-pointer hover:bg-bg-primary"
                            style={{ color: isAgentInLibrary(agent) ? ROSTER_HEX : undefined }}
                            title={isAgentInLibrary(agent) ? "In Agent Library — click to refresh their saved specialty" : "Save this specialist to the Agent Library"}
                          >
                            {isAgentInLibrary(agent) ? <BookmarkCheck className="w-3.5 h-3.5" /> : <BookmarkPlus className="w-3.5 h-3.5 text-text-muted hover:text-text-secondary" />}
                          </button>
                          {session.status === "approval" && session.agents.length > 2 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDismissAgent(agent.id);
                              }}
                              className="w-5 h-5 rounded-md flex items-center justify-center text-text-muted hover:text-error hover:bg-error/10 transition-all cursor-pointer"
                              title="Dismiss this specialist node"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Ability Score Block */}
                      <div className="grid grid-cols-4 gap-2 px-4 mt-3">
                        {sheet.stats.map((stat) => (
                          <div key={stat.label}>
                            <div className="flex items-baseline justify-between mb-1">
                              <span className="rpg-label">{stat.label}</span>
                              <span className="rpg-stat-value">{stat.value}</span>
                            </div>
                            <div className="rpg-meter">
                              <div className="rpg-meter-fill" style={{ width: `${(stat.value / 20) * 100}%` }}></div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Quest Log — investigative focus */}
                      <div className="rpg-panel mx-4 mt-3">
                        <span className="rpg-label block mb-1.5">QUEST LOG</span>
                        <p className="text-[11px] text-text-secondary line-clamp-2 leading-relaxed italic">
                          "{agent.investigativeAngle}"
                        </p>
                      </div>

                      {/* Engine line */}
                      <div className="flex items-center gap-2 px-4 mt-3">
                        <span className="rpg-label">CORE</span>
                        <span className="rpg-stat-value uppercase">{modelBadge}</span>
                      </div>

                      {/* Progress and Tags Indicator at bottom */}
                      <div className="mt-auto mx-4 mb-4 pt-3 border-t border-border-warm space-y-3">
                        {session.status !== "approval" ? (
                          <div>
                            <div className="flex justify-between items-center mb-1.5">
                              <span className="rpg-label truncate max-w-[210px]">XP // {prog.statusText}</span>
                              <span className="rpg-stat-value">{prog.percent}%</span>
                            </div>
                            <div className="rpg-meter rpg-meter-xl">
                              <div className="rpg-meter-fill" style={{ width: `${prog.percent}%` }}></div>
                            </div>
                          </div>
                        ) : (
                          /* Approval Customization Input */
                          <div className="space-y-2.5">
                            <div className="flex items-center justify-between text-[9px] font-mono text-text-muted">
                              <span className="uppercase">NODE REVISION FOCUS</span>
                              {regeneratingAgentId === agent.id ? (
                                <span className="text-accent-warm animate-pulse">REBUILDING...</span>
                              ) : (
                                <span>READY</span>
                              )}
                            </div>
                            
                            {regeneratingAgentId === agent.id ? (
                              <div className="h-14 flex flex-col items-center justify-center gap-1.5 border border-dashed border-accent-warm/20 rounded-xl bg-accent-warm/5">
                                <RefreshCw className="w-3.5 h-3.5 text-accent-warm animate-spin" />
                                <span className="text-[9px] font-mono text-text-secondary">Generating fresh perspective...</span>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  value={nudgeTexts[agent.id] || ""}
                                  onChange={(e) => setNudgeTexts(prev => ({ ...prev, [agent.id]: e.target.value }))}
                                  placeholder="Focus angle adjustment (e.g. emphasize security)..."
                                  className="w-full bg-bg-primary text-text-primary placeholder:text-text-muted/50 text-[10px] px-2.5 py-1.5 rounded-lg border border-border-warm focus:outline-none focus:border-accent-warm transition-all font-mono"
                                  onClick={(e) => e.stopPropagation()} // prevent card click
                                  onKeyDown={(e) => {
                                    e.stopPropagation();
                                    if (e.key === "Enter") {
                                      handleRegenerateSingleAgent(agent.id);
                                    }
                                  }}
                                />
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRegenerateSingleAgent(agent.id);
                                  }}
                                  disabled={regeneratingAgentId !== null}
                                  className="w-full h-7 bg-bg-surface hover:bg-bg-primary border border-border-warm text-text-secondary hover:text-text-primary text-[10px] font-bold rounded-lg uppercase tracking-wider font-mono transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  Regenerate Node
                                </button>
                              </div>
                            )}
                          </div>
                        )}

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

                        {isCompleted && (
                          <div className="pt-1 text-right flex justify-end">
                            <span className="text-[9px] font-mono font-bold text-[var(--agent-accent)] uppercase tracking-wider flex items-center gap-1 hover:underline">
                              <BookOpen className="w-3 h-3" />
                              View Dossier
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="rpg-scanlines"></div>
                      </div>
                    </div>
                  );
                })}
              </div>
              )}
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
                  onClick={() => handleInitiateResearch(session.topic, session.priorContext)}
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

                  {/* Interrogation Room */}
                  <button
                    id="tab-interrogation-room"
                    onClick={() => setActiveReportViewerId("interrogate")}
                    className={`px-4 h-14 flex items-center gap-2 border-b-2 font-mono text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                      activeReportViewerId === "interrogate"
                        ? "border-accent-warm text-text-primary bg-bg-primary"
                        : "border-transparent text-text-muted hover:text-text-secondary"
                    }`}
                  >
                    <MessagesSquare className="w-3.5 h-3.5 text-accent-warm" />
                    Interrogation Room
                    {session.chat && session.chat.length > 0 && (
                      <span className="min-w-4 h-4 px-1 flex items-center justify-center rounded-full bg-accent-warm/15 border border-accent-warm/30 text-accent-warm text-[9px] font-bold">
                        {session.chat.length}
                      </span>
                    )}
                  </button>

                  {/* Red Team critiques */}
                  {session.critiques && session.critiques.length > 0 && (
                    <>
                      <div className="h-14 w-[1px] bg-border-warm flex-shrink-0"></div>
                      <button
                        id="tab-red-team"
                        onClick={() => setActiveReportViewerId("redteam")}
                        className="px-4 h-14 flex items-center gap-2 border-b-2 font-mono text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap"
                        style={
                          activeReportViewerId === "redteam"
                            ? { borderColor: REDTEAM_HEX, color: "var(--color-text-primary)", background: "var(--color-bg-primary)" }
                            : { borderColor: "transparent" }
                        }
                      >
                        <ShieldAlert className="w-3.5 h-3.5" style={{ color: REDTEAM_HEX }} />
                        <span className={activeReportViewerId === "redteam" ? "text-text-primary" : "text-text-muted"}>Red Team</span>
                        <span
                          className="min-w-4 h-4 px-1 flex items-center justify-center rounded-full text-[9px] font-bold"
                          style={{ color: REDTEAM_HEX, background: `${REDTEAM_HEX}26`, border: `1px solid ${REDTEAM_HEX}4d` }}
                        >
                          {session.critiques.length}
                        </span>
                      </button>
                    </>
                  )}

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

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => setShowReader(true)}
                    disabled={activeReportViewerId === "interrogate" || !activeText}
                    className="h-8 w-8 flex items-center justify-center bg-bg-primary border border-border-warm text-text-secondary hover:text-accent-warm rounded-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Open the active report in distraction-free Reader Mode"
                  >
                    <BookOpenText className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handlePrintDossier}
                    className="h-8 w-8 flex items-center justify-center bg-bg-primary border border-border-warm text-text-secondary hover:text-accent-warm rounded-lg transition-all cursor-pointer"
                    title="Open a paper-ready print / Save-as-PDF view of the full dossier"
                  >
                    <Printer className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleCopyReport(activeText)}
                    disabled={!activeText}
                    className="h-8 px-3 bg-bg-primary hover:bg-bg-primary border border-border-warm text-text-secondary hover:text-text-primary text-[10px] font-mono font-bold rounded-lg uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Copy full markdown report to clipboard"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-success" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy Report
                      </>
                    )}
                  </button>

                  <div className="h-6 w-[1px] bg-border-warm mx-0.5"></div>

                  <button
                    onClick={() => handleSaveReport(activeText, activeTitle)}
                    disabled={!activeText}
                    className="h-8 px-3 bg-bg-primary hover:bg-bg-primary border border-border-warm text-text-secondary hover:text-text-primary text-[10px] font-mono font-bold rounded-lg uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Save the active report as a Markdown (.md) file"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Save .md
                  </button>
                  <button
                    onClick={handleExportDossier}
                    className="h-8 px-3 bg-accent-warm hover:bg-accent-hi-warm text-black text-[10px] font-mono font-bold rounded-lg uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
                    title="Export the entire mission as a styled, standalone HTML dossier"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    Export Dossier
                  </button>
                </div>
              </div>

              {/* Interrogation Room OR Document Container */}
              {activeReportViewerId === "interrogate" ? (
                <InterrogationRoom
                  session={session}
                  settings={settings}
                  onPersist={(updated) => { setSession(updated); saveToHistory(updated); }}
                  getAgentColorHex={getAgentColorHex}
                  onLaunchFollowUp={handleLaunchFollowUp}
                />
              ) : activeReportViewerId === "redteam" ? (
                <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-bg-primary">
                  <div className="max-w-3xl mx-auto">
                    <div className="mb-8 pb-6 border-b border-border-warm">
                      <div className="flex items-center gap-2 text-[10px] font-mono font-bold uppercase tracking-widest mb-2.5" style={{ color: REDTEAM_HEX }}>
                        <ShieldAlert className="w-3.5 h-3.5" style={{ color: REDTEAM_HEX }} />
                        Red Team Adversarial Review
                      </div>
                      <h1 className="text-2xl md:text-3xl font-extrabold text-text-primary tracking-tight leading-tight mb-2 font-display">
                        VEX Cross-Examination
                      </h1>
                      <p className="text-xs text-text-muted font-mono">
                        Chief Adversarial Officer • {session.critiques?.length || 0} specialist report{(session.critiques?.length || 0) === 1 ? "" : "s"} stress-tested
                      </p>
                    </div>

                    <div className="space-y-6">
                      {(session.critiques || []).map((c) => (
                        <div
                          key={c.agentId}
                          className="rounded-2xl border bg-bg-surface/40 p-5 relative overflow-hidden"
                          style={{ borderColor: `${REDTEAM_HEX}55` }}
                        >
                          <div className="absolute top-0 left-0 h-full w-[3px]" style={{ background: REDTEAM_HEX }} />
                          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border-warm">
                            <ShieldAlert className="w-4 h-4 flex-shrink-0" style={{ color: REDTEAM_HEX }} />
                            <div className="min-w-0">
                              <h3 className="text-sm font-bold text-text-primary font-display truncate">{c.agentName}</h3>
                              <p className="text-[10px] text-text-muted font-mono truncate">{c.agentRole}</p>
                            </div>
                          </div>
                          <div className="space-y-3 text-xs leading-relaxed font-sans text-text-secondary md:text-sm">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                h1: ({ node, ...props }) => <h1 className="text-lg font-bold text-text-primary mt-4 mb-2 font-display" {...props} />,
                                h2: ({ node, ...props }) => <h2 className="text-base font-semibold mt-4 mb-2 font-display" style={{ color: REDTEAM_HEX }} {...props} />,
                                h3: ({ node, ...props }) => <h3 className="text-sm font-semibold mt-3 mb-1.5 font-display" style={{ color: REDTEAM_HEX }} {...props} />,
                                p: ({ node, ...props }) => <p className="mb-3 leading-relaxed text-text-secondary text-xs sm:text-sm" {...props} />,
                                ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-3 space-y-1" {...props} />,
                                ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-3 space-y-1" {...props} />,
                                li: ({ node, ...props }) => <li className="text-text-secondary text-xs sm:text-sm" {...props} />,
                                blockquote: ({ node, ...props }) => (
                                  <blockquote
                                    className="border-l-4 bg-bg-surface p-3 rounded-r-lg italic my-3 text-text-muted"
                                    style={{ borderColor: REDTEAM_HEX }}
                                    {...props}
                                  />
                                ),
                                strong: ({ node, ...props }) => <strong className="font-bold text-text-primary" {...props} />,
                                code: ({ node, ...props }) => <code className="bg-bg-primary px-1.5 py-0.5 rounded font-mono text-xs border border-border-warm" style={{ color: REDTEAM_HEX }} {...props} />,
                                table: ({ node, ...props }) => <div className="overflow-x-auto my-4"><table className="min-w-full divide-y divide-border-warm border border-border-warm rounded-lg text-xs" {...props} /></div>,
                                th: ({ node, ...props }) => <th className="bg-bg-primary px-4 py-2 text-left font-semibold text-text-primary" {...props} />,
                                td: ({ node, ...props }) => <td className="px-4 py-2 border-t border-border-warm" {...props} />,
                              }}
                            >
                              {c.critique}
                            </ReactMarkdown>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
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
                          <ReactMarkdown remarkPlugins={[remarkGfm]}
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
                              <ReactMarkdown remarkPlugins={[remarkGfm]}
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
                                  table: ({ node, ...props }) => <div className="overflow-x-auto my-6"><table className="min-w-full divide-y divide-border-warm border border-border-warm rounded-lg text-xs" {...props} /></div>,
                                  th: ({ node, ...props }) => <th className="bg-bg-primary px-4 py-2 text-left font-semibold text-text-primary" {...props} />,
                                  td: ({ node, ...props }) => <td className="px-4 py-2 border-t border-border-warm" {...props} />,
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
              )}
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

      {/* Agent Library overlay — saved specialists for Roster Mode */}
      {showAgentLibrary && (
        <AgentLibrary
          library={agentLibrary}
          onClose={() => setShowAgentLibrary(false)}
          onForge={(agent) => saveAgentToLibrary(agent)}
          onDelete={(id) => setAgentLibrary(prev => prev.filter(s => s.id !== id))}
          getAgentColorHex={getAgentColorHex}
        />
      )}

      {/* Knowledge Library overlay */}
      {libraryOpen && (
        <KnowledgeLibrary
          sessions={history}
          onClose={() => setLibraryOpen(false)}
          onOpenSession={(s) => {
            setSession(s);
            setTopic(s.topic);
            setLibraryOpen(false);
            addLog("SYSTEM", `Restored historic research swarm for: "${s.label || s.topic}"`, "success");
          }}
          onToggleFavorite={toggleFavorite}
          onRename={renameSession}
          onDelete={deleteSession}
          onSetTags={setSessionTags}
          onImport={importSessions}
          getAgentColorHex={getAgentColorHex}
          addLog={addLog}
        />
      )}

      {/* Distraction-free Reader Mode overlay */}
      {showReader && activeText && (
        <ReaderMode
          title={activeTitle}
          markdown={activeText}
          accentHex={
            activeReportViewerId === "synthesis"
              ? undefined
              : getAgentColorHex(session?.agents.find((a) => a.id === activeReportViewerId)?.colorTheme || "")
          }
          onClose={() => setShowReader(false)}
        />
      )}

      {/* Completed Agent Dossier View Modal */}
      {viewingCompletedAgent && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl h-[85vh] bg-bg-surface border border-border-warm rounded-2xl flex flex-col overflow-hidden shadow-2xl relative">
            
            {/* Header */}
            <div className="p-5 border-b border-border-warm flex items-center justify-between bg-bg-primary/50 flex-shrink-0">
              <div className="flex items-center gap-3">
                <PixelAvatar 
                  name={viewingCompletedAgent.name} 
                  role={viewingCompletedAgent.role} 
                  themeColor={viewingCompletedAgent.colorTheme} 
                  size="sm" 
                />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-text-primary font-display">
                      {viewingCompletedAgent.name}
                    </h3>
                    <span 
                      className="text-[9px] font-mono font-medium px-2 py-0.5 rounded border"
                      style={{ 
                        color: getAgentColorHex(viewingCompletedAgent.colorTheme), 
                        borderColor: `${getAgentColorHex(viewingCompletedAgent.colorTheme)}30`,
                        backgroundColor: `${getAgentColorHex(viewingCompletedAgent.colorTheme)}08`
                      }}
                    >
                      {viewingCompletedAgent.role.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-[10px] text-text-muted font-mono mt-0.5">
                    Completed Specialist Dossier • Real-Time Research Thread
                  </p>
                </div>
              </div>

              {/* Close Button */}
              <button
                onClick={() => setViewingCompletedAgent(null)}
                className="w-8 h-8 rounded-full border border-border-warm bg-bg-surface text-text-muted hover:text-text-primary flex items-center justify-center transition-all cursor-pointer"
                title="Close dossier"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Dossier Meta/Angle */}
            <div className="px-6 py-4 bg-bg-primary/20 border-b border-border-warm flex-shrink-0">
              <span className="text-[9px] font-mono font-bold text-text-muted uppercase tracking-wider block mb-1">
                Assigned Investigative Angle
              </span>
              <p className="text-xs text-text-secondary italic">
                "{viewingCompletedAgent.investigativeAngle}"
              </p>
            </div>

            {/* Markdown Content scroll container */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-bg-primary">
              <article className="prose prose-invert max-w-none text-text-secondary">
                <div className="space-y-4 text-xs leading-relaxed font-sans text-text-secondary md:text-sm">
                  {viewingCompletedAgent.report ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}
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
                        table: ({ node, ...props }) => <div className="overflow-x-auto my-6"><table className="min-w-full divide-y divide-border-warm border border-border-warm rounded-lg text-xs" {...props} /></div>,
                        th: ({ node, ...props }) => <th className="bg-bg-primary px-4 py-2 text-left font-semibold text-text-primary" {...props} />,
                        td: ({ node, ...props }) => <td className="px-4 py-2 border-t border-border-warm" {...props} />,
                      }}
                    >
                      {viewingCompletedAgent.report}
                    </ReactMarkdown>
                  ) : (
                    <div className="p-8 text-center text-text-muted font-mono bg-bg-primary rounded-xl border border-dashed border-border-warm">
                      Thread empty. This specialist has not saved any content yet.
                    </div>
                  )}
                </div>
              </article>
            </div>

            {/* Footer with copy/download */}
            <div className="p-4 border-t border-border-warm bg-bg-surface flex items-center justify-between flex-shrink-0">
              <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider">
                Authorized Node Intelligence
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => handleCopyReport(viewingCompletedAgent.report || "")}
                  disabled={!viewingCompletedAgent.report}
                  className="h-8 px-3 bg-bg-primary hover:bg-bg-primary border border-border-warm text-text-secondary hover:text-text-primary text-[10px] font-mono font-bold rounded-lg uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-success" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy Dossier
                    </>
                  )}
                </button>
                <button
                  onClick={() => handleSaveReport(viewingCompletedAgent.report || "", `${viewingCompletedAgent.name} (${viewingCompletedAgent.role}) Dossier`)}
                  disabled={!viewingCompletedAgent.report}
                  className="h-8 px-3 bg-accent-warm hover:bg-accent-hi-warm text-black text-[10px] font-mono font-bold rounded-lg uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  Save Dossier
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Recruit Custom Specialist Modal */}
      {showRecruitModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-bg-surface border border-border-warm rounded-2xl flex flex-col overflow-hidden shadow-2xl relative animate-fade-in">
            {/* Header */}
            <div className="p-5 border-b border-border-warm flex items-center justify-between bg-bg-primary/50 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <UserPlus className="w-4 h-4 text-accent-warm" />
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-accent-warm">
                    Recruit Specialist
                  </h3>
                  <p className="text-[10px] text-text-muted font-mono mt-0.5">
                    Manually deploy a custom node into the swarm
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowRecruitModal(false)}
                className="w-8 h-8 rounded-full border border-border-warm bg-bg-surface text-text-muted hover:text-text-primary flex items-center justify-center transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Live Preview */}
              <div className="flex items-center gap-3 p-3 bg-bg-primary border border-border-warm rounded-xl">
                <PixelAvatar
                  name={recruitName || "New Specialist"}
                  role={recruitRole || "Investigator"}
                  themeColor={recruitColor}
                  size="sm"
                />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-text-primary font-display truncate">
                    {recruitName || "New Specialist"}
                  </div>
                  <div className="text-[10px] text-text-muted font-mono truncate">
                    {recruitRole || "Awaiting role assignment"}
                  </div>
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="text-[9px] font-mono uppercase tracking-widest font-bold text-text-muted block mb-1.5">
                  Name
                </label>
                <input
                  type="text"
                  value={recruitName}
                  onChange={(e) => setRecruitName(e.target.value)}
                  placeholder="e.g. Dr. Aris Vance"
                  className="w-full bg-bg-primary text-text-primary placeholder:text-text-muted/50 text-xs px-3 py-2 rounded-lg border border-border-warm focus:outline-none focus:border-accent-warm transition-all font-sans"
                />
              </div>

              {/* Role */}
              <div>
                <label className="text-[9px] font-mono uppercase tracking-widest font-bold text-text-muted block mb-1.5">
                  Role / Specialty
                </label>
                <input
                  type="text"
                  value={recruitRole}
                  onChange={(e) => setRecruitRole(e.target.value)}
                  placeholder="e.g. Cryptographic Analyst"
                  className="w-full bg-bg-primary text-text-primary placeholder:text-text-muted/50 text-xs px-3 py-2 rounded-lg border border-border-warm focus:outline-none focus:border-accent-warm transition-all font-sans"
                />
              </div>

              {/* Investigative Angle */}
              <div>
                <label className="text-[9px] font-mono uppercase tracking-widest font-bold text-text-muted block mb-1.5">
                  Investigative Angle
                </label>
                <textarea
                  value={recruitAngle}
                  onChange={(e) => setRecruitAngle(e.target.value)}
                  placeholder="Describe the specific angle this specialist must investigate..."
                  className="w-full min-h-[70px] bg-bg-primary text-text-primary placeholder:text-text-muted/50 text-xs px-3 py-2 rounded-lg border border-border-warm focus:outline-none focus:border-accent-warm transition-all font-sans leading-relaxed resize-none"
                />
              </div>

              {/* Theme Color */}
              <div>
                <label className="text-[9px] font-mono uppercase tracking-widest font-bold text-text-muted block mb-1.5">
                  Theme Color
                </label>
                <div className="flex flex-wrap gap-2.5">
                  {AGENT_COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      onClick={() => setRecruitColor(c)}
                      title={c}
                      style={{
                        backgroundColor: getAgentColorHex(c),
                        boxShadow: recruitColor === c ? `0 0 0 2px var(--color-bg-surface), 0 0 0 4px ${getAgentColorHex(c)}` : undefined,
                      }}
                      className={`w-7 h-7 rounded-lg transition-all cursor-pointer ${
                        recruitColor === c ? "scale-105" : "opacity-70 hover:opacity-100 hover:scale-110"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-border-warm bg-bg-surface flex items-center justify-between flex-shrink-0">
              <button
                onClick={() => setShowRecruitModal(false)}
                className="text-[10px] font-mono uppercase tracking-wider text-text-muted hover:text-text-secondary transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleRecruitSpecialist}
                disabled={!recruitName.trim() || !recruitRole.trim() || !recruitAngle.trim()}
                className="px-5 py-2.5 bg-accent-warm hover:bg-accent-hi-warm disabled:bg-border-warm disabled:text-text-muted text-black text-[10px] font-bold rounded-xl uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed shadow-lg shadow-accent-warm/10"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Deploy Recruit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border-warm rounded-2xl w-full max-w-3xl h-[85vh] flex flex-col overflow-hidden shadow-2xl relative animate-fade-in text-text-primary">
            {/* Header */}
            <div className="p-6 border-b border-border-warm flex items-start justify-between bg-bg-surface flex-shrink-0">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider font-mono text-accent-warm flex items-center gap-2">
                  <Settings className="w-4 h-4 animate-spin-slow" />
                  Swarm Intelligence Node Settings
                </h3>
                <p className="text-[11px] text-text-secondary mt-1 leading-relaxed">
                  Supply custom credentials to integrate third-party models and route specialist tasks dynamically.
                </p>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="w-8 h-8 rounded-full border border-border-warm bg-bg-surface text-text-muted hover:text-text-primary flex items-center justify-center transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body: Left menu, Right content */}
            <div className="flex-1 flex overflow-hidden">
              {/* Left Menu Tab bar */}
              <div className="w-[180px] border-r border-border-warm bg-bg-primary/30 p-4 flex flex-col gap-1.5 flex-shrink-0">
                <button
                  onClick={() => setSettingsTab("providers")}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                    settingsTab === "providers" 
                      ? "bg-bg-surface border border-border-warm text-accent-warm shadow-md" 
                      : "text-text-secondary hover:text-text-primary hover:bg-bg-primary/40"
                  }`}
                >
                  <Key className="w-3.5 h-3.5" />
                  API Credentials
                </button>
                <button
                  onClick={() => setSettingsTab("routing")}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                    settingsTab === "routing" 
                      ? "bg-bg-surface border border-border-warm text-accent-warm shadow-md" 
                      : "text-text-secondary hover:text-text-primary hover:bg-bg-primary/40"
                  }`}
                >
                  <Cpu className="w-3.5 h-3.5" />
                  Specialist Routing
                </button>
                
                <div className="mt-auto p-2.5 bg-bg-primary/50 rounded-lg border border-border-warm/60">
                  <div className="text-[9px] font-mono font-bold text-text-muted uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Database className="w-2.5 h-2.5" /> Storage Mode
                  </div>
                  <div className="text-[10px] text-text-secondary font-sans leading-relaxed">
                    Browser local state persistence active.
                  </div>
                </div>
              </div>

              {/* Right Content pane */}
              <div className="flex-1 overflow-y-auto p-6 bg-bg-surface">
                {settingsTab === "providers" ? (
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-text-primary mb-3">
                        Third-Party & Local Model Providers
                      </h4>
                      <p className="text-[11px] text-text-secondary leading-relaxed mb-4">
                        API keys are never exposed in the client. All calls are proxied securely through the local workspace server. Click <strong>Fetch & Validate</strong> to retrieve active models.
                      </p>
                    </div>

                    <div className="space-y-4">
                      {Object.keys(settings.providers).map((key) => {
                        const prov = settings.providers[key as keyof typeof settings.providers];
                        const isLocal = key === "lmstudio" || key === "ollama";
                        const displayName = key === "gemini" ? "Google Gemini" :
                                            key === "openrouter" ? "OpenRouter" :
                                            key === "anthropic" ? "Anthropic" :
                                            key === "openai" ? "OpenAI" :
                                            key === "venice" ? "Venice AI" :
                                            key === "lmstudio" ? "LM Studio (Local)" : "Ollama (Local)";

                        return (
                          <div key={key} className="p-4 rounded-xl border border-border-warm bg-bg-primary/20 space-y-3.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold font-mono text-text-primary flex items-center gap-1.5 uppercase">
                                <span className={`w-2 h-2 rounded-full ${prov.enabled && prov.fetchedModels.length > 0 ? "bg-accent-warm" : "bg-border-warm"}`}></span>
                                {displayName}
                              </span>
                              
                              <button
                                onClick={() => handleFetchModels(key)}
                                disabled={testingConnection !== null || (!isLocal && !prov.apiKey && key !== "gemini" && !envKeys[key])}
                                className="px-3 py-1.5 bg-bg-surface hover:bg-bg-primary border border-border-warm hover:border-border-hi-warm text-text-secondary hover:text-text-primary disabled:opacity-50 text-[10px] font-mono font-bold rounded uppercase tracking-wider cursor-pointer flex items-center gap-1.5 transition-all"
                              >
                                {testingConnection === key ? (
                                  <>
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                    Fetching...
                                  </>
                                ) : (
                                  <>
                                    <RefreshCw className="w-3 h-3" />
                                    Fetch & Validate
                                  </>
                                )}
                              </button>
                            </div>

                            {/* Credentials inputs */}
                            <div className="grid grid-cols-1 gap-3">
                              {!isLocal ? (
                                <div>
                                  <label className="text-[9px] font-bold font-mono uppercase text-text-muted tracking-wider block mb-1">
                                    API Key
                                  </label>
                                  <input
                                    type="password"
                                    placeholder={envKeys[key] ? "Using key from server .env — leave empty or override here" : key === "gemini" ? "Using default GEMINI_API_KEY environment variable if empty" : `Enter your ${displayName} API Key`}
                                    value={prov.apiKey}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setSettings(prev => ({
                                        ...prev,
                                        providers: {
                                          ...prev.providers,
                                          [key]: { ...prev.providers[key as keyof typeof prev.providers], apiKey: val }
                                        }
                                      }));
                                    }}
                                    className="w-full bg-bg-primary border border-border-warm text-text-primary rounded-lg p-2.5 text-xs focus:outline-none focus:border-border-hi-warm font-mono"
                                  />
                                </div>
                              ) : (
                                <div>
                                  <label className="text-[9px] font-bold font-mono uppercase text-text-muted tracking-wider block mb-1">
                                    Base Endpoint URL
                                  </label>
                                  <input
                                    type="text"
                                    placeholder={key === "lmstudio" ? "http://localhost:1234/v1" : "http://localhost:11434"}
                                    value={prov.baseUrl}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setSettings(prev => ({
                                        ...prev,
                                        providers: {
                                          ...prev.providers,
                                          [key]: { ...prev.providers[key as keyof typeof prev.providers], baseUrl: val }
                                        }
                                      }));
                                    }}
                                    className="w-full bg-bg-primary border border-border-warm text-text-primary rounded-lg p-2.5 text-xs focus:outline-none focus:border-border-hi-warm font-mono"
                                  />
                                </div>
                              )}
                            </div>

                            {/* Connection Status messages */}
                            {connectionStatus[key] && (
                              <div className={`p-2.5 rounded-lg border text-[10px] leading-relaxed font-mono ${
                                connectionStatus[key].success 
                                  ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400"
                                  : "bg-rose-500/5 border-rose-500/20 text-rose-400"
                              }`}>
                                {connectionStatus[key].message}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-text-primary mb-3">
                        Specialist Swarm Workload Routing
                      </h4>
                      <p className="text-[11px] text-text-secondary leading-relaxed mb-4">
                        Bind specific specialist task stages to individual models. Ensure models are fetched first in the API Credentials tab before routing.
                      </p>
                    </div>

                    <div className="space-y-5">
                      {["orchestrator", "agent", "synthesis"].map((role) => {
                        const mapping = settings.modelMapping[role as keyof typeof settings.modelMapping];
                        const displayName = role === "orchestrator" ? "Lead Orchestrator (Assembles agents)" :
                                            role === "agent" ? "Specialist Investigators (Conduct parallel research)" :
                                            "Compiler Synthesizer (Merges final report)";
                        
                        // Get available models for selected provider
                        const selectedProvider = mapping.provider;
                        const providerConfig = settings.providers[selectedProvider as keyof typeof settings.providers];
                        const availableModels = [...(providerConfig?.fetchedModels || [])].sort((a, b) => a.localeCompare(b));

                        return (
                          <div key={role} className="p-4 rounded-xl border border-border-warm bg-bg-primary/20 space-y-3.5">
                            <span className="text-xs font-bold text-accent-warm block font-display capitalize">
                              {displayName}
                            </span>

                            <div className="grid grid-cols-2 gap-4">
                              {/* Provider selection */}
                              <div>
                                <label className="text-[9px] font-bold font-mono uppercase text-text-muted tracking-wider block mb-1">
                                  Select Provider
                                </label>
                                <select
                                  value={mapping.provider}
                                  onChange={(e) => {
                                    const nextProv = e.target.value;
                                    const nextProvConfig = settings.providers[nextProv as keyof typeof settings.providers];
                                    const firstModel = nextProvConfig?.fetchedModels?.[0] || "";
                                    setSettings(prev => ({
                                      ...prev,
                                      modelMapping: {
                                        ...prev.modelMapping,
                                        [role]: { provider: nextProv, model: firstModel }
                                      }
                                    }));
                                  }}
                                  className="w-full bg-bg-primary border border-border-warm text-text-primary rounded-lg p-2.5 text-xs focus:outline-none focus:border-border-hi-warm cursor-pointer font-sans"
                                >
                                  {Object.keys(settings.providers).map((k) => {
                                    const prov = settings.providers[k as keyof typeof settings.providers];
                                    const isConfigured = prov.fetchedModels.length > 0 || k === "gemini";
                                    return (
                                      <option key={k} value={k}>
                                        {k.toUpperCase()} {!isConfigured ? "(NOT FETCHED)" : ""}
                                      </option>
                                    );
                                  })}
                                </select>
                              </div>

                              {/* Model selection */}
                              <div>
                                <label className="text-[9px] font-bold font-mono uppercase text-text-muted tracking-wider block mb-1">
                                  Choose Model
                                </label>
                                {availableModels.length > 0 ? (
                                  <select
                                    value={mapping.model}
                                    onChange={(e) => {
                                      const nextModel = e.target.value;
                                      setSettings(prev => ({
                                        ...prev,
                                        modelMapping: {
                                          ...prev.modelMapping,
                                          [role]: { ...prev.modelMapping[role as keyof typeof prev.modelMapping], model: nextModel }
                                        }
                                      }));
                                    }}
                                    className="w-full bg-bg-primary border border-border-warm text-text-primary rounded-lg p-2.5 text-xs focus:outline-none focus:border-border-hi-warm cursor-pointer font-mono"
                                  >
                                    {availableModels.map((m) => (
                                      <option key={m} value={m}>
                                        {m}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <div className="space-y-1">
                                    <input
                                      type="text"
                                      placeholder="Manual model identifier (e.g. llama3)"
                                      value={mapping.model}
                                      onChange={(e) => {
                                        const nextModel = e.target.value;
                                        setSettings(prev => ({
                                          ...prev,
                                          modelMapping: {
                                            ...prev.modelMapping,
                                            [role]: { ...prev.modelMapping[role as keyof typeof prev.modelMapping], model: nextModel }
                                          }
                                        }));
                                      }}
                                      className="w-full bg-bg-primary border border-border-warm text-text-primary rounded-lg p-2.5 text-xs focus:outline-none focus:border-border-hi-warm font-mono"
                                    />
                                    <span className="text-[8px] text-text-muted italic block leading-normal">
                                      No models cached for {selectedProvider.toUpperCase()}. Type manually above or Fetch models in API tab first.
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-border-warm bg-bg-surface flex items-center justify-between flex-shrink-0">
              <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider">
                Config state saved dynamically
              </span>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="px-5 py-2.5 bg-accent-warm hover:bg-accent-hi-warm text-black text-xs font-bold rounded-xl uppercase tracking-wider transition-all duration-150 flex items-center gap-1.5 cursor-pointer shadow-lg shadow-accent-warm/10"
              >
                <Save className="w-4 h-4" />
                Apply Configuration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
