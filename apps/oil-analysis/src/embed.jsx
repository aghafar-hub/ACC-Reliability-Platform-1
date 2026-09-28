import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";

// Integration adapter only — see apps/vibration-analysis/src/embed.jsx for
// the full rationale. Not part of the original app's own code path
// (main.jsx, untouched, still renders this exact tree for a standalone
// build/deploy). App itself already wraps AppShell in its own ThemeProvider,
// so this mirrors main.jsx exactly — no extra wrapping needed here.
//
// navBridge (optional): see the comment above App() in src/App.jsx for the
// full rationale — a plain object, not React state, used to drive/observe
// this app's page navigation from the embedding shell across the React
// 18/19 root boundary.
//
// session (optional, Option B Phase 1): { token, claims } from the shell's
// own Platform Core login (frontend/src/auth/AuthContext) — passed once at
// mount, since this app only ever mounts while already behind the shell's
// RequireAuth (a logout unmounts the whole shell, embedded app included,
// rather than leaving this mounted with a stale session). Absent entirely
// for a standalone build, where there's no shell login to read.
export function mountOilAnalysis(container, { navBridge, session } = {}) {
  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App navBridge={navBridge} session={session} />
      </ErrorBoundary>
    </React.StrictMode>,
  );
  return () => root.unmount();
}
