import { useEffect, useRef, useState } from "react";
import { useTheme } from "../ThemeContext";
import useIsMobile from "../hooks/useIsMobile";
import ModalShell from "./ModalShell";
import { renderPdfPages } from "../pdfReportParser";
import { REPORT_GROUPS, cellMark } from "../labReport";
import { formatDate } from "../parsers";

// The lab's own PDF next to the values saved in the app, so whoever
// validates checks one against the other (opening it is what unlocks
// Validate — on the server too). Validate / Return sit in the footer.
export default function LabReportViewer({ sample, loadPdf, onOpened, actions, onClose }) {
  const { T, s } = useTheme();
  const isMobile = useIsMobile();
  const [state, setState] = useState({ loading: true });
  const pagesRef = useRef(null);

  useEffect(() => {
    let gone = false;
    (async () => {
      try {
        const pdf = await loadPdf(sample);
        if (gone) return;
        if (pdf.none) {
          setState({ none: true, missing: pdf.missing });
          // nothing kept to show: the saved values are, to check by hand
          onOpened?.({ missing: !!pdf.missing });
          return;
        }
        const canvases = await renderPdfPages(pdf.bytes);
        if (gone) return;
        setState({ fileName: pdf.fileName, canvases });
        onOpened?.();
      } catch (err) {
        if (!gone) setState({ error: err.message || "The lab report couldn't be loaded." });
      }
    })();
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per sample
  }, [sample._id]);

  useEffect(() => {
    const box = pagesRef.current;
    if (!box || !state.canvases) return;
    box.innerHTML = "";
    state.canvases.forEach((c, i) => {
      c.style.width = "100%";
      c.style.height = "auto";
      c.style.display = "block";
      c.style.marginBottom = "10px";
      c.style.boxShadow = "0 1px 4px rgba(0,0,0,0.18)";
      c.setAttribute("aria-label", `Lab report page ${i + 1}`);
      box.appendChild(c);
    });
  }, [state.canvases]);

  const rows = REPORT_GROUPS.filter((g) => g.title !== "Sample Info").map((g) => ({
    title: g.title,
    rows: g.rows.filter((r) => r.get && r.get(sample) !== null && r.get(sample) !== undefined && r.get(sample) !== ""),
  })).filter((g) => g.rows.length);

  return (
    <ModalShell
      icon="file-type-pdf"
      title="Lab report"
      subtitle={`${sample.unitId} · ${formatDate(sample.sampledDate) || "no date"} · Sample ${sample.sampleId || "—"}`}
      badge={<span style={s.badge(sample.validationStatus)}>{sample.validationStatus || "—"}</span>}
      onClose={onClose}
      width={1180}
      testid="lab-report-viewer"
      footer={actions}
    >
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) 300px", gap: 16, alignItems: "start" }}>
        <div style={{ minWidth: 0 }}>
          {state.loading && (
            <p style={{ color: T.textSecondary, fontSize: 13 }} data-testid="lab-pdf-loading">
              <i className="ti ti-file-type-pdf" aria-hidden="true" /> Loading the lab's PDF…
            </p>
          )}
          {state.error && <p style={{ color: T.danger, fontSize: 13 }}>{state.error}</p>}
          {state.none && (
            <div style={{ ...s.infoBar, fontSize: 13 }} data-testid="lab-pdf-none">
              {state.missing
                ? "PDF missing — the lab's PDF of this report wasn't stored. Compare the values with the lab's report you received; to validate, write why below (or return the report so it is imported again)."
                : "No PDF is kept with this report (entered by hand, or imported before PDFs were kept). Compare the values with the lab's report you received."}
            </div>
          )}
          {state.fileName && (
            <p style={{ fontSize: 12, color: T.textSecondary, margin: "0 0 8px" }} data-testid="lab-pdf-name">
              <i className="ti ti-file-type-pdf" aria-hidden="true" /> {state.fileName} — the newest column on the lab's report is this sample only if its date matches.
            </p>
          )}
          <div ref={pagesRef} data-testid="lab-pdf-pages" />
        </div>
        <div style={{ ...s.card, marginBottom: 0, padding: 14, position: isMobile ? "static" : "sticky", top: 0 }} data-testid="lab-saved-values">
          <p style={{ fontWeight: 700, fontSize: 13, margin: "0 0 2px" }}>Saved in the app</p>
          <p style={{ fontSize: 12, color: T.textSecondary, margin: "0 0 10px" }}>Check each value against the lab's report.</p>
          {rows.map((g) => (
            <div key={g.title} style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: T.accent, margin: "0 0 4px" }}>{g.title}</p>
              {g.rows.map((r) => {
                const mark = r.kind === "num" ? cellMark(sample, r) : "";
                return (
                  <div key={r.key} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, padding: "2px 0", borderBottom: `1px solid ${T.border2 || T.border}` }}>
                    <span style={{ color: T.textSecondary }}>{r.label}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 600, color: mark === "Alert" ? T.danger : mark === "Caution" ? T.warning : T.textPrimary }}>
                      {String(r.get(sample))}
                      {mark ? ` ${mark === "Alert" ? "◆" : "▲"}` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </ModalShell>
  );
}
