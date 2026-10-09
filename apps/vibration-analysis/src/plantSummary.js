// Plant overview (platform Home + Equipment): this module's part, handed to
// the shell over the navBridge (navBridge.onPlant). One row per machine
// (Equipment ID) from the same data the Vibration Equipment and Actions
// pages show. Shape shared with the Oil module — see
// frontend/src/plant.ts.
//
// The platform uses Good / Fair / Poor for the overall condition; this
// module's four levels map onto it: Normal → Good, Caution → Fair,
// Alert and Danger → Poor. Each machine keeps its own word too.

const CONDITION = { Normal: "Good", Caution: "Fair", Alert: "Poor", Danger: "Poor" };
const OPEN = ["Draft", "Open", "Waiting Stoppage", "Closure Requested"];
const UNIT = { RMS: "mm/s", SPM: "dBsv", Gs: "g" };
const RANK = { Normal: 1, Caution: 2, Alert: 3, Danger: 4 };

export function buildVibPlant({ summary, actions }) {
  const today = summary?.today || new Date().toISOString().slice(0, 10);
  const all = actions?.actions || [];
  const open = all.filter((a) => OPEN.includes(a.Status));
  const pastDue = (a) => ["Open", "Waiting Stoppage"].includes(a.Status) && a["Due date"] && a["Due date"] < today;
  const openBy = new Map();
  open.forEach((a) => {
    const id = a["Equipment ID"];
    if (!id) return;
    if (!openBy.has(id)) openBy.set(id, []);
    openBy.get(id).push(a);
  });

  const machines = (summary?.equipment || [])
    .filter((e) => !e.inactive)
    .map((e) => {
      const word = e.status || "";
      const late = !!e.nextDue && e.nextDue < today;
      const acts = openBy.get(e.equipmentId) || [];
      const overdue = acts.filter(pastDue).length;
      const worst = (e.points || []).slice().sort((a, b) => (RANK[b.final] || 0) - (RANK[a.final] || 0) || (Number(b.value) || 0) - (Number(a.value) || 0))[0];
      const reasons = [];
      if (RANK[word] >= 2) reasons.push(`Vibration ${word}`);
      if (late) reasons.push("Measurement overdue");
      if (!e.lastDate) reasons.push("Never measured");
      if (overdue) reasons.push(`${overdue} action${overdue > 1 ? "s" : ""} past due`);
      return {
        id: e.equipmentId,
        name: e.name || "",
        area: e.line || "",
        contractor: e.contractor || "",
        condition: CONDITION[word] || "",
        word,
        reasons,
        openActions: acts.length,
        overdueActions: overdue,
        measureLate: late,
        nextDue: e.nextDue ? { date: e.nextDue, label: "Vibration measurement", late } : null,
        facts: [
          { label: "Latest status", value: word ? `${word} · ${e.lastDate || e.lastMonth}` : "Not measured yet", tone: word === "Danger" ? "purple" : word === "Alert" ? "danger" : word === "Caution" ? "warning" : "" },
          { label: "Worst point", value: worst && worst.value != null && worst.value !== "" ? `${[worst.position, worst.point].filter(Boolean).join(" ")} · ${worst.value} ${UNIT[worst.family] || ""}`.trim() : "—" },
          { label: "Next measurement", value: e.nextDue ? `${e.nextDue}${late ? " · overdue" : ""}` : "—", tone: late ? "danger" : "" },
          { label: "Measuring points", value: String((e.vibIds && e.vibIds.length) || (e.points || []).length || "—") },
          { label: "Open actions", value: `${acts.length}${overdue ? ` · ${overdue} past due` : ""}`, tone: overdue ? "danger" : "" },
        ],
        events: e.lastDate && word ? [{ date: e.lastDate, label: `Vibration ${word}`, tone: { Normal: "success", Caution: "warning", Alert: "danger", Danger: "purple" }[word] || "" }] : [],
      };
    });

  const danger = machines.filter((m) => m.word === "Danger");
  const lateM = machines.filter((m) => m.measureLate);
  const pd = open.filter(pastDue);
  const ids = (list) => list.slice(0, 3).map((m) => m.id);
  return {
    moduleId: "vibration-analysis",
    label: "Vibration",
    updatedAt: new Date().toISOString(),
    machines,
    kpis: [
      { label: "Open actions", value: open.length, sub: pd.length ? `${pd.length} past due` : "none past due", tone: pd.length ? "danger" : "" },
      { label: "Danger machines", value: danger.length, sub: "latest measurement", tone: danger.length ? "purple" : "" },
      { label: "Measurement overdue", value: lateM.length, sub: "machines", tone: lateM.length ? "warning" : "" },
    ],
    attention: [
      { key: "vib-danger", label: "Vibration Danger", count: danger.length, tone: "purple", examples: ids(danger), page: "equipment" },
      { key: "vib-late", label: "Vibration measurement overdue", count: lateM.length, tone: "warning", examples: ids(lateM), page: "routes" },
      { key: "vib-pastdue", label: "Vibration actions past due", count: pd.length, tone: "warning", examples: [], page: "actions" },
    ].filter((a) => a.count > 0),
  };
}
