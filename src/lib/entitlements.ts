// Phase 17 Slice C — plan entitlements + feature flag resolution.
//
// Callers use `isEntitled(tenantId, "featureKey")` to ask "is this
// tenant allowed to use this?" and `planLimit(plan, "maxUsers")` to read
// hard numeric caps (enforced at invite / create time).
//
// Two layers collapse into one answer:
//   1. PLAN_ENTITLEMENTS below — the canonical map. Marketing shows these,
//      finance contracts on them, and sales treats them as truth.
//   2. FeatureFlag rows — per-tenant or global overrides for grandfathering,
//      one-off betas, or disabling a feature for a customer abusing it.
//
// Adding a new entitlement:
//   - Extend FeatureKey or LimitKey below
//   - Add it to every plan in PLAN_ENTITLEMENTS
//   - Reference it at the call site (gate render + gate action)
// TS will nag at you if you miss any of those.

import type { Plan } from "@prisma/client";
import { db } from "@/lib/db";

export type FeatureKey =
  | "installScheduling"       // Phase 9 — field service module
  | "customerPortal"          // Phase 11 — customer-facing portal
  | "multiLocation"           // Phase 15 Slice A — branches
  | "branchComparison"        // Phase 15 Slice C — cross-branch reports
  | "franchiseGroup"          // Phase 15 Slice D — parent/child tenancy
  | "advancedPricing"         // Phase 13 — rush / tiers / approval rules
  | "reportsFinancial"        // Phase 12 — revenue / margin reports
  | "betaProofAnnotations";   // placeholder — flip per-tenant for early access

export type LimitKey =
  | "maxUsers"
  | "maxLocations"
  | "maxProducts"
  | "maxCustomers";

type PlanEntitlements = {
  features: Record<FeatureKey, boolean>;
  limits: Record<LimitKey, number | null>; // null = unlimited
};

/**
 * The plan grid. If you change this, update the marketing page and the
 * plan selector on /signup in the same commit — otherwise users will
 * sign up for promises the app can't keep.
 */
export const PLAN_ENTITLEMENTS: Record<Plan, PlanEntitlements> = {
  STARTER: {
    features: {
      installScheduling: false,
      customerPortal: true,
      multiLocation: false,
      branchComparison: false,
      franchiseGroup: false,
      advancedPricing: false,
      reportsFinancial: false,
      betaProofAnnotations: false,
    },
    limits: {
      maxUsers: 3,
      maxLocations: 1,
      maxProducts: 50,
      maxCustomers: 200,
    },
  },
  GROWTH: {
    features: {
      installScheduling: true,
      customerPortal: true,
      multiLocation: false,
      branchComparison: false,
      franchiseGroup: false,
      advancedPricing: true,
      reportsFinancial: true,
      betaProofAnnotations: false,
    },
    limits: {
      maxUsers: 10,
      maxLocations: 1,
      maxProducts: 500,
      maxCustomers: 2000,
    },
  },
  PRO: {
    features: {
      installScheduling: true,
      customerPortal: true,
      multiLocation: true,
      branchComparison: true,
      franchiseGroup: false,
      advancedPricing: true,
      reportsFinancial: true,
      betaProofAnnotations: false,
    },
    limits: {
      maxUsers: 25,
      maxLocations: 10,
      maxProducts: null,
      maxCustomers: null,
    },
  },
  ENTERPRISE: {
    features: {
      installScheduling: true,
      customerPortal: true,
      multiLocation: true,
      branchComparison: true,
      franchiseGroup: true,
      advancedPricing: true,
      reportsFinancial: true,
      betaProofAnnotations: true,
    },
    limits: {
      maxUsers: null,
      maxLocations: null,
      maxProducts: null,
      maxCustomers: null,
    },
  },
};

/**
 * Read a hard numeric cap for a plan. Returns `Infinity` for unlimited
 * so callers can write `count >= planLimit(...)` without special-casing.
 */
export function planLimit(plan: Plan, key: LimitKey): number {
  const raw = PLAN_ENTITLEMENTS[plan].limits[key];
  return raw === null ? Infinity : raw;
}

/**
 * Resolve a feature flag for a tenant. Checks in order:
 *   1. per-tenant override (FeatureFlag row with tenantId set)
 *   2. global override     (FeatureFlag row with tenantId = null)
 *   3. plan default        (PLAN_ENTITLEMENTS)
 *
 * One DB call that grabs both overrides in a single `findMany`. Tenant
 * plan + id are passed in so the caller (usually already holding a
 * TenantContext) doesn't pay a re-lookup.
 */
export async function isEntitled(
  tenantId: string,
  plan: Plan,
  key: FeatureKey,
): Promise<boolean> {
  const overrides = await db.featureFlag.findMany({
    where: { key, OR: [{ tenantId }, { tenantId: null }] },
    select: { tenantId: true, enabled: true },
  });

  const perTenant = overrides.find((f) => f.tenantId === tenantId);
  if (perTenant) return perTenant.enabled;

  const global = overrides.find((f) => f.tenantId === null);
  if (global) return global.enabled;

  return PLAN_ENTITLEMENTS[plan].features[key];
}

/**
 * Batch-resolve every feature key for a tenant. Used by the tenant
 * detail page to render the full entitlement matrix with "inherited /
 * overridden" state, and by SSR-heavy pages that gate multiple features
 * at once.
 */
export async function resolveAllEntitlements(
  tenantId: string,
  plan: Plan,
): Promise<Record<FeatureKey, { value: boolean; source: "plan" | "global" | "tenant" }>> {
  const overrides = await db.featureFlag.findMany({
    where: { OR: [{ tenantId }, { tenantId: null }] },
    select: { key: true, tenantId: true, enabled: true },
  });
  const planDefaults = PLAN_ENTITLEMENTS[plan].features;

  const keys = Object.keys(planDefaults) as FeatureKey[];
  const out: Record<string, { value: boolean; source: "plan" | "global" | "tenant" }> = {};
  for (const k of keys) {
    const perTenant = overrides.find((f) => f.key === k && f.tenantId === tenantId);
    if (perTenant) { out[k] = { value: perTenant.enabled, source: "tenant" }; continue; }
    const global = overrides.find((f) => f.key === k && f.tenantId === null);
    if (global) { out[k] = { value: global.enabled, source: "global" }; continue; }
    out[k] = { value: planDefaults[k], source: "plan" };
  }
  return out as Record<FeatureKey, { value: boolean; source: "plan" | "global" | "tenant" }>;
}
