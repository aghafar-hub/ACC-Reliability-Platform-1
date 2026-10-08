import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEmbeddedNav } from '../embeddedNav';
import { MODULE_BACKENDS } from '../moduleAccess';
import type { ModuleWork, WorkItem, WorkSection } from '../myWork';

// Phase 9 — the role-based part of My Work, one group per module, built
// only from the standard getMyWork answer (see myWork.ts). Clicking an item
// opens that module's page (and record).

const SHOW_FIRST = 5;

const FLAG_LABEL: Record<string, string> = { overdue: 'Overdue', returned: 'Returned', due: 'Due soon' };

// onOpen lets the page open an item itself (My Work opens a vibration route
// checklist in place); it returns true when it did.
type OpenItem = (moduleId: string, item: WorkItem, sectionId: string) => boolean;

function Item({ moduleId, sectionId, item, onOpen }: { moduleId: string; sectionId: string; item: WorkItem; onOpen?: OpenItem }) {
  const navigate = useNavigate();
  const embeddedNav = useEmbeddedNav();
  const path = MODULE_BACKENDS.find((m) => m.id === moduleId)?.path;

  function open() {
    if (onOpen?.(moduleId, item, sectionId)) return;
    if (!path || !item.link) return;
    navigate(path);
    embeddedNav.navigateTo(moduleId, item.link.page, item.link.recordId || undefined);
  }

  const body = (
    <>
      <span className="wq-item-top">
        <span className="wq-item-title">{item.title}</span>
        {item.flag && <span className={`wq-flag wq-flag--${item.flag}`}>{FLAG_LABEL[item.flag] || item.flag}</span>}
      </span>
      {item.subtitle && <span className="wq-item-sub">{item.subtitle}</span>}
      {item.meta && <span className="wq-item-meta">{item.meta}</span>}
    </>
  );
  return item.link && (path || onOpen) ? (
    <button type="button" className="wq-item tap-scale" onClick={open}>
      {body}
    </button>
  ) : (
    <div className="wq-item wq-item--static">{body}</div>
  );
}

function Section({ moduleId, section, onOpen }: { moduleId: string; section: WorkSection; onOpen?: OpenItem }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? section.items : section.items.slice(0, SHOW_FIRST);
  return (
    <section className={`wq-section wq-section--${section.severity}`} data-testid={`wq-${section.id}`}>
      <header className="wq-section-head">
        <h3>
          {section.title} <span className="wq-count">{section.total}</span>
        </h3>
        {section.hint && <p className="wq-hint">{section.hint}</p>}
      </header>
      <div className="wq-items">
        {shown.map((it) => (
          <Item key={it.id} moduleId={moduleId} sectionId={section.id} item={it} onOpen={onOpen} />
        ))}
      </div>
      {!expanded && section.items.length > SHOW_FIRST && (
        <button type="button" className="wq-more-btn" onClick={() => setExpanded(true)}>
          Show {section.items.length - SHOW_FIRST} more
        </button>
      )}
      {expanded && section.total > section.items.length && (
        <p className="wq-more">
          Showing {section.items.length} of {section.total} — open the module for the rest.
        </p>
      )}
    </section>
  );
}

export default function WorkQueue({ work, showModuleNames, onOpen }: { work: ModuleWork[]; showModuleNames: boolean; onOpen?: OpenItem }) {
  return (
    <div className="wq">
      {work.map((m) =>
        m.sections.length === 0 && !m.error ? null : (
          <div key={m.moduleId} className="wq-module" data-testid={`wq-module-${m.moduleId}`}>
            {showModuleNames && <p className="mywork-section-title">{m.moduleName}</p>}
            {m.error && <p className="mywork-error">{m.moduleName}: {m.error}</p>}
            <div className="wq-grid">
              {m.sections.map((s) => (
                <Section key={s.id} moduleId={m.moduleId} section={s} onOpen={onOpen} />
              ))}
            </div>
          </div>
        ),
      )}
    </div>
  );
}
