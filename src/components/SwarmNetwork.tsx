import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Cpu, Check, AlertTriangle } from "lucide-react";
import PixelAvatar from "./PixelAvatar";
import { Agent } from "../types";

interface SwarmNetworkProps {
  agents: Agent[];
  agentProgress: Record<string, { percent: number; statusText: string }>;
  sessionStatus: string;
  onSelectAgent: (agent: Agent) => void;
}

const AGENT_COLOR_HEX: Record<string, string> = {
  cyan: "#06b6d4",
  emerald: "#10b981",
  rose: "#ec4899",
  amber: "#f59e0b",
  purple: "#a855f7",
  indigo: "#6366f1",
  blue: "#0ea5e9",
  fuchsia: "#d946ef",
};

const hexFor = (theme: string): string => AGENT_COLOR_HEX[theme] || "#fb923c";

const ACCENT = "#fb923c";
const SUCCESS = "#5bb797";
const ERROR = "#d66060";

const RING_R = 30;
const RING_C = 2 * Math.PI * RING_R;

export default function SwarmNetwork({ agents, agentProgress, sessionStatus, onSelectAgent }: SwarmNetworkProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 900, height: 540 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setDims({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { width: W, height: H } = dims;
  const cx = W / 2;
  const cy = H / 2;
  const rx = Math.max(W / 2 - 130, 130);
  const ry = Math.max(H / 2 - 104, 116);
  const n = agents.length;
  const isSynth = sessionStatus === "synthesizing";

  const nodes = agents.map((agent, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(n, 1);
    const x = cx + rx * Math.cos(angle);
    const y = cy + ry * Math.sin(angle);
    const mx = (cx + x) / 2;
    const my = (cy + y) / 2;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.hypot(dx, dy) || 1;
    const bow = dist * 0.14;
    const ctrlX = mx + (-dy / dist) * bow;
    const ctrlY = my + (dx / dist) * bow;
    return { agent, x, y, ctrlX, ctrlY };
  });

  return (
    <div
      ref={containerRef}
      className="relative w-full flex-1 min-h-[520px] rounded-2xl border border-border-warm bg-bg-surface/40 overflow-hidden"
    >
      {/* Dotted command-console grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle at center, rgba(240,235,223,0.05) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />

      {/* Radial glow behind the hub */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: cx,
          top: cy,
          transform: "translate(-50%, -50%)",
          width: Math.max(rx, ry) * 1.7,
          height: Math.max(rx, ry) * 1.7,
          background: `radial-gradient(circle, rgba(251,146,60,${isSynth ? 0.18 : 0.09}) 0%, transparent 62%)`,
          transition: "background 0.6s ease",
        }}
      />

      {/* Link + packet underlay */}
      <svg className="absolute inset-0 pointer-events-none" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {nodes.map(({ agent, x, y, ctrlX, ctrlY }) => {
          const hex = hexFor(agent.colorTheme);
          const isWorking = agent.status === "working";
          const isCompleted = agent.status === "completed";
          const synthReturn = isSynth && isCompleted;
          const showPackets = isWorking || synthReturn;
          const forward = `M ${cx} ${cy} Q ${ctrlX} ${ctrlY} ${x} ${y}`;
          const reverse = `M ${x} ${y} Q ${ctrlX} ${ctrlY} ${cx} ${cy}`;
          const packetPath = synthReturn ? reverse : forward;
          const packetColor = synthReturn ? ACCENT : hex;
          const linkOpacity = showPackets ? 0.55 : isCompleted ? 0.32 : 0.14;

          return (
            <g key={agent.id}>
              <path d={forward} fill="none" stroke={hex} strokeWidth={1.5} strokeOpacity={linkOpacity} strokeLinecap="round" />
              {showPackets &&
                [0, 1, 2].map((p) => (
                  <circle
                    key={p}
                    r={3}
                    fill={packetColor}
                    style={{ filter: `drop-shadow(0 0 5px ${packetColor})` }}
                  >
                    <animateMotion dur="2.4s" begin={`${p * 0.8}s`} repeatCount="indefinite" path={packetPath} />
                  </circle>
                ))}
            </g>
          );
        })}
      </svg>

      {/* Orchestrator hub */}
      <div className="absolute" style={{ left: cx, top: cy, zIndex: 5 }}>
        <motion.div
          className="relative flex items-center justify-center"
          style={{ x: "-50%", y: "-50%", width: 96, height: 96 }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 18 }}
        >
          <motion.div
            className="absolute rounded-full border border-dashed"
            style={{ inset: -18, borderColor: `${ACCENT}44` }}
            animate={{ rotate: 360 }}
            transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            className="absolute rounded-full"
            style={{ inset: -6, border: `1px solid ${ACCENT}55` }}
            animate={{ scale: [1, 1.16, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ duration: isSynth ? 1.4 : 2.2, repeat: Infinity, ease: "easeOut" }}
          />
          <div
            className="relative w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #fdba74, #fb923c)",
              boxShadow: `0 0 ${isSynth ? 42 : 24}px ${ACCENT}${isSynth ? "aa" : "77"}`,
              transition: "box-shadow 0.6s ease",
            }}
          >
            <Cpu className="w-7 h-7 text-[#14110c]" strokeWidth={2.2} />
          </div>
          <div className="absolute left-1/2 top-full mt-3 -translate-x-1/2 whitespace-nowrap text-center">
            <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-accent-warm">
              Lead Orchestrator
            </div>
            <div className="text-[8px] font-mono uppercase tracking-widest text-text-muted mt-0.5">
              {isSynth ? "Synthesizing" : "Coordinating"}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Agent nodes */}
      {nodes.map(({ agent, x, y }, i) => {
        const hex = hexFor(agent.colorTheme);
        const prog = agentProgress[agent.id] || { percent: 0, statusText: "QUEUED" };
        const percent = Math.max(0, Math.min(100, prog.percent));
        const isCompleted = agent.status === "completed";
        const isFailed = agent.status === "failed";
        const isWorking = agent.status === "working";
        const isDim = !isCompleted && !isFailed && !isWorking;
        const ringColor = isFailed ? ERROR : hex;
        const displayPct = isCompleted ? 100 : percent;
        const statusColor = isCompleted ? SUCCESS : isFailed ? ERROR : isWorking ? hex : "#9a9282";
        const statusLabel = isCompleted
          ? "Complete"
          : isFailed
          ? "Faulted"
          : isWorking
          ? `${percent}% ${prog.statusText}`
          : "Queued";

        return (
          <div key={agent.id} className="absolute" style={{ left: x, top: y, zIndex: 10 }}>
            <motion.div
              className={`relative ${isCompleted ? "cursor-pointer" : ""}`}
              style={{ x: "-50%", y: "-50%", width: 72, height: 72 }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              whileHover={isCompleted ? { scale: 1.08 } : undefined}
              transition={{ type: "spring", stiffness: 260, damping: 18, delay: i * 0.08 }}
              onClick={() => {
                if (isCompleted) onSelectAgent(agent);
              }}
            >
              {/* Working pulse halo */}
              {isWorking && (
                <motion.div
                  className="absolute inset-0 rounded-full"
                  style={{ boxShadow: `0 0 0 2px ${hex}` }}
                  animate={{ scale: [1, 1.22, 1], opacity: [0.55, 0, 0.55] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                />
              )}

              {/* Progress ring */}
              <svg className="absolute inset-0 -rotate-90" width={72} height={72} viewBox="0 0 72 72">
                <circle cx={36} cy={36} r={RING_R} fill="none" stroke="rgba(240,235,223,0.08)" strokeWidth={3.5} />
                <circle
                  cx={36}
                  cy={36}
                  r={RING_R}
                  fill="none"
                  stroke={ringColor}
                  strokeWidth={3.5}
                  strokeLinecap="round"
                  strokeDasharray={RING_C}
                  strokeDashoffset={RING_C * (1 - displayPct / 100)}
                  style={{ transition: "stroke-dashoffset 0.5s ease" }}
                />
              </svg>

              {/* Avatar */}
              <div className="absolute inset-0 flex items-center justify-center" style={{ opacity: isDim ? 0.5 : 1 }}>
                <PixelAvatar name={agent.name} role={agent.role} themeColor={agent.colorTheme} size="md" />
              </div>

              {/* Status badge */}
              {isCompleted && (
                <div
                  className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center border-2 border-bg-primary"
                  style={{ background: SUCCESS }}
                >
                  <Check className="w-3 h-3 text-bg-primary" strokeWidth={3.5} />
                </div>
              )}
              {isFailed && (
                <div
                  className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center border-2 border-bg-primary"
                  style={{ background: ERROR }}
                >
                  <AlertTriangle className="w-3 h-3 text-bg-primary" strokeWidth={2.5} />
                </div>
              )}

              {/* Label ticker */}
              <div className="absolute left-1/2 top-full mt-2 -translate-x-1/2 flex flex-col items-center gap-0.5 w-[130px]">
                <span className="text-[10px] font-mono font-bold text-text-primary uppercase tracking-wide truncate max-w-full">
                  {agent.name}
                </span>
                <span
                  className="text-[9px] font-mono uppercase tracking-wide truncate max-w-full"
                  style={{ color: statusColor }}
                >
                  {statusLabel}
                </span>
              </div>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}
