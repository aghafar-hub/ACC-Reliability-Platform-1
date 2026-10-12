import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { sendHeartbeat } from './api/platformCore';
import { useAuth } from './auth/AuthContext';
import { useEmbeddedNav } from './embeddedNav';
import { NAV_ITEMS } from './navigation';

// Who's online (Settings → Who's online; Platform Core Presence.js): while
// the app is in view it checks in every 2 minutes with the page it shows,
// the device kind and how long since the person last touched it. Nothing
// is sent while the tab is hidden or the phone is locked.

const EVERY_MS = 2 * 60 * 1000;

export function deviceKind(): string {
  const w = window.innerWidth;
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const kind = w <= 860 && touch ? 'phone' : touch ? 'tablet' : 'desktop';
  const app = typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches;
  return app ? `${kind} app` : kind;
}

// activePageFor: the module page shown (the normal shell); the technician
// shell has no modules mounted and passes nothing.
export function usePresence(activePageFor?: (moduleId: string) => string | null) {
  const { sessionToken } = useAuth();
  const location = useLocation();
  const lastInput = useRef(Date.now());
  const lastSent = useRef(0);
  const where = useRef({ page: '', module: '' });

  const item = NAV_ITEMS.find((i) => (i.to === '/' ? location.pathname === '/' : location.pathname.startsWith(i.to)));
  const sub = item?.moduleId ? item.subTabs?.find((t) => t.id === activePageFor?.(item.moduleId!)) : null;
  const module = item?.moduleId ? item.label : '';
  const page = item?.moduleId ? sub?.label || '' : item?.label || (location.pathname.startsWith('/settings') ? 'Settings' : location.pathname);
  useEffect(() => {
    where.current = { module, page };
  }, [module, page]);

  useEffect(() => {
    if (!sessionToken) return;
    const touch = () => {
      lastInput.current = Date.now();
    };
    const send = (force = false) => {
      if (document.visibilityState !== 'visible') return;
      if (!force && Date.now() - lastSent.current < EVERY_MS - 5000) return;
      lastSent.current = Date.now();
      sendHeartbeat(sessionToken, {
        ...where.current,
        device: deviceKind(),
        idleSec: Math.round((Date.now() - lastInput.current) / 1000),
      }).catch(() => {
        /* offline or an older Platform Core: try again next time */
      });
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        touch();
        if (Date.now() - lastSent.current > 30000) send(true);
      }
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    document.addEventListener('visibilitychange', onVisible);
    send(true);
    const t = setInterval(() => send(), EVERY_MS);
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch));
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(t);
    };
  }, [sessionToken]);
}

// inside the normal shell (needs EmbeddedNavProvider)
export function PresenceTracker() {
  const embeddedNav = useEmbeddedNav();
  usePresence(embeddedNav.activePageFor);
  return null;
}
