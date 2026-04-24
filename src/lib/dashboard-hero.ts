// Phase 2 (transformation) — shared hero-band metrics loader.
//
// The story-first dashboard layout puts a single row of 4 hero tiles at
// the top of every persona's view:
//
//   1. Revenue (last 30 days of collected payments)  + 14-day sparkline
//   2. Pipeline value (sum of active-stage opportunities)
//   3. Open A/R (outstanding invoice balance, tone-coded by overdue %)
//   4. Next-7d expected cash (weighted by due-date proximity)
//
// These four numbers are the single page-level summary a shop owner
// wants at a glance. Persona-specific "my quotes pending" / "my installs
// today" tiles still appear below the hero band (rendered by the
// existing persona views).
//
// Why a separate file (not a method on dashboard-data.ts)?
//   - The existing loaders are persona-keyed; this loader runs for every
//     persona. Keeping them apart avoids a cross-persona data bag that
//     each loader has to copy-paste the hero queries into.
//   - The hero metrics are the ones we'd cache first if performance
//     bites — isolating them makes that trivial later.
//
// Security: the hero band shows shop-wide financial numbers. We still
// apply branch scope through the shared `scope()` helper in
// dashboard-data.ts so a branch-scoped user sees only their slice. The
// dashboard page decides whether the persona is allowed to see the hero
// band at all (e.g. we hide it for the "employee" persona to avoid
// leaking revenue to front-line staff).

import { db } from "@/lib/db";
import { ACTIVE_PIPELINE_STAGES } from "@/lib/crm";
import { OPEN_INVOICE_STATUSES } from "@/lib/invoices";
import { applyBranchScope, applyBranchScopeOn } from "@/lib/locations";
import type { Prisma } from "@prisma/client";
import type { LoaderCtx } from "@/lib/dashboard-data";

export type HeroMetrics = {
  /** Sum of payments received in the last 30 days, net of refunds. */
  revenueL30: number;
  /** 14 data points — daily collected payments for the sparkline. */
  revenueSpark: number[];
  /** Sum of estimatedValue across all active-stage customers. */
  pipelineValue: number;
  /** Sum of (total - amountPaid) across all OPEN invoices. */
  openAR: number;
  /** Overdue fraction of A/R, 0..1 — drives tone on the A/R tile. */
  overdueRatio: number;
  /** Count of open invoices — hint text for the A/R tile. */
  openInvoiceCount: number;
  /**
   * Expected cash in the next 7 days, computed as:
   *   (balance on non-overdue invoices due inside 7 days) * 1.0
   * + (balance on already-overdue invoices)               * 0.5
   * Rationale: overdue money is real but riskier; halving it
   * keeps the forecast from over-promising.
   */
  next7Cash: number;
};

/**
 * Shop-wide hero metrics shared by every persona's dashboard hero band.
 * Runs 4 parallel queries; nothing persona-specific lives here.
 */
export async function loadHeroMetrics(ctx: LoaderCtx): Promise<HeroMetrics> {
  const now = new Date();
  const last30Start = new Date(now.getTime() - 30 * 86_400_000);
  const last14Start = new Date(now.getTime() - 14 * 86_400_000);
  const plus7 = new Date(now.getTime() + 7 * 86_400_000);

  // Helpers: apply caller's branch scope (security) + optional branch
  // filter (UX toggle). Two flavors — "direct" for entities that carry
  // locationId themselves (Customer, Invoice), "via" for entities that
  // reach location through a relation hop (Payment → Invoice).
  function scopeDirect<T extends Prisma.InvoiceWhereInput | Prisma.CustomerWhereInput>(
    where: T,
  ): T {
    const out = applyBranchScope(where, ctx.branchScope);
    if (ctx.branchFilter) {
      (out as { locationId?: string }).locationId = ctx.branchFilter;
    }
    return out;
  }
  function scopePaymentViaInvoice(
    where: Prisma.PaymentWhereInput,
  ): Prisma.PaymentWhereInput {
    const out = applyBranchScopeOn(where, "invoice", ctx.branchScope);
    if (ctx.branchFilter) {
      // Narrow further to the single branch the user picked. We stash
      // this through the `invoice` relation (Payment has no direct
      // locationId) — cast to the input shape Prisma expects.
      const existing =
        (out.invoice as Prisma.InvoiceScalarRelationFilter | undefined) ?? undefined;
      out.invoice = {
        ...(existing ?? {}),
        locationId: ctx.branchFilter,
      } as Prisma.InvoiceScalarRelationFilter;
    }
    return out;
  }

  const [
    paymentsLast30,
    pipelineAgg,
    openInvoices,
  ] = await Promise.all([
    // Revenue — payments received net of voids/failures.
    // receivedAt + null voidedAt/failedAt filter means a retracted or
    // bounced payment doesn't inflate the L30 number. Branch scope is
    // applied through the invoice relation (Payment itself carries no
    // locationId — collections are always attributable to the invoice
    // that booked the charge).
    db.payment.findMany({
      where: scopePaymentViaInvoice({
        tenantId: ctx.tenantId,
        receivedAt: { gte: last30Start },
        voidedAt: null,
        failedAt: null,
      }),
      select: { amount: true, receivedAt: true },
    }),
    // Pipeline value — sum of estimatedValue on active-stage customers.
    db.customer.aggregate({
      where: scopeDirect({
        tenantId: ctx.tenantId,
        status: "ACTIVE",
        stage: { in: ACTIVE_PIPELINE_STAGES },
      } as Prisma.CustomerWhereInput),
      _sum: { estimatedValue: true },
    }),
    // Open invoices — we need total, amountPaid, and dueDate for every
    // one so we can derive openAR + overdueRatio + next7Cash without
    // extra queries.
    db.invoice.findMany({
      where: scopeDirect({
        tenantId: ctx.tenantId,
        status: { in: OPEN_INVOICE_STATUSES },
      } as Prisma.InvoiceWhereInput),
      select: { total: true, amountPaid: true, dueDate: true, status: true },
    }),
  ]);

  // ─── Revenue L30 + sparkline ────────────────────────────────
  let revenueL30 = 0;
  // 14 buckets, oldest→newest. Index 13 is "today".
  const sparkBuckets = new Array(14).fill(0) as number[];
  for (const p of paymentsLast30) {
    const amt = Number(p.amount);
    revenueL30 += amt;
    if (p.receivedAt >= last14Start) {
      const dayIndex = Math.floor((p.receivedAt.getTime() - last14Start.getTime()) / 86_400_000);
      if (dayIndex >= 0 && dayIndex < 14) sparkBuckets[dayIndex] += amt;
    }
  }

  // ─── Open A/R + overdueRatio + next-7-day cash ──────────────
  let openAR = 0;
  let overdueAR = 0;
  let next7Cash = 0;
  for (const inv of openInvoices) {
    const bal = Math.max(0, Number(inv.total) - Number(inv.amountPaid));
    if (bal <= 0) continue;
    openAR += bal;
    const isOverdue =
      inv.status === "OVERDUE" || (inv.dueDate !== null && inv.dueDate < now);
    if (isOverdue) {
      overdueAR += bal;
      next7Cash += bal * 0.5; // discount overdue money — real but risky
    } else if (inv.dueDate !== null && inv.dueDate <= plus7) {
      next7Cash += bal;
    }
  }

  return {
    revenueL30,
    revenueSpark: sparkBuckets,
    pipelineValue: Number(pipelineAgg._sum.estimatedValue ?? 0),
    openAR,
    overdueRatio: openAR > 0 ? overdueAR / openAR : 0,
    openInvoiceCount: openInvoices.length,
    next7Cash,
  };
}
