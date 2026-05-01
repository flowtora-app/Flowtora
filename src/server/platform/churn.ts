// Churn & At-Risk server data layer — Page 7 of the admin spec.
//
// Three views over one underlying tenant set:
//   • At-Risk — non-cancelled tenants with health <80, surfaced as
//     "predicted to churn in N days" with reason chips.
//   • Churned — CANCELED + ARCHIVED tenants, pivoted by reason code.
//   • Win-back Campaigns — bulk-email campaigns targeting churned
//     tenants with a discount or new-feature pitch.
//
// The at-risk "days to predicted churn" is intentionally a heuristic
// (not ML): we don't have enough historical churn rows yet to fit a
// real model, so we map health-score buckets to estimated days. The
// `topReasons` chip set is computed from real signals (login recency,
// payment failures, ticket volume) so CSMs see *why* the row is
// flagged, even if the days number is a calibrated guess.

import { db } from "@/lib/db";
import {
  loadHealthRows,
  type HealthRow,
} from "@/server/platform/health-scoring";
import { Prisma } from "@prisma/client";
import type {
  ArchiveReasonCode,
  TenantStatus,
  WinbackCampaignStatus,
} from "@prisma/client";

const DAY = 86_400_000;

/* ────────────────────────────────────────────────────────── */
/* At-Risk                                                    */
/* ────────────────────────────────────────────────────────── */

export type RiskWindowDays = 30 | 60 | 90 | 180;

export interface ReasonChip {
  /** Stable key for filtering — e.g. "no_login_30d", "payment_failed_2x". */
  key: string;
  /** Human-readable chip text. */
  label: string;
  /** Severity hint for chip colour. */
  severity: "low" | "medium" | "high";
}

export interface AtRiskRow extends HealthRow {
  /** Predicted-churn window — calibrated from health score. */
  predictedDays: number;
  /** Risk score 0-100 (inverted health, capped). */
  riskScore: number;
  /** Why we flagged them — drives the chip stack on each row. */
  topReasons: ReasonChip[];
  /** Suppressed alerts hide the row by default. */
  suppressedUntil: Date | null;
  /** Last retention action attempted, if any. */
  lastAttempt: { kind: string; at: Date } | null;
}

export interface AtRiskFilters {
  window?: RiskWindowDays;
  scoreMin?: number;   // risk-score min (high risk = high number)
  scoreMax?: number;
  plan?: string;
  reasonKey?: string;
  csmId?: string;
  /** When false (default), suppressed rows are hidden. */
  includeSuppressed?: boolean;
}

export interface AtRiskKpi {
  total: number;
  next30d: number;
  next60d: number;
  next90d: number;
  mrrAtRisk: number;
}

/** Map a health score to a predicted-churn-days estimate. */
function predictedDaysForScore(score: number): number {
  if (score < 30) return 14;
  if (score < 50) return 30;
  if (score < 65) return 60;
  if (score < 80) return 90;
  return 180; // anything above 80 isn't really at risk
}

/** Health-score → risk-score (the bigger, the riskier). */
function riskScoreForHealth(score: number, status: TenantStatus): number {
  let r = Math.max(0, 100 - score);
  if (status === "PAST_DUE") r = Math.max(r, 80);
  if (status === "SUSPENDED") r = Math.max(r, 90);
  return Math.min(100, r);
}

export async function loadAtRiskRows(filters: AtRiskFilters = {}): Promise<{
  rows: AtRiskRow[];
  kpi: AtRiskKpi;
}> {
  const { rows: healthRows } = await loadHealthRows();
  const tenantIds = healthRows.map((r) => r.tenantId);
  if (tenantIds.length === 0) {
    return {
      rows: [],
      kpi: { total: 0, next30d: 0, next60d: 0, next90d: 0, mrrAtRisk: 0 },
    };
  }
  const since30 = new Date(Date.now() - 30 * DAY);
  const sinceQuarter = new Date(Date.now() - 90 * DAY);

  // Pull the signals we'll fold into reason chips.
  const [
    suppressedTenants,
    pastDuePaymentsByTenant,
    ticketsByTenant,
    lastAttemptByTenant,
  ] = await Promise.all([
    db.tenant.findMany({
      where: { id: { in: tenantIds }, atRiskSuppressedUntil: { not: null } },
      select: { id: true, atRiskSuppressedUntil: true },
    }),
    db.payment.groupBy({
      by: ["tenantId"],
      where: {
        tenantId: { in: tenantIds },
        OR: [{ failedAt: { gte: sinceQuarter } }, { voidedAt: { gte: sinceQuarter } }],
      },
      _count: { _all: true },
    }),
    db.supportTicket.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: tenantIds }, createdAt: { gte: since30 } },
      _count: { _all: true },
    }),
    db.retentionAttempt.findMany({
      where: { tenantId: { in: tenantIds } },
      orderBy: { createdAt: "desc" },
      take: 1_000,
      select: { tenantId: true, kind: true, createdAt: true },
    }),
  ]);

  const suppressBy = new Map(
    suppressedTenants.map((t) => [t.id, t.atRiskSuppressedUntil!]),
  );
  const paymentFailBy = new Map(pastDuePaymentsByTenant.map((p) => [p.tenantId, p._count._all]));
  const ticketsBy    = new Map(ticketsByTenant.map((t) => [t.tenantId, t._count._all]));

  const lastAttemptBy = new Map<string, { kind: string; at: Date }>();
  for (const a of lastAttemptByTenant) {
    if (!lastAttemptBy.has(a.tenantId)) {
      lastAttemptBy.set(a.tenantId, { kind: a.kind, at: a.createdAt });
    }
  }

  const now = Date.now();
  const includeSuppressed = filters.includeSuppressed ?? false;

  const rows: AtRiskRow[] = [];
  for (const h of healthRows) {
    // Skip already-archived / canceled — those live on the Churned tab.
    if (h.status === "CANCELED" || h.status === "ARCHIVED") continue;
    // Skip clearly healthy.
    if (h.score >= 80 && h.status !== "PAST_DUE") continue;

    const suppressedUntil = suppressBy.get(h.tenantId) ?? null;
    if (!includeSuppressed && suppressedUntil && suppressedUntil.getTime() > now) continue;

    const reasons = computeReasonChips({
      healthRow: h,
      paymentFailures: paymentFailBy.get(h.tenantId) ?? 0,
      ticketsLast30d: ticketsBy.get(h.tenantId) ?? 0,
    });
    const predictedDays = predictedDaysForScore(h.score);

    rows.push({
      ...h,
      predictedDays,
      riskScore: riskScoreForHealth(h.score, h.status),
      topReasons: reasons,
      suppressedUntil,
      lastAttempt: lastAttemptBy.get(h.tenantId) ?? null,
    });
  }

  // Apply filters.
  const filtered = rows.filter((r) => {
    if (filters.window && r.predictedDays > filters.window) return false;
    if (filters.scoreMin != null && r.riskScore < filters.scoreMin) return false;
    if (filters.scoreMax != null && r.riskScore > filters.scoreMax) return false;
    if (filters.plan && r.plan !== filters.plan) return false;
    if (filters.reasonKey && !r.topReasons.some((c) => c.key === filters.reasonKey)) return false;
    return true;
  });

  // CSM filter via Tenant.accountManagerId (not on HealthRow shape).
  if (filters.csmId) {
    const csmAssign = new Map(
      (await db.tenant.findMany({
        where: { id: { in: filtered.map((r) => r.tenantId) } },
        select: { id: true, accountManagerId: true },
      })).map((t) => [t.id, t.accountManagerId]),
    );
    for (let i = filtered.length - 1; i >= 0; i -= 1) {
      if (csmAssign.get(filtered[i]!.tenantId) !== filters.csmId) filtered.splice(i, 1);
    }
  }

  filtered.sort((a, b) => b.riskScore - a.riskScore);

  const kpi = computeAtRiskKpi(filtered);
  return { rows: filtered, kpi };
}

function computeAtRiskKpi(rows: AtRiskRow[]): AtRiskKpi {
  let next30 = 0, next60 = 0, next90 = 0;
  let mrr = 0;
  for (const r of rows) {
    if (r.predictedDays <= 30) next30 += 1;
    if (r.predictedDays <= 60) next60 += 1;
    if (r.predictedDays <= 90) next90 += 1;
    mrr += r.mrr;
  }
  return { total: rows.length, next30d: next30, next60d: next60, next90d: next90, mrrAtRisk: mrr };
}

function computeReasonChips({
  healthRow,
  paymentFailures,
  ticketsLast30d,
}: {
  healthRow: HealthRow;
  paymentFailures: number;
  ticketsLast30d: number;
}): ReasonChip[] {
  const out: ReasonChip[] = [];
  const last = healthRow.lastActivityAt
    ? Math.floor((Date.now() - new Date(healthRow.lastActivityAt).getTime()) / DAY)
    : null;
  if (last != null && last >= 30) {
    out.push({
      key: "no_login_30d",
      label: `No login ${last}d`,
      severity: last >= 60 ? "high" : "medium",
    });
  }
  if (paymentFailures > 0) {
    out.push({
      key: "payment_failed",
      label: paymentFailures === 1 ? "Payment failed" : `Payment failed ${paymentFailures}×`,
      severity: paymentFailures >= 2 ? "high" : "medium",
    });
  }
  if (ticketsLast30d >= 3) {
    out.push({
      key: "high_tickets",
      label: `${ticketsLast30d} tickets in 30d`,
      severity: ticketsLast30d >= 6 ? "high" : "medium",
    });
  }
  if (healthRow.status === "PAST_DUE") {
    out.push({ key: "past_due", label: "Past due", severity: "high" });
  }
  if (healthRow.status === "SUSPENDED") {
    out.push({ key: "suspended", label: "Suspended", severity: "high" });
  }
  if (healthRow.score < 40) {
    out.push({ key: "score_critical", label: `Score ${healthRow.score}`, severity: "high" });
  } else if (healthRow.score < 60) {
    out.push({ key: "score_low", label: `Score ${healthRow.score}`, severity: "medium" });
  }
  // De-duplicate by key + cap to 4 chips so the row stays scannable.
  const seen = new Set<string>();
  return out.filter((c) => seen.has(c.key) ? false : (seen.add(c.key), true)).slice(0, 4);
}

/* ────────────────────────────────────────────────────────── */
/* Churned tab                                                 */
/* ────────────────────────────────────────────────────────── */

export interface ChurnedRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  mrrLost: number;
  reasonCode: ArchiveReasonCode | null;
  competitorName: string | null;
  cancelledAt: Date | null;
  archivedAt: Date | null;
  archiveReason: string | null;
  wonBackAt: Date | null;
  ownerEmail: string | null;
  isVoluntary: boolean; // false when admin force-archived
}

export interface ChurnedFilters {
  reasonCode?: ArchiveReasonCode;
  since?: Date;
  until?: Date;
  plan?: string;
}

export interface ChurnedKpi {
  total: number;
  mrrLost: number;
  voluntary: number;
  involuntary: number;
  wonBackPct: number;
  reasonBreakdown: { code: ArchiveReasonCode; label: string; count: number }[];
}

export const ARCHIVE_REASON_LABEL: Record<ArchiveReasonCode, string> = {
  NOT_A_FIT: "Not a fit",
  TOO_EXPENSIVE: "Price",
  MISSING_FEATURES: "Missing features",
  SWITCHED_TO_COMPETITOR: "Switched competitor",
  BUSINESS_CLOSED: "Business closed",
  TEMPORARY_PAUSE: "Temporary pause",
  TECHNICAL_ISSUES: "Bug / reliability",
  POOR_SUPPORT: "Poor support",
  DIFFICULT_TO_USE: "Difficult to use",
  ADMIN_DECISION: "Admin decision",
  OTHER: "Other",
};

export async function loadChurnedRows(filters: ChurnedFilters = {}): Promise<{
  rows: ChurnedRow[];
  kpi: ChurnedKpi;
}> {
  const where: Prisma.TenantWhereInput = {
    OR: [{ status: "CANCELED" }, { status: "ARCHIVED" }],
  };
  if (filters.reasonCode) where.archiveReasonCode = filters.reasonCode;
  if (filters.plan) where.plan = filters.plan as Prisma.TenantWhereInput["plan"];
  if (filters.since || filters.until) {
    const archivedAt: Prisma.DateTimeNullableFilter = {};
    if (filters.since) archivedAt.gte = filters.since;
    if (filters.until) archivedAt.lte = filters.until;
    where.archivedAt = archivedAt;
  }

  const tenants = await db.tenant.findMany({
    where,
    orderBy: { archivedAt: "desc" },
    select: {
      id: true, name: true, slug: true, plan: true, status: true,
      archivedAt: true, archiveReasonCode: true, archiveReason: true,
      archivedBy: true, archiveCompetitorName: true, wonBackAt: true,
      memberships: {
        where: { role: "OWNER" },
        select: { user: { select: { email: true } } },
        take: 1,
      },
    },
  });

  // MRR lookup via PricingPlan.
  const plans = await db.pricingPlan.findMany({
    select: { slug: true, priceMonthly: true },
  });
  const priceBy = new Map<string, number>();
  for (const p of plans) priceBy.set(p.slug.toUpperCase(), Number(p.priceMonthly ?? 0));

  const rows: ChurnedRow[] = tenants.map((t) => ({
    id: t.id, name: t.name, slug: t.slug, plan: t.plan,
    mrrLost: priceBy.get(t.plan) ?? 0,
    reasonCode: t.archiveReasonCode,
    competitorName: t.archiveCompetitorName,
    cancelledAt: t.archivedAt,
    archivedAt: t.archivedAt,
    archiveReason: t.archiveReason,
    wonBackAt: t.wonBackAt,
    ownerEmail: t.memberships[0]?.user?.email ?? null,
    // Heuristic: archivedBy === null means the tenant churned on
    // their own (cron auto-archive after cancel grace), set means
    // an admin pulled the trigger.
    isVoluntary: t.archivedBy == null,
  }));

  // KPI breakdown.
  const counts = new Map<ArchiveReasonCode, number>();
  let voluntary = 0;
  let mrrLost = 0;
  let wonBack = 0;
  for (const r of rows) {
    mrrLost += r.mrrLost;
    if (r.isVoluntary) voluntary += 1;
    if (r.wonBackAt) wonBack += 1;
    if (r.reasonCode) counts.set(r.reasonCode, (counts.get(r.reasonCode) ?? 0) + 1);
  }
  const reasonBreakdown: ChurnedKpi["reasonBreakdown"] = [];
  for (const [code, count] of counts) {
    reasonBreakdown.push({ code, label: ARCHIVE_REASON_LABEL[code], count });
  }
  reasonBreakdown.sort((a, b) => b.count - a.count);

  const kpi: ChurnedKpi = {
    total: rows.length,
    mrrLost,
    voluntary,
    involuntary: rows.length - voluntary,
    wonBackPct: rows.length === 0 ? 0 : Math.round((wonBack / rows.length) * 1000) / 10,
    reasonBreakdown,
  };
  return { rows, kpi };
}

/* ────────────────────────────────────────────────────────── */
/* Win-back campaigns                                          */
/* ────────────────────────────────────────────────────────── */

export interface WinbackCampaignRow {
  id: string;
  name: string;
  status: WinbackCampaignStatus;
  audienceSize: number;
  emailsSent: number;
  emailsOpened: number;
  replies: number;
  wonBackCount: number;
  startedAt: Date | null;
  endedAt: Date | null;
  emailSubject: string | null;
  emailBody: string | null;
  createdAt: Date;
  audienceFilter: Record<string, unknown> | null;
}

export async function loadWinbackCampaigns(): Promise<WinbackCampaignRow[]> {
  const rows = await db.winbackCampaign.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    audienceSize: r.audienceSize,
    emailsSent: r.emailsSent,
    emailsOpened: r.emailsOpened,
    replies: r.replies,
    wonBackCount: r.wonBackCount,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    emailSubject: r.emailSubject,
    emailBody: r.emailBody,
    createdAt: r.createdAt,
    audienceFilter: (r.audienceFilter ?? null) as Record<string, unknown> | null,
  }));
}

/** Compute today's audience size for a campaign filter. Used both
 *  when an admin previews "+ New campaign" and when the cron picks
 *  the campaign up. */
export async function computeWinbackAudience(
  filter: { reasonCodes?: ArchiveReasonCode[]; cancelledSinceDays?: number } | null,
): Promise<{ tenantIds: string[] }> {
  const where: Prisma.TenantWhereInput = {
    OR: [{ status: "CANCELED" }, { status: "ARCHIVED" }],
  };
  if (filter?.reasonCodes && filter.reasonCodes.length > 0) {
    where.archiveReasonCode = { in: filter.reasonCodes };
  }
  if (filter?.cancelledSinceDays && filter.cancelledSinceDays > 0) {
    where.archivedAt = { gte: new Date(Date.now() - filter.cancelledSinceDays * DAY) };
  }
  const rows = await db.tenant.findMany({ where, select: { id: true } });
  return { tenantIds: rows.map((r) => r.id) };
}
