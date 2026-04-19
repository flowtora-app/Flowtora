import type { CSSProperties } from "react";

// Shared product brand lockup. Used in the marketing header, the staff
// TopBar, and the customer-portal footer. Keeping logomark + wordmark
// co-located ensures the three surfaces can never drift visually.

export function Logomark({ size = 32 }: { size?: number }) {
  return (
    <span
      className="flex items-center justify-center rounded-md font-bold"
      style={{
        width: size,
        height: size,
        background: "var(--accent-primary)",
        color: "var(--accent-fg)",
        fontSize: Math.round(size * 0.4),
      }}
    >
      T
    </span>
  );
}

export function Wordmark({ style }: { style?: CSSProperties }) {
  return (
    <span
      className="font-semibold tracking-tight"
      style={{ color: "var(--text-default)", ...style }}
    >
      Flowtora
    </span>
  );
}

export function BrandLockup({
  size = 32,
  wordmarkStyle,
}: {
  size?: number;
  wordmarkStyle?: CSSProperties;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <Logomark size={size} />
      <Wordmark style={wordmarkStyle} />
    </span>
  );
}
