import { useMemo } from "react";
import { useTheme } from "../ThemeContext";
import { LevelPill } from "./Level";
import { monthLabel, shortDate } from "../vibModel";
import { stageTone } from "../tones";

// A machine's actions on its page (Vibration → Equipment → machine):
//   LastRecommendation — the newest recommendation from the reports, at the top
//   MachineActions     — the "Actions" tab: every action, open first
// Both read getVibActions (actions + findings); a card opens the full action
// on the Actions page.

const OPEN = ["Draft", "Open", "Waiting Stoppage", "Closure Requested"];

// "2026-07: Check sheaves…" → { month: "2026-07", text: "Check sheaves…" }
function splitMonth(t) {
  const m = String(t || "").match(/^(\d{4}-\d{2}):\s*([\s\S]*)$/);
  return m ? { month: m[1], text: m[2] } : { month: "", text: String(t || "") };
}

function machineActions(data, eqId) {
  const acts = (data?.actions || []).filter((a) => a["Equipment ID"] === eqId);
  const finds = data?.findings || [];
  return acts
    .map((a) => ({ ...a, _findings: finds.filter((f) => f["Action ID"] === a["Action ID"]).sort((x, y) => String(y.Month).localeCompare(String(x.Month))) }))
    .sort((x, y) => (OPEN.includes(y.Status) ? 1 : 0) - (OPEN.includes(x.Status) ? 1 : 0) || String(y["Last finding date"] || y["Created at"]).localeCompare(String(x["Last finding date"] || x["Created at"])));
}

function Stage({ T, st }) {
  const c = stageTone(T, st);
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 999, padding: "2px 9px", fontSize: 12, fontWeight: 700, color: c, background: c + "1A" }}>{st}</span>;
}

function Field({ T, label, children }) {
  if (!children) return null;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".04em", color: T.textMuted, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 13.5, color: T.textPrimary, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{children}</div>
    </div>
  );
}

export function LastRecommendation({ data, eqId, onOpenAction, loading }) {
  const { T, s } = useTheme();
  const actions = useMemo(() => machineActions(data, eqId), [data, eqId]);
  const withRec = actions.filter((a) => a["Contractor recommendation"] || a["Analysis recommendation"]);
  const a = withRec.sort((x, y) => {
    const mx = splitMonth(x["Contractor recommendation"]).month || String(x["Last finding date"] || "").slice(0, 7);
    const my = splitMonth(y["Contractor recommendation"]).month || String(y["Last finding date"] || "").slice(0, 7);
    return my.localeCompare(mx);
  })[0];
  const rec = a ? splitMonth(a["Contractor recommendation"] || a["Analysis recommendation"]) : null;
  return (
    <div style={{ ...s.card, marginBottom: 14, borderLeft: `4px solid ${a ? T.accent : T.border}`, padding: "12px 16px" }} data-testid="vm-last-rec">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: a ? 6 : 0 }}>
        <i className="ti ti-message-report" aria-hidden="true" style={{ color: T.accent, fontSize: 18 }} />
        <b style={{ color: T.textPrimary }}>Last report recommendation</b>
        {rec?.month && <span style={{ fontSize: 12.5, color: T.textSecondary }}>{monthLabel(rec.month)} report</span>}
        {a && (
          <>
            <LevelPill level={a.Severity} />
            <Stage T={T} st={a.Status} />
            <button type="button" onClick={() => onOpenAction(a["Action ID"])} style={{ ...s.btnGhost, marginLeft: "auto", padding: "4px 10px", fontSize: 12.5 }} data-testid="vm-last-rec-open">
              {a["Action ID"]} <i className="ti ti-arrow-right" aria-hidden="true" />
            </button>
          </>
        )}
      </div>
      {a ? (
        <div style={{ fontSize: 14, color: T.textPrimary, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }} data-testid="vm-last-rec-text">
          {rec.text}
          {a["Agreed action"] && (
            <div style={{ marginTop: 6, fontSize: 13, color: T.textSecondary }}>
              <b>Agreed:</b> {a["Agreed action"]}
            </div>
          )}
        </div>
      ) : (
        <span style={{ fontSize: 13, color: T.textSecondary, marginLeft: 8 }}>{loading ? "Loading…" : "No recommendation in the reports for this machine."}</span>
      )}
    </div>
  );
}

export default function MachineActions({ data, eqId, onOpenAction, loading }) {
  const { T, s } = useTheme();
  const actions = useMemo(() => machineActions(data, eqId), [data, eqId]);
  if (!actions.length) return <div style={{ ...s.card, color: T.textSecondary }} data-testid="vm-actions">{loading ? "Loading actions…" : "No actions for this machine."}</div>;
  return (
    <div style={{ display: "grid", gap: 12 }} data-testid="vm-actions">
      {actions.map((a) => {
        const months = [...new Set(a._findings.map((f) => f.Month).filter(Boolean))];
        const rec = splitMonth(a["Contractor recommendation"]);
        const open = OPEN.includes(a.Status);
        return (
          <div key={a["Action ID"]} style={{ ...s.card, marginBottom: 0, borderTop: `3px solid ${stageTone(T, a.Status)}`, opacity: open ? 1 : 0.85 }} data-testid={`vm-action-${a["Action ID"]}`}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <b style={{ color: T.textPrimary }}>{a["Action ID"]}</b>
              <Stage T={T} st={a.Status} />
              <LevelPill level={a.Severity} />
              {a.Priority && <span style={{ fontSize: 12.5, color: T.textSecondary }}>{a.Priority}</span>}
              <span style={{ fontSize: 12.5, color: T.textSecondary }}>
                {a.Owner ? `Owner ${a.Owner}` : open ? "No owner" : ""}
                {a["Due date"] ? ` · due ${shortDate(String(a["Due date"]).slice(0, 10))}` : ""}
                {!open && a["Closed at"] ? ` · closed ${shortDate(String(a["Closed at"]).slice(0, 10))}` : ""}
              </span>
              <button type="button" onClick={() => onOpenAction(a["Action ID"])} style={{ ...s.btnGhost, marginLeft: "auto", padding: "4px 10px", fontSize: 12.5 }} data-testid={`vm-action-open-${a["Action ID"]}`}>
                Open action <i className="ti ti-arrow-right" aria-hidden="true" />
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 12 }}>
              <Field T={T} label={`Contractor recommendation${rec.month ? ` · ${monthLabel(rec.month)}` : ""}`}>{rec.text}</Field>
              <Field T={T} label="Analysis">{a["Analysis recommendation"]}</Field>
              <Field T={T} label="ACC recommendation">{a["ACC recommendation"]}</Field>
              <Field T={T} label="Agreed action">{a["Agreed action"]}</Field>
              <Field T={T} label="Closure">{a["Closure comment"]}</Field>
            </div>
            {months.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 12.5, color: T.textSecondary }}>
                Findings in {months.length} report{months.length > 1 ? "s" : ""}: {months.map(monthLabel).join(" · ")}
                {a._findings[0]?.Points ? ` — latest: ${a._findings[0].Points}` : ""}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
