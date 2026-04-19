"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { ORDER_TRANSITIONS } from "@/lib/orders";
import { loadApprovalRules, orderCanEnterProduction } from "@/lib/approvals";

const optionalString = z.string().max(200).optional().or(z.literal(""));
const optionalLong = z.string().max(4000).optional().or(z.literal(""));
const empty = (s: string | undefined) => (s && s.length > 0 ? s : null);

// ────────────────────────────────────────────────────────────
// Conversion from quote (called by quote-approval or manual action)
// ────────────────────────────────────────────────────────────

// Exported so the quote-status action can auto-create on APPROVED.
// Transactional: bumps tenant.orderLastNumber + snapshots items in one shot.
// Returns the new order, or the existing one if already converted.
export async function createOrderFromQuoteInTx(
  tx: Prisma.TransactionClient,
  args: { tenantId: string; quoteId: string; createdByUserId: string },
) {
  const existing = await tx.order.findUnique({
    where: { quoteId: args.quoteId },
  });
  if (existing) return existing;

  const quote = await tx.quote.findFirst({
    where: { id: args.quoteId, tenantId: args.tenantId },
    include: { items: true },
  });
  if (!quote) return null;

  const tenant = await tx.tenant.update({
    where: { id: args.tenantId },
    data: { orderLastNumber: { increment: 1 } },
    select: {
      orderNumberPrefix:               true,
      orderLastNumber:                 true,
      defaultDepositPercent:           true,
      // Phase 22 Slice C + D — seed auto-assignment + default checklist.
      defaultProductionManagerId:      true,
      defaultOrderChecklistTemplateId: true,
      // Phase A Slice 1 — invoice numbering for the auto-generated deposit.
      invoiceNumberPrefix:             true,
      invoiceLastNumber:               true,
      defaultTaxRate:                  true,
      defaultPaymentTerms:             true,
    },
  });
  const number = `${tenant.orderNumberPrefix}${tenant.orderLastNumber}`;

  // Phase 22 Slice C — verify the house default production manager is still
  // an active member. Stale IDs resolve to null so we never persist a dangling
  // owner on the order.
  let productionManagerId: string | null = null;
  if (tenant.defaultProductionManagerId) {
    const m = await tx.membership.findFirst({
      where: { tenantId: args.tenantId, userId: tenant.defaultProductionManagerId, status: "ACTIVE" },
      select: { userId: true },
    });
    if (m) productionManagerId = m.userId;
  }

  const created = await tx.order.create({
    data: {
      tenantId: args.tenantId,
      customerId: quote.customerId,
      // Phase 15 — carry the quote's branch forward.
      locationId: quote.locationId,
      quoteId: quote.id,
      number,
      status: "NEW",
      subtotal: quote.subtotal,
      discountAmount: quote.discountAmount,
      taxAmount: quote.taxAmount,
      total: quote.total,
      depositPercent: tenant.defaultDepositPercent,
      productionManagerId,
      createdBy: args.createdByUserId,
      items: {
        create: quote.items.map((it) => ({
          productId: it.productId,
          name: it.name,
          description: it.description,
          pricingModel: it.pricingModel,
          basePrice: it.basePrice,
          unit: it.unit,
          taxable: it.taxable,
          quantity: it.quantity,
          width: it.width,
          height: it.height,
          length: it.length,
          hours: it.hours,
          manualPrice: it.manualPrice,
          selectedOptions: it.selectedOptions ?? [],
          subtotal: it.subtotal,
          sortOrder: it.sortOrder,
        })),
      },
    },
  });

  // Phase A Slice 1 — if the source quote carries a deposit, auto-create a
  // DEPOSIT invoice so the customer has something to pay right after approval.
  // The deposit amount is taken from the quote's computed depositAmount (which
  // already respects depositType FIXED vs PERCENT). Invoice remains DRAFT; the
  // staff user can review + send.
  const depositAmount = Number(quote.depositAmount);
  if (depositAmount > 0) {
    const depositInvoiceNumber = `${tenant.invoiceNumberPrefix}${tenant.invoiceLastNumber + 1}`;
    await tx.tenant.update({
      where: { id: args.tenantId },
      data:  { invoiceLastNumber: { increment: 1 } },
    });
    await tx.invoice.create({
      data: {
        tenantId:   args.tenantId,
        customerId: quote.customerId,
        orderId:    created.id,
        locationId: quote.locationId,
        number:     depositInvoiceNumber,
        status:     "DRAFT",
        kind:       "DEPOSIT",
        terms:      tenant.defaultPaymentTerms,
        taxRate:    tenant.defaultTaxRate as never,
        subtotal:   depositAmount as never,
        total:      depositAmount as never,
        createdBy:  args.createdByUserId,
        items: {
          create: [
            {
              name:       `Deposit for order ${created.number}`,
              quantity:   1 as never,
              unitPrice:  depositAmount as never,
              taxable:    false,
              subtotal:   depositAmount as never,
              sortOrder:  1,
            },
          ],
        },
      },
    });
  }

  // Phase 22 Slice D — seed default order checklist template (if configured
  // and still active). Items are snapshotted onto the order so subsequent
  // template edits don't retroactively rewrite this in-flight job.
  if (tenant.defaultOrderChecklistTemplateId) {
    const tpl = await tx.checklistTemplate.findFirst({
      where: {
        id: tenant.defaultOrderChecklistTemplateId,
        tenantId: args.tenantId,
        kind: "ORDER",
        active: true,
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    if (tpl && tpl.items.length > 0) {
      await tx.checklistItem.createMany({
        data: tpl.items.map((it, idx) => ({
          tenantId:       args.tenantId,
          orderId:        created.id,
          installEventId: null,
          templateId:     tpl.id,
          title:          it.title,
          description:    it.description,
          sortOrder:      idx + 1,
        })),
      });
    }
  }

  return created;
}

// Manual entry point (e.g. button on quote detail).
export async function createOrderFromQuote(slug: string, quoteId: string) {
  const ctx = await requirePermission(slug, "orders:manage");
  const order = await db.$transaction(async (tx) => {
    return createOrderFromQuoteInTx(tx, {
      tenantId: ctx.tenant.id,
      quoteId,
      createdByUserId: ctx.userId,
    });
  });
  if (!order) redirect(`/t/${slug}/quotes/${quoteId}?error=${encodeURIComponent("Quote not found.")}`);

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "order.created_from_quote",
    entityType: "Order",
    entityId: order.id,
    metadata: { quoteId },
  });

  revalidatePath(`/t/${slug}/orders`);
  redirect(`/t/${slug}/orders/${order.id}`);
}

// ────────────────────────────────────────────────────────────
// Meta: schedule + assignees + notes + deposit%
// ────────────────────────────────────────────────────────────

const metaSchema = z.object({
  dueDate: optionalString,        // YYYY-MM-DD
  scheduledFor: optionalString,   // YYYY-MM-DDTHH:mm
  productionManagerId: optionalString,
  installerId: optionalString,
  depositPercent: z.string().optional().or(z.literal("")),
  customerNote: optionalLong,
  productionNotes: optionalLong,
  installNotes: optionalLong,
});

async function assertOrder(tenantId: string, orderId: string) {
  return db.order.findFirst({
    where: { id: orderId, tenantId },
    select: { id: true, status: true, customerId: true, quoteId: true },
  });
}

async function validAssignee(tenantId: string, userId: string | null) {
  if (!userId) return null;
  const m = await db.membership.findFirst({
    where: { tenantId, userId, status: "ACTIVE" },
  });
  return m ? userId : null;
}

export async function updateOrderMeta(slug: string, orderId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "orders:manage");
  const order = await assertOrder(ctx.tenant.id, orderId);
  if (!order) redirect(`/t/${slug}/orders`);

  const parsed = metaSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`/t/${slug}/orders/${orderId}?error=${encodeURIComponent("Invalid input")}`);
  const d = parsed.data;

  const productionManagerId = await validAssignee(ctx.tenant.id, empty(d.productionManagerId));
  const installerId = await validAssignee(ctx.tenant.id, empty(d.installerId));

  const depositPct = d.depositPercent && d.depositPercent.length > 0
    ? Math.max(0, Math.min(100, Math.round(Number(d.depositPercent))))
    : 0;

  await db.order.update({
    where: { id: orderId },
    data: {
      dueDate: d.dueDate ? new Date(d.dueDate) : null,
      scheduledFor: d.scheduledFor ? new Date(d.scheduledFor) : null,
      productionManagerId,
      installerId,
      depositPercent: depositPct,
      customerNote: empty(d.customerNote),
      productionNotes: empty(d.productionNotes),
      installNotes: empty(d.installNotes),
    },
  });

  revalidatePath(`/t/${slug}/orders/${orderId}`);
}

// ────────────────────────────────────────────────────────────
// Status transitions
// ────────────────────────────────────────────────────────────

const statusSchema = z.object({
  status: z.enum(["NEW", "IN_PRODUCTION", "READY", "OUT_FOR_INSTALL", "COMPLETED", "CANCELED"]),
  cancelReason: optionalString,
});

export async function changeOrderStatus(slug: string, orderId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "orders:manage");
  const order = await assertOrder(ctx.tenant.id, orderId);
  if (!order) return;

  const parsed = statusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const next = parsed.data.status;

  if (!ORDER_TRANSITIONS[order.status].includes(next)) {
    redirect(`/t/${slug}/orders/${orderId}?error=${encodeURIComponent(`Can't move from ${order.status} to ${next}.`)}`);
  }

  // Phase 13 — block NEW→IN_PRODUCTION if tenant requires an approved proof
  // first. Other transitions (READY, COMPLETED, …) don't re-check because by
  // then we're past the gate.
  if (next === "IN_PRODUCTION") {
    const rules = await loadApprovalRules(ctx.tenant.id);
    const reason = await orderCanEnterProduction(ctx.tenant.id, orderId, rules);
    if (reason) {
      redirect(`/t/${slug}/orders/${orderId}?error=${encodeURIComponent(reason)}`);
    }
  }

  const now = new Date();
  const patch: Prisma.OrderUpdateInput = { status: next };
  if (next === "IN_PRODUCTION") patch.startedAt = now;
  if (next === "READY") patch.readyAt = now;
  if (next === "COMPLETED") patch.completedAt = now;
  if (next === "CANCELED") {
    patch.canceledAt = now;
    patch.cancelReason = empty(parsed.data.cancelReason);
  }
  if (next === "NEW") {
    patch.startedAt = null;
    patch.readyAt = null;
    patch.completedAt = null;
    patch.canceledAt = null;
    patch.cancelReason = null;
  }

  await db.order.update({ where: { id: orderId }, data: patch });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "order.status_changed",
    entityType: "Order",
    entityId: orderId,
    metadata: { from: order.status, to: next },
  });

  revalidatePath(`/t/${slug}/orders/${orderId}`);
  revalidatePath(`/t/${slug}/orders`);
}

// ────────────────────────────────────────────────────────────
// Per-item produced toggle (production crew checks off finished lines)
// ────────────────────────────────────────────────────────────

export async function toggleItemProduced(slug: string, itemId: string) {
  const ctx = await requirePermission(slug, "production:manage");
  const item = await db.orderItem.findFirst({
    where: { id: itemId, order: { tenantId: ctx.tenant.id } },
  });
  if (!item) return;
  await db.orderItem.update({
    where: { id: item.id },
    data: { producedAt: item.producedAt ? null : new Date() },
  });
  revalidatePath(`/t/${slug}/orders/${item.orderId}`);
}

// ────────────────────────────────────────────────────────────
// Phase 10 — Priority (rush indicator)
// ────────────────────────────────────────────────────────────

const prioritySchema = z.object({
  priority: z.enum(["NORMAL", "HIGH", "RUSH"]),
});

export async function updateOrderPriority(slug: string, orderId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "orders:manage");
  const order = await assertOrder(ctx.tenant.id, orderId);
  if (!order) return;

  const parsed = prioritySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/orders/${orderId}?error=${encodeURIComponent("Invalid priority.")}`);
  }

  await db.order.update({
    where: { id: orderId },
    data:  { priority: parsed.data.priority },
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "order.priority_changed",
    entityType: "Order",
    entityId:   orderId,
    metadata:   { priority: parsed.data.priority },
  });

  revalidatePath(`/t/${slug}/orders/${orderId}`);
  revalidatePath(`/t/${slug}/orders`);
}

// ────────────────────────────────────────────────────────────
// Phase 10 — Blockers / on-hold reasons
// ────────────────────────────────────────────────────────────
//
// A blocker records *why* an order can't move forward right now. Common
// ones are AWAITING_CUSTOMER (client hasn't replied), AWAITING_MATERIALS
// (vendor ETA not in), AWAITING_PAYMENT (deposit not collected), plus a
// CUSTOM catch-all for the weird stuff.
//
// We don't auto-change status when a blocker is added — blockers are
// advisory metadata that make the state visible; status stays wherever
// it was. But the `orderCanEnterProduction` gate refuses to advance while
// an unresolved blocker exists, so you can't accidentally mark "in
// production" on a job that's actually paused.

const addBlockerSchema = z.object({
  reason: z.enum([
    "AWAITING_CUSTOMER", "AWAITING_APPROVAL", "AWAITING_MATERIALS",
    "AWAITING_PROOF", "AWAITING_PAYMENT", "CUSTOM",
  ]),
  notes: optionalLong,
});

export async function addOrderBlocker(slug: string, orderId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "orders:manage");
  const order = await assertOrder(ctx.tenant.id, orderId);
  if (!order) return;

  const parsed = addBlockerSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/orders/${orderId}?error=${encodeURIComponent("Pick a reason.")}`);
  }

  await db.orderBlocker.create({
    data: {
      tenantId:  ctx.tenant.id,
      orderId,
      reason:    parsed.data.reason,
      notes:     empty(parsed.data.notes),
      blockedBy: ctx.userId,
    },
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "order.blocker_added",
    entityType: "Order",
    entityId:   orderId,
    metadata:   { reason: parsed.data.reason },
  });

  revalidatePath(`/t/${slug}/orders/${orderId}`);
  revalidatePath(`/t/${slug}/orders`);
}

export async function resolveOrderBlocker(slug: string, blockerId: string) {
  const ctx = await requirePermission(slug, "orders:manage");
  const blocker = await db.orderBlocker.findFirst({
    where:  { id: blockerId, tenantId: ctx.tenant.id },
    select: { id: true, orderId: true, resolvedAt: true, reason: true },
  });
  if (!blocker || blocker.resolvedAt) return;

  await db.orderBlocker.update({
    where: { id: blockerId },
    data:  { resolvedAt: new Date(), resolvedBy: ctx.userId },
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "order.blocker_resolved",
    entityType: "Order",
    entityId:   blocker.orderId,
    metadata:   { reason: blocker.reason, blockerId },
  });

  revalidatePath(`/t/${slug}/orders/${blocker.orderId}`);
  revalidatePath(`/t/${slug}/orders`);
}

// ────────────────────────────────────────────────────────────
// Phase 10 — Job specs (production-facing details)
// ────────────────────────────────────────────────────────────
//
// These are the "what do we actually build" fields the shop floor reads
// before touching a machine — substrate, finish, color, install approach.
// We keep them as concrete columns (vs a JSON blob) so the UI can render
// them as labels and we can search/filter on them later without pulling
// records into app memory. They're optional by design: a print-only shop
// doesn't care about installMethod, and a wraps shop may leave material
// blank on a re-print job.

const jobSpecsSchema = z.object({
  material:            optionalString,
  finish:              optionalString,
  colorSpecs:          optionalString,
  installMethod:       optionalString,
  specialInstructions: optionalLong,
});

export async function saveOrderJobSpecs(slug: string, orderId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "orders:manage");
  const order = await assertOrder(ctx.tenant.id, orderId);
  if (!order) return;

  const parsed = jobSpecsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/orders/${orderId}?error=${encodeURIComponent("Invalid job specs.")}`);
  }
  const d = parsed.data;

  await db.order.update({
    where: { id: orderId },
    data: {
      material:            empty(d.material),
      finish:              empty(d.finish),
      colorSpecs:          empty(d.colorSpecs),
      installMethod:       empty(d.installMethod),
      specialInstructions: empty(d.specialInstructions),
    },
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "order.job_specs_updated",
    entityType: "Order",
    entityId:   orderId,
  });

  revalidatePath(`/t/${slug}/orders/${orderId}`);
}

// ────────────────────────────────────────────────────────────
// Delete (reserved for canceled orders only — keep history intact)
// ────────────────────────────────────────────────────────────

export async function deleteOrder(slug: string, orderId: string) {
  const ctx = await requirePermission(slug, "orders:manage");
  const order = await assertOrder(ctx.tenant.id, orderId);
  if (!order) return;
  if (order.status !== "CANCELED") {
    redirect(`/t/${slug}/orders/${orderId}?error=${encodeURIComponent("Only canceled orders can be deleted.")}`);
  }
  await db.order.delete({ where: { id: orderId } });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "order.deleted",
    entityType: "Order",
    entityId: orderId,
  });
  redirect(`/t/${slug}/orders`);
}

// Phase E — inline priority edit used by the orders list row menu. We
// don't guard by `assertBranchAccess` here separately because orders
// inherit branch from their parent customer and the `assertOrder` helper
// above already filters by tenantId; branch scope is enforced through
// `applyBranchScope` at read time. For consistency with other edit paths
// the single-order handler leaves that guarantee intact.

// ────────────────────────────────────────────────────────────
// Phase E — Bulk operations
// ────────────────────────────────────────────────────────────

const BULK_ORDER_LIMIT = 200;

function parseOrderIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, BULK_ORDER_LIMIT);
}

const bulkOrderPrioritySchema = z.object({
  ids: z.string().min(1),
  priority: z.enum(["NORMAL", "HIGH", "RUSH"]),
});

export async function bulkChangeOrderPriority(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "orders:manage");
  const parsed = bulkOrderPrioritySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const ids = parseOrderIds(parsed.data.ids);
  if (ids.length === 0) return;

  const orders = await db.order.findMany({
    where: { id: { in: ids }, tenantId: ctx.tenant.id },
    select: { id: true, priority: true, locationId: true },
  });
  const allowed = orders.filter((o) => {
    try {
      ctx.assertBranchAccess(o.locationId);
      return true;
    } catch {
      return false;
    }
  });
  const toUpdate = allowed.filter((o) => o.priority !== parsed.data.priority);
  if (toUpdate.length === 0) return;

  await db.order.updateMany({
    where: { id: { in: toUpdate.map((o) => o.id) } },
    data: { priority: parsed.data.priority },
  });

  await Promise.all(
    toUpdate.map((o) =>
      logAudit({
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
        action: "order.priority_changed",
        entityType: "Order",
        entityId: o.id,
        metadata: { bulk: true, from: o.priority, to: parsed.data.priority },
      }),
    ),
  );

  revalidatePath(`/t/${slug}/orders`);
}

const bulkOrderStatusSchema = z.object({
  ids: z.string().min(1),
  status: z.enum(["CANCELED"]),
});

// Bulk cancel only — intentionally narrow. Moving NEW→IN_PRODUCTION in
// bulk would need to re-run the proof-approval gate per order, and
// COMPLETED should always be a per-order decision. Cancel is the one
// status where a shop commonly sweeps many rows at once (e.g. a customer
// pulls a batch of orders).
export async function bulkCancelOrders(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "orders:manage");
  const parsed = bulkOrderStatusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const ids = parseOrderIds(parsed.data.ids);
  if (ids.length === 0) return;

  const orders = await db.order.findMany({
    where: { id: { in: ids }, tenantId: ctx.tenant.id },
    select: { id: true, status: true, locationId: true },
  });
  const allowed = orders.filter((o) => {
    try {
      ctx.assertBranchAccess(o.locationId);
    } catch {
      return false;
    }
    return ORDER_TRANSITIONS[o.status].includes("CANCELED");
  });
  if (allowed.length === 0) return;

  const now = new Date();
  await db.order.updateMany({
    where: { id: { in: allowed.map((o) => o.id) } },
    data: { status: "CANCELED", canceledAt: now },
  });

  await Promise.all(
    allowed.map((o) =>
      logAudit({
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
        action: "order.status_changed",
        entityType: "Order",
        entityId: o.id,
        metadata: { bulk: true, from: o.status, to: "CANCELED" },
      }),
    ),
  );

  revalidatePath(`/t/${slug}/orders`);
}
