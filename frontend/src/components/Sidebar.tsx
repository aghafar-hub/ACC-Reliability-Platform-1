import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useEmbeddedNav } from '../embeddedNav';
import { Icon, TablerIcon } from '../icons';
import { NAV_ITEMS, type SubTab } from '../navigation';
import './Sidebar.css';

function SubTabIcon({ icon, size }: { icon: string; size: number }) {
  return icon.startsWith('ti-') ? <TablerIcon className={icon} size={size} /> : <Icon name={icon} size={size} />;
}

// A "native" sub-tab (no `to`) is a page the embedded legacy app itself
// renders — clicking it tells that app's own navigate function (via
// navBridge, see embeddedNav.tsx) which page to show, a no-op if the app
// hasn't mounted yet (first-ever visit), and separately navigates the
// route to baseRoute so the module is actually visible — both embedded
// apps stay mounted for the whole session once first visited (see
// EmbeddedOilAnalysis.tsx / EmbeddedVibrationAnalysis.tsx), just hidden via
// CSS when not the active route, so this may just be un-hiding an app
// that's had this exact state sitting ready the whole time. A "routed"
// sub-tab (has `to`) is just a real route in this app, unaffected by any
// of this. See navigation.ts's file comment for why both kinds exist side
// by side.
function SubTabItem({ tab, baseRoute, moduleId }: { tab: SubTab; baseRoute: string; moduleId: string }) {
  const embeddedNav = useEmbeddedNav();
  const location = useLocation();
  const navigate = useNavigate();

  if (tab.to) {
    return (
      <NavLink
        className={({ isActive }) => (isActive ? 'sidebar-sublink sidebar-sublink--active' : 'sidebar-sublink')}
        to={tab.to}
      >
        <span className="sidebar-link-icon">
          <SubTabIcon icon={tab.icon} size={15} />
        </span>
        <span className="sidebar-link-label">{tab.label}</span>
      </NavLink>
    );
  }

  function handleClick() {
    embeddedNav.navigateTo(moduleId, tab.id);
    if (location.pathname !== baseRoute) navigate(baseRoute);
  }

  return (
    <button
      type="button"
      className={
        tab.id === embeddedNav.activePageFor(moduleId) ? 'sidebar-sublink sidebar-sublink--active' : 'sidebar-sublink'
      }
      onClick={handleClick}
    >
      <span className="sidebar-link-icon">
        <SubTabIcon icon={tab.icon} size={15} />
      </span>
      <span className="sidebar-link-label">{tab.label}</span>
    </button>
  );
}

export default function Sidebar() {
  const { claims, logout } = useAuth();
  const location = useLocation();

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
            const isActive = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
            const showSubTabs = isActive && !!item.subTabs?.length;

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
                    <Icon name={item.icon} size={18} />
                  </span>
                  <span className="sidebar-link-label">{item.label}</span>
                </NavLink>

                {showSubTabs && (
                  <ul className="sidebar-subnav">
                    {item.subTabs!.map((tab) => (
                      <li key={tab.id}>
                        <SubTabItem tab={tab} baseRoute={item.to} moduleId={item.moduleId!} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>

        <div className="sidebar-footer">
          <NavLink
            className={({ isActive: navActive }) =>
              navActive ? 'sidebar-link sidebar-settings-link sidebar-link--active' : 'sidebar-link sidebar-settings-link'
            }
            to="/settings"
          >
            <span className="sidebar-link-icon">
              <Icon name="settings" size={18} />
            </span>
            <span className="sidebar-link-label">General Settings</span>
          </NavLink>
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
