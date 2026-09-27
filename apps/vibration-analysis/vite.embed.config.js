import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// See apps/oil-analysis/vite.embed.config.js for the full rationale — same
// pattern, this app's own embed build for frontend to load at runtime.
export default defineConfig({
  plugins: [react()],
  // See apps/oil-analysis/vite.embed.config.js — library mode doesn't
  // replace process.env.NODE_ENV automatically, and react-dom checks it
  // at runtime, so without this the embed throws immediately in a browser.
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
