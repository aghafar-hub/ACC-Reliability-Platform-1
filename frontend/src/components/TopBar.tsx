import { useRef, useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useEmbeddedNav } from '../embeddedNav';
import { Icon, TablerIcon } from '../icons';
import { NAV_ITEMS } from '../navigation';
import NotificationBell from './NotificationBell';
import './TopBar.css';

// Shell-level TopBar (Patch 28) — matches the reference mockup's own bar:
// a breadcrumb for whichever module/sub-tab is active, a language toggle
// (UI-only for now — "make it no on front end but we will not design the
// full arabic view now," the user's own words), the notification bell
// (moved in from its old floating position, see NotificationBell.css),
// a settings shortcut, and a user-profile dropdown that now carries what
// used to be Sidebar's bottom account block (email + Sign out) — "replace
// sidebar, no duplicate," confirmed directly by the user, so that block
// was removed from Sidebar.tsx when this shipped.
function useBreadcrumb() {
  const location = useLocation();
  const embeddedNav = useEmbeddedNav();
  const item = NAV_ITEMS.find((i) => (i.to === '/' ? location.pathname === '/' : location.pathname.startsWith(i.to)));
  if (!item) return { module: 'Reliability Platform', page: '' };
  const activeSubTabId = item.moduleId ? embeddedNav.activePageFor(item.moduleId) : null;
  const subTab = item.subTabs?.find((t) => t.id === activeSubTabId);
  return { module: item.label, page: subTab?.label || '' };
}

export default function TopBar() {
  const { claims, logout } = useAuth();
  const { module, page } = useBreadcrumb();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    // Keyboard users can open this menu (it's a real <button>) but had no
    // way to close it short of a mouse click elsewhere -- Escape matches
    // the standard disclosure-widget pattern.
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const email = claims?.email || '';
  const role = (claims?.roles || [])[0] || '';
  const initials = email.slice(0, 2).toUpperCase() || '?';

  return (
    <header className="shell-topbar">
      <div className="shell-topbar-crumb">
        <span className="shell-topbar-module">{module}</span>
        {page && (
          <>
            <span className="shell-topbar-sep">/</span>
            <span className="shell-topbar-page">{page}</span>
          </>
        )}
      </div>

      <div className="shell-topbar-actions">
        <button type="button" className="shell-topbar-lang" title="Language — Arabic view not built yet">
          EN <span className="shell-topbar-lang-sep">/</span> عربي
        </button>

        <NotificationBell />

        <NavLink to="/settings" className="shell-topbar-icon-btn" title="Settings">
          <Icon name="settings" size={18} />
        </NavLink>

        <div className="shell-topbar-user" ref={menuRef}>
          <button
            type="button"
            className="shell-topbar-user-trigger"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="shell-topbar-avatar">{initials}</span>
            <span className="shell-topbar-user-info">
              <span className="shell-topbar-user-name">{email}</span>
              {role && <span className="shell-topbar-user-role">{role}</span>}
            </span>
            <TablerIcon className="ti-chevron-down" size={14} />
          </button>
          {menuOpen && (
            <div className="shell-topbar-user-menu">
              <NavLink to="/settings" className="shell-topbar-user-menu-item" onClick={() => setMenuOpen(false)}>
                <Icon name="settings" size={15} /> Settings
              </NavLink>
              <button type="button" className="shell-topbar-user-menu-item" onClick={logout}>
                <Icon name="logout" size={15} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
