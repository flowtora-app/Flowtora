import * as React from "react";

// BentoGrid — mixed-size card grid used on the Features page. The
// "bento" name describes the visual: a few cells of different sizes
// arranged in a tray, like a Japanese bento box. It's the premium
// SaaS landing trick that makes a feature section feel composed
// rather than gridded.
//
// Layout model:
//   • The grid is 6 columns on desktop, auto-rows set to a sensible
//     row height. Cards declare a `size` prop that maps to col/row
//     spans.
//   • We support four sizes:
//        "hero"    → 4 cols × 2 rows  (big card with room for a visual)
//        "wide"    → 4 cols × 1 row   (long banner, copy only)
//        "tall"    → 2 cols × 2 rows  (stat or pull-quote card)
//        "small"   → 2 cols × 1 row   (bullet card)
//   • A typical 6-card pattern: hero + small + small + small + tall +
//     wide OR hero + tall + small × 3 + wide. Callers compose.
//   • On mobile (< md) every card stacks full-width at natural
//     height. We force col-span-full + row-span-1 at the narrow
//     breakpoint.
//
// Design notes:
//   • Inset ring (not border) via box-shadow for sharper corner
//     joins at radius-xl.
//   • Cards accept a `visual` slot (right-edge or bottom-edge
//     illustration) so a hero card can carry a mock.
//   • `accent` cards get a soft tint wash for emphasis without
//     breaking the typographic rhythm.

export type BentoSize = "hero" | "wide" | "tall" | "small";

export interface BentoCard {
  size: BentoSize;
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Optional metric value shown large (used with size="tall"). */
  metric?: { value: React.ReactNode; label: React.ReactNode };
  /** Optional bullet list — keeps small/wide cards scannable. */
  bullets?: React.ReactNode[];
  /** Optional visual slot (mock, icon grid, screenshot). */
  visual?: React.ReactNode;
  /** Subtle accent tint to lift the card out of the grid. */
  accent?: boolean;
}

export interface BentoGridProps {
  cards: BentoCard[];
}

// Tailwind span classes keyed by bento size. Mobile stacks full-width.
const SIZE_CLASS: Record<BentoSize, string> = {
  hero: "col-span-full md:col-span-4 md:row-span-2",
  wide: "col-span-full md:col-span-4",
  tall: "col-span-full md:col-span-2 md:row-span-2",
  small: "col-span-full md:col-span-2",
};

export function BentoGrid({ cards }: BentoGridProps) {
  return (
    <div className="grid auto-rows-[minmax(160px,_auto)] grid-cols-1 gap-4 md:grid-cols-6">
      {cards.map((c, i) => (
        <BentoCardShell key={i} card={c} />
      ))}
    </div>
  );
}

function BentoCardShell({ card }: { card: BentoCard }) {
  const sizeClass = SIZE_CLASS[card.size];
  const isHero = card.size === "hero";
  const isTall = card.size === "tall";
  return (
    <div
      className={`${sizeClass} relative overflow-hidden rounded-2xl p-6 md:p-7`}
      style={{
        background: card.accent
          ? "color-mix(in oklab, var(--accent-surface) 40%, var(--surface-1))"
          : "var(--surface-1)",
        boxShadow:
          "0 0 0 1px var(--border-subtle), inset 0 1px 0 0 color-mix(in oklab, var(--text-default) 6%, transparent)",
      }}
    >
      {/* Soft corner wash — only on accent/hero to lift them out. */}
      {(card.accent || isHero) && (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full"
          style={{
            background: "var(--accent-surface-strong)",
            filter: "blur(60px)",
            opacity: 0.45,
          }}
        />
      )}

      <div className="relative flex h-full min-h-0 flex-col">
        {card.eyebrow && (
          <div
            className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: "var(--accent-primary)" }}
          >
            {card.eyebrow}
          </div>
        )}

        {isTall && card.metric ? (
          <>
            <div
              className="text-5xl font-semibold tracking-tight"
              style={{ color: "var(--text-default)", letterSpacing: "-0.02em" }}
            >
              {card.metric.value}
            </div>
            <div
              className="mt-2 text-sm font-medium"
              style={{ color: "var(--text-default)" }}
            >
              {card.metric.label}
            </div>
            {card.description && (
              <p
                className="mt-3 text-sm leading-relaxed"
                style={{ color: "var(--text-muted)" }}
              >
                {card.description}
              </p>
            )}
          </>
        ) : (
          <>
            <div
              className={
                isHero
                  ? "text-2xl font-semibold tracking-tight md:text-3xl"
                  : "text-lg font-semibold tracking-tight md:text-xl"
              }
              style={{ color: "var(--text-default)", letterSpacing: "-0.01em" }}
            >
              {card.title}
            </div>
            {card.description && (
              <p
                className="mt-2 text-sm leading-relaxed"
                style={{ color: "var(--text-muted)" }}
              >
                {card.description}
              </p>
            )}
            {card.bullets && card.bullets.length > 0 && (
              <ul className="mt-4 space-y-1.5">
                {card.bullets.map((b, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <span
                      aria-hidden
                      className="mt-[7px] inline-block h-1 w-1 flex-shrink-0 rounded-full"
                      style={{ background: "var(--accent-primary)" }}
                    />
                    {b}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {card.visual && (
          <div className={`${isHero ? "mt-6" : "mt-auto pt-5"} relative`}>
            {card.visual}
          </div>
        )}
      </div>
    </div>
  );
}
