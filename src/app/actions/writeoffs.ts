"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { notifyMany } from "@/lib/notifications";
import { recomputeInvoiceTotals } from "@/app/actions/invoices";

// Phase 14 — write-offs.
//
// Closing an uncollectable invoice. Unlike refunds (money leaving) or
// credits (future consideration), write-offs are an accounting
// concession: the shop accepts it won't collect. Status flips to
// WRITTEN_OFF and the amount is recorded on a WriteOff row so reports
// can show "$X in write-offs this quarter".

const recordSchema = z.object({
  reason: z.string().min(1).max(400),
  amount: z.string().optional().or(z.literal("")),
});

export async function writeOffInvoice(slug: string, invoiceId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "writeoffs:record");
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, tenantId: ctx.tenant.id },
    select: {
      id: true, status: true, number: true, total: true, amountPaid: true,
      refundedAmount: true, writtenOffAmount: true, createdBy: true,
      customer: { select: { name: true, ownerId: true } },
      order:    { select: { createdBy: true } },
    },
  });
  if (!invoice) redirect(`/t/${slug}/invoices`);
  // Only open, unpaid balances can be written off.
  if (invoice.status === "DRAFT" || invoice.status === "VOID" || invoice.status === "WRITTEN_OFF" || invoice.status === "PAID") {
    redirect(`/t/${slug}/invoices/${invoiceId}?error=${encodeURIComponent("Only open invoices with a balance can be written off.")}`);
  }

  const parsed = recordSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/invoices/${invoiceId}?error=${encodeURIComponent("A reason is required.")}`);
  }

  const outstanding = Math.max(
    0,
    Number(invoice.total) - Number(invoice.amountPaid) + Number(invoice.refundedAmount) - Number(invoice.writtenOffAmount),
  );
  if (outstanding <= 0) {
    redirect(`/t/${slug}/invoices/${invoiceId}?error=${encodeURIComponent("Invoice has no outstanding balance.")}`);
  }

  const requestedStr = parsed.data.amount?.trim();
  const requested = requestedStr ? Number(requestedStr) : outstanding;
  if (!Number.isFinite(requested) || requested <= 0) {
    redirect(`/t/${slug}/invoices/${invoiceId}?error=${encodeURIComponent("Invalid write-off amount.")}`);
  }
  const amount = Math.min(requested, outstanding);

  const wo = await db.$transaction(async (tx) => {
    const row = await tx.writeOff.create({
      data: {
        tenantId:   ctx.tenant.id,
        invoiceId:  invoice.id,
        amount:     amount as never,
        reason:     parsed.data.reason,
        recordedBy: ctx.userId,
      },
    });
    // Flip to WRITTEN_OFF if this closes the full balance; otherwise the
    // recomputer will derive the right status (still PARTIAL/OVERDUE
    // with writtenOffAmount reducing AR).
    if (amount >= outstanding) {
      await tx.invoice.update({
        where: { id: invoice.id },
        data:  { status: "WRITTEN_OFF" },
      });
    }
    return row;
  });

  await recomputeInvoiceTotals(invoice.id);

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "writeoff.recorded",
    entityType: "WriteOff",
    entityId: wo.id,
    metadata: { invoiceId: invoice.id, amount, reason: parsed.data.reason },
  });

  await notifyMany(
    [invoice.createdBy, invoice.order?.createdBy ?? null, invoice.customer.ownerId],
    {
      tenantId:   ctx.tenant.id,
      type:       "writeoff.recorded",
      title:      `Invoice written off: $${amount.toFixed(2)} on ${invoice.number} (${invoice.customer.name})`,
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

// Reversing a write-off — re-opens the invoice at its prior status.
// Picking the "right" status on reversal is hand-wavy (we use SENT as a
// safe default); the recomputer will immediately re-derive PARTIAL /
// OVERDUE / PAID based on payments + dueDate.
export async function reverseWriteOff(slug: string, writeOffId: string) {
  const ctx = await requirePermission(slug, "writeoffs:record");
  const wo = await db.writeOff.findFirst({
    where: { id: writeOffId, tenantId: ctx.tenant.id },
    select: { id: true, invoiceId: true, reversedAt: true },
  });
  if (!wo || wo.reversedAt) return;

  await db.$transaction(async (tx) => {
    await tx.writeOff.update({
      where: { id: wo.id },
      data:  { reversedAt: new Date(), reversedBy: ctx.userId },
    });
    const inv = await tx.invoice.findUnique({
      where: { id: wo.invoiceId },
      select: { status: true },
    });
    if (inv?.status === "WRITTEN_OFF") {
      // Flip back to SENT; recompute will take it from there.
      await tx.invoice.update({
        where: { id: wo.invoiceId },
        data:  { status: "SENT" },
      });
    }
  });

  await recomputeInvoiceTotals(wo.invoiceId);

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "writeoff.reversed",
    entityType: "WriteOff",
    entityId: wo.id,
    metadata: { invoiceId: wo.invoiceId },
  });

  revalidatePath(`/t/${slug}/invoices/${wo.invoiceId}`);
}
