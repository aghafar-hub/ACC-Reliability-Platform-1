import { useShellTheme } from '../shellTheme';
import { THEME_PALETTES } from '../theme';
import './ThemePicker.css';

// The shared theme swatch grid — used by the platform Settings page.
// Picking a theme updates ShellThemeContext, which re-renders the Sidebar
// and every shell page immediately, pushes live into whichever embedded
// module is currently mounted, and persists into both modules' own storage
// so it's already correct next time either one is opened too.
export default function ThemePicker() {
  const { themeName, setThemeName } = useShellTheme();

  return (
    <div className="theme-grid">
      {THEME_PALETTES.map((theme) => {
        const active = theme.name === themeName;
        return (
          <button
            key={theme.name}
            type="button"
            className={active ? 'theme-swatch theme-swatch--active' : 'theme-swatch'}
            onClick={() => setThemeName(theme.name)}
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
  );
}
