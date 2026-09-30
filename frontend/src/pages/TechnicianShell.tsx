import { useAuth } from '../auth/AuthContext';
import { Icon } from '../icons';
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
export default function TechnicianShell() {
  const { claims, logout } = useAuth();

  return (
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
          {claims && <span className="tech-shell-email">{claims.email}</span>}
          <button className="tech-shell-logout" onClick={logout} type="button" title="Sign out">
            <Icon name="logout" size={16} />
            <span>Sign out</span>
          </button>
        </div>
      </header>
      <main className="tech-shell-content">
        <MyWork showHeading={false} />
      </main>
    </div>
  );
}
