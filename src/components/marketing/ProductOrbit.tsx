import * as React from "react";

// ProductOrbit — the full-width "the whole product at a glance"
// moment. A wide screenshot/mock sits centered with 4 callout chips
// floating at its corners, each labeling a UI region.
//
// We render the chips as absolute children of the frame so they
// bleed slightly outside the screenshot — that's the "orbit" feel
// (chips orbit the product). On mobile the chips stack as a plain
// grid beneath the image, since absolute positioning over a narrow
// screen would cover too much of the screenshot.
//
// We don't render actual SVG leader lines; over-designed leader
// lines age poorly and break on resize. Instead, a short 1px accent
// segment on the chip's "inside" edge points toward the product —
// enough directional cue at a glance.
//
// Design notes:
//   • The caller owns the `visual` node. That means we can swap in a
//     real screenshot, a ProductMock, or anything wrapped in
//     ScreenshotFrame without changing this component.
//   • Chip color tones alternate accent/info/success/warning so the
//     four regions are visually distinguished without being loud.

export interface OrbitChip {
  label: React.ReactNode;
  /** Position on the frame — chooses which corner/side the chip floats from. */
  anchor: "tl" | "tr" | "bl" | "br";
  /** Tint — maps to the token palette (accent/info/success/warning). */
  tone?: "accent" | "info" | "success" | "warning";
  /** Optional short description beneath the label. */
  detail?: React.ReactNode;
}

export interface ProductOrbitProps {
  visual: React.ReactNode;
  chips: OrbitChip[];
  /** Extra className for the wrapping relative container. */
  className?: string;
}

const ANCHOR_CLASS: Record<OrbitChip["anchor"], string> = {
  tl: "left-0 top-0 md:-left-6 md:-top-4",
  tr: "right-0 top-0 md:-right-6 md:-top-4",
  bl: "left-0 bottom-0 md:-left-6 md:-bottom-4",
  br: "right-0 bottom-0 md:-right-6 md:-bottom-4",
};

function toneColors(tone: OrbitChip["tone"] = "accent") {
  switch (tone) {
    case "info":
      return {
        fg: "var(--info-fg)",
        surface: "var(--info-surface)",
      };
    case "success":
      return {
        fg: "var(--success-fg)",
        surface: "var(--success-surface)",
      };
    case "warning":
      return {
        fg: "var(--warning-fg)",
        surface: "var(--warning-surface)",
      };
    case "accent":
    default:
      return {
        fg: "var(--accent-primary)",
        surface: "var(--accent-surface)",
      };
  }
}

export function ProductOrbit({ visual, chips, className }: ProductOrbitProps) {
  return (
    <div className={`relative ${className ?? ""}`}>
      {/* Glow plate — wide backdrop so the product reads as floating. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-10 top-10 -z-10 h-2/3"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, var(--accent-surface-strong) 0%, transparent 60%)",
          opacity: 0.7,
          filter: "blur(80px)",
        }}
      />

      {/* Visual wrapper. position: relative so chips can absolute-anchor. */}
      <div className="relative mx-auto">
        {visual}

        {/* Desktop chips — floating absolute around the frame. Hidden
            on mobile because the overlap obscures the mock. */}
        <div className="pointer-events-none absolute inset-0 hidden md:block">
          {chips.map((c, i) => (
            <OrbitChipCard key={i} chip={c} />
          ))}
        </div>
      </div>

      {/* Mobile chips — stacked grid underneath. */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
        {chips.map((c, i) => (
          <MobileChip key={i} chip={c} />
        ))}
      </div>
    </div>
  );
}

function OrbitChipCard({ chip }: { chip: OrbitChip }) {
  const colors = toneColors(chip.tone);
  return (
    <div
      className={`absolute ${ANCHOR_CLASS[chip.anchor]} pointer-events-auto max-w-[240px] rounded-xl p-3 shadow-lg backdrop-blur`}
      style={{
        background:
          "color-mix(in oklab, var(--surface-1) 92%, transparent)",
        border: "1px solid var(--border-default)",
        boxShadow:
          "0 10px 30px -10px color-mix(in oklab, var(--text-default) 24%, transparent), 0 0 0 1px var(--border-subtle) inset",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
          style={{ background: colors.fg }}
        />
        <span
          className="text-xs font-semibold uppercase tracking-[0.08em]"
          style={{ color: colors.fg }}
        >
          {chip.label}
        </span>
      </div>
      {chip.detail && (
        <div
          className="mt-1 text-xs leading-snug"
          style={{ color: "var(--text-muted)" }}
        >
          {chip.detail}
        </div>
      )}
    </div>
  );
}

function MobileChip({ chip }: { chip: OrbitChip }) {
  const colors = toneColors(chip.tone);
  return (
    <div
      className="rounded-lg p-3"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: colors.fg }}
        />
        <span
          className="text-xs font-semibold uppercase tracking-[0.08em]"
          style={{ color: colors.fg }}
        >
          {chip.label}
        </span>
      </div>
      {chip.detail && (
        <div
          className="mt-1 text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          {chip.detail}
        </div>
      )}
    </div>
  );
}
