# Apps Script backend — moved

The live backend behind this app now lives at
[`backend/vibration-analysis/src/`](../../../backend/vibration-analysis/src/)
— a set of topic files (`Code.js`, `Config.js`, `Utils.js`,
`EquipmentRegister.js`, `Triggers.js`, etc.), the same structure
`backend/oil-lubrication/src/` already uses, replacing the single
`Code.gs`/`Code.fixed.gs`/`Code.v2.gs` trio that used to live in this
folder (confusing to tell apart — `Code.fixed.gs` had the real fixes,
`Code.gs` was the stale original, `Code.v2.gs` an abandoned sandbox-only
addition). See that folder's own files for the two bug fixes
(`EquipmentRegister.js`, `Triggers.js`) and the VIB ID Registry read
(`VibRegistry.js`), each documented at the top of its own file.

This folder now only holds **`vib-id-merge/`** — the one-time kit that
migrated equipment IDs to the master-DB format and built the VIB ID
Registry tab in the real Sheet. Its `Migrate.gs` and `BackfillVibIds.gs`
are one-off tools, not part of the live backend, so they stay here rather
than in `backend/vibration-analysis/src/`. See `vib-id-merge/README.md`.
