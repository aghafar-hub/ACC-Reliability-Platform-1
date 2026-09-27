import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./ThemeContext";

// Integration adapter only — not part of the original app's own code path
// (main.jsx, untouched, still renders this exact same tree into its own
// index.html's #root for a standalone build/deploy). This lets the shared
// platform shell mount the same app into a container it controls, so the
// original app loads in place under the shared sidebar instead of as a
// separate page — same UI, own backend/login, unchanged.
export function mountVibrationAnalysis(container) {
  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </ErrorBoundary>
    </React.StrictMode>,
  );
  return () => root.unmount();
}
