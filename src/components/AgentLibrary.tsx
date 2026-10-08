import React, { useState } from "react";
import { Users, X, Trash2, UserPlus, Hammer, Sparkles, Pencil, Save, ImagePlus, RefreshCw, Images } from "lucide-react";
import PixelAvatar from "./PixelAvatar";
import { SavedAgent } from "../types";

interface AgentLibraryProps {
  library: SavedAgent[];
  onClose: () => void;
  // Reuses App's save helper: same name+role refreshes instead of duplicating.
  onForge: (agent: { name: string; role: string; investigativeAngle: string; colorTheme: string }) => void;
  // Edit an existing persona in place.
  onUpdate: (id: string, patch: Partial<Pick<SavedAgent, "name" | "role" | "investigativeAngle" | "colorTheme">>) => void;
  onDelete: (id: string) => void;
  // Agent Forge: turn whatever is in the form into a finished persona.
  onGenerate: (seed: { name: string; role: string; seed: string }) => Promise<{ name: string; role: string; investigativeAngle: string; colorTheme: string }>;
  // Generate (or regenerate) a saved persona's portrait.
  onPortrait: (agent: SavedAgent) => Promise<void>;
  getAgentColorHex: (theme: string) => string;
}

// Mirror of AGENT_COLOR_PALETTE in App.tsx (kept local to avoid exporting
// App internals; update both if the palette ever changes).
const COLOR_OPTIONS = ["cyan", "emerald", "rose", "amber", "purple", "indigo", "blue", "fuchsia"];

const ROSTER_HEX = "#3b82f6";
const FORGE_HEX = "#f59e0b";
const PORTRAIT_HEX = "#5bb797";

export default function AgentLibrary({ library, onClose, onForge, onUpdate, onDelete, onGenerate, onPortrait, getAgentColorHex }: AgentLibraryProps) {
  const [showForge, setShowForge] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [forgeName, setForgeName] = useState("");
  const [forgeRole, setForgeRole] = useState("");
  const [forgeAngle, setForgeAngle] = useState("");
  const [forgeColor, setForgeColor] = useState("cyan");
  const [generating, setGenerating] = useState(false);
  const [forgeError, setForgeError] = useState<string | null>(null);
  const [portraitBusy, setPortraitBusy] = useState<Set<string>>(new Set());
  const [portraitError, setPortraitError] = useState<string | null>(null);
  // Two-step delete: first click arms, second confirms (matches the
  // Knowledge Library's cautious-delete philosophy without a timer).
  const [armedDelete, setArmedDelete] = useState<string | null>(null);

  const canSave = forgeName.trim() && forgeRole.trim() && forgeAngle.trim();
  const canGenerate = !generating && (forgeName.trim() || forgeRole.trim() || forgeAngle.trim());
  const missingFaces = library.filter((a) => !a.portraitUrl);

  const resetForm = () => {
    setForgeName("");
    setForgeRole("");
    setForgeAngle("");
    setForgeColor("cyan");
    setEditingId(null);
    setForgeError(null);
  };

  const startEdit = (agent: SavedAgent) => {
    setEditingId(agent.id);
    setForgeName(agent.name);
    setForgeRole(agent.role);
    setForgeAngle(agent.investigativeAngle);
    setForgeColor(agent.colorTheme);
    setForgeError(null);
    setShowForge(true);
  };

  const handleSave = () => {
    if (!canSave) return;
    const payload = {
      name: forgeName.trim(),
      role: forgeRole.trim(),
      investigativeAngle: forgeAngle.trim(),
      colorTheme: forgeColor,
    };
    if (editingId) onUpdate(editingId, payload);
    else onForge(payload);
    resetForm();
    setShowForge(false);
  };

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setGenerating(true);
    setForgeError(null);
    try {
      const out = await onGenerate({ name: forgeName.trim(), role: forgeRole.trim(), seed: forgeAngle.trim() });
      if (!forgeName.trim() && out.name) setForgeName(out.name);
      if (out.role) setForgeRole(out.role);
      if (out.investigativeAngle) setForgeAngle(out.investigativeAngle);
      if (out.colorTheme && !editingId) setForgeColor(out.colorTheme);
    } catch (e: any) {
      setForgeError(e?.message || "Agent forge failed.");
    } finally {
      setGenerating(false);
    }
  };

  const runPortrait = async (agent: SavedAgent) => {
    setPortraitBusy((prev) => new Set(prev).add(agent.id));
    setPortraitError(null);
    try {
      await onPortrait(agent);
    } catch (e: any) {
      setPortraitError(`${agent.name}: ${e?.message || "portrait failed"}`);
    } finally {
      setPortraitBusy((prev) => { const n = new Set(prev); n.delete(agent.id); return n; });
    }
  };

  const runAllPortraits = async () => {
    // Sequential on purpose: one image model call at a time keeps the key's
    // rate limit happy and lets faces appear one by one.
    for (const agent of missingFaces) await runPortrait(agent);
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
            {missingFaces.length > 0 && (
              <button
                onClick={runAllPortraits}
                disabled={portraitBusy.size > 0}
                className="h-8 px-3 border text-[9px] font-mono font-bold rounded-lg uppercase tracking-widest transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                style={{ color: PORTRAIT_HEX, borderColor: `${PORTRAIT_HEX}66`, background: `${PORTRAIT_HEX}12` }}
                title={`Generate a portrait for the ${missingFaces.length} persona${missingFaces.length === 1 ? "" : "s"} without one (~10 s each)`}
              >
                {portraitBusy.size > 0 ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Images className="w-3 h-3" />}
                Faces for {missingFaces.length}
              </button>
            )}
            <button
              onClick={() => { if (showForge) { resetForm(); setShowForge(false); } else { resetForm(); setShowForge(true); } }}
              className="h-8 px-3 border text-[9px] font-mono font-bold rounded-lg uppercase tracking-widest transition-all flex items-center gap-1.5 cursor-pointer"
              style={showForge
                ? { color: ROSTER_HEX, borderColor: `${ROSTER_HEX}88`, background: `${ROSTER_HEX}1a` }
                : { color: "var(--color-text-muted, #8a8a8a)", borderColor: "var(--color-border-warm, #3a3a3a)" }}
              title="Forge a new specialist — type anything and let the forge write it, or fill it in by hand"
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

        {/* Forge / edit form */}
        {showForge && (
          <div className="px-5 py-4 border-b border-border-warm bg-bg-surface/50 flex-shrink-0">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[9px] font-mono uppercase tracking-widest font-bold" style={{ color: editingId ? ROSTER_HEX : FORGE_HEX }}>
                {editingId ? "Editing persona" : "New persona"}
              </span>
              <span className="text-[9px] font-mono text-text-muted">
                Type anything in the description — a sentence, keywords, a rough draft — and hit Generate. Name and title fill in if you leave them blank.
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-2.5">
              <input
                value={forgeName}
                onChange={(e) => setForgeName(e.target.value)}
                placeholder="Persona name (e.g. Kestrel) — optional, the forge can name them"
                className="bg-bg-primary border border-border-warm rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-warm/50"
              />
              <input
                value={forgeRole}
                onChange={(e) => setForgeRole(e.target.value)}
                placeholder="Specialty title (e.g. Declassified-Archives Analyst) — optional"
                className="bg-bg-primary border border-border-warm rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-warm/50"
              />
            </div>
            <textarea
              value={forgeAngle}
              onChange={(e) => setForgeAngle(e.target.value)}
              rows={3}
              placeholder="Standing specialty — what this agent is for across topics. In Roster Mode the orchestrator tailors each mission assignment from this line. Rough notes are fine; Generate rewrites them in house style."
              className="w-full resize-none bg-bg-primary border border-border-warm rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-warm/50"
            />
            {forgeError && (
              <div className="mt-2 text-[10px] font-mono text-error">{forgeError}</div>
            )}
            <div className="flex items-center justify-between mt-2.5 gap-3 flex-wrap">
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
              <div className="flex items-center gap-2">
                <button
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  className="h-8 px-3 border text-[10px] font-bold rounded-lg uppercase tracking-wider font-mono transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ color: FORGE_HEX, borderColor: `${FORGE_HEX}66`, background: `${FORGE_HEX}12` }}
                  title="Let the Agent Forge model write (or rewrite) this persona from what's in the form. Model: Settings → Agent Forge."
                >
                  {generating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {generating ? "Forging…" : forgeAngle.trim() ? "Regenerate" : "Generate"}
                </button>
                <button
                  onClick={handleSave}
                  disabled={!canSave}
                  className="h-8 px-4 text-black text-[10px] font-bold rounded-lg uppercase tracking-wider font-mono transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: ROSTER_HEX }}
                >
                  {editingId ? <Save className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                  {editingId ? "Save changes" : "Add to Library"}
                </button>
              </div>
            </div>
          </div>
        )}

        {portraitError && (
          <div className="px-5 py-2 text-[10px] font-mono text-error border-b border-border-warm bg-bg-surface/50">{portraitError}</div>
        )}

        {/* Roster list */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {library.length === 0 ? (
            <div className="text-center py-14">
              <Users className="w-10 h-10 mx-auto mb-3 text-text-muted opacity-40" />
              <p className="text-xs text-text-secondary font-mono mb-1.5">The library is empty.</p>
              <p className="text-[10px] text-text-muted font-mono max-w-sm mx-auto leading-relaxed">
                Save specialists from any swarm with the bookmark icon on their card, or forge one here. With 2+ saved, arm Roster Mode in Mission Parameters to draft teams exclusively from here.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {library.map((agent) => {
                const busy = portraitBusy.has(agent.id);
                const isEditing = editingId === agent.id;
                return (
                  <div
                    key={agent.id}
                    className="flex items-start gap-3 bg-bg-surface border rounded-xl p-3 transition-colors"
                    style={isEditing ? { borderColor: `${ROSTER_HEX}88` } : { borderColor: "var(--color-border)" }}
                  >
                    <div className="relative flex-shrink-0">
                      <PixelAvatar name={agent.name} role={agent.role} themeColor={agent.colorTheme} size="md" portraitUrl={agent.portraitUrl} />
                      {busy && (
                        <div className="absolute inset-0 rounded-xl bg-black/50 flex items-center justify-center">
                          <RefreshCw className="w-4 h-4 animate-spin" style={{ color: PORTRAIT_HEX }} />
                        </div>
                      )}
                    </div>
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
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => runPortrait(agent)}
                        disabled={busy}
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer text-text-muted hover:bg-bg-primary disabled:opacity-50"
                        style={{ color: agent.portraitUrl ? undefined : PORTRAIT_HEX }}
                        title={agent.portraitUrl ? "Regenerate this portrait" : "Generate a portrait (~10 s)"}
                      >
                        <ImagePlus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => (isEditing ? (resetForm(), setShowForge(false)) : startEdit(agent))}
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer hover:bg-bg-primary"
                        style={{ color: isEditing ? ROSTER_HEX : undefined }}
                        title={isEditing ? "Cancel editing" : "Edit this persona"}
                      >
                        <Pencil className="w-3.5 h-3.5 text-text-muted" style={isEditing ? { color: ROSTER_HEX } : undefined} />
                      </button>
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
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                          armedDelete === agent.id
                            ? "text-error bg-error/10 border border-error/40"
                            : "text-text-muted hover:text-error hover:bg-error/10"
                        }`}
                        title={armedDelete === agent.id ? "Click again to confirm removal" : "Remove from library"}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
