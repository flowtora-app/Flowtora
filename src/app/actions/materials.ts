"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";

// Server actions for the Materials inventory (T-11).

const createSchema = z.object({
  name:        z.string().min(1, "Name is required").max(120),
  category:    z.string().max(80).optional().nullable(),
  sku:         z.string().max(80).optional().nullable(),
  unit:        z.string().min(1).max(20).default("ea"),
  currentStock: z.coerce.number().min(0).default(0),
  reorderAt:    z.coerce.number().min(0).default(0),
  maxStock:     z.coerce.number().min(0).default(0),
  unitCost:     z.coerce.number().min(0).default(0),
  supplierVendorId: z.string().optional().nullable(),
});

export async function createMaterial(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "customers:view");

  const parsed = createSchema.safeParse({
    name:             formData.get("name"),
    category:         formData.get("category") || null,
    sku:              formData.get("sku") || null,
    unit:             formData.get("unit") || "ea",
    currentStock:     formData.get("currentStock") ?? 0,
    reorderAt:        formData.get("reorderAt") ?? 0,
    maxStock:         formData.get("maxStock") ?? 0,
    unitCost:         formData.get("unitCost") ?? 0,
    supplierVendorId: formData.get("supplierVendorId") || null,
  });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`/t/${slug}/materials/new?error=${encodeURIComponent(msg)}`);
  }

  await db.material.create({
    data: {
      tenantId:         ctx.tenant.id,
      name:             parsed.data.name,
      category:         parsed.data.category,
      sku:              parsed.data.sku,
      unit:             parsed.data.unit,
      currentStock:     parsed.data.currentStock,
      reorderAt:        parsed.data.reorderAt,
      maxStock:         parsed.data.maxStock,
      unitCost:         parsed.data.unitCost,
      supplierVendorId: parsed.data.supplierVendorId || null,
    },
  });

  revalidatePath(`/t/${slug}/materials`);
  redirect(`/t/${slug}/materials`);
}
