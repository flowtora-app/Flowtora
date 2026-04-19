"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { notifyMany } from "@/lib/notifications";
import { recomputeInvoiceTotals } from "@/app/actions/invoices";

// Phase 14 — refunds.
//
// A refund is money going back to the customer. It always points at an
// invoice (schema requires invoiceId) and *usually* points at the
// original payment — the common case is refunding a specific card
// charge. Standalone refunds (no paymentId) are allowed for cases like
// "we cut them a check to make them whole".

const optionalString = z.string().max(400).optional().or(z.literal(""));
const empty = (s: string | undefined) => (s && s.length > 0 ? s : null);

const recordSchema = z.object({
  amount: z.string().min(1),
  method: z.enum(["CASH", "CHECK", "CARD", "ACH", "CREDIT_MEMO", "OTHER"]),
  reason: z.string().min(1).max(400),
  paymentId: optionalString,
  reference: optionalString,
  refundedAt: optionalString,
});

export async function recordRefund(slug: string, invoiceId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "refunds:issue");
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, tenantId: ctx.tenant.id },
    select: {
      id: true, status: true, number: true, amountPaid: true, createdBy: true,
      customer: { select: { name: true, ownerId: true } },
      order:    { select: { createdBy: true } },
    },
  });
  if (!invoice) redirect(`/t/${slug}/invoices`);

  const parsed = recordSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/invoices/${invoiceId}?error=${encodeURIComponent("Enter a refund amount, reason, and method.")}`);
  }

  const amount = Number(parsed.data.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    redirect(`/t/${slug}/invoices/${invoiceId}?error=${encodeURIComponent("Refund amount must be positive.")}`);
  }
  if (amount > Number(invoice.amountPaid)) {
    redirect(`/t/${slug}/invoices/${invoiceId}?error=${encodeURIComponent("Can't refund more than was paid.")}`);
  }

  // If paymentId is supplied, validate it belongs to this invoice + tenant.
  let paymentId: string | null = null;
  const rawPid = empty(parsed.data.paymentId);
  if (rawPid) {
    const p = await db.payment.findFirst({
      where: { id: rawPid, tenantId: ctx.tenant.id, invoiceId },
      select: { id: true },
    });
    if (!p) redirect(`/t/${slug}/invoices/${invoiceId}?error=${encodeURIComponent("Payment not found on this invoice.")}`);
    paymentId = p.id;
  }

  const refund = await db.refund.create({
    data: {
      tenantId:   ctx.tenant.id,
      invoiceId:  invoice.id,
      paymentId,
      amount:     amount as never,
      method:     parsed.data.method,
      reason:     parsed.data.reason,
      reference:  empty(parsed.data.reference),
      refundedAt: parsed.data.refundedAt ? new Date(parsed.data.refundedAt) : new Date(),
      recordedBy: ctx.userId,
    },
  });

  await recomputeInvoiceTotals(invoice.id);

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "refund.issued",
    entityType: "Refund",
    entityId: refund.id,
    metadata: { invoiceId: invoice.id, amount, method: parsed.data.method, paymentId },
  });

  await notifyMany(
    [invoice.createdBy, invoice.order?.createdBy ?? null, invoice.customer.ownerId],
    {
      tenantId:   ctx.tenant.id,
      type:       "refund.issued",
      title:      `Refund issued: $${amount.toFixed(2)} on invoice ${invoice.number} (${invoice.customer.name})`,
      body:       parsed.data.reason,
      entityType: "Invoice",
      entityId:   invoice.id,
      link:       `/t/${slug}/invoices/${invoice.id}`,
    },
    { excludeUserId: ctx.userId },
  );

  revalidatePath(`/t/${slug}/invoices/${invoice.id}`);
  revalidatePath(`/t/${slug}/invoices`);
}

// Deleting a refund (the mistake-correction path). The refunded money is
// assumed to have never actually gone out — otherwise the shop would
// record a counter-balancing payment instead.
export async function deleteRefund(slug: string, refundId: string) {
  const ctx = await requirePermission(slug, "refunds:issue");
  const refund = await db.refund.findFirst({
    where: { id: refundId, tenantId: ctx.tenant.id },
    select: { id: true, invoiceId: true, amount: true },
  });
  if (!refund) return;

  await db.refund.delete({ where: { id: refund.id } });
  await recomputeInvoiceTotals(refund.invoiceId);

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "refund.deleted",
    entityType: "Refund",
    entityId: refund.id,
    metadata: { invoiceId: refund.invoiceId, amount: Number(refund.amount) },
  });

  revalidatePath(`/t/${slug}/invoices/${refund.invoiceId}`);
}
