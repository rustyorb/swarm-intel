import React, { useEffect, useRef, useState } from "react";
import { MessagesSquare, Cpu, Send, ChevronDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import PixelAvatar from "./PixelAvatar";
import { ChatMessage, ResearchSession } from "../types";

interface InterrogationRoomProps {
  session: ResearchSession;
  settings: any;
  onPersist: (session: ResearchSession) => void;
  getAgentColorHex: (theme: string) => string;
}

const STARTERS = [
  "Where do the specialists disagree the most?",
  "What are the highest-risk unknowns?",
  "What should be investigated next?",
];

const markdownComponents = {
  h1: ({ node, ...props }: any) => <h1 className="text-lg font-bold text-text-primary mt-4 mb-2 font-display" {...props} />,
  h2: ({ node, ...props }: any) => <h2 className="text-base font-semibold text-text-primary mt-4 mb-2 font-display flex items-center gap-2" {...props} />,
  h3: ({ node, ...props }: any) => <h3 className="text-sm font-semibold text-accent-warm mt-3 mb-1.5 font-display" {...props} />,
  p: ({ node, ...props }: any) => <p className="mb-3 leading-relaxed text-text-secondary text-xs sm:text-sm" {...props} />,
  ul: ({ node, ...props }: any) => <ul className="list-disc pl-5 mb-3 space-y-1" {...props} />,
  ol: ({ node, ...props }: any) => <ol className="list-decimal pl-5 mb-3 space-y-1" {...props} />,
  li: ({ node, ...props }: any) => <li className="text-text-secondary text-xs sm:text-sm" {...props} />,
  blockquote: ({ node, ...props }: any) => <blockquote className="border-l-4 border-accent-warm bg-bg-surface p-3 rounded-r-lg italic my-3 text-text-muted" {...props} />,
  code: ({ node, ...props }: any) => <code className="bg-bg-primary text-accent-warm px-1.5 py-0.5 rounded font-mono text-xs border border-border-warm" {...props} />,
  pre: ({ node, ...props }: any) => <pre className="bg-bg-primary p-3 rounded-xl overflow-x-auto border border-border-warm my-3 text-xs font-mono text-text-secondary" {...props} />,
  table: ({ node, ...props }: any) => <div className="overflow-x-auto my-4"><table className="min-w-full divide-y divide-border-warm border border-border-warm rounded-lg text-xs" {...props} /></div>,
  th: ({ node, ...props }: any) => <th className="bg-bg-primary px-3 py-1.5 text-left font-semibold text-text-primary" {...props} />,
  td: ({ node, ...props }: any) => <td className="px-3 py-1.5 border-t border-border-warm" {...props} />,
};

export default function InterrogationRoom({ session, settings, onPersist, getAgentColorHex }: InterrogationRoomProps) {
  const [respondent, setRespondent] = useState<string>("panel");
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streaming, setStreaming] = useState<{ id: string; content: string } | null>(null);
  const [error, setError] = useState<{ id: string; text: string } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const messages = session.chat ?? [];
  const respondents = session.agents.filter(a => a.report);
  const currentColor = respondent === "panel"
    ? "#fb923c"
    : getAgentColorHex(session.agents.find(a => a.id === respondent)?.colorTheme || "");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streaming?.content]);

  const autoGrow = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 160) + "px";
    }
  };

  const send = async (rawQuestion: string) => {
    const question = rawQuestion.trim();
    if (!question || isStreaming) return;

    const respondentAgent = respondent === "panel" ? null : session.agents.find(a => a.id === respondent);
    const respondentName = respondentAgent ? respondentAgent.name : "Full Panel";
    const respondentColor = respondentAgent ? respondentAgent.colorTheme : undefined;

    const baseMessages = session.chat ?? [];
    const stamp = Date.now();
    const userMsg: ChatMessage = {
      id: `msg-${stamp}-u`,
      role: "user",
      respondent,
      respondentName,
      respondentColor,
      content: question,
      timestamp: new Date().toLocaleTimeString(),
    };
    const assistantMsg: ChatMessage = {
      id: `msg-${stamp}-a`,
      role: "assistant",
      respondent,
      respondentName,
      respondentColor,
      content: "",
      timestamp: new Date().toLocaleTimeString(),
    };

    const startedChat = [...baseMessages, userMsg, assistantMsg];
    onPersist({ ...session, chat: startedChat });
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setError(null);
    setStreaming({ id: assistantMsg.id, content: "" });
    setIsStreaming(true);

    let answer = "";

    try {
      const reportAgents = session.agents
        .filter(a => a.report)
        .map(a => ({ id: a.id, name: a.name, role: a.role, investigativeAngle: a.investigativeAngle, report: a.report }));

      const response = await fetch("/api/research/interrogate-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: session.topic,
          question,
          respondent,
          agents: reportAgents,
          synthesizedReport: session.synthesizedReport || "",
          chatHistory: baseMessages.map(m => ({ role: m.role, speaker: m.respondentName, content: m.content })),
          settings,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.error || "The swarm could not respond.");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let newlineIndex;
          while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
            const lineText = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            if (!lineText.startsWith("data: ")) continue;

            let data: any = null;
            try {
              data = JSON.parse(lineText.slice(6));
            } catch (e) {
              // Ignore partial/ping parse errors
            }
            if (!data) continue;

            if (data.type === "chunk" && data.text) {
              answer += data.text;
              setStreaming({ id: assistantMsg.id, content: answer });
            } else if (data.type === "error") {
              throw new Error(data.error || "Stream error.");
            }
          }
        }
      }

      if (!answer.trim()) {
        throw new Error("The swarm returned an empty response.");
      }

      const finalChat = startedChat.map(m => (m.id === assistantMsg.id ? { ...m, content: answer } : m));
      onPersist({ ...session, chat: finalChat });
      setStreaming(null);
      setIsStreaming(false);
    } catch (err: any) {
      const finalChat = startedChat.map(m => (m.id === assistantMsg.id ? { ...m, content: answer } : m));
      onPersist({ ...session, chat: finalChat });
      setStreaming(null);
      setIsStreaming(false);
      setError({ id: assistantMsg.id, text: err.message || "The swarm could not respond." });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-bg-primary">
      {/* Message thread */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6">
        <div className="max-w-3xl mx-auto">
          {messages.length === 0 ? (
            /* Empty state */
            <div className="h-full flex flex-col items-center justify-center text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-accent-warm/10 border border-accent-warm/30 flex items-center justify-center mb-5">
                <MessagesSquare className="w-8 h-8 text-accent-warm" />
              </div>
              <h2 className="text-2xl font-bold text-text-primary font-display mb-2">Interrogate the Swarm</h2>
              <p className="text-xs text-text-muted font-mono max-w-md mb-8 leading-relaxed">
                Ask follow-up questions answered strictly from the specialists' reports and the consolidated synthesis. Choose who responds below.
              </p>
              <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-2.5 max-w-2xl">
                {STARTERS.map((starter) => (
                  <button
                    key={starter}
                    onClick={() => send(starter)}
                    className="px-4 py-2.5 bg-bg-surface hover:bg-bg-surface/60 border border-border-warm hover:border-accent-warm/40 text-text-secondary hover:text-text-primary text-xs rounded-xl transition-all cursor-pointer text-left"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((m) => {
                if (m.role === "user") {
                  return (
                    <div key={m.id} className="flex justify-end">
                      <div className="max-w-[70%] bg-bg-surface border border-border-warm rounded-2xl rounded-br-md px-4 py-3">
                        <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">{m.content}</p>
                      </div>
                    </div>
                  );
                }

                const agent = m.respondent === "panel" ? null : session.agents.find(a => a.id === m.respondent);
                const roleLabel = agent ? agent.role : "Full Panel — all specialists";
                const isStreamingThis = streaming?.id === m.id;
                const displayContent = isStreamingThis ? streaming!.content : m.content;
                const thisError = error?.id === m.id ? error.text : null;

                return (
                  <div key={m.id} className="flex gap-3">
                    {agent ? (
                      <PixelAvatar name={agent.name} role={agent.role} themeColor={agent.colorTheme} size="sm" />
                    ) : (
                      <div className="w-8 h-8 rounded-xl bg-accent-warm/10 border border-accent-warm/30 flex items-center justify-center flex-shrink-0">
                        <Cpu className="w-4 h-4 text-accent-warm" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-1.5">
                        <span
                          className="text-xs font-bold font-display"
                          style={{ color: agent ? getAgentColorHex(agent.colorTheme) : "#fb923c" }}
                        >
                          {m.respondentName}
                        </span>
                        <span className="text-[9px] font-mono uppercase tracking-widest font-bold text-text-muted truncate">
                          {roleLabel}
                        </span>
                      </div>
                      <div className="bg-bg-surface border border-border-warm rounded-2xl rounded-tl-md px-4 py-3">
                        {displayContent ? (
                          <div className="text-sm">
                            <ReactMarkdown components={markdownComponents}>{displayContent}</ReactMarkdown>
                            {isStreamingThis && (
                              <span className="inline-block w-1.5 h-3.5 bg-accent-warm/80 ml-0.5 align-middle animate-pulse" />
                            )}
                          </div>
                        ) : isStreamingThis ? (
                          <div className="flex items-center gap-1.5 py-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-accent-warm/70 animate-pulse" />
                            <span className="w-1.5 h-1.5 rounded-full bg-accent-warm/50 animate-pulse [animation-delay:150ms]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-accent-warm/30 animate-pulse [animation-delay:300ms]" />
                          </div>
                        ) : null}
                        {thisError && (
                          <p className="text-xs text-error font-mono mt-2 pt-2 border-t border-border-warm">
                            {thisError}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Composer */}
      <div className="flex-shrink-0 border-t border-border-warm bg-bg-surface px-4 md:px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-[9px] font-mono uppercase tracking-widest font-bold text-text-muted">Direct question to</span>
            <div className="relative flex items-center">
              <span className="w-2 h-2 rounded-full absolute left-3 pointer-events-none" style={{ backgroundColor: currentColor }} />
              <select
                value={respondent}
                onChange={(e) => setRespondent(e.target.value)}
                disabled={isStreaming}
                className="appearance-none bg-bg-primary border border-border-warm rounded-lg pl-7 pr-8 py-1.5 text-[11px] font-mono text-text-secondary focus:outline-none focus:border-accent-warm/50 disabled:opacity-50 cursor-pointer"
              >
                <option value="panel">Full Panel</option>
                {respondents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} — {a.role}</option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 text-text-muted absolute right-2.5 pointer-events-none" />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); autoGrow(); }}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              rows={1}
              placeholder={isStreaming ? "The swarm is responding…" : "Interrogate the swarm… (Enter to send, Shift+Enter for newline)"}
              className="flex-1 resize-none bg-bg-primary border border-border-warm rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-warm/50 disabled:opacity-60 max-h-40"
            />
            <button
              onClick={() => send(input)}
              disabled={isStreaming || !input.trim()}
              className="h-11 w-11 flex items-center justify-center bg-accent-warm hover:bg-accent-hi-warm text-black rounded-xl transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
              title="Send"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
