// One-shot: replace the current draft "Untitled plan" with the three
// public pricing tiers — Starter, Pro, Studio — published and ready
// to render on /pricing.
//
// Annual prices apply a 10% discount on the monthly × 12 baseline.
//
// Usage:  npx tsx scripts/seed-public-plans.ts
//
// Idempotent: re-running overwrites the same three slugs in place.

import { db } from "../src/lib/db";
import { Prisma } from "@prisma/client";

const dec = (n: number) => new Prisma.Decimal(n.toFixed(2));

// 10% off monthly × 12 — rounded to whole dollars for clean display.
const annualFor = (monthly: number) => Math.round(monthly * 12 * 0.9);

type PlanInput = {
  slug: string;
  name: string;
  subtitle: string;
  description: string;
  monthly: number;
  highlight: boolean;
  badge: string | null;
  sortOrder: number;
  landingCopy: string;
};

const PLANS: PlanInput[] = [
  {
    slug: "essentials",
    name: "Essentials",
    subtitle: "Run the full job lifecycle without spreadsheets.",
    description:
      "Quotes, orders, proofs, and invoicing in one workspace — the foundation every shop needs to replace paper, email threads, and one-off tools.",
    landingCopy:
      "Quotes → orders → proofs → invoices, in one workspace. Built for owner-operator shops.",
    monthly: 60,
    highlight: false,
    badge: null,
    sortOrder: 1,
  },
  {
    slug: "professional",
    name: "Professional",
    subtitle: "For growing shops with multiple jobs in motion.",
    description:
      "Everything in Essentials plus production scheduling, install events, financial reporting, and expanded team seats — the operating system for a working shop.",
    landingCopy:
      "Production scheduling, installs, and reporting for shops running multiple jobs in parallel.",
    monthly: 120,
    highlight: true,
    badge: "Most popular",
    sortOrder: 2,
  },
  {
    slug: "enterprise",
    name: "Enterprise",
    subtitle: "For multi-location operations and high-volume shops.",
    description:
      "Everything in Professional plus advanced analytics, role-based access controls, extended audit retention, and priority support — designed for shops with multiple locations or strict compliance needs.",
    landingCopy:
      "Advanced analytics, RBAC, audit retention, and priority support for multi-location operations.",
    monthly: 170,
    highlight: false,
    badge: null,
    sortOrder: 3,
  },
];

async function main() {
  console.log("\n— Before —");
  const before = await db.pricingPlan.findMany({
    select: { slug: true, name: true, status: true, priceMonthly: true },
    orderBy: { sortOrder: "asc" },
  });
  for (const p of before) {
    console.log(`  • ${p.slug} (${p.name}) ${p.status} ${p.priceMonthly ?? "—"}`);
  }

  await db.$transaction(async (tx) => {
    // Delete the orphan placeholder so it can't leak onto /pricing.
    const removed = await tx.pricingPlan.deleteMany({
      where: { slug: { notIn: PLANS.map((p) => p.slug) } },
    });
    if (removed.count > 0) {
      console.log(`\nRemoved ${removed.count} legacy/placeholder plan(s).`);
    }

    for (const p of PLANS) {
      const annual = annualFor(p.monthly);
      const data = {
        slug: p.slug,
        name: p.name,
        subtitle: p.subtitle,
        description: p.description,
        landingCopy: p.landingCopy,
        marketingCopy: p.description,
        priceMonthly: dec(p.monthly),
        priceAnnual: dec(annual),
        currency: "USD",
        isContactSales: false,
        status: "PUBLISHED" as const,
        publishedAt: new Date(),
        highlight: p.highlight,
        badge: p.badge,
        sortOrder: p.sortOrder,
        showOnLanding: true,
        showOnPricing: true,
        showOnSignup: true,
        ctaLabel: "Start free trial",
        ctaHref: null, // null = falls back to /signup?plan=<slug>
        trialDays: null,
      };

      await tx.pricingPlan.upsert({
        where: { slug: p.slug },
        create: data,
        update: data,
      });

      console.log(
        `  ✓ ${p.name.padEnd(8)} $${p.monthly}/mo · $${annual}/yr (${Math.round(annual / 12)}/mo billed annually)`,
      );
    }
  });

  console.log("\n— After —");
  const after = await db.pricingPlan.findMany({
    select: {
      slug: true,
      name: true,
      status: true,
      priceMonthly: true,
      priceAnnual: true,
      highlight: true,
      badge: true,
    },
    orderBy: { sortOrder: "asc" },
  });
  for (const p of after) {
    const tag =
      (p.highlight ? " ★" : "") + (p.badge ? ` "${p.badge}"` : "");
    console.log(
      `  • ${p.slug.padEnd(8)} ${p.status} $${p.priceMonthly}/mo · $${p.priceAnnual}/yr${tag}`,
    );
  }

  console.log(
    "\nDone. Plans live on /pricing immediately. Stripe sync (price IDs)\n" +
      "still needs to happen via /platform/plans/[id] → Sync to Stripe before\n" +
      "checkouts will work.",
  );
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("\n❌ FAILED:", e);
  await db.$disconnect();
  process.exit(1);
});
