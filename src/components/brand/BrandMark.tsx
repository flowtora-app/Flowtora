import type { CSSProperties } from "react";

// Shared product brand lockup. Used in the sidebar header, marketing
// header, customer-portal footer, and email footers. Keeping logomark
// + wordmark co-located ensures every surface stays visually aligned.

export function Logomark({ size = 32 }: { size?: number }) {
  return (
    // The PNG ships its own dark navy background as part of the artwork,
    // so we render it as a rounded chip — works equally well in dark
    // mode (blends with the sidebar surface) and light mode (reads as
    // a colored brand badge, Discord-style).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/flowtora-logo.png"
      alt="Flowtora"
      width={size}
      height={size}
      className="block shrink-0 rounded-md"
      style={{ width: size, height: size }}
    />
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
