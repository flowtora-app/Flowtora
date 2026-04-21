import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

// PricingTable — 3-tier plan card grid.
//
// Cards emphasize the "featured" plan by drawing it forward with the
// accent border + a subtle glow. `ctaHref` defaults to /signup but
// each tier can point elsewhere (e.g. enterprise → /contact).
//
// The `features` list per plan supports booleans OR strings. Strings
// show verbatim ("5 user seats"), booleans render a ✓ or ✗ row with
// the passed `label` text.

export interface PricingFeature {
  label: string;
  included: boolean;
  note?: string;
}

export interface PricingTier {
  name: string;
  description: string;
  price: { monthly: number; annual?: number } | "custom";
  highlight?: boolean;
  cta: { label: string; href: string };
  features: PricingFeature[];
}

export interface PricingTableProps {
  tiers: PricingTier[];
  billing?: "monthly" | "annual";
}

// Append the active billing cycle to CTAs that start a purchase flow
// so the signup action can read it and route straight to Stripe
// checkout for that plan + cycle. Enterprise / external links (like
// /contact) are passed through untouched.
function withCycle(href: string, billing: "monthly" | "annual"): string {
  if (!href.startsWith("/signup")) return href;
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}cycle=${billing}`;
}

export function PricingTable({ tiers, billing = "monthly" }: PricingTableProps) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      {tiers.map((tier) => (
        <div
          key={tier.name}
          className={cn(
            "relative flex flex-col rounded-xl p-6",
            tier.highlight && "md:scale-[1.02]",
          )}
          style={{
            background: "var(--surface-1)",
            border: `1px solid ${tier.highlight ? "var(--accent-primary)" : "var(--border-subtle)"}`,
            boxShadow: tier.highlight ? "0 0 0 4px var(--accent-surface)" : "none",
          }}
        >
          {tier.highlight && (
            <span
              className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
            >
              Most popular
            </span>
          )}
          <div className="text-base font-semibold" style={{ color: "var(--text-default)" }}>
            {tier.name}
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            {tier.description}
          </p>

          <div className="mt-6">
            {tier.price === "custom" ? (
              <div className="text-4xl font-semibold tracking-tight" style={{ color: "var(--text-default)" }}>
                Custom
              </div>
            ) : (
              <div className="flex flex-wrap items-baseline gap-2">
                <span
                  className="text-4xl font-semibold tracking-tight md:text-5xl"
                  style={{
                    color: "var(--text-default)",
                    letterSpacing: "-0.02em",
                    // Small horizontal fade on flip — Tailwind's
                    // transition-all handles color/size; we just nudge
                    // opacity so the numeric swap feels deliberate.
                    transition: "opacity 180ms ease",
                  }}
                  key={`${tier.name}-${billing}`}
                >
                  ${billing === "annual" && tier.price.annual ? tier.price.annual : tier.price.monthly}
                </span>
                <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                  / month
                </span>
                {billing === "annual" && tier.price.annual && (
                  <span
                    className="ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                    style={{
                      background: "var(--success-surface)",
                      color: "var(--success-fg)",
                    }}
                  >
                    –{Math.round((1 - tier.price.annual / tier.price.monthly) * 100)}%
                  </span>
                )}
              </div>
            )}
            {tier.price !== "custom" && billing === "annual" && tier.price.annual && (
              <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                Billed annually · ${tier.price.annual * 12}/yr
              </div>
            )}
            {tier.price !== "custom" && billing === "monthly" && (
              <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                Billed monthly · no commitment
              </div>
            )}
          </div>

          <Link
            href={withCycle(tier.cta.href, billing)}
            className="mt-6 inline-flex h-10 items-center justify-center rounded-md text-sm font-medium transition-colors hover:brightness-110"
            style={
              tier.highlight
                ? { background: "var(--accent-primary)", color: "var(--accent-fg)" }
                : { background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }
            }
          >
            {tier.cta.label}
          </Link>

          <ul className="mt-6 space-y-3 text-sm">
            {tier.features.map((f, i) => (
              <li key={i} className="flex items-start gap-2">
                <span
                  aria-hidden
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px]"
                  style={{
                    background: f.included ? "var(--success-surface)" : "var(--surface-2)",
                    color: f.included ? "var(--success-fg)" : "var(--text-faint)",
                  }}
                >
                  {f.included ? "✓" : "—"}
                </span>
                <span style={{ color: f.included ? "var(--text-default)" : "var(--text-faint)" }}>
                  {f.label}
                  {f.note && (
                    <span className="ml-1 text-xs" style={{ color: "var(--text-muted)" }}>
                      ({f.note})
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
