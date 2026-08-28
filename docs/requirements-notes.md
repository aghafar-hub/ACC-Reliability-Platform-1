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
