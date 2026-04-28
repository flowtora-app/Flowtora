// Feature gate metadata — friendly label + minimum-required plan
// shown on the <UpgradeRequired> paywall.
//
// One row per gateable feature key. Pages that gate a feature look it
// up here so the upgrade prompt copy stays consistent and centralized.
// Adding a new gate = one row here + one isEntitled() check at the
// page entry.

import type { FeatureKey } from "@/lib/entitlements";

export interface FeatureGateMeta {
  /** Human-readable feature label, shown in the paywall heading. */
  label: string;
  /** Friendly name of the lowest plan that includes the feature. */
  requiredPlan: "Essentials" | "Professional" | "Enterprise";
  /** One-sentence value prop shown under the heading. */
  reason: string;
}

export const FEATURE_GATE_META: Partial<Record<FeatureKey | string, FeatureGateMeta>> = {
  // GATE-enforced today (the 8 hardcoded FeatureKeys).
  installScheduling: {
    label: "Production & install scheduling",
    requiredPlan: "Professional",
    reason: "Schedule jobs, route installers, and run field-mode photo capture from a single board.",
  },
  customerPortal: {
    label: "Customer portal",
    requiredPlan: "Essentials",
    reason: "Branded portal where customers approve proofs and pay invoices.",
  },
  multiLocation: {
    label: "Multi-location support",
    requiredPlan: "Enterprise",
    reason: "Run multiple branches from a single account with shared customers, products, and reporting.",
  },
  branchComparison: {
    label: "Cross-branch comparison",
    requiredPlan: "Enterprise",
    reason: "Roll-up reports across locations with side-by-side branch performance.",
  },
  franchiseGroup: {
    label: "Franchise / parent-child accounts",
    requiredPlan: "Enterprise",
    reason: "Group multiple tenant accounts under one brand with shared admin controls.",
  },
  advancedPricing: {
    label: "Advanced pricing rules",
    requiredPlan: "Professional",
    reason: "Rush surcharges, tiered pricing, and approval thresholds for big quotes.",
  },
  reportsFinancial: {
    label: "Financial reporting",
    requiredPlan: "Professional",
    reason: "Revenue, A/R aging, margin per job, and cash-forecasting reports.",
  },

  // Newly gated as part of expanding enforcement to more matrix rows.
  vendors_expenses: {
    label: "Vendors & expenses",
    requiredPlan: "Professional",
    reason: "Track vendor bills and job-linked expenses for true margin reporting.",
  },
  sso: {
    label: "Single sign-on (SSO)",
    requiredPlan: "Enterprise",
    reason: "SAML / OIDC for centralized identity management across your team.",
  },
};

/** Convenience accessor with a generic fallback for keys without metadata. */
export function getFeatureGateMeta(key: string): FeatureGateMeta {
  return (
    FEATURE_GATE_META[key] ?? {
      label: "This feature",
      requiredPlan: "Professional",
      reason: "Upgrade your plan to unlock this feature.",
    }
  );
}
