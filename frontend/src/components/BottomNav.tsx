import { NavLink, useLocation } from 'react-router-dom';
import { Icon } from '../icons';
import './BottomNav.css';

// App-like bottom tab bar (Patch 34) — the primary navigation surface on a
// phone, replacing "navigate via the sidebar" with the pattern users
// actually associate with a normal installed app. Only visible <=860px
// (BottomNav.css), same breakpoint as Sidebar's overlay mode and TopBar's
// hamburger button — all three must agree on where "mobile" starts.
//
// Only 4 primary slots fit well on a phone without feeling cramped, so this
// is deliberately NOT every item in navigation.ts's NAV_ITEMS (7 total) —
// confirmed directly by the user: Dashboard, Oil Lubrication, Vibration
// Analysis, and My Work are the ones actually built/used today; Equipment,
// Reliability Measures, and Compressors (all still placeholders, see
// App.tsx's ComingSoon routes) live behind "More" instead, which reuses
// the exact same slide-in Sidebar overlay the hamburger button opens
// (onOpenMore === TopBar's onOpenMenu, both drive App.tsx's mobileNavOpen)
// — also the user's own call: no second navigation UI to design/build.
const PRIMARY_ITEMS = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/oil-analysis', label: 'Oil Lub.', icon: 'droplet', end: false },
  { to: '/vibration-analysis', label: 'Vibration', icon: 'graphs', end: false },
  { to: '/my-work', label: 'My Work', icon: 'action', end: false },
] as const;

export default function BottomNav({ onOpenMore }: { onOpenMore: () => void }) {
  const location = useLocation();
  // "More" highlights whenever the active route isn't one of the 4 primary
  // tabs, so the bar always shows where you are, even for a page (Settings,
  // Equipment, Reliability Measures, Compressors) that only lives behind it.
  const onPrimaryTab = PRIMARY_ITEMS.some((item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
  );

  return (
    <nav className="bottom-nav" aria-label="Primary">
      {PRIMARY_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => (isActive ? 'bottom-nav-item bottom-nav-item--active' : 'bottom-nav-item')}
        >
          <Icon name={item.icon} size={21} />
          <span>{item.label}</span>
        </NavLink>
      ))}
      <button
        type="button"
        className={onPrimaryTab ? 'bottom-nav-item' : 'bottom-nav-item bottom-nav-item--active'}
        onClick={onOpenMore}
      >
        <Icon name="menu" size={21} />
        <span>More</span>
      </button>
    </nav>
  );
}
