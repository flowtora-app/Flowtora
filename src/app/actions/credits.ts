"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { notifyMany } from "@/lib/notifications";
import { recomputeInvoiceTotals } from "@/app/actions/invoices";

// Phase 14 — credit memos.
//
// A credit memo is an "IOU" from the shop to the customer. Applying a
// credit memo to an invoice creates a CREDIT_MEMO Payment on that
// invoice so the invoice's amountPaid math stays uniform, and an
// immutable CreditApplication row tracking the history. The memo's
// balance shrinks by the applied amount; it can be applied across
// multiple invoices until fully consumed.

const optionalString = z.string().max(400).optional().or(z.literal(""));
const empty = (s: string | undefined) => (s && s.length > 0 ? s : null);

// ────────────────────────────────────────────────────────────
// Issue a credit memo
// ────────────────────────────────────────────────────────────

const issueSchema = z.object({
  customerId: z.string().min(1),
  amount: z.string().min(1),
  reason: z.string().min(1).max(400),
  sourceInvoiceId: optionalString,
});

export async function issueCreditMemo(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "credits:issue");
  const parsed = issueSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/customers?error=${encodeURIComponent("Pick a customer, amount, and reason.")}`);
  }

  const amount = Number(parsed.data.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    redirect(`/t/${slug}/customers?error=${encodeURIComponent("Amount must be positive.")}`);
  }

  const customer = await db.customer.findFirst({
    where: { id: parsed.data.customerId, tenantId: ctx.tenant.id },
    select: { id: true, name: true, ownerId: true },
  });
  if (!customer) {
    redirect(`/t/${slug}/customers?error=${encodeURIComponent("Customer not found.")}`);
  }

  const sourceInvoiceId = empty(parsed.data.sourceInvoiceId);
  if (sourceInvoiceId) {
    const src = await db.invoice.findFirst({
      where: { id: sourceInvoiceId, tenantId: ctx.tenant.id, customerId: customer.id },
      select: { id: true },
    });
    if (!src) redirect(`/t/${slug}/customers/${customer.id}?error=${encodeURIComponent("Source invoice doesn't match customer.")}`);
  }

  const memo = await db.$transaction(async (tx) => {
    const tenant = await tx.tenant.update({
      where: { id: ctx.tenant.id },
      data: { creditMemoLastNumber: { increment: 1 } },
      select: { creditMemoNumberPrefix: true, creditMemoLastNumber: true },
    });
    const number = `${tenant.creditMemoNumberPrefix}${tenant.creditMemoLastNumber}`;
    return tx.creditMemo.create({
      data: {
        tenantId:        ctx.tenant.id,
        customerId:      customer.id,
        sourceInvoiceId: sourceInvoiceId,
        number,
        amount:          amount as never,
        balance:         amount as never,
        reason:          parsed.data.reason,
        recordedBy:      ctx.userId,
      },
    });
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "credit.issued",
    entityType: "CreditMemo",
    entityId: memo.id,
    metadata: { customerId: customer.id, amount, number: memo.number },
  });

  // Notify the customer's account owner so AR knows there's new credit outstanding.
  await notifyMany(
    [customer.ownerId],
    {
      tenantId:   ctx.tenant.id,
      type:       "credit.issued",
      title:      `Credit issued: $${amount.toFixed(2)} to ${customer.name} (${memo.number})`,
      body:       parsed.data.reason,
      entityType: "CreditMemo",
      entityId:   memo.id,
      link:       `/t/${slug}/customers/${customer.id}`,
    },
    { excludeUserId: ctx.userId },
  );

  revalidatePath(`/t/${slug}/customers/${customer.id}`);
  revalidatePath(`/t/${slug}/invoices`);
}

// ────────────────────────────────────────────────────────────
// Apply a credit memo to an invoice
// ────────────────────────────────────────────────────────────

const applySchema = z.object({
  creditMemoId: z.string().min(1),
  amount: z.string().min(1),
});

export async function applyCreditToInvoice(slug: string, invoiceId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "credits:issue");
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, tenantId: ctx.tenant.id },
    select: {
      id: true, customerId: true, number: true, total: true, amountPaid: true,
      refundedAmount: true, writtenOffAmount: true, status: true, createdBy: true,
      customer: { select: { name: true, ownerId: true } },
      order:    { select: { createdBy: true } },
    },
  });
  if (!invoice) redirect(`/t/${slug}/invoices`);
  if (invoice.status === "DRAFT" || invoice.status === "VOID" || invoice.status === "WRITTEN_OFF") {
    redirect(`/t/${slug}/invoices/${invoiceId}?error=${encodeURIComponent("Can only apply credits to open invoices.")}`);
  }

  const parsed = applySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/invoices/${invoiceId}?error=${encodeURIComponent("Pick a credit memo and amount.")}`);
  }
  const amount = Number(parsed.data.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    redirect(`/t/${slug}/invoices/${invoiceId}?error=${encodeURIComponent("Amount must be positive.")}`);
  }

  const memo = await db.creditMemo.findFirst({
    where: {
      id: parsed.data.creditMemoId,
      tenantId: ctx.tenant.id,
      customerId: invoice.customerId,
      voidedAt: null,
    },
    select: { id: true, number: true, balance: true },
  });
  if (!memo) redirect(`/t/${slug}/invoices/${invoiceId}?error=${encodeURIComponent("Credit memo not available for this customer.")}`);
  if (Number(memo.balance) < amount) {
    redirect(`/t/${slug}/invoices/${invoiceId}?error=${encodeURIComponent(`Memo only has $${Number(memo.balance).toFixed(2)} left.`)}`);
  }

  // Can't apply more than the outstanding balance.
  const outstanding = Math.max(
    0,
    Number(invoice.total) - Number(invoice.amountPaid) + Number(invoice.refundedAmount) - Number(invoice.writtenOffAmount),
  );
  const applyAmount = Math.min(amount, outstanding);
  if (applyAmount <= 0) {
    redirect(`/t/${slug}/invoices/${invoiceId}?error=${encodeURIComponent("Invoice has no outstanding balance.")}`);
  }

  await db.$transaction(async (tx) => {
    await tx.creditApplication.create({
      data: {
        tenantId:     ctx.tenant.id,
        creditMemoId: memo.id,
        invoiceId:    invoice.id,
        amount:       applyAmount as never,
        recordedBy:   ctx.userId,
      },
    });
    await tx.payment.create({
      data: {
        tenantId:   ctx.tenant.id,
        invoiceId:  invoice.id,
        amount:     applyAmount as never,
        method:     "CREDIT_MEMO",
        reference:  memo.number,
        note:       `Applied from ${memo.number}`,
        recordedBy: ctx.userId,
      },
    });
    await tx.creditMemo.update({
      where: { id: memo.id },
      data: { balance: { decrement: applyAmount } },
    });
  });

  await recomputeInvoiceTotals(invoice.id);

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "credit.applied",
    entityType: "CreditMemo",
    entityId: memo.id,
    metadata: { invoiceId: invoice.id, amount: applyAmount },
  });

  await notifyMany(
    [invoice.createdBy, invoice.order?.createdBy ?? null, invoice.customer.ownerId],
    {
      tenantId:   ctx.tenant.id,
      type:       "credit.applied",
      title:      `Credit applied: $${applyAmount.toFixed(2)} to invoice ${invoice.number} (${invoice.customer.name})`,
      body:       `From credit memo ${memo.number}.`,
      entityType: "Invoice",
      entityId:   invoice.id,
      link:       `/t/${slug}/invoices/${invoice.id}`,
    },
    { excludeUserId: ctx.userId },
  );

  revalidatePath(`/t/${slug}/invoices/${invoice.id}`);
  revalidatePath(`/t/${slug}/customers/${invoice.customerId}`);
}

// ────────────────────────────────────────────────────────────
// Void a credit memo
// ────────────────────────────────────────────────────────────

const voidSchema = z.object({
  voidReason: z.string().min(1).max(400),
});

export async function voidCreditMemo(slug: string, memoId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "credits:issue");
  const memo = await db.creditMemo.findFirst({
    where: { id: memoId, tenantId: ctx.tenant.id },
    select: {
      id: true, customerId: true, balance: true, amount: true, voidedAt: true,
      applications: { select: { amount: true } },
    },
  });
  if (!memo) return;
  if (memo.voidedAt) return;

  // Can only void if nothing has been applied — once a memo has been
  // applied against invoices, the applications have to be individually
  // reversed (out of scope for this slice).
  const applied = memo.applications.reduce((s, a) => s + Number(a.amount), 0);
  if (applied > 0) {
    redirect(`/t/${slug}/customers/${memo.customerId}?error=${encodeURIComponent("Memo has applications — reverse those first.")}`);
  }

  const parsed = voidSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/customers/${memo.customerId}?error=${encodeURIComponent("A reason is required.")}`);
  }

  await db.creditMemo.update({
    where: { id: memo.id },
    data: {
      voidedAt:   new Date(),
      voidReason: parsed.data.voidReason,
      balance:    0 as never,
    },
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "credit.voided",
    entityType: "CreditMemo",
    entityId: memo.id,
    metadata: { reason: parsed.data.voidReason },
  });

  revalidatePath(`/t/${slug}/customers/${memo.customerId}`);
}
