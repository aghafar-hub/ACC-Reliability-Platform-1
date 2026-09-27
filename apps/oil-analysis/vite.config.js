import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Base path matches how this app is served (repo-name subpath on GitHub Pages
// or a similar static host). Adjust if you deploy elsewhere.
export default defineConfig({
  base: "/acc-oil-analysis-app/",
  plugins: [react()],
});
