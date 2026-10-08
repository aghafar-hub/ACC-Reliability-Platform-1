import { useEffect, useRef } from "react";

// Phone back gesture / Android back button closes the top sheet or popup
// instead of leaving the page (same as the platform shell's
// frontend/src/mobile/useBackClose.ts — they share one stack on window, so
// Back always closes only the sheet on top).
export default function useBackClose(open, close) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const stack = (window.__accBackStack ||= []);
    const id = Math.random().toString(36).slice(2);
    stack.push(id);
    // a popup that just closed may still have its entry on top (its Back is
    // deferred): reuse that entry, so opening one popup straight after
    // another (e.g. Create route → the new route) doesn't get closed by it
    const cur = window.history.state?.accSheet;
    if (cur && !stack.slice(0, -1).includes(cur)) window.history.replaceState({ ...window.history.state, accSheet: id }, "");
    else window.history.pushState({ ...(window.history.state || {}), accSheet: id }, "");
    let popped = false;
    const onPop = () => {
      if (stack[stack.length - 1] !== id) return;
      popped = true;
      stack.pop();
      closeRef.current?.();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (popped) return;
      const at = stack.indexOf(id);
      if (at !== -1) stack.splice(at, 1);
      setTimeout(() => {
        if (window.history.state?.accSheet === id) window.history.back();
      }, 0);
    };
  }, [open]);
}
