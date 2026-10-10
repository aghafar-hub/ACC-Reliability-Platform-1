import { TranslationsLoader } from './i18n/LangToggle';
import PlantOverview from './pages/PlantOverview';
import { PlantEquipmentList, PlantMachinePage } from './pages/PlantEquipment';
import { useEffect, useState, type CSSProperties } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import BottomNav from './components/BottomNav';
import MoreSheet from './mobile/MoreSheet';
import ScrollKeeper from './mobile/ScrollKeeper';
import UpdatePrompt from './mobile/UpdatePrompt';
import ModuleTabs from './components/ModuleTabs';
import OfflineBanner from './components/OfflineBanner';
import QuickLink from './components/QuickLink';
import { InstallBanner } from './components/InstallGuide';
import SaveBlockedToast from './components/SaveBlockedToast';
import Sidebar from './components/Sidebar';
import { AuthProvider, useAuth } from './auth/AuthContext';
import RequireAuth from './auth/RequireAuth';
import { isTechnicianOnly } from './auth/session';
import { EmbeddedNavProvider } from './embeddedNav';
import { SettingsAccessProvider } from './settingsAccess';
import { hasModuleTabsBeyondMyWork, MODULE_BACKENDS, ModuleAccessProvider, useModuleAccess } from './moduleAccess';
import ChangePassword from './pages/ChangePassword';
import ComingSoon from './pages/ComingSoon';
import EmbeddedOilAnalysis from './pages/EmbeddedOilAnalysis';
import EmbeddedVibrationAnalysis from './pages/EmbeddedVibrationAnalysis';
import Login from './pages/Login';
import MyWork from './pages/MyWork';
import TopBar from './components/TopBar';
import LpRegisterPage from './pages/oil-analysis/LpRegisterPage';
import NewRoutinePage from './pages/oil-analysis/NewRoutinePage';
import OilAnalysisLayout from './pages/oil-analysis/OilAnalysisLayout';
import RoutineDetailPage from './pages/oil-analysis/RoutineDetailPage';
import RoutinesListPage from './pages/oil-analysis/RoutinesListPage';
import Settings from './pages/Settings';
import TechnicianShell from './pages/TechnicianShell';
import { ShellThemeProvider, useShellTheme } from './shellTheme';
import './App.css';

// Reads the chosen palette (see shellTheme.tsx) and exposes it as CSS custom
// properties on the shell's own root element — Sidebar.css and App.css read
// these (with the original dark-navy values as fallback) instead of
// hardcoded colors, so the whole shell restyles the instant a theme is
// picked, not just the two embedded modules.
function isDarkColor(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) < 128;
}

function ShellRoot() {
  const { palette } = useShellTheme();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Phone "More" (bottom bar) — a sheet with every page, settings and account.
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();

  // Belt-and-suspenders: every link inside Sidebar already closes the
  // overlay on click (see Sidebar.tsx), but this also catches the browser
  // back/forward buttons and any other route change that doesn't go
  // through one of those click handlers.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  // A light theme with a dark top bar (High Contrast) needs light text there.
  const topbarIsInverse = !palette.dark && isDarkColor(palette.topbarBg);

  // The phone's status bar / the browser's address bar take the top bar's
  // colour, so an installed app doesn't show a dark navy strip above a light
  // theme (PWA item 21).
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', palette.topbarBg);
  }, [palette.topbarBg]);

  const themeVars = {
    '--shell-bg': palette.appBg,
    '--shell-sidebar-bg': palette.sidebarBg,
    '--shell-card-bg': palette.cardBg,
    '--shell-border': palette.border,
    '--shell-text': palette.textPrimary,
    '--shell-text-secondary': palette.textSecondary,
    // Sidebar.css reads these instead of --shell-text/--shell-text-secondary
    // for its own nav text -- see theme.ts's ThemePalette comment for why
    // the sidebar surface needs its own pair.
    '--shell-sidebar-text': palette.sidebarText,
    '--shell-sidebar-text-secondary': palette.sidebarTextSecondary,
    '--shell-accent': palette.accent,
    '--shell-accent-text': palette.accentText,
    '--shell-text-muted': palette.textMuted,
    '--shell-danger': palette.danger,
    '--shell-warning': palette.warning,
    '--shell-success': palette.success,
    // The top bar has its own surface: black in High Contrast, the card
    // colour elsewhere (TopBar.css maps these onto its own --shell-* vars).
    '--shell-topbar-bg': palette.topbarBg,
    '--shell-topbar-text': topbarIsInverse ? '#FFFFFF' : palette.textPrimary,
    '--shell-topbar-text-secondary': topbarIsInverse ? '#E0E0E0' : palette.textSecondary,
    '--shell-topbar-border': topbarIsInverse ? '#3A3A3A' : palette.border,
    // status text on the black top bar needs the light status shades
    '--shell-topbar-success': topbarIsInverse ? '#4CC38A' : palette.success,
    '--shell-topbar-danger': topbarIsInverse ? '#FF6B6B' : palette.danger,
    // High Contrast's borders are near-black, so the background grid would
    // turn into heavy lines — keep it a faint texture there.
    '--shell-grid-strength': topbarIsInverse ? '10%' : '55%',
  } as CSSProperties;

  // Menus and full-screen panels drawn on <body> (the More menu, the phone
  // search) sit outside the element carrying these, so <body> gets them too.
  useEffect(() => {
    const style = document.body.style;
    for (const [k, v] of Object.entries(themeVars)) style.setProperty(k, String(v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palette, topbarIsInverse]);

  return (
    <div className="app-shell" style={themeVars}>
      <Sidebar mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />
      <div className="app-shell-right">
        <TopBar onOpenMenu={() => setMobileNavOpen(true)} />
        <ModuleTabs />
        <OfflineBanner />
        <main className="shell-page-content">
          <Routes>
            {/* Patch 31 briefly pointed "/" and "/equipment" at Oil
                Lubrication's own Dashboard/Equipment pages directly — reverted
                (Patch 32): those are the LOW-level, module-scoped pages (now
                labeled "Oil Dashboard"/"Oil Equipment" to make that explicit —
                see navigation.ts and apps/oil-analysis's TopBar.jsx), not the
                HIGH-level, platform-wide Dashboard/Equipment these top-level
                nav slots are meant for — which aren't designed yet. Back to
                plain placeholders, same treatment as Reliability Measures/
                Compressors below, until the real high-level pages are built. */}
            <Route path="/" element={<PlantOverview />} />
            <Route path="/my-work" element={<MyWork />} />
            <Route path="/quick/:key" element={<QuickLink />} />
            <Route path="/equipment" element={<PlantEquipmentList />} />
            <Route path="/equipment/:id" element={<PlantMachinePage />} />
            <Route path="/reliability-measures" element={<ComingSoon title="Reliability Measures" />} />
            <Route path="/compressors" element={<ComingSoon title="Compressors" />} />
            <Route path="/settings" element={<Settings />} />
            {/* The Oil Lubrication module's old address — kept so bookmarks and old links still work. */}
            <Route path="/oil-analysis" element={<OldOilAddress />} />
            {/* The new Routine-based Oil Analysis module — parked here, not linked from the sidebar for now. */}
            <Route path="/oil-analysis-new" element={<OilAnalysisLayout />}>
              <Route index element={<Navigate to="routines" replace />} />
              <Route path="lp-register" element={<LpRegisterPage />} />
              <Route path="routines" element={<RoutinesListPage />} />
              <Route path="routines/new" element={<NewRoutinePage />} />
              <Route path="routines/:routineId" element={<RoutineDetailPage />} />
            </Route>
          </Routes>
          {/* Rendered unconditionally, outside <Routes> — each mounts itself
              lazily on first visit and then stays mounted (hidden via CSS)
              for the rest of the session; see their own file comments for
              why. Neither has a matching <Route> above on purpose: these ARE
              the content for /oil-lubrication and /vibration-analysis — and,
              since Patch 29, also the content that appears below Settings'
              own tab strip when that module's settings tab is selected
              there. Rendered AFTER <Routes> in the DOM (not before) so that
              when both are visible at once (the /settings case), Settings'
              own tab strip renders above the embedded panel, not below it. */}
          <EmbeddedVibrationAnalysis />
          <EmbeddedOilAnalysis />
        </main>
        {/* <=860px only (BottomNav.css) — fixed to the viewport bottom, so
            it's a sibling of <main>, not nested inside it. */}
        <BottomNav onOpenMore={() => setMoreOpen(true)} moreOpen={moreOpen} />
        <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
        <ScrollKeeper />
        <InstallBanner />
      </div>
      <SaveBlockedToast />
      <UpdatePrompt />
    </div>
  );
}

function OldOilAddress() {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: '/oil-lubrication', search, hash }} replace />;
}

function AppShell() {
  return (
    <EmbeddedNavProvider>
      <ShellThemeProvider>
        <ShellRoot />
      </ShellThemeProvider>
    </EmbeddedNavProvider>
  );
}

// Picks which shell an authenticated user gets: a Technician-only user
// (see auth/session.ts' isTechnicianOnly) never sees the Sidebar or any
// other tab, full stop — every path under "/*" collapses to the same
// single-screen My Work view. Everyone else gets the normal shell with
// full routing. This check runs on every route change (not just once at
// login) so it also takes effect immediately if the user's own role ever
// changes mid-session via a fresh login.
// A technician-only account normally gets the single-screen My Work view.
// Once the App Owner gives them any other tab in a module (Settings >
// General > Module Access), they get the normal shell with its menu instead,
// so that access actually shows up for them.
function ShellForUser() {
  const { claims } = useAuth();
  const { access } = useModuleAccess();
  const techOnly = !!claims && isTechnicianOnly(claims.roles);
  const hasMoreThanMyWork = MODULE_BACKENDS.some((m) => hasModuleTabsBeyondMyWork(access[m.id]));
  return techOnly && !hasMoreThanMyWork ? <TechnicianShell /> : <AppShell />;
}

// The embedded modules can't use the shell's router: they ask for a shell
// page with window.dispatchEvent(new CustomEvent('acc-shell-navigate',
// { detail: { path } })) — e.g. a module's settings → Email & notifications.
// The build id is published for their Settings → Status "Version" tile.
function ShellNavigateListener() {
  const navigate = useNavigate();
  useEffect(() => {
    window.__accBuildId = import.meta.env.VITE_BUILD_SHA || 'dev';
    const go = (e: Event) => {
      const path = (e as CustomEvent<{ path?: string }>).detail?.path;
      if (typeof path === 'string' && path.startsWith('/')) navigate(path);
    };
    window.addEventListener('acc-shell-navigate', go);
    return () => window.removeEventListener('acc-shell-navigate', go);
  }, [navigate]);
  return null;
}

function AuthenticatedShell() {
  return (
    <ModuleAccessProvider>
      <SettingsAccessProvider>
        <ShellNavigateListener />
        <TranslationsLoader />
        <ShellForUser />
      </SettingsAccessProvider>
    </ModuleAccessProvider>
  );
}

// Test builds (tools/test-site) set VITE_ENV_LABEL so a test copy can never
// be mistaken for the live site — shown on every screen, login included.
function EnvRibbon() {
  const label = import.meta.env.VITE_ENV_LABEL;
  if (!label) return null;
  return (
    <div className="env-ribbon">
      {label}
      <span className="env-ribbon-extra"> — not live data</span>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <EnvRibbon />
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth />}>
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="/*" element={<AuthenticatedShell />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
