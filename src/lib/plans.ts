// Pricing-plan catalog helpers.
//
// Reads the `PricingPlan` + `PlanFeature` + `PlanFeatureValue` tables
// and produces a shape the marketing page, admin editor, and signup
// flow can all consume. Wrapped in `unstable_cache` with tag-based
// invalidation so hitting /pricing doesn't re-query on every render —
// the admin "Publish" action bumps the tag to flush.
//
// Tags:
//   pricing:published  — any list of published plans (marketing + signup)
//   pricing:all        — admin editor listing (includes drafts)
//
// Note: `src/lib/pricing.ts` is already taken by quote-line price math
// (FIXED / PER_SQFT / LABOR_HOURLY etc.). That's unrelated; this file
// is about subscription plans the tenant buys. Kept separate to avoid
// conflating two "pricing" concepts.

import { unstable_cache } from "next/cache";
import type { PlanStatus } from "@prisma/client";
import { db } from "@/lib/db";
import type { PricingTier, PricingFeature } from "@/components/marketing/PricingTable";

export const PRICING_CACHE_TAGS = {
  published: "pricing:published",
  all: "pricing:all",
} as const;

// ─────────────────────────────────────────────────────────────
// Output shapes. The admin editor, marketing page, and signup
// flow share the same types so adding a field is a one-file edit.
// Prices are `number | null` (Decimal stringified via Number()) to
// keep the consumer code simple — Decimal is a runtime class that
// doesn't round-trip through JSON cleanly.
// ─────────────────────────────────────────────────────────────

export type PlanFeatureValueOut = {
  key: string;          // PlanFeature.key — matches FeatureKey/LimitKey
  label: string;
  groupLabel: string | null;
  description: string | null;
  valueType: "BOOLEAN" | "NUMBER" | "TEXT";
  enforcement: "GATE" | "MARKETING_ONLY";
  // Exactly one of these is canonical, picked by valueType.
  valueBool: boolean | null;
  valueNumber: number | null; // -1 = unlimited
  valueText: string | null;
  footnote: string | null;
  highlight: boolean;
  // For the rendering layer — already sorted ascending.
  groupSortOrder: number;
  sortOrder: number;
};

export type PlanOut = {
  id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  badge: string | null;
  status: PlanStatus;
  highlight: boolean;
  sortOrder: number;
  priceMonthly: number | null;
  priceAnnual: number | null;
  currency: string;
  isContactSales: boolean;
  trialDays: number | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  landingCopy: string | null;
  marketingCopy: string | null;
  showOnLanding: boolean;
  showOnPricing: boolean;
  showOnSignup: boolean;
  features: PlanFeatureValueOut[];
};

// Internal: convert a Prisma row (with relations) into the serializable
// PlanOut. Pulled out so both the cached and uncached fetchers use the
// same mapping.
function toPlanOut(
  plan: Awaited<ReturnType<typeof fetchPlansRaw>>[number],
): PlanOut {
  const features: PlanFeatureValueOut[] = plan.featureValues
    .map((fv) => ({
      key: fv.feature.key,
      label: fv.feature.label,
      groupLabel: fv.feature.groupLabel,
      description: fv.feature.description,
      valueType: fv.feature.valueType,
      enforcement: fv.feature.enforcement,
      valueBool: fv.valueBool,
      valueNumber: fv.valueNumber,
      valueText: fv.valueText,
      footnote: fv.footnote,
      highlight: fv.highlight,
      groupSortOrder: fv.feature.groupSortOrder,
      sortOrder: fv.feature.sortOrder,
    }))
    // Sort so consumers can render without re-sorting.
    .sort(
      (a, b) =>
        a.groupSortOrder - b.groupSortOrder || a.sortOrder - b.sortOrder,
    );

  return {
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    subtitle: plan.subtitle,
    description: plan.description,
    badge: plan.badge,
    status: plan.status,
    highlight: plan.highlight,
    sortOrder: plan.sortOrder,
    priceMonthly: plan.priceMonthly == null ? null : Number(plan.priceMonthly),
    priceAnnual: plan.priceAnnual == null ? null : Number(plan.priceAnnual),
    currency: plan.currency,
    isContactSales: plan.isContactSales,
    trialDays: plan.trialDays,
    ctaLabel: plan.ctaLabel,
    ctaHref: plan.ctaHref,
    landingCopy: plan.landingCopy,
    marketingCopy: plan.marketingCopy,
    showOnLanding: plan.showOnLanding,
    showOnPricing: plan.showOnPricing,
    showOnSignup: plan.showOnSignup,
    features,
  };
}

async function fetchPlansRaw(where: { status?: PlanStatus }) {
  return db.pricingPlan.findMany({
    where,
    orderBy: { sortOrder: "asc" },
    include: {
      featureValues: {
        include: { feature: true },
      },
    },
  });
}

// ─────────────────────────────────────────────────────────────
// Public helpers.
// ─────────────────────────────────────────────────────────────

/**
 * Published plans, cached with the `pricing:published` tag.
 *
 * The marketing page (/pricing), the home page tier cards, and the
 * /signup flow all go through this. Admin "Publish" bumps the tag
 * via `revalidateTag(PRICING_CACHE_TAGS.published)` so changes land
 * on the public site immediately without redeploying.
 */
export const getPublishedPlans = unstable_cache(
  async (): Promise<PlanOut[]> => {
    const rows = await fetchPlansRaw({ status: "PUBLISHED" });
    return rows.map(toPlanOut);
  },
  ["pricing-plans-published"],
  {
    tags: [PRICING_CACHE_TAGS.published],
    revalidate: 3600, // safety net — tag invalidation is the primary mechanism
  },
);

/**
 * Every plan (DRAFT + PUBLISHED + HIDDEN + ARCHIVED). Used by the
 * admin editor. Shorter cache + `pricing:all` tag so publish/save
 * flows invalidate both tags in one step.
 */
export const getAllPlans = unstable_cache(
  async (): Promise<PlanOut[]> => {
    const rows = await fetchPlansRaw({});
    return rows.map(toPlanOut);
  },
  ["pricing-plans-all"],
  {
    tags: [PRICING_CACHE_TAGS.all, PRICING_CACHE_TAGS.published],
    revalidate: 60,
  },
);

/**
 * Single plan by slug (published only). Returns null if the slug
 * doesn't match a published row — callers (like /signup?plan=xxx)
 * should fall back to a default plan or show an error.
 */
export async function getPublishedPlanBySlug(
  slug: string,
): Promise<PlanOut | null> {
  const plans = await getPublishedPlans();
  return plans.find((p) => p.slug === slug) ?? null;
}

/**
 * Convenience: a plan's feature-value lookup keyed by feature.key.
 * Useful when gating: `values.get("installScheduling")?.valueBool`.
 */
export function featureValueMap(plan: PlanOut): Map<string, PlanFeatureValueOut> {
  return new Map(plan.features.map((f) => [f.key, f] as const));
}

// ─────────────────────────────────────────────────────────────
// Marketing adapters.
//
// The `PricingTable` / `PricingToggle` components were originally fed
// by a hand-written `PricingTier[]` in `lib/marketing/pricing.ts` (now
// deleted). M2 swaps that for DB-backed data: the admin edits
// PricingPlan rows, these adapters convert each row into the
// `PricingTier` shape the component expects so we don't have to touch
// the component itself.
//
// Two modes:
//   "landing" → compact bullet list (max 5 by default) for the home
//               page pricing teaser. Only shows "included" bullets.
//   "full"    → every feature cell, including excluded ones (shown as
//               a dash). Used on /pricing under the PricingToggle.
// ─────────────────────────────────────────────────────────────

type TierMode = "landing" | "full";

// Is a feature-value cell "included" for the current plan?
//   BOOLEAN — true
//   NUMBER  — any non-zero cap (positive means N, -1 means unlimited)
//   TEXT    — any non-empty value
// Used by landing-mode to drop excluded rows before capping.
function isFeatureIncluded(fv: PlanFeatureValueOut): boolean {
  switch (fv.valueType) {
    case "BOOLEAN":
      return !!fv.valueBool;
    case "NUMBER":
      return fv.valueNumber != null && fv.valueNumber !== 0;
    case "TEXT":
      return !!fv.valueText && fv.valueText.trim().length > 0;
    default:
      return false;
  }
}

// Turn one feature-value cell into a marketing bullet. Returns null if
// the cell has nothing meaningful to show (e.g. NUMBER valueType with
// no valueNumber set).
function featureToBullet(fv: PlanFeatureValueOut): PricingFeature | null {
  const note = fv.footnote ?? undefined;
  switch (fv.valueType) {
    case "BOOLEAN":
      return {
        label: fv.label,
        included: !!fv.valueBool,
        ...(note ? { note } : {}),
      };
    case "NUMBER": {
      if (fv.valueNumber == null) return null;
      // -1 is the sentinel for "unlimited" — seeded that way for
      // Enterprise's maxUsers/maxLocations. Render as "Unlimited X".
      if (fv.valueNumber < 0) {
        return {
          label: `Unlimited ${fv.label.toLowerCase()}`,
          included: true,
          ...(note ? { note } : {}),
        };
      }
      // 0 caps render as an excluded bullet — "not on this plan".
      if (fv.valueNumber === 0) {
        return {
          label: fv.label,
          included: false,
          ...(note ? { note } : {}),
        };
      }
      return {
        label: `${fv.valueNumber} ${fv.label.toLowerCase()}`,
        included: true,
        ...(note ? { note } : {}),
      };
    }
    case "TEXT":
      if (!fv.valueText) return null;
      return {
        label: `${fv.label}: ${fv.valueText}`,
        included: true,
        ...(note ? { note } : {}),
      };
    default:
      return null;
  }
}

/**
 * Convert a PlanOut into the component-shaped PricingTier. `mode` picks
 * how many bullets to show and whether to include excluded ones:
 *
 *   - landing: included-only, capped at `maxFeatures` (default 5)
 *   - full:    every feature, no cap
 */
export function planToPricingTier(
  plan: PlanOut,
  opts: { mode: TierMode; maxFeatures?: number } = { mode: "full" },
): PricingTier {
  const price: PricingTier["price"] = plan.isContactSales
    ? "custom"
    : {
        monthly: plan.priceMonthly ?? 0,
        ...(plan.priceAnnual != null ? { annual: plan.priceAnnual } : {}),
      };

  // Bullet pipeline.
  //
  // Full mode: every feature, in seed sort order, excluded ones shown
  // with a dash.
  //
  // Landing mode: included-only, capped at `maxFeatures`. We order the
  // source list so *highlighted* features lead — otherwise Starter,
  // Pro, and Enterprise all show the same top-5 bullets (seats,
  // locations, storage, portal, proofs) since those sit first in the
  // feature library and the truncate cuts off each tier's actual
  // differentiators (installs / production / franchise / SSO…).
  const bulletSource =
    opts.mode === "landing"
      ? (() => {
          const included = plan.features.filter(isFeatureIncluded);
          const highlighted = included.filter((f) => f.highlight);
          const others = included.filter((f) => !f.highlight);
          return [...highlighted, ...others].slice(0, opts.maxFeatures ?? 5);
        })()
      : plan.features;

  const bullets = bulletSource
    .map(featureToBullet)
    .filter((b): b is PricingFeature => b !== null);

  // CTA: use admin-configured label/href; default to /signup?plan=<slug>
  // so existing purchase routing keeps working without every plan
  // having to set ctaHref explicitly.
  const ctaHref = plan.ctaHref ?? `/signup?plan=${plan.slug}`;
  const ctaLabel = plan.ctaLabel ?? `Get ${plan.name}`;

  return {
    name: plan.name,
    description: plan.subtitle ?? plan.description ?? "",
    price,
    ...(plan.highlight ? { highlight: true as const } : {}),
    cta: { label: ctaLabel, href: ctaHref },
    features: bullets,
  };
}

/**
 * Format a plan's headline price as a short tagline — used in the
 * /pricing compare-table header where we don't have room for the full
 * card. "$79 /mo", "$199 /mo", or "Custom" for contact-sales tiers.
 */
export function formatPlanTagline(plan: PlanOut): string {
  if (plan.isContactSales || plan.priceMonthly == null) return "Custom";
  // Marketing prices are whole dollars today; keep the format tight.
  return `$${Math.round(plan.priceMonthly)} /mo`;
}
