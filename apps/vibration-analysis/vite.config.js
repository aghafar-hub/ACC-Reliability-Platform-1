import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Base path matches how this app is served (repo-name subpath on GitHub Pages
// or a similar static host). GitHub Pages paths are case-sensitive, and the
// repo's real name is "ACC-Vibration-Analysis-App" (mixed case) — the actual
// deploy URL confirmed by the "Deploy to GitHub Pages" workflow's own log is
// https://aghafar-hub.github.io/ACC-Vibration-Analysis-App/, so this has to
// match that exactly or every asset URL 404s (a white screen, not an error
// page, since index.html itself still loads fine). Adjust if you deploy
// elsewhere.
export default defineConfig({
  base: "/ACC-Vibration-Analysis-App/",
  plugins: [react()],
});
