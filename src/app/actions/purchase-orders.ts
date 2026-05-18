"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";

// Server actions for purchase orders (T-11a).

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
