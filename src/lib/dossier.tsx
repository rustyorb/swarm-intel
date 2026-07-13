/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ResearchSession, Agent } from "../types";

const APP_VERSION = "v2.9.0";

const AGENT_HEX: Record<string, string> = {
  cyan: "#e11d48",
  emerald: "#84cc16",
  rose: "#ec4899",
  amber: "#f59e0b",
  purple: "#a855f7",
  indigo: "#8b5cf6",
  blue: "#818cf8",
  fuchsia: "#d946ef",
};

const agentHex = (theme: string): string => AGENT_HEX[theme] || "#dd2d4a";

const DEPTH_LABELS: Record<string, string> = {
  recon: "Recon — Fast tactical brief",
  standard: "Standard — Balanced dossier",
  deep: "Deep — Exhaustive analysis",
};

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const DOSSIER_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

:root {
  --bg: #120a10;
  --surface: #1a1018;
  --border: #30202c;
  --border-hi: #402a3a;
  --text: #f2e9e4;
  --text-2: #b3a0ac;
  --muted: #9c8a96;
  --accent: #dd2d4a;
  --accent-hi: #f75d75;
  --success: #7bbf6a;
  --error: #e2703c;
}

* { box-sizing: border-box; }

html { scroll-behavior: smooth; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text-2);
  font-family: "Inter", ui-sans-serif, system-ui, sans-serif;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

.dossier { max-width: 820px; margin: 0 auto; padding: 64px 32px 96px; }

/* Cover */
.eyebrow {
  font-family: "JetBrains Mono", monospace;
  font-size: 10px; font-weight: 700; letter-spacing: 0.25em;
  text-transform: uppercase; color: var(--accent); margin-bottom: 18px;
}
.cover-topic {
  font-family: "Space Grotesk", sans-serif;
  font-size: 40px; line-height: 1.1; font-weight: 700;
  color: var(--text); margin: 0 0 28px; letter-spacing: -0.02em;
}
.meta-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1px; background: var(--border); border: 1px solid var(--border);
  border-radius: 12px; overflow: hidden; margin-bottom: 40px;
}
.meta-item { background: var(--surface); padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; }
.meta-k {
  font-family: "JetBrains Mono", monospace; font-size: 9px; font-weight: 700;
  letter-spacing: 0.18em; text-transform: uppercase; color: var(--muted);
}
.meta-v { font-family: "JetBrains Mono", monospace; font-size: 13px; color: var(--text); word-break: break-word; }

.roster-title, .toc-title, .section-eyebrow {
  font-family: "JetBrains Mono", monospace; font-size: 10px; font-weight: 700;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--muted); margin-bottom: 14px;
}
.roster-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.roster-table th {
  text-align: left; font-family: "JetBrains Mono", monospace; font-size: 9px; font-weight: 700;
  letter-spacing: 0.15em; text-transform: uppercase; color: var(--muted);
  padding: 8px 12px; border-bottom: 1px solid var(--border);
}
.roster-table td { padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: top; color: var(--text-2); }
.roster-name { color: var(--text); font-weight: 600; white-space: nowrap; }
.roster-role { font-family: "JetBrains Mono", monospace; font-size: 12px; }
.roster-angle { color: var(--muted); font-size: 12px; font-style: italic; }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; }

/* Table of contents */
.toc { border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); padding: 28px 0; margin-bottom: 8px; }
.toc-list { list-style: none; counter-reset: toc; margin: 0; padding: 0; display: grid; gap: 8px; }
.toc-list li { counter-increment: toc; }
.toc-list a {
  display: flex; align-items: baseline; gap: 12px; color: var(--text-2);
  text-decoration: none; font-size: 14px; padding: 4px 0; transition: color 0.15s;
}
.toc-list a::before {
  content: counter(toc, decimal-leading-zero);
  font-family: "JetBrains Mono", monospace; font-size: 11px; color: var(--accent); font-weight: 700;
}
.toc-list a:hover { color: var(--accent-hi); }

/* Sections */
.section { padding-top: 56px; margin-top: 24px; }
.section-title {
  font-family: "Space Grotesk", sans-serif; font-size: 28px; font-weight: 700;
  color: var(--text); margin: 6px 0 24px; letter-spacing: -0.01em;
}

.agent-header {
  display: flex; align-items: center; gap: 14px; padding: 16px 20px;
  border-radius: 12px; border: 1px solid var(--border); border-left-width: 4px;
  background: var(--surface); margin-bottom: 16px;
}
.agent-dot { width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0; }
.agent-name { font-family: "Space Grotesk", sans-serif; font-size: 22px; font-weight: 700; color: var(--text); line-height: 1.1; }
.agent-role { font-family: "JetBrains Mono", monospace; font-size: 11px; letter-spacing: 0.05em; color: var(--muted); margin-top: 4px; }
.agent-angle {
  border-left: 3px solid var(--accent); background: rgba(251, 146, 60, 0.06);
  padding: 12px 16px; border-radius: 0 8px 8px 0; font-size: 13px; font-style: italic;
  color: var(--text-2); margin-bottom: 24px;
}

/* Interrogation transcript */
.transcript { display: grid; gap: 16px; }
.qa-q { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
.qa-a { border: 1px solid var(--border); border-left-width: 3px; border-radius: 10px; padding: 14px 16px; background: rgba(255, 255, 255, 0.015); }
.qa-label {
  display: block; font-family: "JetBrains Mono", monospace; font-size: 9px; font-weight: 700;
  letter-spacing: 0.18em; text-transform: uppercase; color: var(--muted); margin-bottom: 8px;
}
.qa-q .qa-label { color: var(--accent); }
.qa-text { color: var(--text); font-size: 14px; }

/* Footer */
.footer {
  margin-top: 72px; padding-top: 24px; border-top: 1px solid var(--border);
  font-family: "JetBrains Mono", monospace; font-size: 11px; color: var(--muted);
  text-align: center; letter-spacing: 0.05em;
}
.footer .accent { color: var(--accent); }

/* Rendered markdown */
.md { color: var(--text-2); font-size: 15px; }
.md > :first-child { margin-top: 0; }
.md h1 {
  font-family: "Space Grotesk", sans-serif; font-size: 24px; color: var(--text); font-weight: 700;
  margin: 32px 0 14px; border-bottom: 1px solid var(--border); padding-bottom: 8px;
}
.md h2 { font-family: "Space Grotesk", sans-serif; font-size: 20px; color: var(--text); font-weight: 600; margin: 28px 0 12px; }
.md h3 { font-family: "Space Grotesk", sans-serif; font-size: 16px; color: var(--accent); font-weight: 600; margin: 22px 0 10px; }
.md h4 { font-size: 14px; color: var(--text); font-weight: 700; margin: 18px 0 8px; text-transform: uppercase; letter-spacing: 0.05em; }
.md p { margin: 0 0 16px; }
.md a { color: var(--accent-hi); text-decoration: underline; text-underline-offset: 2px; }
.md ul, .md ol { margin: 0 0 16px; padding-left: 24px; }
.md li { margin-bottom: 6px; }
.md blockquote {
  border-left: 4px solid var(--accent); background: var(--surface); margin: 18px 0;
  padding: 12px 18px; border-radius: 0 8px 8px 0; color: var(--muted); font-style: italic;
}
.md code {
  font-family: "JetBrains Mono", monospace; font-size: 0.88em; background: var(--bg);
  color: var(--accent); border: 1px solid var(--border); border-radius: 4px; padding: 1px 6px;
}
.md pre { background: #0f0d09; border: 1px solid var(--border); border-radius: 12px; padding: 16px 18px; overflow-x: auto; margin: 18px 0; }
.md pre code { background: none; border: none; padding: 0; color: var(--text-2); font-size: 13px; }
.md table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px; display: block; overflow-x: auto; }
.md th { background: var(--bg); color: var(--text); text-align: left; padding: 10px 14px; border: 1px solid var(--border); font-weight: 600; }
.md td { padding: 10px 14px; border: 1px solid var(--border); }
.md hr { border: none; border-top: 1px solid var(--border); margin: 28px 0; }
.md strong { color: var(--text); font-weight: 700; }
.md img { max-width: 100%; }

/* Paper theme for print / Save-as-PDF */
@media print {
  :root {
    --bg: #ffffff; --surface: #f5f2ec; --border: #d9d2c4; --border-hi: #c9c1b0;
    --text: #1a1611; --text-2: #33302a; --muted: #6b655a;
  }
  body { background: #ffffff; color: var(--text-2); }
  .dossier { max-width: 100%; padding: 0 12px; }
  .toc-list a { text-decoration: none; }
  .section { page-break-before: always; padding-top: 24px; }
  .eyebrow, .section-eyebrow { color: #b45309; }
  .md h3 { color: #c2410c; }
  .cover-topic, .section-title, .agent-name, .md h1, .md h2 { color: #1a1611; }
  .md pre { background: #f5f2ec; }
  .md pre code { color: #33302a; }
  a { color: #b45309; }
}
`;

function Markdown({ children }: { children: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>;
}

function DossierBody({ session }: { session: ResearchSession }) {
  const reportedAgents = session.agents.filter((a) => a.report && a.report.trim().length > 0);
  const hasChat = !!(session.chat && session.chat.length > 0);
  const depthLabel = session.config ? DEPTH_LABELS[session.config.depth] : undefined;

  return (
    <div className="dossier">
      {/* COVER */}
      <header className="cover">
        <div className="eyebrow">SWARM_INTEL // MISSION DOSSIER</div>
        <h1 className="cover-topic">{session.topic}</h1>
        <div className="meta-grid">
          <div className="meta-item">
            <span className="meta-k">Session ID</span>
            <span className="meta-v">{session.id}</span>
          </div>
          <div className="meta-item">
            <span className="meta-k">Completed</span>
            <span className="meta-v">{session.timestamp}</span>
          </div>
          <div className="meta-item">
            <span className="meta-k">Node Count</span>
            <span className="meta-v">{session.agents.length}</span>
          </div>
          {depthLabel && (
            <div className="meta-item">
              <span className="meta-k">Depth Mode</span>
              <span className="meta-v">{depthLabel}</span>
            </div>
          )}
        </div>

        <div className="roster-title">Specialist Roster</div>
        <table className="roster-table">
          <thead>
            <tr>
              <th style={{ width: "18px" }}></th>
              <th>Name</th>
              <th>Role</th>
              <th>Investigative Angle</th>
            </tr>
          </thead>
          <tbody>
            {session.agents.map((a) => (
              <tr key={a.id}>
                <td>
                  <span className="dot" style={{ background: agentHex(a.colorTheme) }}></span>
                </td>
                <td className="roster-name">{a.name}</td>
                <td className="roster-role">{a.role}</td>
                <td className="roster-angle">{a.investigativeAngle}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </header>

      {/* TABLE OF CONTENTS */}
      <nav className="toc">
        <div className="toc-title">Contents</div>
        <ol className="toc-list">
          <li>
            <a href="#synthesis">Consolidated Synthesis</a>
          </li>
          {reportedAgents.map((a) => (
            <li key={a.id}>
              <a href={`#agent-${a.id}`}>
                {a.name} — {a.role}
              </a>
            </li>
          ))}
          {hasChat && (
            <li>
              <a href="#transcript">Interrogation Transcript</a>
            </li>
          )}
        </ol>
      </nav>

      {/* SYNTHESIS */}
      <section className="section" id="synthesis">
        <div className="section-eyebrow">Unified Intelligence Synthesis</div>
        <h2 className="section-title">Consolidated Synthesis</h2>
        <div className="md">
          {session.synthesizedReport && session.synthesizedReport.trim() ? (
            <Markdown>{session.synthesizedReport}</Markdown>
          ) : (
            <p>
              <em>No consolidated synthesis was recorded for this mission.</em>
            </p>
          )}
        </div>
      </section>

      {/* SPECIALIST SECTIONS */}
      {reportedAgents.map((a: Agent) => {
        const hex = agentHex(a.colorTheme);
        return (
          <section className="section" id={`agent-${a.id}`} key={a.id}>
            <div
              className="agent-header"
              style={{ borderLeftColor: hex, background: hexToRgba(hex, 0.12) }}
            >
              <span className="agent-dot" style={{ background: hex }}></span>
              <div>
                <div className="agent-name">{a.name}</div>
                <div className="agent-role">{a.role}</div>
              </div>
            </div>
            <div className="agent-angle" style={{ borderLeftColor: hex }}>
              "{a.investigativeAngle}"
            </div>
            <div className="md">
              <Markdown>{a.report as string}</Markdown>
            </div>
          </section>
        );
      })}

      {/* INTERROGATION TRANSCRIPT */}
      {hasChat && (
        <section className="section" id="transcript">
          <div className="section-eyebrow">Post-Mission Q&amp;A</div>
          <h2 className="section-title">Interrogation Transcript</h2>
          <div className="transcript">
            {session.chat!.map((m) =>
              m.role === "user" ? (
                <div className="qa-q" key={m.id}>
                  <span className="qa-label">Interrogator</span>
                  <div className="qa-text">{m.content}</div>
                </div>
              ) : (
                <div
                  className="qa-a"
                  key={m.id}
                  style={m.respondentColor ? { borderLeftColor: agentHex(m.respondentColor) } : undefined}
                >
                  <span
                    className="qa-label"
                    style={m.respondentColor ? { color: agentHex(m.respondentColor) } : undefined}
                  >
                    {m.respondentName}
                  </span>
                  <div className="md">
                    <Markdown>{m.content}</Markdown>
                  </div>
                </div>
              )
            )}
          </div>
        </section>
      )}

      <footer className="footer">
        Generated by <span className="accent">SWARM_INTEL</span> {APP_VERSION} · {new Date().toLocaleDateString()}
      </footer>
    </div>
  );
}

export function buildDossierHtml(session: ResearchSession): string {
  const body = renderToStaticMarkup(<DossierBody session={session} />);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>SWARM_INTEL Dossier — ${escapeHtml(session.topic)}</title>
<style>${DOSSIER_CSS}</style>
</head>
<body>
${body}
</body>
</html>`;
}
