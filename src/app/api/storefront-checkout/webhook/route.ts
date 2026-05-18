import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { headers } from "next/headers";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";

// Stripe webhook for storefront checkout payments (S-5).
//
// Listens for `checkout.session.completed` events on sessions we
// stamp with `metadata.kind === "storefront-deposit"`. On success we:
//
//   1. Look up the corresponding Quote via metadata.quoteId.
//   2. Mark the Quote's customerNote with a "Deposit paid" line so
//      the staff inbox sees the payment confirmation at a glance.
//
// The real Payment-record creation needs an Invoice to attach to,
// which the storefront flow doesn't generate yet — the tenant
// converts the Quote → Invoice → Payment inside the workspace.
// This webhook just confirms the payment event so the quote isn't
// silently waiting.
//
// Configure this URL in the Stripe Dashboard:
//   https://{host}/api/storefront-checkout/webhook
// Filter to `checkout.session.completed` events. Set
// STRIPE_STOREFRONT_WEBHOOK_SECRET so signature verification works.

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 503 },
    );
  }

  const secret = process.env.STRIPE_STOREFRONT_WEBHOOK_SECRET;
  if (!secret) {
    // Operating without verification is a security risk — return 503
    // so Stripe retries until the secret is set, rather than silently
    // accepting unsigned payloads.
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 503 },
    );
  }

  const hdrs = await headers();
  const signature = hdrs.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    return NextResponse.json(
      { error: `Bad signature: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  // We only care about checkout.session.completed for now.
  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const metadata = session.metadata ?? {};
  if (metadata.kind !== "storefront-deposit") {
    // Not ours — could be a subscription checkout. Ignore politely.
    return NextResponse.json({ received: true });
  }

  const quoteId  = metadata.quoteId;
  const tenantId = metadata.tenantId;
  if (!quoteId || !tenantId) {
    console.warn("[storefront-webhook] missing quoteId/tenantId on session", session.id);
    return NextResponse.json({ received: true });
  }

  // Idempotent — appending the same line twice doesn't break anything.
  // Find the quote first to confirm tenant ownership before touching.
  const quote = await db.quote.findFirst({
    where: { id: quoteId, tenantId },
    select: { id: true, customerNote: true, number: true },
  });
  if (!quote) {
    console.warn("[storefront-webhook] quote not found", quoteId, tenantId);
    return NextResponse.json({ received: true });
  }

  const amountUSD = ((session.amount_total ?? 0) / 100).toFixed(2);
  const stamp = `\n\n[Stripe] Reservation deposit paid: $${amountUSD} (session ${session.id})`;

  // Avoid double-stamping when Stripe retries the webhook.
  const alreadyStamped = (quote.customerNote ?? "").includes(session.id);
  if (!alreadyStamped) {
    await db.quote.update({
      where: { id: quote.id },
      data: { customerNote: (quote.customerNote ?? "") + stamp },
    }).catch((e) => {
      console.error("[storefront-webhook] failed to stamp quote", quote.id, e);
    });
  }

  return NextResponse.json({ received: true, quote: quote.number });
}
