"use server";

// Page 26 — Master Material Library server actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logPlatformAudit, requirePlatformPermission } from "@/lib/platform";

const ROUTE = "/platform/catalog/materials";

const SLUG_RX = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

const CATEGORIES = [
  "VINYL", "SUBSTRATES", "INKS", "THREADS", "BLANKS",
  "HARDWARE", "TOOLS", "FINISHING", "ADHESIVES",
] as const;

const FINISHES = [
  "MATTE", "GLOSS", "SATIN", "TEXTURED", "REFLECTIVE", "FROSTED", "CLEAR",
] as const;

const USAGES = ["INDOOR", "OUTDOOR", "BOTH"] as const;

/* ── Material upsert ────────────────────────────────────── */

const materialSchema = z.object({
  id: z.string().optional(),
  slug: z.string().trim().toLowerCase().regex(SLUG_RX, "Slug: lowercase letters/digits/hyphens/underscores").max(80),
  name: z.string().trim().min(2).max(120),
  sku: z.string().trim().max(60).optional().or(z.literal("")),
  category: z.enum(CATEGORIES),
  subcategory: z.string().trim().max(60).optional().or(z.literal("")),

  widthIn: z.coerce.number().min(0).optional(),
  rollLengthFt: z.coerce.number().min(0).optional(),
  thicknessMil: z.coerce.number().min(0).optional(),
  gsm: z.coerce.number().int().min(0).optional(),
  colorHex: z.string().trim().max(20).optional().or(z.literal("")),
  pantoneCode: z.string().trim().max(20).optional().or(z.literal("")),
  finish: z.enum(FINISHES).optional().or(z.literal("")),
  usage: z.enum(USAGES).default("BOTH"),
  durabilityYears: z.coerce.number().int().min(0).max(20).optional(),
  fireRating: z.string().trim().max(60).optional().or(z.literal("")),
  recyclable: z.union([z.literal("on"), z.literal("")]).optional(),
  opacityPct: z.coerce.number().int().min(0).max(100).optional(),
  adhesiveType: z.string().trim().max(60).optional().or(z.literal("")),

  defaultCost: z.coerce.number().int().min(0).default(0),
  defaultUnit: z.string().trim().max(20).default("sq_ft"),
  defaultMarkupPct: z.coerce.number().min(0).max(500).default(50),
  wasteFactorPct: z.coerce.number().min(0).max(100).default(0),
  minOrderQty: z.coerce.number().min(0).optional(),

  imageUrl: z.string().trim().max(500).optional().or(z.literal("")),
  datasheetUrl: z.string().trim().max(500).optional().or(z.literal("")),
  equipmentCompatibility: z.string().optional(), // comma-separated
  compatibleProductSlugs: z.string().optional(), // comma-separated

  status: z.enum(["ACTIVE", "DISCONTINUED"]).default("ACTIVE"),
  internalNotes: z.string().trim().max(2000).optional().or(z.literal("")),
  tags: z.string().optional(), // comma-separated
});

function csvList(s: string | undefined): string[] {
  if (!s) return [];
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

export async function upsertMasterMaterial(formData: FormData) {
  const ctx = await requirePlatformPermission("plans.manage");
  const parsed = materialSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`${ROUTE}?error=${encodeURIComponent(msg)}`);
  }

  // Slug uniqueness check on create.
  if (!parsed.data.id) {
    const clash = await db.masterMaterial.findUnique({ where: { slug: parsed.data.slug }, select: { id: true } });
    if (clash) {
      redirect(`${ROUTE}?error=${encodeURIComponent(`Slug "${parsed.data.slug}" already exists`)}`);
    }
  }

  const data = {
    slug: parsed.data.slug,
    name: parsed.data.name,
    sku: parsed.data.sku?.trim() || null,
    category: parsed.data.category,
    subcategory: parsed.data.subcategory?.trim() || null,
    widthIn: parsed.data.widthIn != null
      ? new Prisma.Decimal(parsed.data.widthIn) : null,
    rollLengthFt: parsed.data.rollLengthFt != null
      ? new Prisma.Decimal(parsed.data.rollLengthFt) : null,
    thicknessMil: parsed.data.thicknessMil != null
      ? new Prisma.Decimal(parsed.data.thicknessMil) : null,
    gsm: parsed.data.gsm ?? null,
    colorHex: parsed.data.colorHex?.trim() || null,
    pantoneCode: parsed.data.pantoneCode?.trim() || null,
    finish: parsed.data.finish
      ? (parsed.data.finish as typeof FINISHES[number])
      : null,
    usage: parsed.data.usage,
    durabilityYears: parsed.data.durabilityYears ?? null,
    fireRating: parsed.data.fireRating?.trim() || null,
    recyclable: parsed.data.recyclable === "on",
    opacityPct: parsed.data.opacityPct ?? null,
    adhesiveType: parsed.data.adhesiveType?.trim() || null,
    defaultCost: parsed.data.defaultCost,
    defaultUnit: parsed.data.defaultUnit,
    defaultMarkupPct: new Prisma.Decimal(parsed.data.defaultMarkupPct),
    wasteFactorPct: new Prisma.Decimal(parsed.data.wasteFactorPct),
    minOrderQty: parsed.data.minOrderQty != null
      ? new Prisma.Decimal(parsed.data.minOrderQty) : null,
    imageUrl: parsed.data.imageUrl?.trim() || null,
    datasheetUrl: parsed.data.datasheetUrl?.trim() || null,
    equipmentCompatibility: csvList(parsed.data.equipmentCompatibility).map((x) => x.toLowerCase()),
    compatibleProductSlugs: csvList(parsed.data.compatibleProductSlugs).map((x) => x.toLowerCase()),
    status: parsed.data.status,
    internalNotes: parsed.data.internalNotes?.trim() || null,
    tags: csvList(parsed.data.tags).map((t) => t.toLowerCase()),
  };

  if (parsed.data.id) {
    await db.masterMaterial.update({ where: { id: parsed.data.id }, data });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.master_material_updated",
      entityType: "MasterMaterial",
      entityId: parsed.data.id,
      metadata: { actor: ctx.email, slug: parsed.data.slug, status: parsed.data.status },
    });
    revalidatePath(ROUTE);
    redirect(`${ROUTE}/${parsed.data.id}?ok=saved`);
  } else {
    const created = await db.masterMaterial.create({
      data: { ...data, createdById: ctx.userId },
      select: { id: true },
    });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.master_material_created",
      entityType: "MasterMaterial",
      entityId: created.id,
      metadata: { actor: ctx.email, slug: parsed.data.slug },
    });
    revalidatePath(ROUTE);
    redirect(`${ROUTE}/${created.id}?ok=created`);
  }
}

export async function archiveMasterMaterial(materialId: string) {
  const ctx = await requirePlatformPermission("plans.manage");
  const m = await db.masterMaterial.findUnique({
    where: { id: materialId },
    select: { id: true, slug: true },
  });
  if (!m) redirect(`${ROUTE}?error=${encodeURIComponent("Material not found")}`);
  await db.masterMaterial.update({
    where: { id: materialId },
    data: { status: "DISCONTINUED" },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.master_material_discontinued",
    entityType: "MasterMaterial",
    entityId: materialId,
    metadata: { actor: ctx.email, slug: m.slug },
    severity: "WARNING",
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${materialId}?ok=discontinued`);
}

export async function reactivateMasterMaterial(materialId: string) {
  const ctx = await requirePlatformPermission("plans.manage");
  const m = await db.masterMaterial.findUnique({
    where: { id: materialId },
    select: { id: true, slug: true },
  });
  if (!m) redirect(`${ROUTE}?error=${encodeURIComponent("Material not found")}`);
  await db.masterMaterial.update({
    where: { id: materialId },
    data: { status: "ACTIVE" },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.master_material_reactivated",
    entityType: "MasterMaterial",
    entityId: materialId,
    metadata: { actor: ctx.email, slug: m.slug },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${materialId}?ok=reactivated`);
}

/* ── Suppliers ──────────────────────────────────────────── */

const supplierSchema = z.object({
  id: z.string().optional(),
  materialId: z.string().min(1),
  supplierName: z.string().trim().min(2).max(120),
  supplierSku: z.string().trim().max(80).optional().or(z.literal("")),
  leadTimeDays: z.coerce.number().int().min(0).max(365).optional(),
  moq: z.coerce.number().min(0).optional(),
  costAtSupplier: z.coerce.number().int().min(0).default(0),
  portalUrl: z.string().trim().max(500).optional().or(z.literal("")),
  isPrimary: z.union([z.literal("on"), z.literal("")]).optional(),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function upsertMaterialSupplier(formData: FormData) {
  const ctx = await requirePlatformPermission("plans.manage");
  const parsed = supplierSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid supplier";
    redirect(`${ROUTE}/${(formData.get("materialId") as string) ?? ""}?tab=suppliers&error=${encodeURIComponent(msg)}`);
  }
  const isPrimary = parsed.data.isPrimary === "on";

  // Demote any existing primary on the same material if we're setting this one.
  if (isPrimary) {
    await db.masterMaterialSupplier.updateMany({
      where: { materialId: parsed.data.materialId, isPrimary: true },
      data: { isPrimary: false },
    });
  }

  const data = {
    supplierName: parsed.data.supplierName,
    supplierSku: parsed.data.supplierSku?.trim() || null,
    leadTimeDays: parsed.data.leadTimeDays ?? null,
    moq: parsed.data.moq != null ? new Prisma.Decimal(parsed.data.moq) : null,
    costAtSupplier: parsed.data.costAtSupplier,
    lastPriceUpdate: new Date(),
    portalUrl: parsed.data.portalUrl?.trim() || null,
    isPrimary,
    notes: parsed.data.notes?.trim() || null,
  };
  if (parsed.data.id) {
    await db.masterMaterialSupplier.update({ where: { id: parsed.data.id }, data });
  } else {
    await db.masterMaterialSupplier.create({
      data: { ...data, materialId: parsed.data.materialId },
    });
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.material_supplier_saved",
    entityType: "MasterMaterialSupplier",
    entityId: parsed.data.id ?? "(new)",
    metadata: { actor: ctx.email, materialId: parsed.data.materialId, supplierName: parsed.data.supplierName },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${parsed.data.materialId}?tab=suppliers&ok=supplier_saved`);
}

export async function deleteMaterialSupplier(supplierId: string) {
  const ctx = await requirePlatformPermission("plans.manage");
  const s = await db.masterMaterialSupplier.findUnique({
    where: { id: supplierId },
    select: { id: true, materialId: true, supplierName: true },
  });
  if (!s) redirect(`${ROUTE}?error=${encodeURIComponent("Supplier not found")}`);
  await db.masterMaterialSupplier.delete({ where: { id: supplierId } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.material_supplier_deleted",
    entityType: "MasterMaterialSupplier",
    entityId: supplierId,
    metadata: { actor: ctx.email, materialId: s.materialId, supplierName: s.supplierName },
    severity: "WARNING",
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${s.materialId}?tab=suppliers&ok=supplier_deleted`);
}

/* ── Color swatches ─────────────────────────────────────── */

const swatchSchema = z.object({
  id: z.string().optional(),
  materialId: z.string().min(1),
  colorName: z.string().trim().min(1).max(120),
  colorKey: z.string().trim().toLowerCase().regex(/^[a-z0-9_]+$/, "Use lowercase letters, digits, underscores").max(60),
  hex: z.string().trim().max(20).optional().or(z.literal("")),
  pantoneCode: z.string().trim().max(20).optional().or(z.literal("")),
  skuSuffix: z.string().trim().max(40).optional().or(z.literal("")),
  imageUrl: z.string().trim().max(500).optional().or(z.literal("")),
  sortOrder: z.coerce.number().int().min(0).default(0),
  active: z.union([z.literal("on"), z.literal("")]).optional(),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function upsertMaterialSwatch(formData: FormData) {
  const ctx = await requirePlatformPermission("plans.manage");
  const parsed = swatchSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid swatch";
    redirect(`${ROUTE}/${(formData.get("materialId") as string) ?? ""}?tab=swatches&error=${encodeURIComponent(msg)}`);
  }
  const data = {
    colorName: parsed.data.colorName,
    colorKey: parsed.data.colorKey,
    hex: parsed.data.hex?.trim() || null,
    pantoneCode: parsed.data.pantoneCode?.trim() || null,
    skuSuffix: parsed.data.skuSuffix?.trim() || null,
    imageUrl: parsed.data.imageUrl?.trim() || null,
    sortOrder: parsed.data.sortOrder,
    active: parsed.data.active !== "",
    notes: parsed.data.notes?.trim() || null,
  };
  if (parsed.data.id) {
    await db.masterMaterialColorSwatch.update({ where: { id: parsed.data.id }, data });
  } else {
    await db.masterMaterialColorSwatch.create({
      data: { ...data, materialId: parsed.data.materialId },
    });
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.material_swatch_saved",
    entityType: "MasterMaterialColorSwatch",
    entityId: parsed.data.id ?? "(new)",
    metadata: { actor: ctx.email, materialId: parsed.data.materialId, colorKey: parsed.data.colorKey },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${parsed.data.materialId}?tab=swatches&ok=swatch_saved`);
}

export async function deleteMaterialSwatch(swatchId: string) {
  const ctx = await requirePlatformPermission("plans.manage");
  const s = await db.masterMaterialColorSwatch.findUnique({
    where: { id: swatchId },
    select: { id: true, materialId: true, colorKey: true },
  });
  if (!s) redirect(`${ROUTE}?error=${encodeURIComponent("Swatch not found")}`);
  await db.masterMaterialColorSwatch.delete({ where: { id: swatchId } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.material_swatch_deleted",
    entityType: "MasterMaterialColorSwatch",
    entityId: swatchId,
    metadata: { actor: ctx.email, materialId: s.materialId, colorKey: s.colorKey },
    severity: "WARNING",
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${s.materialId}?tab=swatches&ok=swatch_deleted`);
}
