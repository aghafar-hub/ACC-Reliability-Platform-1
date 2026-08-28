# ACC Reliability Platform — Requirements Notes (Live Draft)

> Running notes captured directly from the requirements discussion with the
> Reliability Manager. This file is appended to as the discussion continues,
> and will later be split into proper specs (architecture, module specs,
> data model, etc.) once the discussion is complete.

## Organization / context

- Company: **Arabian Cement Company (ACC)**
- Location: **Sokhna plant, Egypt**
- Requester: Reliability Manager of the plant
- Plant is operated & maintained by **two contractor companies**, each
  responsible for half the plant:
  - **RHI**
  - **ASEC**
  - (Implication: data, work, and possibly permissions/roles likely need to
    be attributable/separable by contractor/area — to be confirmed.)

## Product shape

- **Web app + mobile app**, both for the plant's Reliability section.
- Purpose: track and act on reliability data, and make plant reliability
  work easier/faster.

## Modules (module-based platform)

- The app is organized into **modules**, each covering a distinct
  reliability discipline. Modules named so far:
  1. Oil lubrication and analysis
  2. Vibration analysis
  3. Reliability measurements
  4. Compressors
  5. (more modules to be decided in the future — platform must support
     adding new modules later without redesigning the core)

## Architecture requirements (critical constraints)

- **Hosting:** GitHub (app hosted on GitHub — implies static/GitHub Pages
  style hosting or GitHub-based deployment; exact hosting mechanics TBD).
- **Database:** Google Drive — specifically **Google Sheets** act as the
  data store.
- **Modular isolation (critical):**
  - Each module must be **standalone** so the platform does not crash as a
    whole if one module has an issue.
  - Each module has its **own sheet(s)** in the Google Sheets database —
    not a shared/monolithic sheet.
  - Must be possible to **maintain, stop, or upgrade a single module**
    independently, without affecting the rest of the platform.
- **Communication with the database:**
  - The app must use **several/multiple channels of communication** with
    the Google Sheets database.
  - Goal: avoid **heavy load** on any single channel and avoid the app
    becoming **heavy/slow** overall.
  - (Implication: likely per-module API/connection channels rather than one
    central data-access layer for everything — to be confirmed as design
    progresses.)
- **Settings vs. data separation (critical):**
  - The database must **separate app settings from app data**, to avoid
    data damage.
  - **Each module** must have its **own settings sheet(s)** and its own
    **data sheet(s)** — settings and data are never mixed in the same
    sheet, and modules never share sheets with each other.

## Authentication & user management

- App has its own **login screen**: email + password (not necessarily tied
  to Google account login, despite Google Sheets backend — to be confirmed).
- **App Admin** can **add any user by email**.
- On creation, a **first password is auto-generated** by the system.
- The **user can change their password** afterward (implies a forced/first
  password-change flow is likely expected — to be confirmed).

## Roles & permissions (admin-controlled)

- **App Admin defines each user's role.**
- **App Admin controls access to everything** — i.e. fine-grained,
  admin-managed permissions covering:
  - Who can access what (modules, screens, data).
  - Who can control/do what (create/edit/approve/delete actions).
- (Implication: this points to a **role-based access control (RBAC)**
  system, likely configurable per module too, not just platform-wide — to
  be confirmed as modules are defined. Also ties back to the RHI/ASEC
  contractor split noted earlier — roles/access may need to reflect which
  contractor a user belongs to.)

## User base (organizations)

- Users will come from **three organizations**:
  1. **ACC** (Arabian Cement Company — the plant owner)
  2. **RHI** (contractor, half the plant)
  3. **ASEC** (contractor, other half of the plant)
- The **specific role of each organization/user, and how communication/
  workflow between them happens, will be defined together later** (i.e.
  still open — not fully specified yet, explicitly deferred by the user to
  a later part of the discussion).

## Decisions made (via Q&A round 1)

- **Backend:** Google Apps Script will serve as the backend (runs inside
  Google's infra next to the Sheets; handles auth, permission checks, and
  safe writes to Sheets — a static GitHub Pages site alone cannot do this
  securely since it can't hold secrets or run server logic).
- **Mobile app:** A **mobile-friendly web app (PWA)** — same web app,
  responsive, "add to home screen" — not a separate installable
  Android/iOS build. No offline mode implied by this choice (to revisit if
  connectivity in kiln/mill areas turns out to be a problem).
- **Scale:**
  - **20–40 users max.**
  - **~2,000 pieces of equipment**, already listed/prepared.
  - Equipment already broken down into **lubrication points** and
    **vibration points** — one equipment can have **multiple** lubrication
    points and **multiple** vibration points each (i.e. points are a
    finer-grained sub-asset under each equipment, not 1:1 with equipment).

## Decisions made (via Q&A round 2)

- **Offline requirement (mobile/web PWA):** App **must work offline** —
  users can view assigned points and enter readings/data with no signal;
  data queues locally and **syncs automatically once connection returns**.
  This is a hard requirement given plant areas (kiln, mills, crusher) with
  poor connectivity. (Significant implication for architecture: needs
  local storage + sync/conflict-handling logic in the PWA, on top of the
  Google Apps Script backend.)

- **Lubrication module — workflow:**
  - Track the **lubrication schedule** — covering both:
    - **Changing** (routine lubricant change/top-up per schedule), and
    - **Analysis** (oil sample analysis results).
  - (Exact wording from user: "Track lubrication schedule (changing or
    analysis)". Still need finer detail: fields captured, frequency/interval
    definition, who logs it, overdue handling, pass/fail criteria for
    analysis — to be discussed further.)

- **Vibration Analysis module — workflow:**
  - For **each vibration point**, record readings in multiple axes:
    **vertical, horizontal, "so on"** (i.e. likely also **axial** — the
    standard third axis — to be confirmed explicitly, not assumed).
    (Still need finer detail: units, alarm thresholds, how readings are
    captured — manual entry vs device import, frequency of measurement —
    to be discussed further.)

- **Equipment structure:** A structured hierarchy **already exists** for
  the ~2,000 equipment list. User will **share the actual file** for
  reference rather than describe it verbally. **Action item: waiting on
  user to share the equipment/hierarchy file.**

## Prior work supplied by user (2026-08-28)

User previously used another AI agent to produce project documentation and
a prototype, plus a real equipment export. Treated as **guideline only,
not fully trusted** — we keep verifying independently with the user rather
than inheriting it silently.

- `Reliability_app.zip` — 93 files: ADRs, platform/database/module
  standards, test standards, project-management session logs, and a
  working HTML/JS/CSS prototype (`11_PROTOTYPE/SESSION_07_HIGH_RISK_PROTOTYPE/`).
  A background review agent is digesting this for tech-stack choices,
  proposed module data models, proposed security/RBAC model, open items
  the prior AI itself flagged, and conflicts with what ACC's reliability
  manager has told us directly. Findings to be added here once back.
- `ACC_PLATFORM_ASSET_MASTER_DB_v3.xlsx` — **real exported equipment data**,
  inspected directly (3 sheets):
  - **EQUIPMENT_MASTER** — 1,892 rows. Columns: Equipment_ID,
    Equipment_Description, Main_Area, Plant_Area, Sub_Area, Contractor,
    Criticality, Parent_Equipment_ID, Equipment_Status, Created_Date,
    Modified_Date.
    - Main_Area values: Line1 (583), Line2 (477), CM1 (431), CM2 (401).
    - Plant_Area values (20): RawMill1/2, PackingArea1/2, CementMill1-4,
      Kiln1/2, CoalMill1/2, ClinkerArea1/2, RMCrusher, HotDisc, GyCrusher,
      AFR, Gypsum Conv, AFShredding.
    - Contractor: RHI 1,060 / ASEC 832 — **confirms the RHI/ASEC split is
      recorded per-equipment**, not just per-user.
    - Criticality: only values seen are 1 (72) and 2 (1,820) — meaning of
      the scale (binary critical/non-critical? or a larger scale with only
      1–2 populated so far?) not yet confirmed.
    - Equipment_Status: only "Active" appears in the export — other
      possible values (Inactive/Decommissioned/etc.) not yet confirmed.
    - Equipment_ID format example: `111.AF040` (area-code.tag). Has
      Parent_Equipment_ID for parent/child equipment relationships.
  - **LP_POINT_MASTER** (lubrication points) — 924 rows. Columns: LP_ID,
    Equipment_ID, Lubrication_Location, Point_Code, Lubrication_Point,
    Position, Component_Brand, Operating_Temperature_C, Lubricant_Type,
    Lubricant_Brand, Lubricant_Quantity_L, Oil_Analysis_Required,
    Oil_Analysis_Interval, Oil_Change_Interval, Contractor, LP_Status,
    Created_Date, Modified_Date, Source_Row, Source_LP_ID.
    - Oil_Analysis_Required: Yes 140 / No 784 — only points flagged "Yes"
      have an Oil_Analysis_Interval; others may instead have an
      Oil_Change_Interval (e.g. "2 Y"). Confirms the module needs to
      handle **two distinct schedules per point** (change vs. analysis),
      matching what the user said earlier, but exact rule for
      which applies when isn't fully clear yet from the data alone.
    - Contractor: ASEC 463 / RHI 461 — again split per point.
  - **VIB_POINT_MASTER** (vibration points) — 1,765 rows. Columns: VIB_ID,
    Equipment_ID, Position_Code, Family, Point_Description, VIB_Status,
    Created_Date, Modified_Date.
    - Family values: RMS 817 / SPM 759 / Gs 189 — these look like
      **measurement-type families** (e.g. RMS velocity, SPM/shock-pulse
      for bearing condition, Gs/acceleration), not axis labels.
    - Position_Code values (20, e.g. MDE/MNDE/FDE/FNDE/CDE/CNDE/BLDE/...) —
      look like **motor/fan/coupling/bearing drive-end vs non-drive-end**
      location codes.
    - **No axis field (vertical/horizontal/axial) exists in the point
      master at all.** This appears to conflict with the user's earlier
      statement that "each vibration point we record vertical, horizontal,
      so on" — it looks more like axis (V/H/A) would be captured per
      *reading*, layered on top of a point that already encodes location
      (Position_Code) + measurement family (RMS/SPM/Gs), rather than axis
      being a property of the point itself. **Needs explicit confirmation
      from the user — not to be assumed.**

## Decisions made (via Q&A round 3 — spreadsheet clarifications)

- **Vibration axis:** Confirmed — **only points where Family = RMS** get
  three-axis readings (vertical, horizontal, axial). SPM and Gs families
  are not necessarily 3-axis (exact structure for those still to confirm
  if needed later).
- **Criticality scale:** Keep the field **as-is for now**, but the
  intended scale has **3 levels** (current export only populates 1 and 2;
  level 3 exists conceptually but isn't used in the data yet).
- **Equipment status:** Confirmed — **must support multiple statuses**
  (not just "Active"). Exact status list (Inactive, Decommissioned, Under
  Construction, etc.) still to be defined.

## Prior AI doc-set digest — key findings & conflicts (background review)

A background review of the full 93-file prior doc set + prototype came
back. Full findings below; **per the user's instruction, this is a
guideline only — anything that conflicts with what the user told me
directly is flagged for the user to resolve, not silently inherited.**

**Matches / reusable:**
- Backend = Google Apps Script, DB = Google Sheets, Drive = file storage
  — matches our ground truth.
- PWA (not native), offline-capable — matches our ground truth.
- Vibration reading model (Reading_Direction: Horizontal/Vertical/Axial)
  — matches the round-3 clarification above.
- Org/contractor model (ACC/RHI/ASEC, "Contractor Isolation") broadly
  compatible with what the user described.
- Auth model (email+password, admin-generated first password,
  Must_Change_Password flag) — matches what the user described.
- A **prototype UI exists** (React+TS style, but built as static HTML/JS
  for demo): role-adaptive dashboard, My Work/Review queue, Oil
  Lubrication offline package + sync/conflict simulation, Oil Analysis OCR
  review grid, Vibration Alert/Danger review, Owner Center admin config,
  EN/AR bilingual + RTL toggle, light/dark theme, responsive layouts.
  **Explicitly non-functional** (no real backend/auth/Sheets/offline — all
  simulated in-browser, resets on reload). Useful only as a **visual/UX
  reference**, not reusable code.

**Conflicts / gaps to resolve with the user (not yet resolved):**
1. **User scale mismatch:** prior docs assume **50 expected / 100 max
   users**, everywhere (capacity, test plans, etc.) — conflicts with what
   the user told me directly (**20–40 users**). Need to confirm 20–40 is
   correct and disregard the prior sizing assumption.
2. **Module isolation directly contradicted:** prior docs (PF-017)
   explicitly say modules *may* share spreadsheets/deployments "when
   separation would add complexity without operational benefit," and
   identity/auth is one shared database for all modules. This is the
   **opposite** of the user's explicit hard requirement (each module gets
   its own settings+data sheets; one module's failure must not crash the
   rest). **User's stated requirement stands — flagging the conflict, not
   changing course.**
3. **"Compressors" and "Reliability measurements" modules are absent**
   from the prior doc set — "Compressors" isn't mentioned at all;
   "Reliability measurements" appears to map to a "Reliability
   Engineering" module that the prior effort explicitly **excluded** from
   v1. Nothing to inherit for these two modules — user still wants them
   per earlier conversation, will need to be defined from scratch.
4. **Hosting decision was never actually closed** in the prior docs
   despite being flagged as critical — "GitHub Pages" appears once in a
   draft doc, not in any frozen/approved doc; the prior project's own
   tracking lists hosting as an unresolved blocker. Needs a fresh decision
   here (frontend static hosting choice, on top of the already-agreed
   Google Apps Script backend).
5. **Oil Lubrication module scope creep:** prior docs define a
   **much larger** scope than "track lubrication schedule (changing or
   analysis)" — full route scheduling/assignment/execution, oil
   **inventory management** (receiving, storage, stock transfers,
   consumption tracking, forecasting, purchase planning), shutdown
   lubrication planning, cost management. **Needs explicit confirmation:
   does the user want this full scope, or just schedule/task tracking as
   originally described?**
6. **RBAC complexity:** prior docs propose a **9-level permission
   hierarchy** (Company → Role → Module → Tab → Feature → Action → Data
   Scope → Time Rule → Field Permission) with many supporting tables —
   likely over-built for a 20–40 user internal tool. **Needs explicit
   confirmation: does the user want this level of granularity, or a
   simpler role/org-based model?**
7. **Criticality scale in prior docs:** only defines 2 levels
   (1=High, 2=Medium, no "Low") — user has now confirmed (round 3 above)
   the real scale has 3 levels, so prior docs are incomplete here too.
8. General pattern: several "decisions" in the prior docs' own
   Q&A log look like the **prior AI proposing and then recording its own
   proposal as confirmed**, rather than a clear independent user
   confirmation. Treat anything load-bearing from those docs as a
   proposal to re-confirm, not an established fact.

## Decisions made (via Q&A round 4 — resolving prior-doc conflicts)

- **User count confirmed: 20–40** (the prior docs' 50–100 assumption is
  disregarded).
- **Oil Lubrication module scope: FULL scope wanted**, including
  everything the prior docs described — route scheduling/assignment/
  execution, oil **inventory management** (receiving, storage, stock
  transfers, consumption tracking, purchase forecasting), shutdown
  lubrication planning, cost management — not just schedule tracking.
  (This significantly expands the module beyond the original "track
  lubrication schedule" description — treat the prior docs' DB-003/MS-003
  scope as the real target scope for this module, subject to further
  detailed discussion.)
- **RBAC depth: full granular control needed** — the 9-level permission
  hierarchy (Company → Role → Module → Tab → Feature → Action → Data
  Scope → Time Rule → Field Permission) from the prior docs (DB-002) is
  confirmed as the target model, not simplified down. (User confirmed
  there is a real reason for this level of control — not yet elaborated,
  may come up later.)
- **UI/visual design: fresh design**, not based on the old prototype's
  look. The old prototype remains a background reference only for what
  screens/flows exist conceptually, not for visual style.

## Decisions made (via Q&A round 5)

- **Google Workspace: ACC has a company Google Workspace account.** The
  app's Sheets/Drive/Apps Script backend will live under that org (not a
  personal/free Google account) — important for account provisioning,
  data ownership, and IT involvement.
- **Approval flow: varies per module** — not a single platform-wide rule.
  Each module needs its own definition of what's auto-accepted vs. needs
  ACC review/approval. To be defined module by module as each module is
  discussed in detail.
- **Notifications:** **in-app notifications/dashboard + push notifications
  (PWA)**. Email notifications not requested. (Note: PWA push notifications
  have platform caveats — e.g. iOS Safari support is limited/version-
  dependent — to flag during design, not now.)
- **Language: full bilingual English + Arabic, with RTL layout for
  Arabic.** Users can switch language.

## Decisions made (via Q&A round 6)

- **Build order:** Build the **shared platform foundation first**
  (Asset Master + login/admin/RBAC), THEN add modules one at a time on
  top of it. First module after the foundation: **Oil Lubrication & Oil
  Analysis**. **Hard requirement restated: the platform must support
  adding future modules without changing the core platform structure**
  (reinforces the earlier module-isolation requirement).
- **Reliability measurements module:** deferred — will be designed later,
  after the foundation + lubrication/oil analysis module. Not to be
  detailed now.
- **Compressors module:** deferred — not fully decided yet, will describe
  later.
- **Field devices:** technicians will use a **mix of smartphones, tablets,
  and laptops at fixed stations** — confirms the app must be responsive
  across phone/tablet/desktop screen sizes, and offline support matters
  most for the phone/tablet (mobile, in-plant) use case.

## Decisions made (via Q&A round 7)

- **User roles (v1 target set):**
  - **Technician** (field data entry — RHI/ASEC)
  - **Supervisor / Team Lead** — clarified by user as effectively the
    **"Contractor Engineer"** role (i.e. this role = contractor-side
    engineer overseeing technicians, not a separate generic supervisor)
  - **Reliability Engineer**
  - **Manager (ACC / Contractor)**
  - (Plus the previously-established **App Admin** role, handled
    separately from this list.)
- **Org assignment (ACC/RHI/ASEC):** **Admin manually assigns** each
  user's organization when creating the account — no automatic detection
  from email domain.
- **Oil Analysis intake:** Today, results come from an **external lab as
  a report (PDF/Excel) per sample**. The app needs to capture/attach these
  lab reports (implies file upload + likely need to extract or manually
  transcribe key values from the report — exact mechanism, e.g. OCR vs.
  manual entry alongside the attached file, still to be detailed when this
  module is designed).
- **Timeline:** target **one month max** for v1 (foundation + Oil
  Lubrication/Analysis module), but **quality takes priority over
  speed** — one month is a soft target, not a hard cutoff to rush for.

## Decisions made (via Q&A round 8)

- **Frontend hosting: GitHub Pages** (Claude's recommendation, accepted by
  user). Free static hosting served directly from the GitHub repo — matches
  the original "hosted on GitHub" requirement exactly, simplest to explain
  and operate, and pairs cleanly with the already-agreed Google Apps
  Script backend (API/auth/Sheets access) and Google Sheets database.
  **This closes the hosting decision that the prior AI's docs left open.**
- **Audit log: basic tracking only** — created-by / modified-by / date
  fields on records. **No full field-by-field change-history log** despite
  the full-granular-RBAC decision (these are separate concerns: RBAC
  controls who can do what; this decision is about how much history is
  kept afterward).
- **Multi-role users: allowed.** A single user account can hold more than
  one role at once, combining permissions (e.g. Reliability Engineer +
  Manager-level approval). RBAC design must support many-to-many
  user↔role, not one-role-per-user.
- **Login security (v1): none of the extras needed.** No auto-logout on
  inactivity, no 2FA, no failed-attempt lockout for v1 — plain
  email+password login is sufficient for now.

## Decisions made (via Q&A round 9)

- **Multi-channel design confirmed:** Each module gets its **own Google
  Apps Script Web App deployment** (its own endpoint/URL), bound only to
  its own Sheets. This simultaneously satisfies (a) "multiple channels of
  communication to avoid overload" and (b) module standalone isolation —
  one mechanism serves both requirements. **User confirmed this matches
  their intent.**
- **Data retention/archiving:** No fixed retention policy decided now.
  Instead, **App Admin will get a configurable alarm/threshold setting**
  (in admin settings) that flags when a module's data is approaching a
  size/performance concern, to be handled **if/when it actually happens**
  — not pre-built archiving logic for v1.
- **Formal spec requested:** User wants a **written architecture/
  requirements document** consolidating everything decided so far, to
  **review and formally sign off on before any code is written.** This
  supersedes the earlier "keep it conversational" default — a real spec
  deliverable is now expected as the next step.

## Decisions made (via Q&A round 10)

- **Shared "Platform Core / Services" layer confirmed:** while each
  feature module (Lubrication, Vibration, Compressors, etc.) keeps its
  own isolated settings+data sheets and its own Apps Script channel (per
  earlier decisions), things that are inherently **cross-cutting** —
  e.g. **notifications** and **settings/admin framework** — should live as
  **general shared services inside the main platform core**, rather than
  every module re-implementing its own version. i.e. the platform has a
  **Platform Core** (users/roles/auth, asset master, notifications engine,
  admin/settings framework, language switch, etc.) that all feature
  modules plug into, alongside their own isolated module-specific data.
  **This is a refinement of the isolation requirement, not a reversal**:
  module *business data* stays isolated; shared *infrastructure services*
  are centralized once and reused.
- User asked Claude to recommend what else might be missing before
  writing the spec (see below) rather than listing more items themselves.

## Decisions made (via Q&A round 11)

- **Spec scope confirmed: foundation-only for now.** The formal spec will
  cover the Platform Core (architecture, hosting, auth, RBAC, asset
  master, multi-channel/module-isolation design, shared services). Oil
  Lubrication & Analysis (and every other module) gets its own dedicated
  Q&A round and its own spec chapter/addendum later, not bundled into
  this first spec.
- **Equipment statuses (v1): Active and Inactive / Out of service only.**
  (User selected these two specifically from the offered options; "Under
  maintenance/Shutdown" and "Decommissioned/Removed" were offered but not
  selected — treat the status list as exactly these two unless the user
  adds more later.)
- **Backups: automatic scheduled backups, with the schedule/frequency
  adjustable in App Admin settings.** (Consistent with the earlier
  decision to make data-size alarms configurable in admin settings too —
  admin-configurable operational controls are a recurring pattern.)

## Decisions made (round 12 — spec review feedback)

User reviewed the Foundation Specification draft and flagged a missing
**hard data-isolation rule**, now added to the spec (§6.2/§6.3):

- **Every equipment is assigned to exactly one O&M contractor** (already
  true in the real data — Contractor field RHI/ASEC on EQUIPMENT_MASTER).
  Lubrication/vibration points inherit their equipment's contractor.
- **A contractor's users can never see the other contractor's equipment
  or any related data** (readings, tasks, history, files) — a hard
  boundary, not just a default filter, enforced server-side in every
  module, not just per-module.
- **All ACC users can see all data for both contractors** — ACC has no
  contractor-based visibility restriction.
- This is now specified as the concrete implementation of the "Data
  Scope" layer of the RBAC model (§6.3 of the spec), applying
  automatically to every module including future ones.

## Round 13 — second prior-AI document (APP-008) reviewed

User supplied `APP-008_COMPLETE_APPLICATION_CONSTRUCTION_AND_RULES_SPECIFICATION.md`,
a much more mature/detailed consolidated spec from the same prior AI
effort. Read carefully; compared against everything decided so far.

**Adopted directly (plain facts, no conflict, folded into the spec):**
- Timezone Africa/Cairo, date format DD/MM/YYYY, 24-hour time, metric
  units, default language English (bilingual switch stands).
- Navigation IA: Dashboard + My Work + Assets + Module Workspaces +
  Reports + Owner Center **[PROPOSED, not yet explicitly confirmed]**.
- Visual direction "Structured Industrial" (professional, dense, no emoji
  icons) — a style direction, not the rejected prototype's actual design;
  consistent with "design fresh." **[PROPOSED]**.
- Confirms contractor isolation is absolute/backend-enforced — matches
  what the user told me directly (round 12).

**Conflicts raised and resolved (user chose in every case to keep the
prior decision from our own discussion, declining APP-008's version):**
1. **Roles:** APP-008 proposes 7 granular roles (App Owner, ACC Manager,
   ACC Engineer, Contractor Manager, Contractor Section Head, Contractor
   Engineer, Contractor Technician). **Declined — the 5-role list from
   round 7 stands** (Technician, Contractor Engineer, Reliability
   Engineer, Manager ACC/Contractor, App Admin).
2. **Audit depth:** APP-008 requires full state-transition audit (actor/
   timestamp/reason/prev-state/new-state) on every approval/correction/
   rejection/closure. **Declined — basic created-by/modified-by tracking
   from round 8 stands.**
3. **Session/device limits:** APP-008 specifies max 3 devices/user + 30-
   min idle auto-logout. **Declined — "no login security extras for v1"
   from round 8 stands.**
4. **Offline build sequencing:** APP-008 sequences offline/sync as a later
   phase (after Oil Lubrication's online workflow ships). **Declined —
   offline/sync is built into the Foundation itself, before any module
   ships, per the original round-2 hard requirement.**

## Round 14 — foundation gaps closed

- **First password delivery:** admin sees the auto-generated password on
  screen when creating the user and **relays it manually** (in person,
  phone, WhatsApp, etc.) — no email system needed for this.
- **Password recovery:** **admin manually resets** a locked-out user's
  password the same way — no self-service email reset flow needed. (Both
  of these mean **no transactional email sending is required for auth at
  all** — consistent with "no email notifications" from round 5.)
- **Data migration:** user asked for Claude's recommendation. **Decision:
  build a lightweight guided import tool** (not a one-off manual load) as
  part of Asset Master admin functionality — App Admin uploads the
  Excel/CSV, previews the rows, confirms, and it loads into
  EQUIPMENT_MASTER/LP_POINT_MASTER/VIB_POINT_MASTER. Rationale: the
  equipment list will keep changing over time (new equipment, status
  changes, criticality updates), so a reusable import path is worth the
  modest extra upfront cost rather than a fragile one-time manual data
  entry that's hard to verify. Kept intentionally **simpler** than the
  prior AI docs' elaborate import workflow (no formal new/changed/
  duplicate classification engine for v1) — just upload, preview, confirm.
- **Environments: single production setup**, tested carefully before
  go-live — no separate permanent Test environment. Matches the 1-month
  timeline and 20-40 user scale.

## Open items (not yet discussed / to ask about later)

- Full list of modules planned (beyond the 4 named so far) and their
  specific fields/workflows.
- User roles & permissions — especially how RHI vs ASEC contractor split
  affects access/visibility/data ownership.
- Specific workflows per module (e.g., what "vibration analysis" module
  needs to capture/do day to day).
- Mobile app: offline use, device types, barcode/QR, photo capture, etc.
- Authentication (Google account based, given Google Drive backend?).
- Scale expectations: number of users, data volume/frequency of entries,
  number of equipment/assets.
- Reporting/dashboard/KPI expectations per module and platform-wide.
- Alerting/notifications needs.
- Branding/UI language (Arabic/English), localization.

---
*Status: discussion in progress — user is still explaining full picture.
Do not start implementation until user signals they are done and questions
have been asked/answered.*
