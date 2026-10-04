import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { EmbeddedNavProvider } from '../embeddedNav';
import { Icon } from '../icons';
import NotificationBell from '../components/NotificationBell';
import MyWork from './MyWork';
import './TechnicianShell.css';

// The entire authenticated app for a Technician-only user (see
// auth/session.ts' isTechnicianOnly) — no Sidebar, no other tabs, nothing
// to navigate. Replaces the whole AppShell/<Routes> tree in App.tsx for
// this one case: "technician will not see any tabs, only the required
// work from him... he can't see any other tabs on the app at all" (the
// user's own words). The content area is a placeholder until Increment 4
// builds the real My Work list/detail screens — this increment is only
// about the shell split itself.
//
// Bug-hunt: this shell had no NotificationBell at all — the bell is only
// ever mounted by the normal AppShell (App.tsx's ShellRoot), which this
// shell replaces entirely rather than extends, so a Technician-only
// account had no way to ever see a routine-assigned notification even
// though Notifications.js was recording one correctly. EmbeddedNavProvider
// wraps this shell purely so the bell's own useEmbeddedNav() call (needed
// for the normal shell's deep-link path) doesn't throw for lack of a
// provider — nothing ever registers with it here, since this shell never
// mounts the embedded oil-analysis bundle; the bell's onOpenRoutine prop
// below is what actually makes a click do something in THIS shell.
export default function TechnicianShell() {
  const { claims, logout } = useAuth();
  const [openRoutineId, setOpenRoutineId] = useState<string | null>(null);

  return (
    <EmbeddedNavProvider>
      <div className="tech-shell">
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
    </EmbeddedNavProvider>
  );
}
