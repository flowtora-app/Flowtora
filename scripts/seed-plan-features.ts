// One-shot: build the feature matrix for the three public plans
// (Essentials / Professional / Enterprise).
//
// Modeled after the standard SaaS B2B pricing matrix (HubSpot,
// Atlassian, Stripe). Six groups: Core, Team & Access, Workflow,
// Reporting, Limits, Support.
//
// Mix of GATE and MARKETING_ONLY features:
//   - GATE: real runtime entitlement keys from src/lib/entitlements.ts
//     (installScheduling, multiLocation, etc.). Values here become the
//     truth for `isEntitled()` checks.
//   - MARKETING_ONLY: bullets/copy that aren't yet wired to a runtime
//     gate (SSO, vendors_expenses, support tiers). Listed so customers
//     can compare visually; flip to GATE later when each is enforced.
//
// Idempotent: re-running upserts the same rows in place by key.
//
//   npx tsx scripts/seed-plan-features.ts

import { db } from "../src/lib/db";

type Tier = "essentials" | "professional" | "enterprise";
type Cell =
  | { kind: "bool"; value: boolean; highlight?: boolean }
  | { kind: "number"; value: number; highlight?: boolean; footnote?: string }
  | { kind: "text"; value: string; highlight?: boolean; footnote?: string };

type FeatureRow = {
  key: string;
  label: string;
  description?: string;
  groupLabel: string;
  groupSortOrder: number;
  sortOrder: number;
  valueType: "BOOLEAN" | "NUMBER" | "TEXT";
  enforcement: "GATE" | "MARKETING_ONLY";
  values: Record<Tier, Cell>;
};

// Quick helpers to keep the matrix readable.
const yes = (highlight = false): Cell => ({ kind: "bool", value: true, highlight });
const no = (): Cell => ({ kind: "bool", value: false });
const num = (n: number, opts: { highlight?: boolean; footnote?: string } = {}): Cell => ({
  kind: "number",
  value: n,
  highlight: opts.highlight,
  footnote: opts.footnote,
});
const unlimited = (): Cell => ({ kind: "number", value: -1, highlight: true, footnote: "Unlimited" });
const text = (s: string, opts: { highlight?: boolean; footnote?: string } = {}): Cell => ({
  kind: "text",
  value: s,
  highlight: opts.highlight,
  footnote: opts.footnote,
});

// ── The matrix ─────────────────────────────────────────────────────
const FEATURES: FeatureRow[] = [
  // Group 1 — Core (everyone gets the basics)
  {
    key: "quotes_orders",
    label: "Quotes & orders",
    description: "Build quotes, convert to orders, and run jobs end-to-end.",
    groupLabel: "Core",
    groupSortOrder: 1,
    sortOrder: 1,
    valueType: "BOOLEAN",
    enforcement: "MARKETING_ONLY",
    values: { essentials: yes(), professional: yes(), enterprise: yes() },
  },
  {
    key: "customerPortal",
    label: "Customer portal",
    description: "Branded portal where customers approve proofs and pay invoices.",
    groupLabel: "Core",
    groupSortOrder: 1,
    sortOrder: 2,
    valueType: "BOOLEAN",
    enforcement: "GATE",
    values: { essentials: yes(), professional: yes(), enterprise: yes() },
  },
  {
    key: "proof_approvals",
    label: "Proof approval workflow",
    description: "Versioned proofs with revision rounds and customer sign-off.",
    groupLabel: "Core",
    groupSortOrder: 1,
    sortOrder: 3,
    valueType: "BOOLEAN",
    enforcement: "MARKETING_ONLY",
    values: { essentials: yes(), professional: yes(), enterprise: yes() },
  },
  {
    key: "invoicing_payments",
    label: "Invoicing & online payments",
    description: "Send invoices, collect Stripe payments, track A/R.",
    groupLabel: "Core",
    groupSortOrder: 1,
    sortOrder: 4,
    valueType: "BOOLEAN",
    enforcement: "MARKETING_ONLY",
    values: { essentials: yes(), professional: yes(), enterprise: yes() },
  },

  // Group 2 — Team & Access
  {
    key: "maxUsers",
    label: "Team seats",
    description: "How many users can sign in to your workspace.",
    groupLabel: "Team & access",
    groupSortOrder: 2,
    sortOrder: 1,
    valueType: "NUMBER",
    enforcement: "GATE",
    values: {
      essentials: num(3),
      professional: num(10),
      enterprise: unlimited(),
    },
  },
  {
    key: "role_permissions",
    label: "Role-based permissions",
    description: "Owner, Admin, Manager, Designer, Installer, Sales, Finance roles.",
    groupLabel: "Team & access",
    groupSortOrder: 2,
    sortOrder: 2,
    valueType: "BOOLEAN",
    enforcement: "MARKETING_ONLY",
    values: { essentials: yes(), professional: yes(), enterprise: yes() },
  },
  {
    key: "sso",
    label: "Single sign-on (SSO)",
    description: "SAML / OIDC for centralized identity management.",
    groupLabel: "Team & access",
    groupSortOrder: 2,
    sortOrder: 3,
    valueType: "BOOLEAN",
    enforcement: "MARKETING_ONLY",
    values: { essentials: no(), professional: no(), enterprise: yes(true) },
  },

  // Group 3 — Workflow & operations
  {
    key: "installScheduling",
    label: "Production & install scheduling",
    description: "Schedule jobs, route installers, run field-mode photo capture.",
    groupLabel: "Workflow & operations",
    groupSortOrder: 3,
    sortOrder: 1,
    valueType: "BOOLEAN",
    enforcement: "GATE",
    values: { essentials: no(), professional: yes(), enterprise: yes() },
  },
  {
    key: "advancedPricing",
    label: "Advanced pricing rules",
    description: "Rush surcharges, tiered pricing, approval thresholds.",
    groupLabel: "Workflow & operations",
    groupSortOrder: 3,
    sortOrder: 2,
    valueType: "BOOLEAN",
    enforcement: "GATE",
    values: { essentials: no(), professional: yes(), enterprise: yes() },
  },
  {
    key: "vendors_expenses",
    label: "Vendors & expenses",
    description: "Track vendor bills and job-linked expenses for true margin.",
    groupLabel: "Workflow & operations",
    groupSortOrder: 3,
    sortOrder: 3,
    valueType: "BOOLEAN",
    enforcement: "MARKETING_ONLY",
    values: { essentials: no(), professional: yes(), enterprise: yes() },
  },
  {
    key: "multiLocation",
    label: "Multi-location support",
    description: "Run multiple branches from a single account with shared data.",
    groupLabel: "Workflow & operations",
    groupSortOrder: 3,
    sortOrder: 4,
    valueType: "BOOLEAN",
    enforcement: "GATE",
    values: { essentials: no(), professional: no(), enterprise: yes(true) },
  },
  {
    key: "franchiseGroup",
    label: "Franchise / parent-child accounts",
    description: "Group multiple tenant accounts under a single brand.",
    groupLabel: "Workflow & operations",
    groupSortOrder: 3,
    sortOrder: 5,
    valueType: "BOOLEAN",
    enforcement: "GATE",
    values: { essentials: no(), professional: no(), enterprise: yes(true) },
  },

  // Group 4 — Reporting & insights
  {
    key: "dashboards",
    label: "Operational dashboards",
    description: "Persona-aware dashboards for every role.",
    groupLabel: "Reporting & insights",
    groupSortOrder: 4,
    sortOrder: 1,
    valueType: "BOOLEAN",
    enforcement: "MARKETING_ONLY",
    values: { essentials: yes(), professional: yes(), enterprise: yes() },
  },
  {
    key: "reportsFinancial",
    label: "Financial reporting",
    description: "Revenue, A/R aging, margin per job, and cash forecasting.",
    groupLabel: "Reporting & insights",
    groupSortOrder: 4,
    sortOrder: 2,
    valueType: "BOOLEAN",
    enforcement: "GATE",
    values: { essentials: no(), professional: yes(), enterprise: yes() },
  },
  {
    key: "branchComparison",
    label: "Cross-branch comparison",
    description: "Roll-up reports across locations with branch-level filtering.",
    groupLabel: "Reporting & insights",
    groupSortOrder: 4,
    sortOrder: 3,
    valueType: "BOOLEAN",
    enforcement: "GATE",
    values: { essentials: no(), professional: no(), enterprise: yes(true) },
  },
  {
    key: "audit_log_retention",
    label: "Audit log retention",
    description: "How long every administrative action is kept on file.",
    groupLabel: "Reporting & insights",
    groupSortOrder: 4,
    sortOrder: 4,
    valueType: "TEXT",
    enforcement: "MARKETING_ONLY",
    values: {
      essentials: text("90 days"),
      professional: text("1 year"),
      enterprise: text("7 years", { highlight: true }),
    },
  },

  // Group 5 — Limits & storage
  {
    key: "maxCustomers",
    label: "Customer records",
    description: "How many customers your account can hold.",
    groupLabel: "Limits & storage",
    groupSortOrder: 5,
    sortOrder: 1,
    valueType: "NUMBER",
    enforcement: "GATE",
    values: {
      essentials: num(200),
      professional: num(2000),
      enterprise: unlimited(),
    },
  },
  {
    key: "maxProducts",
    label: "Product catalog",
    description: "Distinct products / SKUs in your catalog.",
    groupLabel: "Limits & storage",
    groupSortOrder: 5,
    sortOrder: 2,
    valueType: "NUMBER",
    enforcement: "GATE",
    values: {
      essentials: num(50),
      professional: num(500),
      enterprise: unlimited(),
    },
  },
  {
    key: "maxLocations",
    label: "Locations",
    description: "Physical branches operating under one account.",
    groupLabel: "Limits & storage",
    groupSortOrder: 5,
    sortOrder: 3,
    valueType: "NUMBER",
    enforcement: "GATE",
    values: {
      essentials: num(1),
      professional: num(1),
      enterprise: unlimited(),
    },
  },
  {
    key: "storageQuotaGB",
    label: "File storage",
    description: "Total artwork, proof, receipt, and customer-upload storage.",
    groupLabel: "Limits & storage",
    groupSortOrder: 5,
    sortOrder: 4,
    valueType: "NUMBER",
    enforcement: "GATE",
    values: {
      essentials:   num(5,   { footnote: "5 GB" }),
      professional: num(50,  { footnote: "50 GB" }),
      enterprise:   num(-1,  { highlight: true, footnote: "Unlimited" }),
    },
  },

  // Group 6 — Support
  {
    key: "email_support",
    label: "Email support",
    description: "Standard email support during business hours.",
    groupLabel: "Support",
    groupSortOrder: 6,
    sortOrder: 1,
    valueType: "BOOLEAN",
    enforcement: "MARKETING_ONLY",
    values: { essentials: yes(), professional: yes(), enterprise: yes() },
  },
  {
    key: "priority_support",
    label: "Priority support",
    description: "Faster response times and chat access.",
    groupLabel: "Support",
    groupSortOrder: 6,
    sortOrder: 2,
    valueType: "BOOLEAN",
    enforcement: "MARKETING_ONLY",
    values: { essentials: no(), professional: no(), enterprise: yes(true) },
  },
  {
    key: "dedicated_onboarding",
    label: "Dedicated onboarding",
    description: "1:1 setup assistance and white-glove migration.",
    groupLabel: "Support",
    groupSortOrder: 6,
    sortOrder: 3,
    valueType: "BOOLEAN",
    enforcement: "MARKETING_ONLY",
    values: { essentials: no(), professional: no(), enterprise: yes(true) },
  },
];

// ── Runner ─────────────────────────────────────────────────────────
async function main() {
  const plans = await db.pricingPlan.findMany({
    where: { slug: { in: ["essentials", "professional", "enterprise"] } },
    select: { id: true, slug: true },
  });
  const planBySlug = new Map(plans.map((p) => [p.slug, p.id]));
  const expected: Tier[] = ["essentials", "professional", "enterprise"];
  for (const tier of expected) {
    if (!planBySlug.has(tier)) {
      console.error(`❌ Missing plan slug "${tier}". Run seed-public-plans.ts first.`);
      process.exit(1);
    }
  }

  console.log(`Seeding ${FEATURES.length} features × ${expected.length} plans...\n`);

  // Drop any feature whose key is no longer in the matrix — keeps the
  // /pricing comparison table tidy after renames (e.g. file_storage →
  // storageQuotaGB). Cascade on PlanFeatureValue handles the cells.
  const removed = await db.planFeature.deleteMany({
    where: { key: { notIn: FEATURES.map((f) => f.key) } },
  });
  if (removed.count > 0) {
    console.log(`Removed ${removed.count} stale feature row(s).\n`);
  }

  await db.$transaction(
    async (tx) => {
    for (const f of FEATURES) {
      // 1. Upsert the feature definition.
      const feature = await tx.planFeature.upsert({
        where: { key: f.key },
        create: {
          key: f.key,
          label: f.label,
          description: f.description,
          groupLabel: f.groupLabel,
          groupSortOrder: f.groupSortOrder,
          sortOrder: f.sortOrder,
          valueType: f.valueType,
          enforcement: f.enforcement,
        },
        update: {
          label: f.label,
          description: f.description,
          groupLabel: f.groupLabel,
          groupSortOrder: f.groupSortOrder,
          sortOrder: f.sortOrder,
          valueType: f.valueType,
          enforcement: f.enforcement,
        },
      });

      // 2. Upsert each per-plan value cell.
      for (const tier of expected) {
        const planId = planBySlug.get(tier)!;
        const cell = f.values[tier];
        const valueData = {
          valueBool: cell.kind === "bool" ? cell.value : null,
          valueNumber: cell.kind === "number" ? cell.value : null,
          valueText: cell.kind === "text" ? cell.value : null,
          highlight: cell.highlight ?? false,
          footnote: ("footnote" in cell ? cell.footnote : null) ?? null,
        };
        await tx.planFeatureValue.upsert({
          where: { planId_featureId: { planId, featureId: feature.id } },
          create: { planId, featureId: feature.id, ...valueData },
          update: valueData,
        });
      }

      const cellSummary = expected
        .map((t) => {
          const c = f.values[t];
          if (c.kind === "bool") return c.value ? "✓" : "–";
          if (c.kind === "number") return c.value === -1 ? "∞" : String(c.value);
          return c.value;
        })
        .join("  ");
      console.log(
        `  ${f.enforcement === "GATE" ? "🔒" : "📣"} ${f.label.padEnd(38)} ${cellSummary}`,
      );
    }
    },
    { timeout: 60_000, maxWait: 10_000 },
  );

  // Final tally.
  const totals = await db.planFeature.count();
  const cells = await db.planFeatureValue.count();
  console.log(`\n✓ ${totals} feature rows, ${cells} value cells.`);
  console.log("Done. /pricing comparison table populates immediately.");
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("\n❌ FAILED:", e);
  await db.$disconnect();
  process.exit(1);
});
