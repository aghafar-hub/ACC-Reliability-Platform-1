// Renders one entry from icons.jsx inside a 24x24 viewBox stroke-icon
// wrapper — ported from the original bundle's `ne` component.
export default function Icon({ d, size = 16, stroke }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke || "currentColor"}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {d}
    </svg>
  );
}
