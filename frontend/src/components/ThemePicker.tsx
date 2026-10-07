import { useShellTheme } from '../shellTheme';
import { THEME_PALETTES } from '../theme';
import './ThemePicker.css';

// What each theme is for — shown under its name so people pick by situation.
const THEME_HINTS: Record<string, string> = {
  'ACC Light': 'Default · offices and everyday use',
  'Warm Paper': 'Softer light · long reading and reports',
  'High Contrast': 'Outdoors in sunlight · dusty screens',
  'Navy Dark': 'Control room · wall screens',
  'Carbon Dark': 'Night shift · easier on phone batteries',
};

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
            {THEME_HINTS[theme.name] && <span className="theme-swatch-hint">{THEME_HINTS[theme.name]}</span>}
          </button>
        );
      })}
    </div>
  );
}
