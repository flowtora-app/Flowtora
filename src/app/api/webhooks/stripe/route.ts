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
        // Resolve the plan the customer is actually on. M6 swap: try
        // PricingPlan DB lookup first (matches on stripePriceMonthly /
        // stripePriceAnnual), then subscription metadata, then the
        // legacy PRICE_IDS env map. DB lookup gives us BOTH the new
        // pricingPlanId FK and the legacy Plan enum so we can dual-
        // write and eventually retire the enum.
        const resolved = await resolvePlanFromSubscription(sub);
        await db.tenant.update({
          where: { id: tenant.id },
          data: {
            stripeSubscriptionId: sub.id,
            status,
            ...(resolved?.plan ? { plan: resolved.plan } : {}),
            ...(resolved?.pricingPlanId
              ? { pricingPlanId: resolved.pricingPlanId }
              : {}),
          },
        });
        await logAudit({
          tenantId: tenant.id,
          action: `stripe.${event.type}`,
          metadata: {
            subId: sub.id,
            status,
            plan: resolved?.plan ?? null,
            pricingPlanId: resolved?.pricingPlanId ?? null,
            resolvedVia: resolved?.source ?? "unresolved",
          },
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

// Derive tenant plan identifiers from a Stripe subscription. Returns
// BOTH the new pricingPlanId (DB FK to PricingPlan) and the legacy
// Plan enum, when we can infer them. Sources, in order:
//
//   1. PricingPlan DB lookup on the line-item priceId. The admin
//      Pricing tab writes stripePriceMonthly / stripePriceAnnual back
//      to the row on each sync, so a fresh checkout will already
//      match. This is the canonical source post-M6.
//
//   2. `subscription.metadata.plan` — we stamp this in
//      createCheckoutSession. Works for subs created before their
//      plan was M5-synced to Stripe, and covers the short window where
//      the Price row exists in Stripe but not yet written back.
//      Returns the legacy enum only; pricingPlanId stays null (the
//      slug isn't in metadata today).
//
//   3. Legacy PRICE_IDS env map — pre-M5 checkouts that were never
//      routed through a PricingPlan row. Returns the enum only;
//      pricingPlanId stays null.
//
// Returns null if nothing matches — caller leaves both fields
// untouched in that case. The legacy `plan` field is optional so we
// can stop writing it once the enum is retired without changing the
// call site.
async function resolvePlanFromSubscription(
  sub: Stripe.Subscription,
): Promise<
  | { plan: Plan | null; pricingPlanId: string | null; source: "db" | "metadata" | "env" }
  | null
> {
  const priceId = sub.items?.data?.[0]?.price?.id;

  // 1. DB lookup — newest source of truth.
  if (priceId) {
    const row = await db.pricingPlan.findFirst({
      where: {
        OR: [
          { stripePriceMonthly: priceId },
          { stripePriceAnnual: priceId },
        ],
      },
      select: { id: true, slug: true },
    });
    if (row) {
      return {
        plan: mapSlugToLegacyEnum(row.slug),
        pricingPlanId: row.id,
        source: "db",
      };
    }
  }

  // 2. Subscription metadata.
  const fromMeta = (sub.metadata?.plan ?? "").toUpperCase();
  if (fromMeta === "STARTER" || fromMeta === "GROWTH" || fromMeta === "PRO") {
    return {
      plan: fromMeta as Plan,
      pricingPlanId: null,
      source: "metadata",
    };
  }

  // 3. Legacy env table.
  if (priceId) {
    for (const [plan, prices] of Object.entries(PRICE_IDS) as [
      Plan,
      { monthly: string; annual: string },
    ][]) {
      if (priceId === prices.monthly || priceId === prices.annual) {
        return { plan, pricingPlanId: null, source: "env" };
      }
    }
  }

  return null;
}

// Map a PricingPlan.slug back to the legacy Plan enum for dual-write.
// Slugs that don't match a known enum value yield null so we just
// skip the legacy field — the new pricingPlanId FK still lands.
// Once the enum is fully retired this helper goes away.
function mapSlugToLegacyEnum(slug: string): Plan | null {
  switch (slug.toLowerCase()) {
    case "starter":
      return "STARTER";
    case "growth":
      return "GROWTH";
    case "pro":
      return "PRO";
    case "enterprise":
      return "ENTERPRISE";
    default:
      return null;
  }
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
