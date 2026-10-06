import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEmbeddedNav } from '../embeddedNav';
import { Icon, TablerIcon } from '../icons';
import { type SubTab } from '../navigation';
import { useVisibleNav } from '../hooks/useVisibleNav';
import { tabLevel, useModuleAccess } from '../moduleAccess';
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
function SubTabItem({
  tab,
  baseRoute,
  moduleId,
  onNavigate,
}: {
  tab: SubTab;
  baseRoute: string;
  moduleId: string;
  onNavigate: () => void;
}) {
  const embeddedNav = useEmbeddedNav();
  const location = useLocation();
  const navigate = useNavigate();

  if (tab.to) {
    return (
      <NavLink
        className={({ isActive }) => (isActive ? 'sidebar-sublink sidebar-sublink--active' : 'sidebar-sublink')}
        to={tab.to}
        onClick={onNavigate}
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
    onNavigate();
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

// `mobileOpen`/`onCloseMobile` drive the narrow-viewport overlay mode (see
// Sidebar.css's <=860px breakpoint) — a slide-in panel with a backdrop,
// toggled from TopBar's hamburger button, replacing the old "permanently
// force the hover-expand rail open" fallback that used to eat ~65% of a
// real phone's screen width with no way to dismiss it. Above that
// breakpoint these props are simply unused — the rail keeps its normal
// hover/focus-expand desktop behavior.
export default function Sidebar({ mobileOpen = false, onCloseMobile }: { mobileOpen?: boolean; onCloseMobile?: () => void }) {
  const location = useLocation();
  const embeddedNav = useEmbeddedNav();
  const closeMobile = onCloseMobile ?? (() => {});
  const navItems = useVisibleNav();
  const { access } = useModuleAccess();

  // A module's sub-tab list used to show unconditionally the whole time its
  // route was active, with no way to close it short of leaving the module
  // entirely — clicking "Oil Lubrication" again while already inside one of
  // its own sub-tabs did nothing (NavLink no-ops navigating to the route
  // it's already on), reported directly by the user. Tracks which active
  // module's sub-list has been manually collapsed; reset on every real
  // route change (not on a native sub-tab switch, which never touches the
  // route at all — see SubTabItem's own comment) so leaving and coming back
  // to a module always shows its sub-tabs expanded again rather than
  // staying collapsed from an unrelated earlier visit.
  const [collapsedModuleTo, setCollapsedModuleTo] = useState<string | null>(null);
  useEffect(() => {
    setCollapsedModuleTo(null);
  }, [location.pathname]);

  return (
    <>
      {/* Only ever visible (via CSS) at the narrow breakpoint, and only once
          mobileOpen — see .sidebar-mobile-backdrop in Sidebar.css. */}
      <div
        className={mobileOpen ? 'sidebar-mobile-backdrop sidebar-mobile-backdrop--open' : 'sidebar-mobile-backdrop'}
        onClick={closeMobile}
        aria-hidden="true"
      />
      <div className={mobileOpen ? 'sidebar-rail sidebar-rail--mobile-open' : 'sidebar-rail'}>
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
            {navItems.map((item) => {
              const isActive = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
              const showSubTabs = isActive && !!item.subTabs?.length && collapsedModuleTo !== item.to;

              return (
                <li key={item.to}>
                  <NavLink
                    className={({ isActive: navActive }) =>
                      navActive ? 'sidebar-link sidebar-link--active' : 'sidebar-link'
                    }
                    to={item.to}
                    end={item.to === '/'}
                    onClick={(e) => {
                      // Already on this module's own route and it has
                      // sub-tabs — a second click can't navigate anywhere
                      // new (same route), so it toggles the sub-list
                      // instead; collapsing also sends the module back to
                      // its own first/default sub-tab (index 0 is each
                      // module's own Dashboard — see navigation.ts), which
                      // is what "going back to Oil Lubrication" means when
                      // you were sitting on some other sub-tab.
                      if (isActive && item.subTabs?.length && item.moduleId) {
                        e.preventDefault();
                        setCollapsedModuleTo((cur) => {
                          const collapsing = cur !== item.to;
                          if (collapsing) embeddedNav.navigateTo(item.moduleId!, item.subTabs![0].id);
                          return collapsing ? item.to : null;
                        });
                      } else if (item.moduleId && item.subTabs?.length) {
                        // Phase 0: don't open a module on a page this person
                        // can't see (e.g. its Dashboard) — start them on the
                        // first one they can.
                        const current = embeddedNav.activePageFor(item.moduleId) || item.subTabs[0].id;
                        if (tabLevel(access[item.moduleId], current) === 'Hidden') {
                          embeddedNav.navigateTo(item.moduleId, item.subTabs[0].id);
                        }
                      }
                      closeMobile();
                    }}
                  >
                    <span className="sidebar-link-icon">
                      <Icon name={item.icon} size={18} />
                    </span>
                    <span className="sidebar-link-label">{item.label}</span>
                    {item.moduleId && embeddedNav.loadStateFor(item.moduleId) === 'loading' && (
                      <span className="sidebar-link-loading" title="Preparing this module in the background…" />
                    )}
                  </NavLink>

                  {showSubTabs && (
                    <ul className="sidebar-subnav">
                      {item.subTabs!.map((tab) => (
                        <li key={tab.id}>
                          <SubTabItem tab={tab} baseRoute={item.to} moduleId={item.moduleId!} onNavigate={closeMobile} />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </>
  );
}
