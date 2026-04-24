import * as React from "react";
import { DashboardStat } from "@/components/dashboard/DashboardStat";
import { formatMoney } from "@/lib/format";
import type { HeroMetrics } from "@/lib/dashboard-hero";

// Phase 2 (transformation) — hero band used on every financial-visibility
// persona's dashboard.
//
// Four tiles, one frame shape, one story to read left-to-right:
//
//   Revenue L30   —  how much money came in (with 14d sparkline)
//   Pipeline      —  how much is sitting in the top of the funnel
//   Open A/R      —  how much we're owed, tone-coded by overdue %
//   Next 7d cash  —  what we expect to land this week (weighted)
//
// Persona-specific KPIs ("my quotes pending", "my installs today") still
// live below the hero in the persona view — this band is the cross-role
// executive summary.
//
// Roles that shouldn't see $ figures (e.g. "employee" persona) skip this
// band entirely — the dashboard page is the one that decides whether to
// render it.

export function HeroBand({
  slug,
  currency,
  metrics,
}: {
  slug: string;
  currency: string;
  metrics: HeroMetrics;
}) {
  // Tone the A/R tile red when >30% of outstanding is overdue. The 30%
  // threshold matches the DoD in the transformation plan — "flash red
  // if overdue% > 30".
  const arTone: "default" | "warning" | "danger" =
    metrics.overdueRatio > 0.3 ? "danger"
    : metrics.overdueRatio > 0.1 ? "warning"
    : "default";

  const overduePct = Math.round(metrics.overdueRatio * 100);

  return (
    <section aria-label="Shop summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <DashboardStat
        label="Revenue (30d)"
        value={formatMoney(metrics.revenueL30, currency)}
        hint="Payments collected, net of voids"
        tone={metrics.revenueL30 > 0 ? "success" : "default"}
        spark={metrics.revenueSpark}
        sparkLabel="Last 14 days of collected revenue"
        href={`/t/${slug}/payments`}
      />
      <DashboardStat
        label="Pipeline"
        value={formatMoney(metrics.pipelineValue, currency)}
        hint="Active-stage opportunities"
        tone="accent"
        href={`/t/${slug}/customers?stage=QUALIFIED`}
      />
      <DashboardStat
        label="Open A/R"
        value={formatMoney(metrics.openAR, currency)}
        hint={
          metrics.openInvoiceCount === 0
            ? "No open invoices"
            : `${metrics.openInvoiceCount} open · ${overduePct}% overdue`
        }
        tone={arTone}
        href={`/t/${slug}/invoices?view=open`}
      />
      <DashboardStat
        label="Next 7 days"
        value={formatMoney(metrics.next7Cash, currency)}
        hint="Expected cash (overdue weighted 0.5)"
        tone={metrics.next7Cash > 0 ? "accent" : "default"}
        href={`/t/${slug}/invoices?view=open`}
      />
    </section>
  );
}
