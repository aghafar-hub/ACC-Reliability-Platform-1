import { useEffect, useMemo, useRef, useState } from "react";
import { useBackClose } from '../mobile/useBackClose';
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useEmbeddedNav, type SearchResult } from "../embeddedNav";
import { Icon } from "../icons";
import { canOpenModule, useModuleAccess } from "../moduleAccess";
import { MODULE_TABS } from "../navigation";
import "./GlobalSearch.css";

// Global search (design system D2): equipment, LP ID, the lab's Report
// Equipment ID and Sample ID from anywhere. Each module answers from the
// data it already holds (embeddedNav.search), so it works offline too.
// Desktop: a box in the top bar (Ctrl/⌘ K). Phone: a search button that
// opens a full-screen search.
const KIND_LABEL: Record<string, string> = {
  sample: "Lab report",
  point: "Point",
  machine: "Machine",
  "VIB ID": "VIB ID",
  report: "Report",
};
type Hit = SearchResult & {
  moduleId: string;
  route: string;
  moduleTitle: string;
};

export default function GlobalSearch() {
  const embeddedNav = useEmbeddedNav();
  const { access } = useModuleAccess();
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  useBackClose(phoneOpen, () => setPhoneOpen(false));
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const hits: Hit[] = useMemo(() => {
    if (query.trim().length < 2) return [];
    return MODULE_TABS.filter((m) => canOpenModule(access[m.moduleId])).flatMap(
      (m) =>
        embeddedNav.search(m.moduleId, query).map((r) => ({
          ...r,
          moduleId: m.moduleId,
          route: m.route,
          moduleTitle: m.title,
        })),
    );
  }, [query, access, embeddedNav]);

  useEffect(() => {
    setOpen(false);
    setPhoneOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (window.matchMedia("(max-width: 860px)").matches) setPhoneOpen(true);
        else inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (phoneOpen) setTimeout(() => phoneInputRef.current?.focus(), 30);
  }, [phoneOpen]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function choose(h: Hit) {
    embeddedNav.navigateTo(h.moduleId, h.page, h.recordId);
    if (location.pathname !== h.route) navigate(h.route);
    setQuery("");
    setOpen(false);
    setPhoneOpen(false);
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter" && hits[cursor]) {
      choose(hits[cursor]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setPhoneOpen(false);
    }
  }

  const results = (
    <div
      className="gsearch-results"
      role="listbox"
      data-testid="gsearch-results"
    >
      {query.trim().length < 2 ? (
        <p className="gsearch-empty">
          Type an LP ID, equipment, VIB ID, report ID or sample ID.
        </p>
      ) : hits.length === 0 ? (
        <p className="gsearch-empty">Nothing found for “{query.trim()}”.</p>
      ) : (
        hits.map((h, i) => (
          <button
            key={`${h.moduleId}-${h.kind}-${h.title}-${i}`}
            type="button"
            role="option"
            aria-selected={i === cursor}
            className={
              i === cursor ? "gsearch-hit gsearch-hit--active" : "gsearch-hit"
            }
            onMouseEnter={() => setCursor(i)}
            onClick={() => choose(h)}
          >
            <span className="gsearch-kind">
              {KIND_LABEL[h.kind] || h.kind}
            </span>
            <span className="gsearch-text">
              <b className={h.kind === "sample" ? undefined : "gsearch-mono"}>
                {h.title}
              </b>
              {h.subtitle && <small>{h.subtitle}</small>}
            </span>
          </button>
        ))
      )}
    </div>
  );

  return (
    <>
      <div className="gsearch" ref={boxRef}>
        <label className="gsearch-box">
          <Icon name="search" size={16} />
          <input
            ref={inputRef}
            type="search"
            value={query}
            placeholder="Search equipment, LP ID, VIB ID, sample ID…"
            aria-label="Search equipment, LP ID or sample ID"
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
              setOpen(true);
            }}
            onKeyDown={onKeyDown}
            data-testid="gsearch-input"
          />
          <kbd>Ctrl K</kbd>
        </label>
        {open && results}
      </div>
      <button
        type="button"
        className="gsearch-phone-btn shell-topbar-icon-btn"
        aria-label="Search"
        onClick={() => setPhoneOpen(true)}
        data-testid="gsearch-phone"
      >
        <Icon name="search" size={19} />
      </button>
      {phoneOpen &&
        createPortal(
          <div className="gsearch-phone" role="dialog" aria-label="Search">
            <div className="gsearch-phone-bar">
              <label className="gsearch-box">
                <Icon name="search" size={18} />
                <input
                  ref={phoneInputRef}
                  type="search"
                  value={query}
                  placeholder="Equipment, LP ID, sample ID…"
                  aria-label="Search equipment, LP ID or sample ID"
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setCursor(0);
                  }}
                  onKeyDown={onKeyDown}
                />
              </label>
              <button
                type="button"
                className="gsearch-cancel"
                onClick={() => setPhoneOpen(false)}
              >
                Cancel
              </button>
            </div>
            {results}
          </div>,
          document.body,
        )}
    </>
  );
}
