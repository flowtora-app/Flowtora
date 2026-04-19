import type { Tenant } from "@prisma/client";
import { db } from "@/lib/db";

// Phase 19 — launch readiness checklist.
//
// Derives a go/no-go report from existing tenant state. Everything is
// computed from fields / counts already in the database; we don't store
// "readiness" as its own column because it would immediately drift out
// of sync with the underlying signals it represents.

export type ReadinessCheck = {
  id:       string;
  label:    string;
  done:     boolean;
  required: boolean;
  hint?:    string;
};

export type ReadinessReport = {
  checks:        ReadinessCheck[];
  doneCount:     number;
  totalCount:    number;
  requiredDone:  number;
  requiredTotal: number;
  ready:         boolean; // every required check passes
  percent:       number;  // overall completion (all checks)
};

export type ReadinessInputs = {
  tenant:           Pick<
    Tenant,
    | "name"
    | "phone"
    | "addressLine1"
    | "city"
    | "country"
    | "logoUrl"
    | "brandPrimaryColor"
    | "onboardingCompletedAt"
    | "sampleDataLoadedAt"
    | "sampleDataClearedAt"
    | "stripeCustomerId"
    | "stripeSubscriptionId"
    | "status"
  >;
  memberCount:      number;
  customerCount:    number;
  productCount:     number;
  quoteCount:       number;
  orderCount:       number;
};

/**
 * Compute readiness purely from the input snapshot. Keep this pure so it
 * can run on the tenant detail page (which already has the counts) or on
 * the standalone readiness list (which fetches them in bulk).
 */
export function computeReadiness(inputs: ReadinessInputs): ReadinessReport {
  const { tenant, memberCount, customerCount, productCount, quoteCount, orderCount } = inputs;

  const profileFilled =
    Boolean(tenant.name) &&
    Boolean(tenant.phone) &&
    Boolean(tenant.addressLine1) &&
    Boolean(tenant.city) &&
    Boolean(tenant.country);

  const brandingSet = Boolean(tenant.logoUrl) || Boolean(tenant.brandPrimaryColor);
  const sampleDataStillLoaded =
    Boolean(tenant.sampleDataLoadedAt) && !tenant.sampleDataClearedAt;

  const checks: ReadinessCheck[] = [
    {
      id:       "profile",
      label:    "Business profile filled in",
      done:     profileFilled,
      required: true,
      hint:     "Name, phone, and address (line 1 / city / country) all set.",
    },
    {
      id:       "onboarding",
      label:    "Onboarding wizard completed",
      done:     Boolean(tenant.onboardingCompletedAt),
      required: true,
    },
    {
      id:       "branding",
      label:    "Logo or brand color set",
      done:     brandingSet,
      required: false,
      hint:     "Either a logo upload or a brand primary color is enough.",
    },
    {
      id:       "team",
      label:    "Team has at least 2 active members",
      done:     memberCount >= 2,
      required: false,
    },
    {
      id:       "first_customer",
      label:    "First customer created",
      done:     customerCount > 0,
      required: true,
    },
    {
      id:       "first_product",
      label:    "First product added",
      done:     productCount > 0,
      required: true,
    },
    {
      id:       "first_quote",
      label:    "First quote created",
      done:     quoteCount > 0,
      required: true,
    },
    {
      id:       "first_order",
      label:    "First order in production",
      done:     orderCount > 0,
      required: false,
    },
    {
      id:       "billing_connected",
      label:    "Stripe customer linked",
      done:     Boolean(tenant.stripeCustomerId),
      required: true,
      hint:     "Required before we can bill the tenant for their subscription.",
    },
    {
      id:       "subscription_active",
      label:    "Subscription active (not trial-only)",
      done:     Boolean(tenant.stripeSubscriptionId) && tenant.status === "ACTIVE",
      required: false,
    },
    {
      id:       "sample_cleared",
      label:    "Sample data cleared",
      done:     !sampleDataStillLoaded,
      required: false,
      hint:     sampleDataStillLoaded
        ? "Tenant is still running on seeded sample records."
        : undefined,
    },
  ];

  const doneCount     = checks.filter((c) => c.done).length;
  const totalCount    = checks.length;
  const requiredDone  = checks.filter((c) => c.required && c.done).length;
  const requiredTotal = checks.filter((c) => c.required).length;
  const ready         = requiredDone === requiredTotal;
  const percent       = Math.round((doneCount / totalCount) * 100);

  return { checks, doneCount, totalCount, requiredDone, requiredTotal, ready, percent };
}

/**
 * Convenience wrapper: fetch the counts we need and run computeReadiness.
 * Used by the standalone /platform/readiness page where we don't already
 * have them in scope.
 */
export async function loadReadinessForTenant(tenantId: string): Promise<ReadinessReport | null> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      name:                  true,
      phone:                 true,
      addressLine1:          true,
      city:                  true,
      country:               true,
      logoUrl:               true,
      brandPrimaryColor:     true,
      onboardingCompletedAt: true,
      sampleDataLoadedAt:    true,
      sampleDataClearedAt:   true,
      stripeCustomerId:      true,
      stripeSubscriptionId:  true,
      status:                true,
    },
  });
  if (!tenant) return null;

  const [memberCount, customerCount, productCount, quoteCount, orderCount] = await Promise.all([
    db.membership.count({ where: { tenantId, status: "ACTIVE" } }),
    db.customer.count({ where: { tenantId } }),
    db.product.count({ where: { tenantId } }),
    db.quote.count({ where: { tenantId } }),
    db.order.count({ where: { tenantId } }),
  ]);

  return computeReadiness({
    tenant, memberCount, customerCount, productCount, quoteCount, orderCount,
  });
}
