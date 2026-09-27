import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Separate build target from vite.config.js's normal standalone-app build.
// Produces one self-contained ES module (this app's own React 18 + every
// dependency bundled in, since it can't share the host shell's React 19)
// that the shared frontend loads at runtime to mount this app in place —
// see src/embed.jsx and frontend/src/pages/EmbeddedOilAnalysis.tsx.
export default defineConfig({
  plugins: [react()],
  // Vite's library mode (unlike a normal app build) doesn't replace
  // process.env.NODE_ENV automatically — react-dom checks it at runtime,
  // and there's no Node `process` global in a browser, so without this
  // the embed throws "ReferenceError: process is not defined" immediately.
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: "dist-embed",
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL("src/embed.jsx", import.meta.url)),
      formats: ["es"],
      fileName: () => "embed.js",
    },
  },
});
