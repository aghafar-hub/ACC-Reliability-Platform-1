# Development, build & deployment

## Local development

```bash
npm install
npm run dev
```

Opens a dev server (default `http://localhost:5173`). Go to **Settings**
in the app and paste your Apps Script Web App URL — it's stored in your
browser's `localStorage` only, never in the repo or a `.env` file.

## Quality checks

```bash
npm run lint          # ESLint (flat config, eslint.config.js)
npm run format        # Prettier — auto-fix formatting
npm run format:check  # Prettier — check only, no changes (used in CI)
npm run build         # Production build via Vite
```

All four run in CI (`.github/workflows/ci.yml`) on every push and pull
request against `main`. A PR with lint errors, formatting drift, or a
failing build will show a red check.

## Production build

```bash
npm run build
```

Outputs a static site to `dist/` — an `index.html`, a hashed JS bundle in
`dist/assets/`, and a separate `pdf.worker.min-*.mjs` chunk (`pdfjs-dist`'s
web worker, used by the bulk PDF import feature — see
[PDF_IMPORT.md](./PDF_IMPORT.md)), loaded via Vite's `?url` import so it
gets its own hashed output file rather than being inlined. This is a fully
static site; it can be hosted anywhere that serves static files (GitHub
Pages, Netlify, S3 + CloudFront, an internal web server, etc.). There is no
server-side code to deploy — all data access happens client-side against
the Apps Script webhook, and all PDF parsing happens client-side too, with
no network call at all.

`pdfjs-dist` is deliberately pinned to `^4.10.38`, not the latest major —
see [PDF_IMPORT.md](./PDF_IMPORT.md#why-this-is-entirely-client-side)
before bumping it.

### Base path

`vite.config.js` sets:

```js
base: "/acc-oil-analysis-app/";
```

This matches being served from a subpath like
`https://<user>.github.io/acc-oil-analysis-app/`. If you deploy to a
custom domain or a host's root path instead, change this to `base: "/"`
before building — otherwise asset URLs will 404.

### Deploying to GitHub Pages

The simplest option, given the repo is already on GitHub:

1. Add a `deploy` step (or a second workflow) that runs `npm run build`
   and publishes `dist/` to the `gh-pages` branch — e.g. using
   [`peaceiris/actions-gh-pages`](https://github.com/peaceiris/actions-gh-pages).
2. In the repo's **Settings → Pages**, set the source to the `gh-pages`
   branch.
3. Confirm `vite.config.js`'s `base` matches the resulting URL path.

This isn't wired up yet in `.github/workflows/ci.yml` (which currently
only lints/builds, it doesn't publish) — add a deploy job when you're
ready to have this app served automatically on every merge to `main`.

## Environment / secrets

There are none. The webhook URL is not a secret in the traditional sense
(it's meant to be reachable by anyone with the link, per the Apps Script's
"Execute as: Me / Anyone" deployment setting) and is entered per-browser
via Settings rather than baked into the build. Nothing in this repo needs
a `.env` file, and none should be added unless a genuine secret is
introduced later — if that happens, use Vite's `import.meta.env.VITE_*`
convention and add the variable name (not its value) to a checked-in
`.env.example`.
