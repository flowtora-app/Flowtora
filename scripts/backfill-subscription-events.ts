/* Backfill SubscriptionEvent rows for tenants that already exist.
 *
 * The event log only starts collecting fresh data once the writes in
 * src/app/actions/auth.ts, src/app/actions/platform.ts, and the
 * Stripe webhook are deployed. Every tenant that signed up *before*
 * that deploy has no events at all — which would make NRR /
 * MRR-movement reports look like "everyone churned".
 *
 * This script writes a CREATED event at `tenant.createdAt` for every
 * existing tenant, plus a CANCELED event for tenants currently in
 * CANCELED / ARCHIVED status (using `archivedAt` if available,
 * otherwise `updatedAt`).
 *
 * Idempotent: skips tenants that already have a CREATED event.
 *
 * Usage:
 *   npx tsx scripts/backfill-subscription-events.ts
 *   npx tsx scripts/backfill-subscription-events.ts --dry-run
 */

import { db } from "../src/lib/db";
import type { Plan } from "@prisma/client";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  // Bypass the unstable_cache wrapper in src/lib/plans.ts — that
  // wrapper only works inside the Next request lifecycle. We hit the
  // table directly here.
  const plans = await db.pricingPlan.findMany({
    where: { status: { in: ["PUBLISHED", "DRAFT"] } },
    select: { slug: true, priceMonthly: true },
  });
  const priceByPlan = new Map<Plan, number>();
  for (const p of plans) {
    priceByPlan.set(p.slug.toUpperCase() as Plan, Number(p.priceMonthly ?? 0));
  }

  const tenants = await db.tenant.findMany({
    select: {
      id: true,
      name: true,
      plan: true,
      status: true,
      createdAt: true,
      archivedAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // Pull existing events so we can skip ones already covered.
  const existing = await db.subscriptionEvent.findMany({
    where: { tenantId: { in: tenants.map((t) => t.id) } },
    select: { tenantId: true, type: true },
  });
  const haveCreated  = new Set(existing.filter((e) => e.type === "CREATED").map((e) => e.tenantId));
  const haveCanceled = new Set(existing.filter((e) => e.type === "CANCELED").map((e) => e.tenantId));

  let createdInserts = 0;
  let canceledInserts = 0;
  let skipped = 0;

  for (const t of tenants) {
    const price = priceByPlan.get(t.plan) ?? 0;
    const wasTrial = t.status === "TRIAL"; // approximation — we don't track trial-end transitions retroactively
    // Newly-created tenants that never paid: $0 MRR contribution.
    const createdMrr = wasTrial ? 0 : price;

    if (haveCreated.has(t.id)) {
      skipped += 1;
    } else {
      console.log(
        `${dryRun ? "[dry] " : ""}CREATED ${t.name} · ${t.plan} · ${createdMrr === 0 ? "trial" : "$" + createdMrr}`,
      );
      if (!dryRun) {
        await db.subscriptionEvent.create({
          data: {
            tenantId: t.id,
            type: "CREATED",
            fromPlan: null,
            toPlan: t.plan,
            fromPriceMonthly: null,
            toPriceMonthly: createdMrr,
            mrrDelta: createdMrr,
            source: "BACKFILL",
            occurredAt: t.createdAt,
            reason: "Initial signup (backfill)",
          },
        });
      }
      createdInserts += 1;
    }

    // CANCELED: only if currently churned and we don't already have one.
    const isChurned = t.status === "CANCELED" || t.status === "ARCHIVED";
    if (isChurned && !haveCanceled.has(t.id)) {
      const occurredAt = t.archivedAt ?? t.updatedAt;
      // mrrDelta = -lastPaidPrice. If the tenant churned out of trial
      // (price=0) the mrrDelta is 0 — accurate, since they weren't
      // contributing.
      console.log(
        `${dryRun ? "[dry] " : ""}CANCELED ${t.name} · ${t.plan} · −$${price}`,
      );
      if (!dryRun) {
        await db.subscriptionEvent.create({
          data: {
            tenantId: t.id,
            type: "CANCELED",
            fromPlan: t.plan,
            toPlan: null,
            fromPriceMonthly: price,
            toPriceMonthly: null,
            mrrDelta: -price,
            source: "BACKFILL",
            occurredAt,
            reason: "Status backfill — already CANCELED/ARCHIVED",
          },
        });
      }
      canceledInserts += 1;
    }
  }

  console.log("");
  console.log(`Tenants scanned:  ${tenants.length}`);
  console.log(`CREATED inserts:  ${createdInserts}${skipped > 0 ? ` (${skipped} skipped — already had one)` : ""}`);
  console.log(`CANCELED inserts: ${canceledInserts}`);
  console.log(dryRun ? "(Dry run — no rows written.)" : "Backfill complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
