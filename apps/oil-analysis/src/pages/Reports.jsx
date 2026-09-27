import { useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import { sampleTrackerStatus } from "../parsers";
import {
  generateContractorActionReport,
  generateOilChangeContractorReport,
  generateSampleOverdueReport,
  generateCombinedReport,
} from "../reportGenerators";

const FOCUS_STATUSES = ["Open", "In Progress", "Waiting Stoppage"];
// Must match the "All" sentinel the report generators default to.
const ALL = "All";

function ReportCard({
  T,
  s,
  icon,
  iconColor,
  title,
  description,
  contractor,
  onContractorChange,
  contractorList,
  stats,
  busy,
  onGenerate,
}) {
  return (
    <div style={{ ...s.card, display: "flex", flexDirection: "column", gap: 14, marginBottom: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: T[iconColor] + "22",
            color: T[iconColor],
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <i className={`ti ${icon}`} style={{ fontSize: 19 }} aria-hidden="true" />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary }}>{title}</div>
          <div style={{ fontSize: 11.5, color: T.textSecondary }}>{description}</div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", marginBottom: 6 }}>Contractor</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {contractorList.map((c) => (
            <button
              key={c}
              onClick={() => onContractorChange(c)}
              style={{
                ...s.btn,
                fontSize: 11.5,
                padding: "5px 11px",
                background: contractor === c ? T.accent : "transparent",
                color: contractor === c ? T.accentText : T.textSecondary,
                borderColor: contractor === c ? T.accent : T.border,
              }}
            >
              {c === ALL ? "All Contractors" : c}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {stats.map((st) => (
          <div
            key={st.label}
            style={{
              flex: 1,
              minWidth: 90,
              background: T.cardSubBg,
              border: `1px solid ${T.border2}`,
              borderRadius: 8,
              padding: "10px 12px",
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 800, color: st.color ? T[st.color] : T.textPrimary }}>{st.value}</div>
            <div style={{ fontSize: 10, color: T.textSecondary, marginTop: 2 }}>{st.label}</div>
          </div>
        ))}
      </div>

      <button style={{ ...s.btnPrimary, alignSelf: "flex-start" }} onClick={onGenerate} disabled={busy}>
        <i className={`ti ${busy ? "ti-loader" : "ti-download"}`} aria-hidden="true" /> {busy ? "Generating…" : "Download PDF"}
      </button>
    </div>
  );
}

// Four well-designed, downloadable PDF reports built straight from the data
// already loaded in the app — no server round trip. Each card lets you
// scope the report to one contractor (or all of them) and shows a live
// preview of what will be in the PDF before it's generated.
export default function Reports({ actions, oilChanges, equipmentRegistry, trackerByEquip }) {
  const { T, s } = useTheme();
  const [generating, setGenerating] = useState(null); // "action" | "oilchange" | "sample" | "combined" | null
  const [actionContractor, setActionContractor] = useState(ALL);
  const [oilChangeContractor, setOilChangeContractor] = useState(ALL);
  const [sampleContractor, setSampleContractor] = useState(ALL);
  const [combinedContractor, setCombinedContractor] = useState(ALL);

  const registryByCode = useMemo(() => {
    const map = {};
    (equipmentRegistry || []).forEach((r) => (map[r.code] = r));
    return map;
  }, [equipmentRegistry]);

  const contractorList = useMemo(
    () => [ALL, ...Array.from(new Set((equipmentRegistry || []).map((r) => r.contractor).filter(Boolean))).sort()],
    [equipmentRegistry]
  );

  function actionCounts(contractor) {
    let active = (actions || []).filter((a) => FOCUS_STATUSES.includes(a.status));
    const contractorOf = (a) => a.contractor || registryByCode[a.equipmentCode]?.contractor || "Unassigned";
    if (contractor !== ALL) active = active.filter((a) => contractorOf(a) === contractor);
    return {
      open: active.filter((a) => a.status === "Open").length,
      inProgress: active.filter((a) => a.status === "In Progress").length,
      waiting: active.filter((a) => a.status === "Waiting Stoppage").length,
    };
  }

  function oilChangeCounts(contractor) {
    const codes =
      contractor === ALL ? null : new Set((equipmentRegistry || []).filter((r) => r.contractor === contractor).map((r) => r.code));
    const points = codes ? (oilChanges || []).filter((o) => codes.has(o.equipmentCode)) : oilChanges || [];
    return { overdue: points.filter((o) => o.status === "Overdue").length, totalPoints: points.length };
  }

  function sampleCounts(contractor) {
    const registry = contractor === ALL ? equipmentRegistry || [] : (equipmentRegistry || []).filter((r) => r.contractor === contractor);
    let missing = 0;
    let overdue = 0;
    registry.forEach((eq) => {
      const history = (trackerByEquip || {})[eq.code] || [];
      const status = sampleTrackerStatus(history[0]?.date || "", eq.interval);
      if (status.label === "MISSING") missing++;
      else if (status.label === "OVERDUE") overdue++;
    });
    return { missing, overdue, total: registry.length };
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const actionPreview = useMemo(() => actionCounts(actionContractor), [actions, registryByCode, actionContractor]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const oilChangePreview = useMemo(() => oilChangeCounts(oilChangeContractor), [oilChanges, equipmentRegistry, oilChangeContractor]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const samplePreview = useMemo(() => sampleCounts(sampleContractor), [trackerByEquip, equipmentRegistry, sampleContractor]);
  const combinedPreview = useMemo(() => {
    const a = actionCounts(combinedContractor);
    const oc = oilChangeCounts(combinedContractor);
    const sm = sampleCounts(combinedContractor);
    return { openActions: a.open + a.inProgress + a.waiting, overdueOil: oc.overdue, flaggedSamples: sm.missing + sm.overdue };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, oilChanges, trackerByEquip, equipmentRegistry, combinedContractor]);

  async function handleGenerate(kind) {
    setGenerating(kind);
    try {
      if (kind === "action") await generateContractorActionReport({ actions, equipmentRegistry, contractor: actionContractor });
      else if (kind === "oilchange")
        await generateOilChangeContractorReport({ oilChanges, equipmentRegistry, actions, contractor: oilChangeContractor });
      else if (kind === "sample") await generateSampleOverdueReport({ trackerByEquip, equipmentRegistry, contractor: sampleContractor });
      else if (kind === "combined")
        await generateCombinedReport({ actions, oilChanges, equipmentRegistry, trackerByEquip, contractor: combinedContractor });
    } finally {
      setGenerating(null);
    }
  }

  return (
    <div>
      <p style={{ ...s.sectionTitle, margin: "0 0 6px" }}>Reports</p>
      <p style={{ fontSize: 13, color: T.textSecondary, margin: "0 0 20px" }}>
        Generate a clean, printable PDF straight from current data — nothing is saved or sent anywhere. Choose one contractor or all of them
        before generating.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 16 }}>
        <ReportCard
          T={T}
          s={s}
          icon="ti-clipboard-list"
          iconColor="danger"
          title="Contractor Action Status"
          description="Open · In Progress · Waiting Stoppage"
          contractor={actionContractor}
          onContractorChange={setActionContractor}
          contractorList={contractorList}
          stats={[
            { value: actionPreview.open, label: "Open", color: "danger" },
            { value: actionPreview.inProgress, label: "In Progress", color: "warning" },
            { value: actionPreview.waiting, label: "Waiting Stoppage", color: "accent" },
          ]}
          busy={generating === "action"}
          onGenerate={() => handleGenerate("action")}
        />

        <ReportCard
          T={T}
          s={s}
          icon="ti-droplet"
          iconColor="warning"
          title="Oil Change Contractor Performance"
          description="On-time % and closure rate, plus overdue equipment"
          contractor={oilChangeContractor}
          onContractorChange={setOilChangeContractor}
          contractorList={contractorList}
          stats={[
            { value: oilChangePreview.overdue, label: "Overdue Points", color: "danger" },
            { value: oilChangePreview.totalPoints, label: "Total Points" },
          ]}
          busy={generating === "oilchange"}
          onGenerate={() => handleGenerate("oilchange")}
        />

        <ReportCard
          T={T}
          s={s}
          icon="ti-flask"
          iconColor="accent"
          title="Oil Sample Missing / Overdue"
          description="Equipment overdue or missing against its sampling interval"
          contractor={sampleContractor}
          onContractorChange={setSampleContractor}
          contractorList={contractorList}
          stats={[
            { value: samplePreview.missing, label: "Missing", color: "danger" },
            { value: samplePreview.overdue, label: "Overdue", color: "warning" },
          ]}
          busy={generating === "sample"}
          onGenerate={() => handleGenerate("sample")}
        />

        <ReportCard
          T={T}
          s={s}
          icon="ti-files"
          iconColor="success"
          title="Combined Report"
          description="All three reports above, in one PDF"
          contractor={combinedContractor}
          onContractorChange={setCombinedContractor}
          contractorList={contractorList}
          stats={[
            { value: combinedPreview.openActions, label: "Open + Waiting Actions", color: "danger" },
            { value: combinedPreview.overdueOil, label: "Overdue Oil", color: "warning" },
            { value: combinedPreview.flaggedSamples, label: "Flagged Samples", color: "accent" },
          ]}
          busy={generating === "combined"}
          onGenerate={() => handleGenerate("combined")}
        />
      </div>
    </div>
  );
}
