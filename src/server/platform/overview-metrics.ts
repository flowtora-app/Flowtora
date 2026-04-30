// Platform overview metrics service.
//
// Single source of truth for the admin command-center dashboard. Every
// widget on /platform reads from `loadOverviewMetrics()` so query work
// happens once per request.
//
// MoM approximation (no snapshot table yet):
//   We don't have a `canceledAt` on Tenant, so "MRR 30 days ago" can't
//   be reconstructed perfectly. Approximation: sum prices of tenants
//   that were plausibly paying 30d ago = tenants with createdAt ≤ 30d
//   ago whose status is ACTIVE/PAST_DUE/CANCELED/ARCHIVED (they were
//   paying then even if they've since churned). Close enough for a
//   "is revenue moving up or down" signal; a future slice can add a
//   nightly snapshots table for exact MoM.

import type { TenantStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getAllPlans, type PlanOut } from "@/lib/plans";
import {
  chooseBucketGranularity,
  bucketKey,
  buildTrendSeries,
  type ResolvedRange,
  type BucketGranularity,
} from "@/lib/reports";

const DAY = 86_400_000;

export type PlanMixRow = {
  slug: string;
  name: string;
  count: number;
  priceMonthly: number;
  mrr: number;
  sharePct: number;
  color: string;
};

export type TrendPoint = { label: string; [k: string]: string | number };

export type ChurnReasonRow = { reason: string; count: number };

export type OverviewMetrics = {
  range: ResolvedRange;
  granularity: BucketGranularity;

  // Revenue
  mrr: number;
  arr: number;
  mrrDeltaPct: number | null;
  mrrPrior: number;
  arpu: number;
  revenueSparkline14d: { label: string; value: number }[];
  revenueTrend: TrendPoint[];
  paymentsInRange: number;
  planStackKeys: string[];

  // Tenant counts
  activeTenants: number;
  trialTenants: number;
  pastDueTenants: number;
  suspendedTenants: number;
  canceledTenants: number;
  totalTenants: number;
  totalUsers: number;

  // Growth
  newTenantsInRange: number;
  newTenantsPrior: number;
  newTenantsDeltaPct: number | null;
  signupsTrend: TrendPoint[];
  conversionTrend: TrendPoint[];
  trialToPaidPct30d: number | null;

  // Churn
  churnPct30d: number | null;
  churnPctLifetime: number;

  // Plan + reasons
  planMix: PlanMixRow[];
  churnReasons: ChurnReasonRow[];

  // Health
  healthScore: number;
  healthFactors: { label: string; value: number; weightPct: number }[];

  // KPI sparklines (14 day)
  sparkSignups14d: number[];

  // Ops
  emailsOut24h: number;
  paymentSuccessPct30d: number;
  paymentsFailed30d: number;
  activeImpersonations: number;
  pendingExports: number;
  dueExportsOld: number;

  // Freshness
  computedAt: Date;
};

export type AlertSeverity = "critical" | "warning" | "info";

export type Alert = {
  id: string;
  severity: AlertSeverity;
  label: string;
  href: string;
  count: number;
};

// Plan-tier palette. Keyed by slug (lowercase). Falls through to accent.
const PLAN_COLORS: Record<string, string> = {
  starter:    "#64748b",
  growth:     "#14b8a6",
  pro:        "#6366f1",
  enterprise: "#a855f7",
  business:   "#6366f1",
  team:       "#14b8a6",
};

function colorForPlan(slug: string): string {
  return PLAN_COLORS[slug.toLowerCase()] ?? "var(--accent-primary)";
}

function pctDelta(curr: number, prior: number): number | null {
  if (prior === 0) return curr > 0 ? 100 : null;
  return Math.round(((curr - prior) / prior) * 1000) / 10;
}

function priceByEnumKey(plans: PlanOut[]): Map<string, { price: number; plan: PlanOut }> {
  const m = new Map<string, { price: number; plan: PlanOut }>();
  for (const p of plans) m.set(p.slug.toUpperCase(), { price: p.priceMonthly ?? 0, plan: p });
  return m;
}

export async function loadOverviewMetrics(range: ResolvedRange): Promise<OverviewMetrics> {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const thirtyDaysAgo   = new Date(now.getTime() - 30 * DAY);
  const fourteenDaysAgo = new Date(today.getTime() - 13 * DAY);
  const last24h         = new Date(now.getTime() - DAY);

  const granularity = chooseBucketGranularity(range.from, range.to);
  const rangeLengthMs = range.to.getTime() - range.from.getTime();
  const priorTo = new Date(range.from.getTime() - 1);
  const priorFrom = new Date(priorTo.getTime() - rangeLengthMs);

  const [
    plans,
    activeByPlan,
    paidByPlanPrior,
    statusCounts,
    allTenantCount,
    userCount,
    signupsInRange,
    signupsPrior,
    signups14d,
    conversions30d,
    activeSnapshot30d,
    churned30d,
    churnReasonsRaw,
    paymentsSum,
    paymentsInRangeRows,
    pendingExportsList,
    activeImpersonationsCount,
    emailsOut24hCount,
    paymentsOk30d,
    paymentsFailed30d,
  ] = await Promise.all([
    getAllPlans(),
    db.tenant.groupBy({
      by: ["plan"],
      where: { status: "ACTIVE" },
      _count: { _all: true },
    }),
    db.tenant.groupBy({
      by: ["plan"],
      where: {
        createdAt: { lte: thirtyDaysAgo },
        status:    { in: ["ACTIVE", "PAST_DUE", "CANCELED", "ARCHIVED"] },
      },
      _count: { _all: true },
    }),
    db.tenant.groupBy({ by: ["status"], _count: { _all: true } }),
    db.tenant.count(),
    db.user.count(),
    db.tenant.findMany({
      where: { createdAt: { gte: range.from, lte: range.to } },
      select: { createdAt: true, status: true },
    }),
    db.tenant.count({ where: { createdAt: { gte: priorFrom, lte: priorTo } } }),
    db.tenant.findMany({
      where: { createdAt: { gte: fourteenDaysAgo } },
      select: { createdAt: true },
    }),
    (async () => {
      const created30d = await db.tenant.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { status: true },
      });
      return {
        total: created30d.length,
        converted: created30d.filter((t) => t.status === "ACTIVE").length,
      };
    })(),
    db.tenant.count({
      where: {
        createdAt: { lte: thirtyDaysAgo },
        status:    { in: ["ACTIVE", "PAST_DUE"] },
      },
    }),
    db.accountDeletionRequest.count({
      where: { status: "COMPLETED", completedAt: { gte: thirtyDaysAgo } },
    }),
    db.accountDeletionRequest.groupBy({
      by: ["reason"],
      where: {
        status: "COMPLETED",
        completedAt: { gte: new Date(now.getTime() - 180 * DAY) },
      },
      _count: { _all: true },
    }),
    db.payment.aggregate({
      where: {
        voidedAt: null, failedAt: null,
        receivedAt: { gte: range.from, lte: range.to },
      },
      _sum: { amount: true },
    }),
    db.payment.findMany({
      where: {
        voidedAt: null, failedAt: null,
        receivedAt: { gte: range.from, lte: range.to },
      },
      select: {
        receivedAt: true, amount: true,
        tenant: { select: { plan: true } },
      },
    }),
    db.dataExportRequest.findMany({
      where: { status: "PENDING" },
      select: { id: true, createdAt: true },
    }),
    db.impersonationSession.count({ where: { endedAt: null } }),
    db.emailEvent.count({
      where: { createdAt: { gte: last24h }, direction: "OUTBOUND" },
    }),
    db.payment.count({
      where: { receivedAt: { gte: thirtyDaysAgo }, failedAt: null, voidedAt: null },
    }),
    db.payment.count({
      where: { failedAt: { not: null, gte: thirtyDaysAgo } },
    }),
  ]);

  // MRR
  const priceMap = priceByEnumKey(plans);
  let mrr = 0;
  for (const r of activeByPlan) {
    mrr += (priceMap.get(r.plan)?.price ?? 0) * r._count._all;
  }
  let mrrPrior = 0;
  for (const r of paidByPlanPrior) {
    mrrPrior += (priceMap.get(r.plan)?.price ?? 0) * r._count._all;
  }
  const arr = mrr * 12;
  const mrrDeltaPct = pctDelta(mrr, mrrPrior);

  // Status counts
  const byStatus = new Map<TenantStatus, number>();
  for (const s of statusCounts) byStatus.set(s.status, s._count._all);
  const activeTenants    = byStatus.get("ACTIVE")    ?? 0;
  const trialTenants     = byStatus.get("TRIAL")     ?? 0;
  const pastDueTenants   = byStatus.get("PAST_DUE")  ?? 0;
  const suspendedTenants = byStatus.get("SUSPENDED") ?? 0;
  const canceledTenants  = (byStatus.get("CANCELED") ?? 0) + (byStatus.get("ARCHIVED") ?? 0);
  const arpu = activeTenants > 0 ? mrr / activeTenants : 0;

  // Plan mix
  const planMix: PlanMixRow[] = plans
    .filter((p) => p.status !== "DRAFT" && p.status !== "ARCHIVED")
    .map((plan) => {
      const count = activeByPlan.find((r) => r.plan === plan.slug.toUpperCase())?._count._all ?? 0;
      const price = plan.priceMonthly ?? 0;
      const planMrr = count * price;
      return {
        slug: plan.slug,
        name: plan.name,
        count,
        priceMonthly: price,
        mrr: planMrr,
        sharePct: mrr > 0 ? Math.round((planMrr / mrr) * 1000) / 10 : 0,
        color: colorForPlan(plan.slug),
      };
    })
    .sort((a, b) => b.mrr - a.mrr);

  // Revenue trend (stacked by plan name)
  const planNameByEnum = new Map<string, string>();
  for (const p of plans) planNameByEnum.set(p.slug.toUpperCase(), p.name);
  const stackKeys = planMix.filter((p) => p.count > 0 || p.mrr > 0).map((p) => p.name);
  if (stackKeys.length === 0 && planMix.length) stackKeys.push(planMix[0].name);

  const revBuckets = new Map<string, Record<string, number>>();
  for (const p of paymentsInRangeRows) {
    const k = bucketKey(p.receivedAt, granularity);
    const row = revBuckets.get(k) ?? Object.fromEntries(stackKeys.map((s) => [s, 0]));
    const pKey = planNameByEnum.get(p.tenant.plan) ?? "Other";
    row[pKey] = (row[pKey] ?? 0) + Number(p.amount);
    revBuckets.set(k, row);
  }
  const revenueTrend: TrendPoint[] = buildTrendSeries(range.from, range.to, granularity, new Map()).map((b) => {
    const row: TrendPoint = { label: b.label };
    const src = revBuckets.get(b.key);
    for (const key of stackKeys) row[key] = Math.round(src?.[key] ?? 0);
    return row;
  });

  // Signups + conversion trend
  const signupBuckets = new Map<string, number>();
  const convNum = new Map<string, number>();
  for (const t of signupsInRange) {
    const k = bucketKey(t.createdAt, granularity);
    signupBuckets.set(k, (signupBuckets.get(k) ?? 0) + 1);
    if (t.status === "ACTIVE") convNum.set(k, (convNum.get(k) ?? 0) + 1);
  }
  const signupsSeries = buildTrendSeries(range.from, range.to, granularity, signupBuckets);
  const signupsTrend: TrendPoint[] = signupsSeries.map((b) => ({
    label: b.label,
    "New sign-ups": b.value,
  }));
  const conversionTrend: TrendPoint[] = signupsSeries.map((b) => {
    const denom = b.value;
    const num = convNum.get(b.key) ?? 0;
    const pct = denom > 0 ? Math.round((num / denom) * 1000) / 10 : 0;
    return { label: b.label, "New sign-ups": denom, "Conversion %": pct };
  });

  // 14-day signup sparkline
  const signupsByDay = new Map<string, number>();
  for (const t of signups14d) {
    const k = bucketKey(t.createdAt, "day");
    signupsByDay.set(k, (signupsByDay.get(k) ?? 0) + 1);
  }
  const sparkSignups14d = buildTrendSeries(fourteenDaysAgo, now, "day", signupsByDay).map((b) => b.value);

  // 14-day revenue sparkline
  const revDayBuckets = new Map<string, number>();
  for (const p of paymentsInRangeRows) {
    const k = bucketKey(p.receivedAt, "day");
    revDayBuckets.set(k, (revDayBuckets.get(k) ?? 0) + Number(p.amount));
  }
  const revenueSparkline14d = buildTrendSeries(fourteenDaysAgo, now, "day", revDayBuckets).map((b) => ({
    label: b.label,
    value: Math.round(b.value),
  }));

  // Churn
  const churnPctLifetime = allTenantCount > 0
    ? Math.round((canceledTenants / allTenantCount) * 1000) / 10
    : 0;
  const churnPct30d = activeSnapshot30d > 0
    ? Math.round((churned30d / activeSnapshot30d) * 1000) / 10
    : null;

  // Churn reasons
  const churnReasons: ChurnReasonRow[] = churnReasonsRaw
    .map((r) => ({ reason: (r.reason?.trim() || "No reason given"), count: r._count._all }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // Trial→paid
  const trialToPaidPct30d = conversions30d.total > 0
    ? Math.round((conversions30d.converted / conversions30d.total) * 1000) / 10
    : null;

  // Signups delta
  const newTenantsInRange = signupsInRange.length;
  const newTenantsDeltaPct = pctDelta(newTenantsInRange, signupsPrior);

  // Payments
  const paymentsInRange = Number(paymentsSum._sum.amount ?? 0);
  const paymentTotal30d = paymentsOk30d + paymentsFailed30d;
  const paymentSuccessPct30d = paymentTotal30d > 0
    ? Math.round((paymentsOk30d / paymentTotal30d) * 1000) / 10
    : 100;

  // Exports age
  const dueExportsOld = pendingExportsList.filter((r) => now.getTime() - r.createdAt.getTime() > DAY).length;

  // Health score (0-100, weighted)
  const paymentHealth = paymentSuccessPct30d;
  const churnHealth = churnPct30d == null ? 95 : Math.max(0, 100 - churnPct30d * 10);
  const conversionHealth = trialToPaidPct30d == null ? 50 : Math.min(100, trialToPaidPct30d * 2);
  const ticketHealth = pastDueTenants === 0
    ? 100
    : Math.max(0, 100 - pastDueTenants * 5);
  const healthScore = Math.round(
    0.40 * paymentHealth +
    0.25 * churnHealth +
    0.15 * conversionHealth +
    0.20 * ticketHealth,
  );
  const healthFactors = [
    { label: "Payment success",  value: Math.round(paymentHealth),    weightPct: 40 },
    { label: "Low churn",        value: Math.round(churnHealth),      weightPct: 25 },
    { label: "Tenant health",    value: Math.round(ticketHealth),     weightPct: 20 },
    { label: "Trial conversion", value: Math.round(conversionHealth), weightPct: 15 },
  ];

  return {
    range,
    granularity,
    mrr,
    arr,
    mrrDeltaPct,
    mrrPrior,
    arpu,
    revenueSparkline14d,
    revenueTrend,
    paymentsInRange,
    planStackKeys: stackKeys,
    activeTenants,
    trialTenants,
    pastDueTenants,
    suspendedTenants,
    canceledTenants,
    totalTenants: allTenantCount,
    totalUsers: userCount,
    newTenantsInRange,
    newTenantsPrior: signupsPrior,
    newTenantsDeltaPct,
    signupsTrend,
    conversionTrend,
    trialToPaidPct30d,
    churnPct30d,
    churnPctLifetime,
    planMix,
    churnReasons,
    healthScore,
    healthFactors,
    sparkSignups14d,
    emailsOut24h: emailsOut24hCount,
    paymentSuccessPct30d,
    paymentsFailed30d,
    activeImpersonations: activeImpersonationsCount,
    pendingExports: pendingExportsList.length,
    dueExportsOld,
    computedAt: new Date(),
  };
}

// ──────────────────────────────────────────────────────────────────
// Alerts
// ──────────────────────────────────────────────────────────────────

export async function loadAlerts(): Promise<Alert[]> {
  const now = new Date();
  const sevenDaysOut = new Date(now.getTime() + 7 * DAY);
  const threeDaysOut = new Date(now.getTime() + 3 * DAY);
  const fourHoursAgo = new Date(now.getTime() - 4 * 3_600_000);
  const last24h      = new Date(now.getTime() - DAY);

  const [
    pastDueCount, suspendedCount, failedPayments24h, urgentTickets, staleTickets,
    trialsEndingSoon, stalePendingExports, scheduledDeletions, openImpersonations,
  ] = await Promise.all([
    db.tenant.count({ where: { status: "PAST_DUE" } }),
    db.tenant.count({ where: { status: "SUSPENDED" } }),
    db.payment.count({ where: { failedAt: { not: null, gte: last24h } } }),
    db.supportTicket.count({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS"] },
        priority: { in: ["HIGH", "URGENT"] },
      },
    }),
    db.supportTicket.count({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS"] },
        assignedTo: null,
        createdAt: { lte: fourHoursAgo },
      },
    }),
    db.tenant.count({
      where: { status: "TRIAL", trialEndsAt: { gte: now, lte: threeDaysOut } },
    }),
    db.dataExportRequest.count({
      where: { status: "PENDING", createdAt: { lte: last24h } },
    }),
    db.accountDeletionRequest.count({
      where: { status: "SCHEDULED", scheduledFor: { lte: sevenDaysOut } },
    }),
    db.impersonationSession.count({
      where: { endedAt: null, startedAt: { lte: new Date(now.getTime() - 30 * 60_000) } },
    }),
  ]);

  const alerts: Alert[] = [];

  if (failedPayments24h > 0) {
    alerts.push({
      id: "failed-payments",
      severity: "critical",
      label: `${failedPayments24h} failed payment${failedPayments24h === 1 ? "" : "s"}`,
      href: "/platform/billing/dunning",
      count: failedPayments24h,
    });
  }
  if (pastDueCount > 0) {
    alerts.push({
      id: "past-due",
      severity: "critical",
      label: `${pastDueCount} past due`,
      href: "/platform/tenants?status=PAST_DUE",
      count: pastDueCount,
    });
  }
  if (suspendedCount > 0) {
    alerts.push({
      id: "suspended",
      severity: "critical",
      label: `${suspendedCount} suspended`,
      href: "/platform/tenants?status=SUSPENDED",
      count: suspendedCount,
    });
  }
  if (urgentTickets > 0) {
    alerts.push({
      id: "urgent-tickets",
      severity: "critical",
      label: `${urgentTickets} urgent ticket${urgentTickets === 1 ? "" : "s"}`,
      href: "/platform/support",
      count: urgentTickets,
    });
  }
  if (staleTickets > 0) {
    alerts.push({
      id: "stale-tickets",
      severity: "warning",
      label: `${staleTickets} unassigned >4h`,
      href: "/platform/support",
      count: staleTickets,
    });
  }
  if (trialsEndingSoon > 0) {
    alerts.push({
      id: "trials-ending",
      severity: "warning",
      label: `${trialsEndingSoon} trial${trialsEndingSoon === 1 ? "" : "s"} ending ≤3d`,
      href: "/platform/tenants?status=TRIAL",
      count: trialsEndingSoon,
    });
  }
  if (stalePendingExports > 0) {
    alerts.push({
      id: "stale-exports",
      severity: "warning",
      label: `${stalePendingExports} export${stalePendingExports === 1 ? "" : "s"} >24h old`,
      href: "/platform/legal",
      count: stalePendingExports,
    });
  }
  if (scheduledDeletions > 0) {
    alerts.push({
      id: "scheduled-deletions",
      severity: "info",
      label: `${scheduledDeletions} deletion${scheduledDeletions === 1 ? "" : "s"} this week`,
      href: "/platform/legal",
      count: scheduledDeletions,
    });
  }
  if (openImpersonations > 0) {
    alerts.push({
      id: "stale-impersonations",
      severity: "info",
      label: `${openImpersonations} impersonation${openImpersonations === 1 ? "" : "s"} open >30m`,
      href: "/platform/security",
      count: openImpersonations,
    });
  }

  return alerts;
}

// ──────────────────────────────────────────────────────────────────
// Triage queue
// ──────────────────────────────────────────────────────────────────

export type TriageItem = {
  id: string;
  title: string;
  meta: string;
  href: string;
  tone?: "neutral" | "warning" | "danger" | "info" | "success";
};

export type TriageBundle = {
  payments: TriageItem[];
  support:  TriageItem[];
  trials:   TriageItem[];
  deletions: TriageItem[];
  unhealthy: TriageItem[];
};

export async function loadTriage(): Promise<TriageBundle> {
  const now = new Date();
  const sevenDaysOut = new Date(now.getTime() + 7 * DAY);

  const [failedPayments, tickets, trialsEndingSoon, deletions, unhealthy] = await Promise.all([
    db.payment.findMany({
      where: { failedAt: { not: null } },
      orderBy: { failedAt: "desc" },
      take: 8,
      select: {
        id: true, amount: true, failedAt: true, failureReason: true, method: true,
        tenant: { select: { id: true, name: true } },
      },
    }),
    db.supportTicket.findMany({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS"] },
        OR: [{ priority: { in: ["HIGH", "URGENT"] } }, { assignedTo: null }],
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 8,
      select: {
        id: true, subject: true, priority: true, status: true, createdAt: true,
        tenant: { select: { id: true, name: true } },
      },
    }),
    db.tenant.findMany({
      where: { status: "TRIAL", trialEndsAt: { gte: now, lte: sevenDaysOut } },
      orderBy: { trialEndsAt: "asc" },
      take: 8,
      select: { id: true, name: true, trialEndsAt: true, plan: true },
    }),
    db.accountDeletionRequest.findMany({
      where: { status: "SCHEDULED", scheduledFor: { lte: sevenDaysOut } },
      orderBy: { scheduledFor: "asc" },
      take: 8,
      select: {
        id: true, scheduledFor: true, reason: true,
        tenant: { select: { id: true, name: true } },
      },
    }),
    db.tenant.findMany({
      where: { status: { in: ["PAST_DUE", "SUSPENDED"] } },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: { id: true, name: true, status: true, plan: true },
    }),
  ]);

  return {
    payments: failedPayments.map((p) => ({
      id: p.id,
      title: p.tenant.name,
      meta: `$${Number(p.amount).toLocaleString()} · ${p.method} · ${p.failureReason ?? "no reason"}`,
      href: `/platform/tenants/${p.tenant.id}`,
      tone: "danger",
    })),
    support: tickets.map((t) => ({
      id: t.id,
      title: t.subject,
      meta: `${t.priority} · ${t.tenant.name} · ${ageLabel(t.createdAt)}`,
      href: `/platform/support/${t.id}`,
      tone: t.priority === "URGENT" ? "danger" : "warning",
    })),
    trials: trialsEndingSoon.map((t) => ({
      id: t.id,
      title: t.name,
      meta: `${t.plan} · ends ${t.trialEndsAt ? t.trialEndsAt.toLocaleDateString() : "soon"}`,
      href: `/platform/tenants/${t.id}`,
      tone: "warning",
    })),
    deletions: deletions.map((d) => ({
      id: d.id,
      title: d.tenant.name,
      meta: `Scheduled ${d.scheduledFor.toLocaleDateString()}${d.reason ? ` · ${d.reason}` : ""}`,
      href: `/platform/tenants/${d.tenant.id}`,
      tone: "info",
    })),
    unhealthy: unhealthy.map((t) => ({
      id: t.id,
      title: t.name,
      meta: `${t.status} · ${t.plan}`,
      href: `/platform/tenants/${t.id}`,
      tone: t.status === "SUSPENDED" ? "danger" : "warning",
    })),
  };
}

// ──────────────────────────────────────────────────────────────────
// Activity feed
// ──────────────────────────────────────────────────────────────────

export type PlatformActivityItem = {
  id: string;
  kind: "audit" | "tenant" | "impersonation" | "deletion";
  title: string;
  subtitle: string;
  href?: string;
  tone: "neutral" | "success" | "warning" | "danger" | "info";
  occurredAt: Date;
};

export async function loadPlatformActivity(limit = 12): Promise<PlatformActivityItem[]> {
  const since = new Date(Date.now() - 72 * 3_600_000);

  const [audits, recentTenants, recentImpersonations, recentDeletions] = await Promise.all([
    db.auditLog.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true, action: true, entityType: true, createdAt: true,
        tenant: { select: { id: true, name: true, slug: true } },
      },
    }),
    db.tenant.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, name: true, plan: true, status: true, createdAt: true },
    }),
    db.impersonationSession.findMany({
      where: { startedAt: { gte: since } },
      orderBy: { startedAt: "desc" },
      take: limit,
      select: { id: true, startedAt: true, endedAt: true, tenantId: true, platformUserId: true },
    }),
    db.accountDeletionRequest.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true, createdAt: true, reason: true, status: true,
        tenant: { select: { id: true, name: true } },
      },
    }),
  ]);

  const impTenantIds = Array.from(new Set(recentImpersonations.map((i) => i.tenantId)));
  const impUserIds   = Array.from(new Set(recentImpersonations.map((i) => i.platformUserId)));
  const [impTenants, impUsers] = await Promise.all([
    impTenantIds.length
      ? db.tenant.findMany({ where: { id: { in: impTenantIds } }, select: { id: true, name: true } })
      : Promise.resolve([] as { id: string; name: string }[]),
    impUserIds.length
      ? db.user.findMany({ where: { id: { in: impUserIds } }, select: { id: true, email: true, name: true } })
      : Promise.resolve([] as { id: string; email: string; name: string | null }[]),
  ]);
  const impTenantById = new Map(impTenants.map((t) => [t.id, t]));
  const impUserById   = new Map(impUsers.map((u) => [u.id, u]));

  const items: PlatformActivityItem[] = [
    ...recentTenants.map((t) => ({
      id: `tenant:${t.id}`,
      kind: "tenant" as const,
      title: `${t.name} signed up`,
      subtitle: `${t.plan} · ${t.status}`,
      href: `/platform/tenants/${t.id}`,
      tone: "success" as const,
      occurredAt: t.createdAt,
    })),
    ...recentImpersonations.map((i) => {
      const t = impTenantById.get(i.tenantId);
      const u = impUserById.get(i.platformUserId);
      const who = u?.name ?? u?.email ?? "Platform staff";
      return {
        id: `imp:${i.id}`,
        kind: "impersonation" as const,
        title: `${who} signed in as ${t?.name ?? "tenant"}`,
        subtitle: i.endedAt ? "Session ended" : "Session active",
        href: t ? `/platform/tenants/${t.id}` : undefined,
        tone: "info" as const,
        occurredAt: i.startedAt,
      };
    }),
    ...recentDeletions.map((d) => ({
      id: `del:${d.id}`,
      kind: "deletion" as const,
      title: `${d.tenant.name} requested account deletion`,
      subtitle: d.reason ?? d.status,
      href: `/platform/tenants/${d.tenant.id}`,
      tone: "warning" as const,
      occurredAt: d.createdAt,
    })),
    ...audits.slice(0, limit).map((a) => ({
      id: `audit:${a.id}`,
      kind: "audit" as const,
      title: formatAuditAction(a.action),
      subtitle: `${a.entityType ?? "event"}${a.tenant ? ` · ${a.tenant.name}` : ""}`,
      href: a.tenant ? `/platform/tenants/${a.tenant.id}` : undefined,
      tone: "neutral" as const,
      occurredAt: a.createdAt,
    })),
  ]
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .slice(0, limit);

  return items;
}

function formatAuditAction(action: string): string {
  const parts = action.split(".");
  const subject = parts[0] ?? action;
  const verb = parts.slice(1).join(" ").replace(/_/g, " ");
  const s = subject.charAt(0).toUpperCase() + subject.slice(1);
  return verb ? `${s} ${verb}` : s;
}

function ageLabel(d: Date): string {
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

// ──────────────────────────────────────────────────────────────────
// Page 1 dashboard widgets — Top tenants, Recent signups, Cancellations
// ──────────────────────────────────────────────────────────────────

export type TopTenantRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  planSlug: string;
  status: TenantStatus;
  mrr: number;
  users: number;
  lastActivityAt: Date | null;
  healthScore: number;
};

/** Top N active tenants by approximate MRR (plan price × 1).
 *  Ranks by plan price desc, then user count desc as tiebreaker. */
export async function loadTopTenantsByMrr(limit = 10): Promise<TopTenantRow[]> {
  const plans = await getAllPlans();
  const priceByEnum = priceByEnumKey(plans);

  const tenants = await db.tenant.findMany({
    where: { status: { in: ["ACTIVE", "PAST_DUE"] } },
    select: {
      id: true, name: true, slug: true, plan: true, status: true, lastActivityAt: true,
      _count: { select: { memberships: true } },
    },
  });

  const rows: TopTenantRow[] = tenants.map((t) => {
    const price = priceByEnum.get(t.plan)?.price ?? 0;
    // Health score heuristic: ACTIVE = 90 baseline, PAST_DUE = 40, then
    // shave 30 if last activity > 30d, 10 if 7–30d.
    const baseScore = t.status === "ACTIVE" ? 90 : 40;
    const lastDays = t.lastActivityAt
      ? Math.floor((Date.now() - t.lastActivityAt.getTime()) / DAY)
      : null;
    const activityPenalty = lastDays == null ? 20 : lastDays > 30 ? 30 : lastDays > 7 ? 10 : 0;
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      plan: priceByEnum.get(t.plan)?.plan.name ?? String(t.plan),
      planSlug: priceByEnum.get(t.plan)?.plan.slug ?? String(t.plan).toLowerCase(),
      status: t.status,
      mrr: price,
      users: t._count.memberships,
      lastActivityAt: t.lastActivityAt,
      healthScore: Math.max(0, Math.min(100, baseScore - activityPenalty)),
    };
  });

  rows.sort((a, b) => (b.mrr - a.mrr) || (b.users - a.users));
  return rows.slice(0, limit);
}

export type RecentSignupRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: TenantStatus;
  ownerEmail: string | null;
  country: string | null;
  createdAt: Date;
};

export async function loadRecentSignups(limit = 8): Promise<RecentSignupRow[]> {
  const tenants = await db.tenant.findMany({
    where: { status: { in: ["TRIAL", "ACTIVE"] } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true, name: true, slug: true, plan: true, status: true, country: true, createdAt: true,
      memberships: {
        where: { role: "OWNER" },
        select: { user: { select: { email: true } } },
        take: 1,
      },
    },
  });

  return tenants.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    plan: String(t.plan),
    status: t.status,
    ownerEmail: t.memberships[0]?.user?.email ?? null,
    country: t.country,
    createdAt: t.createdAt,
  }));
}

export type RecentCancellationRow = {
  id: string;
  tenantId: string;
  tenantName: string;
  plan: string;
  mrrLost: number;
  reason: string | null;
  cancelledAt: Date;
};

export async function loadRecentCancellations(limit = 8): Promise<RecentCancellationRow[]> {
  const plans = await getAllPlans();
  const priceByEnum = priceByEnumKey(plans);

  const completions = await db.accountDeletionRequest.findMany({
    where: { status: "COMPLETED", completedAt: { not: null } },
    orderBy: { completedAt: "desc" },
    take: limit,
    select: {
      id: true, completedAt: true, reason: true,
      tenant: { select: { id: true, name: true, plan: true } },
    },
  });

  return completions.map((c) => ({
    id: c.id,
    tenantId: c.tenant.id,
    tenantName: c.tenant.name,
    plan: String(c.tenant.plan),
    mrrLost: priceByEnum.get(c.tenant.plan)?.price ?? 0,
    reason: c.reason,
    cancelledAt: c.completedAt!,
  }));
}
