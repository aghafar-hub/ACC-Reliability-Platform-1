import { useEffect, useRef, useState } from "react";
import { canOpenModule, useModuleAccess } from "../moduleAccess";
import { useBackClose } from "../mobile/useBackClose";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useEmbeddedNav } from "../embeddedNav";
import { tapHaptic } from "../haptics";
import { useVisibleNav } from "../hooks/useVisibleNav";
import { Icon, TablerIcon } from "../icons";
import {
  MODULE_TABS,
  type ModuleTabsConfig,
  type TabGroup,
} from "../navigation";
import "./ModuleTabs.css";

// The module's pages as tabs across the top (design system D2) — the left
// rail only lists modules. Desktop: one row of tabs, "More ▾" for the rarely
// used pages, and under the active tab its views (e.g. Oil Analysis Report |
// Sampling Log) plus its action button (e.g. "＋ Add report"). Phone: an
// Oil | Vibration switch and the pages as a sideways-scrolling chip strip.
type Visible = { groups: TabGroup[]; more: ModuleTabsConfig["more"] };

export function useVisibleTabs(cfg: ModuleTabsConfig | undefined): Visible {
  const navItems = useVisibleNav();
  if (!cfg) return { groups: [], more: [] };
  const item = navItems.find((n) => n.moduleId === cfg.moduleId);
  const allowed = new Set((item?.subTabs || []).map((t) => t.id));
  const groups = cfg.groups
    .map((g) => ({
      ...g,
      pages: g.pages.filter((p) => allowed.has(p)),
      views: g.views?.filter((v) => allowed.has(v.id)),
      action: g.action && allowed.has(g.action.id) ? g.action : undefined,
    }))
    .filter((g) => g.pages.length > 0);
  return { groups, more: cfg.more.filter((m) => allowed.has(m.id)) };
}

export default function ModuleTabs() {
  const location = useLocation();
  const navigate = useNavigate();
  const embeddedNav = useEmbeddedNav();
  const cfg = MODULE_TABS.find((m) => location.pathname.startsWith(m.route));
  const { groups, more } = useVisibleTabs(cfg);
  // The tab row scrolls sideways on narrow screens, which would clip a
  // dropdown inside it — so the More menu is drawn on <body>, placed under
  // its button.
  const [moreAt, setMoreAt] = useState<{ top: number; left: number } | null>(
    null,
  );
  const moreOpen = moreAt !== null;
  const setMoreOpen = (open: boolean) => {
    if (!open) return setMoreAt(null);
    const r = moreRef.current?.getBoundingClientRect();
    if (r) setMoreAt({ top: r.bottom + 4, left: r.left });
  };
  const menuRef = useRef<HTMLDivElement>(null);
  const { access } = useModuleAccess();
  const stripRef = useRef<HTMLElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!moreRef.current?.contains(t) && !menuRef.current?.contains(t))
        setMoreAt(null);
    };
    // A scroll or resize moves the menu with its button (opening it can
    // itself scroll the page, to bring the focused button into view); it
    // only closes once the button has left the screen.
    const follow = () => {
      const r = moreRef.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > window.innerHeight) setMoreAt(null);
      else setMoreAt((cur) => (cur && cur.top === r.bottom + 4 && cur.left === r.left ? cur : { top: r.bottom + 4, left: r.left }));
    };
    document.addEventListener("mousedown", close);
    window.addEventListener("resize", follow);
    window.addEventListener("scroll", follow, true);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("resize", follow);
      window.removeEventListener("scroll", follow, true);
    };
  }, [moreOpen]);

  useEffect(() => {
    setMoreAt(null);
  }, [location.pathname]);
  // the open page's chip stays in view in the strip
  const activeKey = cfg ? embeddedNav.activePageFor(cfg.moduleId) : null;
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(".mt-chip--on");
    if (el && stripRef.current) {
      const s = stripRef.current;
      const left = el.offsetLeft - (s.clientWidth - el.offsetWidth) / 2;
      s.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
    }
  }, [activeKey, location.pathname]);
  useBackClose(moreAt !== null, () => setMoreAt(null));

  if (!cfg || groups.length === 0) return null;

  const active = embeddedNav.activePageFor(cfg.moduleId) || groups[0].pages[0];
  const activeGroup = groups.find((g) => g.pages.includes(active));
  const activeMore = more.find((m) => m.id === active);

  function go(pageId: string) {
    tapHaptic();
    embeddedNav.navigateTo(cfg!.moduleId, pageId);
    if (location.pathname !== cfg!.route) navigate(cfg!.route);
    setMoreOpen(false);
  }

  const otherCfgs = MODULE_TABS.filter((m) => canOpenModule(access[m.moduleId]));
  const phoneModules = otherCfgs.map((m) => ({ moduleId: m.moduleId, short: m.title.split(" ")[0] }));
  function switchModule(moduleId: string) {
    const target = MODULE_TABS.find((m) => m.moduleId === moduleId);
    if (!target || moduleId === cfg!.moduleId) return;
    tapHaptic();
    // same kind of page in the other module when it has one (Dashboard,
    // Equipment, Routes, Actions), else its first page
    const pages = target.groups.flatMap((g) => g.pages).concat(target.more.map((m) => m.id));
    const sameGroup = activeGroup && target.groups.find((g) => g.label === activeGroup.label);
    const page = sameGroup ? sameGroup.pages[0] : pages.includes(active) ? active : target.groups[0].pages[0];
    embeddedNav.navigateTo(moduleId, page);
    navigate(target.route);
  }

  const showSubRow =
    !!activeGroup && (!!activeGroup.views?.length || !!activeGroup.action);

  return (
    <div className="module-tabs" data-testid="module-tabs">
      {/* desktop: tabs */}
      <nav className="module-tabs-row" aria-label={`${cfg.title} pages`}>
        {groups.map((g) => {
          const on = g === activeGroup;
          return (
            <button
              key={g.label}
              type="button"
              className={on ? "module-tab module-tab--active" : "module-tab"}
              aria-current={on ? "page" : undefined}
              data-page={g.pages[0]}
              onClick={() => go(g.pages[0])}
            >
              {g.label}
            </button>
          );
        })}
        {more.length > 0 && (
          <div className="module-tab-more" ref={moreRef}>
            <button
              type="button"
              className={
                activeMore ? "module-tab module-tab--active" : "module-tab"
              }
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              data-page="more"
              onClick={() => setMoreOpen(!moreOpen)}
            >
              {activeMore ? activeMore.label : "More"}{" "}
              <Icon name="chevronDown" size={14} />
            </button>
            {moreAt &&
              createPortal(
                <div
                  className="module-tab-menu"
                  role="menu"
                  ref={menuRef}
                  style={{ top: moreAt.top, left: moreAt.left }}
                >
                  {more.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      role="menuitem"
                      className={
                        m.id === active
                          ? "module-tab-menu-item module-tab-menu-item--active"
                          : "module-tab-menu-item"
                      }
                      data-page={m.id}
                      onClick={() => go(m.id)}
                    >
                      <TablerIcon className={m.icon} size={16} /> {m.label}
                    </button>
                  ))}
                </div>,
                document.body,
              )}
          </div>
        )}
      </nav>

      {/* phone: Oil | Vibration switch, then the module's pages as a
          strip of chips you swipe sideways (mobile proposal M1) */}
      <div className="module-tabs-phone">
        {phoneModules.length > 1 && (
          <div className="mt-switch" role="tablist" aria-label="Module" data-testid="module-switch">
            {phoneModules.map((m) => (
              <button
                key={m.moduleId}
                type="button"
                role="tab"
                aria-selected={m.moduleId === cfg.moduleId}
                className={m.moduleId === cfg.moduleId ? "mt-switch-btn mt-switch-btn--on" : "mt-switch-btn"}
                onClick={() => switchModule(m.moduleId)}
              >
                {m.short}
              </button>
            ))}
          </div>
        )}
        <nav className="mt-strip" ref={stripRef} aria-label={`${cfg.title} pages`} data-testid="module-strip">
          {[
            ...groups.map((g) => ({ id: g.pages[0], label: g.label, on: g === activeGroup })),
            ...more.map((m) => ({ id: m.id, label: m.label, on: m.id === active })),
          ].map((it) => (
            <button
              key={it.id}
              type="button"
              className={it.on ? "mt-chip mt-chip--on" : "mt-chip"}
              aria-current={it.on ? "page" : undefined}
              data-phone-page={it.id}
              onClick={() => go(it.id)}
            >
              {it.label}
            </button>
          ))}
        </nav>
      </div>

      {showSubRow && (
        <div className="module-tabs-sub">
          {activeGroup!.views && activeGroup!.views.length > 1 && (
            <div
              className="module-views"
              role="group"
              aria-label={`${activeGroup!.label} views`}
            >
              {activeGroup!.views.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={
                    v.id === active
                      ? "module-view module-view--active"
                      : "module-view"
                  }
                  aria-pressed={v.id === active}
                  data-page={v.id}
                  onClick={() => go(v.id)}
                >
                  {v.label}
                </button>
              ))}
            </div>
          )}
          {activeGroup!.action && (
            <button
              type="button"
              className={
                active === activeGroup!.action.id
                  ? "module-action module-action--active"
                  : "module-action"
              }
              data-page={activeGroup!.action.id}
              onClick={() => go(activeGroup!.action!.id)}
            >
              <TablerIcon className={activeGroup!.action.icon} size={16} />{" "}
              {activeGroup!.action.label}
            </button>
          )}
        </div>
      )}

    </div>
  );
}
