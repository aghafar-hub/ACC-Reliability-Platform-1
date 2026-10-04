import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useAuth } from '../auth/AuthContext';
import { EmbeddedNavProvider } from '../embeddedNav';
import { Icon } from '../icons';
import NotificationBell from '../components/NotificationBell';
import ThemePicker from '../components/ThemePicker';
import { ShellThemeProvider, useShellTheme } from '../shellTheme';
import MyWork from './MyWork';
import './TechnicianShell.css';

// Small popover for the one setting a Technician-only account gets: the
// same color theme every other role picks from Settings' General tab (see
// pages/Settings.tsx). Mirrors NotificationBell's own outside-click/Escape-
// to-close panel pattern right next to it in the header, rather than a new
// full Settings page this shell otherwise has no route for.
function AppearanceMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="tech-shell-appearance" ref={containerRef}>
      <button
        type="button"
        className="tech-shell-icon-btn"
        onClick={() => setOpen((o) => !o)}
        title="Appearance"
        aria-label="Appearance"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon name="settings" size={18} />
      </button>
      {open && (
        <div className="tech-shell-appearance-panel">
          <p className="tech-shell-appearance-title">Appearance</p>
          <ThemePicker />
        </div>
      )}
    </div>
  );
}

// The entire authenticated app for a Technician-only user (see
// auth/session.ts' isTechnicianOnly) — no Sidebar, no other tabs, nothing
// to navigate. Replaces the whole AppShell/<Routes> tree in App.tsx for
// this one case: "technician will not see any tabs, only the required
// work from him... he can't see any other tabs on the app at all" (the
// user's own words).
//
// Bug-hunt: this shell had no NotificationBell at all — the bell is only
// ever mounted by the normal AppShell (App.tsx's ShellRoot), which this
// shell replaces entirely rather than extends, so a Technician-only
// account had no way to ever see a routine-assigned notification even
// though Notifications.js was recording one correctly. EmbeddedNavProvider
// wraps this shell so both the bell's and ShellThemeProvider's own
// useEmbeddedNav() calls don't throw for lack of a provider — nothing
// ever registers with it here, since this shell never mounts the embedded
// oil-analysis bundle; the bell's onOpenRoutine prop below is what
// actually makes a click do something in THIS shell.
//
// Appearance: the user asked for a Technician to be able to pick their own
// theme too — this shell used to hardcode a single dark palette on
// purpose ("not something they'd customize"), but TechnicianShell.css and
// MyWork.css were already written against the shared --shell-* custom
// properties (same convention App.tsx's ShellRoot/Sidebar.css use), just
// never had them set. Wiring ShellThemeProvider in and setting those same
// variables here is what actually makes AppearanceMenu's ThemePicker do
// anything.
function TechnicianShellInner() {
  const { claims, logout } = useAuth();
  const { palette } = useShellTheme();
  const [openRoutineId, setOpenRoutineId] = useState<string | null>(null);

  const themeVars = {
    '--shell-bg': palette.appBg,
    '--shell-card-bg': palette.cardBg,
    '--shell-border': palette.border,
    '--shell-text': palette.textPrimary,
    '--shell-text-secondary': palette.textSecondary,
    '--shell-accent': palette.accent,
    '--shell-accent-text': palette.accentText,
  } as CSSProperties;

  return (
    <div className="tech-shell" style={themeVars}>
      <header className="tech-shell-header">
        <div className="tech-shell-brand">
          <img
            src={`${import.meta.env.BASE_URL}brand/acc-leaf-mark.png`}
            alt=""
            className="tech-shell-logo"
          />
          <span className="tech-shell-title">My Work</span>
        </div>
        <div className="tech-shell-user">
          <AppearanceMenu />
          <NotificationBell onOpenRoutine={setOpenRoutineId} />
          {claims && <span className="tech-shell-email">{claims.email}</span>}
          <button className="tech-shell-logout" onClick={logout} type="button" title="Sign out">
            <Icon name="logout" size={16} />
            <span>Sign out</span>
          </button>
        </div>
      </header>
      <main className="tech-shell-content">
        <MyWork
          showHeading={false}
          initialRoutineId={openRoutineId}
          onInitialRoutineConsumed={() => setOpenRoutineId(null)}
        />
      </main>
    </div>
  );
}

export default function TechnicianShell() {
  return (
    <EmbeddedNavProvider>
      <ShellThemeProvider>
        <TechnicianShellInner />
      </ShellThemeProvider>
    </EmbeddedNavProvider>
  );
}
