import { T } from "../theme";

// Exact copy used verbatim by the real app for its own not-yet-built tabs
// (confirmed from docs/visual-reference screenshots of Equipment,
// Reliability Measures, Compressors, and the top-level Dashboard).
export default function Placeholder({ title }) {
  return (
    <div>
      <p style={{ fontSize: 24, fontWeight: 800, color: T.textPrimary, margin: "0 0 4px", borderBottom: `3px solid ${T.accent}`, display: "inline-block", paddingBottom: 6 }}>
        {title}
      </p>
      <p style={{ color: T.textSecondary, marginTop: 16 }}>This tab is on the sidebar — its design is still to come.</p>
    </div>
  );
}
