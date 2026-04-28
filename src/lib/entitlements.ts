// Phase 17 Slice C — plan entitlements + feature flag resolution.
// M6 — read plan grants from PlanFeatureValue (the admin-editable
// source) instead of the hardcoded PLAN_ENTITLEMENTS map. The map
// stays as a fallback for tenants without a pricingPlanId yet and
// for keys the DB plan doesn't define (e.g. betaProofAnnotations
// which only exists as a per-tenant override today).
//
// Callers use `isEntitled(tenantId, plan, "featureKey")` to ask
// "is this tenant allowed to use this?" for boolean gates, and
// `planLimit(tenantId, plan, "maxUsers")` for numeric caps. Both are
// async and DB-backed — the admin-editable PlanFeatureValue table is
// the source of truth, with PLAN_ENTITLEMENTS only kicking in as a
// fallback for legacy tenants without a pricingPlanId.
//
// Resolution order:
//   isEntitled (BOOLEAN gates)             planLimit (NUMBER caps)
//   1. Per-tenant FeatureFlag override     1. PricingPlan grant (DB, cached)
//   2. Global FeatureFlag override         2. PLAN_ENTITLEMENTS legacy fallback
//   3. PricingPlan grant (DB, cached)
//   4. PLAN_ENTITLEMENTS legacy fallback
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
  | "vendors_expenses"        // Track vendor bills + job-linked expenses
  | "sso"                     // SAML / OIDC sign-in — placeholder until SSO ships
  | "betaProofAnnotations";   // placeholder — flip per-tenant for early access

export type LimitKey =
  | "maxUsers"
  | "maxLocations"
  | "maxProducts"
  | "maxCustomers"
  | "storageQuotaGB"; // total file storage in gigabytes — -1 = unlimited

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
      vendors_expenses: false,
      sso: false,
      betaProofAnnotations: false,
    },
    limits: {
      maxUsers: 3,
      maxLocations: 1,
      maxProducts: 50,
      maxCustomers: 200,
      storageQuotaGB: 5,
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
      vendors_expenses: true,
      sso: false,
      betaProofAnnotations: false,
    },
    limits: {
      maxUsers: 10,
      maxLocations: 1,
      maxProducts: 500,
      maxCustomers: 2000,
      storageQuotaGB: 50,
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
      vendors_expenses: true,
      sso: false,
      betaProofAnnotations: false,
    },
    limits: {
      maxUsers: 25,
      maxLocations: 10,
      maxProducts: null,
      maxCustomers: null,
      storageQuotaGB: 200,
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
      vendors_expenses: true,
      sso: true,
      betaProofAnnotations: true,
    },
    limits: {
      maxUsers: null,
      maxLocations: null,
      maxProducts: null,
      maxCustomers: null,
      storageQuotaGB: null,
    },
  },
};

/**
 * Read a hard numeric cap for a tenant. Returns `Infinity` for unlimited
 * so callers can write `count >= cap` without special-casing.
 *
 * DB-first, hardcoded-map fallback — same four-tier resolution as
 * `isEntitled()` but for NUMBER limit cells (maxUsers, maxLocations,
 * maxProducts, maxCustomers). Reads from the `PlanFeatureValue` row
 * matching the tenant's `pricingPlanId`; if the tenant has no
 * pricingPlanId (legacy / not-yet-subscribed) or the key isn't in the
 * matrix, falls through to `PLAN_ENTITLEMENTS[plan].limits[key]`.
 *
 * Convention in the DB cells:
 *   valueNumber === -1  → Infinity  (unlimited)
 *   valueNumber == null → fall through to hardcoded map
 *   otherwise           → use the number as-is
 */
export async function planLimit(
  tenantId: string,
  plan: Plan,
  key: LimitKey,
): Promise<number> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { pricingPlanId: true },
  });

  if (tenant?.pricingPlanId) {
    const limits = await getPlanLimitGrants(tenant.pricingPlanId);
    if (key in limits) {
      const v = limits[key]!;
      return v === -1 ? Infinity : v;
    }
  }

  const raw = PLAN_ENTITLEMENTS[plan].limits[key];
  return raw === null ? Infinity : raw;
}

// Cached per pricingPlanId — same TTL/tags as the boolean grants so
// admin edits to a number cell propagate immediately on save.
const getPlanLimitGrants = unstable_cache(
  async (pricingPlanId: string): Promise<Record<string, number>> => {
    const rows = await db.planFeatureValue.findMany({
      where: {
        planId: pricingPlanId,
        feature: {
          enforcement: "GATE",
          valueType: "NUMBER",
        },
      },
      select: {
        valueNumber: true,
        feature: { select: { key: true } },
      },
    });
    const out: Record<string, number> = {};
    for (const r of rows) {
      if (r.valueNumber !== null) {
        out[r.feature.key] = r.valueNumber;
      }
    }
    return out;
  },
  ["plan-limit-grants"],
  {
    tags: [PRICING_CACHE_TAGS.published, PRICING_CACHE_TAGS.all],
    revalidate: 3600,
  },
);

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
