// One-shot: seed the new PricingPlan tables with the four default
// plans + the feature library + per-tenant backfill.
//
// Idempotent: safe to re-run. We upsert by slug (plans, addons) and by
// key (features) so re-running only re-synchronizes fields that we
// explicitly set — admin-edited copy on a published plan is NOT
// overwritten (we only `update: {}` on existing PUBLISHED rows).
//
// Usage:
//   npx tsx scripts/seed-pricing.ts
//
// After this runs, M1 is complete. The old `Plan` enum still drives
// entitlements; the new tables exist for the admin UI (M3) and the
// marketing pages (M2) to read from.

import { PrismaClient, type Plan } from "@prisma/client";

const db = new PrismaClient();

// ─────────────────────────────────────────────────────────────
// Feature library — the canonical list of rows that appear on the
// pricing-page feature matrix. Keys either match an existing entitlement
// FeatureKey/LimitKey (enforcement=GATE) or are marketing copy only
// (enforcement=MARKETING_ONLY).
// ─────────────────────────────────────────────────────────────

type SeedFeature = {
  key: string;
  label: string;
  groupLabel: string;
  description?: string;
  valueType: "BOOLEAN" | "NUMBER" | "TEXT";
  enforcement: "GATE" | "MARKETING_ONLY";
  groupSortOrder: number;
  sortOrder: number;
};

const FEATURES: SeedFeature[] = [
  // ── Limits (enforced as GATE at invite/create time) ──
  {
    key: "maxUsers",
    label: "Team members",
    groupLabel: "Limits",
    valueType: "NUMBER",
    enforcement: "GATE",
    groupSortOrder: 0,
    sortOrder: 0,
  },
  {
    key: "maxLocations",
    label: "Locations / branches",
    groupLabel: "Limits",
    valueType: "NUMBER",
    enforcement: "GATE",
    groupSortOrder: 0,
    sortOrder: 1,
  },
  {
    key: "storage",
    label: "File storage",
    groupLabel: "Limits",
    valueType: "TEXT",
    enforcement: "MARKETING_ONLY",
    groupSortOrder: 0,
    sortOrder: 2,
  },

  // ── Core features ──
  {
    key: "customerPortal",
    label: "Customer portal",
    groupLabel: "Core",
    description: "Self-serve quote + invoice portal with e-approval.",
    valueType: "BOOLEAN",
    enforcement: "GATE",
    groupSortOrder: 1,
    sortOrder: 0,
  },
  {
    key: "proofsVersioning",
    label: "Proofing & versioning",
    groupLabel: "Core",
    valueType: "BOOLEAN",
    enforcement: "MARKETING_ONLY",
    groupSortOrder: 1,
    sortOrder: 1,
  },

  // ── Workflow ──
  {
    key: "installScheduling",
    label: "Install & field ops",
    groupLabel: "Workflow",
    description: "Dispatch installers, capture photos + signatures on-site.",
    valueType: "BOOLEAN",
    enforcement: "GATE",
    groupSortOrder: 2,
    sortOrder: 0,
  },
  {
    key: "advancedPricing",
    label: "Rush / tiers / approvals",
    groupLabel: "Workflow",
    description: "Approval gates, rush pricing, and proof-before-production rules.",
    valueType: "BOOLEAN",
    enforcement: "GATE",
    groupSortOrder: 2,
    sortOrder: 1,
  },
  {
    key: "productionBoard",
    label: "Production boards",
    groupLabel: "Workflow",
    valueType: "BOOLEAN",
    enforcement: "MARKETING_ONLY",
    groupSortOrder: 2,
    sortOrder: 2,
  },

  // ── Insights ──
  {
    key: "reportsFinancial",
    label: "Financial reports",
    groupLabel: "Insights",
    description: "Revenue, margin, and cash-flow reports across tenants.",
    valueType: "BOOLEAN",
    enforcement: "GATE",
    groupSortOrder: 3,
    sortOrder: 0,
  },
  {
    key: "reportsTier",
    label: "Reports & analytics",
    groupLabel: "Insights",
    valueType: "TEXT",
    enforcement: "MARKETING_ONLY",
    groupSortOrder: 3,
    sortOrder: 1,
  },

  // ── Multi-location ──
  {
    key: "multiLocation",
    label: "Multi-location",
    groupLabel: "Enterprise",
    valueType: "BOOLEAN",
    enforcement: "GATE",
    groupSortOrder: 4,
    sortOrder: 0,
  },
  {
    key: "branchComparison",
    label: "Cross-branch reports",
    groupLabel: "Enterprise",
    valueType: "BOOLEAN",
    enforcement: "GATE",
    groupSortOrder: 4,
    sortOrder: 1,
  },
  {
    key: "franchiseGroup",
    label: "Franchise groups",
    groupLabel: "Enterprise",
    description: "Parent/child tenant hierarchy + shared templates.",
    valueType: "BOOLEAN",
    enforcement: "GATE",
    groupSortOrder: 4,
    sortOrder: 2,
  },
  {
    key: "ssoSaml",
    label: "SSO / SAML",
    groupLabel: "Enterprise",
    valueType: "BOOLEAN",
    enforcement: "MARKETING_ONLY",
    groupSortOrder: 4,
    sortOrder: 3,
  },
  {
    key: "customBranding",
    label: "Custom branding",
    groupLabel: "Enterprise",
    valueType: "BOOLEAN",
    enforcement: "MARKETING_ONLY",
    groupSortOrder: 4,
    sortOrder: 4,
  },

  // ── Support ──
  {
    key: "supportTier",
    label: "Support level",
    groupLabel: "Support",
    valueType: "TEXT",
    enforcement: "MARKETING_ONLY",
    groupSortOrder: 5,
    sortOrder: 0,
  },
];

// ─────────────────────────────────────────────────────────────
// Plan definitions.
//
// Pricing matches the marketing site as of 2026-04-22 (Starter $79,
// Pro $199, Enterprise contact-sales) rather than platform-pricing.ts
// — marketing is what prospects saw so that's the numbers we seed in.
// Growth is seeded HIDDEN because marketing only shows 3 tiers today
// (Starter / Pro / Enterprise). Admins can flip `showOnPricing` later
// if they decide to ship Growth publicly.
// ─────────────────────────────────────────────────────────────

type FeatureValue = {
  key: string;
  valueBool?: boolean;
  valueNumber?: number; // -1 = unlimited
  valueText?: string;
  footnote?: string;
  highlight?: boolean;
};

type SeedPlan = {
  // Slug MUST be lowercase equal to the legacy Plan enum value so the
  // enum → row mapping is trivial during the transition.
  slug: string;
  legacyEnum: Plan;
  name: string;
  subtitle: string;
  description: string;
  badge?: string;
  highlight: boolean;
  sortOrder: number;
  priceMonthly: number | null;
  priceAnnual: number | null;
  isContactSales: boolean;
  ctaLabel: string;
  ctaHref?: string;
  trialDays?: number;
  landingCopy: string;
  marketingCopy: string;
  showOnLanding: boolean;
  showOnPricing: boolean;
  showOnSignup: boolean;
  featureValues: FeatureValue[];
};

const PLANS: SeedPlan[] = [
  {
    slug: "starter",
    legacyEnum: "STARTER",
    name: "Starter",
    subtitle: "For single-location shops getting organized.",
    description:
      "Unlimited customers and quotes, a self-serve customer portal, and the basics you need to stop losing jobs to spreadsheets.",
    highlight: false,
    sortOrder: 10,
    priceMonthly: 79,
    // Annual = FULL-YEAR total (matches admin "Full year total" hint
    // and what Stripe's annual Price charges). $63/mo × 12 = $756/yr,
    // which is the headline "~20% off monthly rate" promise.
    priceAnnual: 756,
    isContactSales: false,
    ctaLabel: "Get Starter",
    trialDays: 14,
    landingCopy: "Unlimited quotes + a customer portal. $79/mo.",
    marketingCopy:
      "For single-location shops getting their house in order. Unlimited customers, quotes, and invoices with a self-serve portal — the essentials, not the kitchen sink.",
    showOnLanding: true,
    showOnPricing: true,
    showOnSignup: true,
    featureValues: [
      { key: "maxUsers", valueNumber: 3 },
      { key: "maxLocations", valueNumber: 1 },
      { key: "storage", valueText: "5 GB" },
      { key: "customerPortal", valueBool: true },
      { key: "proofsVersioning", valueBool: true },
      { key: "installScheduling", valueBool: false },
      { key: "advancedPricing", valueBool: false },
      { key: "productionBoard", valueBool: false },
      { key: "reportsFinancial", valueBool: false },
      { key: "reportsTier", valueText: "Basic" },
      { key: "multiLocation", valueBool: false },
      { key: "branchComparison", valueBool: false },
      { key: "franchiseGroup", valueBool: false },
      { key: "ssoSaml", valueBool: false },
      { key: "customBranding", valueBool: false },
      { key: "supportTier", valueText: "Email" },
    ],
  },
  {
    // Growth is seeded HIDDEN — not shown on marketing today. Lives in
    // the DB so any legacy tenants on GROWTH have a row to point at,
    // and so the admin can ship it later without a schema change.
    slug: "growth",
    legacyEnum: "GROWTH",
    name: "Growth",
    subtitle: "For shops graduating from starter scope.",
    description:
      "Production workflow, install scheduling, and financial reports — everything a growing shop needs before they think about multi-location.",
    highlight: false,
    sortOrder: 20,
    priceMonthly: 99,
    // $79/mo × 12 = $948/yr (~20% off the monthly rate).
    priceAnnual: 948,
    isContactSales: false,
    ctaLabel: "Get Growth",
    trialDays: 14,
    landingCopy: "Production + installs + financial reports. $99/mo.",
    marketingCopy:
      "For shops graduating from starter scope — production workflow, install dispatch, and the financial reports that help you plan quarter-over-quarter.",
    showOnLanding: false,
    showOnPricing: false,
    showOnSignup: true,
    featureValues: [
      { key: "maxUsers", valueNumber: 10 },
      { key: "maxLocations", valueNumber: 1 },
      { key: "storage", valueText: "25 GB" },
      { key: "customerPortal", valueBool: true },
      { key: "proofsVersioning", valueBool: true },
      { key: "installScheduling", valueBool: true },
      { key: "advancedPricing", valueBool: true },
      { key: "productionBoard", valueBool: true },
      { key: "reportsFinancial", valueBool: true },
      { key: "reportsTier", valueText: "Standard" },
      { key: "multiLocation", valueBool: false },
      { key: "branchComparison", valueBool: false },
      { key: "franchiseGroup", valueBool: false },
      { key: "ssoSaml", valueBool: false },
      { key: "customBranding", valueBool: true },
      { key: "supportTier", valueText: "Priority email" },
    ],
  },
  {
    slug: "pro",
    legacyEnum: "PRO",
    name: "Pro",
    subtitle: "For growing shops who need production and install flow.",
    description:
      "Production boards, install dispatch, multi-location support, and margin analytics. The tier most of our customers land on.",
    badge: "Most popular",
    highlight: true,
    sortOrder: 30,
    priceMonthly: 199,
    // $159/mo × 12 = $1908/yr (~20% off the monthly rate).
    priceAnnual: 1908,
    isContactSales: false,
    ctaLabel: "Get Pro",
    trialDays: 14,
    landingCopy: "Production, installs, and multi-location. $199/mo.",
    marketingCopy:
      "For growing shops. Production boards + department queues, install routing with a mobile field app, and multi-location reporting. Includes everything in Starter.",
    showOnLanding: true,
    showOnPricing: true,
    showOnSignup: true,
    featureValues: [
      { key: "maxUsers", valueNumber: 15, footnote: "extra seats $12/mo" },
      { key: "maxLocations", valueNumber: 3, footnote: "up to 3" },
      { key: "storage", valueText: "100 GB" },
      { key: "customerPortal", valueBool: true },
      { key: "proofsVersioning", valueBool: true },
      { key: "installScheduling", valueBool: true, highlight: true },
      { key: "advancedPricing", valueBool: true },
      { key: "productionBoard", valueBool: true, highlight: true },
      { key: "reportsFinancial", valueBool: true },
      { key: "reportsTier", valueText: "Advanced" },
      { key: "multiLocation", valueBool: true, highlight: true },
      { key: "branchComparison", valueBool: true },
      { key: "franchiseGroup", valueBool: false },
      { key: "ssoSaml", valueBool: false },
      { key: "customBranding", valueBool: true },
      { key: "supportTier", valueText: "Priority + chat" },
    ],
  },
  {
    slug: "enterprise",
    legacyEnum: "ENTERPRISE",
    name: "Enterprise",
    subtitle: "For multi-location operators and franchise networks.",
    description:
      "Unlimited seats and locations, franchise-group shared templates, SSO / SAML, and a dedicated success manager.",
    highlight: false,
    sortOrder: 40,
    priceMonthly: null,
    priceAnnual: null,
    isContactSales: true,
    ctaLabel: "Talk to sales",
    ctaHref: "/contact",
    landingCopy: "Unlimited seats, franchise groups, SSO. Let's talk.",
    marketingCopy:
      "For multi-location operators and franchise networks. Everything in Pro, plus franchise groups, advanced RBAC with branch scoping, SSO / SAML, and a dedicated success manager.",
    showOnLanding: true,
    showOnPricing: true,
    showOnSignup: true,
    featureValues: [
      { key: "maxUsers", valueNumber: -1, footnote: "unlimited" },
      { key: "maxLocations", valueNumber: -1, footnote: "unlimited" },
      { key: "storage", valueText: "500 GB" },
      { key: "customerPortal", valueBool: true },
      { key: "proofsVersioning", valueBool: true },
      { key: "installScheduling", valueBool: true },
      { key: "advancedPricing", valueBool: true },
      { key: "productionBoard", valueBool: true },
      { key: "reportsFinancial", valueBool: true },
      { key: "reportsTier", valueText: "Advanced" },
      { key: "multiLocation", valueBool: true },
      { key: "branchComparison", valueBool: true },
      { key: "franchiseGroup", valueBool: true, highlight: true },
      { key: "ssoSaml", valueBool: true, highlight: true },
      { key: "customBranding", valueBool: true },
      { key: "supportTier", valueText: "Dedicated CSM" },
    ],
  },
];

async function main() {
  console.log("Seeding pricing plans + feature library…");

  // ── 1. Upsert the feature library by `key`. ──
  //
  // We always overwrite descriptive fields (label, description, ordering)
  // because these are seed-controlled. Admin edits happen on PlanFeatureValue
  // rows, not PlanFeature metadata.
  for (const f of FEATURES) {
    await db.planFeature.upsert({
      where: { key: f.key },
      create: {
        key: f.key,
        label: f.label,
        groupLabel: f.groupLabel,
        description: f.description ?? null,
        valueType: f.valueType,
        enforcement: f.enforcement,
        sortOrder: f.sortOrder,
        groupSortOrder: f.groupSortOrder,
      },
      update: {
        label: f.label,
        groupLabel: f.groupLabel,
        description: f.description ?? null,
        valueType: f.valueType,
        enforcement: f.enforcement,
        sortOrder: f.sortOrder,
        groupSortOrder: f.groupSortOrder,
      },
    });
  }
  console.log(`  ✓ ${FEATURES.length} features`);

  // Lookup for feature values by key → id.
  const allFeatures = await db.planFeature.findMany({ select: { id: true, key: true } });
  const featureIdByKey = new Map(allFeatures.map((f) => [f.key, f.id] as const));

  // ── 2. Upsert plans. ──
  //
  // Per-plan idempotency: if the plan already exists (re-run), we
  // update the *seeded* fields but NEVER touch `status` — so an admin
  // who published and then tweaked copy won't have their work reverted
  // by a re-run. New rows start as PUBLISHED so the marketing page
  // can read them immediately (M2 flip).
  for (const p of PLANS) {
    const existing = await db.pricingPlan.findUnique({
      where: { slug: p.slug },
      select: { id: true, status: true },
    });

    const basePayload = {
      name: p.name,
      subtitle: p.subtitle,
      description: p.description,
      badge: p.badge ?? null,
      highlight: p.highlight,
      sortOrder: p.sortOrder,
      priceMonthly: p.priceMonthly,
      priceAnnual: p.priceAnnual,
      isContactSales: p.isContactSales,
      ctaLabel: p.ctaLabel,
      ctaHref: p.ctaHref ?? null,
      trialDays: p.trialDays ?? null,
      landingCopy: p.landingCopy,
      marketingCopy: p.marketingCopy,
      showOnLanding: p.showOnLanding,
      showOnPricing: p.showOnPricing,
      showOnSignup: p.showOnSignup,
    };

    const planRow = await db.pricingPlan.upsert({
      where: { slug: p.slug },
      create: {
        slug: p.slug,
        ...basePayload,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
      // On re-run: refresh copy but don't clobber status / publishedAt.
      update: basePayload,
      select: { id: true },
    });

    // ── 3. Upsert feature values. ──
    for (const v of p.featureValues) {
      const featureId = featureIdByKey.get(v.key);
      if (!featureId) {
        console.warn(`    ! skipping unknown feature key "${v.key}" on plan ${p.slug}`);
        continue;
      }
      await db.planFeatureValue.upsert({
        where: { planId_featureId: { planId: planRow.id, featureId } },
        create: {
          planId: planRow.id,
          featureId,
          valueBool: v.valueBool ?? null,
          valueNumber: v.valueNumber ?? null,
          valueText: v.valueText ?? null,
          footnote: v.footnote ?? null,
          highlight: v.highlight ?? false,
        },
        update: {
          valueBool: v.valueBool ?? null,
          valueNumber: v.valueNumber ?? null,
          valueText: v.valueText ?? null,
          footnote: v.footnote ?? null,
          highlight: v.highlight ?? false,
        },
      });
    }

    const note = existing
      ? `(updated, status=${existing.status})`
      : "(created, status=PUBLISHED)";
    console.log(`  ✓ plan ${p.slug} ${note}`);
  }

  // ── 4. Backfill Tenant.pricingPlanId from legacy Plan enum. ──
  //
  // We only populate tenants whose pricingPlanId is null — never
  // clobber an already-assigned value. Lookup built from the seed
  // slugs so we don't need a schema relation to do the map.
  const planBySlug = new Map(
    (await db.pricingPlan.findMany({ select: { id: true, slug: true } })).map(
      (r) => [r.slug, r.id] as const,
    ),
  );

  const tenants = await db.tenant.findMany({
    where: { pricingPlanId: null },
    select: { id: true, plan: true },
  });
  let backfilled = 0;
  for (const t of tenants) {
    const slug = t.plan.toLowerCase();
    const planId = planBySlug.get(slug);
    if (!planId) continue;
    await db.tenant.update({
      where: { id: t.id },
      data: { pricingPlanId: planId },
    });
    backfilled++;
  }
  console.log(`  ✓ backfilled ${backfilled}/${tenants.length} tenants`);

  console.log("\nDone.");
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("\n❌ FAILED:");
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
