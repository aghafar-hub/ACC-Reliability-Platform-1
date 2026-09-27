import { Component } from "react";
import { T } from "../theme";

// The original bundle has no error boundary at all (an uncaught render
// error blanks the whole page with no message) — this is an addition,
// mirroring the sibling oil-analysis app's own ErrorBoundary, not a ported
// piece of the original's behavior.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Unhandled error in app:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100vh",
            background: T.appBg,
            color: T.textPrimary,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div style={{ maxWidth: 480, textAlign: "center" }}>
            <h2 style={{ color: T.danger }}>Something went wrong</h2>
            <p style={{ color: T.textSecondary, fontSize: 13 }}>{this.state.error.message}</p>
            <button
              style={{
                marginTop: 16,
                background: T.accent,
                border: "none",
                color: T.accentText,
                borderRadius: 6,
                padding: "10px 18px",
                cursor: "pointer",
              }}
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
