# ACC Reliability Platform — Foundation Specification (v1)

**Status:** DRAFT — for Reliability Manager review and sign-off
**Scope:** Platform Core / foundation only. Feature modules (Oil
Lubrication & Analysis, Vibration Analysis, Reliability Measurements,
Compressors, future modules) are each specified separately, later, in
their own dedicated document once discussed in the same depth as this one.

This document consolidates decisions made in the requirements discussion
(see `docs/requirements-notes.md` for the full raw log) into a single
reviewable spec. Sections marked **[PROPOSED]** are Claude's technical
design proposal to satisfy a stated requirement, not something explicitly
dictated by the user — these need your explicit sign-off, not just a skim.
Everything else states a decision you already made.

---

## 1. Context

- **Owner:** Arabian Cement Company (ACC) — Sokhna plant, Egypt.
- **Sponsor:** Plant Reliability Manager.
- **Operated/maintained by two contractors**, each covering half the
  plant: **RHI** and **ASEC**. Users of the platform come from all three
  organizations: ACC, RHI, ASEC.
- **Goal:** A web + mobile (PWA) platform for the plant's Reliability
  section — track and act on reliability data, module by module, starting
  with this foundation and then Oil Lubrication & Analysis.
- **Scale target:** 20–40 users. ~1,892 equipment records, 924
  lubrication points, 1,765 vibration points already exist (real export
  supplied — see §7).
- **Timeline:** soft target of one month for foundation + first module.
  Quality prioritized over speed — not a hard deadline.

---

## 2. Architecture overview

```
┌─────────────────────────────────────────────────────────────────┐
│  GitHub Pages (static hosting)                                   │
│  React/TypeScript PWA — installable, offline-capable, EN/AR RTL  │
└───────────────┬───────────────────────┬──────────────┬──────────┘
                 │                       │              │
                 ▼                       ▼              ▼
   ┌─────────────────────┐  ┌─────────────────────┐  ┌──────────────────┐
   │ Platform Core        │  │ Oil Lubrication &    │  │ Vibration, future │
   │ Apps Script Web App  │  │ Analysis Apps Script │  │ modules — each own│
   │ (own endpoint)        │  │ Web App (own endpoint│  │ Apps Script Web   │
   │                       │  │                      │  │ App (own endpoint)│
   └──────────┬───────────┘  └──────────┬───────────┘  └─────────┬────────┘
              │                          │                         │
              ▼                          ▼                         ▼
   ┌─────────────────────┐  ┌─────────────────────┐  ┌──────────────────┐
   │ Platform Core         │  │ Oil Lubrication      │  │ Module's own       │
   │ Google Sheet(s):      │  │ Google Sheet(s):     │  │ Google Sheet(s):   │
   │ Users, Roles, Orgs,    │  │ own settings sheet + │  │ own settings sheet │
   │ Asset Master, Settings,│  │ own data sheet(s)    │  │ + own data sheet(s)│
   │ Notifications, Backup  │  │                      │  │                    │
   │ config                │  │                      │  │                    │
   └─────────────────────┘  └─────────────────────┘  └──────────────────┘
        All under ACC's company Google Workspace account
```

- **Frontend hosting: GitHub Pages.** Free static hosting served directly
  from this GitHub repo. Satisfies "hosted on GitHub" and requires no
  server to run/maintain. **[decided, §8 of notes]**
- **Backend: Google Apps Script**, deployed as a Web App **per module**
  (see §4). Runs inside Google's infrastructure next to the Sheets;
  handles login/auth checks, permission enforcement, and all reads/writes
  to that module's Sheets. A static site alone cannot safely hold secrets
  or run this logic, which is why Apps Script sits behind the PWA.
  **[decided, §1]**
- **Database: Google Sheets.** File storage (e.g. lab report attachments,
  photos): **Google Drive.** Both live under **ACC's company Google
  Workspace account** — not a personal/free Google account. **[decided]**
- **Frontend framework: [PROPOSED]** React + TypeScript, built as an
  installable PWA (service worker + manifest), responsive across
  phone/tablet/desktop. This was the prior doc set's baseline choice and
  is a reasonable, mainstream fit for this architecture — flag if you'd
  rather discuss alternatives before this is locked in.

---

## 3. Platform Core vs. Feature Modules

Two layers, per your explicit clarification (round 10):

1. **Platform Core** — shared infrastructure every module plugs into.
   Owns its own settings+data sheets and its own Apps Script endpoint,
   same as any module, but its "business" is running the platform itself,
   not a reliability discipline:
   - User accounts, authentication, roles & permissions (§5, §6)
   - Organizations (ACC / RHI / ASEC)
   - Asset Master (equipment, lubrication points, vibration points) (§7)
   - Notifications engine (in-app + push) (§9)
   - Admin/Settings framework (language, backup schedule, data-size
     alarms — see §10)
   - Language switch (EN/AR) (§9)

2. **Feature modules** — Oil Lubrication & Analysis, Vibration Analysis,
   Reliability Measurements, Compressors, and any future module. Each:
   - Has its **own settings sheet(s) and data sheet(s)**, never shared
     with another module or with Platform Core.
   - Has its **own Apps Script Web App deployment** (own URL/endpoint) —
     see §4.
   - Reads shared reference data (users, roles, asset list) from Platform
     Core via API calls, but never writes into Platform Core's sheets
     directly, and Platform Core never writes into a module's sheets.
   - Can be stopped, upgraded, or broken **without taking down Platform
     Core or any other module.**
   - Registers itself with Platform Core (module name, its endpoint URL,
     enabled/disabled state) so Platform Core's admin/settings screen and
     navigation can list it dynamically — **this is how new modules get
     added later without changing the core platform structure.**
     **[PROPOSED mechanism — a `MODULE_REGISTRY` sheet in Platform Core
     admins can edit to turn a module on/off/point at a new URL.]**

This satisfies, together: module standalone isolation, multiple
communication channels (each module's Apps Script deployment is a
separate channel/quota bucket), and "add modules later without changing
the core." **[decided, §9 & §10 of notes]**

---

## 4. Module communication channels

Each module (Platform Core included) is a **separate Google Apps Script
Web App deployment**, bound only to its own spreadsheet(s). Consequences:

- Traffic to Lubrication never contends with traffic to Vibration or to
  Platform Core — each has its own Apps Script execution quota.
- A bug or outage in one module's script cannot break another module's
  script — they are entirely separate deployments.
- The PWA frontend calls whichever module's endpoint it needs; Platform
  Core's endpoint is called for anything cross-cutting (login, user list,
  asset list, notifications).

**[decided — confirmed by user, round 9 of notes, as matching their
"multiple channels" requirement]**

---

## 5. Authentication

- App has its **own login screen**: email + password. Not tied to Google
  account sign-in, even though the backend lives on Google infrastructure.
- **App Admin adds users by email.** On creation, a **password is
  auto-generated** by the system. The user **changes it** on/after first
  use (a forced-change-on-first-login flow is the natural implementation
  — **[PROPOSED]**, not explicitly specified either way by the user).
- **Login security (v1): kept simple.** No auto-logout on inactivity, no
  2FA, no failed-login lockout for v1. Plain email+password is sufficient
  for now. **[decided, §8 of notes]**

---

## 6. Roles & permissions (RBAC)

### 6.1 Roles (v1 target set)

- **App Admin** — full platform control (see §6.3).
- **Technician** — field data entry (RHI/ASEC).
- **Contractor Engineer** (the role the user described as "Supervisor /
  Team Lead," clarified to specifically mean the contractor-side engineer
  overseeing technicians — not a generic supervisor title).
- **Reliability Engineer**
- **Manager** (ACC or Contractor)

A user account can hold **more than one role at once** (e.g. Reliability
Engineer + Manager-level approval) — permissions combine. RBAC design is
many-to-many user↔role, not one-role-per-user. **[decided, §8 of notes]**

### 6.2 Organization tagging

Every user is tagged with an organization: **ACC, RHI, or ASEC.** **App
Admin manually assigns** this when creating the account — no automatic
detection from email domain. Equipment/points are also tagged with a
Contractor (RHI/ASEC) in the real asset data, so org-based data scoping is
possible (e.g. an RHI Technician's default working set = RHI-tagged
equipment) — exact scoping rules are part of the permission model below,
to be populated with real values once each module is designed.
**[decided, §7 of notes]**

### 6.3 Permission granularity — full granular control **[decided, §4 of notes]**

You confirmed the platform needs **full granular, admin-controlled
permissions**, not a simplified role+org model — you noted there's a
specific reason for this that hasn't been elaborated yet. The proposed
structure (adapted from the prior doc set, which had already modeled this
in detail) is a chain of permission layers, each admin-editable, evaluated
top to bottom (a denial at any layer blocks access, nothing is accessible
without an explicit grant):

```
Organization  →  Role  →  Module  →  Screen/Tab  →  Feature  →  Action
   (ACC/RHI/       (Admin/Tech/    (Lubrication/    (e.g.        (View/
    ASEC)           Engineer/...)  Vibration/...)    "Overdue     Create/
                                                       Tasks" tab)  Edit/
                                                                    Approve/
                                                                    Delete)
        ↓
   Data Scope (which records: own org's equipment? all equipment?)
        ↓
   Field Permission (optional: which individual fields are editable)
```

**[PROPOSED — supporting Sheets in Platform Core]**: `ROLE_MASTER`,
`MODULE_MASTER`, `MODULE_TAB_MASTER`, `FEATURE_MASTER`, `ACTION_MASTER`,
`SCOPE_MASTER`, `ROLE_PERMISSION` (the assignment table tying a role to
what it can do, at whatever layer is needed — module/tab/feature/action/
scope/field). **Time-based access rules** (e.g. access only during
certain hours) were part of the prior model too — flagging this
explicitly: do you actually need time-of-day access rules, or was "full
granular control" mainly about the module/feature/action/field/scope
layers? Worth a direct answer before this gets built, since it's extra
complexity if unused.

App Admin manages all of this through the admin/settings screens in
Platform Core (create roles, assign permissions per layer, create
reusable "permission templates" to speed up assigning similar roles).

### 6.4 Audit trail

**Basic tracking only** — created-by / modified-by / date fields on
records. No full field-by-field change-history log for v1. (Separate
decision from permission granularity: RBAC controls who can do what: this
controls how much history is kept afterward.) **[decided, §8 of notes]**

---

## 7. Asset Master

Real equipment/point data already exists and has been reviewed directly
(`ACC_PLATFORM_ASSET_MASTER_DB_v3.xlsx`). This becomes the seed data for
Platform Core's Asset Master, three sheets:

**EQUIPMENT_MASTER** (1,892 rows today)
Equipment_ID, Equipment_Description, Main_Area, Plant_Area, Sub_Area,
Contractor (RHI/ASEC), Criticality, Parent_Equipment_ID, Equipment_Status,
Created_Date, Modified_Date.
- **Criticality:** keep field as-is; scale has **3 levels** conceptually
  (only 1 and 2 populated in current data). **[decided, §3 of notes]**
- **Equipment_Status:** app must support **Active** and **Inactive / Out
  of service** (confirmed set, round 11 — "Under maintenance" and
  "Decommissioned" were offered but not selected). **[decided, §11 of
  notes]**
- Main_Area values today: Line1, Line2, CM1, CM2. Plant_Area: 20 distinct
  areas (RawMill1/2, Kiln1/2, CementMill1-4, CoalMill1/2, PackingArea1/2,
  ClinkerArea1/2, RMCrusher, HotDisc, GyCrusher, AFR, Gypsum Conv,
  AFShredding).

**LP_POINT_MASTER** (924 rows today) — lubrication points, one equipment
can have several. Fields include Lubrication_Location, Point_Code,
Lubrication_Point, Position, Component_Brand, Operating_Temperature_C,
Lubricant_Type/Brand/Quantity, Oil_Analysis_Required + interval,
Oil_Change_Interval, Contractor, Status. (Detailed workflow for this data
belongs to the Oil Lubrication module spec, not this document — this is
just the shared reference data Platform Core holds.)

**VIB_POINT_MASTER** (1,765 rows today) — vibration points, one equipment
can have several. Fields include Position_Code (e.g. MDE/MNDE/FDE/CDE —
drive-end/non-drive-end location codes), Family (RMS/SPM/Gs — measurement
type), Point_Description, Status. **Confirmed: only points where
Family = RMS get 3-axis readings** (vertical, horizontal, axial); axis is
captured **per reading**, not as a property of the point itself.
**[decided, §3 of notes]** (Reading-level detail belongs to the Vibration
module spec, not this document.)

Asset Master data is **read by every module** (a module looks up "which
equipment/points am I working with") but **owned and edited only through
Platform Core's admin screens** — modules don't get their own copies of
equipment/point master data.

---

## 8. Offline & sync (PWA)

- The PWA **must work fully offline** for viewing assigned data and
  entering readings/tasks — critical given poor connectivity in kiln/mill
  areas. Data queues locally and **syncs automatically once connection
  returns.** **[decided, §2 of notes]**
- **[PROPOSED mechanism]**: local browser storage (IndexedDB) holds a
  queue of pending writes plus a cached copy of the user's relevant
  reference data (their assigned equipment/points, current module
  settings). On reconnect, the PWA replays the queue against the relevant
  module's Apps Script endpoint. Basic conflict handling: last-write-wins
  by default, with the option to flag true conflicts (same record edited
  both offline and by someone else in the meantime) for manual review —
  exact conflict rules can be refined per module as each is designed.
- Devices in the field: **mix of smartphones, tablets, and laptops** —
  responsive layout required across all three; offline matters most for
  phone/tablet use in-plant. **[decided, §6 of notes]**

---

## 9. Notifications & localization

- **Notifications:** in-app notifications/dashboard **and** push
  notifications (PWA). No email notifications requested. **[decided, §5
  of notes]** (Flagging a real constraint, not asking you to decide
  anything now: iOS Safari's support for PWA push notifications is
  limited/version-dependent — this may affect iPhone users specifically;
  worth knowing about when we get to testing on real devices.)
- **Language: full bilingual English + Arabic**, with RTL layout for
  Arabic, user-switchable. **[decided, §5 of notes]**
- What actually triggers a notification (which events, for which
  roles/orgs) is **module-specific** and deferred to each module's own
  spec — Platform Core just provides the shared delivery mechanism.

---

## 10. Admin-configurable operational controls

A recurring pattern in your answers: rather than hard-coding operational
policy, put it in App Admin settings so it can be tuned without a code
change:

- **Data-size alarm:** admin sets a threshold; when a module's data
  approaches a size/performance concern (Google Sheets' practical limits),
  the app flags it. No automatic archiving built for v1 — handled if/when
  it actually happens. **[decided, §9 of notes]**
- **Backup schedule:** automatic scheduled backups of the Sheets data,
  with the **frequency adjustable in App Admin settings** (e.g. daily/
  weekly). **[decided, §11 of notes]**
- **[PROPOSED]** Both of these live in a Platform Core `ADMIN_SETTINGS`
  sheet, editable through an admin screen — consistent with the
  settings-vs-data separation requirement (§11 below).

---

## 11. Settings vs. data separation

- The database **separates app settings from app data** platform-wide, to
  avoid data damage. **[decided]**
- **Every module (Platform Core included) has its own settings sheet(s)
  and its own data sheet(s)** — settings and data are never mixed in the
  same sheet, and modules never share sheets with each other or with
  Platform Core. **[decided]**

---

## 12. Prior-documentation conflicts — resolution record

A prior AI-authored 93-file doc set + non-functional prototype was
supplied for reference (`docs/requirements-notes.md` has the full digest).
Per your instruction, it was treated as a guideline only. Resolutions
reached, all already reflected above:

| Conflict | Resolution |
|---|---|
| Prior docs assumed 50–100 users | **20–40 confirmed** as correct |
| Prior docs allowed modules to share sheets/deployments; single shared identity DB for everything | **Rejected** — your standalone-module requirement stands |
| "Compressors" / "Reliability measurements" modules absent from prior docs | Nothing inherited — both deferred, to be designed from scratch later |
| Hosting never actually closed in prior docs | **Resolved here: GitHub Pages** |
| Prior docs' Oil Lubrication scope (full inventory etc.) vs. your original narrower description | **Full scope confirmed** as the real target |
| Prior docs' 9-level RBAC | **Confirmed as the real target**, not simplified |
| Old prototype's visual design | **Not reused** — fresh UI design |

---

## 13. Explicitly open / deferred (not part of this sign-off)

- Every feature module's detailed fields/screens/workflows (Oil
  Lubrication & Analysis first, then Vibration Analysis, Reliability
  Measurements, Compressors, and any future module) — each gets its own
  dedicated discussion and spec.
- Exact permission matrix values (which role can do which action on which
  screen) — populated per module as each is designed.
- Whether time-of-day access rules are actually needed (see §6.3 — needs
  a direct answer).
- Exact notification trigger list per module.
- Branding/visual identity (logo, colors) — not discussed yet, needed
  before real UI design work.
- Oil Analysis lab-report intake mechanism (upload + manual entry vs. some
  form of automated extraction) — belongs to the Oil Lubrication & Analysis
  module spec.

---

## 14. What sign-off on this document means

Approving this document means:
1. The architecture in §2–§4 (GitHub Pages + per-module Apps Script +
   Google Sheets, module isolation model) is authorized to be built.
2. Platform Core (auth, roles/permissions structure, asset master,
   notifications engine, admin settings, language switch) is authorized
   to be built, per §5–§11.
3. **No feature module (Lubrication, Vibration, etc.) starts implementation
   yet** — those still need their own requirements discussion first.
4. Items marked **[PROPOSED]** above are Claude's technical design choices
   made to satisfy your stated requirements — please explicitly confirm or
   redirect those, not just the items already marked "decided."
