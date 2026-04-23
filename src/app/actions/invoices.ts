"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { InvoiceStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import {
  computeInvoiceItemSubtotal,
  computeInvoiceTotals,
  deriveInvoiceStatus,
  TERMS_DAYS,
} from "@/lib/invoices";
// Phase 15 Slice E — branded customer email for invoice-sent + reminder.
import { sendCustomerEmail, invoiceReadyEmail, invoiceReminderEmail } from "@/lib/customer-emails";
import { appOrigin } from "@/lib/share";
import { formatMoney, formatDate } from "@/lib/format";

const optionalString = z.string().max(200).optional().or(z.literal(""));
const optionalLong = z.string().max(4000).optional().or(z.literal(""));
const empty = (s: string | undefined) => (s && s.length > 0 ? s : null);
const emptyNum = (s: string | undefined) => {
  if (!s || s.length === 0) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

async function assertInvoice(tenantId: string, invoiceId: string) {
  return db.invoice.findFirst({
    where: { id: invoiceId, tenantId },
    select: {
      id: true, status: true, customerId: true, orderId: true,
      total: true, amountPaid: true,
      dueDate: true, issuedAt: true,
      terms: true, discountType: true,
    },
  });
}

/**
 * Recomputes totals and then potentially updates status based on paid amount /
 * due date. Use after any item change, meta change, or payment change.
 */
export async function recomputeInvoiceTotals(invoiceId: string) {
  const inv = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      items: true,
      payments: true,
      // Phase 14 — refunds, credit applications, and write-offs all
      // contribute to the invoice's denormalized totals. Pulling them in
      // the same query keeps the recompute transactional and fast.
      refunds: true,
      creditApplications: true,
      writeOffs: true,
    },
  });
  if (!inv) return;

  const totals = computeInvoiceTotals(
    inv.items.map((it) => ({ subtotal: it.subtotal, taxable: it.taxable })),
    {
      discountType: inv.discountType,
      discountValue: Number(inv.discountValue),
      taxRate: Number(inv.taxRate),
    },
  );

  // Sum of non-voided, non-failed payments. CREDIT_MEMO payments are
  // real payments — they zero out the customer's balance even though no
  // cash changed hands, and they're created via applyCreditToInvoice.
  const amountPaid = inv.payments
    .filter((p) => p.voidedAt == null && p.failedAt == null)
    .reduce((sum, p) => sum + Number(p.amount), 0);

  // Total refunded — money that went back to the customer. Only counts
  // refunds against this invoice; standalone refunds with null invoiceId
  // aren't possible in this schema (invoiceId is required).
  const refundedAmount = inv.refunds
    .reduce((sum, r) => sum + Number(r.amount), 0);

  // Credits applied to this invoice (separate from refunds — credits
  // reduce AR without cash leaving). Already baked into amountPaid via
  // the CREDIT_MEMO payment row, so we don't also subtract here.
  const creditedAmount = inv.creditApplications
    .reduce((sum, a) => sum + Number(a.amount), 0);

  // Write-offs that haven't been reversed.
  const writtenOffAmount = inv.writeOffs
    .filter((w) => w.reversedAt == null)
    .reduce((sum, w) => sum + Number(w.amount), 0);

  const nextStatus = deriveInvoiceStatus({
    current: inv.status,
    total: totals.total,
    amountPaid,
    dueDate: inv.dueDate,
  });

  const patch: Prisma.InvoiceUpdateInput = {
    subtotal: totals.subtotal as never,
    discountAmount: totals.discountAmount as never,
    taxAmount: totals.taxAmount as never,
    total: totals.total as never,
    amountPaid: amountPaid as never,
    refundedAmount: refundedAmount as never,
    creditedAmount: creditedAmount as never,
    writtenOffAmount: writtenOffAmount as never,
    status: nextStatus,
  };

  // Stamp paidAt on transition to PAID, clear on transition away.
  if (nextStatus === "PAID" && inv.status !== "PAID") {
    patch.paidAt = new Date();
  } else if (nextStatus !== "PAID" && inv.status === "PAID") {
    patch.paidAt = null;
  }

  await db.invoice.update({ where: { id: invoiceId }, data: patch });

  // Sync the order's paidAmount if this invoice is tied to one.
  if (inv.orderId) {
    await syncOrderPaidAmount(inv.orderId);
  }
}

/**
 * Sum non-voided payments across every invoice tied to this order and write
 * the total back to order.paidAmount — so deposit tracking stays accurate.
 */
async function syncOrderPaidAmount(orderId: string) {
  const invoices = await db.invoice.findMany({
    where: { orderId },
    include: { payments: true },
  });
  // Phase 14 — failed payments (card declined, check bounced) don't
  // count toward the order's paid total. Voided payments never did.
  const paidAmount = invoices.reduce((sum, inv) => {
    return sum + inv.payments
      .filter((p) => p.voidedAt == null && p.failedAt == null)
      .reduce((s, p) => s + Number(p.amount), 0);
  }, 0);
  await db.order.update({
    where: { id: orderId },
    data: { paidAmount: paidAmount as never },
  });
}

// ────────────────────────────────────────────────────────────
// Create
// ────────────────────────────────────────────────────────────

const createSchema = z.object({
  customerId: z.string().min(1),
  orderId: optionalString,
  kind: z.enum(["STANDARD", "DEPOSIT", "BALANCE"]).default("STANDARD"),
});

export async function createInvoice(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "invoices:manage");
  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/invoices/new?error=${encodeURIComponent("Pick a customer first.")}`);
  }
  const customer = await db.customer.findFirst({
    where: { id: parsed.data.customerId, tenantId: ctx.tenant.id },
  });
  if (!customer) {
    redirect(`/t/${slug}/invoices/new?error=${encodeURIComponent("Customer not found.")}`);
  }

  const orderIdRaw = empty(parsed.data.orderId);
  let order: { id: string; customerId: string; locationId: string | null; total: Prisma.Decimal; depositPercent: number; paidAmount: Prisma.Decimal } | null = null;
  if (orderIdRaw) {
    const found = await db.order.findFirst({
      where: { id: orderIdRaw, tenantId: ctx.tenant.id },
      select: { id: true, customerId: true, locationId: true, total: true, depositPercent: true, paidAmount: true },
    });
    if (!found || found.customerId !== customer.id) {
      redirect(`/t/${slug}/invoices/new?error=${encodeURIComponent("Order doesn't belong to that customer.")}`);
    }
    order = found;
  }

  const invoice = await db.$transaction(async (tx) => {
    const tenant = await tx.tenant.update({
      where: { id: ctx.tenant.id },
      data: { invoiceLastNumber: { increment: 1 } },
      select: {
        invoiceNumberPrefix: true,
        invoiceLastNumber: true,
        defaultTaxRate: true,
        defaultPaymentTerms: true,
      },
    });
    const number = `${tenant.invoiceNumberPrefix}${tenant.invoiceLastNumber}`;

    return tx.invoice.create({
      data: {
        tenantId: ctx.tenant.id,
        customerId: customer.id,
        orderId: order?.id ?? null,
        // Phase 15 — branch that issued this invoice. Prefer the order's
        // location (if bound to one), fall back to the customer's.
        locationId: order?.locationId ?? customer.locationId,
        number,
        status: "DRAFT",
        kind: parsed.data.kind,
        terms: tenant.defaultPaymentTerms,
        taxRate: tenant.defaultTaxRate as never,
        createdBy: ctx.userId,
      },
    });
  });

  // If tied to an order, seed items. For a DEPOSIT invoice, create a single
  // line with the deposit amount. Otherwise snapshot the order's lines.
  if (order) {
    if (parsed.data.kind === "DEPOSIT") {
      const depositAmt = Number(order.total) * (order.depositPercent / 100);
      await db.invoiceItem.create({
        data: {
          invoiceId: invoice.id,
          name: `Deposit (${order.depositPercent}%)`,
          description: null,
          quantity: 1 as never,
          unitPrice: depositAmt as never,
          taxable: false,
          subtotal: depositAmt as never,
          sortOrder: 1,
        },
      });
    } else if (parsed.data.kind === "BALANCE") {
      const balance = Math.max(0, Number(order.total) - Number(order.paidAmount));
      await db.invoiceItem.create({
        data: {
          invoiceId: invoice.id,
          name: "Balance due",
          description: null,
          quantity: 1 as never,
          unitPrice: balance as never,
          taxable: false,
          subtotal: balance as never,
          sortOrder: 1,
        },
      });
    } else {
      // STANDARD — copy order line items.
      const orderItems = await db.orderItem.findMany({
        where: { orderId: order.id },
        orderBy: { sortOrder: "asc" },
      });
      if (orderItems.length > 0) {
        await db.invoiceItem.createMany({
          data: orderItems.map((it) => ({
            invoiceId: invoice.id,
            name: it.name,
            description: it.description,
            quantity: it.quantity ?? (1 as never),
            unitPrice: it.subtotal && it.quantity && Number(it.quantity) !== 0
              ? (Number(it.subtotal) / Number(it.quantity)) as never
              : it.subtotal as never,
            taxable: it.taxable,
            subtotal: it.subtotal,
            sortOrder: it.sortOrder,
          })),
        });
      }
    }
    await recomputeInvoiceTotals(invoice.id);
  }

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "invoice.created",
    entityType: "Invoice",
    entityId: invoice.id,
    metadata: { number: invoice.number, customerId: customer.id, orderId: order?.id ?? null, kind: parsed.data.kind },
  });

  revalidatePath(`/t/${slug}/invoices`);
  redirect(`/t/${slug}/invoices/${invoice.id}`);
}

// ────────────────────────────────────────────────────────────
// Meta: issued / due / terms / discount / tax / notes
// ────────────────────────────────────────────────────────────

const metaSchema = z.object({
  issuedAt: optionalString,
  dueDate: optionalString,
  terms: z.enum(["DUE_ON_RECEIPT", "NET_15", "NET_30", "NET_45", "NET_60"]).default("NET_30"),
  discountType: z.enum(["NONE", "FIXED", "PERCENT"]).default("NONE"),
  discountValue: z.string().optional().or(z.literal("")),
  taxRatePercent: z.string().optional().or(z.literal("")),
  customerNote: optionalLong,
  internalNotes: optionalLong,
});

export async function updateInvoiceMeta(slug: string, invoiceId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "invoices:manage");
  const existing = await assertInvoice(ctx.tenant.id, invoiceId);
  if (!existing) redirect(`/t/${slug}/invoices`);

  // Partial-update tolerant: only apply fields whose inputs the submitted
  // form actually carries, so the detail page can split meta across tabbed
  // forms (Details / Notes) without each tab clobbering the others.
  const parsed = metaSchema.partial().safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`/t/${slug}/invoices/${invoiceId}?error=${encodeURIComponent("Invalid input")}`);
  const d = parsed.data;

  const data: Prisma.InvoiceUpdateInput = {};

  const hasIssued = formData.has("issuedAt");
  const hasDue = formData.has("dueDate");
  const hasTerms = formData.has("terms");

  if (hasIssued || hasDue || hasTerms) {
    const termsValue = d.terms ?? existing.terms;
    const issuedAt = hasIssued
      ? (d.issuedAt ? new Date(d.issuedAt) : null)
      : existing.issuedAt;
    let dueDate = hasDue
      ? (d.dueDate ? new Date(d.dueDate) : null)
      : existing.dueDate;
    if (!dueDate && issuedAt && hasIssued) {
      dueDate = new Date(issuedAt.getTime() + TERMS_DAYS[termsValue] * 86_400_000);
    }
    if (hasIssued) data.issuedAt = issuedAt;
    if (hasDue || (hasIssued && !existing.dueDate)) data.dueDate = dueDate;
    if (hasTerms) data.terms = termsValue;
  }

  if (formData.has("discountType")) {
    data.discountType = d.discountType ?? "NONE";
  }
  if (formData.has("discountValue") || formData.has("discountType")) {
    const effectiveType = (formData.get("discountType") as string | null) ?? existing.discountType;
    const discountValue = effectiveType === "NONE" ? 0 : (emptyNum(d.discountValue) ?? 0);
    data.discountValue = discountValue as never;
  }
  if (formData.has("taxRatePercent")) {
    const taxRate = d.taxRatePercent && d.taxRatePercent.length > 0
      ? Math.max(0, Number(d.taxRatePercent)) / 100
      : 0;
    data.taxRate = (Number.isFinite(taxRate) ? taxRate : 0) as never;
  }
  if (formData.has("customerNote")) data.customerNote = empty(d.customerNote);
  if (formData.has("internalNotes")) data.internalNotes = empty(d.internalNotes);

  await db.invoice.update({ where: { id: invoiceId }, data });

  await recomputeInvoiceTotals(invoiceId);
  revalidatePath(`/t/${slug}/invoices/${invoiceId}`);
}

// ────────────────────────────────────────────────────────────
// Line items
// ────────────────────────────────────────────────────────────

const addItemSchema = z.object({
  name: z.string().min(1).max(200),
  description: optionalLong,
  quantity: z.string().optional().or(z.literal("")),
  unitPrice: z.string().optional().or(z.literal("")),
  taxable: z.preprocess((v) => v === "on" || v === "true", z.boolean()).optional(),
});

export async function addInvoiceItem(slug: string, invoiceId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "invoices:manage");
  const existing = await assertInvoice(ctx.tenant.id, invoiceId);
  if (!existing) redirect(`/t/${slug}/invoices`);
  if (existing.status === "VOID" || existing.status === "PAID") return;

  const parsed = addItemSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const d = parsed.data;

  const last = await db.invoiceItem.findFirst({
    where: { invoiceId },
    orderBy: { sortOrder: "desc" },
  });
  const sortOrder = (last?.sortOrder ?? 0) + 1;

  const quantity = emptyNum(d.quantity) ?? 1;
  const unitPrice = emptyNum(d.unitPrice) ?? 0;
  const subtotal = computeInvoiceItemSubtotal({ quantity: quantity as never, unitPrice: unitPrice as never });

  await db.invoiceItem.create({
    data: {
      invoiceId,
      name: d.name,
      description: empty(d.description),
      quantity: quantity as never,
      unitPrice: unitPrice as never,
      taxable: d.taxable ?? true,
      subtotal: subtotal as never,
      sortOrder,
    },
  });

  await recomputeInvoiceTotals(invoiceId);
  revalidatePath(`/t/${slug}/invoices/${invoiceId}`);
}

const updateItemSchema = z.object({
  name: z.string().min(1).max(200),
  description: optionalLong,
  quantity: z.string().optional().or(z.literal("")),
  unitPrice: z.string().optional().or(z.literal("")),
  taxable: z.preprocess((v) => v === "on" || v === "true", z.boolean()).optional(),
});

export async function updateInvoiceItem(slug: string, itemId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "invoices:manage");
  const item = await db.invoiceItem.findFirst({
    where: { id: itemId, invoice: { tenantId: ctx.tenant.id } },
    include: { invoice: { select: { status: true } } },
  });
  if (!item) return;
  if (item.invoice.status === "VOID" || item.invoice.status === "PAID") return;

  const parsed = updateItemSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const d = parsed.data;

  const quantity = emptyNum(d.quantity) ?? 1;
  const unitPrice = emptyNum(d.unitPrice) ?? 0;
  const subtotal = computeInvoiceItemSubtotal({ quantity: quantity as never, unitPrice: unitPrice as never });

  await db.invoiceItem.update({
    where: { id: item.id },
    data: {
      name: d.name,
      description: empty(d.description),
      quantity: quantity as never,
      unitPrice: unitPrice as never,
      taxable: d.taxable ?? false,
      subtotal: subtotal as never,
    },
  });

  await recomputeInvoiceTotals(item.invoiceId);
  revalidatePath(`/t/${slug}/invoices/${item.invoiceId}`);
}

export async function removeInvoiceItem(slug: string, itemId: string) {
  const ctx = await requirePermission(slug, "invoices:manage");
  const item = await db.invoiceItem.findFirst({
    where: { id: itemId, invoice: { tenantId: ctx.tenant.id } },
    include: { invoice: { select: { status: true } } },
  });
  if (!item) return;
  if (item.invoice.status === "VOID" || item.invoice.status === "PAID") return;

  await db.invoiceItem.delete({ where: { id: item.id } });
  await recomputeInvoiceTotals(item.invoiceId);
  revalidatePath(`/t/${slug}/invoices/${item.invoiceId}`);
}

// ────────────────────────────────────────────────────────────
// Status transitions
// ────────────────────────────────────────────────────────────

// Manual transitions users can drive. Automatic derivation based on payment
// progress / dueDate is handled by recomputeInvoiceTotals.
const ALLOWED_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT:       ["SENT", "VOID"],
  SENT:        ["DRAFT", "VOID"],
  PARTIAL:     ["VOID"],
  PAID:        [],
  OVERDUE:     ["VOID"],
  VOID:        ["DRAFT"],
  // Phase 14 — WRITTEN_OFF is a terminal state driven by the
  // writeOffInvoice / reverseWriteOff actions, not the manual status
  // dropdown. Leaving transitions empty keeps it out of the UI menu.
  WRITTEN_OFF: [],
};

const statusSchema = z.object({
  status: z.enum(["DRAFT", "SENT", "PARTIAL", "PAID", "OVERDUE", "VOID"]),
});

export async function changeInvoiceStatus(slug: string, invoiceId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "invoices:manage");
  const existing = await assertInvoice(ctx.tenant.id, invoiceId);
  if (!existing) return;

  const parsed = statusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const next = parsed.data.status;

  if (!ALLOWED_TRANSITIONS[existing.status].includes(next)) {
    redirect(`/t/${slug}/invoices/${invoiceId}?error=${encodeURIComponent(`Can't move from ${existing.status} to ${next}.`)}`);
  }

  const now = new Date();
  const patch: Prisma.InvoiceUpdateInput = { status: next };

  if (next === "SENT") {
    patch.sentAt = now;
    // Auto-set issuedAt + dueDate if user hasn't filled them in.
    const fresh = await db.invoice.findUnique({
      where: { id: invoiceId },
      select: { issuedAt: true, dueDate: true, terms: true },
    });
    if (fresh && !fresh.issuedAt) {
      patch.issuedAt = now;
      if (!fresh.dueDate) {
        patch.dueDate = new Date(now.getTime() + TERMS_DAYS[fresh.terms] * 86_400_000);
      }
    }
  }
  if (next === "VOID") patch.voidedAt = now;
  if (next === "DRAFT") {
    patch.sentAt = null;
    patch.voidedAt = null;
    patch.paidAt = null;
  }

  await db.invoice.update({ where: { id: invoiceId }, data: patch });

  // After a manual flip, recompute so overdue/partial/paid auto-derives correctly.
  await recomputeInvoiceTotals(invoiceId);

  // Phase 14 — customer timeline entry when an invoice is sent.
  // Phase 15 Slice E — also render the branded "invoice ready" email body
  // so the portal timeline shows a real preview and the customer gets a
  // proper message (once a provider is wired in Phase 16).
  if (next === "SENT") {
    const inv = await db.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        number: true, total: true, amountPaid: true, dueDate: true,
        customerId: true,
        customer: { select: { email: true, name: true } },
      },
    });
    if (inv?.customer.email) {
      const portal = await db.portalToken.findFirst({
        where: {
          tenantId: ctx.tenant.id,
          customerId: inv.customerId,
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
        ? `${appOrigin()}/portal/${portal.token}/invoices/${invoiceId}`
        : null;
      const balance = Math.max(0, Number(inv.total) - Number(inv.amountPaid));
      await sendCustomerEmail({
        tenantId:     ctx.tenant.id,
        customerId:   inv.customerId,
        senderUserId: ctx.userId,
        kind:         "INVOICE_SENT",
        to:           inv.customer.email,
        relatedEntityType: "Invoice",
        relatedEntityId:   invoiceId,
        rendered: invoiceReadyEmail({
          shopName:     ctx.tenant.name,
          shopPhone:    ctx.tenant.phone,
          shopWebsite:  ctx.tenant.website,
          invoiceFooterText:   ctx.tenant.invoiceFooterText,
          paymentInstructions: ctx.tenant.paymentInstructions,
          customerName: inv.customer.name,
          invoiceNumber: inv.number,
          total:         formatMoney(Number(inv.total), ctx.tenant.currency),
          balanceDue:    formatMoney(balance, ctx.tenant.currency),
          dueDate:       inv.dueDate ? formatDate(inv.dueDate) : null,
          url,
        }),
      });
    }
  }

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "invoice.status_changed",
    entityType: "Invoice",
    entityId: invoiceId,
    metadata: { from: existing.status, to: next },
  });

  revalidatePath(`/t/${slug}/invoices/${invoiceId}`);
  revalidatePath(`/t/${slug}/invoices`);
}

// ────────────────────────────────────────────────────────────
// Delete (draft-only — PAID invoices are records of money moved)
// ────────────────────────────────────────────────────────────

export async function deleteInvoice(slug: string, invoiceId: string) {
  const ctx = await requirePermission(slug, "invoices:manage");
  const existing = await assertInvoice(ctx.tenant.id, invoiceId);
  if (!existing) redirect(`/t/${slug}/invoices`);
  if (existing.status !== "DRAFT" && existing.status !== "VOID") {
    redirect(`/t/${slug}/invoices/${invoiceId}?error=${encodeURIComponent("Only draft or voided invoices can be deleted.")}`);
  }
  const orderId = existing.orderId;
  await db.invoice.delete({ where: { id: invoiceId } });
  if (orderId) await syncOrderPaidAmount(orderId);

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "invoice.deleted",
    entityType: "Invoice",
    entityId: invoiceId,
  });
  redirect(`/t/${slug}/invoices`);
}

// ────────────────────────────────────────────────────────────
// Phase 14 — partial invoices.
//
// "Partial" here is a billing pattern, not a status. The shop invoices
// a piece of an order (say, the second milestone of a four-phase sign
// install) without locking the kind to DEPOSIT or BALANCE. The line
// item uses the raw amount the user typed in plus an optional label.
// ────────────────────────────────────────────────────────────

const partialSchema = z.object({
  customerId: z.string().min(1),
  orderId: z.string().min(1),
  amount: z.string().min(1),
  label: optionalString,
  taxable: z.preprocess((v) => v === "on" || v === "true", z.boolean()).optional(),
});

export async function createPartialInvoice(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "invoices:manage");
  const parsed = partialSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/invoices/new?error=${encodeURIComponent("Pick a customer, order, and amount.")}`);
  }
  const amount = Number(parsed.data.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    redirect(`/t/${slug}/invoices/new?error=${encodeURIComponent("Amount must be a positive number.")}`);
  }

  const order = await db.order.findFirst({
    where: { id: parsed.data.orderId, tenantId: ctx.tenant.id, customerId: parsed.data.customerId },
    select: { id: true, customerId: true, locationId: true, total: true, paidAmount: true },
  });
  if (!order) {
    redirect(`/t/${slug}/invoices/new?error=${encodeURIComponent("Order doesn't belong to that customer.")}`);
  }

  // Guardrail — we don't want a partial to exceed the order balance. If it
  // does we still allow it (shops sometimes add a surcharge) but we stamp a
  // warning in the internalNotes so the mistake is visible.
  const remaining = Math.max(0, Number(order.total) - Number(order.paidAmount));
  const overrun = amount - remaining;

  const customer = await db.customer.findFirst({
    where: { id: parsed.data.customerId, tenantId: ctx.tenant.id },
    select: { id: true, locationId: true },
  });
  if (!customer) redirect(`/t/${slug}/invoices/new?error=${encodeURIComponent("Customer not found.")}`);

  const label = empty(parsed.data.label) ?? "Progress billing";
  const taxable = parsed.data.taxable === true;

  const invoice = await db.$transaction(async (tx) => {
    const tenant = await tx.tenant.update({
      where: { id: ctx.tenant.id },
      data: { invoiceLastNumber: { increment: 1 } },
      select: {
        invoiceNumberPrefix: true,
        invoiceLastNumber: true,
        defaultTaxRate: true,
        defaultPaymentTerms: true,
      },
    });
    const number = `${tenant.invoiceNumberPrefix}${tenant.invoiceLastNumber}`;
    return tx.invoice.create({
      data: {
        tenantId: ctx.tenant.id,
        customerId: customer.id,
        orderId: order.id,
        locationId: order.locationId ?? customer.locationId,
        number,
        status: "DRAFT",
        kind: "STANDARD",
        terms: tenant.defaultPaymentTerms,
        taxRate: tenant.defaultTaxRate as never,
        createdBy: ctx.userId,
        internalNotes: overrun > 0
          ? `Partial billing exceeds order balance by $${overrun.toFixed(2)}.`
          : null,
      },
    });
  });

  await db.invoiceItem.create({
    data: {
      invoiceId: invoice.id,
      name: label,
      description: null,
      quantity: 1 as never,
      unitPrice: amount as never,
      taxable,
      subtotal: amount as never,
      sortOrder: 1,
    },
  });
  await recomputeInvoiceTotals(invoice.id);

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "invoice.partial_created",
    entityType: "Invoice",
    entityId: invoice.id,
    metadata: { number: invoice.number, orderId: order.id, amount, overrun },
  });

  revalidatePath(`/t/${slug}/invoices`);
  redirect(`/t/${slug}/invoices/${invoice.id}`);
}

// ────────────────────────────────────────────────────────────
// Phase 14 — send overdue reminder.
//
// A one-click "nudge" a user can fire from the invoice detail or list
// page. Records an EmailEvent so the customer timeline shows the
// touchpoint (the actual email delivery is handled out-of-band; the
// invoice team currently relies on manual send). Dedupe lives in the
// cron — this one is an explicit user action, so we don't suppress.
// ────────────────────────────────────────────────────────────

export async function sendInvoiceReminder(slug: string, invoiceId: string) {
  const ctx = await requirePermission(slug, "invoices:manage");
  const inv = await db.invoice.findFirst({
    where: { id: invoiceId, tenantId: ctx.tenant.id },
    select: {
      id: true, number: true, status: true, customerId: true,
      total: true, amountPaid: true, dueDate: true,
      customer: { select: { email: true, name: true } },
    },
  });
  if (!inv) redirect(`/t/${slug}/invoices`);
  if (inv.status !== "SENT" && inv.status !== "PARTIAL" && inv.status !== "OVERDUE") {
    redirect(`/t/${slug}/invoices/${invoiceId}?error=${encodeURIComponent("Reminders only go out for open invoices.")}`);
  }
  if (!inv.customer.email) {
    redirect(`/t/${slug}/invoices/${invoiceId}?error=${encodeURIComponent("Customer has no email on file.")}`);
  }

  // Phase 15 Slice E — render the reminder template so the portal activity
  // feed shows an actual message body, and so a real provider send (Phase 16)
  // has something to deliver.
  const portal = await db.portalToken.findFirst({
    where: {
      tenantId: ctx.tenant.id,
      customerId: inv.customerId,
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
    ? `${appOrigin()}/portal/${portal.token}/invoices/${invoiceId}`
    : null;
  const balance = Math.max(0, Number(inv.total) - Number(inv.amountPaid));
  await sendCustomerEmail({
    tenantId:     ctx.tenant.id,
    customerId:   inv.customerId,
    senderUserId: ctx.userId,
    kind:         "REMINDER",
    to:           inv.customer.email,
    relatedEntityType: "Invoice",
    relatedEntityId:   invoiceId,
    rendered: invoiceReminderEmail({
      shopName:     ctx.tenant.name,
      shopPhone:    ctx.tenant.phone,
      shopWebsite:  ctx.tenant.website,
      invoiceFooterText:   ctx.tenant.invoiceFooterText,
      paymentInstructions: ctx.tenant.paymentInstructions,
      customerName: inv.customer.name,
      invoiceNumber: inv.number,
      balanceDue:    formatMoney(balance, ctx.tenant.currency),
      dueDate:       inv.dueDate ? formatDate(inv.dueDate) : null,
      url,
      overdue:       inv.status === "OVERDUE",
    }),
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "invoice.reminder_sent",
    entityType: "Invoice",
    entityId: invoiceId,
  });

  revalidatePath(`/t/${slug}/invoices/${invoiceId}`);
  redirect(`/t/${slug}/invoices/${invoiceId}?flash=${encodeURIComponent("Reminder logged.")}`);
}

// ────────────────────────────────────────────────────────────
// Phase E — Bulk operations
// ────────────────────────────────────────────────────────────

const BULK_INVOICE_LIMIT = 200;

function parseInvoiceIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, BULK_INVOICE_LIMIT);
}

const bulkInvoiceStatusSchema = z.object({
  ids: z.string().min(1),
  status: z.enum(["VOID", "DRAFT"]),
});

// Bulk void / send-to-draft. PAID and WRITTEN_OFF can't be touched in bulk —
// those are money-trail events and should always be a per-invoice decision
// (reverseWriteOff, recordPayment). Everything else falls through
// ALLOWED_TRANSITIONS so illegal moves silently drop.
export async function bulkChangeInvoiceStatus(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "invoices:manage");
  const parsed = bulkInvoiceStatusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const ids = parseInvoiceIds(parsed.data.ids);
  if (ids.length === 0) return;

  const invoices = await db.invoice.findMany({
    where: { id: { in: ids }, tenantId: ctx.tenant.id },
    select: { id: true, status: true, locationId: true },
  });
  const next = parsed.data.status;
  const allowed = invoices.filter((inv) => {
    try {
      ctx.assertBranchAccess(inv.locationId);
    } catch {
      return false;
    }
    return ALLOWED_TRANSITIONS[inv.status].includes(next);
  });
  if (allowed.length === 0) return;

  const now = new Date();
  const patch: Prisma.InvoiceUpdateManyMutationInput = { status: next };
  if (next === "VOID") patch.voidedAt = now;
  if (next === "DRAFT") {
    patch.sentAt = null;
    patch.voidedAt = null;
    patch.paidAt = null;
  }

  await db.invoice.updateMany({
    where: { id: { in: allowed.map((i) => i.id) } },
    data: patch,
  });

  await Promise.all(
    allowed.map((inv) =>
      logAudit({
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
        action: "invoice.status_changed",
        entityType: "Invoice",
        entityId: inv.id,
        metadata: { bulk: true, from: inv.status, to: next },
      }),
    ),
  );

  revalidatePath(`/t/${slug}/invoices`);
}

const bulkInvoiceReminderSchema = z.object({
  ids: z.string().min(1),
});

// Fires the standard reminder email for every eligible open invoice in the
// selection. Silently skips customers without an email and invoices in a
// non-open status — we don't surface per-row errors from a bulk action.
export async function bulkSendInvoiceReminders(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "invoices:manage");
  const parsed = bulkInvoiceReminderSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const ids = parseInvoiceIds(parsed.data.ids);
  if (ids.length === 0) return;

  const invoices = await db.invoice.findMany({
    where: { id: { in: ids }, tenantId: ctx.tenant.id },
    select: {
      id: true, number: true, status: true, customerId: true,
      total: true, amountPaid: true, dueDate: true, locationId: true,
      customer: { select: { email: true, name: true } },
    },
  });

  const eligible = invoices.filter((inv) => {
    try {
      ctx.assertBranchAccess(inv.locationId);
    } catch {
      return false;
    }
    return (
      inv.customer.email &&
      (inv.status === "SENT" || inv.status === "PARTIAL" || inv.status === "OVERDUE")
    );
  });

  for (const inv of eligible) {
    const portal = await db.portalToken.findFirst({
      where: {
        tenantId: ctx.tenant.id,
        customerId: inv.customerId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { token: true },
      orderBy: { createdAt: "desc" },
    });
    const url = portal
      ? `${appOrigin()}/portal/${portal.token}/invoices/${inv.id}`
      : null;
    const balance = Math.max(0, Number(inv.total) - Number(inv.amountPaid));
    await sendCustomerEmail({
      tenantId:     ctx.tenant.id,
      customerId:   inv.customerId,
      senderUserId: ctx.userId,
      kind:         "REMINDER",
      to:           inv.customer.email!,
      relatedEntityType: "Invoice",
      relatedEntityId:   inv.id,
      rendered: invoiceReminderEmail({
        shopName:     ctx.tenant.name,
        shopPhone:    ctx.tenant.phone,
        shopWebsite:  ctx.tenant.website,
        invoiceFooterText:   ctx.tenant.invoiceFooterText,
        paymentInstructions: ctx.tenant.paymentInstructions,
        customerName: inv.customer.name,
        invoiceNumber: inv.number,
        balanceDue:    formatMoney(balance, ctx.tenant.currency),
        dueDate:       inv.dueDate ? formatDate(inv.dueDate) : null,
        url,
        overdue:       inv.status === "OVERDUE",
      }),
    });
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "invoice.reminder_sent",
      entityType: "Invoice",
      entityId: inv.id,
      metadata: { bulk: true },
    });
  }

  revalidatePath(`/t/${slug}/invoices`);
}
