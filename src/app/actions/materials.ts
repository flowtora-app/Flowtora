"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
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

// ── Update ───────────────────────────────────────────────────────────

const updateSchema = z.object({
  name:        z.string().min(1, "Name is required").max(120),
  category:    z.string().max(80).optional().nullable(),
  sku:         z.string().max(80).optional().nullable(),
  unit:        z.string().min(1).max(20),
  reorderAt:   z.coerce.number().min(0),
  maxStock:    z.coerce.number().min(0),
  unitCost:    z.coerce.number().min(0),
  supplierVendorId: z.string().optional().nullable(),
});

export async function updateMaterial(
  slug: string,
  id: string,
  formData: FormData,
) {
  const ctx = await requirePermission(slug, "customers:view");

  const parsed = updateSchema.safeParse({
    name:             formData.get("name"),
    category:         formData.get("category") || null,
    sku:              formData.get("sku") || null,
    unit:             formData.get("unit") || "ea",
    reorderAt:        formData.get("reorderAt") ?? 0,
    maxStock:         formData.get("maxStock") ?? 0,
    unitCost:         formData.get("unitCost") ?? 0,
    supplierVendorId: formData.get("supplierVendorId") || null,
  });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(
      `/t/${slug}/materials/${id}/edit?error=${encodeURIComponent(msg)}`,
    );
  }

  const existing = await db.material.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    select: { id: true },
  });
  if (!existing) {
    redirect(`/t/${slug}/materials?error=${encodeURIComponent("Material not found")}`);
  }

  // We intentionally don't accept currentStock in the edit form —
  // stock-on-hand mutates through adjustMaterialStock (receive / use /
  // count adjustment), which keeps an explicit history of why the
  // number changed.
  await db.material.update({
    where: { id },
    data: {
      name:             parsed.data.name,
      category:         parsed.data.category,
      sku:              parsed.data.sku,
      unit:             parsed.data.unit,
      reorderAt:        parsed.data.reorderAt,
      maxStock:         parsed.data.maxStock,
      unitCost:         parsed.data.unitCost,
      supplierVendorId: parsed.data.supplierVendorId || null,
    },
  });

  revalidatePath(`/t/${slug}/materials`);
  revalidatePath(`/t/${slug}/materials/${id}`);
  redirect(`/t/${slug}/materials/${id}`);
}

// ── Stock adjustments ────────────────────────────────────────────────
//
// Three motivations for changing the on-hand number, picked via the
// `reason` enum. We don't currently persist the history (a
// MaterialStockEvent table would be the right home) but the action
// is the seam where that would land. For now it just mutates the
// Material row.

const adjustSchema = z.object({
  // Signed delta — positive for receive, negative for use, signed for
  // count adjustment depending on direction.
  delta:  z.coerce.number(),
  reason: z.enum(["RECEIVE", "USE", "COUNT"]),
});

export async function adjustMaterialStock(
  slug: string,
  id: string,
  formData: FormData,
) {
  const ctx = await requirePermission(slug, "customers:view");

  const parsed = adjustSchema.safeParse({
    delta:  formData.get("delta"),
    reason: formData.get("reason") || "RECEIVE",
  });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`/t/${slug}/materials/${id}?error=${encodeURIComponent(msg)}`);
  }

  const material = await db.material.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    select: { id: true, currentStock: true },
  });
  if (!material) {
    redirect(`/t/${slug}/materials?error=${encodeURIComponent("Material not found")}`);
  }

  // For RECEIVE / USE the delta is interpreted from a positive
  // user-entered number — we sign it based on reason. For COUNT the
  // delta is signed by the user directly.
  let signedDelta = parsed.data.delta;
  if (parsed.data.reason === "USE")     signedDelta = -Math.abs(signedDelta);
  if (parsed.data.reason === "RECEIVE") signedDelta =  Math.abs(signedDelta);

  const next = new Prisma.Decimal(material.currentStock).add(signedDelta);
  // Clamp to zero — we never want negative on-hand.
  const clamped = next.lt(0) ? new Prisma.Decimal(0) : next;

  await db.material.update({
    where: { id },
    data:  { currentStock: clamped },
  });

  revalidatePath(`/t/${slug}/materials`);
  revalidatePath(`/t/${slug}/materials/${id}`);
  redirect(`/t/${slug}/materials/${id}`);
}

// ── Soft-delete ──────────────────────────────────────────────────────

export async function archiveMaterial(slug: string, id: string) {
  const ctx = await requirePermission(slug, "customers:view");

  await db.material.updateMany({
    where: { id, tenantId: ctx.tenant.id, archivedAt: null },
    data:  { archivedAt: new Date() },
  });

  revalidatePath(`/t/${slug}/materials`);
  redirect(`/t/${slug}/materials`);
}

export async function unarchiveMaterial(slug: string, id: string) {
  const ctx = await requirePermission(slug, "customers:view");

  await db.material.updateMany({
    where: { id, tenantId: ctx.tenant.id },
    data:  { archivedAt: null },
  });

  revalidatePath(`/t/${slug}/materials`);
  revalidatePath(`/t/${slug}/materials/${id}`);
  redirect(`/t/${slug}/materials/${id}`);
}
