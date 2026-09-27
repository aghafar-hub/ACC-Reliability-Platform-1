import { NavLink, Outlet } from 'react-router-dom';
import './OilAnalysisLayout.css';

/**
 * Secondary, in-module navigation nested under the shared sidebar — per
 * the agreed information architecture (main sidebar for modules, tabs
 * within a module's own content area for its sections), not a second
 * full sidebar.
 */
export default function OilAnalysisLayout() {
  return (
    <div className="oa-layout">
      <h1>Oil Analysis</h1>
      <nav className="oa-tabs" aria-label="Oil Analysis sections">
        <NavLink className={({ isActive }) => (isActive ? 'oa-tab oa-tab--active' : 'oa-tab')} to="routines">
          Routines
        </NavLink>
        <NavLink className={({ isActive }) => (isActive ? 'oa-tab oa-tab--active' : 'oa-tab')} to="lp-register">
          LP Register
        </NavLink>
      </nav>
      <div className="oa-section">
        <Outlet />
      </div>
    </div>
  );
}
