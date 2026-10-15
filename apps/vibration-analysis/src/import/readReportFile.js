// A contractor report (PDF, or Word for RHI's layout from September 2026)
// → read result (see rhiReport.js / asecReport.js / rhiDocx.js).
// pdf.js loads only when someone imports a PDF.
import { parseRhi, looksLikeRhi } from "./rhiReport.js";
import { parseAsec, looksLikeAsec } from "./asecReport.js";
import { docxTables } from "./docxTables.js";
import { parseRhiDocx, looksLikeRhiDocx } from "./rhiDocx.js";

let pdfjs = null;
async function loadPdfjs() {
  if (pdfjs) return pdfjs;
  const [lib, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
  lib.GlobalWorkerOptions.workerSrc = worker.default;
  pdfjs = lib;
  return lib;
}

export async function pdfPages(file) {
  const lib = await loadPdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    pages.push({
      items: tc.items.filter((it) => it.str).map((it) => ({ x: it.transform[4], y: it.transform[5], w: it.width, h: Math.abs(it.transform[3] || it.height), s: it.str })),
    });
  }
  return pages;
}

// contractor: the report's contractor, used when the layout fits both / neither
const isDocx = (file) => /\.docx$/i.test(file.name) || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function readReportFile(file, contractor) {
  if (isDocx(file)) {
    const doc = await docxTables(await file.arrayBuffer());
    if (!looksLikeRhiDocx(doc)) throw new Error(`${file.name}: this Word file has no readings table the app knows (Equipment | Component | Point Location | Direction | Velocity | Acceleration | Date). Upload the PDF instead.`);
    const res = parseRhiDocx(doc, file.name);
    return { ...res, file: file.name, pages: 0, layout: "RHI (Word)" };
  }
  if (/\.doc$/i.test(file.name)) throw new Error(`${file.name}: old Word format (.doc) — open it in Word and save as .docx or PDF.`);
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") throw new Error(`${file.name}: only PDF or Word (.docx) files can be read.`);
  const pages = await pdfPages(file);
  if (!pages.some((p) => p.items.length)) throw new Error(`${file.name}: no text in this PDF (a scan?) — ask the contractor for the PDF saved from Word.`);
  const head = pages.slice(0, 50).map((p) => p.items.map((it) => it.s).join(" ")).join(" ");
  if (/Acceleration\s+RMS/i.test(head) && /Point\s+Location/i.test(head) && !/HDm/i.test(head))
    throw new Error(`${file.name}: RHI's new report layout (velocity + acceleration) — upload the Word file (.docx) of this report; its tables read exactly.`);
  const rhi = looksLikeRhi(pages);
  const asec = looksLikeAsec(pages);
  const kind = rhi && !asec ? "RHI" : asec && !rhi ? "ASEC" : contractor;
  const res = kind === "ASEC" ? parseAsec(pages, file.name) : parseRhi(pages, file.name);
  return { ...res, file: file.name, pages: pages.length, layout: kind };
}
