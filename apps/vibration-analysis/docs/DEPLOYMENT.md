# Development, build & deployment

## Local development

```bash
npm install
npm run dev
```

Opens a dev server (default `http://localhost:5173`). The app ships with a
working default webhook URL (the production endpoint the original bundle
had hardcoded — see "Environment / secrets" below), so it'll try to sync
against real data immediately. To point at a different sheet, go to
**Settings → Configuration** (pass key `17593` — see
[API_CONTRACT.md](./API_CONTRACT.md#known-gaps) for why that's not real
security) and change the Webhook URL — it's stored in your browser's
`localStorage` only, never in the repo or a `.env` file.

## Quality checks

```bash
npm run lint          # ESLint (flat config, eslint.config.js)
npm run format        # Prettier — auto-fix formatting
npm run format:check  # Prettier — check only, no changes (used in CI)
npm run build          # Production build via Vite
```

All four run in CI (`.github/workflows/ci.yml`) on every push and pull
request against `main`.

## Production build

```bash
npm run build
```

Outputs a static site to `dist/` — an `index.html` and a hashed JS bundle
in `dist/assets/`. This is a fully static site; it can be hosted anywhere
that serves static files (GitHub Pages, Netlify, S3 + CloudFront, an
internal web server, etc.). There is no server-side code to deploy — all
data access happens client-side against the Apps Script webhook.

### Base path

`vite.config.js` sets:

```js
base: "/ACC-Vibration-Analysis-App/";
```

This has to match the exact, case-sensitive path this app is served from —
GitHub Pages paths are case-sensitive, and this repo's real name is
`ACC-Vibration-Analysis-App` (mixed case), so the live URL is
`https://aghafar-hub.github.io/ACC-Vibration-Analysis-App/`. A casing
mismatch here doesn't 404 the page itself (`index.html` still loads) — it
404s every asset `index.html` references, which renders as a blank white
screen with no visible error (this shipped broken once for exactly that
reason before being caught and fixed). If you deploy to a custom domain or
a host's root path instead, change this to `base: "/"` before building.

### Deploying to GitHub Pages

`.github/workflows/deploy.yml` builds and publishes `dist/` via GitHub's
official Pages actions on every push to `main`. To enable it:

1. In the repo's **Settings → Pages**, set the source to **GitHub
   Actions**.
2. Push to `main` — the workflow builds and deploys automatically.
3. Confirm `vite.config.js`'s `base` matches the resulting URL path.

## Environment / secrets

There are none. The webhook URL is not a secret in the traditional sense —
Apps Script Web Apps deployed "Execute as: Me / Who has access: Anyone" are
meant to be reachable by anyone with the link, and the original app shipped
its production URL hardcoded directly in the client bundle (visible to
anyone who opened devtools). This rebuild keeps that same default
(`DEFAULT_WEBHOOK_URL` in `config.js`) rather than removing it, since
that's a straight reconstruction of the original's actual behavior, not
something this rebuild introduced. Nothing in this repo needs a `.env`
file, and none should be added unless a genuine secret is introduced later.

## The backend (Apps Script)

This app has no server of its own, but the Google Apps Script Web App it
depends on is real server-side code, and a copy of it now lives at
[`apps-script/Code.gs`](../apps-script/Code.gs) — see
[`apps-script/README.md`](../apps-script/README.md) for what it is, two
real bugs found by comparing it against the live Sheet, and
`apps-script/Code.fixed.gs`, a corrected version. None of this is deployed
automatically by anything in this repo (there's no credential or mechanism
here that could reach a Google Apps Script project); applying a fix means
manually pasting `Code.fixed.gs` into the Sheet's Extensions → Apps Script
editor and redeploying, per the setup steps in Settings → System → "Apps
Script v3 — Setup Instructions" inside the running app.
