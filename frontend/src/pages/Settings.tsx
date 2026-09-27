import ThemePicker from '../components/ThemePicker';

// Platform-level Settings — the shared theme picker that used to live
// separately inside each module's own Settings (see each app's own
// Settings.jsx, which hides its own Theme section and points here instead).
// Picking a theme here (via ShellThemeContext, see shellTheme.tsx) restyles
// the Sidebar and every shell page immediately, in addition to whichever
// embedded module is open, and persists so both modules also start on the
// right theme next time either is opened.
export default function Settings() {
  return (
    <div>
      <h1>Settings</h1>
      <p className="settings-intro">
        Choose a colour theme. Applies instantly across the sidebar, every page, and both modules.
      </p>
      <ThemePicker />
    </div>
  );
}
