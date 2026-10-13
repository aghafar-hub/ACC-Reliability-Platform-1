import { useId, useState, type ReactNode } from 'react';
import { LangToggle } from '../i18n/LangToggle';
import './Auth.css';

// Shared frame of the Login and Change password pages: the brand panel
// (company logo + the ACC cement line sketch, brand/plant-*.webp) and the
// form side. On a phone the panel becomes a header above the form.
export default function AuthLayout({ children }: { children: ReactNode }) {
  const base = import.meta.env.BASE_URL;
  return (
    <div className="auth-page">
      <aside className="auth-brand" style={{ ['--plant-square' as string]: `url(${base}brand/plant-square.webp)`, ['--plant-wide' as string]: `url(${base}brand/plant-wide.webp)`, ['--plant-phone' as string]: `url(${base}brand/plant-phone.webp)` }}>
        <div className="auth-logo">
          <img src={`${base}brand/acc-leaf-mark.png`} alt="" />
          <span className="auth-logo-bar" aria-hidden="true" />
          <div className="auth-logo-name" data-no-translate="">
            Arabian Cement
            <br />
            Company
            <span className="auth-logo-ar" lang="ar">
              العربية للأسمنت
            </span>
          </div>
        </div>
        <LangToggle className="auth-lang auth-lang--phone" />
        <div className="auth-headline">
          <h2>
            Reliability
            <br />
            starts here.
          </h2>
          <p>One platform. Connected maintenance.</p>
        </div>
        <div className="auth-tagline">ACC Reliability Platform</div>
      </aside>
      <main className="auth-side">
        <LangToggle className="auth-lang auth-lang--desk" />
        <div className="auth-form-wrap">{children}</div>
        <div className="auth-foot">Arabian Cement Company · Sokhna Plant</div>
      </main>
    </div>
  );
}

const ICONS: Record<string, ReactNode> = {
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="m10.8 12.2 7.7-7.7M16 7l2 2M19 4l2 2" />
    </>
  ),
};

export function AuthIcon({ name, size = 20 }: { name: 'mail' | 'lock' | 'key' | 'arrow' | 'eye' | 'eye-off' | 'info'; size?: number }) {
  const paths: Record<string, ReactNode> = {
    ...ICONS,
    arrow: <path d="M4 12h16M14 6l6 6-6 6" />,
    eye: (
      <>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    'eye-off': <path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 5.2A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6" />,
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16.5v.5" />
      </>
    ),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

// A labelled input with a leading icon; password inputs get a show/hide button.
export function AuthField({
  label,
  icon,
  type = 'text',
  value,
  onChange,
  autoComplete,
  autoFocus,
  placeholder,
}: {
  label: string;
  icon: 'mail' | 'lock' | 'key';
  type?: 'text' | 'email' | 'password';
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [shown, setShown] = useState(false);
  const id = useId();
  const isPw = type === 'password';
  // label beside (not around) the input, so the eye button's name is not
  // part of the field's name
  return (
    <div className="auth-field">
      <label className="auth-label" htmlFor={id}>
        {label}
      </label>
      <span className="auth-input">
        <span className="auth-input-icon">
          <AuthIcon name={icon} />
        </span>
        <input
          id={id}
          type={isPw && shown ? 'text' : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          placeholder={placeholder}
          className={isPw ? 'has-eye' : undefined}
        />
        {isPw && (
          <button type="button" className="auth-eye" onClick={() => setShown((s) => !s)} aria-label={shown ? 'Hide password' : 'Show password'} title={shown ? 'Hide password' : 'Show password'}>
            <AuthIcon name={shown ? 'eye-off' : 'eye'} />
          </button>
        )}
      </span>
    </div>
  );
}
