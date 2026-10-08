import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { TablerIcon } from '../icons';
import { useBackClose } from '../mobile/useBackClose';
import './ShellModal.css';

// The shell's copy of the module apps' ModalShell / FormSection (design
// reference §4): header with icon, title, subtitle and optional pill; a
// scrolling body of section cards; a footer that stays in view. Drawn on
// <body> so the shade covers everything; full screen on a phone; Esc and ✕
// close it.
export default function ShellModal({
  icon,
  title,
  subtitle,
  badge,
  onClose,
  footer,
  width = 720,
  testid,
  children,
}: {
  icon?: string;
  title: string;
  subtitle?: ReactNode;
  badge?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  width?: number;
  testid?: string;
  children: ReactNode;
}) {
  useBackClose(true, onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="sm-shade" onClick={onClose}>
      <div className="sm-box" role="dialog" aria-modal="true" aria-label={title} data-testid={testid} style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        <div className="sm-head">
          {icon && (
            <span className="sm-icon" aria-hidden="true">
              <TablerIcon className={`ti-${icon}`} size={19} />
            </span>
          )}
          <div className="sm-titles">
            <div className="sm-title-row">
              <span className="sm-title">{title}</span>
              {badge}
            </div>
            {subtitle && <div className="sm-sub">{subtitle}</div>}
          </div>
          <button type="button" className="sm-close" onClick={onClose} aria-label="Close dialog">
            <TablerIcon className="ti-x" size={16} />
          </button>
        </div>
        <div className="sm-body">{children}</div>
        {footer && <div className="sm-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function FormSection({ icon, title, hint, right, testid, children }: { icon?: string; title: string; hint?: string; right?: ReactNode; testid?: string; children: ReactNode }) {
  return (
    <section className="sm-section" data-testid={testid}>
      <div className="sm-section-head">
        {icon && <TablerIcon className={`ti-${icon}`} size={16} />}
        <span className="sm-section-title">{title}</span>
        {hint && <span className="sm-section-hint">{hint}</span>}
        {right && <span className="sm-section-right">{right}</span>}
      </div>
      {children}
    </section>
  );
}
