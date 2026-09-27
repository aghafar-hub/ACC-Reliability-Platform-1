import { useState } from 'react';
import { useEmbeddedNav } from '../embeddedNav';
import { getPlatformTheme, persistPlatformTheme, THEME_PREVIEWS } from '../theme';
import './Settings.css';

// Platform-level Settings — currently just the shared theme picker that used
// to live separately inside each module's own Settings (see each app's own
// Settings.jsx, which now hides its Theme section and points here instead).
// Picking a theme here applies instantly to whichever module is currently
// mounted (via embeddedNav's pushTheme) and is written into both modules'
// own storage so it's already correct next time either one is opened too.
export default function Settings() {
  const embeddedNav = useEmbeddedNav();
  const [activeTheme, setActiveTheme] = useState(() => getPlatformTheme());

  function chooseTheme(name: string) {
    setActiveTheme(name);
    persistPlatformTheme(name);
    embeddedNav.pushTheme(name);
  }

  return (
    <div>
      <h1>Settings</h1>
      <p className="settings-intro">
        Choose a colour theme for Vibration Analysis and Oil Analysis. Applies instantly.
      </p>
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
