import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { NAV_ITEMS } from '../navigation';
import './Sidebar.css';

export default function Sidebar() {
  const { claims, logout } = useAuth();

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
                className={({ isActive }) => (isActive ? 'sidebar-link sidebar-link--active' : 'sidebar-link')}
                to={item.to}
                end={item.to === '/'}
              >
                {item.label}
              </NavLink>
            </li>
          ),
        )}
      </ul>
      <div className="sidebar-footer">
        {claims && <span className="sidebar-user">{claims.email}</span>}
        <button className="sidebar-logout" onClick={logout} type="button">
          Sign out
        </button>
      </div>
    </nav>
  );
}
