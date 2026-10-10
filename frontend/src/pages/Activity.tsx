import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { describeError, postAction } from '../api/client';
import { PLATFORM_CORE_URL } from '../config';
import { moduleGet } from '../moduleAccess';
import { useEmbeddedNav } from '../embeddedNav';
import IdSearch from '../components/IdSearch';
import { Icon } from '../icons';
import './Activity.css';

// Activity (step 4): every change in every module, newest first — the Oil
// Audit Log, the Vibration Audit tab and the platform's own logs
// (PLATFORM_LOG, EQUIPMENT_LOG) merged into one list. App Owner and ACC
// managers only (each backend checks it too). Replaces Oil's own Activity tab.

type Source = 'oil' | 'vib' | 'platform';
type Raw = { at: string; by: string; area: string; record: string; change: string; details: string; contractor: string; equipment: string };
type Entry = Raw & {
  source: Source;
  type: string;
  kind: 'Added' | 'Changed' | 'Status' | 'Removed' | 'Access';
  title: string;
  what: string;
  open: { path: string; module?: string; page?: string; recordId?: string } | null;
};

const SOURCES: { id: Source; label: string; moduleId?: string }[] = [
  { id: 'oil', label: 'Oil', moduleId: 'oil-analysis' },
  { id: 'vib', label: 'Vibration', moduleId: 'vibration-analysis' },
  { id: 'platform', label: 'Platform' },
];
const RANGES = [
  { id: 'today', label: 'Today', days: 0 },
  { id: 'week', label: 'This week', days: 7 },
  { id: 'month', label: 'This month', days: 31 },
  { id: 'quarter', label: 'Last 3 months', days: 92 },
  { id: 'year', label: 'Last 12 months', days: 365 },
];

const OIL_TYPES: Record<string, [string, string]> = {
  ROUTINES: ['Route', 'routines'],
  OA_ROUTINE_ITEMS: ['Route', 'routines'],
  ROUTINE_TEMPLATES: ['Route template', 'routines'],
  'Action Tracker': ['Action', 'actions'],
  Data_Entry: ['Lab report', 'oilreport'],
  'Oil Sample Tracker': ['Sampling', 'tracker'],
  'Equipment Registry': ['Lub ID', 'equipment'],
  'Oil Change LOG': ['Oil change', 'oilchange'],
  'Oil Top Up LOG': ['Top-up', 'oilchange'],
  'Oil Inventory': ['Inventory', 'inventory'],
  'Oil Inventory LOG': ['Inventory', 'inventory'],
  'Dashboard Settings': ['Settings', ''],
  OL_ACTION_PHRASES: ['Settings', ''],
  'Module Access': ['Access', ''],
  OL_MODULE_RESPONSIBILITIES: ['Access', ''],
  Delegation: ['Delegation', ''],
};

function kindOf(change: string, type: string): Entry['kind'] {
  if (type === 'Access' || type === 'Delegation' || type === 'User') return 'Access';
  const c = change.toLowerCase();
  if (/^(create|added?)|created|readings added|new/.test(c)) return 'Added';
  if (/delete|remov|cancel|retire/.test(c)) return 'Removed';
  if (/clos|approv|confirm|submit|sent|return|open|reopen|waiting|reschedul|assign|restor|skip|dismiss|status|password/.test(c)) return 'Status';
  return 'Changed';
}

function classify(raw: Raw, source: Source): Entry {
  let type = 'Record';
  let what = raw.change;
  let open: Entry['open'] = null;
  if (source === 'oil') {
    const [t, page] = OIL_TYPES[raw.area] || [raw.area || 'Record', ''];
    type = t;
    const verb = { create: 'Added', update: 'Changed', delete: 'Deleted', 'direct-edit': 'Edited directly in the sheet (not through the app)' }[raw.change.toLowerCase()] || raw.change;
    what = raw.change === 'direct-edit' ? `${verb}${raw.details ? ' · ' + raw.details : ''}` : raw.details && !/^(Updated|Added|Deleted) .* entry$/.test(raw.details) ? raw.details : verb;
    if (page) open = { path: '/oil-lubrication', module: 'oil-analysis', page, recordId: ['routines', 'actions'].includes(page) ? raw.record : undefined };
    else if (t === 'Settings') open = { path: '/settings?module=oil-analysis' };
    else if (t === 'Access') open = { path: '/settings?tab=module-access' };
    else if (t === 'Delegation') open = { path: '/settings?tab=delegations' };
  } else if (source === 'vib') {
    const r = raw.record;
    if (/^VA-/.test(r)) type = 'Action';
    else if (/^VR-/.test(r)) type = 'Route';
    else if (/^VL-/.test(r)) type = 'Report';
    else if (raw.change === 'Limits changed') type = 'Limits';
    else if (raw.change === 'Settings') type = 'Settings';
    else if (raw.change === 'Module Access') type = 'Access';
    else if (raw.change === 'Delegation') type = 'Delegation';
    else if (/Suggestion/.test(raw.change)) type = 'Route suggestion';
    what = raw.change;
    const page = { Action: 'actions', Route: 'routes', Report: 'log', Limits: 'limits', 'Route suggestion': 'routes' }[type];
    if (page) open = { path: '/vibration-analysis', module: 'vibration-analysis', page, recordId: ['Action', 'Route', 'Report'].includes(type) ? r : undefined };
    else if (type === 'Settings') open = { path: '/settings?module=vibration-analysis' };
    else if (type === 'Access') open = { path: '/settings?tab=module-access' };
    else if (type === 'Delegation') open = { path: '/settings?tab=delegations' };
  } else {
    type = { Equipment: 'Equipment', Users: 'User', 'Settings access': 'Settings', 'Email & notifications': 'Settings' }[raw.area] || raw.area || 'Record';
    if (type === 'Equipment') open = { path: `/equipment/${encodeURIComponent(raw.record)}` };
    else if (raw.area === 'Settings access') open = { path: '/settings?tab=settings-access' };
    else if (raw.area === 'Email & notifications') open = { path: '/settings?tab=email' };
    else if (type === 'User') open = { path: '/settings?tab=users' };
  }
  const record = raw.record && !['Intervals', 'Targets', 'Action phrases'].includes(raw.record) ? raw.record : '';
  const title =
    source === 'vib' && type === 'Settings' ? `Settings · ${raw.record}` : record && record.toLowerCase().startsWith(type.toLowerCase()) ? record : [type, record].filter(Boolean).join(' ');
  // vibration details go in the line under; oil's summary already is the "what"
  return { ...raw, source, type, kind: kindOf(raw.change, type), title, what, open };
}

const KIND_ICON: Record<Entry['kind'], string> = { Added: 'ti-plus', Changed: 'ti-pencil', Status: 'ti-arrows-exchange', Removed: 'ti-trash', Access: 'ti-shield' };
const who = (e: string) => (e.includes('@') ? e.split('@')[0] : e) || '—';
const dayKey = (iso: string) => new Date(iso).toDateString();

function startOf(rangeId: string): Date {
  const r = RANGES.find((x) => x.id === rangeId) || RANGES[1];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (r.days) d.setDate(d.getDate() - r.days + 1);
  return d;
}
function monthStart(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export default function Activity() {
  const { sessionToken, claims } = useAuth();
  const navigate = useNavigate();
  const embeddedNav = useEmbeddedNav();
  const allowed = !!claims?.roles.some((r) => r === 'ROLE-ADMIN' || r === 'ROLE-MGR');
  const [range, setRange] = useState('week');
  const [loadedFrom, setLoadedFrom] = useState<Date | null>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [mods, setMods] = useState<Source[]>([]);
  const [contractor, setContractor] = useState('');
  const [person, setPerson] = useState('');
  const [kind, setKind] = useState('');
  const [type, setType] = useState('');

  // load from the start of this month, or further back when the range needs it
  const need = useMemo(() => {
    const a = startOf(range);
    const m = monthStart();
    return a < m ? a : m;
  }, [range]);
  useEffect(() => {
    if (!sessionToken || !allowed) return;
    if (loadedFrom && loadedFrom <= need) return;
    let cancelled = false;
    const from = need.toISOString();
    Promise.allSettled([
      moduleGet('oil-analysis', sessionToken, { action: 'getActivityFeed', from }),
      moduleGet('vibration-analysis', sessionToken, { action: 'getActivityFeed', from }),
      postAction<{ entries: Raw[] }>(PLATFORM_CORE_URL, 'listPlatformActivity', { sessionToken, from }),
    ]).then((res) => {
      if (cancelled) return;
      const out: Entry[] = [];
      const bad: string[] = [];
      (['oil', 'vib', 'platform'] as Source[]).forEach((src, i) => {
        const r = res[i];
        const label = SOURCES[i].label;
        if (r.status === 'rejected') {
          bad.push(`${label}: ${describeError(r.reason, "couldn't load")}`);
          return;
        }
        const j = r.value as { entries?: Raw[]; error?: string };
        if (!j || !Array.isArray(j.entries)) {
          bad.push(`${label}: ${j?.error || 'not updated yet (paste ActivityFeed.js)'}`);
          return;
        }
        j.entries.forEach((x) => out.push(classify(x, src)));
      });
      out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
      setEntries(out);
      setFailed(bad);
      setLoadedFrom(need);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionToken, allowed, need, loadedFrom]);

  const all = useMemo(() => entries || [], [entries]);
  const people = useMemo(() => [...new Set(all.map((e) => e.by).filter(Boolean))].sort(), [all]);
  const types = useMemo(() => [...new Set(all.map((e) => e.type))].sort(), [all]);
  const rangeFrom = startOf(range).toISOString();
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all.filter(
      (e) =>
        e.at >= rangeFrom &&
        (!mods.length || mods.includes(e.source)) &&
        (!contractor || e.contractor === contractor) &&
        (!person || e.by === person) &&
        (!kind || e.kind === kind) &&
        (!type || e.type === type) &&
        (!t || [e.record, e.equipment, e.details, e.what, e.by, e.title].some((v) => v.toLowerCase().includes(t))),
    );
  }, [all, rangeFrom, mods, contractor, person, kind, type, q]);

  const todayIso = startOf('today').toISOString();
  const monthIso = monthStart().toISOString();
  const count = (f: (e: Entry) => boolean) => all.filter(f).length;
  const ids = useMemo(() => {
    const m = new Map<string, string>();
    all.forEach((e) => {
      if (e.equipment) m.set(e.equipment, 'Equipment');
      if (e.record && /\d/.test(e.record)) m.set(e.record, e.type);
    });
    return [...m.entries()].map(([code, description]) => ({ code, description }));
  }, [all]);

  function openEntry(e: Entry) {
    if (!e.open) return;
    navigate(e.open.path);
    if (e.open.module && e.open.page) embeddedNav.navigateTo(e.open.module, e.open.page, e.open.recordId);
  }

  function exportCsv() {
    const cells = (v: string) => `"${String(v || '').replace(/"/g, '""')}"`;
    const head = ['When', 'Module', 'Who', 'Record type', 'Record', 'Change', 'Details', 'Contractor', 'Equipment ID'];
    const rows = shown.map((e) => [e.at, SOURCES.find((s) => s.id === e.source)?.label || '', e.by, e.type, e.record, e.what, e.details, e.contractor, e.equipment]);
    const csv = [head, ...rows].map((r) => r.map(cells).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `activity-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!allowed)
    return (
      <div className="act-page">
        <h1>Activity</h1>
        <p className="act-muted">Activity is for the App Owner and ACC managers.</p>
      </div>
    );

  // group by day
  const groups: { day: string; items: Entry[] }[] = [];
  shown.slice(0, 500).forEach((e) => {
    const k = dayKey(e.at);
    if (!groups.length || groups[groups.length - 1].day !== k) groups.push({ day: k, items: [] });
    groups[groups.length - 1].items.push(e);
  });
  const dayLabel = (k: string) => {
    const d = new Date(k);
    const t = new Date();
    const y = new Date(t);
    y.setDate(t.getDate() - 1);
    const long = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    return d.toDateString() === t.toDateString() ? `Today · ${long}` : d.toDateString() === y.toDateString() ? 'Yesterday' : long;
  };
  const chip = (on: boolean) => (on ? 'act-chip act-chip--on' : 'act-chip');
  const toggleMod = (m: Source) => setMods((x) => (x.includes(m) ? x.filter((y) => y !== m) : [...x, m]));

  return (
    <div className="act-page" data-testid="activity">
      <h1>Activity</h1>
      <p className="act-sub">
        Every change in every module, newest first{entries ? ` · ${count((e) => e.at >= monthIso).toLocaleString()} this month` : ''}
      </p>

      <div className="act-tiles">
        <div className="act-tile act-tile--all">
          <span>Today</span>
          <b data-testid="act-today">{entries ? count((e) => e.at >= todayIso) : '…'}</b>
          <small>changes</small>
        </div>
        <div className="act-tile act-tile--oil">
          <span>Oil Lubrication</span>
          <b data-testid="act-oil">{entries ? count((e) => e.source === 'oil' && e.at >= monthIso) : '…'}</b>
          <small>this month</small>
        </div>
        <div className="act-tile act-tile--vib">
          <span>Vibration Analysis</span>
          <b data-testid="act-vib">{entries ? count((e) => e.source === 'vib' && e.at >= monthIso) : '…'}</b>
          <small>this month</small>
        </div>
        <div className="act-tile act-tile--platform">
          <span>Platform</span>
          <b data-testid="act-platform">{entries ? count((e) => e.source === 'platform' && e.at >= monthIso) : '…'}</b>
          <small>equipment, users, access</small>
        </div>
      </div>

      <section className="act-card">
        <div className="act-filters">
          <div className="act-search">
            <IdSearch options={ids} value={q} onChange={setQ} placeholder="Equipment ID, Lub ID, Vib ID, record…" testid="act-search" />
          </div>
          <span className="act-chips" role="group" aria-label="Module">
            <button type="button" className={chip(!mods.length)} onClick={() => setMods([])}>All modules</button>
            {SOURCES.map((m) => (
              <button key={m.id} type="button" className={chip(mods.includes(m.id))} onClick={() => toggleMod(m.id)} data-testid={`act-mod-${m.id}`}>
                {m.label}
              </button>
            ))}
          </span>
          <span className="act-chips" role="group" aria-label="Contractor">
            {['', 'RHI', 'ASEC'].map((c) => (
              <button key={c || 'all'} type="button" className={chip(contractor === c)} onClick={() => setContractor(c)} data-testid={`act-con-${c || 'all'}`}>
                {c || 'All contractors'}
              </button>
            ))}
          </span>
          <select className="act-select" value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Person" data-testid="act-person">
            <option value="">Anyone</option>
            {people.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select className="act-select" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Change" data-testid="act-kind">
            <option value="">All changes</option>
            {['Added', 'Changed', 'Status', 'Removed', 'Access'].map((k) => (
              <option key={k} value={k}>{k === 'Status' ? 'Status changes' : k === 'Access' ? 'Access & delegation' : k}</option>
            ))}
          </select>
          <select className="act-select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Record type" data-testid="act-type">
            <option value="">All records</option>
            {types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select className="act-select" value={range} onChange={(e) => setRange(e.target.value)} aria-label="When" data-testid="act-range">
            {RANGES.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
          <button type="button" className="act-btn" onClick={exportCsv} disabled={!shown.length} data-testid="act-export">
            <Icon name="download" size={15} /> Export
          </button>
        </div>

        {failed.length > 0 && (
          <div className="act-warn" data-testid="act-failed">
            Not shown: {failed.join(' · ')}
          </div>
        )}
        {!entries && <p className="act-muted">Loading…</p>}
        {entries && !shown.length && <p className="act-muted">No changes match.</p>}
        {groups.map((g) => (
          <div key={g.day} className="act-day">
            <div className="act-day-label">{dayLabel(g.day)}</div>
            {g.items.map((e, i) => (
              <div key={`${e.at}-${i}`} className="act-row" data-testid="act-row">
                <span className="act-time">{new Date(e.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                <span className={`act-icon act-icon--${e.kind}`}>
                  <i className={`ti ${KIND_ICON[e.kind]}`} aria-hidden="true" />
                </span>
                <span className="act-main">
                  <span className="act-title">
                    <b>{e.title}</b> <span className="act-what">· {e.what}</span>
                  </span>
                  <span className="act-meta">
                    <span className={`act-badge act-badge--${e.source}`}>{SOURCES.find((s) => s.id === e.source)?.label}</span>
                    <span>{who(e.by)}</span>
                    {e.contractor && <span>{e.contractor}</span>}
                    {e.equipment && e.equipment !== e.record && <span className="act-mono">{e.equipment}</span>}
                    {e.source !== 'oil' && e.details && <span className="act-details">{e.details}</span>}
                  </span>
                </span>
                {e.open && (
                  <button type="button" className="act-btn" onClick={() => openEntry(e)} data-testid="act-open">
                    Open
                  </button>
                )}
              </div>
            ))}
          </div>
        ))}
        {shown.length > 500 && <p className="act-muted">Showing the newest 500 of {shown.length} — narrow the filters, or Export for all.</p>}
      </section>
    </div>
  );
}
