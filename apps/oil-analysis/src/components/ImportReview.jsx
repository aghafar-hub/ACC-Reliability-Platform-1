import { useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import useIsMobile from "../hooks/useIsMobile";
import { formatDate } from "../parsers";
import { RATING_OPTIONS } from "../theme";
import { cellMark, viscCellTemp, visibleGroups } from "../labReport";
import { LAB_INFO_KEYS } from "../api";

// Lab report import — the review tab (not a pop-up). A side bar lists every
// report: refused files with their reason, then each point's samples with a
// tick box. Clicking a sample opens its report as a table — the same view as
// the Oil Analysis Report — where a wrong value can be corrected (and a lab
// mark set or cleared) before saving. One button submits every ticked sample.
//
// Never added: a sample whose Sample ID is already saved, or repeated in this
// import (the server refuses it too); a sample with no Sample ID; a sample of
// a point the app doesn't know until a point is picked.

const norm = (v) => String(v ?? "").trim().toUpperCase();
const NEXT_MARK = { "": "Caution", Caution: "Alert", Alert: "" };
const MARK_COLOR = { Caution: "warning", Alert: "danger" };

function setPath(obj, path, value) {
  const parts = path.split(".");
  const out = { ...obj };
  let cur = out;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] = { ...(cur[parts[i]] || {}) };
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
  return out;
}

function toInputDate(v) {
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(String(v))) return String(v).slice(0, 10);
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function buildCandidates(parsedReports, equipmentRegistry) {
  const registryCodes = new Set((equipmentRegistry || []).map((r) => r.code));
  const out = [];
  parsedReports.forEach((report, fi) => {
    if (!report.ok) return;
    report.samples.forEach((sample, si) => {
      out.push({
        _key: `${fi}|${si}|${sample.sampleId}`,
        fileIdx: fi,
        fileName: report.fileName,
        sample,
        matched: registryCodes.has(sample.unitId),
        selected: true, // trimmed below once duplicates are known
        edited: [],
      });
    });
  });
  return out;
}

// Duplicates follow the current Sample IDs (an edit can make or clear one).
function withStatus(candidates, existingIds, remap) {
  const seen = new Set();
  return candidates.map((c) => {
    const id = norm(c.sample.sampleId);
    const noSampleId = !id;
    const duplicate = !noSampleId && (existingIds.has(id) || seen.has(id));
    if (id) seen.add(id);
    const unitId = remap[c.fileIdx] || c.sample.unitId;
    const needsPoint = !c.matched && !remap[c.fileIdx];
    const blocked = duplicate || noSampleId || needsPoint;
    return { ...c, unitId, duplicate, noSampleId, needsPoint, blocked, include: c.selected && !blocked };
  });
}

function PointPicker({ T, s, equipmentRegistry, value, onChange }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = !q ? [] : (equipmentRegistry || []).filter((r) => r.code.toLowerCase().includes(q) || (r.description || "").toLowerCase().includes(q)).slice(0, 8);
  return (
    <div style={{ marginTop: 6 }}>
      <input
        style={{ ...s.input, fontSize: 12, padding: "5px 8px" }}
        placeholder="Search the Equipment Registry for the right point…"
        value={value || query}
        aria-label="Pick the lubrication point"
        onChange={(e) => {
          setQuery(e.target.value);
          if (value) onChange(null);
        }}
      />
      {matches.length > 0 && (
        <div style={{ border: `1px solid ${T.border}`, borderRadius: 6, marginTop: 4, overflow: "hidden", background: T.cardBg }}>
          {matches.map((r) => (
            <button
              key={r.code}
              type="button"
              onClick={() => {
                onChange(r.code);
                setQuery("");
              }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 8px", fontSize: 12, border: "none", borderBottom: `1px solid ${T.border2}`, background: "none", color: T.textPrimary, cursor: "pointer" }}
            >
              <span style={{ fontFamily: "monospace", color: T.accent }}>{r.code}</span> — {r.description}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusPill({ T, status }) {
  const key = { Alert: "danger", Caution: "warning", Warning: "warning", Normal: "success" }[status] || "textSecondary";
  const c = T[key];
  return <span style={{ fontSize: 10.5, fontWeight: 700, color: c, background: `${c}22`, borderRadius: 4, padding: "1px 7px", whiteSpace: "nowrap" }}>{status || "—"}</span>;
}

export default function ImportReview({ parsedReports, equipmentRegistry, existingSamples, onSubmit, onDiscard, saving, progress }) {
  const { T, s } = useTheme();
  const isMobile = useIsMobile();
  const existingIds = useMemo(() => new Set((existingSamples || []).map((x) => norm(x.sampleId)).filter(Boolean)), [existingSamples]);
  const existingById = useMemo(() => new Map((existingSamples || []).map((x) => [norm(x.sampleId), x])), [existingSamples]);
  const [fillDetails, setFillDetails] = useState(true);
  const [raw, setRaw] = useState(() => {
    const list = buildCandidates(parsedReports, equipmentRegistry);
    // start ticked unless already saved / no Sample ID (a point still to be
    // picked is ticked, and goes in once the point is picked)
    return withStatus(list, existingIds, {}).map((c) => ({ ...c, selected: !c.duplicate && !c.noSampleId }));
  });
  const [remap, setRemap] = useState({}); // fileIdx → registry code
  const candidates = useMemo(() => withStatus(raw, existingIds, remap), [raw, existingIds, remap]);
  const refused = parsedReports.map((r, i) => ({ ...r, fileIdx: i })).filter((r) => !r.ok);
  const files = useMemo(() => {
    const m = new Map();
    candidates.forEach((c) => {
      if (!m.has(c.fileIdx)) m.set(c.fileIdx, []);
      m.get(c.fileIdx).push(c);
    });
    return [...m.entries()].map(([fileIdx, items]) => ({
      fileIdx,
      fileName: items[0].fileName,
      unitId: items[0].unitId,
      matched: items[0].matched,
      items: [...items].sort((a, b) => new Date(a.sample.sampledDate) - new Date(b.sample.sampledDate)),
    }));
  }, [candidates]);
  const firstSample = candidates.find((c) => !c.blocked) || candidates[0];
  const [view, setView] = useState(() => (firstSample ? { type: "sample", key: firstSample._key } : refused[0] ? { type: "refused", fileIdx: refused[0].fileIdx } : null));
  const included = candidates.filter((c) => c.include);
  // Already-saved samples whose saved row is missing report details this
  // report has: those get filled in (only the empty ones) — never re-added.
  const fillable = candidates
    .filter((c) => c.duplicate && existingById.has(norm(c.sample.sampleId)))
    .map((c) => {
      const saved = existingById.get(norm(c.sample.sampleId));
      const labInfo = {};
      LAB_INFO_KEYS.forEach((k) => {
        if (c.sample[k] && !saved[k]) labInfo[k] = String(c.sample[k]);
      });
      return { key: c._key, sampleId: c.sample.sampleId, labInfo };
    })
    .filter((f) => Object.keys(f.labInfo).length);
  const fillKeys = new Set(fillable.map((f) => f.key));
  const fills = fillDetails ? fillable : [];

  const update = (key, fn) => setRaw((prev) => prev.map((c) => (c._key === key ? fn(c) : c)));
  const toggle = (key, on) => update(key, (c) => ({ ...c, selected: on }));
  const toggleFile = (fileIdx, on) => setRaw((prev) => prev.map((c) => (c.fileIdx === fileIdx ? { ...c, selected: on } : c)));
  function setField(key, row, value) {
    update(key, (c) => ({ ...c, sample: setPath(c.sample, row.field, value), edited: c.edited.includes(row.key) ? c.edited : [...c.edited, row.key] }));
  }
  function cycleMark(key, row) {
    update(key, (c) => {
      const cur = cellMark(c.sample, row);
      const next = NEXT_MARK[cur];
      const rest = (c.sample.flaggedReadings || []).filter((f) => String(f.param).toLowerCase() !== row.flag.toLowerCase());
      return {
        ...c,
        sample: { ...c.sample, flaggedReadings: next ? [...rest, { param: row.flag, severity: next }] : rest },
        edited: c.edited.includes(`${row.key}:mark`) ? c.edited : [...c.edited, `${row.key}:mark`],
      };
    });
  }
  function setText(key, field, value) {
    update(key, (c) => ({ ...c, sample: { ...c.sample, [field]: value }, edited: c.edited.includes(field) ? c.edited : [...c.edited, field] }));
  }

  function submit() {
    onSubmit(
      included.map((c) => ({
        ...c.sample,
        unitId: c.unitId,
        recommendations: (c.sample.recommendations || []).map((r) => String(r).trim()).filter(Boolean),
      })),
      fills.map(({ sampleId, labInfo }) => ({ sampleId, labInfo }))
    );
  }

  const current = view?.type === "sample" ? candidates.find((c) => c._key === view.key) : null;
  const currentFile = current ? files.find((f) => f.fileIdx === current.fileIdx) : null;
  const currentRefused = view?.type === "refused" ? refused.find((r) => r.fileIdx === view.fileIdx) : null;

  const sideItem = (active) => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "8px 10px",
    border: "none",
    borderLeft: `3px solid ${active ? T.accent : "transparent"}`,
    background: active ? T.navActive : "transparent",
    color: T.textPrimary,
    textAlign: "left",
    cursor: "pointer",
    font: "inherit",
    fontSize: 12.5,
  });

  const sidebar = (
    <div data-testid="import-sidebar" style={{ ...s.card, padding: 0, marginBottom: 0, overflow: "hidden", alignSelf: "start", position: isMobile ? "static" : "sticky", top: 0 }}>
      {refused.length > 0 && (
        <div>
          <div style={{ padding: "8px 10px", fontSize: 11.5, fontWeight: 700, color: T.danger, background: T.cardSubBg, borderBottom: `1px solid ${T.border2}` }}>
            <i className="ti ti-ban" aria-hidden="true" /> Refused ({refused.length})
          </div>
          {refused.map((r) => (
            <button key={r.fileIdx} type="button" data-testid={`import-refused-${r.fileIdx}`} style={sideItem(view?.type === "refused" && view.fileIdx === r.fileIdx)} onClick={() => setView({ type: "refused", fileIdx: r.fileIdx })}>
              <i className="ti ti-file-alert" aria-hidden="true" style={{ color: T.danger }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.fileName}</span>
            </button>
          ))}
        </div>
      )}
      {files.map((f) => {
        const addable = f.items.filter((c) => !c.blocked);
        const allOn = addable.length > 0 && addable.every((c) => c.selected);
        return (
          <div key={f.fileIdx}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: T.cardSubBg, borderTop: `1px solid ${T.border2}`, borderBottom: `1px solid ${T.border2}` }}>
              <input
                type="checkbox"
                checked={allOn}
                disabled={!addable.length}
                onChange={(e) => toggleFile(f.fileIdx, e.target.checked)}
                aria-label={`Tick all of ${f.unitId}`}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: T.textPrimary }}>{f.unitId}</div>
                <div style={{ fontSize: 10.5, color: T.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.fileName}</div>
                {!f.matched && !remap[f.fileIdx] && <div style={{ fontSize: 10.5, color: T.warning, fontWeight: 700 }}>Pick the point — not in the registry</div>}
              </div>
            </div>
            {f.items.map((c) => (
              <div key={c._key} style={{ ...sideItem(view?.type === "sample" && view.key === c._key), padding: 0, opacity: c.blocked ? 0.6 : 1 }}>
                <input
                  type="checkbox"
                  checked={c.include}
                  disabled={c.blocked}
                  onChange={(e) => toggle(c._key, e.target.checked)}
                  aria-label={`Add sample ${c.sample.sampleId || ""}`}
                  data-testid={`import-check-${c.sample.sampleId}`}
                  style={{ margin: "0 0 0 10px" }}
                />
                <button type="button" onClick={() => setView({ type: "sample", key: c._key })} data-testid={`import-item-${c.sample.sampleId}`} style={{ ...sideItem(false), borderLeft: "none", background: "none", padding: "8px 10px 8px 6px" }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 600 }}>{formatDate(c.sample.sampledDate) || "No date"}</span>
                    <span style={{ display: "block", fontSize: 10.5, fontFamily: "monospace", color: T.textSecondary }}>{c.sample.sampleId || "no Sample ID"}</span>
                    {c.duplicate && (
                      <span style={{ display: "block", fontSize: 10.5, color: T.textSecondary, fontStyle: "italic" }}>
                        Already saved — skipped{fillKeys.has(c._key) && fillDetails ? "; report details filled in" : ""}
                      </span>
                    )}
                    {c.noSampleId && <span style={{ display: "block", fontSize: 10.5, color: T.warning, fontWeight: 700 }}>No Sample ID</span>}
                    {c.edited.length > 0 && <span style={{ display: "block", fontSize: 10.5, color: T.accent, fontWeight: 700 }}>Edited</span>}
                  </span>
                  <StatusPill T={T} status={c.sample.reportStatus} />
                </button>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );

  return (
    <div data-testid="import-review">
      <div style={{ ...s.card, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <p style={{ fontWeight: 700, margin: 0 }}>Review the lab reports</p>
          <p style={{ fontSize: 12, color: T.textSecondary, margin: "2px 0 0" }}>
            {candidates.length} sample{candidates.length === 1 ? "" : "s"} in {files.length} report{files.length === 1 ? "" : "s"}
            {refused.length ? ` · ${refused.length} refused` : ""} · {candidates.filter((c) => c.duplicate).length} already saved. Open a sample to check it — correct any value
            that's wrong — then submit the ticked ones.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {saving && progress && (
            <span style={{ fontSize: 12, color: T.textSecondary }}>
              Saving {progress.done} of {progress.total}
              {progress.errors ? ` — ${progress.errors} failed` : ""}…
            </span>
          )}
          <button type="button" style={s.btn} onClick={onDiscard} disabled={saving}>
            Discard
          </button>
          {fillable.length > 0 && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }} title="Saved earlier without the report's header details (account, asset, bottle…)">
              <input type="checkbox" checked={fillDetails} onChange={(e) => setFillDetails(e.target.checked)} data-testid="import-fill" />
              Fill in report details for {fillable.length} saved sample{fillable.length === 1 ? "" : "s"}
            </label>
          )}
          <button type="button" style={s.btnPrimary} onClick={submit} disabled={saving || (included.length === 0 && fills.length === 0)} data-testid="import-submit">
            <i className="ti ti-upload" aria-hidden="true" />{" "}
            {saving
              ? "Saving…"
              : included.length || !fills.length
                ? `Submit ${included.length} sample${included.length === 1 ? "" : "s"}`
                : `Fill in details for ${fills.length}`}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "280px minmax(0,1fr)", gap: 14, alignItems: "start" }}>
        {sidebar}
        <div style={{ minWidth: 0 }}>
          {currentRefused && (
            <div style={{ ...s.card, borderColor: T.danger }} data-testid="import-refused-view">
              <p style={{ fontWeight: 700, margin: "0 0 6px", color: T.danger }}>
                <i className="ti ti-ban" aria-hidden="true" /> {currentRefused.fileName} — refused
              </p>
              <p style={{ fontSize: 13, color: T.textPrimary, margin: "0 0 10px", lineHeight: 1.6 }}>{String(currentRefused.error || "").replace(`${currentRefused.fileName}: `, "").replace(/^refused — /, "")}</p>
              <p style={{ fontSize: 12.5, color: T.textSecondary, margin: 0 }}>Nothing from this file is added. Fix the file and import it again.</p>
            </div>
          )}
          {current && currentFile && (
            <SampleView
              T={T}
              s={s}
              c={current}
              file={currentFile}
              equipmentRegistry={equipmentRegistry}
              remapValue={remap[current.fileIdx]}
              onRemap={(code) => setRemap((m) => ({ ...m, [current.fileIdx]: code }))}
              onToggle={(on) => toggle(current._key, on)}
              onOpen={(key) => setView({ type: "sample", key })}
              onField={setField}
              onMark={cycleMark}
              onText={setText}
              canFill={fillKeys.has(current._key)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// One sample: the point's report as the lab printed it (every sample of this
// file as a column, this one outlined), with the new samples' cells editable.
function SampleView({ T, s, c, file, equipmentRegistry, remapValue, onRemap, onToggle, onOpen, onField, onMark, onText, canFill }) {
  const columns = file.items;
  const groups = visibleGroups(columns.map((x) => x.sample)).map((g) => ({ ...g, rows: g.rows.filter((r) => r.field) }));
  const border = `1px solid ${T.border}`;
  const smp = c.sample;
  const info = [
    ["Account", [smp.accountId, smp.accountName].filter(Boolean).join(" · ")],
    ["Asset ID", smp.assetId],
    ["Service level", smp.serviceLevel],
    ["Bottle ID", smp.bottleId],
    ["Tested lubricant", smp.testedLubricant],
    ["Equipment", [smp.assetClass, smp.manufacturer, smp.model].filter(Boolean).join(" · ")],
  ].filter(([, v]) => v);
  const inputStyle = { ...s.input, fontSize: 12, padding: "3px 5px", textAlign: "center", fontFamily: "monospace", minWidth: 64 };

  function cell(row, col) {
    const d = col.sample;
    const editable = !col.blocked;
    const isCur = col._key === c._key;
    const edited = col.edited.includes(row.key) || col.edited.includes(`${row.key}:mark`);
    const base = {
      padding: "4px 6px",
      border,
      textAlign: "center",
      fontSize: 12,
      color: T.textPrimary,
      background: edited ? `${T.accent}14` : undefined,
      boxShadow: isCur ? `inset 2px 0 0 ${T.accent}, inset -2px 0 0 ${T.accent}` : undefined,
    };
    const v = row.get(d);
    if (!editable) {
      const mark = row.kind === "num" ? cellMark(d, row) : "";
      return (
        <td key={col._key} style={{ ...base, color: mark ? T[MARK_COLOR[mark]] : T.textSecondary, fontWeight: mark ? 700 : 400 }}>
          {row.kind === "date" ? formatDate(v) || "—" : v ?? "—"}
        </td>
      );
    }
    if (row.kind === "status") {
      return (
        <td key={col._key} style={base}>
          <select style={{ ...s.input, fontSize: 12, padding: "3px 5px" }} value={v || ""} onChange={(e) => onField(col._key, row, e.target.value)} aria-label={`${row.label} ${d.sampleId}`}>
            <option value="">—</option>
            {RATING_OPTIONS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </td>
      );
    }
    if (row.kind === "date") {
      return (
        <td key={col._key} style={base}>
          <input type="date" style={{ ...inputStyle, minWidth: 120 }} value={toInputDate(v)} onChange={(e) => onField(col._key, row, e.target.value)} aria-label={`${row.label} ${d.sampleId}`} />
        </td>
      );
    }
    if (row.kind === "mono" || row.kind === "text") {
      return (
        <td key={col._key} style={base}>
          <input style={{ ...inputStyle, minWidth: 110 }} value={v ?? ""} onChange={(e) => onField(col._key, row, e.target.value)} aria-label={`${row.label} ${d.sampleId}`} />
        </td>
      );
    }
    const mark = cellMark(d, row);
    const mc = mark ? T[MARK_COLOR[mark]] : null;
    return (
      <td key={col._key} style={{ ...base, background: mc ? `${mc}26` : base.background }} data-mark={mark || undefined}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
          <input
            type="number"
            step="any"
            style={{ ...inputStyle, width: 70, color: mc || T.textPrimary, fontWeight: mark ? 700 : 400 }}
            value={v ?? ""}
            onChange={(e) => onField(col._key, row, e.target.value === "" ? "" : Number(e.target.value))}
            aria-label={`${row.label} ${d.sampleId}`}
          />
          {row.flag && (
            <button
              type="button"
              onClick={() => onMark(col._key, row)}
              title={mark ? `Lab marked ${mark} — click to change` : "Not marked — click to mark Caution"}
              aria-label={`Lab mark ${row.label} ${d.sampleId}: ${mark || "none"}`}
              style={{ width: 22, height: 22, borderRadius: 4, border: `1px solid ${mc || T.border}`, background: mc ? `${mc}33` : "transparent", color: mc || T.textMuted, fontSize: 10, fontWeight: 800, cursor: "pointer", padding: 0 }}
            >
              {mark ? mark[0] : "·"}
            </button>
          )}
          {row.visc && viscCellTemp(columns.map((x) => x.sample), d) && <span style={{ fontSize: 9.5, color: T.textSecondary }}>{viscCellTemp(columns.map((x) => x.sample), d)}</span>}
        </span>
      </td>
    );
  }

  return (
    <div data-testid="import-sample-view">
      <div style={{ ...s.card, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>
              <span style={{ fontFamily: "monospace" }}>{c.unitId}</span> · Sample {smp.sampleId || "—"} · {formatDate(smp.sampledDate) || "—"} <StatusPill T={T} status={smp.reportStatus} />
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 11.5, color: T.textSecondary }}>{c.fileName}</p>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: c.blocked ? "not-allowed" : "pointer" }}>
            <input type="checkbox" checked={c.include} disabled={c.blocked} onChange={(e) => onToggle(e.target.checked)} />
            Add this sample
          </label>
        </div>
        {c.duplicate && (
          <p style={{ ...s.infoBar, margin: "10px 0 0", fontSize: 12.5, color: T.textPrimary }} data-testid="import-dup-note">
            <i className="ti ti-copy" aria-hidden="true" /> Sample ID {smp.sampleId} is already saved — it won't be added again
            {canFill ? "; the report details missing from the saved one (account, asset, bottle…) can be filled in — see the box at the top." : "."}
          </p>
        )}
        {c.noSampleId && <p style={{ ...s.infoBar, margin: "10px 0 0", fontSize: 12.5, borderColor: T.warning }}>This column has no Sample ID — type it in the table to add it.</p>}
        {!c.matched && (
          <div style={{ ...s.infoBar, margin: "10px 0 0", fontSize: 12.5, borderColor: T.warning }}>
            Unit ID <strong>{smp.unitId}</strong> isn't in the Equipment Registry. Pick the point these results belong to:
            <PointPicker T={T} s={s} equipmentRegistry={equipmentRegistry} value={remapValue} onChange={onRemap} />
          </div>
        )}
        {info.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: "6px 14px", marginTop: 12 }}>
            {info.map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 10.5, color: T.textSecondary }}>{k}</div>
                <div style={{ fontSize: 12.5 }}>{v}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ ...s.card, padding: 0, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ padding: "10px 14px", borderBottom: border, fontSize: 12, color: T.textSecondary }}>
          Every sample in this report, oldest on the left; this one is outlined. Correct a value by typing over it; the small box beside a value sets the lab's mark (· → C → A).
          Samples already saved are shown for reference and can't be changed here.
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }} data-testid="import-table">
            <thead>
              <tr>
                <th style={{ padding: "6px 8px", border, background: T.appBg, color: T.textSecondary, fontSize: 11, textAlign: "left", position: "sticky", left: 0, zIndex: 2, minWidth: 150 }}>Parameter</th>
                {columns.map((col) => (
                  <th key={col._key} style={{ padding: "6px 8px", border, background: col._key === c._key ? `${T.accent}22` : T.appBg, color: T.textPrimary, fontSize: 11, whiteSpace: "nowrap" }}>
                    <button type="button" onClick={() => onOpen(col._key)} style={{ background: "none", border: "none", color: "inherit", font: "inherit", cursor: "pointer", fontWeight: 700 }}>
                      {formatDate(col.sample.sampledDate) || "—"}
                    </button>
                    {col.blocked && <div style={{ fontSize: 9.5, color: T.textSecondary, fontWeight: 500 }}>{col.duplicate ? "already saved" : col.noSampleId ? "no Sample ID" : "pick point"}</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => [
                <tr key={g.title}>
                  <td colSpan={columns.length + 1} style={{ padding: "6px 10px", background: T.infoBarBg, color: T.accent, fontSize: 12, fontWeight: 700, border }}>
                    {g.title}
                  </td>
                </tr>,
                ...g.rows.map((row) => (
                  <tr key={row.key}>
                    <td style={{ padding: "5px 10px", border, fontSize: 12, background: T.cardBg, position: "sticky", left: 0, zIndex: 1, whiteSpace: "nowrap" }}>{row.label}</td>
                    {columns.map((col) => cell(row, col))}
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      </div>

      {(smp.recommendations?.length > 0 || smp.alertType || !c.blocked) && (
        <div style={{ ...s.card }}>
          <p style={{ fontWeight: 700, margin: "0 0 8px" }}>Recommendations (short)</p>
          <label style={{ ...s.label, fontSize: 11 }}>Alert type</label>
          <input
            style={{ ...s.input, fontSize: 13, marginBottom: 10 }}
            value={smp.alertType || ""}
            disabled={c.blocked}
            onChange={(e) => onText(c._key, "alertType", e.target.value)}
            aria-label="Alert type"
          />
          <label style={{ ...s.label, fontSize: 11 }}>One finding per line</label>
          <textarea
            style={{ ...s.input, fontSize: 13, minHeight: 80, resize: "vertical" }}
            value={(smp.recommendations || []).join("\n")}
            disabled={c.blocked}
            onChange={(e) => onText(c._key, "recommendations", e.target.value.split("\n"))}
            aria-label="Recommendations"
          />
        </div>
      )}
    </div>
  );
}
