import type { Plan } from "@prisma/client";

// Canonical per-plan pricing for platform-side revenue math. Kept in
// one place so the overview, revenue, and plans pages agree. Update
// these whenever marketing changes the public prices.
export const PLAN_PRICE_USD: Record<Plan, number> = {
  STARTER:    49,
  GROWTH:     99,
  PRO:       199,
  ENTERPRISE: 499,
};

export const PLAN_ORDER: Plan[] = ["STARTER", "GROWTH", "PRO", "ENTERPRISE"];

// Plan capability matrix — user-facing description of what each plan
// unlocks. Feeds /platform/plans and eventually the marketing page.
// Keep wording customer-readable; this is the source of truth.
export type PlanFeature = {
  key: string;
  label: string;
  // Per-plan value. string for capped/unlimited, boolean for on/off,
  // number for a numeric cap.
  values: Record<Plan, string | boolean | number>;
};

export const PLAN_FEATURES: PlanFeature[] = [
  {
    key: "users",
    label: "Team members",
    values: { STARTER: 3, GROWTH: 10, PRO: 25, ENTERPRISE: "Unlimited" },
  },
  {
    key: "locations",
    label: "Locations / branches",
    values: { STARTER: 1, GROWTH: 2, PRO: 5, ENTERPRISE: "Unlimited" },
  },
  {
    key: "storage",
    label: "File storage",
    values: { STARTER: "5 GB", GROWTH: "25 GB", PRO: "100 GB", ENTERPRISE: "500 GB" },
  },
  {
    key: "customer_portal",
    label: "Customer portal",
    values: { STARTER: true, GROWTH: true, PRO: true, ENTERPRISE: true },
  },
  {
    key: "proofs",
    label: "Proofing & versioning",
    values: { STARTER: true, GROWTH: true, PRO: true, ENTERPRISE: true },
  },
  {
    key: "production",
    label: "Production board",
    values: { STARTER: false, GROWTH: true, PRO: true, ENTERPRISE: true },
  },
  {
    key: "installs",
    label: "Install & field ops",
    values: { STARTER: false, GROWTH: true, PRO: true, ENTERPRISE: true },
  },
  {
    key: "approvals",
    label: "Approval workflows",
    values: { STARTER: false, GROWTH: false, PRO: true, ENTERPRISE: true },
  },
  {
    key: "automation",
    label: "Workflow automation",
    values: { STARTER: false, GROWTH: false, PRO: true, ENTERPRISE: true },
  },
  {
    key: "api",
    label: "API access",
    values: { STARTER: false, GROWTH: false, PRO: true, ENTERPRISE: true },
  },
  {
    key: "sso",
    label: "SSO / SAML",
    values: { STARTER: false, GROWTH: false, PRO: false, ENTERPRISE: true },
  },
  {
    key: "custom_branding",
    label: "Custom branding",
    values: { STARTER: false, GROWTH: true, PRO: true, ENTERPRISE: true },
  },
  {
    key: "reports",
    label: "Reports & analytics",
    values: { STARTER: "Basic", GROWTH: "Standard", PRO: "Advanced", ENTERPRISE: "Advanced" },
  },
  {
    key: "support",
    label: "Support level",
    values: { STARTER: "Email", GROWTH: "Priority email", PRO: "Priority + chat", ENTERPRISE: "Dedicated CSM" },
  },
];
