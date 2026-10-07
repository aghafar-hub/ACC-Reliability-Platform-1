import { NavLink } from "react-router-dom";
import { useEmbeddedNav } from "../embeddedNav";
import { Icon } from "../icons";
import { useVisibleNav } from "../hooks/useVisibleNav";
import { tabLevel, useModuleAccess } from "../moduleAccess";
import "./Sidebar.css";

// `mobileOpen`/`onCloseMobile` drive the narrow-viewport overlay mode (see
// Sidebar.css's <=860px breakpoint) — a slide-in panel with a backdrop,
// toggled from TopBar's hamburger button, replacing the old "permanently
// force the hover-expand rail open" fallback that used to eat ~65% of a
// real phone's screen width with no way to dismiss it. Above that
// breakpoint these props are simply unused — the rail keeps its normal
// hover/focus-expand desktop behavior.
export default function Sidebar({
  mobileOpen = false,
  onCloseMobile,
}: {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const embeddedNav = useEmbeddedNav();
  const closeMobile = onCloseMobile ?? (() => {});
  const navItems = useVisibleNav();
  const { access } = useModuleAccess();

  return (
    <>
      {/* Only ever visible (via CSS) at the narrow breakpoint, and only once
          mobileOpen — see .sidebar-mobile-backdrop in Sidebar.css. */}
      <div
        className={
          mobileOpen
            ? "sidebar-mobile-backdrop sidebar-mobile-backdrop--open"
            : "sidebar-mobile-backdrop"
        }
        onClick={closeMobile}
        aria-hidden="true"
      />
      <div
        className={
          mobileOpen ? "sidebar-rail sidebar-rail--mobile-open" : "sidebar-rail"
        }
      >
        <nav className="sidebar-nav-root" aria-label="Primary">
          <div className="sidebar-logo">
            <img
              src={`${import.meta.env.BASE_URL}brand/acc-leaf-mark.png`}
              alt=""
              className="sidebar-logo-mark"
            />
            <img
              src={`${import.meta.env.BASE_URL}brand/acc-logo-full.png`}
              alt="ACC Reliability"
              className="sidebar-logo-full"
            />
          </div>

          <ul className="sidebar-nav">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  className={({ isActive: navActive }) =>
                    navActive
                      ? "sidebar-link sidebar-link--active"
                      : "sidebar-link"
                  }
                  to={item.to}
                  end={item.to === "/"}
                  onClick={() => {
                    // Phase 0: don't open a module on a page this person
                    // can't see (e.g. its Dashboard) — start them on the
                    // first one they can. The module's pages themselves
                    // are tabs across the top now (ModuleTabs.tsx).
                    if (item.moduleId && item.subTabs?.length) {
                      const current =
                        embeddedNav.activePageFor(item.moduleId) ||
                        item.subTabs[0].id;
                      if (
                        tabLevel(access[item.moduleId], current) === "Hidden"
                      ) {
                        embeddedNav.navigateTo(
                          item.moduleId,
                          item.subTabs[0].id,
                        );
                      }
                    }
                    closeMobile();
                  }}
                >
                  <span className="sidebar-link-icon">
                    <Icon name={item.icon} size={18} />
                  </span>
                  <span className="sidebar-link-label">{item.label}</span>
                  {item.moduleId &&
                    embeddedNav.loadStateFor(item.moduleId) === "loading" && (
                      <span
                        className="sidebar-link-loading"
                        title="Preparing this module in the background…"
                      />
                    )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </>
  );
}
