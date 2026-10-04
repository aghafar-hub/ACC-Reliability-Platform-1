import { NavLink, useLocation } from 'react-router-dom';
import { tapHaptic } from '../haptics';
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
  const primaryIndex = PRIMARY_ITEMS.findIndex((item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
  );
  // 5 equal-width slots (4 primary + More) — the sliding indicator just
  // needs to know which one of the 5 to sit under; -1 (no primary tab
  // active) means "More" owns it, slot index 4.
  const activeSlot = primaryIndex === -1 ? PRIMARY_ITEMS.length : primaryIndex;

  return (
    <nav className="bottom-nav" aria-label="Primary">
      <span
        className="bottom-nav-indicator"
        style={{ transform: `translateX(${activeSlot * 100}%)` }}
        aria-hidden="true"
      />
      {PRIMARY_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={tapHaptic}
          className={({ isActive }) =>
            isActive ? 'bottom-nav-item bottom-nav-item--active tap-scale' : 'bottom-nav-item tap-scale'
          }
        >
          <Icon name={item.icon} size={21} />
          <span>{item.label}</span>
        </NavLink>
      ))}
      <button
        type="button"
        className={
          primaryIndex === -1 ? 'bottom-nav-item bottom-nav-item--active tap-scale' : 'bottom-nav-item tap-scale'
        }
        onClick={() => {
          tapHaptic();
          onOpenMore();
        }}
      >
        <Icon name="menu" size={21} />
        <span>More</span>
      </button>
    </nav>
  );
}
