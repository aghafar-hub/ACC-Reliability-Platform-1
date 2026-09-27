import { useTheme } from "../ThemeContext";
import Icon from "./Icon";
import { ICONS } from "./icons";

// Small scrollable table of RMS or SPM readings for one equipment, with
// edit/delete actions per row — ported from the original's `ru`. `columns`
// is `[{ key, label, render? }]`; `render(row)` overrides plain `row[key]`
// display (used for the value+status-badge columns).
export default function ReadingTable({ title, rows, columns, onEdit, onDelete }) {
  const { T } = useTheme();
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{ fontSize: 12, fontWeight: 700, color: T.textSecondary, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}
      >
        {title} ({rows.length})
      </div>
      <div style={{ overflowX: "auto", maxHeight: 240, overflowY: "auto", border: `1px solid ${T.border2}`, borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: T.tableHead, position: "sticky", top: 0 }}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{
                    textAlign: "left",
                    padding: "6px 8px",
                    color: T.textSecondary,
                    fontWeight: 700,
                    borderBottom: `1px solid ${T.border}`,
                  }}
                >
                  {col.label}
                </th>
              ))}
              <th style={{ padding: "6px 8px", borderBottom: `1px solid ${T.border}` }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row._id || i} style={{ background: i % 2 ? T.tableRowAlt : T.tableRow }}>
                {columns.map((col) => (
                  <td key={col.key} style={{ padding: "5px 8px", color: T.textPrimary, borderBottom: `1px solid ${T.border2}` }}>
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
                <td style={{ padding: "5px 8px", borderBottom: `1px solid ${T.border2}`, whiteSpace: "nowrap" }}>
                  <span style={{ cursor: "pointer", color: T.textSecondary, marginRight: 8 }} onClick={() => onEdit(row)}>
                    <Icon d={ICONS.edit} size={13} />
                  </span>
                  <span style={{ cursor: "pointer", color: T.danger }} onClick={() => onDelete(row)}>
                    <Icon d={ICONS.trash} size={13} />
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} style={{ padding: 12, textAlign: "center", color: T.textMuted }}>
                  No data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
