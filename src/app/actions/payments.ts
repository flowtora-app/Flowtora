"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { notifyMany } from "@/lib/notifications";
import { recomputeInvoiceTotals } from "@/app/actions/invoices";
// Phase 15 Slice E — customer-facing payment receipt.
import { sendCustomerEmail, paymentReceivedEmail } from "@/lib/customer-emails";
import { appOrigin } from "@/lib/share";
import { formatMoney } from "@/lib/format";

const optionalString = z.string().max(200).optional().or(z.literal(""));
const optionalLong = z.string().max(4000).optional().or(z.literal(""));
const empty = (s: string | undefined) => (s && s.length > 0 ? s : null);

// ────────────────────────────────────────────────────────────
// Record a payment
// ────────────────────────────────────────────────────────────

// CREDIT_MEMO is a valid Prisma enum value but is intentionally excluded
// from the manual-record path — credit applications go through their own
// action (applyCreditToInvoice) to keep CreditMemo.balance in sync.
const recordSchema = z.object({
  amount: z.string().min(1),
  method: z.enum(["CASH", "CHECK", "CARD", "ACH", "OTHER"]),
  reference: optionalString,
  note: optionalLong,
  receivedAt: optionalString, // YYYY-MM-DD
});

export async function recordPayment(slug: string, invoiceId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "payments:record");
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, tenantId: ctx.tenant.id },
    select: {
      id: true, status: true, total: true, amountPaid: true,
      number: true, createdBy: true, customerId: true,
      customer: { select: { id: true, name: true, email: true, ownerId: true } },
      order:    { select: { createdBy: true } },
    },
  });
  if (!invoice) redirect(`/t/${slug}/invoices`);
  if (invoice.status === "VOID" || invoice.status === "DRAFT") {
    redirect(`/t/${slug}/invoices/${invoiceId}?error=${encodeURIComponent("Send the invoice before recording payments.")}`);
  }

  const parsed = recordSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/invoices/${invoiceId}?error=${encodeURIComponent("Invalid payment input.")}`);
  }

  const amount = Number(parsed.data.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    redirect(`/t/${slug}/invoices/${invoiceId}?error=${encodeURIComponent("Amount must be greater than zero.")}`);
  }

  const receivedAt = parsed.data.receivedAt ? new Date(parsed.data.receivedAt) : new Date();

  const payment = await db.payment.create({
    data: {
      tenantId: ctx.tenant.id,
      invoiceId: invoice.id,
      amount: amount as never,
      method: parsed.data.method,
      reference: empty(parsed.data.reference),
      note: empty(parsed.data.note),
      receivedAt,
      recordedBy: ctx.userId,
    },
  });

  await recomputeInvoiceTotals(invoice.id);

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "payment.recorded",
    entityType: "Payment",
    entityId: payment.id,
    metadata: { invoiceId: invoice.id, amount, method: parsed.data.method },
  });

  // Notify the people who care: invoice creator, order creator (if linked),
  // and the customer's account owner. The bookkeeper recording the payment is
  // excluded so they don't ping themselves.
  const amountStr = amount.toFixed(2);
  await notifyMany(
    [invoice.createdBy, invoice.order?.createdBy ?? null, invoice.customer.ownerId],
    {
      tenantId:   ctx.tenant.id,
      type:       "payment.recorded",
      title:      `Payment received: $${amountStr} on invoice ${invoice.number} (${invoice.customer.name})`,
      body:       empty(parsed.data.note),
      entityType: "Invoice",
      entityId:   invoice.id,
      link:       `/t/${slug}/invoices/${invoice.id}`,
    },
    { excludeUserId: ctx.userId },
  );

  // Phase 15 Slice E — send a payment receipt to the customer. We refetch
  // the invoice totals post-recompute so the balance line reflects this
  // payment. Skipped quietly when the customer has no email on file.
  if (invoice.customer.email) {
    const fresh = await db.invoice.findUnique({
      where: { id: invoice.id },
      select: { total: true, amountPaid: true },
    });
    const remaining = fresh
      ? Math.max(0, Number(fresh.total) - Number(fresh.amountPaid))
      : 0;
    const portal = await db.portalToken.findFirst({
      where: {
        tenantId: ctx.tenant.id,
        customerId: invoice.customerId,
        revokedAt: null,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      select: { token: true },
      orderBy: { createdAt: "desc" },
    });
    const url = portal
      ? `${appOrigin()}/portal/${portal.token}/invoices/${invoice.id}`
      : null;
    await sendCustomerEmail({
      tenantId:     ctx.tenant.id,
      customerId:   invoice.customerId,
      senderUserId: ctx.userId,
      kind:         "PAYMENT_RECEIPT",
      to:           invoice.customer.email,
      relatedEntityType: "Invoice",
      relatedEntityId:   invoice.id,
      rendered: paymentReceivedEmail({
        shopName:      ctx.tenant.name,
        shopPhone:     ctx.tenant.phone,
        shopWebsite:   ctx.tenant.website,
        invoiceFooterText: ctx.tenant.invoiceFooterText,
        customerName:  invoice.customer.name,
        invoiceNumber: invoice.number,
        amount:        formatMoney(amount, ctx.tenant.currency),
        balanceDue:    formatMoney(remaining, ctx.tenant.currency),
        url,
      }),
    });
  }

  revalidatePath(`/t/${slug}/invoices/${invoice.id}`);
  revalidatePath(`/t/${slug}/invoices`);
}

// ────────────────────────────────────────────────────────────
// Void a payment
// ────────────────────────────────────────────────────────────

const voidSchema = z.object({
  voidReason: optionalString,
});

export async function voidPayment(slug: string, paymentId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "payments:record");
  const payment = await db.payment.findFirst({
    where: { id: paymentId, tenantId: ctx.tenant.id },
  });
  if (!payment) return;
  if (payment.voidedAt) return;

  const parsed = voidSchema.safeParse(Object.fromEntries(formData.entries()));
  const reason = parsed.success ? empty(parsed.data.voidReason) : null;

  await db.payment.update({
    where: { id: payment.id },
    data: { voidedAt: new Date(), voidReason: reason },
  });

  await recomputeInvoiceTotals(payment.invoiceId);

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "payment.voided",
    entityType: "Payment",
    entityId: payment.id,
    metadata: { invoiceId: payment.invoiceId, reason },
  });

  revalidatePath(`/t/${slug}/invoices/${payment.invoiceId}`);
  revalidatePath(`/t/${slug}/invoices`);
}

// ────────────────────────────────────────────────────────────
// Phase 14 — mark a payment as failed.
//
// Distinct from void: failed means the payment was attempted in good
// faith but didn't land (card declined, check bounced, ACH returned).
// The invoice's amountPaid drops the same way a void would, but the
// notification is loud ("payment.failed") and the payment row keeps the
// failure timestamp + reason for the timeline.
// ────────────────────────────────────────────────────────────

const failSchema = z.object({
  failureReason: z.string().min(1).max(400),
});

export async function markPaymentFailed(slug: string, paymentId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "payments:record");
  const payment = await db.payment.findFirst({
    where: { id: paymentId, tenantId: ctx.tenant.id },
    select: {
      id: true, invoiceId: true, voidedAt: true, failedAt: true, amount: true,
      invoice: {
        select: {
          number: true, createdBy: true,
          customer: { select: { name: true, ownerId: true } },
          order:    { select: { createdBy: true } },
        },
      },
    },
  });
  if (!payment) return;
  // Already voided or already failed — nothing to do.
  if (payment.voidedAt || payment.failedAt) return;

  const parsed = failSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/invoices/${payment.invoiceId}?error=${encodeURIComponent("A reason is required when marking a payment failed.")}`);
  }

  await db.payment.update({
    where: { id: payment.id },
    data: { failedAt: new Date(), failureReason: parsed.data.failureReason },
  });

  await recomputeInvoiceTotals(payment.invoiceId);

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "payment.failed",
    entityType: "Payment",
    entityId: payment.id,
    metadata: { invoiceId: payment.invoiceId, reason: parsed.data.failureReason },
  });

  await notifyMany(
    [payment.invoice.createdBy, payment.invoice.order?.createdBy ?? null, payment.invoice.customer.ownerId],
    {
      tenantId:   ctx.tenant.id,
      type:       "payment.failed",
      title:      `Payment failed: $${Number(payment.amount).toFixed(2)} on invoice ${payment.invoice.number} (${payment.invoice.customer.name})`,
      body:       parsed.data.failureReason,
      entityType: "Invoice",
      entityId:   payment.invoiceId,
      link:       `/t/${slug}/invoices/${payment.invoiceId}`,
    },
    { excludeUserId: ctx.userId },
  );

  revalidatePath(`/t/${slug}/invoices/${payment.invoiceId}`);
  revalidatePath(`/t/${slug}/invoices`);
}
