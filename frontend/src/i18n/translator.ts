import { useEffect, useState } from 'react';
import { termKey, TERMS } from './terms';

// Arabic view (mobile app M4). One translator for the whole page — the
// shell and the embedded Oil and Vibration apps share one document — so the
// module apps need no per-string changes: any text, placeholder, aria-label
// or title whose English is in the word list shows in Arabic, and switching
// back puts the English back. What people type, codes and numbers are left
// alone. Phrases with numbers use patterns ("{n} machines").
//
// The word list: TERMS (draft Arabic) overridden by Platform Core's
// TRANSLATIONS sheet (see loadSheetTranslations), which the App Owner edits.

export type Lang = 'en' | 'ar';
const LANG_KEY = 'acc.lang';
const SHEET_KEY = 'acc.translations.v1';

let lang: Lang = readLang();
const listeners = new Set<() => void>();

function readLang(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === 'ar' ? 'ar' : 'en';
  } catch {
    return 'en';
  }
}

// ── the word list ──────────────────────────────────────────────
type SheetTerm = { key: string; en: string; ar: string; status?: string };
let exact = new Map<string, string>();
let patterns: { re: RegExp; ar: string }[] = [];

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function build(sheet: SheetTerm[]) {
  const byKey = new Map(sheet.filter((t) => t.ar && t.ar.trim()).map((t) => [t.key, t.ar.trim()]));
  const nextExact = new Map<string, string>();
  const nextPatterns: { re: RegExp; ar: string }[] = [];
  const add = (en: string, ar: string) => {
    if (!en || !ar) return;
    if (/\{[nm]\}/.test(en)) {
      const re = new RegExp('^' + escapeRe(norm(en)).replace(/\\\{n\\\}/g, '(?<n>[\\d.,%]+)').replace(/\\\{m\\\}/g, '(?<m>[\\d.,%]+)') + '$');
      nextPatterns.push({ re, ar });
    } else nextExact.set(norm(en), ar);
  };
  TERMS.forEach(([area, en, ar]) => add(en, byKey.get(termKey(area, en)) || ar));
  // words added to the sheet that the app doesn't list yet
  const known = new Set(TERMS.map(([area, en]) => termKey(area, en)));
  sheet.forEach((t) => !known.has(t.key) && t.en && t.ar && add(t.en, t.ar.trim()));
  exact = nextExact;
  patterns = nextPatterns;
}

function readSheetCache(): SheetTerm[] {
  try {
    return JSON.parse(localStorage.getItem(SHEET_KEY) || '[]');
  } catch {
    return [];
  }
}
build(readSheetCache());

export function setSheetTranslations(terms: SheetTerm[]) {
  try {
    localStorage.setItem(SHEET_KEY, JSON.stringify(terms));
  } catch {
    /* ignore */
  }
  build(terms);
  if (lang === 'ar') retranslateAll();
}

function lookup(key: string): string | null {
  const hit = exact.get(key);
  if (hit) return hit;
  for (const p of patterns) {
    const m = p.re.exec(key);
    if (m) return p.ar.replace('{n}', m.groups?.n ?? '').replace('{m}', m.groups?.m ?? '');
  }
  return null;
}

// "◆ Poor", "Poor ›": the words without the symbols around them
function core(key: string): string | null {
  const m = /^([^A-Za-z]*)(.*?)([^A-Za-z]*)$/.exec(key);
  if (!m || !m[2] || (!m[1] && !m[3])) return null;
  const ar = lookup(m[2]);
  return ar ? m[1] + ar + m[3] : null;
}

export function translate(text: string): string | null {
  const key = norm(text);
  if (!key || !/[A-Za-z]/.test(key)) return null;
  const whole = lookup(key) || core(key);
  if (whole) return whole;
  // "Alert · 2026-04-26", "Kiln#2 — Oil change": each part on its own
  const parts = key.split(/( · | — )/);
  if (parts.length > 1) {
    let changed = false;
    const out = parts.map((p, i) => {
      if (i % 2) return p;
      const ar = lookup(p) || core(p);
      if (ar) changed = true;
      return ar || p;
    });
    if (changed) return out.join('');
  }
  return null;
}

// ── applying it to the page ────────────────────────────────────
const originals = new WeakMap<Text, string>();
const shown = new WeakMap<Text, string>();
const attrOriginals = new WeakMap<Element, Record<string, string>>();
const ATTRS = ['placeholder', 'aria-label', 'title'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'NOSCRIPT']);

function skipped(el: Element | null): boolean {
  for (let e = el; e; e = e.parentElement) {
    if (SKIP.has(e.tagName) || e.hasAttribute('data-no-translate') || (e as HTMLElement).isContentEditable) return true;
  }
  return false;
}

function doText(node: Text) {
  const cur = node.nodeValue || '';
  if (shown.get(node) === cur) return; // our own change
  if (skipped(node.parentElement)) return;
  const ar = translate(cur);
  if (!ar) {
    originals.delete(node);
    shown.delete(node);
    return;
  }
  originals.set(node, cur);
  const lead = cur.match(/^\s*/)?.[0] || '';
  const trail = cur.match(/\s*$/)?.[0] || '';
  const next = lead + ar + trail;
  shown.set(node, next);
  node.nodeValue = next;
}

function doAttrs(el: Element) {
  if (skipped(el)) return;
  ATTRS.forEach((a) => {
    const v = el.getAttribute(a);
    if (!v) return;
    const saved = attrOriginals.get(el) || {};
    if (saved[`${a}:shown`] === v) return;
    const ar = translate(v);
    if (!ar) return;
    saved[a] = v;
    saved[`${a}:shown`] = ar;
    attrOriginals.set(el, saved);
    el.setAttribute(a, ar);
  });
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return doText(root as Text);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  doAttrs(el);
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) doText(n as Text);
    else doAttrs(n as Element);
  }
}

function restoreAll() {
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = n as Text;
      const o = originals.get(t);
      if (o != null && shown.get(t) === t.nodeValue) t.nodeValue = o;
      originals.delete(t);
      shown.delete(t);
    } else {
      const el = n as Element;
      const saved = attrOriginals.get(el);
      if (!saved) continue;
      ATTRS.forEach((a) => {
        if (saved[a] != null && el.getAttribute(a) === saved[`${a}:shown`]) el.setAttribute(a, saved[a]);
      });
      attrOriginals.delete(el);
    }
  }
}

function retranslateAll() {
  if (document.body) walk(document.body);
}

let observer: MutationObserver | null = null;
let pending: Node[] = [];
let scheduled = false;
function flush() {
  scheduled = false;
  const list = pending;
  pending = [];
  list.forEach((n) => n.isConnected && walk(n));
}
function startObserver() {
  if (observer || typeof MutationObserver === 'undefined') return;
  observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') pending.push(m.target);
      else if (m.type === 'attributes') pending.push(m.target);
      else m.addedNodes.forEach((n) => pending.push(n));
    }
    if (!scheduled) {
      scheduled = true;
      // before paint, so English doesn't flash
      queueMicrotask(flush);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
function stopObserver() {
  observer?.disconnect();
  observer = null;
  pending = [];
}

function applyDocument() {
  const root = document.documentElement;
  root.lang = lang === 'ar' ? 'ar' : 'en';
  root.dir = lang === 'ar' ? 'rtl' : 'ltr';
  root.classList.toggle('lang-ar', lang === 'ar');
}

export function startTranslator() {
  applyDocument();
  if (lang === 'ar') {
    retranslateAll();
    startObserver();
  }
}

export function getLang(): Lang {
  return lang;
}

export function setLang(next: Lang) {
  if (next === lang) return;
  lang = next;
  try {
    localStorage.setItem(LANG_KEY, next);
  } catch {
    /* ignore */
  }
  applyDocument();
  if (next === 'ar') {
    retranslateAll();
    startObserver();
  } else {
    stopObserver();
    restoreAll();
  }
  listeners.forEach((l) => l());
}

export function useLang(): [Lang, (l: Lang) => void] {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((t) => t + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return [lang, setLang];
}
