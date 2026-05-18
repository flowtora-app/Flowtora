"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { sendEmail } from "@/lib/email";
import { clearCart, getCartSummary, resolveOrCreateCart } from "@/lib/cart";

// Storefront checkout submission (S-5).
//
// Two outcomes per the spec:
//   1. "Pay now"      — creates a Stripe Checkout session for a
//                       reservation deposit ($50 default). Customer
//                       pays Flowtora directly; tenant settles via
//                       Stripe Connect in a future iteration.
//   2. "Request quote" — creates the quote in the tenant workspace
//                        without taking payment; tenant follows up.
//
// Both paths:
//   - Find or create a Customer record in the tenant workspace,
//     matching by lowercased email
//   - Generate the next quote number (Tenant.quoteLastNumber++)
//   - Create a draft Quote with the customer's notes
//   - Notify the tenant via their support inbox
//
// We use a sentinel "storefront" value for Quote.createdBy since the
// submitter isn't an authenticated staff user.

const RESERVATION_AMOUNT_USD = 50; // configurable per-tenant later

const submitSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(80),
  lastName:  z.string().max(80).optional().nullable(),
  email:     z.string().email("Enter a valid email"),
  phone:     z.string().max(40).optional().nullable(),
  company:   z.string().max(120).optional().nullable(),
  notes:     z.string().max(2000).optional().nullable(),
  payment:   z.enum(["now", "quote"]).default("quote"),
});

export async function submitStorefrontCheckout(slug: string, formData: FormData) {
  const parsed = submitSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName:  formData.get("lastName") || null,
    email:     formData.get("email"),
    phone:     formData.get("phone") || null,
    company:   formData.get("company") || null,
    notes:     formData.get("notes") || null,
    payment:   formData.get("payment") || "quote",
  });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`/shop/${slug}/checkout?step=pay&error=${encodeURIComponent(msg)}`);
  }

  const tenant = await db.tenant.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      currency: true,
      emailReplyTo: true,
      quoteNumberPrefix: true,
      quoteLastNumber: true,
    },
  });
  if (!tenant) {
    redirect(`/shop/${slug}/checkout?step=pay&error=${encodeURIComponent("Shop not found")}`);
  }

  const fullName = [parsed.data.firstName, parsed.data.lastName].filter(Boolean).join(" ");
  const customerName = parsed.data.company?.trim() || fullName;
  const emailLc = parsed.data.email.trim().toLowerCase();

  // Find or create the Customer record (CRM). We match by email when
  // present; otherwise create a new lead.
  let customer = await db.customer.findFirst({
    where: {
      tenantId: tenant.id,
      email: { equals: emailLc, mode: "insensitive" },
    },
    select: { id: true, name: true, email: true },
  });

  if (!customer) {
    customer = await db.customer.create({
      data: {
        tenantId: tenant.id,
        name: customerName,
        kind: parsed.data.company ? "BUSINESS" : "INDIVIDUAL",
        email: emailLc,
        phone: parsed.data.phone,
        stage: "NEW_LEAD",
        source: "Storefront",
      },
      select: { id: true, name: true, email: true },
    });
  }

  // Generate the next quote number atomically — increment the
  // counter, then read it back. This mirrors how the workspace's
  // own quote create flow numbers quotes.
  const updatedTenant = await db.tenant.update({
    where: { id: tenant.id },
    data: { quoteLastNumber: { increment: 1 } },
    select: { quoteNumberPrefix: true, quoteLastNumber: true },
  });
  const quoteNumber = `${updatedTenant.quoteNumberPrefix}${updatedTenant.quoteLastNumber}`;

  // Build the customer-facing note (what shows on the portal/PDF).
  const customerNoteParts: string[] = [];
  customerNoteParts.push(`Submitted via storefront on ${new Date().toISOString().slice(0, 10)}.`);
  customerNoteParts.push(`Name: ${fullName}`);
  customerNoteParts.push(`Email: ${parsed.data.email}`);
  if (parsed.data.phone)   customerNoteParts.push(`Phone: ${parsed.data.phone}`);
  if (parsed.data.company) customerNoteParts.push(`Company: ${parsed.data.company}`);
  if (parsed.data.notes)   customerNoteParts.push(`\nProject details:\n${parsed.data.notes}`);

  // Pull the cart so we can attach the configured line items to the
  // new quote. Anonymous carts work too — the session cookie matches
  // them by sessionId. After the quote is created we clear the cart.
  const { cartId } = await resolveOrCreateCart(slug);
  const { items: cartItems, subtotal } = await getCartSummary(cartId);

  // Need product detail (pricingModel + taxable) to seed QuoteItem
  // rows correctly. Pull in one batched query.
  const productIds = cartItems
    .map((i) => i.productId)
    .filter((id): id is string => !!id);
  const products = productIds.length > 0
    ? await db.product.findMany({
        where: { id: { in: productIds }, tenantId: tenant.id },
        select: {
          id: true, pricingModel: true, taxable: true, basePrice: true,
          unit: true, wasteFactorPct: true,
        },
      })
    : [];
  const productMap = new Map(products.map((p) => [p.id, p]));

  const quote = await db.quote.create({
    data: {
      tenantId:    tenant.id,
      customerId:  customer.id,
      number:      quoteNumber,
      status:      "DRAFT",
      customerNote: customerNoteParts.join("\n"),
      subtotal:    new Prisma.Decimal(subtotal),
      total:       new Prisma.Decimal(subtotal),
      createdBy:   "storefront", // sentinel; the workspace UI handles unknown values gracefully
      items: cartItems.length > 0 ? {
        create: cartItems.map((it, i) => {
          const p = it.productId ? productMap.get(it.productId) : null;
          return {
            productId:      it.productId,
            name:           it.name,
            description:    it.description,
            pricingModel:   p?.pricingModel ?? "FIXED",
            basePrice:      new Prisma.Decimal(it.unitPrice),
            unit:           it.unit,
            taxable:        p?.taxable ?? true,
            quantity:       new Prisma.Decimal(it.quantity),
            wasteFactorPct: p?.wasteFactorPct ?? new Prisma.Decimal(0),
            subtotal:       new Prisma.Decimal(it.total),
            sortOrder:      i,
          };
        }),
      } : undefined,
    },
    select: { id: true, number: true },
  });

  // Clear the cart so it doesn't reappear on the next page load.
  await clearCart(cartId).catch(() => { /* non-fatal */ });

  // Best-effort notify the tenant. Resend falls back to console.log
  // in dev when no API key. Skip on send error so the submitter still
  // gets the confirmation.
  if (tenant.emailReplyTo) {
    void sendEmail({
      to:       tenant.emailReplyTo,
      subject:  `New quote request — ${quote.number}`,
      fromName: tenant.name,
      text:
        `${fullName} requested a quote via your storefront.\n\n` +
        `Quote: ${quote.number}\n` +
        `Email: ${parsed.data.email}\n` +
        (parsed.data.phone ? `Phone: ${parsed.data.phone}\n` : "") +
        (parsed.data.company ? `Company: ${parsed.data.company}\n` : "") +
        (parsed.data.notes ? `\nDetails:\n${parsed.data.notes}\n` : "") +
        `\nOpen in workspace: /t/${slug}/quotes/${quote.id}\n`,
      html:
        `<p><strong>${escapeHtml(fullName)}</strong> requested a quote via your storefront.</p>` +
        `<p><strong>Quote:</strong> ${escapeHtml(quote.number)}<br>` +
        `<strong>Email:</strong> ${escapeHtml(parsed.data.email)}<br>` +
        (parsed.data.phone ? `<strong>Phone:</strong> ${escapeHtml(parsed.data.phone)}<br>` : "") +
        (parsed.data.company ? `<strong>Company:</strong> ${escapeHtml(parsed.data.company)}<br>` : "") +
        `</p>` +
        (parsed.data.notes
          ? `<p><strong>Project details:</strong></p><p style="white-space:pre-wrap">${escapeHtml(parsed.data.notes)}</p>`
          : ""),
    }).catch((e) => {
      console.error("[storefront-checkout] tenant notify email failed:", e);
    });
  }

  // Confirmation email to the customer.
  void sendEmail({
    to:       parsed.data.email,
    subject:  `We got your request — ${quote.number}`,
    fromName: tenant.name,
    text:
      `Hi ${parsed.data.firstName},\n\n` +
      `Thanks for reaching out to ${tenant.name}. We received your request ` +
      `(reference ${quote.number}) and will get back to you shortly with a quote.\n\n` +
      `If anything's wrong or you want to add details, just reply to this email.\n\n` +
      `— ${tenant.name}\n`,
    html:
      `<p>Hi ${escapeHtml(parsed.data.firstName)},</p>` +
      `<p>Thanks for reaching out to <strong>${escapeHtml(tenant.name)}</strong>. ` +
      `We received your request (reference <strong>${escapeHtml(quote.number)}</strong>) ` +
      `and will get back to you shortly with a quote.</p>` +
      `<p style="color:#6b7280">If anything's wrong or you want to add details, just reply to this email.</p>` +
      `<p>— ${escapeHtml(tenant.name)}</p>`,
  }).catch(() => { /* non-fatal */ });

  // ── "Request quote" path: bounce to confirmation page. ────────
  if (parsed.data.payment === "quote") {
    redirect(`/shop/${slug}/checkout/confirmation?quote=${quote.number}`);
  }

  // ── "Pay now" path: create a Stripe Checkout session. ─────────
  if (!stripe) {
    // Stripe not configured locally — still mark the quote as
    // submitted; bounce to confirmation with a note.
    redirect(`/shop/${slug}/checkout/confirmation?quote=${quote.number}&note=stripe-unavailable`);
  }

  const hdrs = await headers();
  const host = process.env.NEXT_PUBLIC_APP_URL
    ?? `https://${hdrs.get("host") ?? "flowtora.com"}`;
  const baseUrl = host.replace(/\/$/, "");

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: parsed.data.email,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: tenant.currency.toLowerCase(),
        product_data: {
          name: `Reservation deposit — ${tenant.name}`,
          description: `Holds your spot for quote ${quote.number}. Applied against the final invoice.`,
        },
        unit_amount: RESERVATION_AMOUNT_USD * 100,
      },
    }],
    success_url: `${baseUrl}/shop/${slug}/checkout/confirmation?quote=${quote.number}&checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:   `${baseUrl}/shop/${slug}/checkout?step=pay&canceled=1`,
    metadata: {
      tenantId: tenant.id,
      quoteId:  quote.id,
      kind:     "storefront-deposit",
    },
    payment_intent_data: {
      metadata: {
        tenantId: tenant.id,
        quoteId:  quote.id,
        kind:     "storefront-deposit",
      },
    },
  });

  if (!session.url) {
    redirect(`/shop/${slug}/checkout?step=pay&error=${encodeURIComponent("Couldn't open Stripe Checkout")}`);
  }
  redirect(session.url);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
