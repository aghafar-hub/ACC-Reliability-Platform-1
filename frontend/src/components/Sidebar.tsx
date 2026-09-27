import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from '../navigation';
import './Sidebar.css';

/**
 * Vibration Analysis and Oil Analysis are separate standalone apps
 * (spec: "apps/" copied in as-is, never edited) — their nav items use a
 * plain <a> so the browser does a full navigation to that app's own
 * built page, rather than <NavLink>, which would try to route to them
 * as if they were part of this SPA.
 */
export default function Sidebar() {
  return (
    <nav className="sidebar" aria-label="Primary">
      <div className="sidebar-brand">ACC Reliability</div>
      <ul className="sidebar-nav">
        {NAV_ITEMS.map((item) =>
          item.external ? (
            <li key={item.to}>
              <a className="sidebar-link" href={item.to}>
                {item.label}
              </a>
            </li>
          ) : (
            <li key={item.to}>
              <NavLink
                className={({ isActive }) =>
                  isActive ? 'sidebar-link sidebar-link--active' : 'sidebar-link'
                }
                to={item.to}
                end
              >
                {item.label}
              </NavLink>
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}
