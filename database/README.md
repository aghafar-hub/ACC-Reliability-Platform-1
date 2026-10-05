# ACC Reliability Platform — Database Design (Draft)

Designed and tested against a local MySQL 8.0 instance (not deployed anywhere
yet — the live app keeps running on GitHub Pages + Apps Script + Google
Sheets exactly as it does today, untouched). This is the first step of a
larger migration, covering Platform Core, Oil Lubrication, and Vibration
Analysis — other modules will follow once these three are approved and
working.

## Files

Run in this order (each depends on the one before it):

1. `schema/00_core.sql` — Organizations, Users/Roles/Permissions, the
   unified Equipment table, Settings, Audit Log.
2. `schema/01_oil_lubrication.sql` — Lubrication Points, Samples, Actions,
   Routines, Inventory, notifications, reference tables.
3. `schema/02_vibration_analysis.sql` — VIB Points, RMS/SPM Registers,
   RMS/SPM Readings, Compliance, Actions.

All three have been run end-to-end from a completely empty database with no
errors, and smoke-tested with real inserts to confirm foreign keys actually
reject bad data (not just that the `CREATE TABLE` statements parse) and that
the views return correct, live-computed results.

## What changed vs. a literal one-sheet-per-table port

A straight port of every sheet as-is would just move today's problems into
MySQL. Based on a full survey of the three live backends, this design fixes
four specific issues instead:

1. **One Equipment table, not three.** Today, Platform Core's equipment
   table was never built, Oil Lubrication has its own equipment-ish list
   keyed by LP_ID, and Vibration Analysis has its own keyed by Equipment_ID
   — none of them reference each other, so the same physical equipment's
   name/area/line can silently drift apart between modules. Now
   `equipment` lives once in the core schema, and both modules' own
   point-level tables (`lubrication_points`, `vib_points`) reference it by
   foreign key.

2. **One Organizations/Contractor table.** Today each module re-expresses
   "RHI"/"ASEC" its own way with manual text normalization. Now there's one
   canonical `org_code` everything joins against.

3. **"Current status" computed, not duplicated.** Today, Oil Lubrication's
   "Oil Sample Tracker" and Vibration's "Last RMS/SPM Reading" are separate
   sheets kept in sync by hand on every write (and Vibration's Compliance
   Tracker needs a scheduled job just to backfill blank cells). These
   become plain SQL views computed from the event-log tables — always
   correct, nothing to keep in sync, and the Compliance "Missing" backfill
   disappears entirely (computed at read time instead of written by a job).

4. **Real foreign keys for "who did this."** Several actor fields (routine
   assignment, approvals, etc.) were free-text strings before; they're now
   real references to `users`, enforced by the database itself.

Two things were surveyed and **deliberately left alone**: the unused 8-layer
RBAC design in Platform Core's `Rbac.js` (confirmed never built — not worth
reviving blind), and the separate `OL_MODULE_RESPONSIBILITIES`/
`notify_reviewers` notification-routing tables (they overlap conceptually
with `organizations`/`user_roles` but don't map onto them 1:1 without a
larger RBAC rework — flagged for a follow-up pass, not merged blind).

## Status

**Schema: done.** **API layer: done** — see `../api/README.md` for how to
run it locally and what every endpoint covers. All of it tested end-to-end
against a real local database before being committed.

## Not done yet (next steps, in order)

1. Real data migration (exporting the live Google Sheets data and loading it
   into these tables) — not started, and won't touch the live spreadsheets
   either way.
2. Only after that's proven working: an actual cutover plan for moving the
   live app over, with the current system kept running in parallel until
   it's confirmed safe to retire.
