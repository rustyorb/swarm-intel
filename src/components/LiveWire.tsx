import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Cpu, Radio, ArrowDownToLine, Check, AlertTriangle } from "lucide-react";
import PixelAvatar from "./PixelAvatar";
import { Agent, AgentTelemetry, StageName } from "../types";

// LiveWire — the center-view pane that shows what the swarm is actually
// producing while it runs: the active agent's report as it streams (or the
// synthesis), the real pipeline stage, a reasoning timer before the first
// token, live word count and words/second. Nothing here is simulated.

interface SynthTelemetry {
  stage: StageName;
  stageSince: number;
  startedAt: number;
  words: number;
}

interface LiveWireProps {
  agents: Agent[];
  telemetry: Record<string, AgentTelemetry>;
  activeAgentId: string | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  liveText: string;
  mode: "agent" | "synthesis" | "redteam";
  synth: SynthTelemetry | null;
  now: number;
  getColorHex: (theme: string) => string;
  accentHex: string;
}

const STAGE_ORDER: StageName[] = ["planning", "searching", "reading", "reasoning", "writing", "done"];
const STAGE_LABEL: Record<StageName, string> = {
  queued: "QUEUED",
  planning: "PLAN",
  searching: "SEARCH",
  reading: "READ",
  reasoning: "REASON",
  writing: "WRITE",
  done: "DONE",
  failed: "FAILED",
};

const clock = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const mdComponents = (hex: string) => ({
  h1: ({ node, ...props }: any) => <h1 className="text-base font-bold text-text-primary mt-4 mb-2 font-display" {...props} />,
  h2: ({ node, ...props }: any) => <h2 className="text-sm font-semibold mt-4 mb-2 font-display" style={{ color: hex }} {...props} />,
  h3: ({ node, ...props }: any) => <h3 className="text-xs font-semibold mt-3 mb-1.5 font-display uppercase tracking-wider" style={{ color: hex }} {...props} />,
  p: ({ node, ...props }: any) => <p className="mb-2.5 leading-relaxed text-text-secondary text-xs" {...props} />,
  ul: ({ node, ...props }: any) => <ul className="list-disc pl-5 mb-2.5 space-y-1" {...props} />,
  ol: ({ node, ...props }: any) => <ol className="list-decimal pl-5 mb-2.5 space-y-1" {...props} />,
  li: ({ node, ...props }: any) => <li className="text-text-secondary text-xs" {...props} />,
  a: ({ node, ...props }: any) => <a className="underline decoration-dotted underline-offset-2 break-all" style={{ color: hex }} target="_blank" rel="noreferrer" {...props} />,
  blockquote: ({ node, ...props }: any) => (
    <blockquote className="border-l-2 bg-bg-surface px-3 py-2 rounded-r-lg italic my-2.5 text-text-muted text-xs" style={{ borderColor: hex }} {...props} />
  ),
  strong: ({ node, ...props }: any) => <strong className="font-bold text-text-primary" {...props} />,
  code: ({ node, ...props }: any) => <code className="bg-bg-primary px-1 py-0.5 rounded font-mono text-[11px] border border-border-warm" style={{ color: hex }} {...props} />,
  table: ({ node, ...props }: any) => <div className="overflow-x-auto my-3"><table className="text-[11px] border-collapse w-full" {...props} /></div>,
  th: ({ node, ...props }: any) => <th className="text-left border border-border-warm px-2 py-1 bg-bg-surface font-mono uppercase tracking-wider text-[9px] text-text-muted" {...props} />,
  td: ({ node, ...props }: any) => <td className="border border-border-warm px-2 py-1 align-top text-text-secondary" {...props} />,
});

export default function LiveWire({
  agents,
  telemetry,
  activeAgentId,
  selectedId,
  onSelect,
  liveText,
  mode,
  synth,
  now,
  getColorHex,
  accentHex,
}: LiveWireProps) {
  const [follow, setFollow] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // What is on screen: a user-selected agent, the synthesis, or the live agent.
  const selectedAgent = selectedId ? agents.find((a) => a.id === selectedId) ?? null : null;
  const activeAgent = activeAgentId ? agents.find((a) => a.id === activeAgentId) ?? null : null;
  const showingSynthesis = !selectedAgent && mode === "synthesis";
  const shownAgent = selectedAgent ?? activeAgent ?? [...agents].reverse().find((a) => a.status === "completed") ?? null;
  const isLiveView = !selectedAgent && (showingSynthesis || (mode === "agent" && !!activeAgent));

  const text = showingSynthesis ? liveText : selectedAgent ? selectedAgent.report ?? "" : isLiveView ? liveText : shownAgent?.report ?? "";
  const tele: AgentTelemetry | null = shownAgent ? telemetry[shownAgent.id] ?? null : null;
  const stage: StageName = showingSynthesis ? synth?.stage ?? "reasoning" : tele?.stage ?? (shownAgent?.status === "completed" ? "done" : "queued");
  const stageSince = showingSynthesis ? synth?.stageSince ?? now : tele?.stageSince ?? now;
  const startedAt = showingSynthesis ? synth?.startedAt ?? now : tele?.startedAt ?? now;
  const endAt = showingSynthesis ? (synth?.stage === "done" ? now : now) : tele?.finishedAt ?? now;
  const words = useMemo(() => (text.match(/\S+/g) || []).length, [text]);
  const writingSeconds = stage === "writing" ? Math.max(1, (now - stageSince) / 1000) : 0;
  const wps = stage === "writing" ? Math.round(words / writingSeconds) : 0;
  const hex = showingSynthesis ? accentHex : shownAgent ? getColorHex(shownAgent.colorTheme) : accentHex;
  const stageIdx = STAGE_ORDER.indexOf(stage);

  // Auto-scroll while following; scrolling up releases follow.
  useEffect(() => {
    if (!follow || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [text, follow]);
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    if (!atBottom && follow) setFollow(false);
    if (atBottom && !follow) setFollow(true);
  };

  const headerName = showingSynthesis ? "Lead Orchestrator" : shownAgent?.name ?? "Standby";
  const headerRole = showingSynthesis ? "Consolidated synthesis" : shownAgent?.role ?? "";
  const reasoningPlaceholder = !text.trim() && (stage === "planning" || stage === "searching" || stage === "reading" || stage === "reasoning");

  return (
    <div
      className="mb-6 rounded-2xl border bg-bg-surface overflow-hidden relative flex-shrink-0"
      style={{ borderColor: `${hex}55` }}
      id="live-wire"
    >
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: hex }} />

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 px-5 pt-4 pb-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {showingSynthesis ? (
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: `${hex}1a`, border: `1px solid ${hex}55` }}
            >
              <Cpu className="w-6 h-6" style={{ color: hex }} />
            </div>
          ) : shownAgent ? (
            <PixelAvatar name={shownAgent.name} role={shownAgent.role} themeColor={shownAgent.colorTheme} size="md" portraitUrl={shownAgent.portraitUrl} />
          ) : null}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold font-display text-text-primary truncate">{headerName}</h3>
              <span
                className="text-[9px] font-mono uppercase tracking-widest font-bold px-2 py-0.5 rounded-md flex items-center gap-1.5"
                style={{ color: hex, background: `${hex}12`, border: `1px solid ${hex}33` }}
              >
                {isLiveView && stage !== "done" && stage !== "failed" ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: hex }} />
                    LIVE WIRE
                  </>
                ) : (
                  <>
                    <Radio className="w-3 h-3" />
                    {selectedAgent ? "REPLAY" : "STANDBY"}
                  </>
                )}
              </span>
            </div>
            <p className="text-[10px] text-text-muted font-mono truncate">{headerRole}</p>
          </div>
        </div>

        {/* Stage chips */}
        <div className="flex items-center gap-1 flex-wrap">
          {STAGE_ORDER.map((s, i) => {
            const lit = i < stageIdx || (i === stageIdx && stage !== "failed");
            const current = i === stageIdx;
            return (
              <span
                key={s}
                className="text-[8px] font-mono uppercase tracking-widest font-bold px-1.5 py-0.5 rounded"
                style={
                  current
                    ? { color: "#14110c", background: hex }
                    : lit
                    ? { color: hex, background: `${hex}1a`, border: `1px solid ${hex}44` }
                    : { color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }
                }
              >
                {STAGE_LABEL[s]}
              </span>
            );
          })}
          {stage === "failed" && (
            <span className="text-[8px] font-mono uppercase tracking-widest font-bold px-1.5 py-0.5 rounded flex items-center gap-1 text-error border border-error/40 bg-error/10">
              <AlertTriangle className="w-2.5 h-2.5" /> FAILED
            </span>
          )}
        </div>

        {/* Counters */}
        <div className="flex items-center gap-4 font-mono text-[10px] text-text-muted flex-shrink-0">
          <span title="Elapsed for this channel">
            <span className="text-text-secondary font-bold">{clock(endAt - startedAt)}</span> elapsed
          </span>
          <span title="Words streamed so far">
            <span className="text-text-secondary font-bold">{words.toLocaleString()}</span> words
          </span>
          {stage === "writing" && (
            <span title="Words per second while writing">
              <span className="text-text-secondary font-bold">{wps}</span> w/s
            </span>
          )}
        </div>
      </div>

      {/* Channel tabs */}
      {agents.length > 1 && (
        <div className="flex items-center gap-1.5 px-5 pb-3 overflow-x-auto scrollbar-none">
          {agents.map((a) => {
            const t = telemetry[a.id];
            const isActive = a.id === activeAgentId && mode === "agent";
            const isShown = shownAgent?.id === a.id && !showingSynthesis;
            const done = a.status === "completed";
            const ahex = getColorHex(a.colorTheme);
            return (
              <button
                key={a.id}
                onClick={() => onSelect(isActive ? null : a.id)}
                className="text-[9px] font-mono uppercase tracking-wider px-2 py-1 rounded-md flex items-center gap-1.5 border whitespace-nowrap cursor-pointer transition-all"
                style={
                  isShown
                    ? { color: ahex, borderColor: `${ahex}66`, background: `${ahex}1a` }
                    : { color: "var(--color-text-muted)", borderColor: "var(--color-border)" }
                }
                title={done ? "Show this finished report" : t ? STAGE_LABEL[t.stage] : "Queued"}
              >
                {done ? <Check className="w-2.5 h-2.5" /> : isActive ? <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: ahex }} /> : <span className="w-1.5 h-1.5 rounded-full bg-text-muted" />}
                {a.name}
              </button>
            );
          })}
          {mode === "synthesis" && selectedAgent && (
            <button
              onClick={() => onSelect(null)}
              className="text-[9px] font-mono uppercase tracking-wider px-2 py-1 rounded-md flex items-center gap-1.5 border whitespace-nowrap cursor-pointer"
              style={{ color: accentHex, borderColor: `${accentHex}66`, background: `${accentHex}1a` }}
            >
              <Cpu className="w-2.5 h-2.5" /> Synthesis
            </button>
          )}
        </div>
      )}

      {/* Body */}
      <div className="relative">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="max-h-[420px] overflow-y-auto px-5 pb-5 pt-1 bg-bg-primary/40 border-t"
          style={{ borderColor: `${hex}22` }}
        >
          {reasoningPlaceholder ? (
            <div className="h-[200px] flex flex-col items-center justify-center gap-3 text-center">
              <div className="relative w-12 h-12">
                <span className="absolute inset-0 rounded-full animate-ping opacity-30" style={{ background: hex }} />
                <span className="absolute inset-2 rounded-full" style={{ background: `${hex}33`, border: `1px solid ${hex}` }} />
              </div>
              <div className="text-[11px] font-mono uppercase tracking-widest font-bold" style={{ color: hex }}>
                {stage === "reasoning" ? `Model reasoning ${clock(now - stageSince)}` : stage === "planning" ? "Planning search queries" : stage === "searching" ? `Searching · wave ${tele?.wave ?? 1}` : `Reading ${tele?.pages ?? 0} pages`}
              </div>
              <div className="text-[10px] font-mono text-text-muted">
                {tele?.hits ? `${tele.hits} live results in hand` : "No tokens yet — nothing is stuck"}
                {stage === "reasoning" ? " · the first token ends this" : ""}
              </div>
            </div>
          ) : text.trim() ? (
            <div className="space-y-2 text-xs leading-relaxed font-sans text-text-secondary pt-3">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents(hex)}>
                {text}
              </ReactMarkdown>
              {isLiveView && stage === "writing" && (
                <span className="inline-block w-2 h-3.5 align-middle animate-pulse" style={{ background: hex }} />
              )}
            </div>
          ) : (
            <div className="h-[120px] flex items-center justify-center text-[11px] font-mono text-text-muted">
              Waiting for the next channel to open...
            </div>
          )}
        </div>

        {!follow && isLiveView && (
          <button
            onClick={() => {
              setFollow(true);
              if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }}
            className="absolute bottom-4 right-6 text-[9px] font-mono uppercase tracking-widest font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer shadow-lg"
            style={{ color: "#14110c", background: hex }}
          >
            <ArrowDownToLine className="w-3 h-3" /> Follow live
          </button>
        )}
      </div>
    </div>
  );
}
