import { useState } from "react";
import { useTheme } from "../ThemeContext";
import { parsePdfReports } from "../pdfReportParser";
import BulkImportReview from "./BulkImportReview";

const MAX_FILES = 30;

export default function BulkImportPanel({ equipmentRegistry, existingSamples, onBulkAdd }) {
  const { T, s } = useTheme();
  const [files, setFiles] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState(null);
  const [parsedReports, setParsedReports] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(null);
  const [resultMsg, setResultMsg] = useState("");

  function pickFiles(list) {
    const picked = Array.from(list).slice(0, MAX_FILES);
    setFiles(picked);
    setResultMsg("");
    if (list.length > MAX_FILES) {
      setResultMsg(`❌ Only the first ${MAX_FILES} files were kept — drop up to ${MAX_FILES} PDFs at a time.`);
    }
  }

  async function startParsing() {
    if (!files.length) return;
    setParsing(true);
    setParseProgress({ done: 0, total: files.length });
    try {
      const results = await parsePdfReports(files, (done, total) => setParseProgress({ done, total }));
      setParsedReports(results);
    } finally {
      setParsing(false);
    }
  }

  async function handleConfirm(selectedSamples) {
    setSaving(true);
    setSaveProgress({ done: 0, total: selectedSamples.length, errors: 0 });
    try {
      const result = await onBulkAdd(selectedSamples, (done, total, errors) => setSaveProgress({ done, total, errors }));
      setParsedReports(null);
      setFiles([]);
      setResultMsg(
        `✓ Added ${result.saved} sample${result.saved === 1 ? "" : "s"}` +
          (result.failed ? ` — ${result.failed} failed, see toasts for details` : "")
      );
    } finally {
      setSaving(false);
      setSaveProgress(null);
    }
  }

  return (
    <div style={{ maxWidth: 1100 }}>
      <div
        style={{
          ...s.card,
          border: `2px dashed ${T.border}`,
          textAlign: "center",
          padding: 32,
          cursor: "pointer",
        }}
        onClick={() => document.getElementById("bulk-pdf-input").click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length) pickFiles(e.dataTransfer.files);
        }}
      >
        <i className="ti ti-file-upload" style={{ fontSize: 32, color: T.accent }} aria-hidden="true" />
        <p style={{ fontWeight: 700, marginTop: 10, marginBottom: 4 }}>Drop lab report PDFs here, or click to choose</p>
        <p style={{ fontSize: 12, color: T.textSecondary }}>Up to {MAX_FILES} at a time — parsed right here in your browser.</p>
        <input
          id="bulk-pdf-input"
          type="file"
          accept="application/pdf"
          multiple
          style={{ display: "none" }}
          onChange={(e) => e.target.files.length && pickFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <div style={{ ...s.card, marginTop: 14 }}>
          <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
            {files.length} file{files.length === 1 ? "" : "s"} ready
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {files.map((f) => (
              <span
                key={f.name}
                style={{ fontSize: 11, background: T.cardSubBg, border: `1px solid ${T.border2}`, borderRadius: 6, padding: "3px 8px" }}
              >
                {f.name}
              </span>
            ))}
          </div>
          <button style={s.btnPrimary} onClick={startParsing} disabled={parsing}>
            <i className={`ti ${parsing ? "ti-loader" : "ti-scan"}`} aria-hidden="true" />{" "}
            {parsing ? `Parsing ${parseProgress?.done || 0} of ${parseProgress?.total}…` : "Parse Reports"}
          </button>
        </div>
      )}

      {resultMsg && <p style={{ marginTop: 12, fontSize: 12, color: resultMsg.startsWith("✓") ? T.success : T.danger }}>{resultMsg}</p>}

      {parsedReports && (
        <BulkImportReview
          parsedReports={parsedReports}
          equipmentRegistry={equipmentRegistry}
          existingSamples={existingSamples}
          onConfirm={handleConfirm}
          onCancel={() => setParsedReports(null)}
          saving={saving}
          progress={saveProgress}
        />
      )}
    </div>
  );
}
