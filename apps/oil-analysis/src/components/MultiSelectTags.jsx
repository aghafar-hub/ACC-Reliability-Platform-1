import { useState } from "react";
import { useTheme } from "../ThemeContext";

// Splits a stored "Change Oil, Separate Water" string into chips. Existing
// historical values that don't match anything in the registry still show
// up as their own chip — the registry is a pick list, not a strict enum.
function parseChips(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Multi-select "add chip" field for Contractor Action / ACC Action, backed
// by the Action Registry sheet's list of reusable action phrases. Picking
// several (e.g. "Change Oil" + "Separate Water") stores them as one
// comma-separated string, since the underlying sheet cell is plain text —
// typing something not in the list and pressing Enter/comma adds it as a
// free-text chip too, so existing historical values keep working.
export default function MultiSelectTags({ label, value, onChange, options }) {
  const { T, s } = useTheme();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const chips = parseChips(value);
  const available = (options || []).filter((o) => !chips.some((c) => c.toLowerCase() === o.toLowerCase()));
  const filtered = query ? available.filter((o) => o.toLowerCase().includes(query.toLowerCase())) : available;

  function addChip(text) {
    const trimmed = text.trim();
    if (!trimmed || chips.some((c) => c.toLowerCase() === trimmed.toLowerCase())) return;
    onChange([...chips, trimmed].join(", "));
    setQuery("");
  }
  function removeChip(text) {
    onChange(chips.filter((c) => c !== text).join(", "));
  }
  function handleKeyDown(e) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (query.trim()) addChip(query);
    } else if (e.key === "Backspace" && !query && chips.length > 0) {
      removeChip(chips[chips.length - 1]);
    }
  }

  return (
    <div>
      <label style={{ ...s.label, fontSize: 11 }}>{label}</label>
      <div style={{ position: "relative" }}>
        <div
          style={{
            ...s.input,
            fontSize: 13,
            minHeight: 34,
            padding: "5px 8px",
            display: "flex",
            flexWrap: "wrap",
            gap: 5,
            alignItems: "center",
            cursor: "text",
          }}
          onClick={(e) => e.currentTarget.querySelector("input")?.focus()}
        >
          {chips.map((chip) => (
            <span
              key={chip}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: T.navActive,
                color: T.accent,
                borderRadius: 4,
                padding: "2px 6px",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {chip}
              <span
                onMouseDown={(e) => {
                  e.preventDefault();
                  removeChip(chip);
                }}
                style={{ cursor: "pointer", color: T.textMuted, fontSize: 13, lineHeight: 1 }}
              >
                ×
              </span>
            </span>
          ))}
          <input
            style={{
              flex: 1,
              minWidth: 80,
              border: "none",
              outline: "none",
              background: "transparent",
              color: T.textPrimary,
              fontSize: 13,
            }}
            value={query}
            placeholder={chips.length === 0 ? "Type or pick…" : ""}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
          />
        </div>
        {open && filtered.length > 0 && (
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
              maxHeight: 200,
              overflowY: "auto",
              boxShadow: `0 4px 16px ${T.appBg}aa`,
            }}
          >
            {filtered.map((o) => (
              <div
                key={o}
                onMouseDown={() => addChip(o)}
                style={{
                  padding: "7px 12px",
                  cursor: "pointer",
                  fontSize: 12,
                  color: T.textPrimary,
                  borderBottom: `1px solid ${T.border2}`,
                }}
              >
                {o}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
