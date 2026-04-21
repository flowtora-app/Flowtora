import type { PricingTier } from "@/components/marketing/PricingTable";

// Marketing-side pricing tiers.
//
// Intentionally SEPARATE from `src/lib/entitlements.ts` (which gates
// product features). This file is prose for humans: the feature
// bullets shown to prospects on the marketing pages. Keep the two in
// rough alignment when adding/removing features — but a mismatch
// doesn't break anything at runtime.
//
// `LANDING_TIERS` — compact version shown on /. `FULL_TIERS` — deep
// version shown on /pricing with every bullet expanded.

const sharedStarter = [
  "Up to 3 user seats",
  "Unlimited customers + quotes",
  "Deposit + full-payment invoicing",
  "Customer portal with e-approval",
];

const sharedPro = [
  "Up to 15 user seats",
  "Production boards + department queues",
  "Install routing + mobile field app",
  "Saved reports + margin analytics",
  "Multi-location support (up to 3)",
];

const sharedEnt = [
  "Unlimited seats",
  "Unlimited locations + franchise groups",
  "Advanced RBAC + branch scoping",
  "SSO / SAML",
  "Dedicated success manager",
  "Priority support SLA",
];

// Annual pricing = 20% off monthly (marketing-page rule; keep the
// `annual` field in lockstep with `monthly * 0.8` rounded to the
// nearest dollar). Changed from 17% to 20% in Phase 4 to line up
// with the headline claim on /pricing.

export const LANDING_TIERS: PricingTier[] = [
  {
    name: "Starter",
    description: "For single-location shops getting organized.",
    price: { monthly: 79, annual: 63 },
    cta: { label: "Start free trial", href: "/signup" },
    features: sharedStarter.map((label) => ({ label, included: true })),
  },
  {
    name: "Pro",
    description: "For growing shops who need production and install flow.",
    price: { monthly: 199, annual: 159 },
    highlight: true,
    cta: { label: "Start free trial", href: "/signup" },
    features: sharedPro.map((label) => ({ label, included: true })),
  },
  {
    name: "Enterprise",
    description: "For multi-location operators and franchise networks.",
    price: "custom",
    cta: { label: "Talk to sales", href: "/contact" },
    features: sharedEnt.map((label) => ({ label, included: true })),
  },
];

export const FULL_TIERS: PricingTier[] = [
  {
    name: "Starter",
    description: "For single-location shops getting organized.",
    price: { monthly: 79, annual: 63 },
    cta: { label: "Start free trial", href: "/signup" },
    features: [
      { label: "3 user seats included", included: true },
      { label: "Unlimited customers", included: true },
      { label: "Unlimited quotes & invoices", included: true },
      { label: "Customer portal + e-approval", included: true },
      { label: "Stripe + bank-transfer payments", included: true },
      { label: "Email templates + message library", included: true },
      { label: "Basic reports", included: true },
      { label: "Production boards", included: false },
      { label: "Install routing + field app", included: false },
      { label: "Multi-location", included: false },
      { label: "SSO / SAML", included: false },
    ],
  },
  {
    name: "Pro",
    description: "For growing shops who need production and install flow.",
    price: { monthly: 199, annual: 159 },
    highlight: true,
    cta: { label: "Start free trial", href: "/signup" },
    features: [
      { label: "15 user seats included", included: true, note: "extra seats $12/mo" },
      { label: "Unlimited customers", included: true },
      { label: "Unlimited quotes & invoices", included: true },
      { label: "Customer portal + e-approval", included: true },
      { label: "Stripe + bank-transfer payments", included: true },
      { label: "Production boards + department queues", included: true },
      { label: "Install routing + field app", included: true },
      { label: "Saved reports + margin analytics", included: true },
      { label: "Multi-location", included: true, note: "up to 3" },
      { label: "Workflow automations (50/mo)", included: true },
      { label: "SSO / SAML", included: false },
    ],
  },
  {
    name: "Enterprise",
    description: "For multi-location operators and franchise networks.",
    price: "custom",
    cta: { label: "Talk to sales", href: "/contact" },
    features: [
      { label: "Unlimited seats", included: true },
      { label: "Unlimited locations", included: true },
      { label: "Franchise groups + central billing", included: true },
      { label: "Advanced RBAC + branch scoping", included: true },
      { label: "Unlimited workflow automations", included: true },
      { label: "API + webhook access", included: true },
      { label: "SSO / SAML", included: true },
      { label: "Dedicated success manager", included: true },
      { label: "Priority support SLA", included: true },
      { label: "Custom onboarding + training", included: true },
    ],
  },
];
