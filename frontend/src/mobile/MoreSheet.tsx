import { useEffect, useMemo, useState } from 'react';
import { LangToggle } from '../i18n/LangToggle';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ROLE } from '../auth/session';
import { useEmbeddedNav } from '../embeddedNav';
import { tapHaptic } from '../haptics';
import { useVisibleNav } from '../hooks/useVisibleNav';
import { Icon, TablerIcon } from '../icons';
import { useModuleAccess } from '../moduleAccess';
import { COMING_SOON_ROUTES, MODULE_TABS, NAV_ITEMS } from '../navigation';
import { fetchMyWork, lastWorkCounts, myWorkModules, rememberWorkCounts } from '../myWork';
import { getRecent, pushRecent, type RecentPage } from './recent';
import { useBackClose } from './useBackClose';
import './mobile.css';

// The phone's "More" (bottom bar) as a hub (step 6) — the same size with two
// modules or ten: search, recent pages, one tile per module (red count = My
// Work items that need you), the platform pages, and the account in one row.
// Tapping a module slides to that module's pages; Back (arrow or the phone's
// Back) returns to the hub. A module's page strip "More ▾" opens straight on
// its pages (event "acc-open-more" { moduleId }, App.tsx).
const ROLE_LABEL: Record<string, string> = {
  [ROLE.ADMIN]: 'App Owner',
  [ROLE.MANAGER]: 'ACC Manager',
  [ROLE.CONTRACTOR_MANAGER]: 'Contractor Manager',
  [ROLE.RELIABILITY_ENGINEER]: 'ACC Engineer',
  [ROLE.CONTRACTOR_ENGINEER]: 'Contractor Engineer',
  'ROLE-TECH': 'Technician',
  'ROLE-VIEW': 'Visitor',
};
// tile colours per module (identity, same as the Activity / Team badges)
const MODULE_TONE: Record<string, string> = { 'oil-analysis': 'oil', 'vibration-analysis': 'vib' };

type Entry = { id: string; label: string; icon: string };

export default function MoreSheet({ open, onClose, startModule }: { open: boolean; onClose: () => void; startModule?: string | null }) {
  const { claims, logout, sessionToken } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const embeddedNav = useEmbeddedNav();
  const navItems = useVisibleNav();
  const { access } = useModuleAccess();
  const [moduleId, setModuleId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>(() => lastWorkCounts().counts);
  const [recent, setRecent] = useState<RecentPage[]>([]);

  useEffect(() => {
    if (!open) return;
    setModuleId(startModule || null);
    setQ('');
    setRecent(getRecent());
    // refresh the "needs you" counts when they are older than 5 minutes
    const last = lastWorkCounts();
    setCounts(last.counts);
    const mods = myWorkModules(access);
    if (sessionToken && mods.length && Date.now() - last.at > 5 * 60 * 1000) {
      fetchMyWork(sessionToken, mods).then((w) => {
        rememberWorkCounts(w);
        setCounts(lastWorkCounts().counts);
      }, () => {});
    }
  }, [open, startModule]); // eslint-disable-line react-hooks/exhaustive-deps

  // Back: from a module's pages to the hub first, then closed
  useBackClose(open && !!moduleId && !startModule, () => setModuleId(null));
  useBackClose(open, onClose);

  const modules = useMemo(
    () =>
      MODULE_TABS.map((cfg) => {
        const item = navItems.find((n) => n.moduleId === cfg.moduleId);
        if (!item) return null;
        const allowed = new Set((item.subTabs || []).map((t) => t.id));
        const entries: Entry[] = [
          ...cfg.groups.flatMap((g) => {
            const pages = g.pages.filter((p) => allowed.has(p));
            if (!pages.length) return [];
            // a group with views (Lab Reports) shows each view as its own page
            if (g.views && g.views.length > 1) return g.views.filter((v) => allowed.has(v.id)).map((v) => ({ id: v.id, label: v.label, icon: g.icon }));
            return [{ id: pages[0], label: g.label, icon: g.icon }];
          }),
          ...cfg.more.filter((m) => allowed.has(m.id)).map((m) => ({ id: m.id, label: m.label, icon: m.icon })),
        ];
        return entries.length ? { cfg, icon: item.icon, entries } : null;
      }).filter(Boolean) as { cfg: (typeof MODULE_TABS)[number]; icon: string; entries: Entry[] }[],
    [navItems],
  );
  // the platform's own pages (not modules), and modules still to come
  const platform = navItems.filter((n) => !n.moduleId && !COMING_SOON_ROUTES.includes(n.to));
  const coming = NAV_ITEMS.filter((n) => COMING_SOON_ROUTES.includes(n.to));

  if (!open) return null;

  const email = claims?.email || '';
  const roles = (claims?.roles || []).map((r) => ROLE_LABEL[r] || r).join(' · ');
  const activeModule = MODULE_TABS.find((m) => location.pathname.startsWith(m.route));
  const activePage = activeModule ? embeddedNav.activePageFor(activeModule.moduleId) : null;

  function goPage(cfg: (typeof MODULE_TABS)[number], e: Entry) {
    tapHaptic();
    pushRecent({ key: `${cfg.moduleId}:${e.id}`, label: e.label, icon: e.icon, tabler: true, route: cfg.route, moduleId: cfg.moduleId, page: e.id });
    onClose();
    embeddedNav.navigateTo(cfg.moduleId, e.id);
    if (location.pathname !== cfg.route) navigate(cfg.route);
  }
  function goRoute(to: string, label: string, icon: string) {
    tapHaptic();
    pushRecent({ key: to, label, icon, route: to });
    onClose();
    navigate(to);
  }
  function goRecent(r: RecentPage) {
    tapHaptic();
    pushRecent(r);
    onClose();
    if (r.moduleId && r.page) embeddedNav.navigateTo(r.moduleId, r.page);
    if (location.pathname + location.search !== r.route) navigate(r.route);
  }

  // search: pages by name, and equipment / Lub / Vib IDs from the modules' own data
  const term = q.trim().toLowerCase();
  const pageHits = term
    ? [
        ...modules.flatMap(({ cfg, entries }) => entries.filter((e) => e.label.toLowerCase().includes(term) || cfg.title.toLowerCase().includes(term)).map((e) => ({ cfg, e }))),
      ]
    : [];
  const routeHits = term ? [...platform, { label: 'Settings', to: '/settings', icon: 'settings' }].filter((n) => n.label.toLowerCase().includes(term)) : [];
  const idHits =
    term.length >= 2
      ? modules.flatMap(({ cfg }) => embeddedNav.search(cfg.moduleId, q.trim()).slice(0, 6).map((h) => ({ cfg, h })))
      : [];

  const chevron = <Icon name="chevronRight" size={16} style={{ marginInlineStart: 'auto', opacity: 0.4 }} />;
  const drill = moduleId ? modules.find((m) => m.cfg.moduleId === moduleId) : null;

  return (
    <>
      <div className="module-sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="module-sheet more-sheet" role="dialog" aria-modal="true" aria-label="More" data-testid="more-sheet">
        <div className="module-sheet-grab" aria-hidden="true" />

        {drill ? (
          <div className="more-drill" data-testid="more-drill">
            <div className="more-drill-head">
              <button type="button" className="more-back" aria-label="Back" onClick={() => (startModule ? onClose() : setModuleId(null))} data-testid="more-back">
                <Icon name="chevronRight" size={18} style={{ transform: 'scaleX(-1)' }} />
              </button>
              <span className={`more-tile-icon more-tile-icon--${MODULE_TONE[drill.cfg.moduleId] || 'other'}`}>
                <Icon name={drill.icon} size={20} />
              </span>
              <span className="more-drill-title">
                <b>{drill.cfg.title}</b>
                <small>{drill.entries.length} pages</small>
              </span>
            </div>
            {drill.entries.map((e) => {
              const on = activeModule?.moduleId === drill.cfg.moduleId && activePage === e.id;
              return (
                <button key={e.id} type="button" className={on ? 'module-sheet-item module-sheet-item--active' : 'module-sheet-item'} onClick={() => goPage(drill.cfg, e)} data-page={`${drill.cfg.moduleId}:${e.id}`}>
                  <TablerIcon className={e.icon} size={20} />
                  <span>{e.label}</span>
                  {on ? <Icon name="compliance" size={16} style={{ marginInlineStart: 'auto', color: 'var(--shell-accent)' }} /> : chevron}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="more-hub" data-testid="more-hub">
            <label className="more-search">
              <Icon name="search" size={16} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pages, equipment, Lub / Vib IDs…" aria-label="Search" data-testid="more-search" />
            </label>

            {term ? (
              <section className="more-group" data-testid="more-results">
                {pageHits.map(({ cfg, e }) => (
                  <button key={`${cfg.moduleId}:${e.id}`} type="button" className="module-sheet-item" onClick={() => goPage(cfg, e)}>
                    <TablerIcon className={e.icon} size={20} />
                    <span>
                      {e.label} <small className="more-muted">· {cfg.title}</small>
                    </span>
                    {chevron}
                  </button>
                ))}
                {routeHits.map((n) => (
                  <button key={n.to} type="button" className="module-sheet-item" onClick={() => goRoute(n.to, n.label, n.icon)}>
                    <Icon name={n.icon} size={20} />
                    <span>{n.label}</span>
                    {chevron}
                  </button>
                ))}
                {idHits.map(({ cfg, h }, i) => (
                  <button
                    key={`${cfg.moduleId}-${h.page}-${h.recordId}-${i}`}
                    type="button"
                    className="module-sheet-item"
                    onClick={() => {
                      tapHaptic();
                      onClose();
                      embeddedNav.navigateTo(cfg.moduleId, h.page, h.recordId);
                      if (location.pathname !== cfg.route) navigate(cfg.route);
                    }}
                  >
                    <Icon name="search" size={18} />
                    <span>
                      <b className="more-mono">{h.title}</b> <small className="more-muted">{h.subtitle ? `· ${h.subtitle}` : ''} · {cfg.title}</small>
                    </span>
                    {chevron}
                  </button>
                ))}
                {!pageHits.length && !routeHits.length && !idHits.length && <p className="more-muted more-empty">Nothing found.</p>}
              </section>
            ) : (
              <>
                {recent.length > 0 && (
                  <section className="more-group">
                    <p className="more-group-title">Recent</p>
                    <div className="more-recent" data-testid="more-recent">
                      {recent.slice(0, 4).map((r) => (
                        <button key={r.key} type="button" className="more-recent-chip" onClick={() => goRecent(r)}>
                          {r.tabler ? <TablerIcon className={r.icon} size={16} /> : <Icon name={r.icon} size={16} />}
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                <section className="more-group">
                  <p className="more-group-title">Modules</p>
                  <div className="more-tiles" data-testid="more-tiles">
                    {modules.map(({ cfg, icon, entries }) => (
                      <button key={cfg.moduleId} type="button" className="more-tile" onClick={() => { tapHaptic(); setModuleId(cfg.moduleId); }} data-testid={`more-tile-${cfg.moduleId}`}>
                        {!!counts[cfg.moduleId] && <span className="more-tile-badge" aria-label={`${counts[cfg.moduleId]} need you`}>{counts[cfg.moduleId] > 99 ? '99+' : counts[cfg.moduleId]}</span>}
                        <span className={`more-tile-icon more-tile-icon--${MODULE_TONE[cfg.moduleId] || 'other'}`}>
                          <Icon name={icon} size={22} />
                        </span>
                        <b>{cfg.title}</b>
                        <small>{entries.length} pages</small>
                      </button>
                    ))}
                    {coming.map((n) => (
                      <button key={n.to} type="button" className="more-tile more-tile--soon" onClick={() => goRoute(n.to, n.label, n.icon)}>
                        <span className="more-tile-icon more-tile-icon--other">
                          <Icon name={n.icon} size={22} />
                        </span>
                        <b>{n.label}</b>
                        <small>Coming soon</small>
                      </button>
                    ))}
                  </div>
                </section>

                {platform.length > 0 && (
                  <section className="more-group">
                    <p className="more-group-title">Platform</p>
                    <div className="more-recent">
                      {platform.map((n) => (
                        <button key={n.to} type="button" className={location.pathname === n.to ? 'more-recent-chip more-recent-chip--on' : 'more-recent-chip'} onClick={() => goRoute(n.to, n.label, n.icon)} data-testid={`more-platform-${n.to.slice(1) || 'home'}`}>
                          <Icon name={n.icon} size={16} />
                          {n.label}
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                <div className="more-account">
                  <span className="more-avatar">{email.slice(0, 2).toUpperCase()}</span>
                  <span className="more-account-text">
                    <b>{email}</b>
                    <span>{roles}</span>
                  </span>
                </div>
                <div className="more-account-actions">
                  <button type="button" className="more-action" onClick={() => goRoute('/settings', 'Settings', 'settings')} data-testid="more-settings">
                    <Icon name="settings" size={18} />
                    Settings
                  </button>
                  <LangToggle className="more-action more-lang" testid="more-lang" />
                  <button type="button" className="more-action more-signout" onClick={logout} data-testid="more-logout">
                    <Icon name="logout" size={18} />
                    Log out
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
