import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { describeError, postAction } from '../api/client';
import { PLATFORM_CORE_URL } from '../config';
import { termKey, TERMS } from './terms';
import { setSheetTranslations, useLang } from './translator';
import './ArabicWords.css';

type SheetTerm = { key: string; en: string; ar: string; area?: string; status?: string };
type Row = { key: string; area: string; en: string; draft: string; sheet: SheetTerm | null };
const PAGE = 50;

// Settings → Language. Everyone picks English or Arabic; the App Owner
// also checks the Arabic word list, which lives in Platform Core's
// TRANSLATIONS sheet (edit here or straight in the spreadsheet).
export default function ArabicWordsPanel({ isAppOwner }: { isAppOwner: boolean }) {
  const [lang, setLang] = useLang();
  return (
    <>
      <div className="settings-card">
        <p className="settings-card-title">Language</p>
        <p className="settings-intro">Kept on this device. Codes, numbers and what people type stay as they are.</p>
        <div className="aw-langs" data-no-translate="">
          <button type="button" className={`aw-lang${lang === 'en' ? ' aw-lang--on' : ''}`} aria-pressed={lang === 'en'} onClick={() => setLang('en')} data-testid="lang-en">
            English
          </button>
          <button type="button" className={`aw-lang${lang === 'ar' ? ' aw-lang--on' : ''}`} aria-pressed={lang === 'ar'} onClick={() => setLang('ar')} lang="ar" data-testid="lang-ar">
            العربية
          </button>
        </div>
      </div>
      {isAppOwner && <WordList />}
    </>
  );
}

function WordList() {
  const { sessionToken } = useAuth();
  const [sheet, setSheet] = useState<SheetTerm[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'all' | 'draft' | 'approved' | 'missing'>('all');
  const [limit, setLimit] = useState(PAGE);

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await postAction<{ terms: SheetTerm[] }>(PLATFORM_CORE_URL, 'getTranslations', { sessionToken });
      setSheet(r.terms || []);
      setSheetTranslations(r.terms || []);
    } catch (e) {
      setError(describeError(e, 'Could not read the word list.'));
    }
  }, [sessionToken]);
  useEffect(() => {
    load();
  }, [load]);

  const rows: Row[] = useMemo(() => {
    const by = new Map((sheet || []).map((t) => [t.key, t]));
    const seen = new Set<string>();
    const out: Row[] = [];
    TERMS.forEach(([area, en, ar]) => {
      const key = termKey(area, en);
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ key, area, en, draft: ar, sheet: by.get(key) || null });
    });
    return out;
  }, [sheet]);
  const missing = rows.filter((r) => !r.sheet);
  const drafts = rows.filter((r) => r.sheet && r.sheet.status !== 'Approved');
  const needle = q.trim().toLowerCase();
  const shown = rows
    .filter((r) => (show === 'missing' ? !r.sheet : show === 'draft' ? r.sheet && r.sheet.status !== 'Approved' : show === 'approved' ? r.sheet?.status === 'Approved' : true))
    .filter((r) => !needle || r.en.toLowerCase().includes(needle) || (r.sheet?.ar || r.draft).includes(q.trim()) || r.area.toLowerCase().includes(needle));

  async function addAll() {
    setBusy(true);
    setMsg('');
    try {
      const terms = missing.map((r) => ({ key: r.key, en: r.en, ar: r.draft, area: r.area }));
      const res = await postAction<{ added: number }>(PLATFORM_CORE_URL, 'addTranslationTerms', { sessionToken, terms });
      setMsg(`${res.added} words added to the sheet as Draft.`);
      await load();
    } catch (e) {
      setMsg(describeError(e, 'Could not add the words.'));
    } finally {
      setBusy(false);
    }
  }

  async function save(r: Row, ar: string, status: string) {
    await postAction(PLATFORM_CORE_URL, 'saveTranslation', { sessionToken, key: r.key, arabic: ar, status });
    const next = (sheet || []).map((t) => (t.key === r.key ? { ...t, ar, status } : t));
    setSheet(next);
    setSheetTranslations(next);
  }

  return (
    <div className="settings-card" data-testid="arabic-words">
      <p className="settings-card-title">Arabic word list</p>
      <p className="settings-intro">
        The app's words with their Arabic, kept in Platform Core's TRANSLATIONS sheet. Change the Arabic here or in the sheet; mark a word Approved once
        checked. What's in the sheet is what people see.
      </p>
      {error && <p className="aw-error">{error}</p>}
      {sheet && (
        <p className="aw-status" data-testid="aw-status">
          {rows.length} words in the app · {rows.length - missing.length} in the sheet · {drafts.length} still Draft
        </p>
      )}
      {sheet && missing.length > 0 && (
        <button type="button" className="aw-primary" onClick={addAll} disabled={busy} data-testid="aw-add-all">
          {busy ? 'Adding…' : `Add ${missing.length} words to the sheet`}
        </button>
      )}
      {msg && <p className="aw-msg">{msg}</p>}
      <div className="aw-tools">
        <input className="aw-search" type="search" placeholder="Search English or Arabic…" aria-label="Search words" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} />
        <div className="aw-chips" role="group" aria-label="Show">
          {(
            [
              ['all', 'All', rows.length],
              ['draft', 'Draft', drafts.length],
              ['approved', 'Approved', rows.length - missing.length - drafts.length],
              ['missing', 'Not in the sheet', missing.length],
            ] as const
          ).map(([k, label, n]) => (
            <button key={k} type="button" className={`aw-chip${show === k ? ' aw-chip--on' : ''}`} aria-pressed={show === k} onClick={() => { setShow(k); setLimit(PAGE); }}>
              {label} <b>{n}</b>
            </button>
          ))}
        </div>
      </div>
      {!sheet && !error && <p className="aw-status">Loading…</p>}
      <div className="aw-list">
        {shown.slice(0, limit).map((r) => (
          <WordRow key={r.key} row={r} onSave={save} />
        ))}
      </div>
      {shown.length > limit && (
        <button type="button" className="aw-more" onClick={() => setLimit((n) => n + PAGE)}>
          Show {Math.min(PAGE, shown.length - limit)} more · {shown.length - limit} left
        </button>
      )}
    </div>
  );
}

function WordRow({ row, onSave }: { row: Row; onSave: (r: Row, ar: string, status: string) => Promise<void> }) {
  const current = row.sheet?.ar || row.draft;
  const [ar, setAr] = useState(current);
  const [status, setStatus] = useState(row.sheet?.status === 'Approved' ? 'Approved' : 'Draft');
  const [state, setState] = useState('');
  const changed = ar !== current || status !== (row.sheet?.status === 'Approved' ? 'Approved' : 'Draft');
  return (
    <div className="aw-row" data-testid={`aw-row-${row.key}`}>
      <div className="aw-en" data-no-translate="">
        <span className="aw-area">{row.area}</span>
        {row.en}
      </div>
      <input className="aw-ar" dir="rtl" lang="ar" value={ar} onChange={(e) => setAr(e.target.value)} aria-label={`Arabic for ${row.en}`} />
      <select className="aw-st" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" disabled={!row.sheet}>
        <option value="Draft">Draft</option>
        <option value="Approved">Approved</option>
      </select>
      <button
        type="button"
        className="aw-save"
        disabled={!row.sheet || !changed || state === 'saving'}
        title={row.sheet ? undefined : 'Add the words to the sheet first'}
        onClick={async () => {
          setState('saving');
          try {
            await onSave(row, ar.trim(), status);
            setState('saved');
          } catch {
            setState('error');
          }
        }}
      >
        {state === 'saving' ? '…' : state === 'saved' && !changed ? '✓' : 'Save'}
      </button>
      {state === 'error' && <span className="aw-error">Not saved</span>}
    </div>
  );
}
