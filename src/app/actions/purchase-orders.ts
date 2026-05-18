"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";

// Server actions for purchase orders (T-11a).
//
// Workflow:
//   DRAFT -> add lines -> ISSUED -> receive lines (PARTIAL until all
//   received) -> RECEIVED -> CLOSED. Receiving a line increments the
//   linked Material's currentStock so inventory stays accurate.

const createSchema = z.object({
  supplierVendorId: z.string().min(1, "Supplier is required"),
  expectedAt:       z.string().optional().nullable(),
  notes:            z.string().max(2000).optional().nullable(),
});

/** Generate the next per-tenant PO number. Format "PO-{counter}". */
async function nextPoNumber(tenantId: string): Promise<string> {
  const last = await db.purchaseOrder.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    select: { number: true },
  });
  const lastN = last
    ? parseInt(last.number.replace(/^PO-/, ""), 10) || 1000
    : 1000;
  return `PO-${lastN + 1}`;
}

export async function createPurchaseOrder(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "customers:view");

  const parsed = createSchema.safeParse({
    supplierVendorId: formData.get("supplierVendorId"),
    expectedAt:       formData.get("expectedAt") || null,
    notes:            formData.get("notes") || null,
  });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`/t/${slug}/supplier-orders/new?error=${encodeURIComponent(msg)}`);
  }

  // Verify the supplier exists in this tenant before we let the FK
  // constraint fail later.
  const vendor = await db.vendor.findFirst({
    where: { id: parsed.data.supplierVendorId, tenantId: ctx.tenant.id },
    select: { id: true },
  });
  if (!vendor) {
    redirect(`/t/${slug}/supplier-orders/new?error=${encodeURIComponent("Supplier not found")}`);
  }

  const number = await nextPoNumber(ctx.tenant.id);

  await db.purchaseOrder.create({
    data: {
      tenantId:         ctx.tenant.id,
      number,
      supplierVendorId: parsed.data.supplierVendorId,
      status:           "DRAFT",
      expectedAt:       parsed.data.expectedAt ? new Date(parsed.data.expectedAt) : null,
      notes:            parsed.data.notes,
    },
  });

  revalidatePath(`/t/${slug}/supplier-orders`);
  redirect(`/t/${slug}/supplier-orders`);
}

// ──────────────────────────────────────────────────────────────
// Line items + receive workflow.
// ──────────────────────────────────────────────────────────────

const lineSchema = z.object({
  materialId:  z.string().optional().nullable(),
  description: z.string().min(1, "Description is required").max(500),
  quantity:    z.coerce.number().positive("Quantity must be greater than 0"),
  unitCost:    z.coerce.number().min(0).default(0),
});

/** Add a line to a DRAFT PO. Recomputes the PO total. */
export async function addPurchaseOrderLine(
  slug: string,
  poId: string,
  formData: FormData,
) {
  const ctx = await requirePermission(slug, "customers:view");

  const parsed = lineSchema.safeParse({
    materialId:  formData.get("materialId") || null,
    description: formData.get("description"),
    quantity:    formData.get("quantity") ?? "1",
    unitCost:    formData.get("unitCost") ?? "0",
  });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`/t/${slug}/supplier-orders/${poId}?error=${encodeURIComponent(msg)}`);
  }

  const po = await db.purchaseOrder.findFirst({
    where: { id: poId, tenantId: ctx.tenant.id },
    select: { id: true, status: true },
  });
  if (!po) {
    redirect(`/t/${slug}/supplier-orders?error=${encodeURIComponent("PO not found")}`);
  }
  if (po.status !== "DRAFT") {
    redirect(`/t/${slug}/supplier-orders/${poId}?error=${encodeURIComponent("Can only add lines to a draft PO")}`);
  }

  const lineTotal = new Prisma.Decimal(parsed.data.quantity).mul(parsed.data.unitCost);

  await db.$transaction([
    db.purchaseOrderLine.create({
      data: {
        purchaseOrderId: poId,
        materialId:      parsed.data.materialId || null,
        description:     parsed.data.description,
        quantity:        parsed.data.quantity,
        unitCost:        parsed.data.unitCost,
        total:           lineTotal,
      },
    }),
    db.purchaseOrder.update({
      where: { id: poId },
      data: { total: { increment: lineTotal } },
    }),
  ]);

  revalidatePath(`/t/${slug}/supplier-orders/${poId}`);
  redirect(`/t/${slug}/supplier-orders/${poId}`);
}

/** Remove a line from a DRAFT PO. Recomputes the PO total. */
export async function removePurchaseOrderLine(
  slug: string,
  poId: string,
  lineId: string,
) {
  const ctx = await requirePermission(slug, "customers:view");

  const line = await db.purchaseOrderLine.findFirst({
    where: { id: lineId, purchaseOrderId: poId, purchaseOrder: { tenantId: ctx.tenant.id } },
    select: { id: true, total: true, purchaseOrder: { select: { status: true } } },
  });
  if (!line) redirect(`/t/${slug}/supplier-orders/${poId}`);
  if (line.purchaseOrder.status !== "DRAFT") {
    redirect(`/t/${slug}/supplier-orders/${poId}?error=${encodeURIComponent("Can only remove lines from a draft PO")}`);
  }

  await db.$transaction([
    db.purchaseOrderLine.delete({ where: { id: lineId } }),
    db.purchaseOrder.update({
      where: { id: poId },
      data: { total: { decrement: line.total } },
    }),
  ]);

  revalidatePath(`/t/${slug}/supplier-orders/${poId}`);
  redirect(`/t/${slug}/supplier-orders/${poId}`);
}

/** Transition DRAFT -> ISSUED. Stamps issuedAt. */
export async function issuePurchaseOrder(slug: string, poId: string) {
  const ctx = await requirePermission(slug, "customers:view");

  const po = await db.purchaseOrder.findFirst({
    where: { id: poId, tenantId: ctx.tenant.id },
    include: { _count: { select: { lines: true } } },
  });
  if (!po) redirect(`/t/${slug}/supplier-orders`);
  if (po.status !== "DRAFT") {
    redirect(`/t/${slug}/supplier-orders/${poId}?error=${encodeURIComponent("PO is not a draft")}`);
  }
  if (po._count.lines === 0) {
    redirect(`/t/${slug}/supplier-orders/${poId}?error=${encodeURIComponent("Add at least one line before issuing")}`);
  }

  await db.purchaseOrder.update({
    where: { id: poId },
    data: { status: "ISSUED", issuedAt: new Date() },
  });

  revalidatePath(`/t/${slug}/supplier-orders/${poId}`);
  redirect(`/t/${slug}/supplier-orders/${poId}?ok=issued`);
}

const receiveSchema = z.object({
  qty: z.coerce.number().positive("Receive quantity must be greater than 0"),
});

/** Receive (some or all of) a line. Bumps the linked Material's
 *  currentStock by the received quantity. Transitions the PO to
 *  PARTIAL or RECEIVED based on remaining open lines. */
export async function receivePurchaseOrderLine(
  slug: string,
  poId: string,
  lineId: string,
  formData: FormData,
) {
  const ctx = await requirePermission(slug, "customers:view");

  const parsed = receiveSchema.safeParse({ qty: formData.get("qty") });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid quantity";
    redirect(`/t/${slug}/supplier-orders/${poId}?error=${encodeURIComponent(msg)}`);
  }

  const line = await db.purchaseOrderLine.findFirst({
    where: {
      id: lineId,
      purchaseOrderId: poId,
      purchaseOrder: { tenantId: ctx.tenant.id },
    },
    include: {
      purchaseOrder: { select: { id: true, status: true } },
    },
  });
  if (!line) redirect(`/t/${slug}/supplier-orders/${poId}`);
  if (line.purchaseOrder.status !== "ISSUED" && line.purchaseOrder.status !== "PARTIAL") {
    redirect(`/t/${slug}/supplier-orders/${poId}?error=${encodeURIComponent("PO must be Issued or Partial to receive")}`);
  }

  const remaining = Number(line.quantity) - Number(line.receivedQty);
  if (parsed.data.qty > remaining + 0.001) {
    redirect(`/t/${slug}/supplier-orders/${poId}?error=${encodeURIComponent(`Cannot receive more than ${remaining} remaining`)}`);
  }

  // Apply the receive. Bump Material stock if a Material is linked.
  const ops: Prisma.PrismaPromise<unknown>[] = [
    db.purchaseOrderLine.update({
      where: { id: lineId },
      data: { receivedQty: { increment: parsed.data.qty } },
    }),
  ];
  if (line.materialId) {
    ops.push(
      db.material.update({
        where: { id: line.materialId },
        data: {
          currentStock: { increment: parsed.data.qty },
          // Refresh unit cost to whatever we just paid — keeps the
          // "what does it cost today" caption honest.
          unitCost: line.unitCost,
        },
      }),
    );
  }
  await db.$transaction(ops);

  // Recompute PO status. If every line is fully received → RECEIVED;
  // if any line has been partially received → PARTIAL.
  const lines = await db.purchaseOrderLine.findMany({
    where: { purchaseOrderId: poId },
    select: { quantity: true, receivedQty: true },
  });
  const allReceived = lines.every((l) => Number(l.receivedQty) >= Number(l.quantity) - 0.001);
  const anyReceived = lines.some((l) => Number(l.receivedQty) > 0);
  const newStatus = allReceived ? "RECEIVED" : anyReceived ? "PARTIAL" : line.purchaseOrder.status;
  await db.purchaseOrder.update({
    where: { id: poId },
    data: {
      status: newStatus,
      receivedAt: allReceived ? new Date() : null,
    },
  });

  revalidatePath(`/t/${slug}/supplier-orders/${poId}`);
  redirect(`/t/${slug}/supplier-orders/${poId}?ok=received`);
}

/** RECEIVED -> CLOSED. Final state. */
export async function closePurchaseOrder(slug: string, poId: string) {
  const ctx = await requirePermission(slug, "customers:view");
  const po = await db.purchaseOrder.findFirst({
    where: { id: poId, tenantId: ctx.tenant.id },
    select: { status: true },
  });
  if (!po || po.status !== "RECEIVED") {
    redirect(`/t/${slug}/supplier-orders/${poId}?error=${encodeURIComponent("PO must be Received to close")}`);
  }
  await db.purchaseOrder.update({ where: { id: poId }, data: { status: "CLOSED" } });
  revalidatePath(`/t/${slug}/supplier-orders/${poId}`);
  redirect(`/t/${slug}/supplier-orders/${poId}?ok=closed`);
}

/** Cancel a draft or issued PO. */
export async function cancelPurchaseOrder(slug: string, poId: string) {
  const ctx = await requirePermission(slug, "customers:view");
  const po = await db.purchaseOrder.findFirst({
    where: { id: poId, tenantId: ctx.tenant.id },
    select: { status: true },
  });
  if (!po) redirect(`/t/${slug}/supplier-orders`);
  if (po.status === "RECEIVED" || po.status === "CLOSED") {
    redirect(`/t/${slug}/supplier-orders/${poId}?error=${encodeURIComponent("Cannot cancel a received PO")}`);
  }
  await db.purchaseOrder.update({ where: { id: poId }, data: { status: "CANCELED" } });
  revalidatePath(`/t/${slug}/supplier-orders/${poId}`);
  redirect(`/t/${slug}/supplier-orders?ok=canceled`);
}
