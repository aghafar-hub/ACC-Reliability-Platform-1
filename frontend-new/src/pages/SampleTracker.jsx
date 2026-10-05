import { useEffect, useState } from "react";
import { T, s } from "../theme";
import * as api from "../api";
import { bucketAllLubricationPoints } from "../sampleStatus";

// Four-column board matching the REAL "Oil Sampling Log" page exactly
// (docs/visual-reference/Screenshot 2026-10-06 005725.png), not the old
// apps/oil-analysis/src/pages/SampleTracker.jsx dark-theme source — the
// real app uses a solid tinted header BLOCK (not a thin top border) and
// month-based status phrasing. See docs/visual-reference/NOTES.md.
const BUCKETS = ["Overdue", "Missing", "Due Soon", "On Track"];
const BUCKET_COLOR_KEY = { Overdue: "warning", Missing: "danger", "Due Soon": "accent", "On Track": "success" };
const BUCKET_BG_KEY = { Overdue: "warningBg", Missing: "dangerBg", "Due Soon": "navActive", "On Track": "successBg" };

function ChipCard({ lp, statusLine, color }) {
  return (
    <div
      style={{
        background: T.cardBg,
        border: `1px solid ${T.border2}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 8,
        padding: "10px 12px",
        marginBottom: 8,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 12.5, color: T.accent }}>{lp.lp_id}</div>
      <div
        style={{
          fontSize: 11,
          color: T.textSecondary,
          margin: "1px 0 5px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {lp.lubrication_point || lp.equipment_description}
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 5, flexWrap: "wrap" }}>
        {lp.area && (
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              padding: "1px 6px",
              borderRadius: 999,
              background: T.cardSubBg,
              color: T.textMuted,
              border: `1px solid ${T.border2}`,
            }}
          >
            {lp.area}
          </span>
        )}
        {lp.org_code && (
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              padding: "1px 6px",
              borderRadius: 999,
              background: T.cardSubBg,
              color: T.textMuted,
              border: `1px solid ${T.border2}`,
            }}
          >
            {lp.org_code}
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color }}>{statusLine}</div>
    </div>
  );
}

export default function SampleTracker() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [byBucket, setByBucket] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [lps, samples] = await Promise.all([api.getAllLubricationPoints(), api.getAllOilSamples()]);
        if (cancelled) return;
        setByBucket(bucketAllLubricationPoints(lps, samples));
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <p style={s.sectionTitle}>Oil Sampling Log</p>

      {error && (
        <div style={{ color: T.danger, fontSize: 13, marginBottom: 16, background: T.dangerBg, padding: "10px 14px", borderRadius: 8 }}>
          {error}
        </div>
      )}

      {loading && <p style={{ color: T.textSecondary }}>Loading…</p>}

      {byBucket && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 14 }}>
          {BUCKETS.map((bucket) => {
            const colorKey = BUCKET_COLOR_KEY[bucket];
            const color = T[colorKey];
            const headerBg = T[BUCKET_BG_KEY[bucket]] || T.navActive;
            const list = byBucket[bucket];
            return (
              <div key={bucket}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "9px 12px",
                    background: headerBg,
                    borderRadius: "8px 8px 0 0",
                    border: `1px solid ${T.border}`,
                    borderLeft: `3px solid ${color}`,
                    borderBottom: "none",
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 800, color, textTransform: "uppercase" }}>{bucket}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color }}>{list.length}</span>
                </div>
                <div
                  style={{
                    border: `1px solid ${T.border}`,
                    borderTop: "none",
                    borderRadius: "0 0 8px 8px",
                    padding: 10,
                    maxHeight: 560,
                    overflowY: "auto",
                    background: T.appBg,
                  }}
                >
                  {list.length === 0 && (
                    <div style={{ textAlign: "center", color: T.textMuted, fontSize: 12, padding: "16px 0" }}>None</div>
                  )}
                  {list.map((row) => (
                    <ChipCard key={row.lp.lp_id} lp={row.lp} statusLine={row.statusLine} color={color} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
