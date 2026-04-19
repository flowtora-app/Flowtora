import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
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
        await db.tenant.update({
          where: { id: tenant.id },
          data: { stripeSubscriptionId: sub.id, status },
        });
        await logAudit({ tenantId: tenant.id, action: `stripe.${event.type}`, metadata: { subId: sub.id, status } });
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
