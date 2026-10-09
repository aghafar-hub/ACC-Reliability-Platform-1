import ArabicWordsPanel from '../i18n/ArabicWordsPanel';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import AccountsPanel from '../components/AccountsPanel';
import ModuleAccessPanel from '../components/ModuleAccessPanel';
import DelegationsPanel from '../components/DelegationsPanel';
import { useAuth } from '../auth/AuthContext';
import { ROLE } from '../auth/session';
import { tabLevel, useModuleAccess } from '../moduleAccess';
import { InstallCard } from '../components/InstallGuide';
import ThemePicker from '../components/ThemePicker';
import { useEmbeddedNav } from '../embeddedNav';
import { Icon } from '../icons';
import './Settings.css';

type SettingsTabId = 'general' | 'oil-analysis' | 'vibration-analysis';
type GeneralSubTabId = 'appearance' | 'language' | 'delegations' | 'users' | 'module-access';

// One list of sections, shown as the left navigation (design reference):
// the platform's own settings first, then each module's.
type Section = { id: string; group: 'Platform' | 'Modules'; label: string; hint: string; icon: string; tab: SettingsTabId; sub?: GeneralSubTabId };
const SECTIONS: Section[] = [
  { id: 'appearance', group: 'Platform', label: 'Appearance', hint: 'Colour theme · install the app', icon: 'palette', tab: 'general', sub: 'appearance' },
  { id: 'language', group: 'Platform', label: 'Language', hint: 'English / عربي · Arabic word list', icon: 'share', tab: 'general', sub: 'language' },
  // Responsible engineers, managers and the App Owner (filtered below).
  { id: 'delegations', group: 'Platform', label: 'My delegations', hint: 'Cover while you are away', icon: 'users', tab: 'general', sub: 'delegations' },
  { id: 'users', group: 'Platform', label: 'Users', hint: 'Accounts, roles, passwords', icon: 'users', tab: 'general', sub: 'users' },
  // Phase 0 — App Owner only (filtered below).
  { id: 'module-access', group: 'Platform', label: 'Module Access', hint: 'Who opens which module and tab', icon: 'shield', tab: 'general', sub: 'module-access' },
  { id: 'oil-analysis', group: 'Modules', label: 'Oil Lubrication', hint: 'Connection, registries, alerts', icon: 'droplet', tab: 'oil-analysis' },
  { id: 'vibration-analysis', group: 'Modules', label: 'Vibration Analysis', hint: 'Connection and readings', icon: 'graphs', tab: 'vibration-analysis' },
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
  // ?tab=delegations opens straight on My delegations (My Work's "Nobody responsible" link)
  const [generalSubTab, setGeneralSubTab] = useState<GeneralSubTabId>(
    searchParams.get('tab') === 'delegations' ? 'delegations' : searchParams.get('tab') === 'language' ? 'language' : 'appearance',
  );
  const { claims } = useAuth();
  const isAppOwner = !!claims?.roles.includes(ROLE.ADMIN);
  const { access } = useModuleAccess();
  // anyone who can be responsible, manage, or be asked to cover
  const canDelegate =
    isAppOwner ||
    !!claims?.roles.some((r) => r === ROLE.RELIABILITY_ENGINEER || r === ROLE.CONTRACTOR_ENGINEER || r === ROLE.MANAGER || r === ROLE.CONTRACTOR_MANAGER) ||
    Object.values(access).some((a) => a?.responsibilities?.some((x) => /Responsible Engineer|Manager/.test(x)));
  // A module's own settings page is a section like any other (Phase 0):
  // hidden for anyone whose access hides it; Users / Module Access are for
  // the App Admin only.
  const sections = SECTIONS.filter((x) => {
    if (x.tab !== 'general') return tabLevel(access[x.tab], 'settings') !== 'Hidden';
    if (x.sub === 'module-access' || x.sub === 'users') return isAppOwner;
    if (x.sub === 'delegations') return canDelegate;
    return true;
  });
  const current = sections.find((x) => (activeTab === 'general' ? x.sub === generalSubTab : x.tab === activeTab)) || sections[0];

  // Opened straight on a module's section (a link, or a reload on it): send
  // that module to its own settings page too, not just on a click.
  // navigateTo waits for the module if it hasn't loaded yet.
  useEffect(() => {
    if (activeTab !== 'general') embeddedNav.navigateTo(activeTab, 'settings');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  function select(sec: Section) {
    if (sec.tab === 'general') {
      if (sec.sub) setGeneralSubTab(sec.sub);
      setSearchParams({});
      return;
    }
    // Drives the embedded app to its own native "settings" page — it opens
    // there once mounted if it hasn't finished loading yet.
    embeddedNav.navigateTo(sec.tab, 'settings');
    setSearchParams({ module: sec.tab });
  }

  return (
    <div className="settings-page">
      <header className="settings-head">
        <h1>Settings</h1>
        <p className="settings-sub">Appearance, accounts and each module's own settings.</p>
      </header>

      <nav className="settings-nav" aria-label="Settings sections">
        {(['Platform', 'Modules'] as const).map((group) => {
          const items = sections.filter((x) => x.group === group);
          if (!items.length) return null;
          return (
            <div key={group} className="settings-nav-group">
              <div className="settings-nav-label">{group}</div>
              {items.map((sec) => {
                const on = sec.id === current.id;
                return (
                  <button
                    key={sec.id}
                    type="button"
                    data-section={sec.id}
                    aria-current={on ? 'page' : undefined}
                    className={on ? 'settings-nav-item settings-nav-item--active' : 'settings-nav-item'}
                    onClick={() => select(sec)}
                  >
                    <span className="settings-nav-icon">
                      <Icon name={sec.icon} size={17} />
                    </span>
                    <span className="settings-nav-text">
                      <span className="settings-nav-name">{sec.label}</span>
                      <span className="settings-nav-hint">{sec.hint}</span>
                    </span>
                    <Icon name="chevronRight" size={16} style={{ opacity: on ? 1 : 0.35, flexShrink: 0 }} />
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      <section className="settings-section-head" aria-live="polite">
        <span className="settings-section-icon">
          <Icon name={current.icon} size={20} />
        </span>
        <span>
          <span className="settings-section-title">{current.label}</span>
          <span className="settings-section-hint">{current.hint}</span>
        </span>
      </section>

      {activeTab === 'general' && (
        <div className="settings-body">
          {generalSubTab === 'appearance' && (
            <>
              <div className="settings-card">
                <p className="settings-card-title">Colour theme</p>
                <p className="settings-intro">Applies instantly across the menu, every page and both modules.</p>
                <ThemePicker />
              </div>
              <InstallCard />
            </>
          )}
          {generalSubTab === 'language' && <ArabicWordsPanel isAppOwner={isAppOwner} />}
          {generalSubTab === 'delegations' && canDelegate && <DelegationsPanel />}
          {generalSubTab === 'users' && isAppOwner && <AccountsPanel />}
          {generalSubTab === 'module-access' && isAppOwner && <ModuleAccessPanel />}
        </div>
      )}
      {/* For a module section, its own Settings page appears in the right
          column — rendered by EmbeddedOilAnalysis/EmbeddedVibrationAnalysis
          in App.tsx and placed there by Settings.css's grid. */}
    </div>
  );
}
