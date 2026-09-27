import { useTheme } from "../ThemeContext";
import { formatDate, sampleTriggerReadings } from "../parsers";
import LastActionsPanel from "../components/LastActionsPanel";

function Stat({ label, value }) {
  const { T } = useTheme();
  return (
    <div style={{ background: T.appBg, borderRadius: 6, padding: "10px 14px" }}>
      <div style={{ fontSize: 11, color: T.textSecondary }}>{label}</div>
      <div style={{ fontSize: 13, color: T.textHighlight, marginTop: 2, fontWeight: 500 }}>{value || "—"}</div>
    </div>
  );
}

function dotColor(T, status) {
  return { Alert: T.danger, Caution: T.warning, Normal: T.success }[status] || T.textMuted;
}

// The full sample history for one equipment, newest first — every sample
// from Data_Entry for this unitId, not just the one currently open above.
function SampleTimeline({ samples, unitId }) {
  const { T, s } = useTheme();
  const history = (samples || []).filter((smp) => smp.unitId === unitId).sort((a, b) => new Date(b.sampledDate) - new Date(a.sampledDate));

  if (history.length === 0) return null;

  return (
    <div style={s.card}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Sample Timeline</div>
      {history.map((h, i) => {
        const isFlagged = h.reportStatus === "Alert" || h.reportStatus === "Caution" || h.reportStatus === "Warning";
        const triggers = isFlagged ? sampleTriggerReadings(h) : [];
        return (
          <div
            key={h._id || i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "10px 0",
              borderBottom: i < history.length - 1 ? `1px solid ${T.border}` : "none",
            }}
          >
            <span
              style={{
                marginTop: 5,
                width: 9,
                height: 9,
                borderRadius: "50%",
                flexShrink: 0,
                background: dotColor(T, h.reportStatus),
              }}
            />
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{formatDate(h.sampledDate)}</span>
                <span style={s.badge(h.reportStatus)}>{h.reportStatus}</span>
              </div>
              <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 4, display: "flex", flexWrap: "wrap", gap: 14 }}>
                <span>
                  Sample ID: <span style={{ fontFamily: "monospace", color: T.accent }}>{h.sampleId}</span>
                </span>
                {triggers.length > 0
                  ? triggers.map((t) => (
                      <span key={t.label}>
                        {t.label}:{" "}
                        <span style={{ color: t.severity === "Caution" ? T.warning : T.danger, fontWeight: 700 }}>
                          {t.value}
                          {t.unit ? ` ${t.unit}` : ""}
                        </span>
                      </span>
                    ))
                  : [
                      <span key="visc">Visc: {h.visc40C || "—"} cSt</span>,
                      <span key="fe">Fe: {h.wear?.Fe ?? "—"} ppm</span>,
                      <span key="si">Si: {h.contaminants?.Si ?? "—"} ppm</span>,
                      <span key="water">Water: {h.water ?? "—"}</span>,
                    ]}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function OilAnalysisReport({
  sample,
  samples,
  actions,
  oilChanges,
  equipmentOptions,
  equipmentRegistry,
  actionRegistry,
  onAddAction,
  onUpdateAction,
  onDeleteAction,
}) {
  const { T, s } = useTheme();
  const lastChange = (oilChanges || [])
    .filter((o) => o.equipmentCode === sample.unitId && o.changeDate)
    .sort((a, b) => new Date(b.changeDate) - new Date(a.changeDate))[0];

  const wear = sample.wear || {};
  const additives = sample.additives || {};

  return (
    <div>
      <div
        style={{
          ...s.card,
          borderTop: `4px solid ${sample.reportStatus === "Alert" ? T.danger : sample.reportStatus === "Caution" ? T.warning : T.success}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {sample.reportStatus === "Alert" && <span style={s.alertPulse} />}
              <span style={{ fontSize: 20, fontWeight: 700 }}>{sample.unitId}</span>
              <span style={s.badge(sample.reportStatus)}>{sample.reportStatus}</span>
            </div>
            <div style={{ fontSize: 13, color: T.textSecondary, marginTop: 4 }}>{sample.description}</div>
          </div>
          <div style={{ textAlign: "right", fontSize: 12, color: T.textSecondary }}>
            <div>Sample ID: {sample.sampleId}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
          <Stat label="Sampled" value={formatDate(sample.sampledDate)} />
          <Stat label="Alert Type" value={sample.alertType} />
          <Stat label="Visc @40°C (cSt)" value={sample.visc40C} />
          <Stat label="Water (%)" value={sample.water} />
          <Stat label="Contamination Rating" value={sample.contaminationRating} />
          <Stat label="Equipment Rating" value={sample.equipmentRating} />
        </div>

        <div
          style={{
            background: lastChange ? T.appBg : T.infoBarBg,
            border: `1px solid ${lastChange ? T.successBg : T.dangerBg}`,
            borderRadius: 8,
            padding: "10px 16px",
            marginBottom: 20,
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: T.textSecondary }}>Last Oil Change</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: lastChange ? T.success : T.danger }}>
              {lastChange ? lastChange.changeDate : "No record found"}
            </div>
          </div>
          {lastChange && (
            <>
              <div>
                <div style={{ fontSize: 11, color: T.textSecondary }}>Oil Type / Brand</div>
                <div style={{ fontSize: 13, color: T.textHighlight }}>
                  {lastChange.oilType || "—"} {lastChange.brand ? `/ ${lastChange.brand}` : ""}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: T.textSecondary }}>Next Due</div>
                <div style={{ fontSize: 13, color: T.textHighlight }}>{formatDate(lastChange.nextDueDate)}</div>
              </div>
            </>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: T.accent, marginBottom: 12 }}>Wear Metals (ppm)</p>
            {Object.entries(wear).map(([k, v]) => (
              <div
                key={k}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "4px 0",
                  borderBottom: `1px solid ${T.border}`,
                  fontSize: 12,
                }}
              >
                <span style={{ color: T.textSecondary }}>{k}</span>
                <span style={{ fontFamily: "monospace" }}>{v || "—"}</span>
              </div>
            ))}
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: T.accent, marginBottom: 12 }}>Additives (ppm)</p>
            {Object.entries(additives).map(([k, v]) => (
              <div
                key={k}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "4px 0",
                  borderBottom: `1px solid ${T.border}`,
                  fontSize: 12,
                }}
              >
                <span style={{ color: T.textSecondary }}>{k}</span>
                <span style={{ fontFamily: "monospace" }}>{v || "—"}</span>
              </div>
            ))}
          </div>
        </div>

        {sample.recommendations?.length > 0 && (
          <div style={{ background: T.dangerBg, border: `1px solid ${T.danger}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: T.danger, margin: "0 0 10px" }}>
              <i className="ti ti-alert-triangle" aria-hidden="true" /> Recommendations
            </p>
            {sample.recommendations.map((r, i) => (
              <div key={i} style={{ fontSize: 13, color: T.warning, marginBottom: 8, lineHeight: 1.6 }}>
                • {r}
              </div>
            ))}
          </div>
        )}

        <p style={{ fontSize: 11, color: T.textMuted, textAlign: "center", marginTop: 8 }}>
          Results and comments of this analysis are advisory only. The validity of the data may be impaired by a non-representative sample
          or incorrect data.
        </p>
      </div>

      <SampleTimeline samples={samples} unitId={sample.unitId} />

      <LastActionsPanel
        equipmentCode={sample.unitId}
        actions={actions}
        samples={samples}
        oilChanges={oilChanges}
        onAdd={onAddAction}
        onUpdate={onUpdateAction}
        onDelete={onDeleteAction}
        title="Last 5 Actions"
        limit={5}
        equipmentOptions={equipmentOptions}
        equipmentRegistry={equipmentRegistry}
        actionRegistry={actionRegistry}
      />
    </div>
  );
}
