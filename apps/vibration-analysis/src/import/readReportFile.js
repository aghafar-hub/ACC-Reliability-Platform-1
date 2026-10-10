// A contractor report PDF → read result (see rhiReport.js / asecReport.js).
// pdf.js loads only when someone imports a report.
import { parseRhi, looksLikeRhi } from "./rhiReport.js";
import { parseAsec, looksLikeAsec } from "./asecReport.js";

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
export async function readReportFile(file, contractor) {
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") throw new Error(`${file.name}: only PDF files can be read — save the report as PDF first.`);
  const pages = await pdfPages(file);
  if (!pages.some((p) => p.items.length)) throw new Error(`${file.name}: no text in this PDF (a scan?) — ask the contractor for the PDF saved from Word.`);
  const rhi = looksLikeRhi(pages);
  const asec = looksLikeAsec(pages);
  const kind = rhi && !asec ? "RHI" : asec && !rhi ? "ASEC" : contractor;
  const res = kind === "ASEC" ? parseAsec(pages, file.name) : parseRhi(pages, file.name);
  return { ...res, file: file.name, pages: pages.length, layout: kind };
}
