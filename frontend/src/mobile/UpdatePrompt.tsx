import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { TablerIcon } from '../icons';
import './mobile.css';

// A new version of the app is downloaded in the background; instead of
// reloading by itself (which could throw away a half-filled form) it asks.
// While a form or popup is open the message says to finish it first.
let updateSW: ((reload?: boolean) => Promise<void>) | null = null;

export default function UpdatePrompt() {
  const [ready, setReady] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    if (updateSW) return;
    updateSW = registerSW({
      onNeedRefresh: () => setReady(true),
      onRegisteredSW(_url, reg) {
        // look for a new version every hour while the app stays open
        if (reg) setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      },
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    const check = () => setFormOpen(!!document.querySelector('[role="dialog"][aria-modal="true"]'));
    check();
    const t = setInterval(check, 1500);
    return () => clearInterval(t);
  }, [ready]);

  if (!ready) return null;
  return (
    <div className="update-toast" role="status" data-testid="update-prompt">
      <TablerIcon className="ti-download" size={18} />
      <span>
        <b>New version ready.</b> {formOpen ? 'Finish your form, then reload.' : 'Reload to use it.'}
      </span>
      <button type="button" onClick={() => updateSW?.(true)}>
        Reload
      </button>
      <button type="button" className="update-toast-x" aria-label="Later" onClick={() => setReady(false)}>
        <TablerIcon className="ti-x" size={16} />
      </button>
    </div>
  );
}
