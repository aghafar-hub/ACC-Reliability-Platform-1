import { useState } from "react";
import { useTheme } from "../ThemeContext";

// The one ID filter used on every page (design reference): a dropdown you
// can type into — Equipment ID, Lub ID, Vib ID… — in the same box.
//   - default: pick one ID; `value` is the picked code ("" / "All" = none).
//   - freeText: the box is also a plain search — every keystroke filters the
//     list (`value` is the text) and the dropdown suggests matching IDs.
// options: [{ code, description }].
const MAX_SHOWN = 80;

export default function EquipmentSearch({ options, value, onChange, placeholder, allowAll, width, freeText = false, ariaLabel, testid, inputStyle }) {
  const { T, s } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const list = allowAll && !freeText ? [{ code: "All", description: "All Equipment" }, ...(options || [])] : options || [];
  const q = (freeText ? value || "" : query).toLowerCase().trim();
  const matches = q ? list.filter((e) => String(e.code).toLowerCase().includes(q) || (e.description || "").toLowerCase().includes(q)) : list;
  const filtered = matches.slice(0, MAX_SHOWN);
  const selected = list.find((e) => e.code === value);
  const displayValue = freeText
    ? value || ""
    : open
      ? query
      : selected
        ? `${selected.code}${selected.description && selected.code !== "All" ? " — " + selected.description : ""}`
        : "";

  return (
    <div style={{ position: "relative", width: width || 220, flexShrink: 0 }}>
      <div style={{ position: "relative" }}>
        <i
          className="ti ti-search"
          style={{
            position: "absolute",
            left: 8,
            top: "50%",
            transform: "translateY(-50%)",
            color: T.textMuted,
            fontSize: 13,
            pointerEvents: "none",
          }}
          aria-hidden="true"
        />
        <input
          style={{ ...s.input, paddingLeft: 26, paddingRight: 26, fontSize: 12, cursor: "pointer", ...inputStyle }}
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel || placeholder || "Equipment"}
          data-testid={testid}
          value={displayValue}
          placeholder={placeholder || "Select equipment..."}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(e) => {
            if (freeText) onChange(e.target.value);
            else setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter" && !freeText && filtered.length) {
              onChange(filtered[0].code);
              setOpen(false);
              e.currentTarget.blur();
            }
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        <i
          className="ti ti-chevron-down"
          style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: T.textMuted, fontSize: 13, pointerEvents: "none", display: value && value !== "All" && !open ? "none" : undefined }}
          aria-hidden="true"
        />
        {value && value !== "All" && !open && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onChange("");
            }}
            style={{
              position: "absolute",
              right: 6,
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              color: T.textMuted,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            ×
          </button>
        )}
      </div>
      {open && (
        <div
          style={{
            position: "absolute",
            zIndex: 99,
            top: "100%",
            left: 0,
            right: 0,
            background: T.cardBg,
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            marginTop: 4,
            maxHeight: 240,
            overflowY: "auto",
            boxShadow: `0 4px 16px ${T.appBg}aa`,
          }}
        >
          {filtered.length === 0 && <div style={{ padding: "10px 12px", color: T.textMuted, fontSize: 12 }}>No matches</div>}
          {matches.length > filtered.length && <div style={{ padding: "6px 12px", color: T.textMuted, fontSize: 11.5 }}>Showing {filtered.length} of {matches.length} — type more to narrow down</div>}
          {filtered.map((e) => (
            <div
              key={e.code}
              role="option"
              aria-selected={value === e.code}
              onMouseDown={() => {
                onChange(e.code);
                setQuery("");
                setOpen(false);
              }}
              style={{
                padding: "7px 12px",
                cursor: "pointer",
                fontSize: 12,
                background: value === e.code ? T.navActive : "transparent",
                borderBottom: `1px solid ${T.border2}`,
              }}
            >
              <span style={{ fontWeight: 600, color: e.code === "All" ? T.textPrimary : T.accent }}>{e.code}</span>
              {e.description && e.code !== "All" && <span style={{ color: T.textSecondary }}> — {e.description}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Filter for a list behind a freeText box: text that is exactly one of the
// IDs (picked from the dropdown) shows that ID only; other text matches any
// part of the ID or the other fields given.
export function idTextMatch(text, codes) {
  const q = String(text || "").trim().toLowerCase();
  if (!q) return () => true;
  const exact = (codes || []).some((c) => String(c).toLowerCase() === q);
  return (code, ...others) => (exact ? String(code).toLowerCase() === q : [code, ...others].some((v) => String(v || "").toLowerCase().includes(q)));
}
