import React from "react";

// Last-resort crash shield. Without this, any uncaught render/effect error
// unmounts the entire React tree and the user gets a silent white screen —
// which has already cost finished research runs. Failing loud, with recovery
// pointers, is the contract: the work is never as dead as the tab.
type Props = { children: React.ReactNode };
type State = { error: Error | null };

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("UI crash captured by ErrorBoundary:", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: "3rem", fontFamily: "monospace", color: "#f0f0f0", background: "#111", minHeight: "100vh" }}>
        <h1 style={{ color: "#ff6b35", letterSpacing: "0.05em" }}>UI CRASHED — YOUR DATA IS SAFE</h1>
        <p>The interface hit an unrecoverable error, but the research is not lost:</p>
        <ul style={{ lineHeight: 1.8 }}>
          <li>Session state (agent reports, partial synthesis) is preserved in localStorage.</li>
          <li>Completed syntheses are saved on disk in the <code>runs/</code> folder (<code>/api/research/runs</code>).</li>
        </ul>
        <pre style={{ color: "#ff6b6b", whiteSpace: "pre-wrap", background: "#1a1a1a", padding: "1rem", borderRadius: 6 }}>
          {String(this.state.error?.stack || this.state.error)}
        </pre>
        <button
          onClick={() => window.location.reload()}
          style={{ padding: "0.6rem 1.6rem", marginTop: "1rem", cursor: "pointer", background: "#ff6b35", color: "#111", border: "none", borderRadius: 6, fontFamily: "inherit", fontWeight: 700 }}
        >
          RELOAD WORKSPACE
        </button>
      </div>
    );
  }
}
