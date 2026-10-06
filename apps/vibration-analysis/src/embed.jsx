import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { setSessionToken } from "./api";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./ThemeContext";

// Integration adapter only — not part of the original app's own code path
// (main.jsx, untouched, still renders this exact same tree into its own
// index.html's #root for a standalone build/deploy). This lets the shared
// platform shell mount the same app into a container it controls, so the
// original app loads in place under the shared sidebar instead of as a
// separate page — same UI, own backend/login, unchanged.
//
// navBridge (optional): see the comment above App() in src/App.jsx for the
// full rationale — a plain object, not React state, used to drive/observe
// this app's page navigation from the embedding shell across the React
// 18/19 root boundary.
//
// session (optional, Phase 0): { token } — the shell's login token, sent with
// every request so this module's backend can apply Module Access.
export function mountVibrationAnalysis(container, { navBridge, session } = {}) {
  setSessionToken(session?.token);
  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <ThemeProvider navBridge={navBridge}>
          <App navBridge={navBridge} />
        </ThemeProvider>
      </ErrorBoundary>
    </React.StrictMode>,
  );
  return () => root.unmount();
}
