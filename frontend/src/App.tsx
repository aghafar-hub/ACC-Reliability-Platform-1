import type { CSSProperties } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import { AuthProvider } from './auth/AuthContext';
import RequireAuth from './auth/RequireAuth';
import { EmbeddedNavProvider } from './embeddedNav';
import ChangePassword from './pages/ChangePassword';
import ComingSoon from './pages/ComingSoon';
import Dashboard from './pages/Dashboard';
import EmbeddedOilAnalysis from './pages/EmbeddedOilAnalysis';
import EmbeddedVibrationAnalysis from './pages/EmbeddedVibrationAnalysis';
import Login from './pages/Login';
import LpRegisterPage from './pages/oil-analysis/LpRegisterPage';
import NewRoutinePage from './pages/oil-analysis/NewRoutinePage';
import OilAnalysisLayout from './pages/oil-analysis/OilAnalysisLayout';
import RoutineDetailPage from './pages/oil-analysis/RoutineDetailPage';
import RoutinesListPage from './pages/oil-analysis/RoutinesListPage';
import Settings from './pages/Settings';
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
      <main className="app-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/my-work" element={<ComingSoon title="My Work" />} />
          <Route path="/equipment" element={<ComingSoon title="Equipment" />} />
          <Route path="/vibration-analysis" element={<EmbeddedVibrationAnalysis />} />
          <Route path="/oil-analysis" element={<EmbeddedOilAnalysis />} />
          <Route path="/oil-analysis/routines" element={<ComingSoon title="Routines" />} />
          <Route path="/oil-analysis/inventory" element={<ComingSoon title="Oil Inventory" />} />
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

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth />}>
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="/*" element={<AppShell />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
