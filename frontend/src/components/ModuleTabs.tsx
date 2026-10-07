import { useEffect, useRef, useState } from "react";
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
// Sampling Log) plus its action button (e.g. "＋ Add report"). Phone: the
// tabs don't fit, so the page name becomes a button that opens the page
// list from the bottom of the screen (thumb reach).
type Visible = { groups: TabGroup[]; more: ModuleTabsConfig["more"] };

function useVisibleTabs(cfg: ModuleTabsConfig | undefined): Visible {
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
  const [sheetOpen, setSheetOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!moreRef.current?.contains(t) && !menuRef.current?.contains(t))
        setMoreAt(null);
    };
    const dismiss = () => setMoreAt(null);
    document.addEventListener("mousedown", close);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [moreOpen]);

  useEffect(() => {
    setSheetOpen(false);
    setMoreAt(null);
  }, [location.pathname]);

  if (!cfg || groups.length === 0) return null;

  const active = embeddedNav.activePageFor(cfg.moduleId) || groups[0].pages[0];
  const activeGroup = groups.find((g) => g.pages.includes(active));
  const activeMore = more.find((m) => m.id === active);
  const currentLabel =
    activeGroup?.label || activeMore?.label || groups[0].label;

  function go(pageId: string) {
    tapHaptic();
    embeddedNav.navigateTo(cfg!.moduleId, pageId);
    if (location.pathname !== cfg!.route) navigate(cfg!.route);
    setMoreOpen(false);
    setSheetOpen(false);
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

      {/* phone: page picker */}
      <div className="module-tabs-picker">
        <button
          type="button"
          className="module-picker-btn"
          onClick={() => setSheetOpen(true)}
          aria-haspopup="dialog"
          data-testid="module-picker"
        >
          <span>{currentLabel}</span>
          <Icon name="chevronDown" size={18} />
        </button>
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

      {sheetOpen && (
        <>
          <div
            className="module-sheet-backdrop"
            onClick={() => setSheetOpen(false)}
            aria-hidden="true"
          />
          <div
            className="module-sheet"
            role="dialog"
            aria-label={`${cfg.title} pages`}
          >
            <div className="module-sheet-grab" aria-hidden="true" />
            <p className="module-sheet-title">{cfg.title}</p>
            {[
              ...groups.map((g) => ({
                id: g.pages[0],
                label: g.label,
                icon: g.icon,
                on: g === activeGroup,
              })),
              ...more.map((m) => ({ ...m, on: m.id === active })),
            ].map((it) => (
              <button
                key={it.id}
                type="button"
                className={
                  it.on
                    ? "module-sheet-item module-sheet-item--active"
                    : "module-sheet-item"
                }
                data-page={it.id}
                onClick={() => go(it.id)}
              >
                <TablerIcon className={it.icon} size={20} />
                <span>{it.label}</span>
                {it.on && <span className="module-sheet-check">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
