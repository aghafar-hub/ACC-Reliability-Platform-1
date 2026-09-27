import { useState } from 'react';
import { useEmbeddedNav } from '../embeddedNav';
import { getPlatformTheme, persistPlatformTheme, THEME_PREVIEWS } from '../theme';
import './ThemePicker.css';

// The shared theme picker — used inside the sidebar's Settings popover (see
// Sidebar.tsx). Picking a theme applies instantly to whichever module is
// currently mounted (via embeddedNav's pushTheme) and is written into both
// modules' own storage so it's already correct next time either one is
// opened too. Rendered as a popover rather than a routed page specifically
// so choosing a theme never unmounts whatever module you're currently on —
// that's what makes "instant" actually visible in place, not just true on
// next visit.
export default function ThemePicker() {
  const embeddedNav = useEmbeddedNav();
  const [activeTheme, setActiveTheme] = useState(() => getPlatformTheme());

  function chooseTheme(name: string) {
    setActiveTheme(name);
    persistPlatformTheme(name);
    embeddedNav.pushTheme(name);
  }

  return (
    <div className="theme-picker">
      <p className="theme-picker-title">Theme</p>
      <p className="theme-picker-intro">Applies instantly, on every tab and module.</p>
      <div className="theme-grid">
        {THEME_PREVIEWS.map((theme) => {
          const active = theme.name === activeTheme;
          return (
            <button
              key={theme.name}
              type="button"
              className={active ? 'theme-swatch theme-swatch--active' : 'theme-swatch'}
              onClick={() => chooseTheme(theme.name)}
            >
              <span
                className="theme-swatch-preview"
                style={{ background: theme.appBg, borderColor: active ? theme.accent : 'transparent' }}
              >
                <span className="theme-swatch-sidebar" style={{ background: theme.sidebarBg }} />
                <span className="theme-swatch-accent" style={{ background: theme.accent }} />
              </span>
              <span className="theme-swatch-label">
                {theme.name}
                {active && <span className="theme-swatch-check">✓</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
