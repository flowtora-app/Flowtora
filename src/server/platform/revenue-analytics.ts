// Page 22 — Revenue Analytics data layer.
//
// Reads against the existing tenant + pricing-plan + invoice graph.
// MRR is computed from active tenants × their plan's monthly price
// (the most accurate snapshot we have today). Historical movement
// (new / expansion / contraction / churned) is approximated by
// comparing tenant.createdAt + status against the period start —
// without a dedicated subscription-event log, expansion/contraction
// is conservative (counted only when an invoice's total exceeds the
// plan's headline price).
//
// Honest deferrals (called out in the UI per tab):
//   • CAC requires marketing spend integration we don't have
//   • LTV by acquisition channel requires attribution we don't track
//   • ARIMA / Prophet forecasts ship as a linear extrapolation today

import { db } from "@/lib/db";

const DAY = 86_400_000;

interface TenantPriced {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: Date;
  pricingPlanId: string | null;
  pricingPlan: { name: string; slug: string; priceMonthly: unknown; currency: string } | null;
}

function priceMonthlyOf(t: TenantPriced): number {
  if (!t.pricingPlan?.priceMonthly) return 0;
  // Decimal | number | string — cast through Number for the arithmetic.
  return Math.round(Number(t.pricingPlan.priceMonthly) * 100); // store in minor units
}

/* ── MRR snapshot (current) ───────────────────────────────── */

export interface MrrSnapshot {
  totalMrr: number;        // minor units
  totalArr: number;        // 12× MRR
  activeTenants: number;
  trialTenants: number;
  pastDueTenants: number;
  byPlan: { planSlug: string; planName: string; tenants: number; mrr: number }[];
}

export async function loadMrrSnapshot(): Promise<MrrSnapshot> {
  const tenants = await db.tenant.findMany({
    select: {
      id: true, name: true, slug: true, status: true, createdAt: true,
      pricingPlanId: true,
      pricingPlan: { select: { name: true, slug: true, priceMonthly: true, currency: true } },
    },
  });
  const active = tenants.filter((t) => t.status === "ACTIVE");
  const trial  = tenants.filter((t) => t.status === "TRIAL");
  const pastDue = tenants.filter((t) => t.status === "PAST_DUE");
  const totalMrr = active.reduce((acc, t) => acc + priceMonthlyOf(t), 0);

  const byPlanMap = new Map<string, { planSlug: string; planName: string; tenants: number; mrr: number }>();
  for (const t of active) {
    const key = t.pricingPlan?.slug ?? "unassigned";
    const row = byPlanMap.get(key) ?? {
      planSlug: key,
      planName: t.pricingPlan?.name ?? "Unassigned",
      tenants: 0,
      mrr: 0,
    };
    row.tenants += 1;
    row.mrr += priceMonthlyOf(t);
    byPlanMap.set(key, row);
  }

  return {
    totalMrr,
    totalArr: totalMrr * 12,
    activeTenants: active.length,
    trialTenants: trial.length,
    pastDueTenants: pastDue.length,
    byPlan: Array.from(byPlanMap.values()).sort((a, b) => b.mrr - a.mrr),
  };
}

/* ── Monthly revenue trend (real $ from invoices) ─────────── */

export interface MonthlyRevenueRow {
  month: string;        // "2026-04"
  revenue: number;      // sum of paid invoices total (minor units)
  invoices: number;
  newSignups: number;   // tenants whose createdAt fell in that month
  churned: number;      // tenants whose status went CANCELED/SUSPENDED with updatedAt in month
}

export async function loadMonthlyRevenue(periodMonths = 12): Promise<MonthlyRevenueRow[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - periodMonths);

  const [invoices, tenants] = await Promise.all([
    db.platformBillingInvoice.findMany({
      where: { status: "PAID", paidAt: { gte: since } },
      select: { id: true, total: true, paidAt: true },
      take: 50_000,
    }),
    db.tenant.findMany({
      select: { id: true, status: true, createdAt: true, updatedAt: true },
    }),
  ]);

  const acc = new Map<string, MonthlyRevenueRow>();
  // Initialize the last N months so the chart shows the full range
  // even when months have zero invoices.
  for (let i = periodMonths - 1; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    acc.set(key, { month: key, revenue: 0, invoices: 0, newSignups: 0, churned: 0 });
  }

  for (const inv of invoices) {
    if (!inv.paidAt) continue;
    const key = `${inv.paidAt.getUTCFullYear()}-${String(inv.paidAt.getUTCMonth() + 1).padStart(2, "0")}`;
    const row = acc.get(key);
    if (!row) continue;
    row.revenue += inv.total;
    row.invoices += 1;
  }

  for (const t of tenants) {
    const created = `${t.createdAt.getUTCFullYear()}-${String(t.createdAt.getUTCMonth() + 1).padStart(2, "0")}`;
    const createdRow = acc.get(created);
    if (createdRow) createdRow.newSignups += 1;

    if (t.status === "CANCELED" || t.status === "SUSPENDED" || t.status === "ARCHIVED") {
      // Use updatedAt as a proxy for the churn event time.
      const ch = `${t.updatedAt.getUTCFullYear()}-${String(t.updatedAt.getUTCMonth() + 1).padStart(2, "0")}`;
      const chRow = acc.get(ch);
      if (chRow) chRow.churned += 1;
    }
  }

  return Array.from(acc.values()).sort((a, b) => (a.month < b.month ? -1 : 1));
}

/* ── MRR movement (new / expansion / contraction / churned) ── */

export interface MrrMovementRow {
  month: string;
  newMrr: number;          // MRR from tenants that signed up + activated this month
  expansionMrr: number;    // approximation: paid invoices total > plan headline
  contractionMrr: number;  // approximation: refunds
  churnedMrr: number;      // estimated MRR from churned tenants in month (negative)
  reactivatedMrr: number;  // currently always 0 (no reactivation event log yet)
  netMrr: number;
}

export async function loadMrrMovement(periodMonths = 12): Promise<MrrMovementRow[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - periodMonths);

  const [tenants, invoices, refunds] = await Promise.all([
    db.tenant.findMany({
      select: {
        id: true, status: true, createdAt: true, updatedAt: true,
        pricingPlan: { select: { priceMonthly: true } },
      },
    }),
    db.platformBillingInvoice.findMany({
      where: { status: "PAID", paidAt: { gte: since } },
      select: {
        id: true, total: true, paidAt: true, tenantId: true,
        tenant: { select: { pricingPlan: { select: { priceMonthly: true } } } },
      },
      take: 50_000,
    }),
    db.platformPaymentRefund.findMany({
      where: { initiatedAt: { gte: since }, status: "SUCCEEDED" },
      select: { amount: true, initiatedAt: true },
      take: 50_000,
    }),
  ]);

  const acc = new Map<string, MrrMovementRow>();
  for (let i = periodMonths - 1; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    acc.set(key, {
      month: key, newMrr: 0, expansionMrr: 0,
      contractionMrr: 0, churnedMrr: 0, reactivatedMrr: 0, netMrr: 0,
    });
  }

  // New MRR: tenants who signed up in the month, weighted by their current plan price.
  for (const t of tenants) {
    if (t.createdAt < since) continue;
    if (t.status !== "ACTIVE") continue;
    const key = `${t.createdAt.getUTCFullYear()}-${String(t.createdAt.getUTCMonth() + 1).padStart(2, "0")}`;
    const row = acc.get(key);
    if (!row) continue;
    row.newMrr += Math.round(Number(t.pricingPlan?.priceMonthly ?? 0) * 100);
  }

  // Expansion MRR (approximation): when a paid invoice exceeds the plan's
  // headline monthly price, treat the excess as expansion.
  for (const inv of invoices) {
    if (!inv.paidAt) continue;
    const key = `${inv.paidAt.getUTCFullYear()}-${String(inv.paidAt.getUTCMonth() + 1).padStart(2, "0")}`;
    const row = acc.get(key);
    if (!row) continue;
    const headline = Math.round(Number(inv.tenant.pricingPlan?.priceMonthly ?? 0) * 100);
    if (headline > 0 && inv.total > headline) {
      row.expansionMrr += inv.total - headline;
    }
  }

  // Contraction MRR (approximation): successful refunds in the period.
  for (const r of refunds) {
    const key = `${r.initiatedAt.getUTCFullYear()}-${String(r.initiatedAt.getUTCMonth() + 1).padStart(2, "0")}`;
    const row = acc.get(key);
    if (!row) continue;
    row.contractionMrr += r.amount;
  }

  // Churned MRR: tenants who flipped to CANCELED/SUSPENDED in the period.
  for (const t of tenants) {
    if (t.status !== "CANCELED" && t.status !== "SUSPENDED" && t.status !== "ARCHIVED") continue;
    if (t.updatedAt < since) continue;
    const key = `${t.updatedAt.getUTCFullYear()}-${String(t.updatedAt.getUTCMonth() + 1).padStart(2, "0")}`;
    const row = acc.get(key);
    if (!row) continue;
    row.churnedMrr += Math.round(Number(t.pricingPlan?.priceMonthly ?? 0) * 100);
  }

  for (const row of acc.values()) {
    row.netMrr = row.newMrr + row.expansionMrr - row.contractionMrr - row.churnedMrr + row.reactivatedMrr;
  }

  return Array.from(acc.values()).sort((a, b) => (a.month < b.month ? -1 : 1));
}

/* ── Cohort retention ──────────────────────────────────────── */

export interface CohortRow {
  cohort: string;          // signup month YYYY-MM
  size: number;
  retained: number[];      // index = months since signup, value = count still active
}

export async function loadCohortRetention(cohortsBack = 6): Promise<CohortRow[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - cohortsBack);

  const tenants = await db.tenant.findMany({
    where: { createdAt: { gte: since } },
    select: { id: true, status: true, createdAt: true, updatedAt: true },
  });

  const cohorts = new Map<string, CohortRow>();
  for (let i = cohortsBack - 1; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    cohorts.set(key, { cohort: key, size: 0, retained: [] });
  }

  for (const t of tenants) {
    const key = `${t.createdAt.getUTCFullYear()}-${String(t.createdAt.getUTCMonth() + 1).padStart(2, "0")}`;
    const cohort = cohorts.get(key);
    if (!cohort) continue;
    cohort.size += 1;
  }

  // For each cohort, compute retained per month-since-signup. We don't
  // have status history, so we approximate: a tenant is "retained at
  // month N" if it's currently ACTIVE/TRIAL/PAST_DUE — i.e. not churned.
  for (const [key, cohort] of cohorts) {
    const cohortDate = new Date(`${key}-01T00:00:00Z`);
    const monthsAgo = Math.max(0, Math.floor((Date.now() - cohortDate.getTime()) / (30.4 * DAY)));
    for (let m = 0; m <= monthsAgo; m++) {
      const cutoff = new Date(cohortDate);
      cutoff.setMonth(cutoff.getMonth() + m + 1);
      // Count tenants in this cohort still alive at cutoff.
      let alive = 0;
      for (const t of tenants) {
        const tk = `${t.createdAt.getUTCFullYear()}-${String(t.createdAt.getUTCMonth() + 1).padStart(2, "0")}`;
        if (tk !== key) continue;
        const isChurned =
          (t.status === "CANCELED" || t.status === "SUSPENDED" || t.status === "ARCHIVED") &&
          t.updatedAt < cutoff;
        if (!isChurned) alive += 1;
      }
      cohort.retained.push(alive);
    }
  }

  return Array.from(cohorts.values()).sort((a, b) => (a.cohort < b.cohort ? -1 : 1));
}

/* ── ARPU / ARPA ────────────────────────────────────────────── */

export interface ArpuByPlan {
  planSlug: string;
  planName: string;
  activeTenants: number;
  monthlyRevenue: number;  // minor units
  arpu: number;
}

export async function loadArpuByPlan(): Promise<ArpuByPlan[]> {
  const snap = await loadMrrSnapshot();
  return snap.byPlan.map((p) => ({
    planSlug: p.planSlug,
    planName: p.planName,
    activeTenants: p.tenants,
    monthlyRevenue: p.mrr,
    arpu: p.tenants === 0 ? 0 : Math.round(p.mrr / p.tenants),
  }));
}

/* ── LTV (simplified) ──────────────────────────────────────── */

export interface LtvByPlan {
  planSlug: string;
  planName: string;
  arpu: number;             // monthly ARPU per plan
  estChurnRate: number;     // monthly churn estimate (decimal)
  ltv: number;              // ARPU / churnRate when churnRate > 0
}

export async function loadLtvByPlan(): Promise<LtvByPlan[]> {
  const arpu = await loadArpuByPlan();
  // Simple churn estimate: total churned tenants in the last 90 days /
  // active tenants today. Per-plan churn would need historical plan
  // assignment, which we don't track — same rate applied across plans.
  const since = new Date(Date.now() - 90 * DAY);
  const [active, churned] = await Promise.all([
    db.tenant.count({ where: { status: "ACTIVE" } }),
    db.tenant.count({
      where: {
        status: { in: ["CANCELED", "SUSPENDED", "ARCHIVED"] },
        updatedAt: { gte: since },
      },
    }),
  ]);
  const monthlyChurn = active === 0
    ? 0
    : (churned / 3) / Math.max(1, active);   // 90d → monthly approx

  return arpu.map((a) => ({
    planSlug: a.planSlug,
    planName: a.planName,
    arpu: a.arpu,
    estChurnRate: monthlyChurn,
    ltv: monthlyChurn === 0 ? 0 : Math.round(a.arpu / monthlyChurn),
  }));
}

/* ── Plan distribution snapshot (used by Plan Migration tab) ─ */

export interface PlanDistribution {
  bySlug: { slug: string; name: string; count: number; mrr: number }[];
  total: number;
}

export async function loadPlanDistribution(): Promise<PlanDistribution> {
  const snap = await loadMrrSnapshot();
  return {
    total: snap.activeTenants,
    bySlug: snap.byPlan.map((p) => ({ slug: p.planSlug, name: p.planName, count: p.tenants, mrr: p.mrr })),
  };
}

/* ── Quick Ratio + Magic Number ────────────────────────────── */

export interface QuickRatioRow {
  month: string;
  newPlusExpansion: number;
  churnPlusContraction: number;
  quickRatio: number | null;
}

export async function loadQuickRatio(periodMonths = 12): Promise<QuickRatioRow[]> {
  const movement = await loadMrrMovement(periodMonths);
  return movement.map((m) => {
    const num = m.newMrr + m.expansionMrr;
    const den = m.churnedMrr + m.contractionMrr;
    return {
      month: m.month,
      newPlusExpansion: num,
      churnPlusContraction: den,
      quickRatio: den === 0 ? null : Math.round((num / den) * 100) / 100,
    };
  });
}

/* ── Forecast (linear extrapolation) ───────────────────────── */

export interface ForecastRow {
  month: string;
  mrr: number;        // projected MRR (minor units)
  isHistorical: boolean;
}

export async function loadForecast(periodMonths = 12, scenarioChurnDelta = 0): Promise<ForecastRow[]> {
  const movement = await loadMrrMovement(12);
  const snap = await loadMrrSnapshot();
  const out: ForecastRow[] = [];

  // Use last 6 months of net movement as the slope.
  const recent = movement.slice(-6);
  const avgNet = recent.reduce((acc, r) => acc + r.netMrr, 0) / Math.max(1, recent.length);
  // Apply scenario churn adjustment as a simple multiplier on the slope.
  const adjustedSlope = avgNet * (1 - scenarioChurnDelta);

  let runningMrr = snap.totalMrr;
  // Historical: last 6 months net to render the leading line
  for (const r of recent) {
    out.push({ month: r.month, mrr: Math.max(0, runningMrr - (recent.length * adjustedSlope) + (recent.indexOf(r) * adjustedSlope)), isHistorical: true });
  }
  // Forecast forward
  const today = new Date();
  for (let i = 1; i <= periodMonths; i++) {
    const d = new Date(today);
    d.setMonth(d.getMonth() + i);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    runningMrr = Math.max(0, runningMrr + adjustedSlope);
    out.push({ month: key, mrr: runningMrr, isHistorical: false });
  }
  return out;
}
