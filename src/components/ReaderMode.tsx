/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { X, List, Minus, Plus, Type } from "lucide-react";

interface ReaderModeProps {
  title: string;
  markdown: string;
  accentHex?: string;
  onClose: () => void;
}

interface TocEntry {
  id: string;
  text: string;
  level: number;
}

const FONT_SIZES = ["16px", "18px", "21px"];
const DEFAULT_SIZE_INDEX = 1;

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractText(children: React.ReactNode): string {
  if (children == null) return "";
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(extractText).join("");
  if (React.isValidElement(children)) return extractText((children.props as { children?: React.ReactNode }).children);
  return "";
}

// Build a table of contents from the raw markdown headings (# / ## / ###),
// skipping any headings that live inside fenced code blocks.
function buildToc(markdown: string): TocEntry[] {
  const entries: TocEntry[] = [];
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^(#{1,3})\s+(.+?)\s*#*$/.exec(line);
    if (match) {
      const text = match[2].trim();
      entries.push({ id: slugify(text), text, level: match[1].length });
    }
  }
  return entries;
}

export default function ReaderMode({ title, markdown, accentHex, onClose }: ReaderModeProps) {
  const [sizeIndex, setSizeIndex] = useState(DEFAULT_SIZE_INDEX);
  const [progress, setProgress] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const toc = useMemo(() => buildToc(markdown), [markdown]);
  const accent = accentHex || "#fb923c";

  // ESC closes the reader.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const max = container.scrollHeight - container.clientHeight;
    setProgress(max > 0 ? (container.scrollTop / max) * 100 : 0);

    // Active heading = nearest heading at or above the current scroll position.
    const headings = contentRef.current?.querySelectorAll<HTMLElement>("h1[id], h2[id], h3[id]");
    if (!headings || headings.length === 0) return;
    const marker = container.scrollTop + 120;
    let current: string | null = headings[0].id;
    headings.forEach((h) => {
      if (h.offsetTop <= marker) current = h.id;
    });
    setActiveId(current);
  }, []);

  useEffect(() => {
    handleScroll();
  }, [handleScroll, sizeIndex, markdown]);

  const scrollToHeading = (id: string) => {
    const container = scrollRef.current;
    const el = contentRef.current?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (container && el) {
      container.scrollTo({ top: el.offsetTop - 16, behavior: "smooth" });
    }
  };

  const makeHeading = (Tag: "h1" | "h2" | "h3", className: string, style: React.CSSProperties) =>
    ({ children, node, ...props }: { children?: React.ReactNode; node?: unknown }) => {
      const id = slugify(extractText(children));
      return (
        <Tag id={id} className={className} style={style} {...props}>
          {children}
        </Tag>
      );
    };

  const mdComponents = {
    h1: makeHeading("h1", "font-display font-bold text-text-primary border-b border-border-warm", {
      fontSize: "1.9em",
      marginTop: "1.5em",
      marginBottom: "0.6em",
      paddingBottom: "0.3em",
      scrollMarginTop: "1rem",
    }),
    h2: makeHeading("h2", "font-display font-semibold text-text-primary", {
      fontSize: "1.5em",
      marginTop: "1.3em",
      marginBottom: "0.5em",
      scrollMarginTop: "1rem",
    }),
    h3: makeHeading("h3", "font-display font-semibold", {
      fontSize: "1.25em",
      marginTop: "1.1em",
      marginBottom: "0.4em",
      color: accent,
      scrollMarginTop: "1rem",
    }),
    p: ({ node, ...props }: any) => (
      <p className="text-text-secondary" style={{ fontSize: "1em", lineHeight: 1.8, marginBottom: "1em" }} {...props} />
    ),
    ul: ({ node, ...props }: any) => (
      <ul className="list-disc text-text-secondary" style={{ paddingLeft: "1.5em", marginBottom: "1em", lineHeight: 1.8 }} {...props} />
    ),
    ol: ({ node, ...props }: any) => (
      <ol className="list-decimal text-text-secondary" style={{ paddingLeft: "1.5em", marginBottom: "1em", lineHeight: 1.8 }} {...props} />
    ),
    li: ({ node, ...props }: any) => <li className="text-text-secondary" style={{ marginBottom: "0.35em" }} {...props} />,
    a: ({ node, ...props }: any) => <a className="text-accent-hi-warm underline underline-offset-2" {...props} />,
    blockquote: ({ node, ...props }: any) => (
      <blockquote
        className="border-l-4 border-accent-warm bg-bg-surface rounded-r-lg italic text-text-muted"
        style={{ padding: "0.75em 1.25em", margin: "1.25em 0" }}
        {...props}
      />
    ),
    code: ({ node, ...props }: any) => (
      <code className="bg-bg-surface text-accent-warm rounded font-mono border border-border-warm" style={{ fontSize: "0.85em", padding: "0.1em 0.4em" }} {...props} />
    ),
    pre: ({ node, ...props }: any) => (
      <pre className="bg-bg-surface rounded-xl overflow-x-auto border border-border-warm font-mono text-text-secondary" style={{ padding: "1.1em 1.25em", margin: "1.25em 0", fontSize: "0.85em" }} {...props} />
    ),
    table: ({ node, ...props }: any) => (
      <div className="overflow-x-auto" style={{ margin: "1.5em 0" }}>
        <table className="min-w-full divide-y divide-border-warm border border-border-warm rounded-lg" style={{ fontSize: "0.9em" }} {...props} />
      </div>
    ),
    th: ({ node, ...props }: any) => <th className="bg-bg-surface text-left font-semibold text-text-primary" style={{ padding: "0.6em 1em" }} {...props} />,
    td: ({ node, ...props }: any) => <td className="border-t border-border-warm" style={{ padding: "0.6em 1em" }} {...props} />,
    hr: ({ node, ...props }: any) => <hr className="border-border-warm" style={{ margin: "2em 0" }} {...props} />,
    strong: ({ node, ...props }: any) => <strong className="text-text-primary font-bold" {...props} />,
  };

  return (
    <div className="fixed inset-0 z-50 bg-bg-primary flex flex-col">
      {/* Scroll progress bar */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-border-warm/40 z-10">
        <div className="h-full transition-[width] duration-75" style={{ width: `${progress}%`, backgroundColor: accent }} />
      </div>

      {/* Top bar */}
      <div className="h-14 border-b border-border-warm bg-bg-surface flex items-center justify-between px-4 gap-3 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {toc.length > 0 && (
            <button
              onClick={() => setTocOpen((v) => !v)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-accent-warm hover:bg-bg-primary transition-all cursor-pointer flex-shrink-0"
              title={tocOpen ? "Hide contents" : "Show contents"}
            >
              <List className="w-4 h-4" />
            </button>
          )}
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: accent }}></span>
            <h2 className="text-sm font-semibold text-text-primary truncate font-display">{title}</h2>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Font-size control */}
          <div className="flex items-center gap-0.5 bg-bg-primary border border-border-warm rounded-lg p-0.5">
            <button
              onClick={() => setSizeIndex((i) => Math.max(0, i - 1))}
              disabled={sizeIndex <= 0}
              className="w-7 h-7 flex items-center justify-center rounded-md text-text-secondary hover:text-accent-warm hover:bg-bg-surface transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              title="Smaller text"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setSizeIndex(DEFAULT_SIZE_INDEX)}
              className="w-7 h-7 flex items-center justify-center rounded-md text-text-secondary hover:text-accent-warm hover:bg-bg-surface transition-all cursor-pointer"
              title="Reset text size"
            >
              <Type className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setSizeIndex((i) => Math.min(FONT_SIZES.length - 1, i + 1))}
              disabled={sizeIndex >= FONT_SIZES.length - 1}
              className="w-7 h-7 flex items-center justify-center rounded-md text-text-secondary hover:text-accent-warm hover:bg-bg-surface transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              title="Larger text"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-error hover:bg-bg-primary transition-all cursor-pointer"
            title="Close reader (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* TOC sidebar */}
        {toc.length > 0 && tocOpen && (
          <aside className="w-60 flex-shrink-0 border-r border-border-warm bg-bg-surface overflow-y-auto py-4 hidden sm:block">
            <div className="px-4 mb-3 text-[9px] font-mono uppercase tracking-widest font-bold text-text-muted">Contents</div>
            <nav className="px-2">
              {toc.map((entry, i) => (
                <button
                  key={`${entry.id}-${i}`}
                  onClick={() => scrollToHeading(entry.id)}
                  className={`w-full text-left px-2 py-1.5 rounded-md text-xs transition-all cursor-pointer truncate ${
                    activeId === entry.id ? "text-text-primary bg-bg-primary font-semibold" : "text-text-muted hover:text-text-secondary"
                  }`}
                  style={{ paddingLeft: `${0.5 + (entry.level - 1) * 0.75}rem`, borderLeft: activeId === entry.id ? `2px solid ${accent}` : "2px solid transparent" }}
                  title={entry.text}
                >
                  {entry.text}
                </button>
              ))}
            </nav>
          </aside>
        )}

        {/* Content */}
        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto relative">
          <div ref={contentRef} className="max-w-3xl mx-auto px-6 py-10 md:px-8" style={{ fontSize: FONT_SIZES[sizeIndex] }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{markdown}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}
