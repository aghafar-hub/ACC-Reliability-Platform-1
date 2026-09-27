import { useTheme } from "../ThemeContext";
import { complianceColor, complianceLetter } from "../domain";

// One month's compliance status as a small colored square with a
// single-letter label (Y/M/N/A/D/C/O) — ported from the original's `iu`.
export default function ComplianceDot({ status, size = 26 }) {
  const { T } = useTheme();
  const color = complianceColor(T, status);
  const letter = complianceLetter(status);
  const isBlank = !status || status === "";
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        background: isBlank ? T.border : color + "28",
        border: `2px solid ${isBlank ? T.border2 : color}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.38,
        fontWeight: 800,
        color: isBlank ? T.textMuted : color,
        flexShrink: 0,
        cursor: "default",
      }}
    >
      {letter}
    </div>
  );
}
