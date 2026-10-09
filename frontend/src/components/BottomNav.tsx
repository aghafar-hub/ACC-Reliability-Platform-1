import { useState } from 'react';
import { useBackClose } from '../mobile/useBackClose';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ORG_ACC } from '../auth/session';
import { useEmbeddedNav, type NavRecord } from '../embeddedNav';
import { tapHaptic } from '../haptics';
import { Icon } from '../icons';
import { canOpenModule, useModuleAccess } from '../moduleAccess';
import { OIL, OIL_ROUTE, VIB, VIB_ROUTE, useQuickActions } from '../quickActions';
import './BottomNav.css';

// The phone's bottom bar (design system D2), only visible <=860px
// (BottomNav.css): Home · Equipment · ＋ · My Work · More.
// - Home depends on the role: ACC staff open the Dashboard, contractor
//   staff open My Work (technicians-only have their own shell).
// - ＋ starts the field entries from any screen. Work is recorded through
//   routes in this app, so it offers Emergency top-up (a pre-filled route),
//   New route, Add lab report and New vibration reading — whichever this
//   person may do (Module Access).
// - My Work sits where Alerts used to be (the bell is in the top bar);
//   contractor staff already have it as Home. More opens the full menu.


export default function BottomNav({ onOpenMore, moreOpen = false }: { onOpenMore: () => void; moreOpen?: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const embeddedNav = useEmbeddedNav();
  const { claims } = useAuth();
  const { access } = useModuleAccess();
  const [sheetOpen, setSheetOpen] = useState(false);
  useBackClose(sheetOpen, () => setSheetOpen(false));

  const oil = canOpenModule(access[OIL]);
  const vib = canOpenModule(access[VIB]);
  const contractorStaff = !!claims && claims.orgId !== ORG_ACC;
  const mainModule = oil ? { id: OIL, route: OIL_ROUTE } : vib ? { id: VIB, route: VIB_ROUTE } : null;

  function openPage(moduleId: string, route: string, page: string, record?: NavRecord) {
    tapHaptic();
    embeddedNav.navigateTo(moduleId, page, record);
    if (location.pathname !== route) navigate(route);
    setSheetOpen(false);
  }

  // Home (ACC staff) = the Plant overview; Equipment = every machine across
  // the modules (pages/PlantOverview.tsx, pages/PlantEquipment.tsx)
  const homeActive = contractorStaff ? location.pathname === '/my-work' : location.pathname === '/';
  const equipmentActive = location.pathname.startsWith('/equipment');

  const quick = useQuickActions();

  const slots: { key: string; label: string; icon: string; active: boolean; onClick: () => void; plus?: boolean; badge?: number }[] = [];

  if (contractorStaff) {
    slots.push({ key: 'home', label: 'My Work', icon: 'action', active: homeActive, onClick: () => { tapHaptic(); navigate('/my-work'); } });
  } else if (mainModule) {
    slots.push({ key: 'home', label: 'Home', icon: 'dashboard', active: homeActive, onClick: () => { tapHaptic(); navigate('/'); } });
  } else {
    slots.push({ key: 'home', label: 'My Work', icon: 'action', active: location.pathname === '/my-work', onClick: () => { tapHaptic(); navigate('/my-work'); } });
  }
  if (mainModule) {
    slots.push({ key: 'equipment', label: 'Equipment', icon: 'equipment', active: equipmentActive, onClick: () => { tapHaptic(); navigate('/equipment'); } });
  }
  if (quick.length) {
    slots.push({ key: 'plus', label: 'Add', icon: 'plus', active: sheetOpen, plus: true, onClick: () => { tapHaptic(); setSheetOpen(true); } });
  }
  if (!slots.some((s) => s.key === 'home' && s.label === 'My Work')) {
    slots.push({ key: 'mywork', label: 'My Work', icon: 'action', active: location.pathname === '/my-work', onClick: () => { tapHaptic(); navigate('/my-work'); } });
  }
  slots.push({ key: 'more', label: 'More', icon: 'menu', active: moreOpen || !slots.some((s) => s.active), onClick: () => { tapHaptic(); onOpenMore(); } });

  if (moreOpen) slots.forEach((sl) => (sl.active = sl.key === 'more'));

  return (
    <>
      <nav className="bottom-nav" aria-label="Primary" style={{ gridTemplateColumns: `repeat(${slots.length}, 1fr)` }}>
        {slots.map((s) =>
          s.plus ? (
            <button key={s.key} type="button" className="bottom-nav-item bottom-nav-plus-slot" onClick={s.onClick} aria-label="Add — field entries" aria-haspopup="dialog" data-testid="bottom-plus">
              <span className="bottom-nav-plus">
                <Icon name="plus" size={26} />
              </span>
            </button>
          ) : (
            <button
              key={s.key}
              type="button"
              className={s.active ? 'bottom-nav-item bottom-nav-item--active tap-scale' : 'bottom-nav-item tap-scale'}
              aria-current={s.active ? 'page' : undefined}
              onClick={s.onClick}
              data-testid={`bottom-${s.key}`}
            >
              <span className="bottom-nav-icon">
                <Icon name={s.icon} size={22} />
                {!!s.badge && <span className="bottom-nav-badge">{s.badge > 99 ? '99+' : s.badge}</span>}
              </span>
              <span>{s.label}</span>
            </button>
          ),
        )}
      </nav>
      {sheetOpen && (
        <>
          <div className="quick-sheet-backdrop" onClick={() => setSheetOpen(false)} aria-hidden="true" />
          <div className="quick-sheet" role="dialog" aria-modal="true" aria-label="Log from the field" data-testid="quick-sheet">
            <div className="quick-sheet-grab" aria-hidden="true" />
            <p className="quick-sheet-title">Log from the field</p>
            {quick.map((q) => (
              <button key={q.key} type="button" className="quick-sheet-item" onClick={() => openPage(q.moduleId, q.route, q.page, q.record)} data-testid={`quick-${q.key}`}>
                <span className="quick-sheet-icon">
                  <Icon name={q.icon} size={22} />
                </span>
                <span className="quick-sheet-text">
                  <b>{q.label}</b>
                  <small>{q.hint}</small>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
