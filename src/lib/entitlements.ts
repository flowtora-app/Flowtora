// Phase 17 Slice C — plan entitlements + feature flag resolution.
// M6 — read plan grants from PlanFeatureValue (the admin-editable
// source) instead of the hardcoded PLAN_ENTITLEMENTS map. The map
// stays as a fallback for tenants without a pricingPlanId yet and
// for keys the DB plan doesn't define (e.g. betaProofAnnotations
// which only exists as a per-tenant override today).
//
// Callers use `isEntitled(tenantId, plan, "featureKey")` to ask
// "is this tenant allowed to use this?" — signature unchanged.
// `planLimit(plan, "maxUsers")` reads hard numeric caps and is not
// part of the DB flip yet (it reads PLAN_ENTITLEMENTS only).
//
// Resolution order inside `isEntitled`:
//   1. Per-tenant FeatureFlag row (tenantId=X, key=Y)
//   2. Global FeatureFlag row (tenantId=null, key=Y)
//   3. Tenant's PricingPlan feature grant (DB, cached)
//   4. PLAN_ENTITLEMENTS[plan].features[key] (legacy fallback)
//
// Adding a new entitlement:
//   - Extend FeatureKey or LimitKey below
//   - Add it to every plan in PLAN_ENTITLEMENTS
//   - Add a matching PlanFeature row in scripts/seed-pricing.ts so
//     the DB path resolves it too (or it'll always hit the fallback)
//   - Reference it at the call site (gate render + gate action)

import { unstable_cache } from "next/cache";
import type { Plan } from "@prisma/client";
import { db } from "@/lib/db";
import { PRICING_CACHE_TAGS } from "@/lib/plans";

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
 * Legacy plan grid. Fallback when a tenant has no pricingPlanId yet
 * or when a FeatureKey isn't represented in the PlanFeatureValue
 * table. The admin's Pricing tab is now the real source of truth for
 * the first three tiers; this map only covers bootstrap and the
 * handful of keys (like betaProofAnnotations) that don't ship as
 * PlanFeature rows.
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
 *
 * Not DB-backed yet — limits live in the PlanFeatureValue table as
 * NUMBER cells (maxUsers / maxLocations) but the call sites that read
 * these synchronously don't have a tenantId context. Future work:
 * make planLimit(tenantId, plan, key) async with the same DB-first,
 * map-fallback structure isEntitled uses.
 */
export function planLimit(plan: Plan, key: LimitKey): number {
  const raw = PLAN_ENTITLEMENTS[plan].limits[key];
  return raw === null ? Infinity : raw;
}

// ─────────────────────────────────────────────────────────────
// DB-backed plan feature grants. Cached per pricingPlanId so
// repeated isEntitled calls inside a single request don't re-query.
// Publish/save flows flush both `pricing:published` and
// `pricing:all` tags, so admin edits propagate immediately.
//
// A key is "granted" when:
//   BOOLEAN cell  → valueBool === true
//   NUMBER  cell  → valueNumber != null && valueNumber !== 0
//                   (includes -1 "unlimited")
//   TEXT    cell  → non-empty string
// Same "included" test used by the marketing adapter in lib/plans.
//
// Only GATE-enforcement rows are considered — MARKETING_ONLY cells
// are copy-only and intentionally ignored here so the admin can
// rearrange pricing-page bullets without accidentally changing
// runtime behavior.
// ─────────────────────────────────────────────────────────────

const getPlanFeatureGrants = unstable_cache(
  async (pricingPlanId: string): Promise<Record<string, boolean>> => {
    const rows = await db.planFeatureValue.findMany({
      where: {
        planId: pricingPlanId,
        feature: { enforcement: "GATE" },
      },
      select: {
        valueBool: true,
        valueNumber: true,
        valueText: true,
        feature: { select: { key: true, valueType: true } },
      },
    });
    const out: Record<string, boolean> = {};
    for (const r of rows) {
      const k = r.feature.key;
      switch (r.feature.valueType) {
        case "BOOLEAN":
          out[k] = !!r.valueBool;
          break;
        case "NUMBER":
          out[k] = r.valueNumber != null && r.valueNumber !== 0;
          break;
        case "TEXT":
          out[k] = !!r.valueText && r.valueText.trim().length > 0;
          break;
      }
    }
    return out;
  },
  ["plan-feature-grants"],
  {
    tags: [PRICING_CACHE_TAGS.published, PRICING_CACHE_TAGS.all],
    revalidate: 3600,
  },
);

/**
 * Resolve a feature flag for a tenant. Checks in order:
 *   1. per-tenant override (FeatureFlag row with tenantId set)
 *   2. global override     (FeatureFlag row with tenantId = null)
 *   3. PricingPlan grant   (PlanFeatureValue, DB-backed, cached)
 *   4. plan default        (PLAN_ENTITLEMENTS fallback)
 *
 * We fetch the tenant's pricingPlanId alongside the FeatureFlag rows
 * in a single `Promise.all` so the hot path stays at two round-trips
 * (one uncached + one cached-after-first-hit). `plan` is still passed
 * in because the fallback map is keyed by the legacy enum and the
 * caller typically already has it on TenantContext.
 */
export async function isEntitled(
  tenantId: string,
  plan: Plan,
  key: FeatureKey,
): Promise<boolean> {
  const [overrides, tenant] = await Promise.all([
    db.featureFlag.findMany({
      where: { key, OR: [{ tenantId }, { tenantId: null }] },
      select: { tenantId: true, enabled: true },
    }),
    db.tenant.findUnique({
      where: { id: tenantId },
      select: { pricingPlanId: true },
    }),
  ]);

  const perTenant = overrides.find((f) => f.tenantId === tenantId);
  if (perTenant) return perTenant.enabled;

  const global = overrides.find((f) => f.tenantId === null);
  if (global) return global.enabled;

  if (tenant?.pricingPlanId) {
    const grants = await getPlanFeatureGrants(tenant.pricingPlanId);
    if (key in grants) return grants[key];
    // Key absent from DB plan → fall through to legacy map.
  }

  return PLAN_ENTITLEMENTS[plan].features[key];
}

/**
 * Batch-resolve every feature key for a tenant. Used by the tenant
 * detail page to render the full entitlement matrix with "inherited /
 * overridden" state, and by SSR-heavy pages that gate multiple features
 * at once. Same four-tier resolution as `isEntitled`.
 */
export async function resolveAllEntitlements(
  tenantId: string,
  plan: Plan,
): Promise<Record<FeatureKey, { value: boolean; source: "plan" | "global" | "tenant" }>> {
  const [overrides, tenant] = await Promise.all([
    db.featureFlag.findMany({
      where: { OR: [{ tenantId }, { tenantId: null }] },
      select: { key: true, tenantId: true, enabled: true },
    }),
    db.tenant.findUnique({
      where: { id: tenantId },
      select: { pricingPlanId: true },
    }),
  ]);

  const dbGrants = tenant?.pricingPlanId
    ? await getPlanFeatureGrants(tenant.pricingPlanId)
    : null;
  const planDefaults = PLAN_ENTITLEMENTS[plan].features;

  const keys = Object.keys(planDefaults) as FeatureKey[];
  const out: Record<string, { value: boolean; source: "plan" | "global" | "tenant" }> = {};
  for (const k of keys) {
    const perTenant = overrides.find((f) => f.key === k && f.tenantId === tenantId);
    if (perTenant) { out[k] = { value: perTenant.enabled, source: "tenant" }; continue; }
    const global = overrides.find((f) => f.key === k && f.tenantId === null);
    if (global) { out[k] = { value: global.enabled, source: "global" }; continue; }
    // "plan" bucket covers both DB grants and legacy fallback — from the
    // tenant admin's perspective the distinction is noise ("you're on
    // Pro, Pro gives you X" reads the same either way).
    if (dbGrants && k in dbGrants) {
      out[k] = { value: dbGrants[k], source: "plan" };
      continue;
    }
    out[k] = { value: planDefaults[k], source: "plan" };
  }
  return out as Record<FeatureKey, { value: boolean; source: "plan" | "global" | "tenant" }>;
}
