import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useEmbeddedNav } from '../embeddedNav';
import ThemePicker from './ThemePicker';
import { Icon, TablerIcon } from '../icons';
import { NAV_ITEMS } from '../navigation';
import './Sidebar.css';

const TOP_ICON: Record<string, string> = {
  '/': 'dashboard',
  '/vibration-analysis': 'graphs',
  '/oil-analysis': 'droplet',
};

export default function Sidebar() {
  const { claims, logout } = useAuth();
  const location = useLocation();
  const embeddedNav = useEmbeddedNav();
  const [themeOpen, setThemeOpen] = useState(false);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const [popoverBottom, setPopoverBottom] = useState(16);

  useEffect(() => {
    if (!themeOpen || !settingsBtnRef.current) return;
    const r = settingsBtnRef.current.getBoundingClientRect();
    setPopoverBottom(Math.max(16, window.innerHeight - r.bottom));
  }, [themeOpen]);

  return (
    <div className="sidebar-rail">
      <nav className="sidebar-nav-root" aria-label="Primary">
        <div className="sidebar-logo">
          <img src={`${import.meta.env.BASE_URL}brand/acc-leaf-mark.png`} alt="" className="sidebar-logo-mark" />
          <img
            src={`${import.meta.env.BASE_URL}brand/acc-logo-full.png`}
            alt="ACC Reliability"
            className="sidebar-logo-full"
          />
        </div>

        <ul className="sidebar-nav">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
            const showSubTabs = isActive && embeddedNav.moduleId && embeddedNav.pages.length > 0;

            return (
              <li key={item.to}>
                <NavLink
                  className={({ isActive: navActive }) =>
                    navActive ? 'sidebar-link sidebar-link--active' : 'sidebar-link'
                  }
                  to={item.to}
                  end={item.to === '/'}
                >
                  <span className="sidebar-link-icon">
                    <Icon name={TOP_ICON[item.to] ?? 'dashboard'} size={18} />
                  </span>
                  <span className="sidebar-link-label">{item.label}</span>
                </NavLink>

                {showSubTabs && (
                  <ul className="sidebar-subnav">
                    {embeddedNav.pages.map((page) => (
                      <li key={page.id}>
                        <button
                          type="button"
                          className={
                            page.id === embeddedNav.activePage
                              ? 'sidebar-sublink sidebar-sublink--active'
                              : 'sidebar-sublink'
                          }
                          onClick={() => embeddedNav.navigateTo(page.id)}
                        >
                          <span className="sidebar-link-icon">
                            {embeddedNav.moduleId === 'oil-analysis' ? (
                              <TablerIcon className={page.icon} size={15} />
                            ) : (
                              <Icon name={page.icon} size={15} />
                            )}
                          </span>
                          <span className="sidebar-link-label">{page.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>

        <div className="sidebar-footer">
          <button
            ref={settingsBtnRef}
            type="button"
            className={
              themeOpen ? 'sidebar-link sidebar-settings-link sidebar-link--active' : 'sidebar-link sidebar-settings-link'
            }
            onClick={() => setThemeOpen((open) => !open)}
          >
            <span className="sidebar-link-icon">
              <Icon name="settings" size={18} />
            </span>
            <span className="sidebar-link-label">Settings</span>
          </button>
          {claims && <span className="sidebar-user">{claims.email}</span>}
          <button className="sidebar-logout" onClick={logout} type="button" title="Sign out">
            <Icon name="logout" size={16} />
            <span className="sidebar-link-label">Sign out</span>
          </button>
        </div>
      </nav>

      {themeOpen && (
        <>
          {/* Fixed positioning (not clipped by the rail's overflow:hidden, since
              the rail sets no transform/contain of its own) is what lets this
              popover stay open and visible over whatever module is currently
              mounted, instead of navigating to a page that would unmount it —
              that's what makes an instant theme change actually visible in
              place, on whatever tab you're on. */}
          <div className="theme-popover-backdrop" onClick={() => setThemeOpen(false)} />
          <div className="theme-popover" style={{ bottom: popoverBottom }}>
            <ThemePicker />
          </div>
        </>
      )}
    </div>
  );
}
