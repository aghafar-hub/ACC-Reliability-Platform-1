# ACC Reliability Platform

A web + mobile (PWA) platform for the Reliability section at Arabian
Cement Company's (ACC) Sokhna plant, Egypt.

**Start here:** [`docs/platform-foundation-spec.md`](docs/platform-foundation-spec.md)
is the approved architecture and Foundation specification. It's the
source of truth for how this is built — this README just orients you
around the repo layout.

[`docs/requirements-notes.md`](docs/requirements-notes.md) is the full raw
decision log the spec was distilled from, kept for traceability.

## Repository layout

```
frontend/               React + TypeScript PWA (Vite)
backend/
  platform-core/         Google Apps Script backend — the shared
                          foundation (auth, RBAC, asset master, admin
                          settings). Its own Web App deployment,
                          own Google Sheets.
  <module-name>/          Each feature module (Oil Lubrication & Analysis,
                          Vibration Analysis, ...) gets its own sibling
                          folder here once designed, each with its own
                          Apps Script deployment and own Sheets — modules
                          never share sheets with each other or with
                          Platform Core (spec §3, §11).
apps/                    Oil Lubrication & Analysis and Vibration Analysis
                          modules, not yet rebuilt against the Foundation
                          — actively maintained in this repo (see below).
scripts/                 One-off setup/deployment helper scripts.
docs/                    Specs and the requirements decision log.
```

## `apps/` — Oil Analysis and Vibration Analysis (pre-Foundation)

`apps/vibration-analysis/` and `apps/oil-analysis/` started out as
byte-for-byte copies of two already-built, currently-in-use apps
([`aghafar-hub/ACC-Vibration-Analysis-App`](https://github.com/aghafar-hub/ACC-Vibration-Analysis-App),
[`aghafar-hub/acc-oil-analysis-app`](https://github.com/aghafar-hub/acc-oil-analysis-app))
— see `docs/requirements-notes.md` (Round 20) for the full reasoning.
That "do not edit" rule only ever covered the initial copy-in step itself
("problems...will be worked through and adjusted afterward" — Round 20).
Both folders are now ordinary, actively-maintained parts of this repo (see
Round 21): fix bugs and build features directly in them like anywhere
else in this codebase. The two source repos above are no longer this
repo's source of truth, and there's no obligation to keep these folders
in sync with them. See each one's own `docs/` folder for its architecture
and Sheet schema.

Neither has authentication, RBAC, or contractor-isolation enforcement —
both predate and conflict with the Foundation spec's security model
(§6 of `docs/platform-foundation-spec.md`). That gap will be worked
through as part of building each one's real Foundation-compliant module —
do not treat either app's current code as a template for how the real
Oil Analysis or Vibration modules should be built against the Foundation.

## Architecture in one paragraph (Foundation build)

Frontend is a single React PWA hosted on GitHub Pages. It talks to
multiple independent backends — Platform Core plus one per feature
module — each its own Google Apps Script Web App deployment bound only to
its own Google Sheets. This is what satisfies the platform's core
requirement: any module can be stopped, broken, or upgraded without
taking down Platform Core or any other module. See spec §2–§4 for the
full picture and reasoning.

## Working on the Apps Script backend

Each backend folder (`backend/platform-core/`, and later each module's
folder) is a [`clasp`](https://github.com/google/clasp) project:

```
npm install -g @google/clasp
clasp login
cd backend/platform-core
cp .clasp.json.example .clasp.json   # fill in the real scriptId, never commit it
clasp push
```

`.clasp.json` and any service-account/credential files are gitignored —
they must never be committed.

## Status

Foundation implementation is in progress. Feature modules (starting with
Oil Lubrication & Analysis) each get their own dedicated requirements
discussion and spec before implementation starts, per the approved build
order.
