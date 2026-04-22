import { stripe, PRICE_IDS, type BillingCycle } from "@/lib/stripe";
import { db } from "@/lib/db";
import type { Plan, Tenant } from "@prisma/client";

export const PLAN_LABELS: Record<Plan, string> = {
  STARTER: "Starter",
  GROWTH: "Growth",
  PRO: "Pro",
  ENTERPRISE: "Enterprise",
};

export const PLAN_PRICES = PRICE_IDS;

/** Ensure the tenant has a Stripe customer; create one on first use. */
export async function ensureStripeCustomer(tenant: Tenant, ownerEmail: string): Promise<string | null> {
  if (!stripe) return null;
  if (tenant.stripeCustomerId) return tenant.stripeCustomerId;

  const customer = await stripe.customers.create({
    email: ownerEmail,
    name: tenant.name,
    metadata: { tenantId: tenant.id, slug: tenant.slug },
  });

  await db.tenant.update({
    where: { id: tenant.id },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

// Resolve the right Stripe price ID for a plan + cycle.
//
// Resolution order (post-M6):
//   1. DB — PricingPlan row matched by slug (admin-managed, written by
//      "Sync to Stripe"). This is the source of truth once an admin has
//      pushed prices to Stripe from /platform/plans.
//   2. Env map (PRICE_IDS) — legacy fallback for deploys that predate
//      M6 and still configure prices via STRIPE_PRICE_* env vars.
//
// Falls back to monthly when annual isn't configured so deploys missing
// the annual price don't hard-fail the checkout flow — they just bill
// monthly instead of annually until the admin fills in the annual price.
async function resolvePriceId(
  plan: Exclude<Plan, "ENTERPRISE">,
  cycle: BillingCycle,
): Promise<string | null> {
  // 1. DB — match PricingPlan by slug. Plan enum is uppercase
  //    (STARTER/GROWTH/PRO); slugs are lowercase.
  const slug = plan.toLowerCase();
  const row = await db.pricingPlan.findUnique({
    where: { slug },
    select: { stripePriceMonthly: true, stripePriceAnnual: true },
  });
  if (row) {
    const dbPreferred = cycle === "annual" ? row.stripePriceAnnual : row.stripePriceMonthly;
    if (dbPreferred) return dbPreferred;
    if (cycle === "annual" && row.stripePriceMonthly) return row.stripePriceMonthly;
  }

  // 2. Env fallback. Empty string = unset → falls through.
  const table = PRICE_IDS[plan];
  if (!table) return null;
  const preferred = cycle === "annual" ? table.annual : table.monthly;
  if (preferred) return preferred;
  if (cycle === "annual" && table.monthly) return table.monthly;
  return null;
}

export async function createCheckoutSession(opts: {
  tenant: Tenant;
  ownerEmail: string;
  plan: Exclude<Plan, "ENTERPRISE">;
  cycle?: BillingCycle;
  returnUrl: string;
}): Promise<string | null> {
  if (!stripe) return null;
  const cycle = opts.cycle ?? "monthly";
  const priceId = await resolvePriceId(opts.plan, cycle);
  if (!priceId) return null;

  const customerId = await ensureStripeCustomer(opts.tenant, opts.ownerEmail);
  if (!customerId) return null;

  // Build success/cancel URLs that preserve any query params callers
  // may have baked into returnUrl (e.g. /welcome?plan=PRO&cycle=annual).
  // A naive `${returnUrl}?checkout=success` would blow those away or
  // produce an invalid `?a=b?checkout=success`.
  const successUrl = new URL(opts.returnUrl);
  successUrl.searchParams.set("checkout", "success");
  const cancelUrl = new URL(opts.returnUrl);
  cancelUrl.searchParams.set("checkout", "canceled");

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl.toString(),
    cancel_url: cancelUrl.toString(),
    subscription_data: {
      metadata: { tenantId: opts.tenant.id, plan: opts.plan, cycle },
    },
  });
  return session.url ?? null;
}

export async function createPortalSession(opts: {
  tenant: Tenant;
  returnUrl: string;
}): Promise<string | null> {
  if (!stripe || !opts.tenant.stripeCustomerId) return null;
  const session = await stripe.billingPortal.sessions.create({
    customer: opts.tenant.stripeCustomerId,
    return_url: opts.returnUrl,
  });
  return session.url;
}
