import { useState } from "react";
import { useTheme } from "../ThemeContext";

// Type-to-filter equipment combobox, matching the original app's equipment
// picker used across Dashboard, Equipment, Action Tracker, Oil Change Log,
// Add Sample, and the Oil Analysis Report search page.
export default function EquipmentSearch({ options, value, onChange, placeholder, allowAll, width }) {
  const { T, s } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const list = allowAll ? [{ code: "All", description: "All Equipment" }, ...(options || [])] : options || [];
  const filtered = list.filter((e) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return e.code.toLowerCase().includes(q) || (e.description || "").toLowerCase().includes(q);
  });
  const selected = list.find((e) => e.code === value);
  const displayValue = open
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
          style={{ ...s.input, paddingLeft: 26, fontSize: 12, cursor: "pointer" }}
          value={displayValue}
          placeholder={placeholder || "Select equipment..."}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
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
          {filtered.map((e) => (
            <div
              key={e.code}
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
