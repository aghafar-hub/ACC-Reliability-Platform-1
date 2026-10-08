import { useEffect, useState } from "react";

// Matches the project's one mobile breakpoint (App.jsx's own
// @media(max-width:860px), Sidebar/TopBar/etc.) — used by pages that need
// to pick a genuinely different default (e.g. whether a filter row starts
// collapsed) rather than just a CSS-only layout change, so the two never
// drift apart.
const QUERY = "(max-width: 860px)";

export default function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => (typeof window === "undefined" ? false : window.matchMedia(QUERY).matches));

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
