import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/client';
import { saveAreas, type AreaEntry, type PlatformEquipment } from '../api/platformCore';
import { areaKey, setAreas, useAreas } from '../areas';
import { PLANT_MODULES } from '../plant';
import { usePlantData } from '../pages/plantShared';
import { TablerIcon } from '../icons';

// Settings → Equipment & IDs → Areas: the official area names. Top: every
// name in use (platform list, Oil, Vibration) and the official name it shows
// as — pick one per name. Below: the official list itself (lines and the
// areas in each), editable. Nothing in the sheets is renamed; every page
// shows the official name (areas.ts). App Owner edits; others view.

type Use = { name: string; platform: number; byModule: Record<string, number> };

export default function AreasTab({ list, readOnly }: { list: PlatformEquipment[] | null; readOnly: boolean }) {
  const { sessionToken } = useAuth();
  const saved = useAreas(sessionToken);
  const { state, modules } = usePlantData();
  const [draft, setDraft] = useState<AreaEntry[] | null>(null);
  const [only, setOnly] = useState<'todo' | 'all'>('todo');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const canEdit = !readOnly && !!saved?.canEdit;

  useEffect(() => {
    if (saved && !draft) setDraft(saved.areas.map((x) => ({ ...x, aliases: [...x.aliases] })));
  }, [saved, draft]);

  // every name in use, with where it comes from
  const uses = useMemo(() => {
    const m = new Map<string, Use>();
    const add = (raw: string, f: (u: Use) => void) => {
      const name = String(raw || '').trim();
      if (!name) return;
      const k = areaKey(name);
      if (!m.has(k)) m.set(k, { name, platform: 0, byModule: {} });
      f(m.get(k)!);
    };
    (list || []).filter((e) => !/retired/i.test(e.status)).forEach((e) => {
      add(e.mainArea, (u) => u.platform++);
      if (areaKey(e.plantArea) !== areaKey(e.mainArea)) add(e.plantArea, (u) => u.platform++);
    });
    modules.forEach(({ moduleId }) =>
      (state[moduleId]?.machines || []).forEach((x) => add(x.area, (u) => (u.byModule[moduleId] = (u.byModule[moduleId] || 0) + 1))),
    );
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [list, state, modules]);

  if (!saved || !draft) return <p className="eid-muted">Loading the area list…</p>;

  const lines = draft.filter((x) => x.kind === 'Line');
  const entriesOf = (name: string) => draft.filter((x) => areaKey(x.name) === areaKey(name) || x.aliases.some((a) => areaKey(a) === areaKey(name)));
  const entryOf = (name: string) => entriesOf(name)[0];
  const todo = uses.filter((u) => !entryOf(u.name));
  const shown = only === 'todo' && todo.length ? todo : uses;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved.areas);

  const update = (fn: (d: AreaEntry[]) => void) => {
    setMsg(null);
    setDraft((d) => {
      const next = (d || []).map((x) => ({ ...x, aliases: [...x.aliases] }));
      fn(next);
      return next;
    });
  };
  // a name in use → shows as `target` (an official name, or "" = as it is)
  const mapName = (name: string, target: string) =>
    target !== '__split' &&
    update((d) => {
      d.forEach((x) => (x.aliases = x.aliases.filter((a) => areaKey(a) !== areaKey(name))));
      const t = d.find((x) => x.name === target);
      if (t && areaKey(t.name) !== areaKey(name)) t.aliases.push(name);
    });
  const addAlias = (entry: string, name: string) =>
    update((d) => {
      const t = d.find((x) => x.name === entry);
      if (t && name && areaKey(name) !== areaKey(t.name) && !t.aliases.some((a) => areaKey(a) === areaKey(name))) t.aliases.push(name);
    });
  const removeAlias = (entry: string, name: string) =>
    update((d) => {
      const t = d.find((x) => x.name === entry);
      if (t) t.aliases = t.aliases.filter((a) => a !== name);
    });
  const rename = (old: string, name: string) =>
    update((d) => {
      d.forEach((x) => {
        if (x.name === old) x.name = name;
        if (x.kind === 'Area' && x.line === old) x.line = name;
      });
    });
  const remove = (name: string) =>
    update((d) => {
      const i = d.findIndex((x) => x.name === name);
      if (i < 0) return;
      const isLine = d[i].kind === 'Line';
      d.splice(i, 1);
      if (isLine) for (let j = d.length - 1; j >= 0; j--) if (d[j].kind === 'Area' && d[j].line === name) d.splice(j, 1);
    });
  const addArea = (line: string) =>
    update((d) => {
      let n = 1;
      while (d.some((x) => x.name === `New area ${n}`)) n++;
      // after the line's last area, so the list keeps its order
      let at = d.findIndex((x) => x.name === line);
      d.forEach((x, i) => x.kind === 'Area' && x.line === line && (at = i));
      d.splice(at + 1, 0, { kind: 'Area', name: `New area ${n}`, line, aliases: [] });
    });
  const addLine = () =>
    update((d) => {
      let n = 1;
      while (d.some((x) => x.name === `New line ${n}`)) n++;
      d.push({ kind: 'Line', name: `New line ${n}`, line: '', aliases: [] });
    });

  async function save() {
    if (!sessionToken || !draft) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await saveAreas(sessionToken, draft);
      setAreas(r);
      setDraft(r.areas.map((x) => ({ ...x, aliases: [...x.aliases] })));
      setMsg({ kind: 'ok', text: 'Saved — every page now shows these names.' });
    } catch (e) {
      setMsg({ kind: 'error', text: describeError(e, "Couldn't save the area list.") });
    } finally {
      setBusy(false);
    }
  }

  const options = (
    <>
      <option value="">— as it is (not in the list) —</option>
      {lines.map((l) => (
        <optgroup key={l.name} label={l.name}>
          <option value={l.name}>{l.name} (whole line, area not known)</option>
          {draft
            .filter((x) => x.kind === 'Area' && x.line === l.name)
            .map((x) => (
              <option key={x.name} value={x.name}>
                {x.name}
              </option>
            ))}
        </optgroup>
      ))}
    </>
  );

  return (
    <div className="eid-panel" data-testid="eid-areas">
      <p className="eid-muted">
        One official name per place. Every page (Plant overview, Equipment, filters) shows the official name instead of the many names the modules and the
        platform list use; the sheets themselves are not changed.{' '}
        {saved.proposed ? (
          <b data-testid="eid-areas-proposed">This is a proposed list — check it and Save to use it.</b>
        ) : saved.changed ? (
          <>
            Last saved by {saved.changed.by} · {String(saved.changed.at).slice(0, 10)}.
          </>
        ) : null}
      </p>
      {msg && <div className={`eid-msg eid-msg--${msg.kind === 'ok' ? 'ok' : 'error'}`}>{msg.text}</div>}

      <section className="eid-card">
        <div className="eid-filters">
          <b>Names in use</b>
          <span className="eid-dim">
            {uses.length} names · {todo.length} not in the list
          </span>
          <span className="eid-chips" role="group" aria-label="Show">
            <button type="button" className={`eid-chip${only === 'todo' ? ' eid-chip--on' : ''}`} aria-pressed={only === 'todo'} onClick={() => setOnly('todo')} data-testid="eid-areas-todo">
              Not in the list ({todo.length})
            </button>
            <button type="button" className={`eid-chip${only === 'all' ? ' eid-chip--on' : ''}`} aria-pressed={only === 'all'} onClick={() => setOnly('all')} data-testid="eid-areas-all">
              All names
            </button>
          </span>
        </div>
        {only === 'todo' && !todo.length && <p className="eid-empty">Every name in use has an official name.</p>}
        <div className="eid-table-wrap">
          <table className="eid-table" data-testid="eid-areas-uses">
            <thead>
              <tr>
                <th>Name as found</th>
                <th>Used by</th>
                <th>Shows as</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => {
                const all = entriesOf(u.name);
                const e = all[0];
                const split = all.length > 1;
                const where = [
                  u.platform ? `Platform list ${u.platform}` : '',
                  ...PLANT_MODULES.filter((m) => u.byModule[m.moduleId]).map((m) => `${m.short} ${u.byModule[m.moduleId]}`),
                ].filter(Boolean);
                return (
                  <tr key={u.name} data-testid={`eid-area-use-${u.name}`}>
                    <td className="eid-code">{u.name}</td>
                    <td className="eid-dim">{where.join(' · ')}</td>
                    <td>
                      {split && (
                        <div className="eid-area-split" data-testid={`eid-area-split-${u.name}`}>
                          {all.map((x) => x.name).join(' or ')} — decided by each machine&apos;s line
                        </div>
                      )}
                      {canEdit ? (
                        <select className="eid-select" value={split ? '__split' : e?.name || ''} onChange={(ev) => mapName(u.name, ev.target.value)} aria-label={`Official name for ${u.name}`}>
                          {split && <option value="__split">{all.map((x) => x.name).join(' / ')} (by line)</option>}
                          {options}
                        </select>
                      ) : split ? null : e ? (
                        e.kind === 'Line' ? `${e.name} (whole line)` : `${e.name} · ${e.line}`
                      ) : (
                        <span className="eid-dim">as it is</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="eid-card">
        <div className="eid-filters">
          <b>Official list</b>
          <span className="eid-dim">
            {lines.length} lines · {draft.length - lines.length} areas
          </span>
          {canEdit && (
            <button type="button" className="eid-secondary" onClick={addLine} data-testid="eid-areas-addline">
              <TablerIcon className="ti-plus" size={14} /> Add line
            </button>
          )}
        </div>
        <div className="eid-area-lines">
          {lines.map((l) => (
            <div key={l.name} className="eid-area-line" data-testid={`eid-area-line-${l.name}`}>
              <div className="eid-area-row eid-area-row--line">
                {canEdit ? <NameInput value={l.name} onCommit={(v) => rename(l.name, v)} label="Line name" /> : <b>{l.name}</b>}
                <Aliases names={l.aliases} onRemove={canEdit ? (n) => removeAlias(l.name, n) : undefined} onAdd={canEdit ? (n) => addAlias(l.name, n) : undefined} />
                {canEdit && (
                  <button type="button" className="eid-link" onClick={() => remove(l.name)} aria-label={`Remove ${l.name} and its areas`}>
                    Remove
                  </button>
                )}
              </div>
              {draft
                .filter((x) => x.kind === 'Area' && x.line === l.name)
                .map((x) => (
                  <div key={x.name} className="eid-area-row" data-testid={`eid-area-${x.name}`}>
                    {canEdit ? <NameInput value={x.name} onCommit={(v) => rename(x.name, v)} label="Area name" /> : <span>{x.name}</span>}
                    <Aliases names={x.aliases} onRemove={canEdit ? (n) => removeAlias(x.name, n) : undefined} onAdd={canEdit ? (n) => addAlias(x.name, n) : undefined} />
                    {canEdit && (
                      <button type="button" className="eid-link" onClick={() => remove(x.name)} aria-label={`Remove ${x.name}`}>
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              {canEdit && (
                <button type="button" className="eid-link eid-area-add" onClick={() => addArea(l.name)} data-testid={`eid-areas-add-${l.name}`}>
                  + Add area to {l.name}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {canEdit && (
        <div className="eid-area-foot">
          <button type="button" className="eid-secondary" disabled={!dirty || busy} onClick={() => setDraft(saved.areas.map((x) => ({ ...x, aliases: [...x.aliases] })))}>
            Undo changes
          </button>
          <button type="button" className="eid-primary" disabled={(!dirty && !saved.proposed) || busy} onClick={save} data-testid="eid-areas-save">
            {busy ? 'Saving…' : saved.proposed ? 'Save this list' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}

// Renamed on leaving the box (so the list doesn't jump while typing).
function NameInput({ value, onCommit, label }: { value: string; onCommit: (v: string) => void; label: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      className="eid-input eid-area-name"
      value={v}
      aria-label={label}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => (v.trim() && v.trim() !== value ? onCommit(v.trim()) : setV(value))}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function Aliases({ names, onRemove, onAdd }: { names: string[]; onRemove?: (n: string) => void; onAdd?: (n: string) => void }) {
  const [v, setV] = useState('');
  const add = () => {
    if (v.trim() && onAdd) onAdd(v.trim());
    setV('');
  };
  return (
    <span className="eid-area-aliases">
      {!names.length && !onAdd && <span className="eid-dim">no other names</span>}
      {names.map((n) => (
        <span key={n} className="eid-tag">
          {n}
          {onRemove && (
            <button type="button" className="eid-tag-x" onClick={() => onRemove(n)} aria-label={`Remove the name ${n}`}>
              ×
            </button>
          )}
        </span>
      ))}
      {onAdd && (
        <input
          className="eid-area-alias-in"
          value={v}
          placeholder="+ other name"
          aria-label="Add another name"
          onChange={(e) => setV(e.target.value)}
          onBlur={add}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
      )}
    </span>
  );
}
