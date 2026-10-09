import { useState } from 'react';
import { Icon } from '../icons';
import './IdSearch.css';

// The shell's copy of the modules' ID filter (apps/*/src/components/
// EquipmentSearch.jsx, freeText mode): a search box that is also a dropdown
// of matching IDs. Typing filters the list; picking an ID shows that one.
export type IdOption = { code: string; description?: string };
const MAX_SHOWN = 80;

// spaces don't count ("331. BC" finds "331.BC")
const norm = (v: unknown) => String(v || '').toLowerCase().replace(/\s+/g, '');

export function idTextMatch(text: string, codes: string[]) {
  const q = norm(text);
  if (!q) return () => true;
  const exact = codes.some((c) => norm(c) === q);
  return (code: string, ...others: (string | undefined)[]) => (exact ? norm(code) === q : [code, ...others].some((v) => norm(v).includes(q)));
}

export default function IdSearch({ options, value, onChange, placeholder, ariaLabel, testid }: { options: IdOption[]; value: string; onChange: (v: string) => void; placeholder?: string; ariaLabel?: string; testid?: string }) {
  const [open, setOpen] = useState(false);
  const q = value.trim().toLowerCase();
  const matches = q ? options.filter((o) => o.code.toLowerCase().includes(q) || (o.description || '').toLowerCase().includes(q)) : options;
  const shown = matches.slice(0, MAX_SHOWN);
  return (
    <div className="id-search">
      <span className="id-search-icon" aria-hidden="true">
        <Icon name="search" size={16} />
      </span>
      <input
        className="id-search-input"
        role="combobox"
        aria-expanded={open}
        aria-label={ariaLabel || placeholder}
        placeholder={placeholder}
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        data-testid={testid}
      />
      {value ? (
        <button type="button" className="id-search-clear" aria-label="Clear" onMouseDown={(e) => { e.preventDefault(); onChange(''); }}>
          <Icon name="close" size={14} />
        </button>
      ) : (
        <span className="id-search-chev" aria-hidden="true">
          <Icon name="chevronDown" size={16} />
        </span>
      )}
      {open && (
        <div className="id-search-list" role="listbox">
          {shown.length === 0 && <div className="id-search-note">No matches</div>}
          {matches.length > shown.length && <div className="id-search-note">Showing {shown.length} of {matches.length} — type more to narrow down</div>}
          {shown.map((o) => (
            <div key={o.code} role="option" aria-selected={o.code === value} className={`id-search-opt${o.code === value ? ' id-search-opt--on' : ''}`} onMouseDown={() => { onChange(o.code); setOpen(false); }}>
              <b>{o.code}</b>
              {o.description && <span> — {o.description}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
