import { LangToggle } from '../i18n/LangToggle';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ROLE } from '../auth/session';
import { useEmbeddedNav } from '../embeddedNav';
import { tapHaptic } from '../haptics';
import { useVisibleNav } from '../hooks/useVisibleNav';
import { Icon, TablerIcon } from '../icons';
import { MODULE_TABS } from '../navigation';
import { useBackClose } from './useBackClose';
import './mobile.css';

// The phone's "More" (bottom bar): every page of every module this person
// can open, then My Work, Settings and the account. Replaces the side menu
// on phones. Back closes it.
const ROLE_LABEL: Record<string, string> = {
  [ROLE.ADMIN]: 'App Owner',
  [ROLE.MANAGER]: 'ACC Manager',
  [ROLE.CONTRACTOR_MANAGER]: 'Contractor Manager',
  [ROLE.RELIABILITY_ENGINEER]: 'ACC Engineer',
  [ROLE.CONTRACTOR_ENGINEER]: 'Contractor Engineer',
  'ROLE-TECH': 'Technician',
  'ROLE-VIEW': 'Visitor',
};

export default function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { claims, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const embeddedNav = useEmbeddedNav();
  const navItems = useVisibleNav();
  useBackClose(open, onClose);
  if (!open) return null;

  const email = claims?.email || '';
  const canDelegate = !!claims?.roles.some((r) => [ROLE.ADMIN, ROLE.MANAGER, ROLE.CONTRACTOR_MANAGER, ROLE.RELIABILITY_ENGINEER, ROLE.CONTRACTOR_ENGINEER].includes(r as never));
  const roles = (claims?.roles || []).map((r) => ROLE_LABEL[r] || r).join(' · ');

  function goPage(moduleId: string, route: string, page: string) {
    tapHaptic();
    onClose();
    embeddedNav.navigateTo(moduleId, page);
    if (location.pathname !== route) navigate(route);
  }
  function goRoute(to: string) {
    tapHaptic();
    onClose();
    navigate(to);
  }

  const modules = MODULE_TABS.map((cfg) => {
    const item = navItems.find((n) => n.moduleId === cfg.moduleId);
    if (!item) return null;
    const allowed = new Set((item.subTabs || []).map((t) => t.id));
    const entries = [
      ...cfg.groups.map((g) => ({ id: g.pages.find((p) => allowed.has(p)), label: g.label, icon: g.icon })),
      ...cfg.more.map((m) => ({ id: allowed.has(m.id) ? m.id : undefined, label: m.label, icon: m.icon })),
    ].filter((e): e is { id: string; label: string; icon: string } => !!e.id);
    return entries.length ? { cfg, entries } : null;
  }).filter(Boolean) as { cfg: (typeof MODULE_TABS)[number]; entries: { id: string; label: string; icon: string }[] }[];
  const activeModule = MODULE_TABS.find((m) => location.pathname.startsWith(m.route));
  const activePage = activeModule ? embeddedNav.activePageFor(activeModule.moduleId) : null;

  return (
    <>
      <div className="module-sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="module-sheet more-sheet" role="dialog" aria-modal="true" aria-label="More" data-testid="more-sheet">
        <div className="module-sheet-grab" aria-hidden="true" />
        <div className="more-account">
          <span className="more-avatar">{email.slice(0, 2).toUpperCase()}</span>
          <span className="more-account-text">
            <b>{email}</b>
            <span>{roles}</span>
          </span>
          <LangToggle className="more-lang" testid="more-lang" />
        </div>

        {modules.map(({ cfg, entries }) => (
          <section key={cfg.moduleId} className="more-group">
            <p className="more-group-title">{cfg.title}</p>
            {entries.map((e) => {
              const on = activeModule?.moduleId === cfg.moduleId && activePage === e.id;
              return (
                <button key={e.id} type="button" className={on ? 'module-sheet-item module-sheet-item--active' : 'module-sheet-item'} onClick={() => goPage(cfg.moduleId, cfg.route, e.id)} data-page={`${cfg.moduleId}:${e.id}`}>
                  <TablerIcon className={e.icon} size={20} />
                  <span>{e.label}</span>
                  <Icon name="chevronRight" size={16} style={{ marginInlineStart: 'auto', opacity: 0.4 }} />
                </button>
              );
            })}
          </section>
        ))}

        <section className="more-group">
          <p className="more-group-title">Platform</p>
          {navItems.some((n) => n.to === '/my-work') && (
            <button type="button" className="module-sheet-item" onClick={() => goRoute('/my-work')}>
              <Icon name="action" size={20} />
              <span>My Work</span>
              <Icon name="chevronRight" size={16} style={{ marginInlineStart: 'auto', opacity: 0.4 }} />
            </button>
          )}
          <button type="button" className="module-sheet-item" onClick={() => goRoute('/settings')}>
            <Icon name="settings" size={20} />
            <span>Settings</span>
            <Icon name="chevronRight" size={16} style={{ marginInlineStart: 'auto', opacity: 0.4 }} />
          </button>
          {canDelegate && (
          <button type="button" className="module-sheet-item" onClick={() => goRoute('/settings?tab=delegations')}>
            <Icon name="users" size={20} />
            <span>My delegations</span>
            <Icon name="chevronRight" size={16} style={{ marginInlineStart: 'auto', opacity: 0.4 }} />
          </button>
          )}
          <button type="button" className="module-sheet-item more-signout" onClick={logout}>
            <Icon name="logout" size={20} />
            <span>Sign out</span>
          </button>
        </section>
      </div>
    </>
  );
}
