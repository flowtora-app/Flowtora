// Subscription event log — write helpers.
//
// Every meaningful change to a tenant's plan goes through one of the
// helpers in this file so we get a single, consistent place to:
//   1. compute `mrrDelta` from the plan-price snapshot
//   2. resolve the canonical `toPlan` price from the PricingPlan table
//   3. choose the right SubscriptionEventType
//
// Callers do not write `db.subscriptionEvent.create()` directly. If
// you find yourself reaching for that, add a helper here instead so
// future invariants (e.g. emitting to Slack on big downgrades) only
// need to be added in one place.

import type { Plan, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { getAllPlans } from "@/lib/plans";

// We accept either the global `db` client or a transaction client so
// callers inside a `db.$transaction` can write events atomically with
// the Tenant update.
type DbLike = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export interface SubscriptionEventWriteCommon {
  tenantId: string;
  source?: "STRIPE" | "MANUAL" | "SYSTEM" | "BACKFILL";
  actorUserId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  occurredAt?: Date;
}

let cachedPriceByPlan: Map<Plan, number> | null = null;

async function priceByPlan(client: DbLike): Promise<Map<Plan, number>> {
  if (cachedPriceByPlan) return cachedPriceByPlan;
  // getAllPlans hits the global `db` directly — fine, the price catalog
  // is small (~5 rows) and only changes when staff edit pricing plans.
  void client;
  const plans = await getAllPlans();
  const m = new Map<Plan, number>();
  for (const p of plans) m.set(p.slug.toUpperCase() as Plan, p.priceMonthly ?? 0);
  cachedPriceByPlan = m;
  return m;
}

/** Reset the in-memory plan-price cache. Call after the platform
 *  edits a pricing plan so subsequent events use the new price. */
export function invalidatePlanPriceCache(): void {
  cachedPriceByPlan = null;
}

/** Tenant just signed up. Writes a CREATED event with mrrDelta =
 *  +planPrice (or +0 for trial). */
export async function recordTenantCreated(
  args: SubscriptionEventWriteCommon & { plan: Plan; client?: DbLike; isTrial?: boolean },
): Promise<void> {
  const client = args.client ?? db;
  const prices = await priceByPlan(client);
  const price = prices.get(args.plan) ?? 0;
  // Trials don't contribute to MRR — we record the event with $0 so
  // the trial→paid moment shows up later as a separate UPGRADED-style
  // event when status flips to ACTIVE.
  const mrrDelta = args.isTrial ? 0 : price;
  await client.subscriptionEvent.create({
    data: {
      tenantId: args.tenantId,
      type: "CREATED",
      fromPlan: null,
      toPlan: args.plan,
      fromPriceMonthly: null,
      toPriceMonthly: args.isTrial ? 0 : price,
      mrrDelta,
      source: args.source ?? "MANUAL",
      actorUserId: args.actorUserId ?? null,
      reason: args.reason ?? null,
      metadata: (args.metadata ?? null) as never,
      occurredAt: args.occurredAt ?? new Date(),
    },
  });
}

/** Plan changed from one paid tier to another. Picks UPGRADED vs
 *  DOWNGRADED based on price delta. */
export async function recordTenantPlanChanged(
  args: SubscriptionEventWriteCommon & { fromPlan: Plan; toPlan: Plan; client?: DbLike },
): Promise<void> {
  const client = args.client ?? db;
  const prices = await priceByPlan(client);
  const from = prices.get(args.fromPlan) ?? 0;
  const to   = prices.get(args.toPlan) ?? 0;
  const mrrDelta = to - from;
  const type: "UPGRADED" | "DOWNGRADED" =
    mrrDelta >= 0 ? "UPGRADED" : "DOWNGRADED";
  await client.subscriptionEvent.create({
    data: {
      tenantId: args.tenantId,
      type,
      fromPlan: args.fromPlan,
      toPlan: args.toPlan,
      fromPriceMonthly: from,
      toPriceMonthly: to,
      mrrDelta,
      source: args.source ?? "MANUAL",
      actorUserId: args.actorUserId ?? null,
      reason: args.reason ?? null,
      metadata: (args.metadata ?? null) as never,
      occurredAt: args.occurredAt ?? new Date(),
    },
  });
}

/** Tenant cancelled / archived. Writes a CANCELED event with
 *  mrrDelta = -lastPaidPrice. */
export async function recordTenantCanceled(
  args: SubscriptionEventWriteCommon & { lastPlan: Plan; client?: DbLike },
): Promise<void> {
  const client = args.client ?? db;
  const prices = await priceByPlan(client);
  const lastPrice = prices.get(args.lastPlan) ?? 0;
  await client.subscriptionEvent.create({
    data: {
      tenantId: args.tenantId,
      type: "CANCELED",
      fromPlan: args.lastPlan,
      toPlan: null,
      fromPriceMonthly: lastPrice,
      toPriceMonthly: null,
      mrrDelta: -lastPrice,
      source: args.source ?? "SYSTEM",
      actorUserId: args.actorUserId ?? null,
      reason: args.reason ?? null,
      metadata: (args.metadata ?? null) as never,
      occurredAt: args.occurredAt ?? new Date(),
    },
  });
}

/** Cancelled tenant comes back. Writes a REACTIVATED event with
 *  mrrDelta = +newPlanPrice. */
export async function recordTenantReactivated(
  args: SubscriptionEventWriteCommon & { plan: Plan; client?: DbLike },
): Promise<void> {
  const client = args.client ?? db;
  const prices = await priceByPlan(client);
  const price = prices.get(args.plan) ?? 0;
  await client.subscriptionEvent.create({
    data: {
      tenantId: args.tenantId,
      type: "REACTIVATED",
      fromPlan: null,
      toPlan: args.plan,
      fromPriceMonthly: null,
      toPriceMonthly: price,
      mrrDelta: price,
      source: args.source ?? "MANUAL",
      actorUserId: args.actorUserId ?? null,
      reason: args.reason ?? null,
      metadata: (args.metadata ?? null) as never,
      occurredAt: args.occurredAt ?? new Date(),
    },
  });
}
