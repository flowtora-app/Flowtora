// Dump the billing-relevant fields for every tenant + every PricingPlan
// so we can see exactly where the disconnect is between Stripe, the
// tenant row, and the PricingPlan catalog.
//
// Usage:   npx tsx scripts/inspect-billing.ts
// Usage:   npx tsx scripts/inspect-billing.ts <tenant-slug>   (filters)
//
// Optionally pass --stripe to also fetch live Stripe details for each
// tenant with a stripeCustomerId or stripeSubscriptionId. Requires
// STRIPE_SECRET_KEY in env.

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";

const db = new PrismaClient();

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const filterSlug = args[0] ?? null;
const includeStripe = flags.has("--stripe");

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-02-24.acacia" })
  : null;

async function main() {
  console.log("─".repeat(70));
  console.log("  PRICING PLAN CATALOG");
  console.log("─".repeat(70));
  const plans = await db.pricingPlan.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      priceMonthly: true,
      priceAnnual: true,
      stripeProductId: true,
      stripePriceMonthly: true,
      stripePriceAnnual: true,
      stripeSyncedAt: true,
    },
  });
  for (const p of plans) {
    console.log(`\n  ${p.name.padEnd(14)} slug=${p.slug.padEnd(10)} status=${p.status}`);
    console.log(`    id                 ${p.id}`);
    console.log(`    priceMonthly       ${p.priceMonthly ?? "—"}`);
    console.log(`    priceAnnual        ${p.priceAnnual ?? "—"}`);
    console.log(`    stripeProductId    ${p.stripeProductId ?? "—"}`);
    console.log(`    stripePriceMonthly ${p.stripePriceMonthly ?? "—"}`);
    console.log(`    stripePriceAnnual  ${p.stripePriceAnnual ?? "—"}`);
    console.log(`    stripeSyncedAt     ${p.stripeSyncedAt?.toISOString() ?? "— (never synced)"}`);
  }

  console.log("\n");
  console.log("─".repeat(70));
  console.log("  TENANTS" + (filterSlug ? ` (filtered: ${filterSlug})` : " (newest first)"));
  console.log("─".repeat(70));

  const tenants = await db.tenant.findMany({
    where: filterSlug ? { slug: filterSlug } : {},
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      name: true,
      plan: true,
      status: true,
      trialEndsAt: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      pricingPlanId: true,
      pricingPlan: { select: { slug: true, name: true } },
      createdAt: true,
    },
  });

  for (const t of tenants) {
    console.log(`\n  ${t.slug}  (${t.name})`);
    console.log(`    created            ${t.createdAt.toISOString()}`);
    console.log(`    tenant.plan        ${t.plan}   ← legacy enum`);
    console.log(`    tenant.status      ${t.status}`);
    console.log(`    trialEndsAt        ${t.trialEndsAt?.toISOString() ?? "—"}`);
    console.log(`    pricingPlanId      ${t.pricingPlanId ?? "— ⚠"}`);
    console.log(`    pricingPlan.name   ${t.pricingPlan?.name ?? "— ⚠"}   ← what /settings/billing shows`);
    console.log(`    stripeCustomerId   ${t.stripeCustomerId ?? "—"}`);
    console.log(`    stripeSubId        ${t.stripeSubscriptionId ?? "— ⚠"}`);

    // Diagnostic line: flag obvious mismatches.
    if (t.pricingPlan && t.plan.toLowerCase() !== t.pricingPlan.slug) {
      console.log(
        `    ⚠ MISMATCH: legacy tenant.plan=${t.plan} but pricingPlan.slug=${t.pricingPlan.slug}`,
      );
    }
    if (t.stripeCustomerId && !t.stripeSubscriptionId) {
      console.log(`    ⚠ HAS CUSTOMER BUT NO SUB ID — webhook likely never fired`);
    }

    // Live Stripe check
    if (includeStripe && stripe && t.stripeCustomerId) {
      try {
        const subs = await stripe.subscriptions.list({
          customer: t.stripeCustomerId,
          status: "all",
          limit: 5,
          expand: ["data.items.data.price"],
        });
        if (subs.data.length === 0) {
          console.log(`    stripe: no subscriptions on customer`);
        } else {
          for (const s of subs.data) {
            const price = s.items.data[0]?.price;
            console.log(`    stripe sub ${s.id}:`);
            console.log(`       status           ${s.status}`);
            console.log(`       price.id         ${price?.id ?? "—"}`);
            console.log(`       price.amount     ${price?.unit_amount} ${price?.currency}`);
            console.log(`       price.interval   ${price?.recurring?.interval ?? "—"}`);
            console.log(`       metadata         ${JSON.stringify(s.metadata)}`);

            // Try to match this price back to a PricingPlan
            const match = plans.find(
              (p) =>
                p.stripePriceMonthly === price?.id ||
                p.stripePriceAnnual === price?.id,
            );
            if (match) {
              console.log(`       matches plan:   ${match.name} (${match.slug})`);
            } else {
              console.log(
                `       ⚠ price.id doesn't match any PricingPlan.stripePriceMonthly/Annual`,
              );
            }
          }
        }
      } catch (e) {
        console.log(`    stripe fetch failed: ${(e as Error).message}`);
      }
    }
  }

  if (!includeStripe) {
    console.log("\n\n  💡 Rerun with --stripe to also fetch live Stripe data.\n");
  } else if (!stripe) {
    console.log("\n\n  ⚠ --stripe passed but STRIPE_SECRET_KEY not set.\n");
  }
}

main().finally(() => db.$disconnect());
