import { useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import { appendAction, deleteAction, readLastActionNo, updateAction } from "../api";
import ActionModal from "../components/ActionModal";
import ActionRow from "../components/ActionRow";
import ConfirmModal from "../components/ConfirmModal";
import EmailActionModal from "../components/EmailActionModal";
import EmailFilteredModal from "../components/EmailFilteredModal";
import GenerateMonthlyActionsModal from "../components/GenerateMonthlyActionsModal";
import Icon from "../components/Icon";
import { ICONS } from "../components/icons";
import { ACTION_HEADERS, ACTION_STATUSES, actionToFields, formatDisplayDate, monthKey, rowToAction } from "../parsers";

// Highest "V-###" action number currently held locally — used to derive the
// next number when the backend's own readLastActionNo can't be reached.
function maxLocalActionNumber(actions) {
  let max = 0;
  actions.forEach((a) => {
    const m = String(a.actionNo || "").match(/^V-(\d+)$/i);
    if (m) {
      const n = parseInt(m[1]);
      if (n > max) max = n;
    }
  });
  return max;
}

function formatActionNo(n) {
  return `V-${String(n).padStart(3, "0")}`;
}

// Action Tracker: manual actions plus "Generate Monthly Actions" (bulk
// action creation from Alarm/Danger readings in a chosen month), CSV
// export, and single/bulk email via the backend's GmailApp integration.
// Ported from the original's `bm`.
export default function ActionTracker({ actions, setActions, registryList, registryMap, lastRms, lastSpm, webhookUrl, config }) {
  const { T, s } = useTheme();
  const [line, setLine] = useState("");
  const [status, setStatus] = useState("");
  const [contractor, setContractor] = useState("");
  const [eqType, setEqType] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
  const [actionStatus, setActionStatus] = useState("");
  const [month, setMonth] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [emailing, setEmailing] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [emailFilteredOpen, setEmailFilteredOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const contractors = useMemo(
    () =>
      (config?.contractors || "RHI,ASEC")
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
    [config]
  );
  const lines = useMemo(
    () =>
      Array.from(new Set(registryList.map((r) => r.line)))
        .filter(Boolean)
        .sort(),
    [registryList]
  );
  const eqTypes = useMemo(
    () =>
      Array.from(new Set(registryList.map((r) => r.eqType)))
        .filter(Boolean)
        .sort(),
    [registryList]
  );
  const months = useMemo(
    () =>
      Array.from(new Set(actions.map((a) => monthKey(a.revisionDate)).filter(Boolean)))
        .sort()
        .reverse(),
    [actions]
  );
  const equipmentOptions = useMemo(
    () =>
      registryList
        .filter((r) => (!line || r.line === line) && (!eqType || r.eqType === eqType))
        .map((r) => r.equipmentId)
        .sort(),
    [registryList, line, eqType]
  );

  const filtered = useMemo(() => {
    let list = actions;
    if (line) list = list.filter((a) => a.line === line);
    if (status) list = list.filter((a) => a.machineStatus === status);
    if (contractor) list = list.filter((a) => a.contractor === contractor);
    if (eqType) list = list.filter((a) => (registryMap[a.equipmentId]?.eqType || "") === eqType);
    if (equipmentId) list = list.filter((a) => a.equipmentId === equipmentId);
    if (actionStatus) list = list.filter((a) => a.actionStatus === actionStatus);
    if (month) list = list.filter((a) => monthKey(a.revisionDate) === month);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (a) => a.equipmentId.toLowerCase().includes(q) || a.equipmentName.toLowerCase().includes(q) || a.actionNo.toLowerCase().includes(q)
      );
    }
    return list;
  }, [actions, line, status, contractor, eqType, equipmentId, actionStatus, month, search, registryMap]);

  const getNextActionNo = async () => {
    if (!webhookUrl) return null;
    try {
      const result = await readLastActionNo(webhookUrl);
      return result && result.status === "ok" ? result.nextNo : null;
    } catch {
      return null;
    }
  };

  const saveAction = async (form) => {
    setSaving(true);
    const isNew = !form.actionNo || form.actionNo === "";
    const draft = { ...form };
    if (isNew) {
      const fromServer = await getNextActionNo();
      draft.actionNo = fromServer || formatActionNo(maxLocalActionNumber(actions) + 1);
    }
    const record = rowToAction(actionToFields(draft));
    try {
      if (isNew) {
        await appendAction(webhookUrl, actionToFields(draft));
        setActions((prev) => [...prev, record]);
      } else {
        // NOTE: the original sends the raw camelCase form fields here
        // (equipmentId, readingDate, ...) plus a bolted-on "Action No" key —
        // NOT the named-field object appendAction gets. Reproduced exactly;
        // see docs/API_CONTRACT.md's "Known gaps" for what this likely means
        // for which fields an edit actually updates server-side.
        await updateAction(webhookUrl, { ...draft, "Action No": draft.actionNo });
        setActions((prev) => prev.map((a) => (a.actionNo === record.actionNo ? record : a)));
      }
      setMessage("✓ Saved");
      setTimeout(() => setMessage(""), 2000);
    } catch (err) {
      setMessage("Error: " + String(err.message || err));
    }
    setSaving(false);
    setEditing(null);
  };

  const removeAction = async (action) => {
    try {
      await deleteAction(webhookUrl, { "Action No": action.actionNo });
      setActions((prev) => prev.filter((a) => a.actionNo !== action.actionNo));
      setMessage("✓ Deleted");
      setTimeout(() => setMessage(""), 2000);
    } catch (err) {
      setMessage("Error: " + String(err.message || err));
    }
    setDeleting(null);
  };

  // Maps a line name to a contractor using the same "Line1/Line2 -> first
  // contractor, CM1/CM2 -> second contractor" rule Settings → Configuration
  // documents. Any other line name (or fewer than 2 configured contractors)
  // falls back to the first contractor.
  const contractorForLine = (lineName) => {
    if (!lineName || contractors.length < 2) return contractors[0] || "";
    const lower = lineName.toLowerCase();
    if (lower.includes("line1") || lower.includes("line2")) return contractors[0] || "RHI";
    if (lower.includes("cm1") || lower.includes("cm2")) return contractors[1] || "ASEC";
    return contractors[0] || "";
  };

  // The chosen month (from GenerateMonthlyActionsModal's <input type="month">)
  // only drives that modal's own preview query — like the original, once the
  // candidate list is built, the month itself isn't needed again here.
  const generateMonthlyActions = async (candidates) => {
    setGenerating(false);
    setSaving(true);
    setMessage("Fetching last action number from sheet…");
    let counter = 0;
    try {
      const result = await readLastActionNo(webhookUrl);
      counter = result && result.status === "ok" ? result.maxNum || 0 : maxLocalActionNumber(actions);
    } catch {
      counter = maxLocalActionNumber(actions);
    }
    setMessage(`Generating ${candidates.length} action(s) starting from ${formatActionNo(counter + 1)}…`);
    let created = 0;
    const newRecords = [];
    for (const candidate of candidates) {
      counter++;
      const actionNo = formatActionNo(counter);
      const line = (registryMap[candidate.equipmentId] || {}).line || candidate.line || "";
      const contractorForThis = contractorForLine(line);
      const draft = {
        actionNo,
        equipmentId: candidate.equipmentId,
        equipmentName: candidate.equipmentName,
        line,
        readingDate: candidate.date,
        triggerType: candidate.trig.type,
        triggerPoint: candidate.trig.point,
        triggerValue: String(candidate.trig.value || ""),
        machineStatus: candidate.status,
        revisionDate: "",
        actionStatus: "Open",
        completionDate: "",
        contractor: contractorForThis,
        contractorAction: "",
        accAction: "",
        agreedAction: "",
      };
      try {
        await appendAction(webhookUrl, actionToFields(draft));
        newRecords.push(rowToAction(actionToFields(draft)));
        created++;
      } catch {
        // best-effort — one failed row doesn't stop the rest, matching the original
      }
    }
    if (newRecords.length > 0) setActions((prev) => [...prev, ...newRecords]);
    setSaving(false);
    setMessage(`✓ ${created} action(s) generated`);
    setTimeout(() => setMessage(""), 4000);
  };

  // Client-side CSV export ("Export Excel" in the UI, but it's a .csv blob
  // download — no xlsx/spreadsheet library is bundled anywhere in the
  // original). Ported from the original's CSV builder, footer row included.
  const exportCsv = () => {
    const rows = [
      ACTION_HEADERS,
      ...filtered.map((a) => [
        a.actionNo,
        a.equipmentId,
        a.equipmentName,
        a.line,
        formatDisplayDate(a.readingDate),
        a.triggerType,
        a.triggerPoint,
        a.triggerValue,
        a.machineStatus,
        formatDisplayDate(a.revisionDate),
        a.actionStatus,
        formatDisplayDate(a.completionDate),
        a.contractor,
        a.contractorAction,
        a.accAction,
        a.agreedAction,
      ]),
    ];
    const footer = ["", "", "", "", "", "", "", "", "", "", "", "", "", "Authorized by:", "aghafar@arabiancementcompany.com", ""];
    rows.push([]);
    rows.push(footer);
    const csv = rows.map((row) => row.map((cell) => `"${String(cell || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Action_Tracker_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const openCount = actions.filter((a) => a.actionStatus === "Open").length;
  const hasActiveFilter = line || status || contractor || eqType || actionStatus || month || search;

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <button style={{ ...s.btn, display: "flex", alignItems: "center", gap: 6 }} onClick={() => setEditing({})}>
          <Icon d={ICONS.plus} size={14} /> New Action
        </button>
        <button style={{ ...s.btnSecondary, display: "flex", alignItems: "center", gap: 6 }} onClick={() => setGenerating(true)}>
          ⚡ Generate Monthly Actions
        </button>
        <button style={{ ...s.btnSecondary, display: "flex", alignItems: "center", gap: 6 }} onClick={exportCsv}>
          <Icon d={ICONS.download} size={14} /> Export Excel
        </button>
        <button style={{ ...s.btnSecondary, display: "flex", alignItems: "center", gap: 6 }} onClick={() => setEmailFilteredOpen(true)}>
          <Icon d={ICONS.email} size={14} /> Email Filtered
        </button>
        {saving && <span style={{ fontSize: 12, color: T.info }}>Saving…</span>}
        {message && <span style={{ fontSize: 12, color: message.startsWith("✓") ? T.success : T.danger, fontWeight: 700 }}>{message}</span>}
        <span style={{ marginLeft: "auto", fontSize: 12, color: T.textMuted }}>
          {filtered.length}/{actions.length} · <span style={{ color: T.danger, fontWeight: 700 }}>{openCount} Open</span>
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <select style={{ ...s.input, width: 130 }} value={line} onChange={(e) => setLine(e.target.value)}>
          <option value="">All Lines</option>
          {lines.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select style={{ ...s.input, width: 130 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Status</option>
          {["Good", "Acceptable", "Alarm", "Danger"].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select style={{ ...s.input, width: 140 }} value={contractor} onChange={(e) => setContractor(e.target.value)}>
          <option value="">All Contractors</option>
          {contractors.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          style={{ ...s.input, width: 130 }}
          value={eqType}
          onChange={(e) => {
            setEqType(e.target.value);
            setEquipmentId("");
          }}
        >
          <option value="">All Eq Types</option>
          {eqTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select style={{ ...s.input, width: 150 }} value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
          <option value="">All Equipment</option>
          {equipmentOptions.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <select style={{ ...s.input, width: 140 }} value={actionStatus} onChange={(e) => setActionStatus(e.target.value)}>
          <option value="">All Action Status</option>
          {ACTION_STATUSES.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select style={{ ...s.input, width: 130 }} value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="">All Months</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
          <span style={{ position: "absolute", left: 9, top: 8, color: T.textMuted }}>
            <Icon d={ICONS.search} size={14} />
          </span>
          <input style={{ ...s.input, paddingLeft: 30 }} placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {hasActiveFilter && (
          <button
            style={s.btnSecondary}
            onClick={() => {
              setLine("");
              setStatus("");
              setContractor("");
              setEqType("");
              setEquipmentId("");
              setActionStatus("");
              setMonth("");
              setSearch("");
            }}
          >
            Clear
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div style={{ ...s.card, textAlign: "center", color: T.textMuted, padding: 50 }}>
          {actions.length === 0 ? "No actions yet — create one or generate monthly actions." : "No actions match current filters."}
        </div>
      ) : (
        <div>
          {filtered.map((a) => (
            <ActionRow key={a.actionNo} action={a} onEdit={setEditing} onDelete={setDeleting} onEmail={setEmailing} />
          ))}
        </div>
      )}

      {editing !== null && (
        <ActionModal
          initial={editing}
          registryList={registryList}
          contractors={contractors}
          onClose={() => setEditing(null)}
          onSave={saveAction}
        />
      )}
      {deleting && (
        <ConfirmModal
          label={deleting.actionNo}
          message={`Delete action ${deleting.actionNo} — ${deleting.equipmentName}?`}
          onConfirm={() => removeAction(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
      {emailing && <EmailActionModal action={emailing} onClose={() => setEmailing(null)} webhookUrl={webhookUrl} />}
      {generating && (
        <GenerateMonthlyActionsModal
          onClose={() => setGenerating(false)}
          onGenerate={generateMonthlyActions}
          lastRms={lastRms}
          lastSpm={lastSpm}
          registryMap={registryMap}
        />
      )}
      {emailFilteredOpen && (
        <EmailFilteredModal
          filteredActions={filtered}
          hasFilters={!!hasActiveFilter}
          onClose={() => setEmailFilteredOpen(false)}
          webhookUrl={webhookUrl}
        />
      )}
    </div>
  );
}
