import type { CSSProperties } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import { AuthProvider, useAuth } from './auth/AuthContext';
import RequireAuth from './auth/RequireAuth';
import { isTechnicianOnly } from './auth/session';
import { EmbeddedNavProvider } from './embeddedNav';
import ChangePassword from './pages/ChangePassword';
import ComingSoon from './pages/ComingSoon';
import Dashboard from './pages/Dashboard';
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
function ShellRoot() {
  const { palette } = useShellTheme();
  const themeVars = {
    '--shell-bg': palette.appBg,
    '--shell-sidebar-bg': palette.sidebarBg,
    '--shell-card-bg': palette.cardBg,
    '--shell-border': palette.border,
    '--shell-text': palette.textPrimary,
    '--shell-text-secondary': palette.textSecondary,
    '--shell-accent': palette.accent,
    '--shell-accent-text': palette.accentText,
  } as CSSProperties;

  return (
    <div className="app-shell" style={themeVars}>
      <Sidebar />
      <div className="app-shell-right">
        <TopBar />
        <main className="app-content">
          {/* Rendered unconditionally, outside <Routes> — each mounts itself
              lazily on first visit and then stays mounted (hidden via CSS)
              for the rest of the session; see their own file comments for
              why. Neither has a matching <Route> below on purpose: these ARE
              the content for /oil-analysis and /vibration-analysis. */}
          <EmbeddedVibrationAnalysis />
          <EmbeddedOilAnalysis />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/my-work" element={<MyWork />} />
            <Route path="/equipment" element={<ComingSoon title="Equipment" />} />
            {/* /oil-analysis/routines and /oil-analysis/inventory have no <Route>
                here on purpose — both are native pages inside apps/oil-analysis now
                (see EmbeddedOilAnalysis above), same as /oil-analysis itself. */}
            <Route path="/reliability-measures" element={<ComingSoon title="Reliability Measures" />} />
            <Route path="/compressors" element={<ComingSoon title="Compressors" />} />
            <Route path="/settings" element={<Settings />} />
            {/* The new Routine-based Oil Analysis module — parked here, not linked from the sidebar for now. */}
            <Route path="/oil-analysis-new" element={<OilAnalysisLayout />}>
              <Route index element={<Navigate to="routines" replace />} />
              <Route path="lp-register" element={<LpRegisterPage />} />
              <Route path="routines" element={<RoutinesListPage />} />
              <Route path="routines/new" element={<NewRoutinePage />} />
              <Route path="routines/:routineId" element={<RoutineDetailPage />} />
            </Route>
          </Routes>
        </main>
      </div>
    </div>
  );
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
function AuthenticatedShell() {
  const { claims } = useAuth();
  if (claims && isTechnicianOnly(claims.roles)) {
    return <TechnicianShell />;
  }
  return <AppShell />;
}

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
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
