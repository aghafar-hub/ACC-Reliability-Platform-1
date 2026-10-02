import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Patch 34 ("make it feel like a normal app on mobile"): the
    // vite-plugin-pwa dependency was already in package.json from the
    // very first scaffolding commit but never actually configured — this
    // wires it up for real. generateSW only ever sees this project's own
    // `frontend/dist` output at build time (never the two modules' embed
    // bundles, which the deploy workflow copies in to the final site/
    // *after* this build runs — see .github/workflows/deploy.yml), so the
    // precache manifest is naturally scoped to just the shell's own small
    // app-shell assets. The modules' own (much larger, ~1-5MB) embed
    // bundles are covered instead by the runtimeCaching rule below —
    // StaleWhileRevalidate, not precached, so installing the app never
    // waits on downloading either module up front.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/favicon-16.png', 'icons/favicon-32.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'ACC Reliability Platform',
        short_name: 'ACC Reliability',
        description: 'Arabian Cement Company — equipment reliability platform (Oil Lubrication, Vibration Analysis, and more).',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#0A1628',
        theme_color: '#0A1628',
        icons: [
          { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Default globPatterns (JS/CSS/HTML/fonts) already cover the
        // shell's own built output; icons/manifest are picked up via
        // includeAssets above.
        navigateFallbackDenylist: [/^\/apps\//],
        runtimeCaching: [
          {
            // Both modules' embed bundles (apps/oil-analysis/embed.js,
            // apps/vibration-analysis/embed.js, and their own hashed
            // chunk files) — fetched dynamically via import() on first
            // visit to each module, not part of the initial page load.
            // Serve the cached copy instantly on a repeat visit (good on
            // a flaky plant-floor connection) while refreshing it in the
            // background, rather than blocking on the network or on a
            // multi-MB precache at install time.
            urlPattern: ({ url }) => url.pathname.includes('/apps/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'acc-module-bundles',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    fs: {
      // Dev server needs to serve source from the sibling app projects too —
      // EmbeddedOilAnalysis.tsx / EmbeddedVibrationAnalysis.tsx dynamically
      // import them directly from ../apps/*/src (see docs there for why).
      allow: ['..'],
    },
  },
})
