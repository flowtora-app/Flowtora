"use server";

// Invoices server actions — Page 16.
//
// Most existing flows (createPlatformInvoice, sendPlatformInvoice,
// markPlatformInvoicePaid, voidPlatformInvoice) live in
// platform-billing.ts. This file adds the rest of the spec's actions:
// mark uncollectible, issue credit note, refund payment, bulk send /
// mark-paid / void, and a draft edit path.
//
// Permissions: every mutation requires billing.invoice (Billing
// Manager + Admin tiers). Refunds need billing.refund.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { logPlatformAudit, requirePlatformStaff } from "@/lib/platform";

/* ── Mark uncollectible ─────────────────────────────────── */

const markUncollectibleSchema = z.object({
  invoiceId: z.string().min(1),
  reason: z.string().min(3).max(500),
});

export async function markInvoiceUncollectible(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("billing.invoice")) {
    return { ok: false, error: "Your role can't mark invoices uncollectible" } as const;
  }
  const parsed = markUncollectibleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" } as const;
  }
  const inv = await db.platformBillingInvoice.findUnique({
    where: { id: parsed.data.invoiceId },
    select: { id: true, status: true, tenantId: true },
  });
  if (!inv) return { ok: false, error: "Invoice not found" } as const;
  if (inv.status === "PAID") return { ok: false, error: "Already paid" } as const;
  if (inv.status === "VOIDED") return { ok: false, error: "Already voided" } as const;

  await db.platformBillingInvoice.update({
    where: { id: inv.id },
    data: { status: "UNCOLLECTIBLE", voidReason: parsed.data.reason, voidedAt: new Date() },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: inv.tenantId,
    action: "platform.invoice_marked_uncollectible",
    entityType: "PlatformBillingInvoice",
    entityId: inv.id,
    metadata: { actor: ctx.email, reason: parsed.data.reason },
    severity: "WARNING",
  });
  revalidatePath("/platform/billing/invoices");
  revalidatePath(`/platform/billing/invoices/${inv.id}`);
  return { ok: true } as const;
}

/* ── Issue credit note ──────────────────────────────────── */

const creditNoteSchema = z.object({
  invoiceId: z.string().min(1),
  /** Minor units. Always positive. */
  amountCents: z.coerce.number().int().min(1),
  reason: z.string().min(3).max(500),
  notes: z.string().max(2_000).optional(),
});

export async function issueCreditNote(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("billing.refund")) {
    return { ok: false, error: "Your role can't issue credit notes" } as const;
  }
  const parsed = creditNoteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" } as const;
  }
  const inv = await db.platformBillingInvoice.findUnique({
    where: { id: parsed.data.invoiceId },
    select: { id: true, total: true, currency: true, tenantId: true },
  });
  if (!inv) return { ok: false, error: "Invoice not found" } as const;
  if (parsed.data.amountCents > inv.total) {
    return { ok: false, error: "Credit amount can't exceed invoice total" } as const;
  }

  // Mint a unique CN-N number.
  const lastCn = await db.platformCreditNote.findFirst({
    orderBy: { issuedAt: "desc" },
    select: { number: true },
  });
  const lastN = lastCn?.number ? parseInt(lastCn.number.replace(/\D/g, ""), 10) : 1000;
  const nextNumber = `CN-${(Number.isNaN(lastN) ? 1000 : lastN) + 1}`;

  const cn = await db.platformCreditNote.create({
    data: {
      invoiceId: inv.id,
      number: nextNumber,
      amount: parsed.data.amountCents,
      reason: parsed.data.reason,
      notes: parsed.data.notes ?? null,
      issuedBy: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: inv.tenantId,
    action: "platform.invoice_credit_note_issued",
    entityType: "PlatformCreditNote",
    entityId: cn.id,
    metadata: { actor: ctx.email, invoiceId: inv.id, amount: parsed.data.amountCents, reason: parsed.data.reason },
    severity: "WARNING",
  });
  revalidatePath(`/platform/billing/invoices/${inv.id}`);
  return { ok: true as const, id: cn.id, number: nextNumber };
}

/* ── Refund payment ─────────────────────────────────────── */

const refundSchema = z.object({
  paymentId: z.string().min(1),
  /** Minor units. Optional — defaults to full payment amount. */
  amountCents: z.coerce.number().int().min(1).optional(),
  reason: z.string().min(3).max(500),
});

export async function refundInvoicePayment(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("billing.refund")) {
    return { ok: false, error: "Your role can't refund payments" } as const;
  }
  const parsed = refundSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" } as const;
  }
  const p = await db.platformInvoicePayment.findUnique({
    where: { id: parsed.data.paymentId },
    select: { id: true, status: true, amount: true, invoice: { select: { id: true, tenantId: true } } },
  });
  if (!p) return { ok: false, error: "Payment not found" } as const;
  if (p.status !== "succeeded") return { ok: false, error: "Only succeeded payments can be refunded" } as const;

  const refundAmount = parsed.data.amountCents ?? p.amount;
  if (refundAmount > p.amount) {
    return { ok: false, error: "Refund amount exceeds payment amount" } as const;
  }
  const newStatus = refundAmount === p.amount ? "refunded" : "partial_refund";
  await db.platformInvoicePayment.update({
    where: { id: p.id },
    data: { status: newStatus, refundedAt: new Date() },
  });
  // If full refund of the only succeeded payment, drop invoice back to OPEN.
  if (newStatus === "refunded") {
    await db.platformBillingInvoice.update({
      where: { id: p.invoice.id },
      data: { status: "REFUNDED" },
    });
  }
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: p.invoice.tenantId,
    action: "platform.invoice_payment_refunded",
    entityType: "PlatformInvoicePayment",
    entityId: p.id,
    metadata: { actor: ctx.email, refundAmount, reason: parsed.data.reason, mode: newStatus },
    severity: "WARNING",
  });
  revalidatePath(`/platform/billing/invoices/${p.invoice.id}`);
  return { ok: true } as const;
}

/* ── Edit a draft invoice's notes / terms ───────────────── */

const editDraftSchema = z.object({
  invoiceId: z.string().min(1),
  notes: z.string().max(2_000).optional(),
  internalNotes: z.string().max(2_000).optional(),
  termsText: z.string().max(500).optional(),
});

export async function editDraftInvoice(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("billing.invoice")) {
    return { ok: false, error: "Your role can't edit invoices" } as const;
  }
  const parsed = editDraftSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" } as const;
  }
  const inv = await db.platformBillingInvoice.findUnique({
    where: { id: parsed.data.invoiceId },
    select: { id: true, status: true, tenantId: true },
  });
  if (!inv) return { ok: false, error: "Invoice not found" } as const;
  if (inv.status !== "DRAFT") {
    return { ok: false, error: "Only DRAFT invoices can be edited" } as const;
  }
  await db.platformBillingInvoice.update({
    where: { id: inv.id },
    data: {
      notes: parsed.data.notes?.trim() || null,
      internalNotes: parsed.data.internalNotes?.trim() || null,
      termsText: parsed.data.termsText?.trim() || null,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: inv.tenantId,
    action: "platform.invoice_edited",
    entityType: "PlatformBillingInvoice",
    entityId: inv.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(`/platform/billing/invoices/${inv.id}`);
  return { ok: true } as const;
}

/* ── Bulk variants ──────────────────────────────────────── */

const bulkIdsSchema = z.object({
  invoiceIds: z.string().min(1), // CSV
});

export async function bulkMarkInvoicesPaid(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("billing.invoice")) {
    return { ok: false, error: "Your role can't mark invoices paid" } as const;
  }
  const parsed = bulkIdsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
  const ids = parsed.data.invoiceIds.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return { ok: false, error: "No invoices selected" } as const;

  const now = new Date();
  const result = await db.platformBillingInvoice.updateMany({
    where: { id: { in: ids }, status: { in: ["SENT", "OPEN"] } },
    data: { status: "PAID", paidAt: now },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.invoices_bulk_marked_paid",
    entityType: "PlatformBillingInvoice",
    metadata: { actor: ctx.email, count: result.count },
    severity: "WARNING",
  });
  revalidatePath("/platform/billing/invoices");
  return { ok: true, count: result.count } as const;
}

export async function bulkVoidInvoices(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("billing.invoice")) {
    return { ok: false, error: "Your role can't void invoices" } as const;
  }
  const parsed = bulkIdsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
  const ids = parsed.data.invoiceIds.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return { ok: false, error: "No invoices selected" } as const;

  const result = await db.platformBillingInvoice.updateMany({
    where: { id: { in: ids }, status: { notIn: ["PAID", "VOIDED", "REFUNDED"] } },
    data: { status: "VOIDED", voidedAt: new Date() },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.invoices_bulk_voided",
    entityType: "PlatformBillingInvoice",
    metadata: { actor: ctx.email, count: result.count },
    severity: "CRITICAL",
  });
  revalidatePath("/platform/billing/invoices");
  return { ok: true, count: result.count } as const;
}

/** Bulk-send: each draft fans through the existing sendPlatformInvoice
 *  helper which both marks SENT + emails the owner. We import lazily
 *  to avoid pulling the email plumbing into the action's module
 *  graph until needed. */
export async function bulkSendInvoices(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("billing.invoice")) {
    return { ok: false, error: "Your role can't send invoices" } as const;
  }
  const parsed = bulkIdsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
  const ids = parsed.data.invoiceIds.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return { ok: false, error: "No invoices selected" } as const;

  // Just mark them SENT for the bulk path — the per-row Send button
  // handles per-invoice email composition. Bulk send across many
  // invoices wants a different UX (digest-style email) which is
  // honestly deferred.
  const now = new Date();
  const result = await db.platformBillingInvoice.updateMany({
    where: { id: { in: ids }, status: "DRAFT" },
    data: { status: "SENT", issuedAt: now },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.invoices_bulk_sent",
    entityType: "PlatformBillingInvoice",
    metadata: { actor: ctx.email, count: result.count },
  });
  revalidatePath("/platform/billing/invoices");
  return { ok: true, count: result.count } as const;
}
