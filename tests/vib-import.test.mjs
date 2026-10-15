// Vibration report import: RHI's Word layout (from September 2026, ADASH
// VA5 PRO: velocity + acceleration per direction) and G's per direction.
// Made-up machines only. Run locally: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire, register } from "node:module";

// the app's sources import without ".js" (Vite style): let Node find them
register("./lib/extless-hooks.mjs", import.meta.url);
const SRC = "../apps/vibration-analysis/src/";
const { docxTables, readDocumentXml } = await import(SRC + "import/docxTables.js");
const { parseRhiDocx, looksLikeRhiDocx } = await import(SRC + "import/rhiDocx.js");
const { mergeParsed, matchImport, rowsToSave } = await import(SRC + "import/matchReport.js");
const { buildEquipment, fieldsFor, gsValue, systemStatus } = await import(SRC + "vibModel.js");

const require = createRequire(import.meta.url);
const { platformCore, moduleBackend, signIn } = require("./lib/backends.cjs");

// ── a .docx built here (zip, deflated with the runtime's CompressionStream) ──
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const table = (rows) => `<w:tbl>${rows.map((r) => `<w:tr>${r.map((c) => `<w:tc><w:p><w:r><w:t>${esc(c)}</w:t></w:r></w:p></w:tc>`).join("")}</w:tr>`).join("")}</w:tbl>`;
const para = (t) => `<w:p><w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`;
const HEAD = ["Equipment", "Component", "Point Location", "Direction", "Velocity RMS (mm/s)", "Acceleration RMS (g)", "Measurement Date"];
const ROWS = [
  ["Test Fan 999.FN.100", "Motor", "DE", "Horizontal", "1.200", "0.150", "07-Sep-2026"],
  ["Test Fan 999.FN.100", "Motor", "DE", "Vertical", "2.400", "0.310", "07-Sep-2026"],
  ["Test Fan 999.FN.100", "Motor", "DE", "Axial", "0.800", "0.120", "08-Sep-2026"],
  ["Test Fan 999.FN.100", "G1H", "NDE", "Horizontal", "0.500", "0.090", "07-Sep-2026"],
  ["Test Drive 999.MD.140", "Point 1", "HSS", "", "3.300", "0.410", "09-Sep-2026"],
  ["Test Drive 999.MD.140", "Point 3 - Rim", "", "", "1.100", "0.060", "09-Sep-2026"],
  ["Test Drive 999.MD.140", "Shaft 2", "DE", "Axial", "0.700", "0.100", "09-Sep-2026"],
  ["Test Drive 999.MD.140", "Shaft", "NDE", "Axial", "0.600", "0.090", "09-Sep-2026"],
  ["Test Elevator 999.BE.040 M01", "Shaft 1 Vertical", "", "", "2.000", "0.200", "10-Sep-2026"],
  ["Test Crusher", "Gearbox", "DE", "Horizontal", "0.900", "0.160", "11-Sep-2026"],
  ["Test Crusher", "Gearbox", "DE", "Horizontal", "1.000", "0.170", "11-Sep-2026"],
];
const XML = `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${para("Vibration Analysis report")}${para("September 2026")}${table([["Production Line", "Line 9"]])}${table([["SR", "Asset", "Asset ID", "Recommended Actions"], ["1", "Test Fan", "999.FN.100", "Check alignment & fixation."]])}${table([HEAD, ...ROWS])}</w:body></w:document>`;

async function deflateRaw(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function makeDocx(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = enc.encode(text);
    const data = await deflateRaw(raw);
    const nm = enc.encode(name);
    const loc = new DataView(new ArrayBuffer(30));
    loc.setUint32(0, 0x04034b50, true); loc.setUint16(8, 8, true);
    loc.setUint32(18, data.length, true); loc.setUint32(22, raw.length, true); loc.setUint16(26, nm.length, true);
    parts.push(new Uint8Array(loc.buffer), nm, data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(10, 8, true);
    cen.setUint32(20, data.length, true); cen.setUint32(24, raw.length, true); cen.setUint16(28, nm.length, true); cen.setUint32(42, off, true);
    central.push(new Uint8Array(cen.buffer), nm);
    off += 30 + nm.length + data.length;
  }
  const size = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, Object.keys(files).length, true); end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, size, true); end.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let p = 0;
  all.forEach((b) => { out.set(b, p); p += b.length; });
  return out.buffer;
}

test("Word report: tables are read from the .docx", async () => {
  const doc = await docxTables(await makeDocx({ "[Content_Types].xml": "<x/>", "word/document.xml": XML }));
  assert.deepEqual(doc.paragraphs.slice(0, 2), ["Vibration Analysis report", "September 2026"]);
  assert.equal(doc.tables.length, 3);
  assert.deepEqual(doc.tables[2][1], ROWS[0]);
  assert.equal(doc.tables[1][1][3], "Check alignment & fixation.", "entities are decoded");
  assert.ok(looksLikeRhiDocx(doc));
});

test("Word report: RHI's new layout → readings with the registry's point names", () => {
  const p = parseRhiDocx(readDocumentXml(XML), "x.docx");
  assert.equal(p.scope, "Line 9");
  assert.equal(p.month, "2026-09");
  const m = (id) => p.machines.find((x) => x.eq === id || x.name === id);
  const r = (id, point, fam) => m(id).readings.find((x) => x.point === point && x.family === fam);
  const fan = m("999.FN.100");
  assert.equal(fan.recommendation, "Check alignment & fixation.");
  assert.deepEqual(r("999.FN.100", "Motor DE", "RMS").vals, { H: 1.2, V: 2.4, A: 0.8 });
  assert.deepEqual(r("999.FN.100", "Motor DE", "Gs").vals, { gH: 0.15, gV: 0.31, gA: 0.12 });
  assert.equal(r("999.FN.100", "Motor DE", "RMS").date, "2026-09-08", "latest date of the directions");
  assert.match(r("999.FN.100", "Motor DE", "RMS").note, /H measured 2026-09-07/);
  assert.deepEqual(r("999.FN.100", "Shaft 1 NDE", "RMS").vals, { H: 0.5 }, "G1H → Shaft 1, horizontal");
  assert.deepEqual(r("999.MD.140", "GB HSS 1", "RMS").vals, { U: 3.3 }, "HSS point: no direction");
  assert.deepEqual(r("999.MD.140", "Rim Gear 3", "Gs").vals, { gU: 0.06 });
  assert.ok(r("999.MD.140", "Shaft 2 NDE", "RMS"), '"Shaft" with no number → the shaft before it');
  assert.equal(m("999.BE.040 M1").drive, "M1");
  assert.deepEqual(r("999.BE.040 M1", "Shaft 1 DE", "RMS").vals, { V: 2 }, "direction in the component, no side → DE");
  assert.ok(r("Test Crusher", "Gearbox 2 DE", "RMS"), "the same point twice → a second set");
});

test("Import match: G's per direction, undirected points, duplicate register rows", () => {
  const P = (vibId, eq, pos, family, description, readingColumns, extra = {}) => ({ vibId, equipmentId: eq, positionCode: pos, family, description, readingColumns, contractor: "RHI", status: "Active", reportArea: "Line 9", ...extra });
  const points = [
    P("V-FN-MDE-RMS", "999.FN100", "MDE", "RMS", "Motor DE", "Axial, Horizontal, Vertical"),
    P("V-FN-MDE-Gs", "999.FN100", "MDE", "Gs", "Motor DE (G's)", "Axial, Horizontal, Vertical (g)"),
    P("V-MD-GBHSS1", "999.MD140", "GBHSS1", "RMS", "GB HSS 1", "Horizontal"),
    P("V-MD-GBHSS1-Gs", "999.MD140", "GBHSS1", "Gs", "GB HSS 1 (G's)", "Horizontal (g)"),
  ];
  const reg = [{ equipmentId: "999.FN100", equipment: "Test Fan", line: "Line 9" }, { equipmentId: "999.FN.100", equipment: "Test Fan", line: "Line 9" }, { equipmentId: "999.MD140", equipment: "Test Drive", line: "Line 9" }];
  const eq = buildEquipment(points, reg, [], { equipment: [{ equipmentId: "999.FN100", gs: [0.2, 0.3, 0.5] }] });
  const ms = matchImport(mergeParsed([parseRhiDocx(readDocumentXml(XML), "x.docx")]), { Contractor: "RHI", "Report scope": "Line 9", Month: "2026-09", "Report ID": "R" }, eq, []);
  const fan = ms.find((m) => m.eqIn === "999.FN.100");
  assert.equal(fan.eqId, "999.FN100", "the register spelling with VIB IDs wins over its dotted twin");
  const gs = fan.rows.find((r) => r.vibId === "V-FN-MDE-Gs");
  assert.deepEqual(gs.vals, { gh: 0.15, gv: 0.31, ga: 0.12 });
  assert.equal(gs.systemStatus, "Alert", "G's status from the highest direction (0.31 g, limits 0.2/0.3/0.5)");
  const drive = ms.find((m) => m.eqIn === "999.MD.140");
  assert.deepEqual(drive.rows.find((r) => r.vibId === "V-MD-GBHSS1").vals, { h: 3.3 }, "no-direction value → the VIB ID's one direction");
  assert.deepEqual(drive.rows.find((r) => r.vibId === "V-MD-GBHSS1-Gs").vals, { gh: 0.41 });
  const save = rowsToSave(ms).find((x) => x.vibId === "V-FN-MDE-Gs");
  assert.equal(save.gv, 0.31);

  assert.deepEqual(fieldsFor(points[1]), ["gh", "gv", "ga"]);
  assert.deepEqual(fieldsFor({ family: "Gs", readingColumns: "Gs" }), ["g"], "ASEC PeakVue keeps one value");
  assert.equal(gsValue({ gh: "0.1", gv: "", ga: "0.4" }), 0.4);
  assert.equal(systemStatus(points[1], eq["999.FN100"], { gh: 0.1, ga: 0.6 }), "Danger");
});

test("Backend: a G's reading per direction is saved with the highest as G's (g)", () => {
  const vib = moduleBackend("vibration-analysis", platformCore());
  const ss = vib.SpreadsheetApp.getActiveSpreadsheet();
  const rep = { "Report ID": "VL-2026-09-RHI-L9", Month: "2026-09", Contractor: "RHI", "Report scope": "Line 9", "Workflow status": "Draft" };
  vib.vlFindReport_ = () => ({ rep });
  vib.vlMasterData_ = () => ({
    eq: { "999.FN100": { id: "999.FN100", name: "Test Fan", contractor: "RHI", line: "Line 9", scope: "Line 9", gs: null } },
    vib: { "V-FN-MDE-Gs": { "VIB ID": "V-FN-MDE-Gs", "Equipment ID": "999.FN100", Family: "Gs", "Position Code": "MDE", "Point Description": "Motor DE (G's)", Contractor: "RHI" } },
    vibLimits: {},
  });
  vib.vlPointScope_ = () => "Line 9";
  vib.vlWriteCoverage_ = () => {};
  vib.vlCounts_ = () => ({});
  vib.vlWriteReport_ = () => {};
  const res = vib.handleSaveVibEntries({ reportId: rep["Report ID"], entries: [{ vibId: "V-FN-MDE-Gs", date: "2026-09-07", gh: 0.15, gv: 0.31, ga: 0.12 }] }, vib.getSessionOrNull_(signIn("accEng")));
  assert.equal(res.status, "ok", JSON.stringify(res));
  const vals = ss.getSheetByName(vib.SHEET_VENTRIES).getDataRange().getValues();
  const row = Object.fromEntries(vals[0].map((h, i) => [h, vals[1][i]]));
  assert.equal(row["G's (g)"], 0.31);
  assert.equal(row["Horizontal (g)"], 0.15);
  assert.equal(row["Axial (g)"], 0.12);
  assert.equal(row["System status"], "No limits");
});

test("Backend: the contractor's report file is kept with the report and given back", () => {
  const vib = moduleBackend("vibration-analysis", platformCore());
  const rep = { "Report ID": "VL-2026-09-RHI-L9", Month: "2026-09", Contractor: "RHI", "Report scope": "Line 9", "Workflow status": "Draft" };
  vib.vlFindReport_ = () => ({ rep });
  const s = (who) => vib.getSessionOrNull_(signIn(who));
  const word = Buffer.concat([Buffer.from("PK\x03\x04"), Buffer.from("made-up word file")]).toString("base64");
  const save = (who, extra = {}) => vib.handleSaveVibReportFile({ reportId: rep["Report ID"], fileKey: "VRF-0000-1111-2222", fileName: "Line 9 report.docx", base64: word, ...extra }, s(who));
  assert.match(save("asecEng").error, /another contractor/);
  assert.match(save("rhiEng", { fileName: "x.exe" }).error, /PDF or Word/);
  assert.match(save("rhiEng", { fileName: "x.pdf" }).error, /not a PDF/);
  const ok = save("rhiEng");
  assert.equal(ok.status, "ok", JSON.stringify(ok));
  assert.equal(ok.files.length, 1);
  // the same name again replaces it
  const again = save("rhiEng", { fileKey: "VRF-0000-1111-3333" });
  assert.equal(again.files.map((f) => f.key).join(), "VRF-0000-1111-3333");
  const got = vib.handleGetVibReportFile({ reportId: rep["Report ID"], fileKey: "VRF-0000-1111-3333" }, s("accEng"));
  assert.equal(got.status, "ok", JSON.stringify(got));
  assert.equal(got.fileName, "Line 9 report.docx");
  assert.equal(got.base64, word);
  assert.match(vib.handleGetVibReportFile({ reportId: rep["Report ID"], fileKey: "VRF-0000-1111-2222" }, s("accEng")).error, /not kept/, "the replaced copy is gone");
  rep["Workflow status"] = "Approved";
  assert.match(save("rhiEng").error, /Draft or Returned/, "a sent report takes no new file from the contractor");
});

test("Import match: another line's machine stays out even if un-skipped; a name finds the machine with VIB IDs", () => {
  const P = (vibId, eq, area, contractor = "RHI") => ({ vibId, equipmentId: eq, positionCode: "MDE", family: "RMS", description: "Motor DE", readingColumns: "Axial, Horizontal, Vertical", contractor, status: "Active", reportArea: area, area });
  const reg = [
    { equipmentId: "998.FN100", equipment: "Other Fan", line: "Line 1" },
    { equipmentId: "999.FN100", equipment: "Test Fan", line: "Line 2" },
    { equipmentId: "999.CR999", equipment: "Test Crusher", line: "Line 2" }, // same name, no VIB IDs
    { equipmentId: "", equipment: "", line: "" }, // a blank register row
    { equipmentId: "999.CR100", equipment: "Test Crusher", line: "Line 2" },
  ];
  const eq = buildEquipment([P("V-OTHER", "998.FN100", "Line 1"), P("V-FAN", "999.FN100", "Line 2"), P("V-CR", "999.CR100", "Line 2")], reg, [], null);
  const parsed = { contractor: "RHI", scope: "Line 2", month: "2026-09", warnings: [], machines: [
    { eq: "998.FN.100", name: "Other Fan", condition: "", recommendation: "", readings: [{ point: "Motor DE", family: "RMS", sub: "", vals: { H: 1 }, date: "2026-09-07" }] },
    { eq: "", name: "Test Crusher", condition: "", recommendation: "", readings: [{ point: "Motor DE", family: "RMS", sub: "", vals: { H: 2 }, date: "2026-09-07" }] },
  ] };
  const ms = matchImport(mergeParsed([parsed]), { Contractor: "RHI", "Report scope": "Line 2", Month: "2026-09", "Report ID": "R" }, eq, []);
  const other = ms.find((m) => m.eqIn === "998.FN.100");
  assert.ok(other.skipMachine && other.outOfScope);
  other.skipMachine = false; // ticked off by hand on the check screen
  assert.equal(ms.find((m) => m.nameIn === "Test Crusher").eqId, "999.CR100");
  assert.equal(rowsToSave(ms).map((r) => r.vibId).join(), "V-CR", "the Line 1 machine is never sent with a Line 2 report");
});

test("Import match: a drive named in the report (\"… M02\") keeps to that drive when the machine is picked by hand", async () => {
  const { setMachine } = await import(SRC + "import/matchReport.js");
  const P = (vibId, pos) => ({ vibId, equipmentId: "999.BE050", positionCode: pos, family: "RMS", description: pos.replace(/^M(\d)-/, "M$1 ").replace("MDE", "Motor DE"), readingColumns: "Axial, Horizontal, Vertical", contractor: "RHI", status: "Active", reportArea: "Line 2", area: "Line 2" });
  const eq = buildEquipment([P("V-M1", "M1-MDE"), P("V-M2", "M2-MDE")], [{ equipmentId: "999.BE050", equipment: "Test Elevator", line: "Line 2" }], [], null);
  const rep = { Contractor: "RHI", "Report scope": "Line 2", Month: "2026-09", "Report ID": "R" };
  const parsed = { contractor: "RHI", scope: "Line 2", month: "2026-09", warnings: [], machines: [
    { eq: "999.BE.040 M2", drive: "M2", name: "Bucket Elevator", condition: "", recommendation: "", readings: [{ point: "Motor DE", family: "RMS", sub: "", vals: { H: 3 }, date: "2026-09-27" }] },
  ] };
  const [m] = matchImport(mergeParsed([parsed]), rep, eq, []);
  assert.equal(m.eqId, "", "the report's ID is wrong: not found");
  setMachine(m, "999.BE050", eq, rep);
  assert.equal(m.rows[0].vibId, "V-M2", "picked by hand: drive M2's Motor DE");
});
