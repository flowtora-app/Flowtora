"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { isSafeEvidenceUrl, MAX_RECEIPT_BYTES } from "@/lib/finance";

// Phase 14 — expenses.
//
// Job-linked expenses power the margin calculation (see computeMargin
// in src/lib/finance.ts). Receipts are stored the same way install
// photos are in Phase 13: data: URLs for inline storage until a proper
// blob store is wired. Same whitelist (`isSafeEvidenceUrl`).

const optionalString = z.string().max(200).optional().or(z.literal(""));
const optionalLong = z.string().max(4000).optional().or(z.literal(""));
const empty = (s: string | undefined) => (s && s.length > 0 ? s : null);

const expenseSchema = z.object({
  vendorId: optionalString,
  orderId: optionalString,
  category: optionalString,
  date: z.string().min(1),
  amount: z.string().min(1),
  taxAmount: optionalString,
  method: z.enum(["CASH", "CHECK", "CARD", "ACH", "OWNER_REIMBURSE", "OTHER"]).default("CARD"),
  reference: optionalString,
  memo: optionalLong,
  billable: z.preprocess((v) => v === "on" || v === "true", z.boolean()).optional(),
  receiptUrl: optionalLong, // longer because a data: URL can be ~500KB of base64
});

function parseDecimal(s: string | undefined | null, fallback = 0): number {
  if (!s || s.length === 0) return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

function validateReceipt(raw: string | null): string | null {
  if (!raw) return null;
  if (!isSafeEvidenceUrl(raw)) return null;
  // Rough byte count via UTF-8 assumption for data: URLs. Hosted URLs
  // pass through unchanged — a link to Drive / Dropbox is typically
  // short and the provider hosts the payload.
  if (raw.startsWith("data:") && raw.length > MAX_RECEIPT_BYTES) return null;
  return raw;
}

export async function createExpense(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "expenses:manage");
  const parsed = expenseSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/expenses/new?error=${encodeURIComponent("Date and amount are required.")}`);
  }
  const d = parsed.data;

  const amount = parseDecimal(d.amount, 0);
  if (amount <= 0) {
    redirect(`/t/${slug}/expenses/new?error=${encodeURIComponent("Amount must be positive.")}`);
  }
  const date = new Date(d.date);
  if (isNaN(date.getTime())) {
    redirect(`/t/${slug}/expenses/new?error=${encodeURIComponent("Invalid date.")}`);
  }

  // Validate vendor / order belong to this tenant if provided.
  let vendorId: string | null = null;
  if (d.vendorId && d.vendorId.length > 0) {
    const v = await db.vendor.findFirst({
      where: { id: d.vendorId, tenantId: ctx.tenant.id },
      select: { id: true },
    });
    vendorId = v?.id ?? null;
  }
  let orderId: string | null = null;
  if (d.orderId && d.orderId.length > 0) {
    const o = await db.order.findFirst({
      where: { id: d.orderId, tenantId: ctx.tenant.id },
      select: { id: true },
    });
    orderId = o?.id ?? null;
  }

  const receiptUrl = validateReceipt(empty(d.receiptUrl));

  const expense = await db.expense.create({
    data: {
      tenantId:   ctx.tenant.id,
      vendorId,
      orderId,
      category:   empty(d.category),
      date,
      amount:     amount as never,
      taxAmount:  parseDecimal(d.taxAmount, 0) as never,
      method:     d.method,
      reference:  empty(d.reference),
      memo:       empty(d.memo),
      billable:   d.billable === true,
      receiptUrl,
      createdBy:  ctx.userId,
    },
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "expense.created",
    entityType: "Expense",
    entityId: expense.id,
    metadata: { amount, vendorId, orderId, category: expense.category },
  });

  revalidatePath(`/t/${slug}/expenses`);
  if (orderId) revalidatePath(`/t/${slug}/orders/${orderId}`);
  redirect(`/t/${slug}/expenses/${expense.id}`);
}

export async function updateExpense(slug: string, expenseId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "expenses:manage");
  const existing = await db.expense.findFirst({
    where: { id: expenseId, tenantId: ctx.tenant.id },
    select: { id: true, orderId: true },
  });
  if (!existing) redirect(`/t/${slug}/expenses`);

  const parsed = expenseSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/expenses/${expenseId}?error=${encodeURIComponent("Date and amount are required.")}`);
  }
  const d = parsed.data;
  const amount = parseDecimal(d.amount, 0);
  if (amount <= 0) {
    redirect(`/t/${slug}/expenses/${expenseId}?error=${encodeURIComponent("Amount must be positive.")}`);
  }
  const date = new Date(d.date);
  if (isNaN(date.getTime())) {
    redirect(`/t/${slug}/expenses/${expenseId}?error=${encodeURIComponent("Invalid date.")}`);
  }

  let vendorId: string | null = null;
  if (d.vendorId && d.vendorId.length > 0) {
    const v = await db.vendor.findFirst({
      where: { id: d.vendorId, tenantId: ctx.tenant.id },
      select: { id: true },
    });
    vendorId = v?.id ?? null;
  }
  let orderId: string | null = null;
  if (d.orderId && d.orderId.length > 0) {
    const o = await db.order.findFirst({
      where: { id: d.orderId, tenantId: ctx.tenant.id },
      select: { id: true },
    });
    orderId = o?.id ?? null;
  }

  const receiptUrl = validateReceipt(empty(d.receiptUrl));

  await db.expense.update({
    where: { id: expenseId },
    data: {
      vendorId,
      orderId,
      category:  empty(d.category),
      date,
      amount:    amount as never,
      taxAmount: parseDecimal(d.taxAmount, 0) as never,
      method:    d.method,
      reference: empty(d.reference),
      memo:      empty(d.memo),
      billable:  d.billable === true,
      receiptUrl,
    },
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "expense.updated",
    entityType: "Expense",
    entityId: expenseId,
  });

  // Re-render both the old and new linked order pages (margin may have shifted).
  if (existing.orderId) revalidatePath(`/t/${slug}/orders/${existing.orderId}`);
  if (orderId && orderId !== existing.orderId) revalidatePath(`/t/${slug}/orders/${orderId}`);
  revalidatePath(`/t/${slug}/expenses/${expenseId}`);
  revalidatePath(`/t/${slug}/expenses`);
}

export async function deleteExpense(slug: string, expenseId: string) {
  const ctx = await requirePermission(slug, "expenses:manage");
  const existing = await db.expense.findFirst({
    where: { id: expenseId, tenantId: ctx.tenant.id },
    select: { id: true, orderId: true },
  });
  if (!existing) redirect(`/t/${slug}/expenses`);

  await db.expense.delete({ where: { id: existing.id } });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "expense.deleted",
    entityType: "Expense",
    entityId: expenseId,
  });
  if (existing.orderId) revalidatePath(`/t/${slug}/orders/${existing.orderId}`);
  revalidatePath(`/t/${slug}/expenses`);
  redirect(`/t/${slug}/expenses`);
}
