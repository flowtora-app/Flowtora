import * as React from "react";
import Link from "next/link";

// IndustryPath — deep industry split card. Replaces the flat
// IndustryCard used on the home page. Instead of a one-paragraph
// teaser, each card is a mini-pitch with 3–4 concrete bullets + a
// small visual affordance (icon + side-tint) + an explicit next-step
// link. The whole card is a link so mobile users can tap anywhere.
//
// Design notes:
//   • Side-tint: a 6px accent stripe on the left edge makes the two
//     cards read as "paths" rather than twin tiles. We flip the tint
//     color per industry (primary vs. secondary accent) to reinforce
//     that these are two paths, not two copies.
//   • Bullets use ✓ / arrow glyphs but at 11px — they support the
//     copy, not shout.
//   • Hover: 1px border lift + translateX(2px) on the CTA glyph,
//     matches the `.ts-link-arrow` hover shared site-wide.

export interface IndustryPathBullet {
  label: React.ReactNode;
}

export interface IndustryPathProps {
  title: React.ReactNode;
  lede: React.ReactNode;
  bullets: IndustryPathBullet[];
  href: string;
  /** Optional short tag line shown in the accent color above the title. */
  eyebrow?: React.ReactNode;
  /** "primary" uses --accent-primary, "secondary" uses a cooler tint. */
  tone?: "primary" | "secondary";
  /** Optional small icon/glyph rendered top-right. Keep it a single char or SVG. */
  icon?: React.ReactNode;
}

export function IndustryPath({
  title,
  lede,
  bullets,
  href,
  eyebrow,
  tone = "primary",
  icon,
}: IndustryPathProps) {
  const accent =
    tone === "primary" ? "var(--accent-primary)" : "var(--info-fg)";
  const accentSurface =
    tone === "primary"
      ? "var(--accent-surface)"
      : "var(--info-surface)";

  return (
    <Link
      href={href}
      className="group relative block overflow-hidden rounded-2xl p-8 transition-all hover:-translate-y-0.5"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        boxShadow:
          "0 1px 0 0 color-mix(in oklab, var(--text-default) 4%, transparent) inset",
      }}
    >
      {/* Left accent stripe. 4px, full-height, anchored inside the
          card so it visually "extends" the card edge. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[4px]"
        style={{ background: accent, opacity: 0.9 }}
      />

      {/* Very soft accent wash in the upper-left to give the card a
          "direction of travel" without overwhelming the copy. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -left-20 -top-20 h-60 w-60 rounded-full"
        style={{
          background: accentSurface,
          filter: "blur(60px)",
          opacity: 0.6,
        }}
      />

      <div className="relative flex items-start justify-between gap-6">
        <div className="min-w-0">
          {eyebrow && (
            <div
              className="mb-2 text-xs font-semibold uppercase tracking-[0.12em]"
              style={{ color: accent }}
            >
              {eyebrow}
            </div>
          )}
          <div
            className="text-2xl font-semibold tracking-tight"
            style={{ color: "var(--text-default)" }}
          >
            {title}
          </div>
          <p
            className="mt-3 max-w-lg text-sm leading-relaxed md:text-base"
            style={{ color: "var(--text-muted)" }}
          >
            {lede}
          </p>
        </div>
        {icon && (
          <div
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-lg"
            style={{ background: accentSurface, color: accent }}
          >
            {icon}
          </div>
        )}
      </div>

      <ul className="relative mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {bullets.map((b, i) => (
          <li
            key={i}
            className="flex items-start gap-2 text-sm"
            style={{ color: "var(--text-default)" }}
          >
            <span
              aria-hidden
              className="mt-[7px] inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full"
              style={{ background: accent }}
            />
            <span style={{ color: "var(--text-muted)" }}>{b.label}</span>
          </li>
        ))}
      </ul>

      <span
        className="relative mt-8 inline-flex items-center gap-1 text-sm font-semibold"
        style={{ color: accent }}
      >
        Explore the walkthrough
        <span
          aria-hidden
          className="ml-0.5 inline-block transition-transform group-hover:translate-x-0.5"
        >
          →
        </span>
      </span>
    </Link>
  );
}
