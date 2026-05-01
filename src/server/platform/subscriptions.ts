// Subscriptions data layer — Page 15.
//
// We don't model subscriptions as their own table — every tenant
// has at most one — so this loader treats the Tenant row as the
// subscription record. ARCHIVED tenants are excluded from the
// default list (they show up on Page 7 — Churned & At-Risk).

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type {
  BillingCycle,
  Plan,
  TenantStatus,
} from "@prisma/client";

const DAY = 86_400_000;

/* ────────────────────────────────────────────────────────── */
/* Filters + list                                             */
/* ────────────────────────────────────────────────────────── */

export type SubscriptionStatus =
  | "active" | "trialing" | "past_due" | "canceled" | "paused" | "incomplete";

export interface SubscriptionsFilters {
  q?: string;
  status?: SubscriptionStatus;
  plan?: string;
  cycle?: BillingCycle;
  currency?: string;
  createdSince?: Date;
  createdUntil?: Date;
  trialExpiringWithinDays?: number;
  cancellationScheduled?: boolean;
  hasDiscount?: boolean;
  ownerId?: string;
}

export interface SubscriptionRow {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  logoUrl: string | null;
  status: SubscriptionStatus;
  rawStatus: TenantStatus;
  plan: Plan;
  planName: string;
  cycle: BillingCycle;
  currency: string;
  mrr: number;
  startedAt: Date;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  cancelScheduledFor: Date | null;
  pausedUntil: Date | null;
  cancelReason: string | null;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  hasCoupon: boolean;
  ownerEmail: string | null;
  ownerName: string | null;
}

export interface SubscriptionsListResult {
  rows: SubscriptionRow[];
  total: number;
  filteredTotal: number;
}

/** Map TenantStatus + flags to a subscription-style status. */
function mapStatus(t: { status: TenantStatus; pausedUntil: Date | null }): SubscriptionStatus {
  if (t.pausedUntil && t.pausedUntil.getTime() > Date.now()) return "paused";
  switch (t.status) {
    case "ACTIVE":    return "active";
    case "TRIAL":     return "trialing";
    case "PAST_DUE":  return "past_due";
    case "CANCELED":  return "canceled";
    case "SUSPENDED": return "incomplete";
    default:          return "incomplete";
  }
}

export async function loadSubscriptionsList(args: {
  filters: SubscriptionsFilters;
  page: number;
  pageSize: number;
}): Promise<SubscriptionsListResult> {
  const { filters, page, pageSize } = args;

  const where: Prisma.TenantWhereInput = {
    status: { not: "ARCHIVED" },
  };

  if (filters.q) {
    const q = filters.q.trim();
    where.OR = [
      { id: q },
      { stripeSubscriptionId: q },
      { name: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
    ];
  }
  if (filters.plan) where.plan = filters.plan as Prisma.TenantWhereInput["plan"];
  if (filters.cycle) where.billingCycle = filters.cycle;
  if (filters.currency) where.currency = filters.currency;
  if (filters.ownerId) {
    where.memberships = { some: { role: "OWNER", userId: filters.ownerId } };
  }
  if (filters.cancellationScheduled === true) {
    where.OR = [
      ...(Array.isArray(where.OR) ? where.OR : []),
      { cancelAtPeriodEnd: true },
      { cancelScheduledFor: { not: null } },
    ];
  } else if (filters.cancellationScheduled === false) {
    where.cancelAtPeriodEnd = false;
    where.cancelScheduledFor = null;
  }
  if (filters.hasDiscount === true) where.activeCouponId = { not: null };
  if (filters.hasDiscount === false) where.activeCouponId = null;
  if (filters.trialExpiringWithinDays != null && filters.trialExpiringWithinDays > 0) {
    where.status = "TRIAL";
    where.trialEndsAt = {
      lte: new Date(Date.now() + filters.trialExpiringWithinDays * DAY),
      gte: new Date(),
    };
  }
  if (filters.createdSince || filters.createdUntil) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (filters.createdSince) createdAt.gte = filters.createdSince;
    if (filters.createdUntil) createdAt.lte = filters.createdUntil;
    where.createdAt = createdAt;
  }

  // Status filter is post-aggregate when "paused" because it depends
  // on the live `pausedUntil` comparison. For the simple cases we
  // map onto TenantStatus directly.
  if (filters.status) {
    if (filters.status === "paused") {
      where.pausedUntil = { gt: new Date() };
    } else {
      const target = filters.status === "active" ? "ACTIVE"
                  : filters.status === "trialing" ? "TRIAL"
                  : filters.status === "past_due" ? "PAST_DUE"
                  : filters.status === "canceled" ? "CANCELED"
                  : "SUSPENDED";
      where.status = target;
      // Active filter excludes paused.
      if (filters.status === "active") {
        where.AND = [
          ...(Array.isArray(where.AND) ? where.AND : []),
          { OR: [{ pausedUntil: null }, { pausedUntil: { lte: new Date() } }] },
        ];
      }
    }
  }

  const [total, filteredTotal, rows] = await Promise.all([
    db.tenant.count({ where: { status: { not: "ARCHIVED" } } }),
    db.tenant.count({ where }),
    db.tenant.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, name: true, slug: true, status: true, plan: true,
        billingCycle: true, currency: true,
        currentPeriodStart: true, currentPeriodEnd: true,
        cancelAtPeriodEnd: true, cancelScheduledFor: true,
        pausedUntil: true, cancelReason: true,
        trialEndsAt: true, createdAt: true,
        stripeSubscriptionId: true, stripeCustomerId: true,
        activeCouponId: true,
        logoUrl: true,
        memberships: {
          where: { role: "OWNER" },
          select: { user: { select: { name: true, email: true } } },
          take: 1,
        },
      },
    }),
  ]);

  // Plan price lookup.
  const plans = await db.pricingPlan.findMany({
    select: { slug: true, name: true, priceMonthly: true, priceAnnual: true },
  });
  const planByCode = new Map<string, { name: string; priceMonthly: number; priceAnnual: number }>();
  for (const p of plans) {
    planByCode.set(p.slug.toUpperCase(), {
      name: p.name,
      priceMonthly: Number(p.priceMonthly ?? 0),
      priceAnnual: Number(p.priceAnnual ?? 0),
    });
  }

  const mapped: SubscriptionRow[] = rows.map((t) => {
    const planRow = planByCode.get(t.plan);
    const mrr = t.billingCycle === "ANNUAL"
      ? Math.round((planRow?.priceAnnual ?? 0) / 12)
      : Math.round(planRow?.priceMonthly ?? 0);
    return {
      id: t.id, tenantId: t.id, tenantName: t.name, tenantSlug: t.slug, logoUrl: t.logoUrl,
      status: mapStatus({ status: t.status, pausedUntil: t.pausedUntil }),
      rawStatus: t.status,
      plan: t.plan, planName: planRow?.name ?? t.plan,
      cycle: t.billingCycle, currency: t.currency,
      mrr,
      startedAt: t.createdAt,
      trialEndsAt: t.trialEndsAt,
      currentPeriodEnd: t.currentPeriodEnd,
      cancelAtPeriodEnd: t.cancelAtPeriodEnd,
      cancelScheduledFor: t.cancelScheduledFor,
      pausedUntil: t.pausedUntil,
      cancelReason: t.cancelReason,
      stripeSubscriptionId: t.stripeSubscriptionId,
      stripeCustomerId: t.stripeCustomerId,
      hasCoupon: !!t.activeCouponId,
      ownerEmail: t.memberships[0]?.user?.email ?? null,
      ownerName: t.memberships[0]?.user?.name ?? null,
    };
  });

  return { rows: mapped, total, filteredTotal };
}

/* ────────────────────────────────────────────────────────── */
/* KPIs                                                        */
/* ────────────────────────────────────────────────────────── */

export interface SubscriptionsKpi {
  active: number;
  trialing: number;
  pastDue: number;
  mrr: number;
  avgAgeDays: number | null;
  newThisPeriod: number;
}

export async function loadSubscriptionsKpi(periodDays = 30): Promise<SubscriptionsKpi> {
  const periodStart = new Date(Date.now() - periodDays * DAY);
  const [byStatus, recents, paidTenants, plans] = await Promise.all([
    db.tenant.groupBy({
      by: ["status"],
      where: { status: { not: "ARCHIVED" } },
      _count: { _all: true },
    }),
    db.tenant.findMany({
      where: { status: { not: "ARCHIVED" }, createdAt: { gte: periodStart } },
      select: { id: true },
    }),
    db.tenant.findMany({
      where: {
        status: { in: ["ACTIVE", "PAST_DUE"] },
        OR: [{ pausedUntil: null }, { pausedUntil: { lte: new Date() } }],
      },
      select: { plan: true, billingCycle: true, createdAt: true },
    }),
    db.pricingPlan.findMany({
      select: { slug: true, priceMonthly: true, priceAnnual: true },
    }),
  ]);
  const active = byStatus.find((s) => s.status === "ACTIVE")?._count._all ?? 0;
  const trialing = byStatus.find((s) => s.status === "TRIAL")?._count._all ?? 0;
  const pastDue = byStatus.find((s) => s.status === "PAST_DUE")?._count._all ?? 0;

  const planByCode = new Map<string, { priceMonthly: number; priceAnnual: number }>();
  for (const p of plans) {
    planByCode.set(p.slug.toUpperCase(), {
      priceMonthly: Number(p.priceMonthly ?? 0),
      priceAnnual: Number(p.priceAnnual ?? 0),
    });
  }
  let mrr = 0;
  let totalAgeDays = 0;
  for (const t of paidTenants) {
    const planRow = planByCode.get(t.plan);
    const monthly = t.billingCycle === "ANNUAL"
      ? (planRow?.priceAnnual ?? 0) / 12
      : (planRow?.priceMonthly ?? 0);
    mrr += monthly;
    totalAgeDays += Math.max(0, (Date.now() - t.createdAt.getTime()) / DAY);
  }
  const avgAgeDays = paidTenants.length === 0 ? null : Math.round(totalAgeDays / paidTenants.length);

  return {
    active, trialing, pastDue,
    mrr: Math.round(mrr),
    avgAgeDays,
    newThisPeriod: recents.length,
  };
}

/* ────────────────────────────────────────────────────────── */
/* Detail loader                                              */
/* ────────────────────────────────────────────────────────── */

export interface SubscriptionDetail extends SubscriptionRow {
  tenantPlanCode: Plan;
  tenantStatus: TenantStatus;
  /** Recent SubscriptionEvent rows (for the Activity tab). */
  events: {
    id: string;
    type: string;
    fromPlan: Plan | null;
    toPlan: Plan | null;
    mrrDelta: number;
    source: string;
    occurredAt: Date;
    reason: string | null;
  }[];
  /** Recent platform-billing invoices (last 12). */
  invoices: {
    id: string;
    number: string;
    status: string;
    total: number;
    currency: string;
    issuedAt: Date | null;
    dueAt: Date | null;
    paidAt: Date | null;
  }[];
  coupon: {
    id: string;
    code: string;
    discountType: string;
    amount: number;
    currency: string | null;
  } | null;
}

export async function loadSubscriptionDetail(tenantId: string): Promise<SubscriptionDetail | null> {
  const t = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true, name: true, slug: true, status: true, plan: true,
      billingCycle: true, currency: true,
      currentPeriodStart: true, currentPeriodEnd: true,
      cancelAtPeriodEnd: true, cancelScheduledFor: true,
      pausedUntil: true, cancelReason: true,
      trialEndsAt: true, createdAt: true,
      stripeSubscriptionId: true, stripeCustomerId: true,
      logoUrl: true,
      activeCoupon: { select: { id: true, code: true, discountType: true, amount: true, currency: true } },
      memberships: {
        where: { role: "OWNER" },
        select: { user: { select: { name: true, email: true } } },
        take: 1,
      },
    },
  });
  if (!t) return null;

  const [events, invoices, plans] = await Promise.all([
    db.subscriptionEvent.findMany({
      where: { tenantId },
      orderBy: { occurredAt: "desc" },
      take: 50,
    }),
    db.platformBillingInvoice.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true, number: true, status: true, total: true, currency: true,
        issuedAt: true, dueAt: true, paidAt: true,
      },
    }),
    db.pricingPlan.findMany({
      select: { slug: true, name: true, priceMonthly: true, priceAnnual: true },
    }),
  ]);
  const planByCode = new Map<string, { name: string; priceMonthly: number; priceAnnual: number }>();
  for (const p of plans) {
    planByCode.set(p.slug.toUpperCase(), {
      name: p.name,
      priceMonthly: Number(p.priceMonthly ?? 0),
      priceAnnual: Number(p.priceAnnual ?? 0),
    });
  }
  const planRow = planByCode.get(t.plan);
  const mrr = t.billingCycle === "ANNUAL"
    ? Math.round((planRow?.priceAnnual ?? 0) / 12)
    : Math.round(planRow?.priceMonthly ?? 0);

  return {
    id: t.id, tenantId: t.id, tenantName: t.name, tenantSlug: t.slug, logoUrl: t.logoUrl,
    status: mapStatus({ status: t.status, pausedUntil: t.pausedUntil }),
    rawStatus: t.status,
    tenantStatus: t.status,
    plan: t.plan,
    tenantPlanCode: t.plan,
    planName: planRow?.name ?? t.plan,
    cycle: t.billingCycle, currency: t.currency,
    mrr,
    startedAt: t.createdAt,
    trialEndsAt: t.trialEndsAt,
    currentPeriodEnd: t.currentPeriodEnd,
    cancelAtPeriodEnd: t.cancelAtPeriodEnd,
    cancelScheduledFor: t.cancelScheduledFor,
    pausedUntil: t.pausedUntil,
    cancelReason: t.cancelReason,
    stripeSubscriptionId: t.stripeSubscriptionId,
    stripeCustomerId: t.stripeCustomerId,
    hasCoupon: !!t.activeCoupon,
    ownerEmail: t.memberships[0]?.user?.email ?? null,
    ownerName: t.memberships[0]?.user?.name ?? null,
    events: events.map((e) => ({
      id: e.id, type: e.type, fromPlan: e.fromPlan, toPlan: e.toPlan,
      mrrDelta: Number(e.mrrDelta),
      source: e.source, occurredAt: e.occurredAt, reason: e.reason,
    })),
    invoices: invoices.map((i) => ({
      id: i.id, number: i.number, status: i.status, total: i.total,
      currency: i.currency, issuedAt: i.issuedAt, dueAt: i.dueAt, paidAt: i.paidAt,
    })),
    coupon: t.activeCoupon ? {
      id: t.activeCoupon.id, code: t.activeCoupon.code,
      discountType: t.activeCoupon.discountType,
      amount: t.activeCoupon.amount,
      currency: t.activeCoupon.currency,
    } : null,
  };
}

/* ────────────────────────────────────────────────────────── */
/* Proration preview                                          */
/* ────────────────────────────────────────────────────────── */

export interface ProrationPreview {
  fromPlan: string;
  toPlan: string;
  fromMonthly: number;
  toMonthly: number;
  /** Rough credit for the unused portion of the current period. */
  unusedCredit: number;
  /** Charge for the new plan from now to currentPeriodEnd. */
  newPeriodCharge: number;
  /** Net charge today — newPeriodCharge minus unusedCredit. */
  netChargeToday: number;
}

export async function loadProrationPreview(args: {
  tenantId: string;
  toPlan: string;
}): Promise<ProrationPreview | null> {
  const t = await db.tenant.findUnique({
    where: { id: args.tenantId },
    select: { plan: true, billingCycle: true, currentPeriodEnd: true, currentPeriodStart: true },
  });
  if (!t) return null;
  const plans = await db.pricingPlan.findMany({
    where: { slug: { in: [t.plan.toLowerCase(), args.toPlan.toLowerCase()] } },
    select: { slug: true, priceMonthly: true, priceAnnual: true },
  });
  const fromMonthly = Number(plans.find((p) => p.slug.toUpperCase() === t.plan)?.priceMonthly ?? 0);
  const toMonthly = Number(plans.find((p) => p.slug.toUpperCase() === args.toPlan.toUpperCase())?.priceMonthly ?? 0);
  const periodStart = t.currentPeriodStart ?? new Date();
  const periodEnd = t.currentPeriodEnd ?? new Date(periodStart.getTime() + 30 * DAY);
  const periodMs = Math.max(1, periodEnd.getTime() - periodStart.getTime());
  const remainingMs = Math.max(0, periodEnd.getTime() - Date.now());
  const remainingFraction = remainingMs / periodMs;

  const unusedCredit = Math.round(fromMonthly * remainingFraction);
  const newPeriodCharge = Math.round(toMonthly * remainingFraction);
  const netChargeToday = newPeriodCharge - unusedCredit;

  return {
    fromPlan: t.plan,
    toPlan: args.toPlan.toUpperCase(),
    fromMonthly, toMonthly,
    unusedCredit, newPeriodCharge, netChargeToday,
  };
}

/* ────────────────────────────────────────────────────────── */
/* Filter dropdown options                                     */
/* ────────────────────────────────────────────────────────── */

export interface SubscriptionsFilterOptions {
  plans: { slug: string; name: string }[];
  currencies: string[];
  owners: { id: string; label: string }[];
  coupons: { id: string; code: string }[];
}

export async function loadFilterOptions(): Promise<SubscriptionsFilterOptions> {
  const [plans, currencies, owners, coupons] = await Promise.all([
    db.pricingPlan.findMany({
      where: { status: { not: "ARCHIVED" } },
      orderBy: { sortOrder: "asc" },
      select: { slug: true, name: true },
    }),
    db.tenant.findMany({
      where: { status: { not: "ARCHIVED" } },
      select: { currency: true },
      distinct: ["currency"],
    }),
    db.user.findMany({
      where: { memberships: { some: { role: "OWNER" } } },
      orderBy: { email: "asc" },
      select: { id: true, name: true, email: true },
      take: 500,
    }),
    db.coupon.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, code: true },
      take: 100,
    }),
  ]);
  return {
    plans: plans.map((p) => ({ slug: p.slug.toUpperCase(), name: p.name })),
    currencies: currencies.map((c) => c.currency).sort(),
    owners: owners.map((u) => ({ id: u.id, label: u.name?.trim() || u.email })),
    coupons,
  };
}
