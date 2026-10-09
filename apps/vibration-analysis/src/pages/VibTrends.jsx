import { useEffect, useMemo, useState } from "react";
import EquipmentSearch, { idTextMatch } from "../components/EquipmentSearch";
import { getVibEquipmentHistory } from "../api";
import { useTheme } from "../ThemeContext";
import useIsMobile from "../hooks/useIsMobile";
import ContractorChips from "../components/ContractorChips";
import { PageHeader } from "../components/Tile";
import TrendChart from "../components/TrendChart";
import { seriesColors } from "../tones";

// Trends: compare machines over time (workflow "Vibration Trend"). One line
// per machine — the highest value of its points on each date for the chosen
// measure. Histories load one machine at a time (the Apps Script web app
// doesn't serve parallel requests reliably).

const MAX = 6;
const FIELD = { RMS: "Max velocity (mm/s)", SPM: "HDm (dBsv)", Gs: "G's (g)" };
const UNIT = { RMS: "mm/s", SPM: "dBsv", Gs: "g" };

export default function VibTrends({ webhookUrl, scopeEquipment }) {
  const { T, s, themeName } = useTheme();
  const isMobile = useIsMobile();
  const machines = useMemo(() => Object.values(scopeEquipment || {}).filter((m) => m.points.length).sort((a, b) => a.id.localeCompare(b.id)), [scopeEquipment]);
  const [picked, setPicked] = useState([]);
  const [metric, setMetric] = useState("RMS");
  const [q, setQ] = useState("");
  const [hist, setHist] = useState({});
  const [loading, setLoading] = useState(false);
  const colors = seriesColors(themeName);

  useEffect(() => {
    const missing = picked.filter((id) => !hist[id]);
    if (!missing.length) return;
    let live = true;
    (async () => {
      setLoading(true);
      for (const id of missing) {
        try {
          const d = await getVibEquipmentHistory(webhookUrl, id);
          if (!live) return;
          setHist((h) => ({ ...h, [id]: d.entries || [] }));
        } catch {
          if (live) setHist((h) => ({ ...h, [id]: [] }));
        }
      }
      if (live) setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, [picked, hist, webhookUrl]);

  const series = picked.map((id, i) => {
    const byDate = {};
    (hist[id] || []).forEach((e) => {
      if (e.Family !== metric) return;
      const v = parseFloat(e[FIELD[metric]]);
      if (isNaN(v)) return;
      const d = e["Measurement date"];
      byDate[d] = Math.max(byDate[d] ?? -Infinity, v);
    });
    return { label: `${id} · ${scopeEquipment[id]?.name || ""}`, color: colors[i % colors.length], points: Object.entries(byDate).map(([date, value]) => ({ date, value })) };
  });
  const sameLimits = picked.length && metric !== "Gs" && picked.every((id) => JSON.stringify(scopeEquipment[id]?.[metric === "RMS" ? "rms" : "spm"]) === JSON.stringify(scopeEquipment[picked[0]]?.[metric === "RMS" ? "rms" : "spm"]));
  const limits = sameLimits ? scopeEquipment[picked[0]]?.[metric === "RMS" ? "rms" : "spm"] || null : null;
  const options = machines.filter((m) => !picked.includes(m.id) && (!q || (m.id + " " + m.name).toLowerCase().includes(q.toLowerCase()))).slice(0, 60);

  return (
    <div style={{ padding: isMobile ? "14px 12px" : "20px 24px" }} data-testid="vib-trends">
      <PageHeader title="Vibration Trends" subtitle={`Compare up to ${MAX} machines · ${picked.length} picked · highest point value per date`} right={<ContractorChips value={metric} onChange={setMetric} options={["RMS", "SPM", "Gs"]} allLabel={null} label="Measure" testid="vt-metric" />} />
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: isMobile ? "1fr" : "300px minmax(0,1fr)" }}>
        <div style={{ ...s.card, marginBottom: 0 }}>
          <div style={{ fontWeight: 700, marginBottom: 8, color: T.textPrimary }}>Machines</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {picked.map((id, i) => (
              <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 8px", borderRadius: 999, border: `1px solid ${T.border}`, fontSize: 12.5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: colors[i % colors.length] }} />
                {id}
                <button type="button" aria-label={`Remove ${id}`} onClick={() => setPicked(picked.filter((x) => x !== id))} style={{ border: "none", background: "none", cursor: "pointer", color: T.textSecondary, padding: 0 }}>
                  ✕
                </button>
              </span>
            ))}
            {!picked.length && <span style={{ fontSize: 12.5, color: T.textSecondary }}>Pick machines below.</span>}
          </div>
          <div style={{ marginBottom: 8 }}>
            <EquipmentSearch freeText options={machines.filter((m) => !picked.includes(m.id)).map((m) => ({ code: m.id, description: m.name }))} value={q} onChange={(v) => { if (picked.length < MAX && machines.some((m) => m.id === v) && !picked.includes(v)) { setPicked([...picked, v]); setQ(""); } else setQ(v); }} placeholder="Equipment ID or name…" width="100%" testid="vt-find" />
          </div>
          <div style={{ maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
            {options.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={picked.length >= MAX}
                onClick={() => setPicked([...picked, m.id])}
                data-testid={`vt-pick-${m.id}`}
                style={{ textAlign: "left", background: "none", border: "none", padding: "6px 4px", borderRadius: 6, cursor: picked.length >= MAX ? "not-allowed" : "pointer", color: T.textPrimary, fontFamily: "inherit", fontSize: 13 }}
              >
                <b>{m.id}</b> <span style={{ color: T.textSecondary }}>{m.name}</span>
              </button>
            ))}
          </div>
        </div>
        <div style={{ ...s.card, marginBottom: 0 }} data-testid="vt-chart-card">
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <b style={{ color: T.textPrimary }}>{metric === "RMS" ? "RMS velocity (highest of H / V / A)" : metric === "SPM" ? "SPM HDm" : "G's (PeakVue)"}</b>
            <span style={{ marginLeft: "auto", fontSize: 12, color: T.textSecondary }}>{loading ? "Loading…" : limits ? `Limits ${limits.join(" / ")} ${UNIT[metric]}` : picked.length > 1 && metric !== "Gs" ? "Machines have different limits — bands hidden" : ""}</span>
          </div>
          {picked.length ? <TrendChart T={T} series={series} limits={limits} unit={UNIT[metric]} height={320} testid="vt-chart" /> : <div style={{ color: T.textSecondary, padding: 30, textAlign: "center" }}>Pick one or more machines to compare.</div>}
        </div>
      </div>
    </div>
  );
}
