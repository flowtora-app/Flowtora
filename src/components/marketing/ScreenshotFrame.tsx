import * as React from "react";

// ScreenshotFrame — the "floating product shot" treatment.
//
// Wraps any product mock in a macOS-ish window chrome with a heavy
// radius, inset ring, and drop shadow. The backing aura (radial
// accent glow) is rendered as a sibling absolute element so it
// extends beyond the frame's clipping boundary.
//
// Design notes:
//   • In dark mode we rely on luminance + a soft accent glow. In
//     light mode the frame needs a crisper border + a top highlight
//     line to fake the shape of a window sitting on a page.
//   • The chrome dots (red/yellow/green) are a visual shorthand that
//     reads as "real software" at a glance. We use the token palette
//     instead of literal Apple reds so the feel stays branded.
//   • The frame doesn't own max-width; parent decides. Default
//     `mx-auto` keeps it centered in most layouts.

export interface ScreenshotFrameProps {
  children: React.ReactNode;
  className?: string;
  /** Optional fake URL in the chrome — e.g. "flowtora.com/dashboard". */
  caption?: string;
  /** When true, renders a softer glow behind the frame. Defaults true. */
  aura?: boolean;
  /**
   * Skip the window chrome and inset ring so this component can wrap
   * content that already carries its own frame (like ProductMock).
   * Keeps the aura + layout sizing in a shared place.
   */
  chromeless?: boolean;
}

export function ScreenshotFrame({
  children,
  className,
  caption,
  aura = true,
  chromeless = false,
}: ScreenshotFrameProps) {
  const auraNode = aura ? (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10"
      style={{
        // Offset glow so it reads as "light from behind" rather than
        // a halo symmetric to the frame. Scale > 100% so the blur
        // can bloom past the frame's corners.
        top: "10%",
        transform: "scale(1.15)",
        filter: "blur(70px)",
        background:
          "radial-gradient(ellipse at 50% 50%, var(--accent-surface-strong) 0%, transparent 65%)",
        opacity: 0.85,
      }}
    />
  ) : null;

  if (chromeless) {
    // Aura-only wrapper: caller owns the frame visuals. Used on the
    // home hero where ProductMock already provides its own chrome.
    return (
      <div className={`relative ${className ?? ""}`}>
        {auraNode}
        {children}
      </div>
    );
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      {auraNode}
      <div
        className="relative overflow-hidden"
        style={{
          borderRadius: "var(--radius-2xl)",
          background: "var(--surface-1)",
          boxShadow:
            "0 0 0 1px var(--border-subtle), var(--shadow-lg), inset 0 1px 0 0 color-mix(in oklab, var(--text-default) 8%, transparent)",
        }}
      >
        {/* Title bar: dot cluster on the left, optional URL pill center. */}
        <div
          className="flex h-9 items-center gap-2 px-3"
          style={{
            borderBottom: "1px solid var(--border-subtle)",
            background:
              "color-mix(in oklab, var(--surface-1) 60%, var(--surface-0))",
          }}
        >
          <span
            aria-hidden
            className="flex items-center gap-1.5"
          >
            <Dot color="var(--danger)" />
            <Dot color="var(--warning)" />
            <Dot color="var(--success)" />
          </span>
          {caption && (
            <span
              className="ml-auto mr-auto hidden rounded-md px-2 py-0.5 text-[11px] font-medium sm:inline-flex"
              style={{
                color: "var(--text-muted)",
                background: "var(--surface-0)",
                border: "1px solid var(--border-subtle)",
                letterSpacing: "-0.005em",
              }}
            >
              {caption}
            </span>
          )}
          {/* Spacer matches the dot cluster width so the URL stays centered. */}
          <span aria-hidden className="w-[54px]" />
        </div>
        <div className="relative">{children}</div>
      </div>
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{
        background: color,
        opacity: 0.55,
      }}
    />
  );
}
