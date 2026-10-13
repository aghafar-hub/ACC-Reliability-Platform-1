# ACC Reliability Platform — Design System & Build Book

**Who this is for:** an AI assistant (or a developer) asked to build a **new
app or module** that must look, sign in and behave exactly like the existing
ACC Reliability Platform: same login, same logo, same five themes, same
phone (PWA) design, same permissions.

**How to use it:** read §0 and §1 first, then the sections your task needs.
Every rule names the file that implements it — open that file and copy the
pattern. Never invent a new pattern when one exists here. Where this book
and the code disagree, the code wins; fix this book in the same change.

Companion documents (more detail on one subject):

| Document | Covers |
|---|---|
| `docs/design-reference.md` | Page-level rules, the component table, phone rules — the Oil Lubrication module is the reference implementation |
| `docs/platform-foundation-spec.md` | Platform Core: users, orgs, roles, sessions |
| `docs/settings-access.md`, `docs/module-settings.md` | Settings page and who sees what |
| `docs/arabic-word-list.md` | Arabic translation word list |
| `docs/deployment-guide.md`, `docs/test-copy-setup.md` | Apps Script deploy, live vs test copy |
| `docs/performance.md` | Startup bundle, device cache, packed answers |
| `CLAUDE.md` | Branch rules (live auto-deploys; test copy first; public repo) |

---

## 0. The golden rules (never break these)

1. **One login for everything.** Users sign in once, to Platform Core. A new
   app never has its own login screen, user table or password. It receives
   the Platform Core session token and its backend verifies it (§3).
2. **One look.** Colours come only from the theme tokens (§4). All five
   themes must work: ACC Light (default), Warm Paper, High Contrast, Navy
   Dark, Carbon Dark.
3. **One shell.** A new module lives *inside* the platform shell (left rail
   + top bar + module tabs + phone bottom bar). It does not draw its own
   sidebar, top bar, logo, login, bell or account menu (§7, §18).
4. **Oil Lubrication is the reference.** For any page type, open the Oil
   page that does the same job and copy it (`apps/oil-analysis/src/pages`).
   Reuse the shared components by the same name and props (§8).
5. **Phone first-class.** Works at 360 px and 390 px wide, no sideways page
   scroll, no zoom, Back closes popups, 16 px inputs (§11).
6. **Status colours and symbols are fixed** and colour is never the only
   signal (§9).
7. **Access is decided by the server.** The frontend only hides what the
   server would refuse anyway (§14).
8. **Public repo:** never commit real company data, passwords, secrets or
   Apps Script URLs other than through build variables.
9. **Test copy first.** Work on `claude/test-site`; the live branch
   auto-deploys and is pushed only when the owner says so.

---

## 1. Two ways to build a "new app" — pick A

### A. A new module inside the platform (recommended, default)

The module is its own small React app (`apps/<module>/`) built as an
**embed bundle** and mounted by the shell after login — exactly how
Vibration Analysis and Oil Lubrication work. It gets for free: the login,
logo, themes, PWA install, offline banner, update prompt, bell, global
search, My Work, Plant overview, Arabic, Settings, Module Access, test copy
and deployment. Recipe: §18.

### B. A separate stand-alone site (only when the owner asks for it)

If it really must be another website, it still uses **Platform Core** for
login (same token, same users) and copies: `frontend/src/theme.ts` (five
themes), `index.css` tokens + fonts, `Auth.css` + `Login.tsx` (login look),
`public/brand`, `public/icons`, `public/splash`, the PWA block of
`frontend/vite.config.ts` (with a new `name`/`short_name`/`id`), the iOS
meta tags of `frontend/index.html`, `mobile/useBackClose.ts`,
`mobile/viewport.ts`, `mobile/UpdatePrompt.tsx`, `storagePrefix.ts`. Its
backend copies `Auth.js` (token check) and `ModuleAccess.js`. Everything
else in this book still applies.

---

## 2. Brand and logo

| Asset | File | Size | Used for |
|---|---|---|---|
| Full logo (leaf mark + "ACC" wordmark) | `frontend/public/brand/acc-logo-full.png` | 602×316, transparent | Login screen (max 220 px wide), expanded left rail (84 px tall, max 216 px wide) |
| Leaf mark only | `frontend/public/brand/acc-leaf-mark.png` | 448×746, transparent | Collapsed left rail (32×32 box) |
| Favicons | `public/icons/favicon-16.png`, `favicon-32.png` | 16, 32 | Browser tab |
| Apple touch icon | `public/icons/apple-touch-icon.png` | 180 | iPhone home screen |
| PWA icons | `public/icons/pwa-192.png`, `pwa-512.png`, `pwa-maskable-512.png` (purpose `maskable`) | 192, 512 | Installed app icon (Android/desktop) |
| iPhone launch screens | `public/splash/iphone-1179x2556.png`, `-1206x2622`, `-1284x2778`, `-1320x2868` | | Shown while the installed app starts |

Rules:

- Always reference brand files through `import.meta.env.BASE_URL`
  (`${import.meta.env.BASE_URL}brand/acc-logo-full.png`) — the site lives
  under a sub-path (`/<repo>/` live, `/<repo>/test/` test copy).
- No background, frame or shadow behind either logo image — both are
  transparent PNGs designed to sit on the dark rail and on the login grid.
- The logo appears **only** on the login screen and in the left rail. A
  module never shows the logo again inside its pages.
- App name: **"ACC Reliability"** (short), **"ACC Reliability Platform"**
  (full). Footer line on login: "Arabian Cement Company · Sokhna Plant".
- Brand green `#1FA35C` (leaf mark) is used **only** on the login screen's
  button/focus ring. Inside the app the action colour is the theme `accent`
  (blue).
- `frontend/public/favicon.svg` is a leftover starter file — don't use it.

---

## 3. Login, session and identity

### 3.1 Screens (frontend)

| Screen | File | Notes |
|---|---|---|
| Login | `frontend/src/pages/Login.tsx` + `Auth.css` | Logo, tagline "Reliability Platform", card with Email, Password, "Keep me signed in" (checked by default), **Sign in** button ("Signing in…" while waiting), error line, footer |
| Change password | `frontend/src/pages/ChangePassword.tsx` | Forced after a first login with a temporary password (`mustChangePassword`) |
| Route guard | `frontend/src/auth/RequireAuth.tsx` | Sends signed-out users to `/login`, remembering where they were going |

**Login look (fixed, never themed):** the only screen outside the theme
system. Dark navy background `#0A1628` with a faint 40 px technical grid
(lines in `#1E3A5F`) faded by a radial mask, a glass card (surface
`#0D1E35` at 88 % + 16 px blur, 1 px border, 18 px radius, elevation-3),
inputs 44 px tall / 8 px radius / 16 px text, button 48 px tall in brand
green `#1FA35C` with dark text `#06170E`, focus ring `0 0 0 3px` green at
14 %. Error text `#F87171`. Max card width 380 px. These values are the
`:root` tokens at the top of `frontend/src/index.css`.

The same 40 px grid continues faintly behind every page inside the app
(`.shell-page-content` in `App.css`, `--shell-grid-strength` 55 %, 10 % in
High Contrast) — it's the platform's identity texture.

### 3.2 How sign-in works

1. `POST` to Platform Core `{ action: 'login', email, password }`
   (`frontend/src/api/platformCore.ts`, envelope in `api/client.ts`).
2. Platform Core (`backend/platform-core/src/Auth.js`) checks a salted
   password hash and returns `{ sessionToken, mustChangePassword }`.
3. The token is stored under `acc.session` — `localStorage` when "Keep me
   signed in" is ticked, otherwise `sessionStorage`
   (`frontend/src/auth/AuthContext.tsx`).
4. The shell hands the token to every module at mount
   (`mountX(container, { navBridge, session: { token } })`), and the module
   sends it with **every** request as `sessionToken`.

**Token format** (`backend/platform-core/src/Session.js`):
`base64url(JSON {uid, email, org, roles, iat})` + `.` + hex
HMAC-SHA256 signature. Only Platform Core issues tokens. Each module
backend verifies them itself with the same Script Property
`SESSION_SIGNING_SECRET` (identical value in every project, never in a
sheet or in git). Copy `backend/vibration-analysis/src/Auth.js` verbatim:
`getSessionOrNull_(token)` → `{ userId, email, orgId, roles, issuedAt }` or
`null`. Roles are read at login; a role change applies at the next login.
There is no idle time-out.

The frontend may decode the token for display only
(`frontend/src/auth/session.ts` `decodeSessionClaims`) — never as a
security check.

### 3.3 Organisations and roles

| Id | Meaning |
|---|---|
| `ORG-ACC` | Arabian Cement (owner) staff |
| `ORG-RHI`, `ORG-ASEC` | The two contractors (shown as **RHI**, **ASEC**) |
| `ROLE-ADMIN` | Admin — everything, incl. Settings |
| `ROLE-MGR` | ACC Manager |
| `ROLE-RENG` | ACC (Reliability) Engineer |
| `ROLE-CMGR` | Contractor Manager (own contractor + team view) |
| `ROLE-CENG` | Contractor Engineer |
| `ROLE-TECH` | Technician |
| `ROLE-VIEW` | Visitor — sees what is allowed, never edits |

- A **technician-only** account gets the full-screen My Work shell
  (`TechnicianShell.tsx`), unless Module Access gives them another tab.
- Contractor staff land on **My Work**; ACC staff land on **Plant overview**.
- Contractor accounts only ever see their own contractor's machines and
  records: hide contractor chips and lock contractor fields to theirs.
- Users, roles and passwords are managed only in **Settings → Users**
  (Platform Core). A new module never adds user management.

---

## 4. Themes

### 4.1 The five themes

`ACC Light` (default), `Warm Paper`, `High Contrast` (light) and `Navy Dark`,
`Carbon Dark` (dark). Defined three times from one list so they never
drift — the shell (`frontend/src/theme.ts`, the subset its chrome needs)
and each module (`apps/<module>/src/theme.js`, the full set). **A new
module copies `apps/vibration-analysis/src/theme.js` unchanged.**

Only surfaces and text change between themes. `danger` / `warning` /
`success` always mean Alert / Caution / Normal; `accent` is the one action
colour (buttons, links, active tab). Every text/background pair meets WCAG
AA (4.5:1).

Old theme names still stored on devices map to the nearest new one
(`LEGACY_THEME_NAMES`: e.g. "ACC Corporate", "Slate Light" → ACC Light,
"Midnight Blue" → Navy Dark, "Warm Sand" → Warm Paper). Keep that map in
any copy.

### 4.2 Every token, every theme

From `apps/vibration-analysis/src/theme.js` (the full set). The Oil module
has the same tokens except the vibration-only ones (`alert*`, `purple*`,
`lv*`). One difference: in Oil, `pillDanger/Warning/Success/Info` are the
**tinted backgrounds** (12 % alpha); in Vibration they are the **ink**
colours below. Prefer `pillStyle(color)` (colour + `22` alpha background,
full-colour text) instead of either.

| Token | ACC Light | Warm Paper | High Contrast | Navy Dark | Carbon Dark |
|---|---|---|---|---|---|
| `appBg` | `#F3F5F8` | `#F5F1E8` | `#FFFFFF` | `#0A1628` | `#0E0F11` |
| `sidebarBg` | `#0B1B2E` | `#2B2620` | `#000000` | `#0D1E35` | `#141619` |
| `cardBg` | `#FFFFFF` | `#FFFDF7` | `#FFFFFF` | `#0F2138` | `#17191C` |
| `topbarBg` | `#FFFFFF` | `#FFFDF7` | `#000000` | `#0D1E35` | `#141619` |
| `border` | `#D9E0E8` | `#E2D9C6` | `#1A1A1A` | `#1F3A5C` | `#2A2E33` |
| `border2` | `#E8EDF2` | `#EDE6D8` | `#4D4D4D` | `#19304D` | `#22262A` |
| `inputBg` | `#FFFFFF` | `#FFFEFA` | `#FFFFFF` | `#0A1628` | `#101114` |
| `metricBg` | `#FFFFFF` | `#FFFDF7` | `#FFFFFF` | `#0F2138` | `#17191C` |
| `textPrimary` | `#0F1B2D` | `#2A2418` | `#000000` | `#E8F1FA` | `#ECEDEE` |
| `textSecondary` | `#4A5A70` | `#5A4E3C` | `#1A1A1A` | `#B6C7DA` | `#BFC3C8` |
| `sidebarText` | `#E8F0F8` | `#F3ECDD` | `#FFFFFF` | `#E8F1FA` | `#ECEDEE` |
| `sidebarTextSecondary` | `#A9B8CC` | `#BFB29A` | `#E0E0E0` | `#9FB4CB` | `#A4AAB1` |
| `textMuted` | `#5F6D82` | `#716553` | `#333333` | `#8AA2BC` | `#8E949B` |
| `textHighlight` | `#0B1B2E` | `#1E1A12` | `#000000` | `#FFFFFF` | `#FFFFFF` |
| `textSubtle` | `#3D4B60` | `#4F4535` | `#1A1A1A` | `#C8D6E6` | `#D0D3D7` |
| `accent` | `#1E5BB8` | `#1F58A8` | `#0A3A8C` | `#4C9BFF` | `#5B9BFF` |
| `accentText` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#06142A` | `#0B1424` |
| `tableHead` | `#F5F7FA` | `#F7F2E7` | `#EDEDED` | `#0B1A2E` | `#121417` |
| `tableRow` | `#FFFFFF` | `#FFFDF7` | `#FFFFFF` | `#0F2138` | `#17191C` |
| `tableRowAlt` | `#FAFBFC` | `#FBF7EE` | `#F5F5F5` | `#0C1C31` | `#141619` |
| `scrollThumb` | `#C3CEDC` | `#D6CBB3` | `#555555` | `#1F3A5C` | `#3A3F45` |
| `cardSubBg` | `#F5F7FA` | `#F7F2E7` | `#F2F2F2` | `#0B1A2E` | `#121417` |
| `infoBarBg` | `#EEF3FA` | `#F2EDE1` | `#EEF2FA` | `#0C2036` | `#151A22` |
| `codeBg` | `#EEF1F6` | `#F1EBDD` | `#F0F0F0` | `#060E1A` | `#0B0C0E` |
| `codeText` | `#1E4A8F` | `#1F4E8F` | `#0A3A8C` | `#6BCF9E` | `#7EE2A8` |
| `danger` | `#C42B2B` | `#B8322A` | `#A80000` | `#FF6B6B` | `#FF6B6B` |
| `warning` | `#9A5500` | `#995500` | `#7A4300` | `#F2A541` | `#F2A541` |
| `alert` | `#C42B2B` | `#B8322A` | `#A80000` | `#FF6B6B` | `#FF6B6B` |
| `alertBg` | `#FBE9E9` | `#F8E6E4` | `#F7DEDE` | `rgba(255,107,107,0.16)` | `rgba(255,107,107,0.16)` |
| `success` | `#18734A` | `#1E7346` | `#00602E` | `#4CC38A` | `#4CC38A` |
| `info` | `#0E7490` | `#0E6F86` | `#00546B` | `#38BDF8` | `#38BDF8` |
| `dangerBg` | `#FBEAEA` | `#F8E6E2` | `#FFE5E5` | `#3A1A1F` | `#3A1A1C` |
| `warningBg` | `#FFF3E0` | `#FBEBD2` | `#FFEFD6` | `#3A2A12` | `#3A2A12` |
| `successBg` | `#E7F5EE` | `#E3F1E6` | `#E0F3E8` | `#10301F` | `#10301F` |
| `navActive` | `rgba(30,91,184,0.1)` | `rgba(31,88,168,0.1)` | `rgba(10,58,140,0.1)` | `rgba(76,155,255,0.14)` | `rgba(91,155,255,0.14)` |
| `tableHover` | `rgba(30,91,184,0.05)` | `rgba(31,88,168,0.05)` | `rgba(10,58,140,0.05)` | `rgba(76,155,255,0.08)` | `rgba(91,155,255,0.08)` |
| `pillDanger` | `#C42B2B` | `#B8322A` | `#A80000` | `#FF6B6B` | `#FF6B6B` |
| `pillWarning` | `#9A5500` | `#995500` | `#7A4300` | `#F2A541` | `#F2A541` |
| `pillSuccess` | `#18734A` | `#1E7346` | `#00602E` | `#4CC38A` | `#4CC38A` |
| `pillInfo` | `#0E7490` | `#0E6F86` | `#00546B` | `#38BDF8` | `#38BDF8` |
| `purple` | `#6D28D9` | `#6D28D9` | `#4C1D95` | `#A78BFA` | `#A78BFA` |
| `purpleBg` | `rgba(109,40,217,0.16)` | `rgba(109,40,217,0.16)` | `rgba(76,29,149,0.16)` | `rgba(167,139,250,0.16)` | `rgba(167,139,250,0.16)` |
| `pillPurple` | `#6D28D9` | `#6D28D9` | `#4C1D95` | `#A78BFA` | `#A78BFA` |
| `lvNormal` | `#18734A` | `#1E7346` | `#00602E` | `#2FA36B` | `#2FA36B` |
| `lvCaution` | `#B58900` | `#B58900` | `#946C00` | `#BE8A12` | `#BE8A12` |
| `lvAlert` | `#C42B2B` | `#B8322A` | `#A80000` | `#E0484D` | `#E0484D` |
| `lvDanger` | `#6D28D9` | `#6D28D9` | `#4C1D95` | `#9B7BF0` | `#9B7BF0` |
| `lvNormalBg` | `#E7F5EE` | `#E6F2EA` | `#E2F0E7` | `rgba(47,163,107,0.16)` | `rgba(47,163,107,0.16)` |
| `lvCautionBg` | `#FFF4CC` | `#FFF2C7` | `#FFF0C2` | `rgba(190,138,18,0.18)` | `rgba(190,138,18,0.18)` |
| `lvAlertBg` | `#FBE9E9` | `#F8E6E4` | `#F7DEDE` | `rgba(224,72,77,0.16)` | `rgba(224,72,77,0.16)` |
| `lvDangerBg` | `rgba(109,40,217,0.12)` | `rgba(109,40,217,0.12)` | `rgba(76,29,149,0.12)` | `rgba(155,123,240,0.18)` | `rgba(155,123,240,0.18)` |

Note the rail (`sidebarBg`) is **dark in every theme**, including the light
ones; its text uses `sidebarText` / `sidebarTextSecondary`, never
`textPrimary`.

### 4.3 How a theme reaches every screen

- The person picks a theme in **Settings → Appearance**
  (`components/ThemePicker.tsx`). `shellTheme.tsx` keeps it, and
  `theme.ts persistPlatformTheme` writes it to `acc.platformTheme` **and**
  to each module's own key (Oil: `acc_oilapp_config.themeName`, Vibration:
  `selected_theme`), so a module that mounts later starts on the right
  theme. A new module adds its key to `persistPlatformTheme`.
- Already-mounted modules are switched live through
  `navBridge.setTheme(name)` (`embeddedNav.pushTheme`). The module's
  `ThemeProvider` sets `navBridge.setTheme = setThemeName`.
- The shell exposes the palette as CSS variables on `.app-shell` **and**
  `<body>` (for portalled menus): `--shell-bg`, `--shell-sidebar-bg`,
  `--shell-card-bg`, `--shell-border`, `--shell-text`,
  `--shell-text-secondary`, `--shell-text-muted`, `--shell-sidebar-text`,
  `--shell-sidebar-text-secondary`, `--shell-accent`,
  `--shell-accent-text`, `--shell-danger`, `--shell-warning`,
  `--shell-success`, `--shell-topbar-bg`, `--shell-topbar-text`,
  `--shell-topbar-text-secondary`, `--shell-topbar-border`,
  `--shell-topbar-success`, `--shell-topbar-danger`,
  `--shell-grid-strength` (`App.tsx` `ShellRoot`). Shell CSS reads only
  these.
- A module's components read colours from `useTheme()` → `{ T, s }`
  (`T` = tokens, `s` = ready style objects, §6). The module's
  `ThemeProvider` also sets document variables `--primary`, `--background`,
  `--surface`, `--text`, `--text-secondary`, `--border`, `--success`,
  `--warning`, `--danger`, `--info`, `--purple`, `--accent`,
  `--accent-text`, `--scrollbar` for plain CSS.
- The phone status bar follows the top bar: `<meta name="theme-color">` is
  updated to `topbarBg` on every theme change.
- High Contrast has a **black top bar** on a light theme; the shell detects
  this (`isDarkColor`) and switches the top bar to light text.

---

## 5. Typography and spacing

**Fonts** (Google Fonts, loaded once in `frontend/index.html`):

| Font | Variable | Used for |
|---|---|---|
| Space Grotesk 500/600/700 | `--font-display`, `--heading` | Page titles, login tagline, big numbers' headings |
| IBM Plex Sans 400–700 | `--sans` | All UI and body text |
| IBM Plex Mono 500/600 | `--mono` | IDs (Equipment ID, LP-…, VIB-…, RT-…), readings, timestamps, counts |
| IBM Plex Sans Arabic 400–700 | (with `--sans` in Arabic) | Arabic view |

**Sizes:**

| Element | Size |
|---|---|
| Base body | 15 px / 150 %, letter-spacing 0.1 px |
| Page title (`s.sectionTitle`, a `<p>`, never `<h1>`) | 22 px Space Grotesk 700; dashboards 26 px |
| Page subtitle (live numbers) | 12.5 px `textSecondary`; dashboards 14 px |
| Popup title | 17 px 700; subtitle 12.5 px |
| Big numbers on tiles | 22–26 px, 700–800 |
| Buttons | 13 px; chips 12.5 px |
| Form labels | 12 px 600 `textSecondary` |
| Full-page tables | 15 px; compact tables in cards 12.5–13.5 px |
| **Smallest text anywhere** | **12 px** |
| Phone inputs | **16 px** (iPhone zooms into anything smaller) |

**Shape and spacing tokens** (`frontend/src/index.css`): radius
`--radius-sm` 8, `--radius-md` 12, `--radius-lg` 18, `--radius-pill` 999;
spacing `--space-1…6` = 4, 8, 12, 16, 24, 32; elevation `--elevation-1…3`
(neutral black, works on every theme); motion `--motion-fast` 120 ms,
`--motion-base` 200 ms, ease `cubic-bezier(0.4, 0, 0.2, 1)`; glass blur
16 px. Module inline styles: cards radius 10 / padding 20, buttons and
inputs radius 6, popups radius 14, chips radius 999.

Touch feedback: class `.tap-scale` (scale 0.97 on press; no transition
with reduced motion). No blue tap flash, no rubber-band overscroll
(`index.css`).

---

## 6. Ready-made styles (`s`) and helpers

`buildStyles(T)` in each module's `theme.js` returns the same shapes in
both modules — use them instead of writing styles:

`page`, `sectionTitle`, `card` (cardBg, 1 px border, radius 10, padding 20,
margin-bottom 20), `cardSub`, `metricCard`/`metric`, `infoBar`, `btn`
(neutral: cardSubBg, border, radius 6, `8px 14px`, 13 px), `btnPrimary`
(accent fill, accentText, 600), `btnGhost`/`btnSecondary` (= btn),
`btnDanger` (transparent, danger text and border), `btnSm`, `input`
(full width, inputBg, radius 6, `8px 10px`), `select`, `label`, `table`,
`th`, `td`.

`pillStyle(color)` — status pill: background `color + "22"`, text `color`,
radius 999, `2px 10px`.

---

## 7. The shell (what every page sits in)

Built once in `frontend/src` — a module never re-creates any of it.

| Part | File | Design |
|---|---|---|
| Left rail | `components/Sidebar.tsx/.css` | 68 px collapsed (leaf mark), expands to 248 px on hover/focus (full logo + labels); touch screens >860 px keep it open. Always `sidebarBg`. Lists **modules and platform pages only** (`NAV_ITEMS` in `navigation.ts`), 18 px icons, 44 px rows, active row accent. A small blue dot = module still loading in the background. ≤860 px: slide-in panel with backdrop. |
| Top bar | `components/TopBar.tsx/.css` | 56 px, `topbarBg`. Breadcrumb **Module › Page** (13–14.5 px), online dot, the module's Sync button + pending count (from `navBridge.onSyncStateChange`), EN / عربي switch, global search (Ctrl K), bell, settings, avatar menu (name, role, Sign out). |
| Module tabs | `components/ModuleTabs.tsx/.css` | Under the top bar. The module's pages as tabs (3 px accent underline when active), **More ▾** for rare pages, a views sub-row for tabs that group pages, an action button (e.g. "+ Add report"). Phone: a **Module name ▾** switcher + page chips + More ▾. Config = `MODULE_TABS` in `navigation.ts`. |
| Offline banner | `components/OfflineBanner.tsx` | Under the tabs when offline: how old the data is and how many entries wait to send; stays (blue) until they have gone. |
| Page area | `.shell-page-content` (`App.css`) | 2 rem padding (16 px on phone), `--shell-bg` with the faint 40 px grid. A module's container cancels this padding (`app-content--embedded`, uses `contain: layout`). |
| Phone bottom bar | `components/BottomNav.tsx/.css` | ≤860 px: **Home · Equipment · ＋ · My Work · More**, 54 px + iPhone safe area (`--bottom-nav-h`), 56 px round ＋. Hides while typing. |
| ＋ quick sheet | `quickActions.ts` | Field entries (★ Most used first, then grouped by module), filtered by what the person may save. Same list feeds the installed-app shortcuts (`/quick/:key`). |
| More hub | `mobile/MoreSheet.tsx` | Search, Recent pages, one tile per module (red badge = My Work items), platform pages as chips, account row: Settings · EN/عربي · Log out. |
| Bell | `components/NotificationBell.tsx` | One feed for the whole platform, polled every 60 s; each module keeps its own list on its backend. |
| Global search | `components/GlobalSearch.tsx` | Asks every mounted module `navBridge.search(query)`; works offline from module data. |
| Save blocked toast | `components/SaveBlockedToast.tsx` | Shows the message when a module refuses a save locally (view-only page, maintenance). |
| Update prompt | `mobile/UpdatePrompt.tsx` | "New version ready — Reload"; asks to finish an open form first. |
| Install banner | `components/InstallGuide.tsx` + `installPrompt.ts` | Install the app (Android prompt / iOS Share → Add to Home Screen steps); dismiss key `acc.installHintDismissed`. |
| Test ribbon | `EnvRibbon` in `App.tsx` | Test builds only: orange `#C2410C` tab at the bottom "TEST COPY — not live data". |

Platform pages (not modules): **Plant overview** `/`, **My Work**
`/my-work`, **Equipment** `/equipment` and `/equipment/:id`, **Team**
`/team`, **Activity** `/activity`, **Settings** `/settings`. Planned
modules show `ComingSoon` (Thermography, Reliability Measures,
Compressors) — a new module replaces its placeholder.

Shell icons: its own stroke SVG set (`frontend/src/icons.tsx`, `<Icon
name>`); module pages use **Tabler** icons (`<i className="ti ti-name">`).

---

## 8. Pages and components

Full rules: `docs/design-reference.md`. Summary:

**Every page, top to bottom:** (1) header — `PageHeader` title + one-line
subtitle with live numbers ("4 active products · 1,880 L in stock · 1
low"), controls on the right (contractor chips, then the primary button);
(2) a summary row of tiles/charts answering "what needs me?"; (3) one filter
row — every filter affects every chart and the list; (4) the list / board /
table. Rows open the record. No empty gaps in a card row — fill them with a
useful chart.

**Components to reuse** (copy the file across with the same name/props; the
Vibration copies are in `apps/vibration-analysis/src/components`):

| Need | Component |
|---|---|
| Page header / sub-page tabs / number tile | `Tile.jsx`: `PageHeader`, `TabBar` (underlined, with counts), `Tile` (icon square 38 px, big number, label, sub-line, 3 px coloured left edge when it needs attention, clickable) |
| Any form popup | `ModalShell` + `FormSection`, `StepTrail` (workflow steps), `ReadValue` (locked values) |
| Confirm a delete | `ConfirmModal` |
| Phone filters / short choices | `BottomSheet` + `SheetGroup`, `SheetChip`, `SheetButton` ("Reset · Show N …") |
| Phone list parts | `PhoneParts.jsx`: `PhoneSummary`, `SummaryBar`, `ChipRow`, `CountChip`, `FiltersPill`, `ShowMore` (50 at a time) |
| Contractor switch | `ContractorChips` ("All contractors · RHI · ASEC"; `allLabel={null}` in forms), `ContractorTag`. Never a contractor dropdown. |
| Any ID picker or filter | `EquipmentSearch` (type + dropdown in one box; `freeText` for list filters; `idTextMatch`). Never a plain `<select>` of IDs. Shell: `IdSearch`. |
| Status pill / level | `StatusBadge`, `CountBadge`, `Level.jsx` (`LevelSymbol`, `LevelPill`, `StatePill`) |
| Charts | `DashCharts.jsx`: `Donut` (legend with numbers beside), `Ring`, `TargetBar`, `MiniBars` (current month pale), `PairBars`, `Runway`, `StackedBars` (tap a row to filter), `Gauge`, `CalendarHeat`, `MonthProgress`; trends: `TrendChart` / recharts `ComposedChart` + `Area type="monotone"`, current partial month dashed |
| Board (actions) | Oil `ActionTracker.jsx` / `VibActions.jsx`: uppercase column title with 2 px stage-colour underline + count, white cards with 3 px stage-colour left edge, dashed "No actions here", columns scroll inside `min(640px, 100vh − 220px)` |
| Timeline of events | one line with symbols (`PointHistory.jsx`) |
| Error catch | `ErrorBoundary` around the whole module |

**Forms (popups):** always `ModalShell` — icon, title, subtitle (record id ·
equipment), status pill, body of `FormSection` cards on `appBg`, footer that
stays in view (Cancel + primary; Delete far left). Drawn on `<body>`
(portal), shade `rgba(8,15,28,0.55)`, max width 780 (or set), 92 vh tall,
radius 14. Esc, ✕ and phone Back close it. Opens **over the page it came
from**. Locked values show as a read-only box, not greyed inputs. Picking
many items: two panes (available with search/filters/ticks | selected with
count, remove ✕, clear).

**Chips, buttons, text:** 2–5 options = round chips (accent fill, white
700 text when on), never a dropdown; dropdowns only for long lists.
Buttons `s.btn` / `s.btnPrimary`. Minimum text 12 px.

---

## 9. Colour meaning (fixed everywhere)

| Meaning | Colour token | Symbol |
|---|---|---|
| Normal / Good / Closed / On time | `success` | ● |
| Caution / Fair / Draft / Due now | `warning` | ▲ |
| Alert / Poor / Open / Overdue | `danger` | ◆ |
| Danger (4th vibration level) | `purple` / `lvDanger` | ■ |
| Waiting Stoppage | `accent` | |
| Closure Requested / To approve / info | `info` | |
| Not measured / not running / unknown | `textSecondary` | |

- Workflow stages (boards and pills): Draft = warning, Open = danger,
  Waiting Stoppage = accent, Closure Requested = info, Closed = success
  (`tones.js` `STAGES`, `stageTone`).
- Vibration levels: `levels.js` — `levelColor` for marks, `levelInk` for
  text, `levelBg` for fills.
- Plant-wide condition = the worse of the modules, as **Good ● / Fair ▲ /
  Poor ◆** (`frontend/src/plant.ts`).
- **Categories** (contractors, oils, series) use the categorical palette in
  fixed order, never cycled: `SERIES_LIGHT` `#2A78D6 #EB6834 #1BAF7A
  #EDA100 #E87BA4 #008300 #4A3AA7 #E34948`, `SERIES_DARK` `#3987E5 #D95926
  #199E70 #C98500 #D55181 #008300 #9085E9 #E66767` (`tones.js`,
  `pointHistory.js`). ASEC = slot 0 (blue), RHI = slot 1 (orange) on every
  chart.
- Several statuses = several colours, not shades of one blue. A one-hue
  light → dark ramp only for a true amount (heat map).
- Colour is never the only signal: numbers in text, a legend, a symbol or
  an icon. Missing values are left out of charts, never drawn as 0.
- Never hard-code a colour a token covers. Check every chart in all five
  themes, including High Contrast and both dark themes.

---

## 10. Icons

- Module pages: **Tabler Icons** v2.47.0 webfont, class `ti ti-<name>`.
  The app ships only the icons the code uses (`frontend/src/assets/icons/
  tabler-icons-subset.css/.woff2`, ~25 KB, works offline). **After using a
  new `ti-…` icon, rebuild the subset:** see `scripts/build-icon-font.py`
  (it scans `frontend/src`, `apps/oil-analysis/src`,
  `apps/vibration-analysis/src` — add the new module's `src` to its `SRC`
  list). A name not in Tabler renders nothing — check it exists.
- Shell rail/top bar/bottom bar: `frontend/src/icons.tsx` stroke icons
  (`<Icon name="droplet" />`), or `<TablerIcon>`.
- Module icon conventions: Oil = droplet, Vibration = graphs/wave,
  Thermography = thermometer, My Work = wrench (`action`), Equipment =
  factory/engine, Dashboard = layout-dashboard, Routes = route, Actions =
  checklist, Reports = report, Settings = gear.

---

## 11. Phone design (≤860 px)

The breakpoint is **860 px** everywhere (`useIsMobile`, CSS media
queries).

- **Header:** module or page name, search, sync, bell. Settings, account,
  language and sign-out live in **More**.
- **Bottom bar** and **＋ sheet**, **More hub**, **Module name ▾** switcher
  + page chips — see §7. Switching module keeps the same kind of page
  (Dashboard → Dashboard). No sideways swipe between pages.
- **Back:** every sheet, popup and panel adds one history step
  (`useBackClose`, one shared stack on `window.__accBackStack` for shell +
  modules). The iPhone swipe and Android Back close the top one only.
- **Scrolling:** the page itself scrolls (no inner scroll box); scroll
  position kept per page (`ScrollKeeper`).
- **Keyboard:** `--app-vh` = the visible height; `html.kb-open` hides the
  bottom bar; full-screen forms keep their footer above the keyboard;
  `html.standalone` = launched from the home screen (`mobile/viewport.ts`).
- **No zoom ever:** viewport `maximum-scale=1, user-scalable=no,
  viewport-fit=cover`, 16 px inputs.
- **Safe areas:** use `env(safe-area-inset-top/bottom)` on anything touching
  the screen edge (popup header/footer, bottom bar).
- **Touch targets** ≥ 44 px.
- **No sideways page scroll** at 360 and 390 px; wide tables scroll inside
  their card. Grids: `repeat(auto-fit, minmax(min(100%, Npx), 1fr))`.
- **Lists are cards, not tables:** code + status badge with symbol on line
  1, name, then the reason in the status ink. Tables of records carry
  `data-phone-cards` (+ `phone-cards-box` on their card) and become cards
  automatically (`phoneCardTables.js`). Number grids stay tables.
- **Lists before charts:** a `PhoneSummary` line with 2–3 numbers ("72
  open · ◆ 50 past due") replaces tiles and charts; tapping opens them.
- **Filters:** one chip row (most used + a **Filters** chip with a count);
  the rest in a `BottomSheet` whose footer says "Show 611 equipment".
- **Boards:** one column at a time, picked from a `ChipRow` of `CountChip`s.
- **Long lists:** 50 cards, then "Show 50 more · N left".
- **Record pages:** main actions in a bar pinned above the bottom bar,
  portalled to `<body>` (the module container's `contain: layout` traps
  `position: fixed`); hides while typing.
- **Popups:** full-screen, footer buttons 44 px; a field spanning two grid
  columns on desktop spans one on the phone.
- Haptic tick on key taps: `tapHaptic()` (`haptics.ts`, Android only).

---

## 12. PWA (installed app)

All in `frontend/vite.config.ts` (vite-plugin-pwa) and
`frontend/index.html`. A new **module** needs none of this — it is served
under the same app. Only a stand-alone site (§1 B) copies it with its own
name and `id`.

| Item | Value |
|---|---|
| Name / short name | ACC Reliability Platform / ACC Reliability |
| `id`, `start_url`, `scope` | `.` (relative — live and test copy stay two separate installs) |
| `display` | `standalone` (override: standalone, minimal-ui) |
| `orientation` | `any` |
| `background_color` / `theme_color` | `#F3F5F8` / `#FFFFFF` (theme-color then follows the theme's `topbarBg` at run time) |
| Icons | `pwa-192`, `pwa-512`, `pwa-maskable-512` (maskable) |
| Shortcuts | My Work (`my-work`), Emergency top-up (`quick/topup`), Add lab report (`quick/report`) — a new module may add its main field entry here and in `quickActions.ts` |
| Categories | business, productivity |
| Update | `registerType: 'prompt'` — new version waits for the person's **Reload** (`UpdatePrompt.tsx`), checks hourly; `clientsClaim: true` |
| Cache | shell files precached; module bundles (`/apps/…`) **StaleWhileRevalidate**, cache `acc-module-bundles`, 40 entries, 30 days. Module URL carries `?v=<build sha>` so a deploy is fetched at once. |
| Test copy | `navigateFallbackDenylist` keeps the live service worker off `/test/` |
| iOS | `apple-mobile-web-app-capable=yes`, status bar `default` (dark clock on the light top bar), title "ACC Reliability", `apple-touch-icon`, four `apple-touch-startup-image` splash screens by device size |
| Deep links on GitHub Pages | `public/404.html` + the small script in `index.html` restore the real path after a refresh |

**Offline:** each module keeps its last answers on the device and opens
with them at once (`dataCache.js`: per user, per action), then refreshes.
New field records made with no connection are queued and sent when back
(`apps/oil-analysis/src/offlineQueue.js` — new records only, only after a
true network error). The offline banner shows the data's age and waiting
count (from `navBridge.onSyncStateChange({ syncState, pendingSyncCount,
lastSyncAt })`).

**Storage:** every key is prefixed in test builds (`storagePrefix.ts`,
`VITE_STORAGE_PREFIX='acc-test:'`) so live and test never share login,
cache or queue. Name new keys `acc.<thing>.v1` (shell) or
`acc_<module>_<thing>` (module). Always wrap storage in try/catch.

---

## 13. Arabic (right-to-left)

- One translator for the whole page (`frontend/src/i18n/translator.ts`,
  started in `main.tsx`): any visible text, placeholder, `aria-label` or
  `title` whose English is in the word list shows in Arabic. The word list
  is `i18n/terms.ts`, overridden by Platform Core's **TRANSLATIONS** sheet
  (Settings → Language).
- Write UI words as **whole phrases in one text node**; put numbers in
  their own element or use a `{n}` pattern.
- Add every new UI phrase to `i18n/terms.ts` with a first Arabic
  suggestion.
- `data-no-translate` on anything that must stay as is.
- Codes, IDs, numbers and charts stay left-to-right; lines use
  `unicode-bidi: plaintext`.
- Use logical CSS (`margin-inline-start`, `inset-inline-end`,
  `padding-inline`) so layouts mirror by themselves.

---

## 14. Permissions: Module Access

Every module backend has the **same** `ModuleAccess.js` (copy it verbatim)
plus its own `ModuleAccessConfig.js`:

- `MA_CONFIG = { moduleId, moduleName, peopleSheet, tabAccessSheet, tabs,
  roles, defaultRoleLevels, orgToContractor, readRules }`.
- Tab levels: **Hidden / View / Edit**. Module status: **Active /
  Maintenance / Off**. The Admin changes them in Settings → Module
  Access; people can be added to a module with a responsibility (ACC,
  Contractor, Technician, Member, ACC Manager, Contractor Manager) and
  delegate while away (Settings → My delegations).
- `readRules`: each read action → the tabs that may call it, `"open"`, or
  `"settings:<section>"`. Write actions are listed in a `*_WRITE_ACTIONS`
  array and checked with `maCheckWrite_`.
- Tab ids **must equal** the page ids in `navigation.ts` and the module's
  `App.jsx` `page` states.

Frontend:

- The shell asks each backend `getMyAccess` after login and every 2 min
  (`frontend/src/moduleAccess.tsx`), hides modules/tabs, shows the
  maintenance banner, and publishes `window.__accModuleAccess` for the
  module bundles.
- In the module's `api.js`, before any save: `blockedReason()` (Maintenance
  or a View-only page) → don't send, fire the `acc-save-blocked` event
  (the shell shows the toast). Copy from `apps/vibration-analysis/src/api.js`.
- The server always re-checks. Unknown access (still loading) = allowed;
  the server has the final say.

---

## 15. Platform features a module plugs into

| Feature | What the module provides |
|---|---|
| **Module page** | `mountX(container, { navBridge, session })` in `src/embed.jsx`; an `Embedded<X>.tsx` wrapper in `frontend/src/pages` |
| **Navigation** | `navBridge.navigate = (pageId, recordId)` (record id or a pre-filled form object), calls `navBridge.onNavigate(pageId)` on every page change |
| **Theme** | `navBridge.setTheme = setThemeName` |
| **Sync button / offline banner** | `navBridge.sync = runSync`, `navBridge.onSyncStateChange({ syncState, pendingSyncCount, lastSyncAt })` |
| **Global search** | `navBridge.search(query) → [{ kind, title, subtitle, page, recordId }]` from data already held |
| **Plant overview + Equipment** | `src/plantSummary.js` building `PlantSummary` (per machine: condition Good/Fair/Poor, word, reasons, open/overdue actions, facts, events, nextDue; plus kpis and attention cards) → `navBridge.onPlant(summary)`; add the module to `PLANT_MODULES` in `plant.ts` |
| **My Work** | backend `GET getMyWork` answering `{ sections: [{ id, title, hint, severity: 'action'|'warning'|'info', total, items: [{ id, title, subtitle, meta, flag, link: { page, recordId } }] }] }` (`frontend/src/myWork.ts`); set `myWork: true` in `MODULE_BACKENDS` |
| **Bell** | backend keeps each person's notices (see Vibration `VibNotifications.js`: get + mark read); add a fetcher in `NotificationBell.tsx` |
| **＋ quick entries / app shortcuts** | entries in `quickActions.ts` (filtered by `canSave`) |
| **Settings** | a "Modules" tab in `pages/Settings.tsx` that shows the module's own Settings page (`?module=<id>`); module settings saved through its backend (`ModuleSettings.js`) |
| **Team / Activity** | backend `getTeamHistory` and `getActivityFeed` in the shared shapes (`TeamHistory.js`, `ActivityFeed.js`) |
| **Equipment IDs** | read names/areas/contractors from the platform equipment list (`PlatformEquipment.js`); use official area names (`officialAreas.js`) |
| **Email** | send through the platform's per-event switches (`EmailEvents.js`) |
| **Shell page requests** | `window.dispatchEvent(new CustomEvent('acc-shell-navigate', { detail: { path: '/settings' } }))` |
| **Version tile** | read `window.__accBuildId` |

---

## 16. Backend pattern (Google Apps Script + Google Sheets)

One Apps Script project per module, bound to the module's spreadsheet,
split into topic files (paste each as its own file). Deployed as a Web App:
**Execute as Me · Who has access: Anyone**. After any change: Deploy →
Manage deployments → edit → **New version** → Deploy.

Files every module has (copy from `backend/vibration-analysis/src`):

| File | Role |
|---|---|
| `Code.js` | `doGet` / `doPost` → `dispatchWithAccess_` (session → access check → dispatch); `?action=installCheck` |
| `Config.js` | sheet names (`SHEET_…`), headers |
| `Utils.js` | sheet read/write helpers, JSON output |
| `Auth.js` | token check (verbatim copy, §3.2) |
| `ModuleAccess.js` | verbatim copy (§14) |
| `ModuleAccessConfig.js` | this module's tabs and rules |
| `ModuleSettings.js` | module settings (who may edit) |
| `MyWork.js`, `TeamHistory.js`, `ActivityFeed.js`, `EmailEvents.js`, `PlatformEquipment.js`, `IdAdmin.js` | platform features (§15) |
| `Cache.js` | read cache bumped on every write (`vcBump_`) |
| `InstallCheck.js` | **generated** — run `node scripts/gen-install-check.mjs` after any backend change (add the new project to its list) |

Rules:

- Request: `GET ?action=…&sessionToken=…` for reads, `POST` body (sent as
  `Content-Type: text/plain` to avoid a CORS preflight) for writes. Answer
  `{ status: 'ok', … }` or `{ status: 'error', error: '<plain message>',
  accessDenied? }`. Platform Core uses `{ ok: true, data } | { ok: false,
  error: { message, correlationId } }`.
- Every write inside `LockService.getScriptLock().tryLock(30000)`
  ("Server is busy — please try again." if not).
- Every change writes an **audit line** (who, what, which record, a
  plain-English description) — but not for a repeat that changed nothing.
- Writes are **idempotent**: saving the same thing twice must not create a
  second record (check before append, or an `operationId`).
- Never trust the client's identity fields — take the person from the
  session.
- Long lists may be **packed** (`pack=1`, `vbPack_`) to keep answers small;
  the client unpacks (`unpackLists` in `api.js`).
- Startup: one `getStartupBundle` read instead of many (`docs/performance.md`).
- Script Properties hold secrets (`SESSION_SIGNING_SECRET`, spreadsheet ids,
  API secrets) — never a sheet, never git.
- Error messages are for plant staff: short, plain words, what to do next.

---

## 17. Build, deploy, test copy

- `.github/workflows/deploy.yml` builds the shell (`frontend`), each
  module's **embed bundle** (`npm run build:embed` → `dist-embed/embed.js`,
  library mode, React bundled inside, `process.env.NODE_ENV` defined), and
  assembles one site: `site/` (shell) + `site/apps/<module>/embed.js`.
  **A new module adds its install + build:embed + copy lines here — in both
  the live and the test-copy steps.**
- Backend URLs come from repository variables (`VITE_PLATFORM_CORE_URL`,
  `VITE_OIL_ANALYSIS_URL`, `VITE_VIBRATION_ANALYSIS_URL`; test copy:
  `TEST_…`). A new module adds `VITE_<MODULE>_URL` and `TEST_<MODULE>_URL`,
  reads it in `frontend/src/config.ts`, and adds it to the workflow's
  "never point the test copy at a live backend" guard.
- The test copy is built from `claude/test-site` into `/test/` with
  `VITE_ENV_LABEL='TEST COPY'` and `VITE_STORAGE_PREFIX='acc-test:'`, using
  test copies of every spreadsheet.
- Tests: Playwright checks against the local test site for each new page
  (phone 390 px and desktop, all five themes, no console errors) and Node
  tests with the Apps Script mocks for backend logic.

---

## 18. Recipe: add a new module (e.g. "Thermography")

1. **Frontend app** — copy `apps/vibration-analysis` structure into
   `apps/thermography`: `package.json` (React 18 + Vite, `build:embed`
   script), `vite.embed.config.js`, `src/embed.jsx`
   (`export function mountThermography(container, { navBridge, session })`:
   set the session token, load the device cache, render
   `ErrorBoundary > ThemeProvider navBridge > App navBridge`),
   `src/theme.js` (unchanged copy), `src/ThemeContext.jsx`,
   `src/components/*` (copy the shared components listed in §8, unchanged),
   `src/hooks/useIsMobile.js`, `useBackClose.js`, `src/api.js` (token on
   every request, `blockedReason`, cache), `src/dataCache.js`.
2. **App.jsx** — page state; wire `navBridge.navigate`, `onNavigate`,
   `search`, `sync`, `onSyncStateChange`, `onPlant`. When `navBridge` is
   present, render **no** own sidebar/top bar (`marginLeft: 0`).
3. **Pages** — copy the matching Oil page for each job (dashboard,
   equipment list, record page, actions board, routes, log, reports,
   settings). Follow §8–§11 and `docs/design-reference.md`.
4. **Shell wiring** (`frontend/src`):
   - `navigation.ts`: `THERMO_SUB_TABS`, the `NAV_ITEMS` entry (replace the
     ComingSoon one, add `subTabs` + `moduleId`), a `MODULE_TABS` entry.
   - `pages/EmbeddedThermography.tsx`: copy `EmbeddedVibrationAnalysis.tsx`
     (MODULE_ID, BASE_ROUTE, mount function name, bundle path).
   - `App.tsx`: render `<EmbeddedThermography />` next to the others; remove
     the ComingSoon route; `COMING_SOON_ROUTES` drop it.
   - `moduleAccess.tsx` `MODULE_BACKENDS`, `config.ts` URL,
     `plant.ts` `PLANT_MODULES`, `theme.ts` `persistPlatformTheme` key,
     `quickActions.ts`, `NotificationBell.tsx`, `pages/Settings.tsx`
     "Modules" entry, `MoreSheet`/`BottomNav` module name + icon maps.
   - `i18n/terms.ts`: every new phrase.
   - `scripts/build-icon-font.py`: add `apps/thermography/src`, rebuild.
5. **Backend** — new Apps Script project + spreadsheet; copy the common
   files (§16); write `ModuleAccessConfig.js`; set Script Properties
   (`SESSION_SIGNING_SECRET` same as Platform Core); deploy; add to
   `scripts/gen-install-check.mjs` and regenerate.
6. **Deploy workflow** — install, `build:embed`, copy to
   `site/apps/thermography/` (live and test); new URL variables.
7. **Test copy first** — push `claude/test-site`, check on the phone and
   desktop, all five themes, Arabic, offline, each role; then ask before
   going live.

---

## 19. Final checklist (every new page or module)

- [ ] No own login, logo, sidebar, top bar, bell or theme picker inside the module.
- [ ] Session token sent on every request; backend verifies it and applies Module Access.
- [ ] Tab ids identical in `navigation.ts`, `App.jsx` and `ModuleAccessConfig.js`.
- [ ] Only theme tokens; looks right in ACC Light, Warm Paper, High Contrast, Navy Dark, Carbon Dark.
- [ ] Fonts: Space Grotesk titles, IBM Plex Sans text, IBM Plex Mono IDs/numbers; nothing under 12 px.
- [ ] Page header with live-number subtitle; summary row; one filter row; list.
- [ ] Contractor chips (hidden for a contractor account); `EquipmentSearch` for every ID.
- [ ] Forms in `ModalShell` + `FormSection`, sticky footer, Back/Esc close.
- [ ] Status colours and symbols per §9; colour never the only signal.
- [ ] Phone: 360/390 px no sideways scroll, cards not tables, 16 px inputs, 44 px targets, Back closes sheets, summary before charts.
- [ ] Works offline from the device cache; sync state reported to the shell.
- [ ] Every new phrase in `i18n/terms.ts`; logical CSS.
- [ ] New Tabler icons added to the subset font.
- [ ] Writes locked, idempotent, audited; install check regenerated.
- [ ] Playwright + backend tests added; tested on the test copy before live.
- [ ] No real company data, secrets or URLs committed.

---

## 20. File index

| Topic | Files |
|---|---|
| Shell entry | `frontend/index.html`, `frontend/src/main.tsx`, `App.tsx`, `App.css`, `index.css` |
| Login | `pages/Login.tsx`, `pages/ChangePassword.tsx`, `pages/Auth.css`, `auth/*`, `api/platformCore.ts`, `api/client.ts` |
| Themes | `frontend/src/theme.ts`, `shellTheme.tsx`, `components/ThemePicker.tsx`, `apps/*/src/theme.js`, `apps/*/src/ThemeContext.jsx` |
| Navigation | `navigation.ts`, `embeddedNav.tsx`, `components/Sidebar.*`, `TopBar.*`, `ModuleTabs.*`, `BottomNav.*`, `mobile/MoreSheet.tsx`, `quickActions.ts`, `components/GlobalSearch.tsx` |
| Module mount | `pages/EmbeddedOilAnalysis.tsx`, `pages/EmbeddedVibrationAnalysis.tsx`, `apps/*/src/embed.jsx`, `apps/*/vite.embed.config.js` |
| Access | `moduleAccess.tsx`, `settingsAccess.tsx`, `backend/*/src/ModuleAccess*.js` |
| Phone | `mobile/*`, `haptics.ts`, `apps/*/src/components/PhoneParts.jsx`, `BottomSheet.jsx`, `phoneCardTables.js` |
| PWA | `frontend/vite.config.ts`, `index.html`, `public/*`, `installPrompt.ts`, `components/InstallGuide.tsx`, `mobile/UpdatePrompt.tsx`, `components/OfflineBanner.tsx`, `storagePrefix.ts` |
| Arabic | `i18n/*`, `docs/arabic-word-list.md` |
| Platform pages | `pages/PlantOverview.tsx`, `PlantEquipment.tsx`, `MyWork.tsx`, `Team.tsx`, `Activity.tsx`, `Settings.tsx`, `TechnicianShell.tsx`, `plant.ts`, `myWork.ts` |
| Shared module components | `apps/vibration-analysis/src/components/*` (same as Oil's) |
| Backends | `backend/platform-core`, `backend/oil-lubrication`, `backend/vibration-analysis`, `scripts/gen-install-check.mjs` |
| Deploy | `.github/workflows/deploy.yml`, `.github/workflows/test-site.yml` |
