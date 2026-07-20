import React, { useState } from "react";
import { Users, X, Trash2, UserPlus, Hammer } from "lucide-react";
import PixelAvatar from "./PixelAvatar";
import { SavedAgent } from "../types";

interface AgentLibraryProps {
  library: SavedAgent[];
  onClose: () => void;
  // Reuses App's save helper: same name+role refreshes instead of duplicating.
  onForge: (agent: { name: string; role: string; investigativeAngle: string; colorTheme: string }) => void;
  onDelete: (id: string) => void;
  getAgentColorHex: (theme: string) => string;
}

// Mirror of AGENT_COLOR_PALETTE in App.tsx (kept local to avoid exporting
// App internals; update both if the palette ever changes).
const COLOR_OPTIONS = ["cyan", "emerald", "rose", "amber", "purple", "indigo", "blue", "fuchsia"];

const ROSTER_HEX = "#3b82f6";

export default function AgentLibrary({ library, onClose, onForge, onDelete, getAgentColorHex }: AgentLibraryProps) {
  const [showForge, setShowForge] = useState(false);
  const [forgeName, setForgeName] = useState("");
  const [forgeRole, setForgeRole] = useState("");
  const [forgeAngle, setForgeAngle] = useState("");
  const [forgeColor, setForgeColor] = useState("cyan");
  // Two-step delete: first click arms, second confirms (matches the
  // Knowledge Library's cautious-delete philosophy without a timer).
  const [armedDelete, setArmedDelete] = useState<string | null>(null);

  const canForge = forgeName.trim() && forgeRole.trim() && forgeAngle.trim();

  const handleForge = () => {
    if (!canForge) return;
    onForge({
      name: forgeName.trim(),
      role: forgeRole.trim(),
      investigativeAngle: forgeAngle.trim(),
      colorTheme: forgeColor,
    });
    setForgeName("");
    setForgeRole("");
    setForgeAngle("");
    setForgeColor("cyan");
    setShowForge(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-3xl max-h-[85vh] bg-bg-primary border border-border-warm rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-warm bg-bg-surface flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center border" style={{ background: `${ROSTER_HEX}1a`, borderColor: `${ROSTER_HEX}55` }}>
              <Users className="w-4 h-4" style={{ color: ROSTER_HEX }} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-text-primary font-display">Agent Library</h2>
              <p className="text-[10px] font-mono text-text-muted">
                {library.length} saved specialist{library.length === 1 ? "" : "s"} — Roster Mode drafts exclusively from this list
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowForge(v => !v)}
              className="h-8 px-3 border text-[9px] font-mono font-bold rounded-lg uppercase tracking-widest transition-all flex items-center gap-1.5 cursor-pointer"
              style={showForge
                ? { color: ROSTER_HEX, borderColor: `${ROSTER_HEX}88`, background: `${ROSTER_HEX}1a` }
                : { color: "var(--color-text-muted, #8a8a8a)", borderColor: "var(--color-border-warm, #3a3a3a)" }}
              title="Forge a new specialist by hand"
            >
              <Hammer className="w-3 h-3" />
              Forge Agent
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-primary transition-all cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Forge form */}
        {showForge && (
          <div className="px-5 py-4 border-b border-border-warm bg-bg-surface/50 flex-shrink-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-2.5">
              <input
                value={forgeName}
                onChange={(e) => setForgeName(e.target.value)}
                placeholder="Persona name (e.g. Kestrel)"
                className="bg-bg-primary border border-border-warm rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-warm/50"
              />
              <input
                value={forgeRole}
                onChange={(e) => setForgeRole(e.target.value)}
                placeholder="Specialty title (e.g. Declassified-Archives Analyst)"
                className="bg-bg-primary border border-border-warm rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-warm/50"
              />
            </div>
            <textarea
              value={forgeAngle}
              onChange={(e) => setForgeAngle(e.target.value)}
              rows={2}
              placeholder="Standing specialty — what this agent is for. In Roster Mode the orchestrator tailors each mission assignment from this."
              className="w-full resize-none bg-bg-primary border border-border-warm rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-warm/50"
            />
            <div className="flex items-center justify-between mt-2.5">
              <div className="flex items-center gap-1.5">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setForgeColor(c)}
                    className={`w-5 h-5 rounded-full cursor-pointer transition-transform ${forgeColor === c ? "scale-125 ring-2 ring-text-primary/60" : "hover:scale-110"}`}
                    style={{ backgroundColor: getAgentColorHex(c) }}
                    title={c}
                  />
                ))}
              </div>
              <button
                onClick={handleForge}
                disabled={!canForge}
                className="h-8 px-4 text-black text-[10px] font-bold rounded-lg uppercase tracking-wider font-mono transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: ROSTER_HEX }}
              >
                <UserPlus className="w-3.5 h-3.5" />
                Add to Library
              </button>
            </div>
          </div>
        )}

        {/* Roster list */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {library.length === 0 ? (
            <div className="text-center py-14">
              <Users className="w-10 h-10 mx-auto mb-3 text-text-muted opacity-40" />
              <p className="text-xs text-text-secondary font-mono mb-1.5">The library is empty.</p>
              <p className="text-[10px] text-text-muted font-mono max-w-sm mx-auto leading-relaxed">
                Save specialists from any swarm with the bookmark icon on their card, or forge one by hand. With 2+ saved, arm Roster Mode in Mission Parameters to draft teams exclusively from here.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {library.map((agent) => (
                <div key={agent.id} className="flex items-start gap-3 bg-bg-surface border border-border-warm hover:border-border-hi-warm rounded-xl p-3 transition-colors">
                  <PixelAvatar name={agent.name} role={agent.role} themeColor={agent.colorTheme} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-xs font-bold font-display" style={{ color: getAgentColorHex(agent.colorTheme) }}>
                        {agent.name}
                      </span>
                      <span className="text-[9px] font-mono uppercase tracking-widest font-bold text-text-muted truncate">
                        {agent.role}
                      </span>
                    </div>
                    <p className="text-[11px] text-text-secondary italic leading-relaxed mt-1 line-clamp-2">
                      "{agent.investigativeAngle}"
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[9px] font-mono text-text-muted">saved {agent.savedAt}</span>
                      {(agent.timesDeployed || 0) > 0 && (
                        <span className="text-[8px] font-mono uppercase tracking-widest font-bold px-1.5 py-0.5 rounded border" style={{ color: ROSTER_HEX, borderColor: `${ROSTER_HEX}55`, background: `${ROSTER_HEX}12` }}>
                          {agent.timesDeployed} mission{agent.timesDeployed === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (armedDelete === agent.id) {
                        onDelete(agent.id);
                        setArmedDelete(null);
                      } else {
                        setArmedDelete(agent.id);
                      }
                    }}
                    onBlur={() => setArmedDelete(null)}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer flex-shrink-0 ${
                      armedDelete === agent.id
                        ? "text-error bg-error/10 border border-error/40"
                        : "text-text-muted hover:text-error hover:bg-error/10"
                    }`}
                    title={armedDelete === agent.id ? "Click again to confirm removal" : "Remove from library"}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
