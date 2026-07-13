/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion } from "motion/react";
import {
  X,
  Search,
  Star,
  Trash2,
  Pencil,
  FileDown,
  ExternalLink,
  Upload,
  Download,
  MessagesSquare,
  Plus,
  LibraryBig,
} from "lucide-react";
import { ResearchSession } from "../types";
import { buildDossierHtml } from "../lib/dossier";

interface KnowledgeLibraryProps {
  sessions: ResearchSession[];
  onClose: () => void;
  onOpenSession: (session: ResearchSession) => void;
  onToggleFavorite: (id: string) => void;
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
  onSetTags: (id: string, tags: string[]) => void;
  onImport: (sessions: ResearchSession[]) => void;
  getAgentColorHex: (theme: string) => string;
  addLog: (
    sender: string,
    message: string,
    type?: "info" | "success" | "warning" | "system",
    colorTheme?: string
  ) => void;
}

type SortMode = "newest" | "oldest" | "az";
type DepthMode = "recon" | "standard" | "deep";

interface MatchInfo {
  where: string;
  excerpt: string;
}

const DEPTH_LABELS: Record<string, string> = {
  recon: "Recon",
  standard: "Standard",
  deep: "Deep",
};

// Derive a sortable recency number. Session ids look like "session_<ms>"; fall
// back to parsing the human-readable timestamp for imported/foreign records.
function recency(s: ResearchSession): number {
  const m = /(\d{10,})/.exec(s.id);
  if (m) return Number(m[1]);
  const t = Date.parse(s.timestamp);
  return isNaN(t) ? 0 : t;
}

function displayName(s: ResearchSession): string {
  return s.label || s.topic;
}

// Ordered searchable fields per session — the first field containing the query
// determines the "where" label shown under the card title.
function buildFields(s: ResearchSession): { where: string; text: string }[] {
  const fields: { where: string; text: string }[] = [];
  fields.push({ where: "title", text: displayName(s) });
  if (s.label && s.label !== s.topic) fields.push({ where: "topic", text: s.topic });
  if (s.tags && s.tags.length) fields.push({ where: "tag", text: s.tags.join(" ") });
  for (const a of s.agents) {
    fields.push({ where: `roster — ${a.name}`, text: `${a.name} ${a.role} ${a.investigativeAngle}` });
  }
  if (s.synthesizedReport) fields.push({ where: "synthesis", text: s.synthesizedReport });
  for (const a of s.agents) {
    if (a.report) fields.push({ where: `report — ${a.name}`, text: a.report });
  }
  if (s.chat && s.chat.length) {
    fields.push({ where: "chat", text: s.chat.map((m) => m.content).join("  ") });
  }
  return fields;
}

function findMatch(s: ResearchSession, query: string): MatchInfo | null {
  const q = query.toLowerCase();
  if (!q) return null;
  for (const f of buildFields(s)) {
    const idx = f.text.toLowerCase().indexOf(q);
    if (idx !== -1) {
      const start = Math.max(0, idx - 30);
      const end = Math.min(f.text.length, idx + q.length + 60);
      let excerpt = f.text.slice(start, end).replace(/\s+/g, " ").trim();
      if (start > 0) excerpt = "…" + excerpt;
      if (end < f.text.length) excerpt = excerpt + "…";
      return { where: f.where, excerpt };
    }
  }
  return null;
}

function Highlight({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>;
  const lower = text.toLowerCase();
  const q = term.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i <= text.length) {
    const idx = lower.indexOf(q, i);
    if (idx === -1) {
      parts.push(text.slice(i));
      break;
    }
    if (idx > i) parts.push(text.slice(i, idx));
    parts.push(
      <span key={key++} className="bg-accent-warm/25 text-accent-hi-warm rounded px-0.5">
        {text.slice(idx, idx + q.length)}
      </span>
    );
    i = idx + q.length;
  }
  return <>{parts}</>;
}

function downloadBlob(content: string, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

interface LibraryCardProps {
  session: ResearchSession;
  match: MatchInfo | null;
  term: string;
  index: number;
  onOpen: (session: ResearchSession) => void;
  onToggleFavorite: (id: string) => void;
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
  onSetTags: (id: string, tags: string[]) => void;
  getAgentColorHex: (theme: string) => string;
}

function LibraryCard({
  session,
  match,
  term,
  index,
  onOpen,
  onToggleFavorite,
  onRename,
  onDelete,
  onSetTags,
  getAgentColorHex,
}: LibraryCardProps) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(displayName(session));
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [tagValue, setTagValue] = useState("");
  const disarmRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const tagRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (disarmRef.current) clearTimeout(disarmRef.current);
    };
  }, []);

  useEffect(() => {
    if (renaming) renameRef.current?.focus();
  }, [renaming]);

  useEffect(() => {
    if (addingTag) tagRef.current?.focus();
  }, [addingTag]);

  const commitRename = () => {
    onRename(session.id, renameValue);
    setRenaming(false);
  };

  const commitTag = () => {
    const t = tagValue.trim();
    if (t) {
      const existing = session.tags || [];
      if (!existing.some((x) => x.toLowerCase() === t.toLowerCase())) {
        onSetTags(session.id, [...existing, t]);
      }
    }
    setTagValue("");
    setAddingTag(false);
  };

  const removeTag = (tag: string) => {
    onSetTags(session.id, (session.tags || []).filter((t) => t !== tag));
  };

  const armDelete = () => {
    if (deleteArmed) {
      onDelete(session.id);
      return;
    }
    setDeleteArmed(true);
    if (disarmRef.current) clearTimeout(disarmRef.current);
    disarmRef.current = setTimeout(() => setDeleteArmed(false), 3000);
  };

  const hasReport = !!(session.synthesizedReport && session.synthesizedReport.trim());
  const depth = session.config?.depth as DepthMode | undefined;
  const statusColor =
    session.status === "completed"
      ? "text-success border-success/30 bg-success/5"
      : session.status === "failed"
      ? "text-error border-error/30 bg-error/5"
      : "text-text-muted border-border-warm bg-bg-primary/40";

  const handleExport = () => {
    if (!hasReport) return;
    const html = buildDossierHtml(session);
    const safe = displayName(session).toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 50);
    downloadBlob(html, "text/html;charset=utf-8;", `${safe}_dossier.html`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.45), duration: 0.25, ease: "easeOut" }}
      className="group relative flex flex-col bg-bg-surface border border-border-warm hover:border-border-hi-warm rounded-2xl p-4 transition-colors"
    >
      {/* Favorite star */}
      <button
        onClick={() => onToggleFavorite(session.id)}
        className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-lg transition-all cursor-pointer hover:bg-bg-primary"
        title={session.favorite ? "Unfavorite" : "Favorite"}
      >
        <Star
          className={`w-4 h-4 ${session.favorite ? "text-amber-400 fill-amber-400" : "text-text-muted"}`}
        />
      </button>

      {/* Title / rename */}
      <div className="pr-8 mb-2">
        {renaming ? (
          <input
            ref={renameRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setRenameValue(displayName(session));
                setRenaming(false);
              }
            }}
            className="w-full bg-bg-primary border border-border-hi-warm text-text-primary text-sm font-display font-semibold rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-warm"
          />
        ) : (
          <h3 className="text-sm font-display font-semibold text-text-primary leading-snug line-clamp-2" title={displayName(session)}>
            {displayName(session)}
          </h3>
        )}
      </div>

      {/* Match excerpt */}
      {match && (
        <div className="mb-2.5 -mt-0.5">
          <div className="text-[9px] font-mono uppercase tracking-widest font-bold text-accent-warm mb-0.5">
            match: {match.where}
          </div>
          <p className="text-[11px] text-text-muted font-mono leading-relaxed line-clamp-2">
            <Highlight text={match.excerpt} term={term} />
          </p>
        </div>
      )}

      {/* Timestamp + status */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[9px] font-mono text-text-muted truncate">{session.timestamp}</span>
        <span
          className={`text-[8px] font-mono uppercase tracking-widest font-bold px-1.5 py-0.5 rounded-full border ${statusColor} flex-shrink-0`}
        >
          {session.status}
        </span>
      </div>

      {/* Agent color dots */}
      {session.agents.length > 0 && (
        <div className="flex items-center gap-1 mb-3 flex-wrap">
          {session.agents.map((a) => (
            <span
              key={a.id}
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: getAgentColorHex(a.colorTheme) }}
              title={`${a.name} — ${a.role}`}
            />
          ))}
        </div>
      )}

      {/* Depth + node chips */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        {depth && (
          <span className="text-[8px] font-mono uppercase tracking-widest font-bold text-text-secondary bg-bg-primary/60 border border-border-warm px-1.5 py-0.5 rounded">
            {DEPTH_LABELS[depth] || depth}
          </span>
        )}
        <span className="text-[8px] font-mono uppercase tracking-widest font-bold text-text-secondary bg-bg-primary/60 border border-border-warm px-1.5 py-0.5 rounded">
          {session.agents.length} nodes
        </span>
        {session.chat && session.chat.length > 0 && (
          <span className="text-[8px] font-mono uppercase tracking-widest font-bold text-text-secondary bg-bg-primary/60 border border-border-warm px-1.5 py-0.5 rounded flex items-center gap-1">
            <MessagesSquare className="w-2.5 h-2.5" />
            {session.chat.length}
          </span>
        )}
      </div>

      {/* Tags */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        {(session.tags || []).map((tag) => (
          <span
            key={tag}
            className="text-[9px] font-mono text-accent-hi-warm bg-accent-warm/5 border border-accent-warm/20 pl-2 pr-1 py-0.5 rounded-full flex items-center gap-1"
          >
            {tag}
            <button
              onClick={() => removeTag(tag)}
              className="hover:text-error cursor-pointer"
              title="Remove tag"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
        {addingTag ? (
          <input
            ref={tagRef}
            value={tagValue}
            onChange={(e) => setTagValue(e.target.value)}
            onBlur={commitTag}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTag();
              if (e.key === "Escape") {
                setTagValue("");
                setAddingTag(false);
              }
            }}
            placeholder="tag…"
            className="text-[9px] font-mono w-20 bg-bg-primary border border-border-hi-warm text-text-primary rounded-full px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-accent-warm"
          />
        ) : (
          <button
            onClick={() => setAddingTag(true)}
            className="text-[9px] font-mono text-text-muted hover:text-accent-warm border border-dashed border-border-warm hover:border-accent-warm/40 px-2 py-0.5 rounded-full flex items-center gap-0.5 cursor-pointer transition-colors"
            title="Add tag"
          >
            <Plus className="w-2.5 h-2.5" />
            tag
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 mt-auto pt-3 border-t border-border-warm">
        <button
          onClick={() => onOpen(session)}
          className="flex-1 flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-black bg-accent-warm hover:bg-accent-hi-warm rounded-lg py-1.5 transition-colors cursor-pointer"
          title="Open this swarm"
        >
          <ExternalLink className="w-3 h-3" />
          Open
        </button>
        <button
          onClick={() => {
            setRenameValue(displayName(session));
            setRenaming(true);
          }}
          className="w-8 h-8 flex items-center justify-center text-text-muted hover:text-accent-warm bg-bg-primary/40 hover:bg-bg-primary border border-border-warm rounded-lg transition-colors cursor-pointer"
          title="Rename"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleExport}
          disabled={!hasReport}
          className="w-8 h-8 flex items-center justify-center text-text-muted hover:text-accent-warm bg-bg-primary/40 hover:bg-bg-primary border border-border-warm rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-text-muted disabled:hover:bg-bg-primary/40"
          title={hasReport ? "Export dossier (HTML)" : "No synthesis to export"}
        >
          <FileDown className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={armDelete}
          className={`h-8 flex items-center justify-center gap-1 border rounded-lg transition-colors cursor-pointer ${
            deleteArmed
              ? "px-2.5 text-error border-error/40 bg-error/10 text-[9px] font-mono uppercase tracking-wider font-bold"
              : "w-8 text-text-muted hover:text-error bg-bg-primary/40 hover:bg-bg-primary border-border-warm"
          }`}
          title={deleteArmed ? "Confirm delete" : "Delete"}
        >
          <Trash2 className="w-3.5 h-3.5" />
          {deleteArmed && "Confirm?"}
        </button>
      </div>
    </motion.div>
  );
}

export default function KnowledgeLibrary({
  sessions,
  onClose,
  onOpenSession,
  onToggleFavorite,
  onRename,
  onDelete,
  onSetTags,
  onImport,
  getAgentColorHex,
  addLog,
}: KnowledgeLibraryProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("newest");
  const [favOnly, setFavOnly] = useState(false);
  const [hasChatOnly, setHasChatOnly] = useState(false);
  const [depthFilter, setDepthFilter] = useState<DepthMode | null>(null);
  const [completedOnly, setCompletedOnly] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ESC closes the library.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  const results = useMemo(() => {
    const q = debouncedQuery.trim();
    let list = sessions.map((s) => ({ session: s, match: findMatch(s, q) }));
    if (q) list = list.filter((r) => r.match !== null);
    if (favOnly) list = list.filter((r) => r.session.favorite);
    if (hasChatOnly) list = list.filter((r) => r.session.chat && r.session.chat.length > 0);
    if (depthFilter) list = list.filter((r) => r.session.config?.depth === depthFilter);
    if (completedOnly) list = list.filter((r) => r.session.status === "completed");
    list.sort((a, b) => {
      if (sort === "az") return displayName(a.session).localeCompare(displayName(b.session));
      if (sort === "oldest") return recency(a.session) - recency(b.session);
      return recency(b.session) - recency(a.session);
    });
    return list;
  }, [sessions, debouncedQuery, favOnly, hasChatOnly, depthFilter, completedOnly, sort]);

  const handleExportArchive = () => {
    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(JSON.stringify(sessions, null, 2), "application/json;charset=utf-8;", `swarm_archive_${date}.json`);
    addLog("SYSTEM", `Exported ${sessions.length} session${sessions.length === 1 ? "" : "s"} from the Knowledge Library.`, "success");
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!Array.isArray(parsed)) throw new Error("Archive must be a JSON array of sessions.");
        const valid = parsed.filter(
          (item: unknown): item is ResearchSession =>
            !!item &&
            typeof (item as ResearchSession).id === "string" &&
            typeof (item as ResearchSession).topic === "string" &&
            Array.isArray((item as ResearchSession).agents)
        );
        if (valid.length === 0) throw new Error("No valid sessions found in this archive.");
        onImport(valid);
        const skipped = parsed.length - valid.length;
        addLog(
          "SYSTEM",
          `Imported ${valid.length} session${valid.length === 1 ? "" : "s"} into the Knowledge Library${skipped > 0 ? ` (${skipped} invalid skipped)` : ""}.`,
          "success"
        );
        setImportError(null);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : "Failed to parse the archive file.");
      }
    };
    reader.onerror = () => setImportError("Could not read the selected file.");
    reader.readAsText(file);
    e.target.value = "";
  };

  const clearFilters = () => {
    setQuery("");
    setFavOnly(false);
    setHasChatOnly(false);
    setDepthFilter(null);
    setCompletedOnly(false);
  };

  const chipBase =
    "text-[10px] font-mono uppercase tracking-wider font-bold px-2.5 py-1.5 rounded-lg border transition-colors cursor-pointer flex items-center gap-1.5";
  const chipOn = "text-accent-warm border-border-hi-warm bg-bg-primary";
  const chipOff = "text-text-muted border-border-warm bg-bg-surface hover:text-text-secondary";

  const totalCount = sessions.length;
  const filteredCount = results.length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-40 bg-bg-primary flex flex-col"
    >
      {/* Header */}
      <motion.div
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="border-b border-border-warm bg-bg-surface px-5 sm:px-8 py-5 flex items-center justify-between gap-4 flex-shrink-0"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-accent-warm/10 border border-accent-warm/20 flex items-center justify-center flex-shrink-0">
            <LibraryBig className="w-5 h-5 text-accent-warm" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-display font-bold text-text-primary tracking-tight leading-none">
              KNOWLEDGE LIBRARY
            </h2>
            <div className="text-[10px] font-mono uppercase tracking-widest font-bold text-text-muted mt-1">
              {debouncedQuery.trim() || favOnly || hasChatOnly || depthFilter || completedOnly
                ? `${filteredCount} of ${totalCount} archived`
                : `${totalCount} swarm${totalCount === 1 ? "" : "s"} archived`}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleExportArchive}
            disabled={totalCount === 0}
            className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider font-bold text-text-secondary hover:text-accent-warm bg-bg-primary/40 hover:bg-bg-primary border border-border-warm rounded-lg px-3 py-2 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            title="Download the entire archive as JSON"
          >
            <Download className="w-3.5 h-3.5" />
            Export Archive
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider font-bold text-text-secondary hover:text-accent-warm bg-bg-primary/40 hover:bg-bg-primary border border-border-warm rounded-lg px-3 py-2 transition-colors cursor-pointer"
            title="Import sessions from a JSON archive"
          >
            <Upload className="w-3.5 h-3.5" />
            Import Archive
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-text-muted hover:text-error hover:bg-bg-primary border border-border-warm transition-colors cursor-pointer"
            title="Close library (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </motion.div>

      {/* Command bar */}
      <div className="border-b border-border-warm bg-bg-surface/60 px-5 sm:px-8 py-4 flex flex-col lg:flex-row lg:items-center gap-3 flex-shrink-0">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search topics, agents, reports, chat…"
            className="w-full bg-bg-primary border border-border-warm focus:border-border-hi-warm text-text-primary placeholder-text-muted rounded-xl pl-10 pr-9 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-border-hi-warm transition-all"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-accent-warm cursor-pointer"
              title="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            className="text-[10px] font-mono uppercase tracking-wider font-bold text-text-secondary bg-bg-primary border border-border-warm rounded-lg px-2.5 py-2 focus:outline-none focus:border-border-hi-warm cursor-pointer"
            title="Sort order"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="az">A–Z</option>
          </select>

          <button onClick={() => setFavOnly((v) => !v)} className={`${chipBase} ${favOnly ? chipOn : chipOff}`} title="Favorites only">
            <Star className={`w-3 h-3 ${favOnly ? "fill-amber-400 text-amber-400" : ""}`} />
            Favorites
          </button>
          <button onClick={() => setHasChatOnly((v) => !v)} className={`${chipBase} ${hasChatOnly ? chipOn : chipOff}`} title="Has interrogation chat">
            Has Chat
          </button>
          {(["recon", "standard", "deep"] as DepthMode[]).map((d) => (
            <button
              key={d}
              onClick={() => setDepthFilter((cur) => (cur === d ? null : d))}
              className={`${chipBase} ${depthFilter === d ? chipOn : chipOff}`}
              title={`Depth: ${DEPTH_LABELS[d]}`}
            >
              {DEPTH_LABELS[d]}
            </button>
          ))}
          <button onClick={() => setCompletedOnly((v) => !v)} className={`${chipBase} ${completedOnly ? chipOn : chipOff}`} title="Completed only">
            Completed
          </button>
        </div>
      </div>

      {/* Import error line */}
      {importError && (
        <div className="px-5 sm:px-8 py-2.5 bg-error/10 border-b border-error/20 flex items-center justify-between gap-3 flex-shrink-0">
          <span className="text-[11px] font-mono text-error">{importError}</span>
          <button onClick={() => setImportError(null)} className="text-error hover:text-text-primary cursor-pointer" title="Dismiss">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-5 sm:px-8 py-6">
        {totalCount === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-bg-surface border border-border-warm flex items-center justify-center mb-4">
              <LibraryBig className="w-7 h-7 text-text-muted" />
            </div>
            <h3 className="text-lg font-display font-bold text-text-primary mb-2">No archived swarms yet</h3>
            <p className="text-xs text-text-muted leading-relaxed mb-5">
              Deploy your first agent swarm and it will be preserved here — searchable, taggable, and exportable.
            </p>
            <button
              onClick={onClose}
              className="px-5 py-2.5 bg-accent-warm hover:bg-accent-hi-warm text-black text-xs font-bold uppercase tracking-wider rounded-xl transition-colors cursor-pointer"
            >
              Run a Swarm
            </button>
          </div>
        ) : filteredCount === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-bg-surface border border-border-warm flex items-center justify-center mb-4">
              <Search className="w-7 h-7 text-text-muted" />
            </div>
            <h3 className="text-lg font-display font-bold text-text-primary mb-2">No matching swarms</h3>
            <p className="text-xs text-text-muted leading-relaxed mb-5">
              {debouncedQuery.trim() ? (
                <>
                  Nothing matched <span className="text-accent-warm font-mono">“{debouncedQuery.trim()}”</span> with the active filters.
                </>
              ) : (
                <>No swarms match the active filters.</>
              )}
            </p>
            <button
              onClick={clearFilters}
              className="px-5 py-2.5 bg-bg-surface hover:bg-bg-primary border border-border-warm text-text-primary text-xs font-bold uppercase tracking-wider rounded-xl transition-colors cursor-pointer"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {results.map((r, i) => (
              <LibraryCard
                key={r.session.id}
                session={r.session}
                match={r.match}
                term={debouncedQuery.trim()}
                index={i}
                onOpen={onOpenSession}
                onToggleFavorite={onToggleFavorite}
                onRename={onRename}
                onDelete={onDelete}
                onSetTags={onSetTags}
                getAgentColorHex={getAgentColorHex}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
