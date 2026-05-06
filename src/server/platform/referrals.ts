// Page 41 — Tenant-to-tenant Referral Program data layer.
//
// Surfaces:
//   - loadReferralSettings()   — singleton row, lazily created
//   - loadReferralKpis()       — strip across the top of the page
//   - loadTopReferrers()       — leaderboard
//   - loadReferralFunnel()     — clicked → signed up → trialed → paid
//   - loadFraudQueue()         — pending fraud reviews + history
//   - loadReferralTrend()      — daily signups + conversions for the chart

import { db } from "@/lib/db";
import type {
  TenantReferralStatus,
  TenantReferralFraudFlag,
  TenantReferralFraudResolution,
  ReferralRewardKind,
} from "@prisma/client";

const DAY = 86_400_000;
const PERIOD_DEFAULT_DAYS = 30;

/* ── Settings (singleton) ──────────────────────────────── */

export interface ReferralSettingsView {
  id: string;
  active: boolean;
  referrerRewardKind: ReferralRewardKind;
  referrerRewardCreditCents: number;
  referrerRewardFreeMonths: number;
  referrerRewardCashCents: number;
  refereeDiscountPct: number;
  refereeDiscountMonths: number;
  minimumSpendCents: number;
  attributionWindowDays: number;
  signupToPaidWindowDays: number;
  rewardHoldDays: number;
  updatedAt: Date;
}

export async function loadReferralSettings(): Promise<ReferralSettingsView> {
  const existing = await db.referralProgramSettings.findUnique({
    where: { id: "default" },
  });
  if (existing) return existing;

  // Lazy-create the singleton on first read so the editor renders even
  // on a brand-new database. We don't stamp `updatedById` because no
  // admin authored these defaults.
  const created = await db.referralProgramSettings.create({
    data: { id: "default" },
  });
  return created;
}

/* ── KPIs ──────────────────────────────────────────────── */

export interface ReferralKpis {
  /** Tenants with at least 1 conversion in the period. */
  activeReferrers: number;
  /** Total funnel rows created in the period (ie. clicks + signups). */
  referralsThisPeriod: number;
  /** Rows that hit PAID/REWARDED inside the period. */
  conversionsThisPeriod: number;
  /** conversionsThisPeriod ÷ rows that crossed at least SIGNED_UP. */
  conversionRate: number | null;
  /** Sum of `rewardAmountCents` on REWARDED rows in the period. */
  rewardsPaidCents: number;
  /** Avg lifetime spend across PAID/REWARDED referees, in minor units. */
  avgLtvCentsPerReferee: number | null;
  /** Window the KPI strip is computed against. */
  periodDays: number;
}

export async function loadReferralKpis(periodDays = PERIOD_DEFAULT_DAYS): Promise<ReferralKpis> {
  const since = new Date(Date.now() - periodDays * DAY);

  const [
    distinctReferrers,
    referralsThisPeriod,
    conversions,
    signupsCrossed,
    rewardsAgg,
    ltvAgg,
  ] = await Promise.all([
    db.tenantReferral.findMany({
      where: { status: { in: ["PAID", "REWARDED"] }, paidAt: { gte: since } },
      select: { referrerTenantId: true },
      distinct: ["referrerTenantId"],
    }),
    db.tenantReferral.count({ where: { createdAt: { gte: since } } }),
    db.tenantReferral.count({
      where: {
        OR: [
          { status: "PAID", paidAt: { gte: since } },
          { status: "REWARDED", rewardReleasedAt: { gte: since } },
        ],
      },
    }),
    db.tenantReferral.count({
      where: {
        signedUpAt: { gte: since },
        status: { not: "FRAUD" },
      },
    }),
    db.tenantReferral.aggregate({
      where: { status: "REWARDED", rewardReleasedAt: { gte: since } },
      _sum: { rewardAmountCents: true },
    }),
    db.tenantReferral.aggregate({
      where: { status: { in: ["PAID", "REWARDED"] }, paidAt: { gte: since } },
      _avg: { refereeSpendCents: true },
      _count: { _all: true },
    }),
  ]);

  return {
    activeReferrers: distinctReferrers.length,
    referralsThisPeriod,
    conversionsThisPeriod: conversions,
    conversionRate: signupsCrossed === 0 ? null : conversions / signupsCrossed,
    rewardsPaidCents: rewardsAgg._sum.rewardAmountCents ?? 0,
    avgLtvCentsPerReferee:
      ltvAgg._count._all === 0 ? null : ltvAgg._avg.refereeSpendCents ?? 0,
    periodDays,
  };
}

/* ── Top referrers leaderboard ────────────────────────── */

export interface TopReferrerRow {
  rank: number;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  code: string;
  referrals: number;     // signups attributed
  conversions: number;   // PAID + REWARDED
  earnedCents: number;
  clicks: number;
  conversionRate: number | null;
}

export async function loadTopReferrers(limit = 25): Promise<TopReferrerRow[]> {
  const codes = await db.tenantReferralCode.findMany({
    orderBy: [{ earnedCents: "desc" }, { conversions: "desc" }],
    take: limit,
    include: {
      tenant: { select: { id: true, name: true, slug: true } },
    },
  });
  return codes
    .filter((c) => c.signups > 0 || c.clicks > 0 || c.earnedCents > 0)
    .map((c, i) => ({
      rank: i + 1,
      tenantId: c.tenant.id,
      tenantName: c.tenant.name,
      tenantSlug: c.tenant.slug,
      code: c.code,
      referrals: c.signups,
      conversions: c.conversions,
      earnedCents: c.earnedCents,
      clicks: c.clicks,
      conversionRate: c.signups === 0 ? null : c.conversions / c.signups,
    }));
}

/* ── Funnel ────────────────────────────────────────────── */

export interface ReferralFunnelView {
  clicked: number;
  signedUp: number;
  trialed: number;
  paid: number;
  rewarded: number;
  /** Rows that lapsed without converting. */
  expired: number;
  /** Rows still under fraud review. */
  fraud: number;
  /** Drop-off % between adjacent stages, expressed as fraction (0–1). */
  dropClickToSignup: number | null;
  dropSignupToTrial: number | null;
  dropTrialToPaid: number | null;
  dropPaidToReward: number | null;
}

export async function loadReferralFunnel(periodDays = PERIOD_DEFAULT_DAYS): Promise<ReferralFunnelView> {
  const since = new Date(Date.now() - periodDays * DAY);
  // Clicked baseline = every row whose `clickedAt` is in window. Since
  // every funnel row has a click event by construction, `clickedAt`
  // always exists.
  const [
    clicked,
    signedUp,
    trialed,
    paid,
    rewarded,
    expired,
    fraud,
  ] = await Promise.all([
    db.tenantReferral.count({ where: { clickedAt: { gte: since } } }),
    db.tenantReferral.count({ where: { signedUpAt: { gte: since } } }),
    db.tenantReferral.count({ where: { trialedAt: { gte: since } } }),
    db.tenantReferral.count({ where: { paidAt: { gte: since } } }),
    db.tenantReferral.count({ where: { rewardReleasedAt: { gte: since } } }),
    db.tenantReferral.count({ where: { status: "EXPIRED", expiredAt: { gte: since } } }),
    db.tenantReferral.count({ where: { status: "FRAUD" } }),
  ]);

  const drop = (a: number, b: number): number | null =>
    a === 0 ? null : Math.max(0, (a - b) / a);

  return {
    clicked,
    signedUp,
    trialed,
    paid,
    rewarded,
    expired,
    fraud,
    dropClickToSignup: drop(clicked, signedUp),
    dropSignupToTrial: drop(signedUp, trialed),
    dropTrialToPaid: drop(trialed, paid),
    dropPaidToReward: drop(paid, rewarded),
  };
}

/* ── Fraud queue ──────────────────────────────────────── */

export interface FraudQueueRow {
  id: string;
  referrerTenantId: string;
  referrerName: string;
  refereeEmail: string | null;
  refereeName: string | null;
  refereeTenantId: string | null;
  flag: TenantReferralFraudFlag;
  flagReason: string | null;
  resolution: TenantReferralFraudResolution;
  flaggedAt: Date;
  reviewerNote: string | null;
  reviewedAt: Date | null;
  rewardAmountCents: number;
  ipHash: string | null;
  fingerprintHash: string | null;
  status: TenantReferralStatus;
}

export async function loadFraudQueue(): Promise<{
  pending: FraudQueueRow[];
  history: FraudQueueRow[];
}> {
  // Pull pending first (resolution null) by ordering nulls first; then
  // newest-first within each bucket. Prisma sorts NULLs last by default
  // on Postgres so we explicitly request `nulls: "first"` for resolution.
  const rows = await db.tenantReferral.findMany({
    where: { fraudFlag: { not: null } },
    orderBy: [{ fraudResolution: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
    take: 200,
    include: {
      referrer: { select: { name: true, slug: true } },
      referee: { select: { name: true, slug: true } },
    },
  });
  const mapped: FraudQueueRow[] = rows.map((r) => ({
    id: r.id,
    referrerTenantId: r.referrerTenantId,
    referrerName: r.referrer.name,
    refereeEmail: r.referredEmail,
    refereeName: r.referee?.name ?? null,
    refereeTenantId: r.referredTenantId,
    flag: r.fraudFlag!,
    flagReason: r.fraudReason,
    resolution: r.fraudResolution ?? "PENDING",
    flaggedAt: r.createdAt,
    reviewerNote: r.fraudReviewerNote,
    reviewedAt: r.fraudReviewedAt,
    rewardAmountCents: r.rewardAmountCents,
    ipHash: r.ipHash,
    fingerprintHash: r.fingerprintHash,
    status: r.status,
  }));
  return {
    pending: mapped.filter((r) => r.resolution === "PENDING"),
    history: mapped.filter((r) => r.resolution !== "PENDING"),
  };
}

/* ── Trend chart ──────────────────────────────────────── */

export interface ReferralTrendPoint {
  date: string;       // YYYY-MM-DD
  signups: number;
  conversions: number;
  fraudFlags: number;
}

export async function loadReferralTrend(periodDays = 30): Promise<ReferralTrendPoint[]> {
  const since = new Date(Date.now() - periodDays * DAY);
  const rows = await db.tenantReferral.findMany({
    where: {
      OR: [
        { signedUpAt: { gte: since } },
        { paidAt: { gte: since } },
        { createdAt: { gte: since }, fraudFlag: { not: null } },
      ],
    },
    select: {
      signedUpAt: true,
      paidAt: true,
      rewardReleasedAt: true,
      createdAt: true,
      fraudFlag: true,
    },
  });

  const day = (d: Date): string => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };
  const buckets = new Map<string, ReferralTrendPoint>();
  for (let i = 0; i < periodDays; i++) {
    const d = new Date(Date.now() - (periodDays - 1 - i) * DAY);
    const key = day(d);
    buckets.set(key, { date: key, signups: 0, conversions: 0, fraudFlags: 0 });
  }
  for (const r of rows) {
    if (r.signedUpAt && r.signedUpAt >= since) {
      const k = day(r.signedUpAt);
      const b = buckets.get(k);
      if (b) b.signups++;
    }
    if (r.paidAt && r.paidAt >= since) {
      const k = day(r.paidAt);
      const b = buckets.get(k);
      if (b) b.conversions++;
    }
    if (r.fraudFlag && r.createdAt >= since) {
      const k = day(r.createdAt);
      const b = buckets.get(k);
      if (b) b.fraudFlags++;
    }
  }
  return Array.from(buckets.values());
}

/* ── Helpers shared with the page + actions ──────────── */

/** Reward summary for the active settings — used in the editor preview
 *  and on the leaderboard tooltip.  */
export function summarizeReferrerReward(s: ReferralSettingsView): string {
  switch (s.referrerRewardKind) {
    case "CREDIT":
      return `$${(s.referrerRewardCreditCents / 100).toFixed(2)} account credit`;
    case "FREE_MONTHS":
      return `${s.referrerRewardFreeMonths} free month${s.referrerRewardFreeMonths === 1 ? "" : "s"}`;
    case "CASH":
      return `$${(s.referrerRewardCashCents / 100).toFixed(2)} cash payout`;
  }
}

export function summarizeRefereeReward(s: ReferralSettingsView): string {
  return `${s.refereeDiscountPct}% off the first ${s.refereeDiscountMonths} month${
    s.refereeDiscountMonths === 1 ? "" : "s"
  }`;
}

export function fraudFlagLabel(flag: TenantReferralFraudFlag): string {
  switch (flag) {
    case "SELF_REFERRAL":      return "Self-referral";
    case "SAME_IP":            return "Same IP";
    case "SAME_FINGERPRINT":   return "Device reused";
    case "BURST_SIGNUPS":      return "Burst signups";
    case "BLACKLISTED_DOMAIN": return "Blacklisted email domain";
    case "RAPID_CLICKS":       return "Rapid clicks";
    case "PAYMENT_REVERSED":   return "Payment reversed";
  }
}

export function rewardKindLabel(kind: ReferralRewardKind): string {
  switch (kind) {
    case "CREDIT":      return "Account credit";
    case "FREE_MONTHS": return "Free months";
    case "CASH":        return "Cash payout";
  }
}
