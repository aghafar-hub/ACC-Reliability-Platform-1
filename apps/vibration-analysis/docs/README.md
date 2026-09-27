# Documentation

Start here, then follow whichever doc matches what you need:

| Doc                                  | What's in it                                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | How the app is put together: data flow, state, threshold precedence, theming, known gaps, diagrams |
| [CODE_GUIDE.md](./CODE_GUIDE.md)     | A walkthrough of every file in `src/` — what it does and why                                       |
| [SHEET_SCHEMA.md](./SHEET_SCHEMA.md) | The Google Sheet column layout this app reads/writes, confirmed vs. inferred                       |
| [API_CONTRACT.md](./API_CONTRACT.md) | The Apps Script webhook's action-by-action contract (requests/responses)                           |
| [DEPLOYMENT.md](./DEPLOYMENT.md)     | Local dev, build, CI, and deploying to a static host                                               |

## The short version

This app tracks **vibration (RMS) and bearing-condition (SPM) readings**
on Arabian Cement plant equipment. All of its data — readings, the
equipment register, compliance history, the action tracker — lives in a
**Google Sheet**. A **Google Apps Script**, deployed as a Web App, sits
between this React app and that sheet: the app calls it over HTTP (`GET`
only, with a JSONP fallback for reads — see
[API_CONTRACT.md](./API_CONTRACT.md)), and it reads/writes the sheet on
the app's behalf. There is no separate database and no backend server to
host — the Sheet _is_ the database.

This is a from-scratch rebuild of `Vibration-Analysis-App` — a repo that
held only a compiled, minified build (`index.html` +
`assets/index-XLkmhznS.js`, ~276KB, single line, no source maps). Nothing
in this rebuild was copied from a description or guessed from screenshots
alone: every page, every status calculation, every webhook action, and
every theme color was reconstructed by decompiling that actual minified
bundle — renaming its cryptic identifiers, un-minifying its control flow,
and cross-checking behavior against the live app. The untouched original
is preserved at [`legacy-exact-copy/`](../legacy-exact-copy/) for
reference. Where the reconstruction found a real quirk or bug in the
original (an inconsistent webhook payload, a threshold that silently gets
overwritten, a non-functional passcode), it's reproduced faithfully and
called out explicitly in these docs rather than "fixed" — see
[ARCHITECTURE.md](./ARCHITECTURE.md#known-gaps) and
[API_CONTRACT.md](./API_CONTRACT.md#known-gaps).
