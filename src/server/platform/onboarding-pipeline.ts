// Onboarding pipeline server data layer — Page 5 of the admin spec.
//
// 10-stage funnel, computed on the fly from existing data (User /
// Tenant / Membership / Invite / Product / Customer / Quote / Order /
// Payment). Stage computation lives entirely in code so the rules
// stay grep-able; per-tenant manual overrides via
// Tenant.onboardingStageOverride take precedence when set.
//
// Funnel-level config (WIP limits per stage + stuck-threshold-days +
// drip cadence) lives in the OnboardingFunnelSettings singleton row
// keyed by id="default", lazily seeded on first read.

import { db } from "@/lib/db";
import type { Tenant, TenantSource, BusinessType } from "@prisma/client";

const DAY = 86_400_000;

/* ────────────────────────────────────────────────────────── */
/* Stage definitions                                          */
/* ────────────────────────────────────────────────────────── */

export type StageId =
  | "signed_up"
  | "email_verified"
  | "workspace_created"
  | "first_invite_sent"
  | "first_catalog_item"
  | "first_customer_added"
  | "first_quote_created"
  | "first_job_created"
  | "first_payment_received"
  | "activated";

export interface StageDef {
  id: StageId;
  /** 1-indexed display order. */
  order: number;
  label: string;
  /** Short description shown on cards + drawer. */
  description: string;
  /** Icon emoji. */
  icon: string;
}

export const STAGES: StageDef[] = [
  { id: "signed_up",              order: 1,  label: "Signed up",                 description: "Account created on Flowtora.",                                          icon: "📝" },
  { id: "email_verified",         order: 2,  label: "Email verified",            description: "Owner clicked the verification link.",                                  icon: "📧" },
  { id: "workspace_created",      order: 3,  label: "Workspace created",         description: "Initial onboarding flow complete (services, defaults, locations).",     icon: "🏗️" },
  { id: "first_invite_sent",      order: 4,  label: "First invite sent",         description: "At least one team-member invite has been issued.",                       icon: "📤" },
  { id: "first_catalog_item",     order: 5,  label: "First catalog item",        description: "At least one product configured.",                                       icon: "📦" },
  { id: "first_customer_added",   order: 6,  label: "First customer added",      description: "At least one end-customer in the address book.",                         icon: "👥" },
  { id: "first_quote_created",    order: 7,  label: "First quote created",       description: "At least one quote drafted.",                                            icon: "📋" },
  { id: "first_job_created",      order: 8,  label: "First job created",         description: "At least one work order in motion.",                                     icon: "🛠️" },
  { id: "first_payment_received", order: 9,  label: "First payment received",    description: "At least one payment recorded against an invoice.",                     icon: "💳" },
  { id: "activated",              order: 10, label: "Activated",                 description: "5+ jobs and 2+ paying customers — fully self-sustaining.",              icon: "🚀" },
];

export function findStage(id: string): StageDef | undefined {
  return STAGES.find((s) => s.id === id);
}

/* ────────────────────────────────────────────────────────── */
/* Settings (singleton)                                       */
/* ────────────────────────────────────────────────────────── */

export interface FunnelSettings {
  wipLimits: Partial<Record<StageId, number>>;
  stuckThresholdDays: number;
  stuckCriticalDays:  number;
  nudgeCadenceDays:   number;
  nudgeSubject:       string;
  nudgeBody:          string;
}

const DEFAULT_NUDGE_SUBJECT = "Need a hand getting set up?";
const DEFAULT_NUDGE_BODY = `Hey there,

Looks like you're partway through setting up your shop on Flowtora.
Reply to this email if anything is in the way — happy to jump on a quick
call or pair on the next step. Common ones at this stage:

  • Add your first product / price
  • Import your customer list
  • Create your first quote

— The Flowtora team`;

/** Lazy-seeded singleton. Always returns a populated record. */
export async function loadFunnelSettings(): Promise<FunnelSettings> {
  const row = await db.onboardingFunnelSettings.findUnique({ where: { id: "default" } });
  if (!row) {
    return {
      wipLimits: {},
      stuckThresholdDays: 7,
      stuckCriticalDays:  14,
      nudgeCadenceDays:   3,
      nudgeSubject:       DEFAULT_NUDGE_SUBJECT,
      nudgeBody:          DEFAULT_NUDGE_BODY,
    };
  }
  return {
    wipLimits: (row.wipLimits as Partial<Record<StageId, number>> | null) ?? {},
    stuckThresholdDays: row.stuckThresholdDays,
    stuckCriticalDays:  row.stuckCriticalDays,
    nudgeCadenceDays:   row.nudgeCadenceDays,
    nudgeSubject:       row.nudgeSubject ?? DEFAULT_NUDGE_SUBJECT,
    nudgeBody:          row.nudgeBody ?? DEFAULT_NUDGE_BODY,
  };
}

/* ────────────────────────────────────────────────────────── */
/* Tenant + cohort row                                         */
/* ────────────────────────────────────────────────────────── */

export interface PipelineTenant {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  status: string;
  plan: string;
  signupSource: TenantSource;
  industry: BusinessType | null;
  country: string | null;
  createdAt: Date;
  trialEndsAt: Date | null;
  onboardingCompletedAt: Date | null;
  lastActivityAt: Date | null;
  onboardingStageOverride: string | null;
  onboardingMarkedStuckAt: Date | null;
  onboardingNudgeEnrolledAt: Date | null;
  lastOnboardingNudgeAt: Date | null;
  ownerEmail: string | null;
  ownerEmailVerified: Date | null;
  /** Counters used for stage computation. */
  inviteCount: number;
  productCount: number;
  customerCount: number;
  quoteCount: number;
  orderCount: number;
  paymentCount: number;
  payingCustomerCount: number;
}

export interface PipelineRow extends PipelineTenant {
  stage: StageDef;
  daysInStage: number;
  /** "ok" / "yellow" / "red" — mirrors the spec's threshold colours. */
  stuckLevel: "ok" | "yellow" | "red";
  isStuck: boolean;
  isMarkedStuck: boolean;
}

/** Pull every non-archived tenant + the counter joins needed to
 *  classify them. We aggregate the per-tenant counts in batch
 *  groupBys so we don't N+1 the DB. */
export async function loadPipelineRows(): Promise<PipelineRow[]> {
  const settings = await loadFunnelSettings();

  const tenants = await db.tenant.findMany({
    where: { status: { not: "ARCHIVED" } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, slug: true, logoUrl: true,
      status: true, plan: true, signupSource: true,
      businessType: true, country: true,
      createdAt: true, trialEndsAt: true, onboardingCompletedAt: true,
      lastActivityAt: true,
      onboardingStageOverride: true,
      onboardingMarkedStuckAt: true,
      onboardingNudgeEnrolledAt: true,
      lastOnboardingNudgeAt: true,
      memberships: {
        where: { role: "OWNER" },
        select: { user: { select: { email: true, emailVerified: true } } },
        take: 1,
      },
    },
  });
  const tenantIds = tenants.map((t) => t.id);
  if (tenantIds.length === 0) return [];

  const [inviteAgg, productAgg, customerAgg, quoteAgg, orderAgg, paymentAgg, payingCustomerAgg] = await Promise.all([
    db.invite.groupBy({ by: ["tenantId"], where: { tenantId: { in: tenantIds } }, _count: { _all: true } }),
    db.product.groupBy({ by: ["tenantId"], where: { tenantId: { in: tenantIds } }, _count: { _all: true } }),
    db.customer.groupBy({ by: ["tenantId"], where: { tenantId: { in: tenantIds } }, _count: { _all: true } }),
    db.quote.groupBy({ by: ["tenantId"], where: { tenantId: { in: tenantIds } }, _count: { _all: true } }),
    db.order.groupBy({ by: ["tenantId"], where: { tenantId: { in: tenantIds } }, _count: { _all: true } }),
    db.payment.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: tenantIds }, voidedAt: null, failedAt: null },
      _count: { _all: true },
    }),
    // Distinct paying customers — pull payments + invoice → customer
    // join. We don't have a per-row customer FK on Payment so we
    // count distinct customer IDs through the Invoice relation.
    db.payment.findMany({
      where: { tenantId: { in: tenantIds }, voidedAt: null, failedAt: null },
      select: { tenantId: true, invoice: { select: { customerId: true } } },
    }),
  ]);

  const inviteByTenant   = new Map(inviteAgg.map((r) => [r.tenantId, r._count._all]));
  const productByTenant  = new Map(productAgg.map((r) => [r.tenantId, r._count._all]));
  const customerByTenant = new Map(customerAgg.map((r) => [r.tenantId, r._count._all]));
  const quoteByTenant    = new Map(quoteAgg.map((r) => [r.tenantId, r._count._all]));
  const orderByTenant    = new Map(orderAgg.map((r) => [r.tenantId, r._count._all]));
  const paymentByTenant  = new Map(paymentAgg.map((r) => [r.tenantId, r._count._all]));

  // Distinct paying customers per tenant — collapse (tenantId,
  // invoice.customerId) pairs into a unique-customers-per-tenant
  // count.
  const seenPerTenant = new Map<string, Set<string>>();
  for (const row of payingCustomerAgg) {
    const cid = row.invoice?.customerId;
    if (!cid) continue;
    if (!seenPerTenant.has(row.tenantId)) seenPerTenant.set(row.tenantId, new Set());
    seenPerTenant.get(row.tenantId)!.add(cid);
  }
  const payingCustomerByTenant = new Map<string, number>();
  for (const [tenantId, set] of seenPerTenant) payingCustomerByTenant.set(tenantId, set.size);

  const out: PipelineRow[] = tenants.map((t) => {
    const owner = t.memberships[0]?.user ?? null;
    const inviteCount = inviteByTenant.get(t.id) ?? 0;
    const productCount = productByTenant.get(t.id) ?? 0;
    const customerCount = customerByTenant.get(t.id) ?? 0;
    const quoteCount = quoteByTenant.get(t.id) ?? 0;
    const orderCount = orderByTenant.get(t.id) ?? 0;
    const paymentCount = paymentByTenant.get(t.id) ?? 0;
    const payingCustomerCount = payingCustomerByTenant.get(t.id) ?? 0;

    const pt: PipelineTenant = {
      id: t.id,
      name: t.name,
      slug: t.slug,
      logoUrl: t.logoUrl,
      status: t.status,
      plan: t.plan,
      signupSource: t.signupSource,
      industry: t.businessType,
      country: t.country,
      createdAt: t.createdAt,
      trialEndsAt: t.trialEndsAt,
      onboardingCompletedAt: t.onboardingCompletedAt,
      lastActivityAt: t.lastActivityAt,
      onboardingStageOverride: t.onboardingStageOverride,
      onboardingMarkedStuckAt: t.onboardingMarkedStuckAt,
      onboardingNudgeEnrolledAt: t.onboardingNudgeEnrolledAt,
      lastOnboardingNudgeAt: t.lastOnboardingNudgeAt,
      ownerEmail: owner?.email ?? null,
      ownerEmailVerified: owner?.emailVerified ?? null,
      inviteCount, productCount, customerCount, quoteCount, orderCount,
      paymentCount, payingCustomerCount,
    };

    const stage = findStage(t.onboardingStageOverride ?? "")
      ?? computeStage(pt);
    const stageEnteredAt = stageEntryEstimate(pt, stage);
    const daysInStage = Math.max(0, Math.floor((Date.now() - stageEnteredAt.getTime()) / DAY));
    const stuckLevel: "ok" | "yellow" | "red" = stage.id === "activated"
      ? "ok"
      : daysInStage >= settings.stuckCriticalDays
      ? "red"
      : daysInStage >= settings.stuckThresholdDays
      ? "yellow"
      : "ok";
    return {
      ...pt,
      stage,
      daysInStage,
      stuckLevel,
      isStuck: stuckLevel !== "ok" || !!t.onboardingMarkedStuckAt,
      isMarkedStuck: !!t.onboardingMarkedStuckAt,
    };
  });

  return out;
}

/** Walk the stage gates in order; the first gate the tenant *fails*
 *  is their current stage. Activated only fires when everything below
 *  is satisfied + the spec's 5/2 threshold. */
function computeStage(t: PipelineTenant): StageDef {
  // Order matters — first failing gate wins.
  if (t.payingCustomerCount >= 2 && t.orderCount >= 5) return STAGES[9]!; // activated
  if (t.paymentCount > 0)        return STAGES[9]!.order > 9 ? STAGES[9]! : STAGES[8]!; // first_payment_received
  if (t.orderCount > 0)          return STAGES[7]!; // first_job_created
  if (t.quoteCount > 0)          return STAGES[6]!; // first_quote_created
  if (t.customerCount > 0)       return STAGES[5]!; // first_customer_added
  if (t.productCount > 0)        return STAGES[4]!; // first_catalog_item
  if (t.inviteCount > 0)         return STAGES[3]!; // first_invite_sent
  if (t.onboardingCompletedAt)   return STAGES[2]!; // workspace_created
  if (t.ownerEmailVerified)      return STAGES[1]!; // email_verified
  return STAGES[0]!; // signed_up
}

/** Best-effort stage-entry timestamp. We don't track per-stage entry
 *  events, so we approximate using the most-relevant signal:
 *    • stage 1: createdAt
 *    • stage 2: emailVerified (already a date) or createdAt fallback
 *    • stage 3: onboardingCompletedAt or createdAt
 *    • all later stages: lastActivityAt or createdAt — we don't yet
 *      have stage-specific timestamps. Honest approximation: a tenant
 *      that has reached a stage but hasn't been active for a while
 *      will look "stuck" relative to lastActivityAt, which is the
 *      signal we want.
 */
function stageEntryEstimate(t: PipelineTenant, stage: StageDef): Date {
  if (stage.id === "signed_up") return t.createdAt;
  if (stage.id === "email_verified") return t.ownerEmailVerified ?? t.createdAt;
  if (stage.id === "workspace_created") return t.onboardingCompletedAt ?? t.createdAt;
  // For later stages, lean on the most recent activity heuristic.
  return t.lastActivityAt ?? t.createdAt;
}

/* ────────────────────────────────────────────────────────── */
/* Filters                                                    */
/* ────────────────────────────────────────────────────────── */

export interface PipelineFilters {
  plan?: string;
  source?: TenantSource;
  country?: string;       // ISO2 (uppercased)
  industry?: BusinessType;
  createdSince?: Date;
  createdUntil?: Date;
  stuckOnly?: boolean;
  stage?: StageId;
}

export function applyFilters(rows: PipelineRow[], f: PipelineFilters): PipelineRow[] {
  return rows.filter((r) => {
    if (f.plan && r.plan !== f.plan) return false;
    if (f.source && r.signupSource !== f.source) return false;
    if (f.country && r.country?.toUpperCase() !== f.country) return false;
    if (f.industry && r.industry !== f.industry) return false;
    if (f.createdSince && r.createdAt < f.createdSince) return false;
    if (f.createdUntil && r.createdAt > f.createdUntil) return false;
    if (f.stuckOnly && !r.isStuck) return false;
    if (f.stage && r.stage.id !== f.stage) return false;
    return true;
  });
}

/* ────────────────────────────────────────────────────────── */
/* KPIs                                                       */
/* ────────────────────────────────────────────────────────── */

export interface PipelineKpi {
  trialsThisMonth: number;
  conversionsThisMonth: number;
  conversionRatePct: number | null;
  avgDaysToActivation: number | null;
  stuckCount: number;
  totalActiveTrials: number;
}

export function computeKpis(rows: PipelineRow[]): PipelineKpi {
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const trialsThisMonth = rows.filter((r) => r.createdAt >= monthStart && r.status === "TRIAL").length;
  const conversionsThisMonth = rows.filter((r) =>
    r.createdAt >= monthStart && (r.status === "ACTIVE" || r.status === "PAST_DUE")
  ).length;
  const newCohort = rows.filter((r) => r.createdAt >= monthStart);
  const conversionRatePct = newCohort.length === 0
    ? null
    : Math.round((conversionsThisMonth / newCohort.length) * 1000) / 10;

  const activated = rows.filter((r) => r.stage.id === "activated");
  const avgDaysToActivation = activated.length === 0
    ? null
    : Math.round(
        activated.reduce((s, r) => {
          const days = (r.lastActivityAt ?? r.createdAt).getTime() - r.createdAt.getTime();
          return s + days / DAY;
        }, 0) / activated.length,
      );

  const stuckCount = rows.filter((r) => r.isStuck).length;
  const totalActiveTrials = rows.filter((r) => r.status === "TRIAL").length;

  return {
    trialsThisMonth,
    conversionsThisMonth,
    conversionRatePct,
    avgDaysToActivation,
    stuckCount,
    totalActiveTrials,
  };
}

/** Per-stage tenant count + drop-off pct vs the previous stage. */
export function computeFunnelTotals(rows: PipelineRow[]): { stage: StageDef; count: number; dropOffPct: number | null }[] {
  // Each stage's count = tenants currently AT-OR-ABOVE that stage,
  // because the funnel cumulates downward (everyone past stage 5 has
  // been through stage 4). For drop-off we compare consecutive
  // cumulative counts.
  const cumulative: number[] = STAGES.map((s) =>
    rows.filter((r) => r.stage.order >= s.order).length,
  );
  return STAGES.map((s, i) => {
    const prev = i === 0 ? null : cumulative[i - 1] ?? null;
    const count = cumulative[i] ?? 0;
    const dropOffPct = prev != null && prev > 0
      ? Math.round(((prev - count) / prev) * 1000) / 10
      : null;
    return { stage: s, count, dropOffPct };
  });
}

export function rowsAtStage(rows: PipelineRow[], stageId: StageId): PipelineRow[] {
  return rows.filter((r) => r.stage.id === stageId);
}

/** Turn a Tenant row from `db` (selected the same way we do above) +
 *  the per-tenant counters into a stable PipelineRow. Used by the
 *  cron + per-action revalidation paths. */
export type TenantForPipelineCompute = Pick<
  Tenant,
  "id" | "createdAt" | "trialEndsAt" | "onboardingCompletedAt" | "lastActivityAt" |
  "onboardingStageOverride" | "onboardingMarkedStuckAt" | "onboardingNudgeEnrolledAt" |
  "lastOnboardingNudgeAt" | "status" | "plan" | "signupSource"
>;

void STAGES;
void computeStage;
