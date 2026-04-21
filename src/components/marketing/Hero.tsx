import * as React from "react";
import Link from "next/link";
import { Container } from "./Container";

// Hero — the top-of-page header block on marketing routes.
//
// Two layouts:
//   • "stacked" (default, backward-compat): centered or left-aligned
//     copy stack with the visual rendered below. Feature/pricing/for-x
//     pages use this.
//   • "split": two-column layout (60/40) with copy on the left and
//     the visual floating on the right — the premium home-page hero.
//     Background gains a radial accent aura and a faint dotted grid
//     so the headline has more visual weight to sit inside.

export interface HeroAction {
  label: string;
  href: string;
  variant?: "primary" | "secondary";
}

export interface HeroProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  primary?: HeroAction;
  secondary?: HeroAction;
  footnote?: React.ReactNode;
  visual?: React.ReactNode;
  /** "stacked" keeps the existing centered layout; "split" is the new premium layout. */
  layout?: "stacked" | "split";
  /** Only relevant in "stacked" layout. */
  align?: "left" | "center";
  /** Size of the primary CTAs — "md" is the existing size, "lg" is the marketing-hero size. */
  ctaSize?: "md" | "lg";
  /** Optional "trust micro-row" below the CTAs — logos or a short trust line. */
  trust?: React.ReactNode;
}

export function Hero({
  eyebrow,
  title,
  description,
  primary,
  secondary,
  footnote,
  visual,
  layout = "stacked",
  align = "center",
  ctaSize,
  trust,
}: HeroProps) {
  const isSplit = layout === "split";
  // Split layout defaults to left-aligned copy + larger CTAs because
  // the visual itself balances the right side of the grid. Stacked
  // layouts keep the previous defaults so existing pages render
  // identically.
  const effectiveAlign: "left" | "center" = isSplit ? "left" : align;
  const effectiveCtaSize: "md" | "lg" = ctaSize ?? (isSplit ? "lg" : "md");

  return (
    <section
      className={
        isSplit
          ? "relative overflow-hidden pb-20 pt-16 md:pb-28 md:pt-24"
          : "relative overflow-hidden pb-16 pt-20 md:pb-24 md:pt-28"
      }
    >
      {/* Background layers. The aura is a soft radial wash from one
          upper corner; in split mode we anchor it to the left so the
          visual on the right sits in a slightly darker "sky" that
          makes it pop. The dotted grid reads as "precision tool". */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[640px]"
        style={{
          background: isSplit
            ? "radial-gradient(60% 60% at 15% 0%, var(--accent-surface-strong) 0%, transparent 65%)"
            : "radial-gradient(ellipse at 50% 0%, var(--accent-surface) 0%, transparent 60%)",
        }}
      />
      {isSplit && (
        <div
          aria-hidden
          className="mkt-hero-grid pointer-events-none absolute inset-0"
        />
      )}

      <Container size="lg" className="relative">
        {isSplit ? (
          <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-[1.1fr_1fr] lg:gap-10">
            <HeroCopy
              eyebrow={eyebrow}
              title={title}
              description={description}
              primary={primary}
              secondary={secondary}
              footnote={footnote}
              trust={trust}
              align="left"
              ctaSize={effectiveCtaSize}
              split
            />
            {visual && (
              <div className="relative w-full">
                {visual}
              </div>
            )}
          </div>
        ) : (
          <div
            className={`flex flex-col gap-6 ${effectiveAlign === "center" ? "items-center text-center" : "items-start"}`}
          >
            <HeroCopy
              eyebrow={eyebrow}
              title={title}
              description={description}
              primary={primary}
              secondary={secondary}
              footnote={footnote}
              trust={trust}
              align={effectiveAlign}
              ctaSize={effectiveCtaSize}
            />
            {visual && <div className="mt-8 w-full">{visual}</div>}
          </div>
        )}
      </Container>
    </section>
  );
}

// Extracted so split and stacked modes render exactly the same copy
// block with the same spacing rules — only the surrounding layout
// differs.
function HeroCopy({
  eyebrow,
  title,
  description,
  primary,
  secondary,
  footnote,
  trust,
  align,
  ctaSize,
  split = false,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  primary?: HeroAction;
  secondary?: HeroAction;
  footnote?: React.ReactNode;
  trust?: React.ReactNode;
  align: "left" | "center";
  ctaSize: "md" | "lg";
  split?: boolean;
}) {
  const centered = align === "center";
  return (
    <div
      className={`flex flex-col gap-6 ${centered ? "items-center text-center" : "items-start"}`}
    >
      {eyebrow && (
        <span
          className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
          style={{
            background: "var(--accent-surface)",
            color: "var(--accent-primary)",
            border: "1px solid var(--accent-surface-strong)",
          }}
        >
          {eyebrow}
        </span>
      )}
      <h1
        className={
          split
            ? "max-w-[14ch] text-4xl font-semibold leading-[1.05] tracking-tight md:text-5xl lg:text-6xl"
            : `max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight md:text-6xl ${centered ? "mx-auto" : ""}`
        }
        style={{
          // Subtle vertical gradient on the headline — ink at the top,
          // fading to muted at the baseline. Gives the H1 just enough
          // dimensionality without reading as a gimmick.
          background:
            "linear-gradient(180deg, var(--text-default) 0%, color-mix(in oklab, var(--text-default) 72%, var(--text-muted)) 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        {title}
      </h1>
      {description && (
        <p
          className={`max-w-2xl text-lg leading-relaxed md:text-xl ${centered ? "mx-auto" : ""}`}
          style={{ color: "var(--text-muted)" }}
        >
          {description}
        </p>
      )}
      {(primary || secondary) && (
        <div className={`flex flex-wrap gap-3 ${centered ? "justify-center" : ""}`}>
          {primary && <HeroButton action={primary} size={ctaSize} />}
          {secondary && (
            <HeroButton action={{ variant: "secondary", ...secondary }} size={ctaSize} />
          )}
        </div>
      )}
      {footnote && (
        <div className="text-xs" style={{ color: "var(--text-faint)" }}>
          {footnote}
        </div>
      )}
      {trust && (
        <div
          className={`mt-2 flex flex-wrap items-center gap-4 text-xs ${centered ? "justify-center" : ""}`}
          style={{ color: "var(--text-faint)" }}
        >
          {trust}
        </div>
      )}
    </div>
  );
}

function HeroButton({
  action,
  size,
}: {
  action: HeroAction;
  size: "md" | "lg";
}) {
  const isPrimary = action.variant !== "secondary";
  const sizeClasses =
    size === "lg" ? "h-12 px-6 text-base" : "h-11 px-6 text-sm";
  return (
    <Link
      href={action.href}
      className={`ts-focus ts-link-arrow inline-flex items-center justify-center rounded-md font-medium transition-colors hover:brightness-110 ${sizeClasses}`}
      style={
        isPrimary
          ? {
              background: "var(--accent-primary)",
              color: "var(--accent-fg)",
              border: "1px solid var(--accent-primary)",
            }
          : {
              background: "var(--surface-1)",
              color: "var(--text-default)",
              border: "1px solid var(--border-default)",
            }
      }
    >
      {action.label}
      {!isPrimary && (
        <span
          aria-hidden
          className="ts-link-arrow__glyph ml-1.5 inline-block transition-transform"
        >
          →
        </span>
      )}
    </Link>
  );
}
