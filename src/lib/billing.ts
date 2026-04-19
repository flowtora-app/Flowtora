import { stripe, PRICE_IDS } from "@/lib/stripe";
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

export async function createCheckoutSession(opts: {
  tenant: Tenant;
  ownerEmail: string;
  plan: Exclude<Plan, "ENTERPRISE">;
  returnUrl: string;
}): Promise<string | null> {
  if (!stripe) return null;
  const priceId = PRICE_IDS[opts.plan];
  if (!priceId) return null;

  const customerId = await ensureStripeCustomer(opts.tenant, opts.ownerEmail);
  if (!customerId) return null;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${opts.returnUrl}?checkout=success`,
    cancel_url: `${opts.returnUrl}?checkout=canceled`,
    subscription_data: {
      metadata: { tenantId: opts.tenant.id, plan: opts.plan },
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
