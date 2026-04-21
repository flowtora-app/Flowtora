import { NextResponse } from "next/server";
import { stripe, PRICE_IDS } from "@/lib/stripe";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import type { Plan } from "@prisma/client";
import type Stripe from "stripe";

// Stripe sends raw body; we must verify the signature with the raw bytes.
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return NextResponse.json({ error: `Bad signature: ${(err as Error).message}` }, { status: 400 });
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const tenant = await db.tenant.findFirst({
        where: { stripeCustomerId: sub.customer as string },
      });
      if (tenant) {
        const status = mapStripeStatus(sub.status);
        // Resolve the plan the customer is actually on. Prefer the
        // subscription metadata we set in createCheckoutSession, then
        // fall back to matching the line-item price against our
        // PRICE_IDS table. Without this the tenant.plan field sticks
        // on its default (STARTER) even after a Pro purchase, which
        // made the in-app billing page show the wrong current plan.
        const plan = resolvePlanFromSubscription(sub);
        await db.tenant.update({
          where: { id: tenant.id },
          data: {
            stripeSubscriptionId: sub.id,
            status,
            ...(plan ? { plan } : {}),
          },
        });
        await logAudit({
          tenantId: tenant.id,
          action: `stripe.${event.type}`,
          metadata: { subId: sub.id, status, plan: plan ?? null },
        });
      }
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const tenant = await db.tenant.findFirst({
        where: { stripeSubscriptionId: sub.id },
      });
      if (tenant) {
        await db.tenant.update({ where: { id: tenant.id }, data: { status: "CANCELED" } });
        await logAudit({ tenantId: tenant.id, action: "stripe.subscription.canceled" });
      }
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const tenant = await db.tenant.findFirst({
        where: { stripeCustomerId: invoice.customer as string },
      });
      if (tenant) {
        await db.tenant.update({ where: { id: tenant.id }, data: { status: "PAST_DUE" } });
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}

// Derive tenant.plan from a Stripe subscription. Two sources, in order:
//   1. `subscription.metadata.plan` — we stamp this in createCheckoutSession
//      as the source of truth. Works for every new subscription.
//   2. Line-item price ID → match against PRICE_IDS. Covers older subs
//      from before metadata stamping landed, and any subs created
//      through Stripe's dashboard / billing portal plan switcher
//      (which doesn't carry our metadata forward).
// Returns null if neither source yields a known plan — caller leaves
// tenant.plan untouched in that case.
function resolvePlanFromSubscription(sub: Stripe.Subscription): Plan | null {
  const fromMeta = (sub.metadata?.plan ?? "").toUpperCase();
  if (fromMeta === "STARTER" || fromMeta === "GROWTH" || fromMeta === "PRO") {
    return fromMeta;
  }

  const priceId = sub.items?.data?.[0]?.price?.id;
  if (!priceId) return null;
  for (const [plan, prices] of Object.entries(PRICE_IDS) as [
    Plan,
    { monthly: string; annual: string },
  ][]) {
    if (priceId === prices.monthly || priceId === prices.annual) return plan;
  }
  return null;
}

function mapStripeStatus(s: Stripe.Subscription.Status) {
  switch (s) {
    case "active":
    case "trialing":
      return "ACTIVE" as const;
    case "past_due":
    case "unpaid":
      return "PAST_DUE" as const;
    case "canceled":
    case "incomplete_expired":
      return "CANCELED" as const;
    default:
      return "TRIAL" as const;
  }
}
