import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Emits pdf.js's worker as its own file (dir/pdf.worker.min.mjs, next to the
// chunk that loads it) instead of letting the build pack it into the main
// bundle as a data URL. src/pdfReportParser.js finds it with
// new URL("pdf.worker.min.mjs", import.meta.url).
export default function pdfWorkerFile(dir = "") {
  return {
    name: "pdf-worker-file",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: `${dir}pdf.worker.min.mjs`,
        source: readFileSync(fileURLToPath(new URL("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url))),
      });
    },
  };
}
