// Health-scoring server data layer — Page 6 of the admin spec.
//
// The factor catalogue lives in code (here) so factor definitions can
// evolve without schema migrations. Per-tenant numbers are computed
// at request time by `loadHealthRows()` — we don't persist sub-scores
// per request, only when the daily cron lands a TenantHealthSnapshot.
//
// All factor scores resolve to [0..100]. The overall score is a
// weighted average where the weights live on the active
// HealthScoringModel.weights row (a JSON map of {factorKey: weight}).
// Manual TenantHealthAdjustment rows are summed into a delta applied
// after the weighted sum, then clamped 0..100.

import { db } from "@/lib/db";
import type {
  Tenant,
  TenantStatus,
  HealthScoringModel,
} from "@prisma/client";

const DAY = 86_400_000;

/* ────────────────────────────────────────────────────────── */
/* Factor catalogue                                           */
/* ────────────────────────────────────────────────────────── */

export type HealthFactorKey =
  | "login_recency"
  | "feature_breadth"
  | "feature_depth"
  | "payment_health"
  | "nps"
  | "ticket_sentiment"
  | "ticket_volume"
  | "integration_count"
  | "mau_pct"
  | "jobs_growth"
  | "custom_sql";

export interface HealthFactor {
  key: HealthFactorKey;
  label: string;
  description: string;
  /** Default weight used when bootstrapping the first model. Sum
   *  across all factors should be 100. */
  defaultWeight: number;
  /** When true, the factor is honest-stub today — its score returns
   *  a neutral 50 because the upstream signal isn't yet collected.
   *  Surfaced in the editor so admins can set its weight to 0. */
  honestStub?: boolean;
}

/** The catalogue. Order matters — it's the display order in the
 *  scoring-model editor + Top-risk-factor tooltip. */
export const HEALTH_FACTORS: HealthFactor[] = [
  { key: "login_recency",     label: "Login recency",
    description: "Days since the most recent owner sign-in. Recent = healthier.",
    defaultWeight: 15 },
  { key: "feature_breadth",   label: "Feature adoption breadth",
    description: "Distinct surfaces the tenant has touched (quotes, jobs, invoices, customers, products).",
    defaultWeight: 10 },
  { key: "feature_depth",     label: "Feature adoption depth",
    description: "How many records exist within each adopted surface — proxy for sustained use.",
    defaultWeight: 10 },
  { key: "payment_health",    label: "Payment health",
    description: "Are subscription invoices paid on time? Past-due invoices crater this.",
    defaultWeight: 20 },
  { key: "nps",               label: "NPS / CSAT",
    description: "Most recent survey score, normalised to 0–100.",
    defaultWeight: 5 },
  { key: "ticket_sentiment",  label: "Ticket sentiment",
    description: "Recent support tickets' net sentiment.",
    defaultWeight: 5, honestStub: true },
  { key: "ticket_volume",     label: "Ticket volume",
    description: "Tickets opened in the last 30d. More tickets = lower score.",
    defaultWeight: 5 },
  { key: "integration_count", label: "Integration count",
    description: "How many integrations are wired up. Stickier = healthier.",
    defaultWeight: 5 },
  { key: "mau_pct",           label: "Monthly active users %",
    description: "Distinct users active in last 30d divided by total members.",
    defaultWeight: 10 },
  { key: "jobs_growth",       label: "Jobs growth",
    description: "Jobs created this month vs the prior month.",
    defaultWeight: 10 },
  { key: "custom_sql",        label: "Custom factor",
    description: "Reserved for a custom SQL factor admins can wire later.",
    defaultWeight: 5, honestStub: true },
];

const DEFAULT_WEIGHTS: Record<HealthFactorKey, number> = Object.fromEntries(
  HEALTH_FACTORS.map((f) => [f.key, f.defaultWeight]),
) as Record<HealthFactorKey, number>;

export function defaultWeights(): Record<HealthFactorKey, number> {
  return { ...DEFAULT_WEIGHTS };
}

/* ────────────────────────────────────────────────────────── */
/* Active / shadow model loading                              */
/* ────────────────────────────────────────────────────────── */

export interface ActiveModel {
  id: string;
  version: number;
  name: string;
  description: string | null;
  weights: Record<HealthFactorKey, number>;
  formula: string | null;
  createdAt: Date;
  isShadow: boolean;
}

export async function loadActiveModel(): Promise<ActiveModel | null> {
  const row = await db.healthScoringModel.findFirst({
    where: { isActive: true, archivedAt: null },
    orderBy: { version: "desc" },
  });
  return row ? toActive(row) : null;
}

export async function loadShadowModel(): Promise<ActiveModel | null> {
  const row = await db.healthScoringModel.findFirst({
    where: { isShadow: true, archivedAt: null },
    orderBy: { version: "desc" },
  });
  return row ? toActive(row) : null;
}

export async function loadModelHistory(): Promise<ActiveModel[]> {
  const rows = await db.healthScoringModel.findMany({
    orderBy: { version: "desc" },
    take: 50,
  });
  return rows.map(toActive);
}

function toActive(row: HealthScoringModel): ActiveModel {
  const weights: Record<HealthFactorKey, number> = { ...DEFAULT_WEIGHTS };
  const w = (row.weights ?? {}) as Partial<Record<HealthFactorKey, number>>;
  for (const k of Object.keys(weights) as HealthFactorKey[]) {
    if (typeof w[k] === "number") weights[k] = w[k]!;
  }
  return {
    id: row.id,
    version: row.version,
    name: row.name,
    description: row.description,
    weights,
    formula: row.formula,
    createdAt: row.createdAt,
    isShadow: row.isShadow,
  };
}

/** Returns the active model, lazily seeding the v1 default if no rows
 *  exist. Safe to call from any read path — write happens-once. */
export async function loadOrSeedActiveModel(): Promise<ActiveModel> {
  const existing = await loadActiveModel();
  if (existing) return existing;
  const seeded = await db.healthScoringModel.create({
    data: {
      version: 1,
      name: "v1 — default factor weights",
      description: "Auto-seeded default model. Weights sum to 100.",
      weights: DEFAULT_WEIGHTS as Record<string, number>,
      formula: HEALTH_FACTORS.map((f) => `${f.defaultWeight}% × ${f.label}`).join(" + "),
      isActive: true,
      isShadow: false,
      activatedAt: new Date(),
    },
  });
  return toActive(seeded);
}

/* ────────────────────────────────────────────────────────── */
/* Per-tenant compute                                         */
/* ────────────────────────────────────────────────────────── */

export interface HealthInputs {
  tenantId: string;
  status: TenantStatus;
  createdAt: Date;
  lastActivityAt: Date | null;
  // Counts gathered up-front in batched groupBys.
  membershipsCount: number;
  productsCount: number;
  customersCount: number;
  quotesCount: number;
  ordersThisMonth: number;
  ordersLastMonth: number;
  invoicesCount: number;
  pastDueInvoicesCount: number;
  pastDueDaysMax: number;
  ticketsLast30d: number;
  ticketsLast30dResolved: number;
  integrationsCount: number;
  mauLast30d: number;
  npsLatest: number | null; // 0..100 normalised; null = no surveys
  ownerLastLoginAt: Date | null;
}

export interface FactorScore {
  key: HealthFactorKey;
  score: number; // 0..100
}

export function computeFactorScores(input: HealthInputs): Record<HealthFactorKey, number> {
  const out: Record<HealthFactorKey, number> = {
    login_recency: 50, feature_breadth: 50, feature_depth: 50,
    payment_health: 50, nps: 50, ticket_sentiment: 50,
    ticket_volume: 50, integration_count: 50, mau_pct: 50,
    jobs_growth: 50, custom_sql: 50,
  };

  // login_recency — recent = high. 0d = 100, 60d+ = 0.
  if (input.ownerLastLoginAt) {
    const days = Math.max(0, (Date.now() - input.ownerLastLoginAt.getTime()) / DAY);
    out.login_recency = clamp(100 - days * (100 / 60));
  } else {
    out.login_recency = 0;
  }

  // feature_breadth — count of distinct adopted surfaces / 6.
  const adopted = [
    input.productsCount > 0,
    input.customersCount > 0,
    input.quotesCount > 0,
    input.ordersThisMonth + input.ordersLastMonth > 0,
    input.invoicesCount > 0,
    input.integrationsCount > 0,
  ].filter(Boolean).length;
  out.feature_breadth = clamp((adopted / 6) * 100);

  // feature_depth — log-scaled blend of records.
  const depthScore = (
    logScore(input.productsCount, 50) +
    logScore(input.customersCount, 200) +
    logScore(input.quotesCount, 100) +
    logScore(input.ordersThisMonth + input.ordersLastMonth, 50) +
    logScore(input.invoicesCount, 100)
  ) / 5;
  out.feature_depth = clamp(depthScore);

  // payment_health — 100 with no past-due, falls off w/ overdue days.
  if (input.invoicesCount === 0) {
    // Trial w/ no invoices — neutral.
    out.payment_health = 70;
  } else if (input.pastDueInvoicesCount === 0) {
    out.payment_health = 100;
  } else {
    const dayPenalty = Math.min(80, input.pastDueDaysMax * 2);
    out.payment_health = clamp(100 - dayPenalty - input.pastDueInvoicesCount * 5);
  }

  // nps — already normalised 0..100 (or null).
  out.nps = input.npsLatest == null ? 50 : clamp(input.npsLatest);

  // ticket_sentiment — honest stub (no sentiment column on SupportTicket).
  out.ticket_sentiment = 50;

  // ticket_volume — fewer tickets = better. 0 = 100, 10+ = 0.
  out.ticket_volume = clamp(100 - Math.min(100, input.ticketsLast30d * 10));

  // integration_count — 0 = 0, 5+ = 100.
  out.integration_count = clamp(Math.min(100, input.integrationsCount * 20));

  // mau_pct — % of members active in last 30d.
  if (input.membershipsCount === 0) out.mau_pct = 0;
  else out.mau_pct = clamp((input.mauLast30d / input.membershipsCount) * 100);

  // jobs_growth — 100 if month-over-month grew by 50%, 0 if shrunk.
  if (input.ordersLastMonth === 0 && input.ordersThisMonth === 0) {
    out.jobs_growth = 50;
  } else if (input.ordersLastMonth === 0) {
    out.jobs_growth = input.ordersThisMonth > 0 ? 100 : 50;
  } else {
    const ratio = input.ordersThisMonth / input.ordersLastMonth;
    // ratio 1.0 = 70, 1.5 = 100, 0.5 = 30, 0 = 0.
    out.jobs_growth = clamp(40 + (ratio - 1) * 60);
  }

  // custom_sql — honest stub.
  out.custom_sql = 50;

  return out;
}

/** Apply weights from a model to per-factor sub-scores. */
export function rollupScore(
  subscores: Record<HealthFactorKey, number>,
  weights: Record<HealthFactorKey, number>,
): number {
  let total = 0;
  let weightSum = 0;
  for (const key of Object.keys(subscores) as HealthFactorKey[]) {
    const w = weights[key] ?? 0;
    if (w <= 0) continue;
    total += subscores[key] * w;
    weightSum += w;
  }
  if (weightSum === 0) return 50;
  return Math.round(total / weightSum);
}

/** What fell down hardest in the score? (Used for the "Top risk
 *  factor" column.) Returns the factor with the largest weighted
 *  shortfall vs. 100. */
export function topRiskFactor(
  subscores: Record<HealthFactorKey, number>,
  weights: Record<HealthFactorKey, number>,
): HealthFactor | null {
  let worst: { factor: HealthFactor; weightedGap: number } | null = null;
  for (const f of HEALTH_FACTORS) {
    const w = weights[f.key] ?? 0;
    if (w <= 0) continue;
    const gap = (100 - (subscores[f.key] ?? 50)) * w;
    if (!worst || gap > worst.weightedGap) worst = { factor: f, weightedGap: gap };
  }
  return worst?.factor ?? null;
}

/* ────────────────────────────────────────────────────────── */
/* Aggregate row loader                                       */
/* ────────────────────────────────────────────────────────── */

export interface HealthRow {
  tenantId: string;
  tenantName: string;
  slug: string;
  status: TenantStatus;
  plan: string;
  mrr: number;
  csmName: string | null;
  csmEmail: string | null;
  ownerEmail: string | null;
  lastActivityAt: Date | null;

  /** Final score after model weights + adjustments, clamped 0..100. */
  score: number;
  /** Score from one week ago — null if no snapshot at that time. */
  prevWeekScore: number | null;
  /** Per-factor sub-scores so the modal can drill into the breakdown. */
  subscores: Record<HealthFactorKey, number>;
  /** Sum of active (non-expired) adjustments. */
  adjustmentDelta: number;
  /** Pre-adjustment weighted score — useful to show "raw vs. tuned". */
  rawScore: number;
  /** Top-risk factor key. Null if every factor scored 100. */
  topRisk: HealthFactor | null;
  /** Score with the shadow model's weights. Null if no shadow. */
  shadowScore: number | null;
}

export interface HealthRowsResult {
  rows: HealthRow[];
  active: ActiveModel;
  shadow: ActiveModel | null;
}

/** Load every non-archived tenant + their classifier inputs + score. */
export async function loadHealthRows(): Promise<HealthRowsResult> {
  const active = await loadOrSeedActiveModel();
  const shadow = await loadShadowModel();

  const tenants = await db.tenant.findMany({
    where: { status: { not: "ARCHIVED" } },
    select: {
      id: true, name: true, slug: true, status: true, plan: true,
      lastActivityAt: true, createdAt: true,
      accountManagerId: true,
      accountManager: { select: { id: true, name: true, email: true } },
      memberships: {
        where: { role: "OWNER" },
        select: {
          user: {
            select: {
              email: true,
              lastLoginAt: true,
            },
          },
        },
        take: 1,
      },
    },
  });

  if (tenants.length === 0) return { rows: [], active, shadow };
  const tenantIds = tenants.map((t) => t.id);
  const monthStart = startOfMonth(new Date());
  const monthAgo  = new Date(monthStart.getTime() - 35 * DAY);
  const lastMonthEnd = monthStart;
  const lastMonthStart = startOfMonth(monthAgo);
  const last30d = new Date(Date.now() - 30 * DAY);
  const oneWeekAgo = new Date(Date.now() - 7 * DAY);

  const [
    membershipAgg, productAgg, customerAgg, quoteAgg, invoiceAgg,
    ordersThisMonthAgg, ordersLastMonthAgg, ticketsLast30dAgg,
    integrationsAgg, mauAgg, npsLatest, pastDueInvoices, prevWeekSnaps,
    activeAdjustments, planPrices,
  ] = await Promise.all([
    db.membership.groupBy({ by: ["tenantId"], where: { tenantId: { in: tenantIds }, status: "ACTIVE" }, _count: { _all: true } }),
    db.product.groupBy({ by: ["tenantId"], where: { tenantId: { in: tenantIds } }, _count: { _all: true } }),
    db.customer.groupBy({ by: ["tenantId"], where: { tenantId: { in: tenantIds } }, _count: { _all: true } }),
    db.quote.groupBy({ by: ["tenantId"], where: { tenantId: { in: tenantIds } }, _count: { _all: true } }),
    db.invoice.groupBy({ by: ["tenantId"], where: { tenantId: { in: tenantIds } }, _count: { _all: true } }),
    db.order.groupBy({ by: ["tenantId"], where: { tenantId: { in: tenantIds }, createdAt: { gte: monthStart } }, _count: { _all: true } }),
    db.order.groupBy({ by: ["tenantId"], where: { tenantId: { in: tenantIds }, createdAt: { gte: lastMonthStart, lt: lastMonthEnd } }, _count: { _all: true } }),
    db.supportTicket.groupBy({ by: ["tenantId"], where: { tenantId: { in: tenantIds }, createdAt: { gte: last30d } }, _count: { _all: true } }),
    db.tenantIntegration.groupBy({ by: ["tenantId"], where: { tenantId: { in: tenantIds }, status: "CONNECTED" }, _count: { _all: true } }),
    // MAU proxy: members whose User.lastLoginAt is in the last 30d.
    // Sessions don't have a createdAt column (NextAuth v4 schema), so
    // lastLoginAt is the cleanest available signal. We collect all
    // memberships → user.lastLoginAt and roll up later.
    db.membership.findMany({
      where: {
        tenantId: { in: tenantIds },
        status: "ACTIVE",
        user: { lastLoginAt: { gte: last30d } },
      },
      select: { tenantId: true, userId: true },
    }),
    db.surveyResponse.findMany({
      where: { tenantId: { in: tenantIds } },
      orderBy: { createdAt: "desc" },
      select: { tenantId: true, score: true, survey: { select: { kind: true } } },
      take: 2_000,
    }),
    // Past-due platform invoices — there's no PAST_DUE status, so
    // we infer from `SENT` + dueAt before now (and not yet paid /
    // voided). Captured pre-aggregate so we can compute max-overdue
    // days per tenant for the steepness factor.
    db.platformBillingInvoice.findMany({
      where: {
        tenantId: { in: tenantIds },
        status: "SENT",
        dueAt: { lt: new Date() },
      },
      select: { tenantId: true, dueAt: true },
    }),
    db.tenantHealthSnapshot.findMany({
      where: { tenantId: { in: tenantIds }, computedAt: { lte: oneWeekAgo }, shadow: false },
      orderBy: { computedAt: "desc" },
      select: { tenantId: true, score: true, computedAt: true },
      take: 5_000,
    }),
    db.tenantHealthAdjustment.findMany({
      where: {
        tenantId: { in: tenantIds },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { tenantId: true, delta: true },
    }),
    // Plan price lookup: Tenant.plan stores the upper-cased slug, so
    // we key by slug.toUpperCase() and grab priceMonthly.
    db.pricingPlan.findMany({
      select: { slug: true, priceMonthly: true },
    }),
  ]);

  // Index helpers.
  const numFromCount = (rows: { tenantId: string; _count: { _all: number } }[]) =>
    new Map(rows.map((r) => [r.tenantId, r._count._all]));
  const membershipBy = numFromCount(membershipAgg);
  const productBy    = numFromCount(productAgg);
  const customerBy   = numFromCount(customerAgg);
  const quoteBy      = numFromCount(quoteAgg);
  const invoiceBy    = numFromCount(invoiceAgg);
  const ordersThisBy = numFromCount(ordersThisMonthAgg);
  const ordersLastBy = numFromCount(ordersLastMonthAgg);
  const ticketsBy    = numFromCount(ticketsLast30dAgg);
  const integrationsBy = numFromCount(integrationsAgg);

  // MAU — collapse the (tenantId, userId) pairs into a per-tenant
  // distinct-user count.
  const mauPerTenant = new Map<string, Set<string>>();
  for (const m of mauAgg) {
    if (!mauPerTenant.has(m.tenantId)) mauPerTenant.set(m.tenantId, new Set());
    mauPerTenant.get(m.tenantId)!.add(m.userId);
  }
  const mauBy = new Map<string, number>();
  for (const [k, v] of mauPerTenant) mauBy.set(k, v.size);

  // NPS — most recent NPS-kind response per tenant, normalised to 0..100.
  const npsByTenant = new Map<string, number>();
  for (const r of npsLatest) {
    if (!r.tenantId) continue;
    if (npsByTenant.has(r.tenantId)) continue; // first hit = most recent
    if (r.survey.kind === "NPS") {
      npsByTenant.set(r.tenantId, Math.round((r.score / 10) * 100));
    } else if (r.survey.kind === "CSAT") {
      npsByTenant.set(r.tenantId, Math.round((r.score / 5) * 100));
    } else if (r.survey.kind === "CES") {
      npsByTenant.set(r.tenantId, Math.round((r.score / 7) * 100));
    }
  }

  // Past-due invoices — collapse to count + max-overdue-days.
  type PastDueAgg = { count: number; maxDays: number };
  const pastDueBy = new Map<string, PastDueAgg>();
  const now = Date.now();
  for (const inv of pastDueInvoices) {
    const days = inv.dueAt ? Math.max(0, Math.floor((now - inv.dueAt.getTime()) / DAY)) : 0;
    const cur = pastDueBy.get(inv.tenantId) ?? { count: 0, maxDays: 0 };
    cur.count += 1;
    cur.maxDays = Math.max(cur.maxDays, days);
    pastDueBy.set(inv.tenantId, cur);
  }

  // Prev-week snapshot — keep first per tenant (we ordered desc by computedAt, so first = most recent within the lookback).
  const prevWeekBy = new Map<string, number>();
  for (const s of prevWeekSnaps) {
    if (!prevWeekBy.has(s.tenantId)) prevWeekBy.set(s.tenantId, s.score);
  }

  // Adjustments — sum per tenant.
  const adjustBy = new Map<string, number>();
  for (const a of activeAdjustments) {
    adjustBy.set(a.tenantId, (adjustBy.get(a.tenantId) ?? 0) + a.delta);
  }

  // Plan price lookup — Tenant.plan stores the upper-cased slug.
  const priceByCode = new Map<string, number>();
  for (const p of planPrices) {
    priceByCode.set(p.slug.toUpperCase(), p.priceMonthly == null ? 0 : Number(p.priceMonthly));
  }

  const rows: HealthRow[] = tenants.map((t) => {
    const owner = t.memberships[0]?.user ?? null;
    const inputs: HealthInputs = {
      tenantId: t.id,
      status: t.status,
      createdAt: t.createdAt,
      lastActivityAt: t.lastActivityAt,
      membershipsCount: membershipBy.get(t.id) ?? 0,
      productsCount: productBy.get(t.id) ?? 0,
      customersCount: customerBy.get(t.id) ?? 0,
      quotesCount: quoteBy.get(t.id) ?? 0,
      ordersThisMonth: ordersThisBy.get(t.id) ?? 0,
      ordersLastMonth: ordersLastBy.get(t.id) ?? 0,
      invoicesCount: invoiceBy.get(t.id) ?? 0,
      pastDueInvoicesCount: pastDueBy.get(t.id)?.count ?? 0,
      pastDueDaysMax: pastDueBy.get(t.id)?.maxDays ?? 0,
      ticketsLast30d: ticketsBy.get(t.id) ?? 0,
      ticketsLast30dResolved: 0, // not tracked separately yet
      integrationsCount: integrationsBy.get(t.id) ?? 0,
      mauLast30d: mauBy.get(t.id) ?? 0,
      npsLatest: npsByTenant.get(t.id) ?? null,
      ownerLastLoginAt: owner?.lastLoginAt ?? null,
    };
    const subscores = computeFactorScores(inputs);
    const rawScore = rollupScore(subscores, active.weights);
    const adjustmentDelta = adjustBy.get(t.id) ?? 0;
    const score = clamp(rawScore + adjustmentDelta);
    const prevWeekScore = prevWeekBy.get(t.id) ?? null;
    const topRisk = topRiskFactor(subscores, active.weights);
    const shadowScore = shadow ? clamp(rollupScore(subscores, shadow.weights) + adjustmentDelta) : null;

    return {
      tenantId: t.id,
      tenantName: t.name,
      slug: t.slug,
      status: t.status,
      plan: t.plan,
      mrr: priceByCode.get(t.plan) ?? 0,
      csmName: t.accountManager?.name ?? null,
      csmEmail: t.accountManager?.email ?? null,
      ownerEmail: owner?.email ?? null,
      lastActivityAt: t.lastActivityAt,
      score,
      prevWeekScore,
      subscores,
      adjustmentDelta,
      rawScore,
      topRisk,
      shadowScore,
    };
  });

  return { rows, active, shadow };
}

/* ────────────────────────────────────────────────────────── */
/* Aggregations: distribution, trend, heatmap                 */
/* ────────────────────────────────────────────────────────── */

export interface DistributionBin {
  rangeLabel: string;   // "0–9", "10–19", ... "90–100"
  rangeStart: number;
  rangeEnd: number;     // exclusive except for last
  count: number;
}

export function distributionBuckets(rows: HealthRow[]): DistributionBin[] {
  const bins: DistributionBin[] = [];
  for (let i = 0; i < 10; i += 1) {
    const start = i * 10;
    const end   = i === 9 ? 101 : (i + 1) * 10;
    bins.push({
      rangeLabel: i === 9 ? "90–100" : `${start}–${end - 1}`,
      rangeStart: start,
      rangeEnd: end,
      count: 0,
    });
  }
  for (const r of rows) {
    const idx = Math.min(9, Math.floor(r.score / 10));
    bins[idx]!.count += 1;
  }
  return bins;
}

export interface TrendPoint {
  dateIso: string;       // YYYY-MM-DD
  avgScore: number;
  count: number;
}

/** Per-day average score over the last `days` days. Reads
 *  TenantHealthSnapshot, so the chart only has data after the cron
 *  has run at least once. Empty days are skipped — the line just
 *  doesn't have a point there. */
export async function loadTrend(days: number): Promise<TrendPoint[]> {
  const since = new Date(Date.now() - days * DAY);
  const snaps = await db.tenantHealthSnapshot.findMany({
    where: { computedAt: { gte: since }, shadow: false },
    orderBy: { computedAt: "asc" },
    select: { computedAt: true, score: true },
    take: 50_000,
  });
  if (snaps.length === 0) return [];
  const byDay = new Map<string, { sum: number; n: number }>();
  for (const s of snaps) {
    const key = s.computedAt.toISOString().slice(0, 10);
    const cur = byDay.get(key) ?? { sum: 0, n: 0 };
    cur.sum += s.score;
    cur.n += 1;
    byDay.set(key, cur);
  }
  const out: TrendPoint[] = [];
  for (const [dateIso, { sum, n }] of byDay) {
    out.push({ dateIso, avgScore: Math.round(sum / n), count: n });
  }
  out.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
  return out;
}

export interface HeatmapCell {
  plan: string;
  rangeLabel: string;
  count: number;
}

export function heatmap(rows: HealthRow[]): { plans: string[]; cells: HeatmapCell[]; rangeLabels: string[] } {
  const plans = Array.from(new Set(rows.map((r) => r.plan))).sort();
  const ranges = ["0–19", "20–39", "40–59", "60–79", "80–100"];
  const cells: HeatmapCell[] = [];
  for (const plan of plans) {
    for (const range of ranges) {
      cells.push({ plan, rangeLabel: range, count: 0 });
    }
  }
  for (const r of rows) {
    const range =
      r.score < 20 ? ranges[0] :
      r.score < 40 ? ranges[1] :
      r.score < 60 ? ranges[2] :
      r.score < 80 ? ranges[3] :
                     ranges[4]!;
    const cell = cells.find((c) => c.plan === r.plan && c.rangeLabel === range);
    if (cell) cell.count += 1;
  }
  return { plans, cells, rangeLabels: ranges };
}

/* ────────────────────────────────────────────────────────── */
/* KPIs                                                        */
/* ────────────────────────────────────────────────────────── */

export interface HealthKpi {
  total: number;
  avgScore: number;
  healthyPct: number;   // >= 80
  atRiskPct: number;    // 50..79
  criticalPct: number;  // < 50
  modelVersionLabel: string;
}

export function computeKpis(rows: HealthRow[], active: ActiveModel): HealthKpi {
  const total = rows.length;
  if (total === 0) {
    return {
      total: 0, avgScore: 0, healthyPct: 0, atRiskPct: 0, criticalPct: 0,
      modelVersionLabel: `v${active.version}`,
    };
  }
  const sum = rows.reduce((a, r) => a + r.score, 0);
  const healthy = rows.filter((r) => r.score >= 80).length;
  const atRisk  = rows.filter((r) => r.score >= 50 && r.score < 80).length;
  const critical = total - healthy - atRisk;
  return {
    total,
    avgScore: Math.round(sum / total),
    healthyPct: Math.round((healthy / total) * 1000) / 10,
    atRiskPct: Math.round((atRisk / total) * 1000) / 10,
    criticalPct: Math.round((critical / total) * 1000) / 10,
    modelVersionLabel: `v${active.version}`,
  };
}

/* ────────────────────────────────────────────────────────── */
/* Filters                                                    */
/* ────────────────────────────────────────────────────────── */

export interface HealthFilters {
  q?: string;
  plan?: string;
  csmId?: string;
  scoreMin?: number;
  scoreMax?: number;
  trend?: "up" | "down" | "flat";
}

export function applyFilters(rows: HealthRow[], f: HealthFilters): HealthRow[] {
  return rows.filter((r) => {
    if (f.q) {
      const q = f.q.toLowerCase();
      if (!r.tenantName.toLowerCase().includes(q) &&
          !r.slug.toLowerCase().includes(q) &&
          !(r.ownerEmail?.toLowerCase().includes(q) ?? false)) return false;
    }
    if (f.plan && r.plan !== f.plan) return false;
    if (f.scoreMin != null && r.score < f.scoreMin) return false;
    if (f.scoreMax != null && r.score > f.scoreMax) return false;
    if (f.trend && r.prevWeekScore != null) {
      const delta = r.score - r.prevWeekScore;
      if (f.trend === "up" && delta <= 0) return false;
      if (f.trend === "down" && delta >= 0) return false;
      if (f.trend === "flat" && Math.abs(delta) > 2) return false;
    }
    return true;
  });
}

/* ────────────────────────────────────────────────────────── */
/* Helpers                                                     */
/* ────────────────────────────────────────────────────────── */

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function logScore(n: number, target: number): number {
  if (n <= 0) return 0;
  // Scale so that n == target → ~80, n >> target → 100.
  return Math.min(100, (Math.log10(1 + n) / Math.log10(1 + target)) * 80);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

// Re-export the Tenant alias so callers can stay loosely typed if
// they don't pass through a named import. Trips ESLint without it.
export type _UnusedTenant = Tenant;
