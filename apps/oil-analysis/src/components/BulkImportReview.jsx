import { useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import { formatDate } from "../parsers";

// Flattens every parsed report's samples into one list, annotated with
// whether it's a duplicate (already in Data_Entry, matched by
// equipment+sampleId — the app's existing dedup key) or whether its Unit ID
// doesn't match any known Equipment Registry code.
function buildCandidates(parsedReports, equipmentRegistry, existingSamples) {
  const registryCodes = new Set((equipmentRegistry || []).map((r) => r.code));
  const existingKeys = new Set((existingSamples || []).map((s) => `${s.unitId}|${s.sampleId}`));
  const candidates = [];
  for (const report of parsedReports) {
    if (!report.ok) continue;
    for (const sample of report.samples) {
      const key = `${sample.unitId}|${sample.sampleId}`;
      candidates.push({
        _key: `${report.fileName}|${sample.sampleId}`,
        fileName: report.fileName,
        sample,
        matched: registryCodes.has(sample.unitId),
        duplicate: existingKeys.has(key),
        remappedUnitId: null,
      });
    }
  }
  return candidates;
}

function EquipmentPicker({ T, s, equipmentRegistry, value, onChange }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = !q
    ? []
    : (equipmentRegistry || [])
        .filter((r) => r.code.toLowerCase().includes(q) || (r.description || "").toLowerCase().includes(q))
        .slice(0, 8);
  return (
    <div style={{ marginTop: 6 }}>
      <input
        style={{ ...s.input, fontSize: 12, padding: "5px 8px" }}
        placeholder="Search Equipment Registry to pick the right code…"
        value={value || query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (value) onChange(null);
        }}
      />
      {matches.length > 0 && (
        <div style={{ border: `1px solid ${T.border}`, borderRadius: 6, marginTop: 4, overflow: "hidden" }}>
          {matches.map((r) => (
            <div
              key={r.code}
              onClick={() => {
                onChange(r.code);
                setQuery("");
              }}
              style={{
                padding: "6px 8px",
                fontSize: 12,
                cursor: "pointer",
                borderBottom: `1px solid ${T.border2}`,
                color: T.textPrimary,
              }}
            >
              <span style={{ fontFamily: "monospace", color: T.accent }}>{r.code}</span> — {r.description}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BulkImportReview({ parsedReports, equipmentRegistry, existingSamples, onConfirm, onCancel, saving, progress }) {
  const { T, s } = useTheme();
  const failedReports = parsedReports.filter((r) => !r.ok);
  const initialCandidates = useMemo(
    () => buildCandidates(parsedReports, equipmentRegistry, existingSamples),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [candidates, setCandidates] = useState(() => initialCandidates.map((c) => ({ ...c, selected: c.matched && !c.duplicate })));

  function setCandidate(key, patch) {
    setCandidates((prev) => prev.map((c) => (c._key === key ? { ...c, ...patch } : c)));
  }

  const grouped = useMemo(() => {
    const byUnit = new Map();
    for (const c of candidates) {
      const unitId = c.remappedUnitId || c.sample.unitId;
      if (!byUnit.has(unitId)) byUnit.set(unitId, []);
      byUnit.get(unitId).push(c);
    }
    return [...byUnit.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [candidates]);

  const selectedCount = candidates.filter((c) => c.selected).length;
  const newCount = candidates.filter((c) => !c.duplicate).length;
  const duplicateCount = candidates.length - newCount;
  const unmatchedCount = candidates.filter((c) => !c.matched && !c.remappedUnitId).length;

  function confirm() {
    const toAdd = candidates
      .filter((c) => c.selected)
      .map((c) => (c.remappedUnitId ? { ...c.sample, unitId: c.remappedUnitId } : c.sample));
    onConfirm(toAdd);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={() => !saving && onCancel()}
    >
      <div
        style={{
          background: T.cardBg,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          padding: 24,
          width: 780,
          maxWidth: "100%",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Review Before Adding</p>
        <p style={{ fontSize: 12, color: T.textSecondary, marginBottom: 12 }}>
          {candidates.length} sample{candidates.length === 1 ? "" : "s"} found across {parsedReports.length} PDF
          {parsedReports.length === 1 ? "" : "s"} — {newCount} new, {duplicateCount} already in Data_Entry
          {unmatchedCount > 0 ? `, ${unmatchedCount} with an unrecognized equipment code` : ""}. Uncheck anything you don't want added.
        </p>

        {failedReports.length > 0 && (
          <div
            style={{
              background: T.dangerBg,
              border: `1px solid ${T.danger}`,
              borderRadius: 8,
              padding: 10,
              marginBottom: 12,
              fontSize: 12,
              color: T.danger,
            }}
          >
            {failedReports.map((r) => (
              <div key={r.fileName}>
                <i className="ti ti-alert-triangle" aria-hidden="true" /> {r.error}
              </div>
            ))}
          </div>
        )}

        <div style={{ overflowY: "auto", flex: 1, border: `1px solid ${T.border2}`, borderRadius: 8 }}>
          {grouped.map(([unitId, items]) => (
            <div key={unitId} style={{ borderBottom: `1px solid ${T.border2}` }}>
              <div
                style={{
                  padding: "8px 12px",
                  background: T.cardSubBg,
                  fontSize: 12,
                  fontWeight: 700,
                  color: T.textHighlight,
                  fontFamily: "monospace",
                }}
              >
                {unitId}{" "}
                <span style={{ fontWeight: 400, color: T.textSecondary }}>
                  ({items.length} sample{items.length === 1 ? "" : "s"})
                </span>
              </div>
              {items.map((c) => (
                <div
                  key={c._key}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "8px 12px",
                    borderTop: `1px solid ${T.border2}`,
                    opacity: c.duplicate ? 0.55 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={c.selected}
                    onChange={(e) => setCandidate(c._key, { selected: e.target.checked })}
                    style={{ marginTop: 3 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{formatDate(c.sample.sampledDate)}</span>
                      <span style={{ fontSize: 11, fontFamily: "monospace", color: T.accent }}>{c.sample.sampleId}</span>
                      <span style={{ ...s.badge(c.sample.reportStatus), fontSize: 10 }}>{c.sample.reportStatus || "—"}</span>
                      {c.duplicate && (
                        <span style={{ fontSize: 10, color: T.textMuted, fontStyle: "italic" }}>already saved — skipped</span>
                      )}
                      {!c.matched && !c.remappedUnitId && (
                        <span style={{ fontSize: 10, color: T.warning, fontWeight: 700 }}>
                          <i className="ti ti-alert-triangle" aria-hidden="true" /> unrecognized equipment code
                        </span>
                      )}
                      {c.remappedUnitId && <span style={{ fontSize: 10, color: T.success }}>→ remapped from {c.sample.unitId}</span>}
                    </div>
                    <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>from {c.fileName}</div>
                    {!c.matched && (
                      <EquipmentPicker
                        T={T}
                        s={s}
                        equipmentRegistry={equipmentRegistry}
                        value={c.remappedUnitId}
                        onChange={(code) => setCandidate(c._key, { remappedUnitId: code })}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
          {grouped.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", color: T.textMuted, fontSize: 12 }}>
              No samples were extracted from any of these PDFs.
            </div>
          )}
        </div>

        {saving && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: T.textSecondary, marginBottom: 6 }}>
              Saving {progress?.done || 0} of {progress?.total || selectedCount}
              {progress?.errors ? ` — ${progress.errors} failed` : ""}… this can take a few minutes for a large batch.
            </div>
            <div style={{ height: 6, background: T.border2, borderRadius: 3, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  background: T.accent,
                  width: `${progress?.total ? (100 * (progress.done || 0)) / progress.total : 0}%`,
                  transition: "width 0.2s",
                }}
              />
            </div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
          <span style={{ fontSize: 12, color: T.textSecondary }}>{selectedCount} selected to add</span>
          <div style={{ display: "flex", gap: 10 }}>
            <button style={s.btn} onClick={onCancel} disabled={saving}>
              Cancel
            </button>
            <button style={s.btnPrimary} onClick={confirm} disabled={saving || selectedCount === 0}>
              {saving ? "Saving…" : `Add ${selectedCount} Sample${selectedCount === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
