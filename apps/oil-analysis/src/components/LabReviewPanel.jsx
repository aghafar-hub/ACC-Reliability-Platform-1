import { useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import { useIsAccEngineer } from "../SessionContext";
import { useLabWorkflow } from "../ActionWorkflowContext";
import LabReportViewer from "./LabReportViewer";

// Phase 4 — lab reports waiting for review. Either engineer uploads; an ACC
// Engineer validates (a Caution/Alert result then creates the Draft
// action) or returns a missing or incorrect report with a reason. A
// returned report goes back here as Pending Validation once it's corrected
// and saved.
export default function LabReviewPanel({ samples, equipmentRegistry }) {
  const { T, s } = useTheme();
  const list = useMemo(
    () =>
      (samples || [])
        .filter((sm) => sm.validationStatus === "Pending Validation" || sm.validationStatus === "Returned")
        .sort((a, b) => new Date(b.sampledDate || 0) - new Date(a.sampledDate || 0)),
    [samples]
  );
  const contractorOf = useMemo(() => {
    const map = {};
    (equipmentRegistry || []).forEach((r) => (map[r.code] = r.contractor));
    return map;
  }, [equipmentRegistry]);
  if (list.length === 0) return null;

  return (
    <div style={{ ...s.card, marginBottom: 18, borderColor: T.warning }}>
      <p style={{ fontWeight: 700, margin: "0 0 4px" }}>
        <i className="ti ti-file-check" aria-hidden="true" style={{ marginRight: 6 }} />
        Lab reports to review ({list.length})
      </p>
      <p style={{ fontSize: 12, color: T.textSecondary, margin: "0 0 10px" }}>
        An ACC Engineer validates each report after opening it and checking its values against the lab's PDF, or returns a missing or incorrect one.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Point</th>
              <th style={s.th}>Sample date</th>
              <th style={s.th}>Result</th>
              <th style={s.th}>Uploaded</th>
              <th style={s.th}>Status</th>
              <th style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {list.map((sm) => (
              <ReviewRow key={sm._id} sample={sm} contractor={contractorOf[sm.unitId] || ""} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReviewRow({ sample, contractor }) {
  const { T, s } = useTheme();
  const run = useLabWorkflow();
  const canValidate = useIsAccEngineer();
  const canReturn = useIsAccEngineer();
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Validate stays locked until this person has opened the report (the
  // lab's PDF next to the saved values) — the server checks it too.
  const [viewing, setViewing] = useState(false);
  const [opened, setOpened] = useState(false);
  const pending = sample.validationStatus === "Pending Validation";

  async function go(kind) {
    if (kind === "return" && !reason.trim()) {
      setError("Write why it's returned.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await run(kind, sample, reason.trim());
      setViewing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td style={s.td}>
        <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 700, color: T.accent }}>{sample.unitId}</span>
        <div style={{ fontSize: 12, color: T.textSecondary }}>{contractor || "—"}</div>
      </td>
      <td style={s.td}>{sample.sampledDate || "—"}</td>
      <td style={s.td}>
        <span style={s.badge(sample.reportStatus)}>{sample.reportStatus || "—"}</span>
      </td>
      <td style={s.td}>
        <div style={{ fontSize: 12 }}>{sample.uploadedBy || "—"}</div>
        <div style={{ fontSize: 12, color: T.textMuted }}>{sample.uploadedDate}</div>
      </td>
      <td style={s.td}>
        <span style={s.badge(sample.validationStatus)}>{sample.validationStatus}</span>
        {!pending && sample.returnReason && (
          <div style={{ fontSize: 12, color: T.danger, marginTop: 4 }}>
            {sample.returnReason} — {sample.returnedBy}
            <div style={{ color: T.textSecondary }}>Correct the report and save it; it comes back here for validation.</div>
          </div>
        )}
      </td>
      <td style={{ ...s.td, minWidth: 220 }}>
        {run && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: pending ? 6 : 0 }}>
            <button style={s.btn} onClick={() => setViewing(true)} data-testid={`lab-open-${sample.sampleId}`} title="The lab's PDF next to the values saved in the app">
              <i className="ti ti-file-type-pdf" aria-hidden="true" /> {sample.reportFile ? "Open report" : "Check values"}
              {opened && <i className="ti ti-check" aria-hidden="true" style={{ color: T.success }} />}
            </button>
          </div>
        )}
        {pending && run && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {canValidate && (
              <button
                style={{ ...s.btnPrimary, ...(opened ? null : { opacity: 0.55, cursor: "not-allowed" }) }}
                disabled={busy || !opened}
                onClick={() => go("validate")}
                title={opened ? "Validate this lab report" : "Open the report and check its values first"}
                data-testid={`lab-validate-${sample.sampleId}`}
              >
                {busy ? "…" : opened ? "Validate" : <><i className="ti ti-lock" aria-hidden="true" /> Validate</>}
              </button>
            )}
            {canReturn && !returning && (
              <button style={{ ...s.btn, color: T.danger, borderColor: T.danger }} disabled={busy} onClick={() => setReturning(true)}>
                Return
              </button>
            )}
            {!canValidate && !canReturn && <span style={{ fontSize: 12, color: T.textSecondary }}>Waiting for ACC validation</span>}
          </div>
        )}
        {pending && returning && (
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            <input
              style={{ ...s.input, flex: 1, minWidth: 140 }}
              placeholder="What's missing or wrong"
              aria-label="Return reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <button style={{ ...s.btn, color: T.danger, borderColor: T.danger }} disabled={busy} onClick={() => go("return")}>
              Send back
            </button>
          </div>
        )}
        {pending && canValidate && !opened && (
          <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 4 }}>Open the report and check its values to unlock Validate.</div>
        )}
        {error && <div style={{ fontSize: 12, color: T.danger, marginTop: 4 }}>{error}</div>}
        {viewing && (
          <LabReportViewer
            sample={sample}
            loadPdf={(sm) => run("pdf", sm)}
            onOpened={() => setOpened(true)}
            onClose={() => setViewing(false)}
            actions={
              <>
                {error && <span style={{ fontSize: 12, color: T.danger, marginRight: "auto" }}>{error}</span>}
                <button style={s.btn} onClick={() => setViewing(false)}>
                  Close
                </button>
                {pending && canValidate && (
                  <button style={s.btnPrimary} disabled={busy || !opened} onClick={() => go("validate")} data-testid="lab-viewer-validate">
                    {busy ? "…" : opened ? "Values checked — Validate" : "Loading…"}
                  </button>
                )}
              </>
            }
          />
        )}
      </td>
    </tr>
  );
}
