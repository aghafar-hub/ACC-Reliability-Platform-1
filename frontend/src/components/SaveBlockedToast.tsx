import { useEffect, useState } from 'react';
import './ModuleAccessNotice.css';

/**
 * Shows the reason when an embedded module stops a save before sending it
 * (Phase 0 — the module is in Maintenance, or the page is view only). The
 * modules announce it with a window "acc-save-blocked" event, since they
 * live in separate bundles with no shared React tree (see
 * apps/vibration-analysis/src/api.js).
 */
export default function SaveBlockedToast() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    const onBlocked = (e: Event) => {
      setMessage((e as CustomEvent<{ message: string }>).detail?.message || "This change wasn't saved.");
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setMessage(null), 8000);
    };
    window.addEventListener('acc-save-blocked', onBlocked);
    return () => {
      window.removeEventListener('acc-save-blocked', onBlocked);
      window.clearTimeout(timer);
    };
  }, []);

  if (!message) return null;
  return (
    <div className="save-blocked-toast" role="alert">
      <span>
        <strong>Not saved.</strong> {message}
      </span>
      <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
