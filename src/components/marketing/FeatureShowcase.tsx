import * as React from "react";
import Link from "next/link";
import { SectionEyebrow } from "./SectionEyebrow";

// FeatureShowcase — the long-scroll feature block. Full-width, two
// columns, copy one side + visual the other. Stack three of these on
// a landing page with alternating direction (L → R → L) and you have
// the "deep dive into what the product does" section that every
// premium SaaS home page uses.
//
// Design notes:
//   • Alternating direction is opt-in via `reverse`. On mobile we
//     always stack copy-on-top, visual-below — the alternation only
//     matters at md+ where two columns fit.
//   • Bullets are first-class. Each has an accent dot + bold lead +
//     muted detail. This is deliberately not just a prose paragraph;
//     the pattern the eye expects here is scannable.
//   • The visual slot is a render prop so callers can pass a
//     ScreenshotFrame, a ProductMock, a raw <img>, or a hand-composed
//     div. We don't make assumptions about its size.
//   • A subtle backdrop "halo" sits behind the visual — tokenized so
//     it retunes in light mode without per-caller code.

export interface FeatureShowcaseBullet {
  title: React.ReactNode;
  detail?: React.ReactNode;
}

export interface FeatureShowcaseProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  bullets?: FeatureShowcaseBullet[];
  cta?: { label: string; href: string };
  visual: React.ReactNode;
  /** Visual on the right (default) or left. */
  reverse?: boolean;
  /** Muted surface — swap to surface-1 to create an alternating band. */
  muted?: boolean;
}

export function FeatureShowcase({
  eyebrow,
  title,
  description,
  bullets,
  cta,
  visual,
  reverse = false,
  muted = false,
}: FeatureShowcaseProps) {
  return (
    <section
      className="py-20 md:py-28"
      style={{ background: muted ? "var(--surface-1)" : "transparent" }}
    >
      <div className="mx-auto w-full max-w-6xl px-6">
        <div
          className={`grid grid-cols-1 items-center gap-12 md:gap-16 lg:grid-cols-[1fr_1.1fr] ${
            reverse ? "lg:[direction:rtl]" : ""
          }`}
        >
          {/* Copy column — reset the RTL direction we set on the grid
              so text still reads LTR. The grid trick is just used to
              swap column order in one place. */}
          <div
            className="order-1 min-w-0 lg:order-none"
            style={{ direction: "ltr" }}
          >
            {eyebrow && <SectionEyebrow variant="dot">{eyebrow}</SectionEyebrow>}
            <h3
              className="mt-3 text-3xl font-semibold tracking-tight md:text-[40px] md:leading-[1.1]"
              style={{
                color: "var(--text-default)",
                letterSpacing: "-0.015em",
              }}
            >
              {title}
            </h3>
            {description && (
              <p
                className="mt-4 max-w-xl text-base leading-relaxed md:text-lg"
                style={{ color: "var(--text-muted)" }}
              >
                {description}
              </p>
            )}
            {bullets && bullets.length > 0 && (
              <ul className="mt-7 space-y-4">
                {bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full"
                      style={{
                        background: "var(--accent-surface)",
                        color: "var(--accent-primary)",
                      }}
                    >
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 11 11"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M2 5.5l2.5 2.5L9 3" />
                      </svg>
                    </span>
                    <div className="min-w-0">
                      <div
                        className="text-sm font-semibold md:text-base"
                        style={{ color: "var(--text-default)" }}
                      >
                        {b.title}
                      </div>
                      {b.detail && (
                        <div
                          className="mt-1 text-sm leading-relaxed"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {b.detail}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {cta && (
              <Link
                href={cta.href}
                className="ts-link-arrow mt-8 inline-flex items-center gap-1 text-sm font-semibold"
                style={{ color: "var(--accent-primary)" }}
              >
                {cta.label}
                <span
                  aria-hidden
                  className="ts-link-arrow__glyph ml-0.5 inline-block transition-transform"
                >
                  →
                </span>
              </Link>
            )}
          </div>

          {/* Visual column */}
          <div
            className="order-2 relative min-w-0 lg:order-none"
            style={{ direction: "ltr" }}
          >
            {/* Halo behind the visual. Anchored in the center, blurred
                so it blooms past any frame edges. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10"
              style={{
                background:
                  "radial-gradient(ellipse at 50% 50%, var(--accent-surface-strong) 0%, transparent 62%)",
                opacity: 0.55,
                filter: "blur(60px)",
              }}
            />
            {visual}
          </div>
        </div>
      </div>
    </section>
  );
}
