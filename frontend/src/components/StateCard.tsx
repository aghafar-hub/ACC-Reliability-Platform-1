import type { ReactNode } from 'react';
import './StateCard.css';

// One card for every "you can't be here" moment inside the app (no access,
// module off, page not for your role, page not found): the brand band with
// the plant drawing, a big icon, what happened, who to ask and where to go.
// Same brand look as the Login page (pages/AuthLayout.tsx).

type Icon = 'lock' | 'power' | 'eye-off' | 'compass' | 'info' | 'arrow' | 'gear';

const PATHS: Record<Icon, ReactNode> = {
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  power: (
    <>
      <path d="M12 3v9" />
      <path d="M6.4 6.6a8 8 0 1 0 11.2 0" />
    </>
  ),
  'eye-off': <path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 5.2A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6" />,
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16.5v.5" />
    </>
  ),
  arrow: <path d="M4 12h16M14 6l6 6-6 6" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
};

export function StateIcon({ name, size = 28 }: { name: Icon; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

type Action = { label: string; onClick: () => void };

export default function StateCard({
  icon,
  tone = 'teal',
  eyebrow,
  title,
  text,
  hint,
  primary,
  secondary,
  testid,
}: {
  icon: Icon;
  tone?: 'teal' | 'grey';
  eyebrow: string;
  title: string;
  text: string;
  hint?: ReactNode;
  primary?: Action;
  secondary?: Action;
  testid?: string;
}) {
  const base = import.meta.env.BASE_URL;
  return (
    <section className="state-card" role="status" data-testid={testid} style={{ ['--state-plant' as string]: `url(${base}brand/plant-wide.webp)` }}>
      <div className="state-card-hero">
        <div className="state-card-brand" data-no-translate="">
          <img src={`${base}brand/acc-leaf-mark.png`} alt="" />
          <div>
            ACC Reliability Platform
            <span lang="ar">العربية للأسمنت</span>
          </div>
        </div>
        <div className={`state-card-badge state-card-badge--${tone}`}>
          <StateIcon name={icon} />
        </div>
      </div>
      <div className="state-card-body">
        <div className="state-card-eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
        <p>{text}</p>
        {hint && (
          <div className="state-card-hint">
            <StateIcon name="info" size={20} />
            <span>{hint}</span>
          </div>
        )}
        {(primary || secondary) && (
          <div className="state-card-actions">
            {primary && (
              <button type="button" className="state-card-btn tap-scale" onClick={primary.onClick}>
                {primary.label}
                <StateIcon name="arrow" size={18} />
              </button>
            )}
            {secondary && (
              <button type="button" className="state-card-ghost" onClick={secondary.onClick}>
                {secondary.label}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
