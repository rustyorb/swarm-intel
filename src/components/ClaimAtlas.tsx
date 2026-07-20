import { useEffect, useMemo, useState } from "react";
import { Network, X, ThumbsUp, ThumbsDown, Link2 } from "lucide-react";
import { AtlasClaim, ResearchSession } from "../types";

interface ClaimAtlasProps {
  session: ResearchSession;
  atlas: AtlasClaim[];
  getAgentColorHex: (theme: string) => string;
  onClose: () => void;
}

const DISPUTE_HEX = "#ef4444";

// Theme tints for claim nodes — deliberately distinct from the agent color
// palette so a claim's tint reads as "topic", not "owned by that agent".
const THEME_PALETTE = ["#fb923c", "#38bdf8", "#a3e635", "#f472b6", "#c084fc", "#2dd4bf", "#facc15", "#94a3b8"];

// Fixed drawing space; the SVG scales to the viewport via viewBox.
const VIEW_W = 1200;
const VIEW_H = 800;
const CX = VIEW_W / 2;
const CY = VIEW_H / 2;
// Agents sit on this ellipse; claims occupy a centered grid inside it.
const AGENT_RX = 520;
const AGENT_RY = 330;
const AGENT_R = 24;
const CLAIM_W = 190;
const CLAIM_H = 52;
const GAP_X = 30;
const GAP_Y = 24;

// Wrap a claim into at most two SVG text lines, ellipsizing the overflow.
// Rough char budget instead of measuring text — deterministic and cheap.
function wrapTwoLines(text: string, maxChars: number): [string, string] {
  const words = text.split(/\s+/);
  let line1 = "";
  let i = 0;
  while (i < words.length && (line1 + " " + words[i]).trim().length <= maxChars) {
    line1 = (line1 + " " + words[i]).trim();
    i++;
  }
  if (!line1 && words.length > 0) {
    // Single word longer than the budget — hard-cut it.
    line1 = words[0].slice(0, maxChars - 1) + "…";
    i = 1;
  }
  let line2 = words.slice(i).join(" ");
  if (line2.length > maxChars) line2 = line2.slice(0, maxChars - 1).trimEnd() + "…";
  return [line1, line2];
}

// Initials for the agent perimeter nodes: first letter of the first two words.
function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

export default function ClaimAtlas({ session, atlas, getAgentColorHex, onClose }: ClaimAtlasProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ESC closes the atlas (same pattern as ReaderMode).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const layout = useMemo(() => {
    // Theme order = first appearance; drives both tint assignment and the
    // grid sort, so same-theme claims sit adjacent (the "grouping").
    const themeOrder: string[] = [];
    for (const c of atlas) {
      const t = c.theme || "General";
      if (!themeOrder.includes(t)) themeOrder.push(t);
    }
    const themeHex = new Map<string, string>();
    themeOrder.forEach((t, i) => themeHex.set(t, THEME_PALETTE[i % THEME_PALETTE.length]));

    const claims = [...atlas].sort(
      (a, b) => themeOrder.indexOf(a.theme || "General") - themeOrder.indexOf(b.theme || "General")
    );

    // Deterministic centered grid. Column count steps with claim volume so
    // 10 claims don't sprawl and 24 still fit inside the agent ring.
    const cols = claims.length <= 8 ? 2 : claims.length <= 15 ? 3 : 4;
    const rows = Math.ceil(claims.length / cols);
    const gridW = cols * CLAIM_W + (cols - 1) * GAP_X;
    const gridH = rows * CLAIM_H + (rows - 1) * GAP_Y;
    const x0 = CX - gridW / 2;
    const y0 = CY - gridH / 2;
    const claimPos = new Map<string, { x: number; y: number }>();
    claims.forEach((c, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      claimPos.set(c.id, {
        x: x0 + col * (CLAIM_W + GAP_X) + CLAIM_W / 2,
        y: y0 + row * (CLAIM_H + GAP_Y) + CLAIM_H / 2,
      });
    });

    // Agents around the perimeter, starting at 12 o'clock (SwarmNetwork style).
    const n = Math.max(session.agents.length, 1);
    const agentPos = new Map<string, { x: number; y: number }>();
    session.agents.forEach((a, i) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
      agentPos.set(a.id, { x: CX + AGENT_RX * Math.cos(angle), y: CY + AGENT_RY * Math.sin(angle) });
    });

    return { claims, claimPos, agentPos, themeOrder, themeHex };
  }, [atlas, session.agents]);

  const { claims, claimPos, agentPos, themeOrder, themeHex } = layout;

  const agentById = useMemo(() => new Map(session.agents.map((a) => [a.id, a])), [session.agents]);
  const selected = selectedId ? claims.find((c) => c.id === selectedId) || null : null;

  // Agents that never appear on any edge are drawn dimmed so the eye goes to
  // the connected ones.
  const connectedAgentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of atlas) {
      c.supporters.forEach((id) => ids.add(id));
      c.disputers.forEach((id) => ids.add(id));
    }
    return ids;
  }, [atlas]);

  // Edge emphasis: with a claim selected, its edges pop and everything else
  // recedes; unselected state keeps everything softly visible.
  const edgeOpacity = (claimId: string, isDispute: boolean) => {
    if (!selectedId) return isDispute ? 0.55 : 0.3;
    return claimId === selectedId ? 0.95 : 0.06;
  };

  const disputedCount = atlas.filter((c) => c.disputers.length > 0).length;

  return (
    <div className="fixed inset-0 z-50 bg-bg-primary flex flex-col">
      {/* Top bar */}
      <div className="h-14 border-b border-border-warm bg-bg-surface flex items-center justify-between px-4 gap-3 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Network className="w-4 h-4 text-accent-warm flex-shrink-0" />
          <h2 className="text-sm font-semibold text-text-primary font-display flex-shrink-0">Claim Atlas</h2>
          <span className="text-xs text-text-muted font-mono truncate hidden sm:inline">— {session.topic}</span>
          <span className="min-w-4 h-4 px-1 flex items-center justify-center rounded-full bg-accent-warm/15 border border-accent-warm/30 text-accent-warm text-[9px] font-bold flex-shrink-0">
            {atlas.length}
          </span>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Edge legend */}
          <div className="hidden md:flex items-center gap-3 text-[9px] font-mono uppercase tracking-wider text-text-muted">
            <span className="flex items-center gap-1.5">
              <svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="#fb923c" strokeWidth="2" /></svg>
              Supports
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke={DISPUTE_HEX} strokeWidth="2" strokeDasharray="4 3" /></svg>
              Disputes ({disputedCount})
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-error hover:bg-bg-primary transition-all cursor-pointer"
            title="Close atlas (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body: graph + optional detail panel */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative overflow-hidden">
          {/* Dotted command-console grid (house style, see SwarmNetwork) */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: "radial-gradient(circle at center, rgba(240,235,223,0.05) 1px, transparent 1px)",
              backgroundSize: "22px 22px",
            }}
          />

          <svg
            className="w-full h-full"
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Click-away target: clicking empty canvas clears the selection */}
            <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="transparent" onClick={() => setSelectedId(null)} />

            {/* Edges under everything else */}
            <g>
              {claims.map((c) => {
                const cp = claimPos.get(c.id)!;
                const drawEdge = (agentId: string, isDispute: boolean) => {
                  const ap = agentPos.get(agentId);
                  const agent = agentById.get(agentId);
                  // Skip edges to agents no longer on the roster (dismissed etc.)
                  if (!ap || !agent) return null;
                  return (
                    <line
                      key={`${c.id}-${agentId}-${isDispute ? "d" : "s"}`}
                      x1={ap.x}
                      y1={ap.y}
                      x2={cp.x}
                      y2={cp.y}
                      stroke={isDispute ? DISPUTE_HEX : getAgentColorHex(agent.colorTheme)}
                      strokeWidth={selectedId === c.id ? 2 : 1.4}
                      strokeOpacity={edgeOpacity(c.id, isDispute)}
                      strokeDasharray={isDispute ? "6 4" : undefined}
                      strokeLinecap="round"
                      style={{ transition: "stroke-opacity 0.25s ease" }}
                    />
                  );
                };
                return (
                  <g key={c.id}>
                    {c.supporters.map((id) => drawEdge(id, false))}
                    {c.disputers.map((id) => drawEdge(id, true))}
                  </g>
                );
              })}
            </g>

            {/* Claim nodes */}
            <g>
              {claims.map((c) => {
                const cp = claimPos.get(c.id)!;
                const hex = themeHex.get(c.theme || "General") || THEME_PALETTE[0];
                const isSel = selectedId === c.id;
                const dimmed = selectedId !== null && !isSel;
                const [l1, l2] = wrapTwoLines(c.text, 32);
                return (
                  <g
                    key={c.id}
                    onClick={() => setSelectedId(isSel ? null : c.id)}
                    style={{ cursor: "pointer", opacity: dimmed ? 0.35 : 1, transition: "opacity 0.25s ease" }}
                  >
                    <rect
                      x={cp.x - CLAIM_W / 2}
                      y={cp.y - CLAIM_H / 2}
                      width={CLAIM_W}
                      height={CLAIM_H}
                      rx={10}
                      fill={`${hex}${isSel ? "38" : "1f"}`}
                      stroke={isSel ? hex : `${hex}66`}
                      strokeWidth={isSel ? 2 : 1.2}
                    />
                    {/* Dispute marker: a claim someone pushes back on gets a red tick */}
                    {c.disputers.length > 0 && (
                      <circle cx={cp.x + CLAIM_W / 2 - 8} cy={cp.y - CLAIM_H / 2 + 8} r={3.5} fill={DISPUTE_HEX} />
                    )}
                    <text
                      x={cp.x}
                      y={l2 ? cp.y - 3 : cp.y + 3.5}
                      textAnchor="middle"
                      fill="var(--color-text-primary, #f0ebdf)"
                      fontSize={10}
                      fontFamily="inherit"
                    >
                      {l1}
                    </text>
                    {l2 && (
                      <text x={cp.x} y={cp.y + 11} textAnchor="middle" fill="var(--color-text-muted, #9a9282)" fontSize={10} fontFamily="inherit">
                        {l2}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>

            {/* Agent nodes on top */}
            <g>
              {session.agents.map((a) => {
                const ap = agentPos.get(a.id)!;
                const hex = getAgentColorHex(a.colorTheme);
                const isConnected = connectedAgentIds.has(a.id);
                const inSelection = selected ? selected.supporters.includes(a.id) || selected.disputers.includes(a.id) : false;
                const dimmed = selected ? !inSelection : !isConnected;
                return (
                  <g key={a.id} style={{ opacity: dimmed ? 0.3 : 1, transition: "opacity 0.25s ease" }}>
                    <circle cx={ap.x} cy={ap.y} r={AGENT_R} fill={`${hex}22`} stroke={hex} strokeWidth={2} />
                    <text
                      x={ap.x}
                      y={ap.y + 4.5}
                      textAnchor="middle"
                      fill={hex}
                      fontSize={13}
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {initialsFor(a.name)}
                    </text>
                    {/* Name below the node; y flips are unnecessary — the grid leaves room */}
                    <text
                      x={ap.x}
                      y={ap.y + AGENT_R + 15}
                      textAnchor="middle"
                      fill="var(--color-text-muted, #9a9282)"
                      fontSize={9.5}
                      fontFamily="monospace"
                      style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
                    >
                      {a.name}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Theme legend, bottom-left over the canvas */}
          <div className="absolute bottom-3 left-4 flex flex-wrap items-center gap-x-4 gap-y-1 max-w-[70%]">
            {themeOrder.map((t) => (
              <span key={t} className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider text-text-muted">
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: `${themeHex.get(t)}55`, border: `1px solid ${themeHex.get(t)}` }} />
                {t}
              </span>
            ))}
          </div>

          {/* Hint when nothing is selected */}
          {!selected && (
            <div className="absolute bottom-3 right-4 text-[9px] font-mono uppercase tracking-wider text-text-muted">
              Click a claim to inspect its backing
            </div>
          )}
        </div>

        {/* Detail side panel for the selected claim */}
        {selected && (
          <aside className="w-80 md:w-96 flex-shrink-0 border-l border-border-warm bg-bg-surface overflow-y-auto">
            <div className="p-5">
              <div className="flex items-start justify-between gap-2 mb-3">
                <span
                  className="text-[9px] font-mono font-bold uppercase tracking-widest px-2 py-1 rounded border"
                  style={{
                    color: themeHex.get(selected.theme || "General"),
                    borderColor: `${themeHex.get(selected.theme || "General")}55`,
                    backgroundColor: `${themeHex.get(selected.theme || "General")}12`,
                  }}
                >
                  {selected.theme || "General"}
                </span>
                <button
                  onClick={() => setSelectedId(null)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-primary transition-all cursor-pointer flex-shrink-0"
                  title="Deselect claim"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="text-sm text-text-primary leading-relaxed mb-5">{selected.text}</p>

              {/* Supporters */}
              <div className="mb-4">
                <div className="flex items-center gap-1.5 text-[9px] font-mono font-bold uppercase tracking-widest text-text-muted mb-2">
                  <ThumbsUp className="w-3 h-3 text-success" />
                  Supported by ({selected.supporters.length})
                </div>
                {selected.supporters.length === 0 && <p className="text-xs text-text-muted italic">No supporting specialists on record.</p>}
                <div className="space-y-1.5">
                  {selected.supporters.map((id) => {
                    const agent = agentById.get(id);
                    if (!agent) return null;
                    return (
                      <div key={id} className="flex items-center gap-2 text-xs">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: getAgentColorHex(agent.colorTheme) }} />
                        <span className="text-text-primary font-semibold">{agent.name}</span>
                        <span className="text-text-muted font-mono text-[10px] truncate">{agent.role}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Disputers */}
              <div className="mb-4">
                <div className="flex items-center gap-1.5 text-[9px] font-mono font-bold uppercase tracking-widest text-text-muted mb-2">
                  <ThumbsDown className="w-3 h-3" style={{ color: DISPUTE_HEX }} />
                  Disputed by ({selected.disputers.length})
                </div>
                {selected.disputers.length === 0 && <p className="text-xs text-text-muted italic">Undisputed across the swarm.</p>}
                <div className="space-y-1.5">
                  {selected.disputers.map((id) => {
                    const agent = agentById.get(id);
                    if (!agent) return null;
                    return (
                      <div key={id} className="flex items-center gap-2 text-xs">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: getAgentColorHex(agent.colorTheme) }} />
                        <span className="text-text-primary font-semibold">{agent.name}</span>
                        <span className="text-text-muted font-mono text-[10px] truncate">{agent.role}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sources */}
              <div>
                <div className="flex items-center gap-1.5 text-[9px] font-mono font-bold uppercase tracking-widest text-text-muted mb-2">
                  <Link2 className="w-3 h-3 text-accent-warm" />
                  Sources ({selected.sources.length})
                </div>
                {selected.sources.length === 0 && <p className="text-xs text-text-muted italic">No sources captured for this claim.</p>}
                <ul className="space-y-1.5">
                  {selected.sources.map((s, i) => (
                    <li key={i} className="text-xs text-text-secondary break-words">
                      {/^https?:\/\//i.test(s) ? (
                        <a href={s} target="_blank" rel="noopener noreferrer" className="text-accent-hi-warm underline underline-offset-2">
                          {s}
                        </a>
                      ) : (
                        s
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
