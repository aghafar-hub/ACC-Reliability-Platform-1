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
export function mountOilAnalysis(container, { navBridge } = {}) {
  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App navBridge={navBridge} />
      </ErrorBoundary>
    </React.StrictMode>,
  );
  return () => root.unmount();
}
