import * as React from "react";
import { formatMoney } from "@/lib/format";

// Live preview of how a plan card renders on /pricing.
//
// Surfaces twice in the editor:
//   1. Overview tab — quick "what does this look like" sanity check
//   2. Marketing tab — alongside the copy fields so admins see edits
//      reflected immediately on save
//
// Pure presentation. Driven entirely by props so it doesn't drift
// from the marketing-side card if that one rewrites.

export interface PlanCardData {
  name: string;
  slug: string;
  subtitle: string | null;
  description: string | null;
  badge: string | null;
  highlight: boolean;
  status: string;
  isContactSales: boolean;
  priceMonthly: number | null;
  priceAnnual: number | null;
  currency: string;
  ctaLabel: string | null;
  trialDays: number | null;
  /** Top-N feature labels to render as the bullet list. */
  featureBullets: string[];
}

export function PlanCardPreview({
  plan,
  showStatusOverlay = true,
}: {
  plan: PlanCardData;
  /** When true, dim the card and overlay a "Draft / Hidden / Archived" notice
      if the plan isn't published. Useful for the editor; off when the card
      is the centerpiece of a page. */
  showStatusOverlay?: boolean;
}) {
  const ctaLabel =
    plan.ctaLabel ??
    (plan.isContactSales ? "Talk to sales" : "Start free trial");
  const monthly = plan.priceMonthly ?? null;
  const annual  = plan.priceAnnual  ?? null;
  const annualMonthly = annual != null ? annual / 12 : null;

  const dimmed = showStatusOverlay && plan.status !== "PUBLISHED";

  return (
    <div className="relative">
      <div
        className="rounded-2xl p-6"
        style={{
          background: plan.highlight ? "var(--accent-surface)" : "var(--surface-1)",
          border: `1px solid ${plan.highlight ? "var(--accent-primary)" : "var(--border-default)"}`,
          boxShadow: plan.highlight ? "var(--shadow-md)" : "var(--shadow-sm)",
          opacity: dimmed ? 0.55 : 1,
          minHeight: "420px",
        }}
      >
        {plan.badge && (
          <div className="mb-3 flex justify-end">
            <span
              className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{
                background: plan.highlight ? "var(--accent-primary)" : "var(--surface-2)",
                color:      plan.highlight ? "var(--accent-fg)"      : "var(--text-default)",
              }}
            >
              {plan.badge}
            </span>
          </div>
        )}

        <div className="text-lg font-semibold tracking-tight" style={{ color: "var(--text-default)" }}>
          {plan.name || "Untitled plan"}
        </div>
        {plan.subtitle && (
          <div className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            {plan.subtitle}
          </div>
        )}

        <div className="my-5">
          {plan.isContactSales ? (
            <div className="text-2xl font-semibold" style={{ color: "var(--text-default)" }}>
              Custom
            </div>
          ) : monthly != null ? (
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-semibold tabular-nums tracking-tight" style={{ color: "var(--text-default)" }}>
                {formatMoney(monthly, plan.currency || "USD")}
              </span>
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                /mo
              </span>
            </div>
          ) : (
            <div className="text-2xl font-semibold" style={{ color: "var(--text-faint)" }}>
              No price set
            </div>
          )}
          {!plan.isContactSales && annualMonthly != null && monthly != null && (
            <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              or {formatMoney(annualMonthly.toFixed(2), plan.currency || "USD")}/mo billed annually
              {monthly > 0 && annualMonthly < monthly && (
                <> · save {Math.round((1 - annualMonthly / monthly) * 100)}%</>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          tabIndex={-1}
          aria-disabled
          className="mb-5 w-full rounded-md px-4 py-2 text-sm font-semibold"
          style={{
            background: plan.highlight ? "var(--accent-primary)" : "var(--surface-2)",
            color:      plan.highlight ? "var(--accent-fg)"      : "var(--text-default)",
            border:     plan.highlight ? "none"                  : "1px solid var(--border-default)",
            cursor: "default",
          }}
        >
          {ctaLabel}
        </button>

        {plan.trialDays != null && plan.trialDays > 0 && !plan.isContactSales && (
          <div className="mb-5 text-center text-xs" style={{ color: "var(--text-muted)" }}>
            {plan.trialDays}-day free trial
          </div>
        )}

        {plan.featureBullets.length > 0 && (
          <ul className="space-y-2 text-sm">
            {plan.featureBullets.slice(0, 8).map((b, i) => (
              <li key={i} className="flex items-start gap-2" style={{ color: "var(--text-default)" }}>
                <span aria-hidden style={{ color: plan.highlight ? "var(--accent-primary)" : "var(--success-fg)" }}>
                  ✓
                </span>
                <span>{b}</span>
              </li>
            ))}
            {plan.featureBullets.length > 8 && (
              <li className="text-xs" style={{ color: "var(--text-muted)" }}>
                + {plan.featureBullets.length - 8} more
              </li>
            )}
          </ul>
        )}

        {plan.description && (
          <p
            className="mt-5 border-t pt-4 text-xs"
            style={{ color: "var(--text-muted)", borderColor: "var(--border-subtle)" }}
          >
            {plan.description.slice(0, 220)}
            {plan.description.length > 220 ? "…" : ""}
          </p>
        )}
      </div>

      {dimmed && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide"
            style={{
              background: "var(--surface-2)",
              color: "var(--text-default)",
              border: "1px solid var(--border-default)",
              boxShadow: "var(--shadow-md)",
            }}
          >
            {plan.status} — not on /pricing
          </span>
        </div>
      )}
    </div>
  );
}
