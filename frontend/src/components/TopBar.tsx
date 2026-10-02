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
  if (!item) return { module: 'Reliability Platform', page: '', moduleId: null as string | null };
  const activeSubTabId = item.moduleId ? embeddedNav.activePageFor(item.moduleId) : null;
  const subTab = item.subTabs?.find((t) => t.id === activeSubTabId);
  return { module: item.label, page: subTab?.label || '', moduleId: item.moduleId ?? null };
}

// Patch 35 ("make it one [top bar]"): the browser's own global network
// status — not module-specific, so no bridge round-trip needed, unlike
// Sync below.
function useOnlineStatus() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export default function TopBar({ onOpenMenu }: { onOpenMenu?: () => void }) {
  const { claims, logout } = useAuth();
  const embeddedNav = useEmbeddedNav();
  const { module, page, moduleId } = useBreadcrumb();
  const online = useOnlineStatus();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // Only set once that module has actually reported in at least once (see
  // EmbeddedOilAnalysis.tsx's onSyncStateChange) — null while still
  // mounting/never registered, not while merely "not inside a module."
  const syncInfo = moduleId ? embeddedNav.syncInfoFor(moduleId) : null;

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
        {/* Only visible via CSS at the <=860px breakpoint (TopBar.css) —
            opens Sidebar's mobile overlay, see App.tsx's mobileNavOpen. */}
        <button type="button" className="shell-topbar-menu-btn" onClick={onOpenMenu} aria-label="Open navigation menu">
          <Icon name="menu" size={20} />
        </button>
        <span className="shell-topbar-module">{module}</span>
        {page && (
          <>
            <span className="shell-topbar-sep">/</span>
            <span className="shell-topbar-page">{page}</span>
          </>
        )}
      </div>

      <div className="shell-topbar-actions">
        {/* Patch 35: this module's own Sync button/pending-upload count,
            shown here instead of the module rendering a second bar below
            this one for it — see embeddedNav.tsx's NavBridge.sync/
            onSyncStateChange and EmbeddedOilAnalysis.tsx. Online/offline is
            the browser's own global status, not module-specific, but only
            worth showing alongside Sync (inside a syncable module) rather
            than cluttering every other page. */}
        {syncInfo && (
          <div className="shell-topbar-sync">
            {syncInfo.pendingSyncCount > 0 && (
              <span
                className="shell-topbar-pending"
                title="Saved on this device — will upload automatically once there's a connection"
              >
                <TablerIcon className="ti-cloud-upload" size={13} />
                <span>
                  {syncInfo.pendingSyncCount} {syncInfo.pendingSyncCount === 1 ? 'entry' : 'entries'} pending
                </span>
              </span>
            )}
            <span
              className={online ? 'shell-topbar-online shell-topbar-online--up' : 'shell-topbar-online shell-topbar-online--down'}
              title={online ? 'Browser is online' : 'Browser is offline — changes will sync once reconnected'}
            >
              <span className="shell-topbar-online-dot" />
              <span>{online ? 'Online' : 'Offline'}</span>
            </span>
            <button
              type="button"
              className="shell-topbar-sync-btn"
              onClick={() => moduleId && embeddedNav.triggerSync(moduleId)}
              disabled={syncInfo.syncState === 'loading'}
            >
              <TablerIcon className={syncInfo.syncState === 'loading' ? 'ti-loader shell-topbar-sync-spin' : 'ti-refresh'} size={14} />
              <span>{syncInfo.syncState === 'loading' ? '…' : 'Sync'}</span>
            </button>
          </div>
        )}

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
