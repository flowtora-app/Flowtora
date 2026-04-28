import type { CSSProperties } from "react";

// Shared product brand lockup. Used in the sidebar header, marketing
// header, customer-portal footer, and email footers. Keeping logomark
// + wordmark co-located ensures every surface stays visually aligned.

export function Logomark({ size = 32 }: { size?: number }) {
  // Two artwork variants ship with built-in backgrounds — one dark, one
  // light. We render both and let CSS show the right one for the
  // current theme (`[data-theme="light"]` flips the visibility).
  // Default (no attribute) is the dark theme, so the dark-variant img
  // is visible by default.
  const dimStyle: CSSProperties = { width: size, height: size };
  return (
    <span
      className="block shrink-0 overflow-hidden rounded-md"
      style={dimStyle}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/flowtora-logo-dark.png"
        alt="Flowtora"
        width={size}
        height={size}
        className="ts-logo-variant ts-logo-variant--dark"
        style={dimStyle}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/flowtora-logo.png"
        alt=""
        aria-hidden
        width={size}
        height={size}
        className="ts-logo-variant ts-logo-variant--light"
        style={dimStyle}
      />
    </span>
  );
}

export function Wordmark({ style }: { style?: CSSProperties }) {
  return (
    <span
      className="font-semibold tracking-tight lowercase"
      style={{ color: "var(--text-default)", ...style }}
    >
      flowtora
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
