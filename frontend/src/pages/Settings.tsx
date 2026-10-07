import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import AccountsPanel from '../components/AccountsPanel';
import ModuleAccessPanel from '../components/ModuleAccessPanel';
import { useAuth } from '../auth/AuthContext';
import { ROLE } from '../auth/session';
import { tabLevel, useModuleAccess } from '../moduleAccess';
import { InstallCard } from '../components/InstallGuide';
import ThemePicker from '../components/ThemePicker';
import { useEmbeddedNav } from '../embeddedNav';
import { Icon } from '../icons';
import './Settings.css';

type SettingsTabId = 'general' | 'oil-analysis' | 'vibration-analysis';
type GeneralSubTabId = 'appearance' | 'users' | 'module-access';

const TABS: { id: SettingsTabId; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: 'settings' },
  { id: 'oil-analysis', label: 'Oil Lubrication', icon: 'droplet' },
  { id: 'vibration-analysis', label: 'Vibration Analysis', icon: 'graphs' },
];

// "General" own sub-tabs (user request: "can we make subtab for users as
// we did in oil setting") — same bordered-segmented-control pattern as the
// module-level TABS above (and as apps/oil-analysis/src/pages/Settings.jsx's
// own SETTINGS_SUB_TABS strip), one level down: Appearance (the theme
// picker, previously shown unconditionally) and Users (AccountsPanel,
// previously stacked directly underneath it on the same screen).
const GENERAL_SUB_TABS: { id: GeneralSubTabId; label: string; icon: string }[] = [
  { id: 'appearance', label: 'Appearance', icon: 'settings' },
  { id: 'users', label: 'Users', icon: 'action' },
  // Phase 0 — App Owner only (filtered below).
  { id: 'module-access', label: 'Module Access', icon: 'compliance' },
];

// Platform-level Settings (Patch 29) — one page with tabs for each module
// instead of a separate Settings screen buried inside each one. "General"
// is the shared theme picker + account admin that used to be the whole
// page (ThemePicker/AccountsPanel below, unchanged). The module tabs don't
// duplicate each module's own settings screen — they ARE it: selecting one
// drives that module's already-mounted embedded instance (see
// EmbeddedOilAnalysis.tsx/EmbeddedVibrationAnalysis.tsx, rendered as
// persistent siblings of this page in App.tsx) to its own internal
// Settings page and reveals it directly below this tab strip, via the
// `module` query param both of those components also read. This reuses
// the exact same instance the rest of the app uses — no second mount, no
// lost state, and switching back to General (or another module) never
// unmounts it either.
export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const embeddedNav = useEmbeddedNav();
  const activeTab = (searchParams.get('module') as SettingsTabId | null) ?? 'general';
  const [generalSubTab, setGeneralSubTab] = useState<GeneralSubTabId>('appearance');
  const { claims } = useAuth();
  const isAppOwner = !!claims?.roles.includes(ROLE.ADMIN);
  const { access } = useModuleAccess();
  // A module's own settings page is a tab like any other (Phase 0): hidden
  // here for anyone whose access hides it.
  const tabs = TABS.filter((t) => t.id === 'general' || tabLevel(access[t.id], 'settings') !== 'Hidden');
  const generalSubTabs = GENERAL_SUB_TABS.filter((t) => t.id !== 'module-access' || isAppOwner);

  // Opened straight on a module's tab (a link, or a reload on that tab):
  // send that module to its own settings page too, not just on a click.
  // navigateTo waits for the module if it hasn't loaded yet.
  useEffect(() => {
    if (activeTab !== 'general') embeddedNav.navigateTo(activeTab, 'settings');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  function selectTab(tabId: SettingsTabId) {
    if (tabId === 'general') {
      setSearchParams({});
      return;
    }
    // Drives the embedded app to its own native "settings" page — a no-op
    // if that module hasn't finished mounting yet, in which case it just
    // opens there once it has (navBridge.navigate queues against the same
    // activePage state the module reads on mount).
    embeddedNav.navigateTo(tabId, 'settings');
    setSearchParams({ module: tabId });
  }

  return (
    <div className="settings-page">
      <h1>Settings</h1>

      <div className="settings-tabs" role="tablist" aria-label="Settings sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === activeTab}
            className={tab.id === activeTab ? 'settings-tab settings-tab--active' : 'settings-tab'}
            onClick={() => selectTab(tab.id)}
          >
            <Icon name={tab.icon} size={16} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
        <div className="settings-panel">
          <div className="settings-subtabs" role="tablist" aria-label="General settings sections">
            {generalSubTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={tab.id === generalSubTab}
                className={tab.id === generalSubTab ? 'settings-subtab settings-subtab--active' : 'settings-subtab'}
                onClick={() => setGeneralSubTab(tab.id)}
              >
                <Icon name={tab.icon} size={14} />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {generalSubTab === 'appearance' && (
            <>
              <p className="settings-intro">
                Choose a colour theme. Applies instantly across the sidebar, every page, and both modules.
              </p>
              <ThemePicker />
              <InstallCard />
            </>
          )}
          {generalSubTab === 'users' && <AccountsPanel />}
          {generalSubTab === 'module-access' && isAppOwner && <ModuleAccessPanel />}
        </div>
      )}
      {/* For a module tab, nothing else renders here on purpose — that
          module's own Settings page appears directly below, rendered by
          EmbeddedOilAnalysis/EmbeddedVibrationAnalysis in App.tsx. */}
    </div>
  );
}
