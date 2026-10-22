// Oil point health after an oil change, and dates kept on the local day.
// Made-up points and samples.
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// Saudi time (UTC+3), where a local-midnight date read as UTC slips a day
process.env.TZ = "Asia/Riyadh";
register("./lib/extless-hooks.mjs", import.meta.url);
const SRC = new URL("../apps/oil-analysis/src/", import.meta.url).href;
const { pointHealth } = await import(SRC + "equipmentHealth.js");
const { buildOilPlant } = await import(SRC + "plantSummary.js");

const reg = { code: "LP-T1", equipmentId: "EQ-T1", oilAnalysisRequired: "No", interval: "" };
const alert = { unitId: "LP-T1", sampledDate: "10 Sept 2026", reportStatus: "Alert", sampleId: "S-1" };

test("oil changed after the latest lab result: Normal until the next report", () => {
  const before = pointHealth({ reg, samples: [alert], oilChange: { changeDate: "01 Sept 2026" }, actions: [], topUps: [] });
  assert.equal(before.health, "Poor");
  assert.equal(before.current.reportStatus, "Alert");

  const after = pointHealth({ reg, samples: [alert], oilChange: { changeDate: "01 Oct 2026" }, actions: [], topUps: [] });
  assert.equal(after.health, "Good");
  assert.equal(after.current.reportStatus, "Normal");
  assert.equal(after.renewedOn, "01 Oct 2026");
  assert.equal(after.latest.reportStatus, "Alert", "the real result is kept");

  const sameDay = pointHealth({ reg, samples: [alert], oilChange: { changeDate: "10 Sept 2026" }, actions: [], topUps: [] });
  assert.equal(sameDay.current.reportStatus, "Normal", "changed on the sample's day: after the sample");

  const newReport = { ...alert, sampledDate: "15 Oct 2026", reportStatus: "Caution" };
  const next = pointHealth({ reg, samples: [alert, newReport], oilChange: { changeDate: "01 Oct 2026" }, actions: [], topUps: [] });
  assert.equal(next.current.reportStatus, "Caution", "the next report counts again");
});

test("plant summary keeps the local calendar day of an oil change", () => {
  const plant = buildOilPlant({
    registry: [reg],
    samples: [],
    actions: [],
    oilChanges: [{ equipmentCode: "LP-T1", changeDate: "01 Oct 2026", nextDueDate: "" }],
    topUps: [],
    trackerByEquip: {},
    now: new Date(2026, 9, 20).getTime(),
  });
  const text = JSON.stringify(plant);
  assert.ok(text.includes("2026-10-01"), text.slice(0, 400));
  assert.ok(!text.includes("2026-09-30"));
});

test("fresh oil restarts the sampling clock (no 'sample missing' for the old oil)", () => {
  const ago = (days) => new Date(Date.now() - days * 864e5).toDateString();
  const sampled = { code: "LP-T2", oilAnalysisRequired: "Yes", interval: "3 Months" };
  const lastSample = { unitId: "LP-T2", sampledDate: ago(130), reportStatus: "Alert", sampleId: "S-2" };
  const old = pointHealth({ reg: sampled, samples: [lastSample], oilChange: { changeDate: ago(200) }, actions: [], topUps: [] });
  assert.ok(old.reasons.some((r) => r.kind === "sample"), "a sample 130 days old on a 3-month interval: missing");
  const fresh = pointHealth({ reg: sampled, samples: [lastSample], oilChange: { changeDate: ago(20) }, actions: [], topUps: [] });
  assert.equal(fresh.health, "Good", JSON.stringify(fresh.reasons));
  assert.equal(fresh.sampleState.label, "OK");
});

test("a Caution/Alert sample says why, in a few words", async () => {
  const { sampleWhyText } = await import(SRC + "parsers.js");
  assert.equal(sampleWhyText({ reportStatus: "Normal", water: "0.5" }), "");
  const fromLab = { reportStatus: "Alert", water: "0.15", wear: { Fe: 85 }, flaggedReadings: [{ param: "Water", severity: "Alert" }, { param: "Fe", severity: "Caution" }] };
  const why = sampleWhyText(fromLab);
  assert.match(why, /^Water/);
  assert.match(why, /Fe.*\(Caution\)/);
  const typed = { reportStatus: "Caution", water: "", wear: { Fe: 35 }, contaminants: { Si: 5 } };
  assert.equal(sampleWhyText(typed), "Fe 35 ppm");
});
