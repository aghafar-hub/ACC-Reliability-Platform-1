import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useEmbeddedNav } from '../embeddedNav';
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

  return (
    <div className="sidebar-rail">
      <nav className="sidebar-panel" aria-label="Primary">
        <div className="sidebar-logo">
          <img src="/brand/acc-leaf-mark.png" alt="" className="sidebar-logo-mark" />
          <img src="/brand/acc-logo-full.png" alt="ACC Reliability" className="sidebar-logo-full" />
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
          {claims && <span className="sidebar-user">{claims.email}</span>}
          <button className="sidebar-logout" onClick={logout} type="button" title="Sign out">
            <Icon name="logout" size={16} />
            <span className="sidebar-link-label">Sign out</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
