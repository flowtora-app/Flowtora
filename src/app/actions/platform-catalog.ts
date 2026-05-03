"use server";

// Page 25 — Master Product Catalog server actions.
//
// Permissions: writes gated on `plans.manage` (the closest existing
// permission to "catalog admin" — finer-grained `catalog.write` ships
// with the next RBAC pass). Audit-logged.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logPlatformAudit, requirePlatformPermission } from "@/lib/platform";

const ROUTE = "/platform/catalog/products";

const SLUG_RX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const CATEGORIES = [
  "BANNERS","YARD_SIGNS","VEHICLE_WRAPS","WINDOW_GRAPHICS","WALL_DECALS",
  "TRADE_SHOW_DISPLAYS","A_FRAMES","CHANNEL_LETTERS","ADA_SIGNS",
  "APPAREL_SCREEN_PRINT","APPAREL_DTG","APPAREL_DTF","APPAREL_EMBROIDERY",
  "CAPS","HOODIES","BUSINESS_CARDS","BROCHURES","POSTERS","STICKERS",
  "LABELS","MAGNETS","PROMO_PRODUCTS","TRADE_PRINT","WIDE_FORMAT",
  "ARCHITECTURAL","WAYFINDING","CUSTOM",
] as const;

/* ── Create / update ────────────────────────────────────── */

const productSchema = z.object({
  id: z.string().optional(),
  slug: z.string().trim().toLowerCase().regex(SLUG_RX, "Slug: lowercase letters, digits, hyphens only").max(80),
  name: z.string().trim().min(2).max(120),
  sku: z.string().trim().max(60).optional().or(z.literal("")),
  category: z.enum(CATEGORIES),
  industryVertical: z.string().trim().max(80).optional().or(z.literal("")),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
  shortDescription: z.string().trim().max(280).optional().or(z.literal("")),
  internalNotes: z.string().trim().max(1000).optional().or(z.literal("")),
  tags: z.string().optional(), // comma-separated
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("DRAFT"),
  /** Display dollars (e.g. "9.99") — converted to minor units. */
  priceFrom: z.string().optional().or(z.literal("")),
  pricingFormulaSlug: z.string().trim().toLowerCase().max(80).optional().or(z.literal("")),
  pricingExpression: z.string().trim().max(500).optional().or(z.literal("")),
  leadTimeDays: z.coerce.number().int().min(0).max(365).default(3),
  rushLeadTimeDays: z.coerce.number().int().min(0).max(365).optional(),
  wasteFactorPct: z.coerce.number().min(0).max(100).default(0),
  requiredEquipment: z.string().optional(), // comma-separated
  capacityUnit: z.string().trim().max(40).optional().or(z.literal("")),
  capacityValue: z.coerce.number().min(0).optional(),
  certifications: z.string().optional(), // comma-separated
  complianceNotes: z.string().trim().max(2000).optional().or(z.literal("")),
  primaryImageUrl: z.string().trim().max(500).optional().or(z.literal("")),
  seoTitle: z.string().trim().max(120).optional().or(z.literal("")),
  seoDescription: z.string().trim().max(280).optional().or(z.literal("")),
  ogImageUrl: z.string().trim().max(500).optional().or(z.literal("")),
});

function csvList(s: string | undefined): string[] {
  if (!s) return [];
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

export async function upsertMasterProduct(formData: FormData) {
  const ctx = await requirePlatformPermission("plans.manage");
  const parsed = productSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`${ROUTE}?error=${encodeURIComponent(msg)}`);
  }

  const priceFromMinor = parsed.data.priceFrom && parsed.data.priceFrom.trim() !== ""
    ? Math.max(0, Math.round(Number(parsed.data.priceFrom) * 100))
    : 0;

  // Slug uniqueness — surface a friendly error.
  if (!parsed.data.id) {
    const clash = await db.masterProduct.findUnique({ where: { slug: parsed.data.slug }, select: { id: true } });
    if (clash) {
      redirect(`${ROUTE}?error=${encodeURIComponent(`Slug "${parsed.data.slug}" already exists`)}`);
    }
  }

  const data = {
    slug: parsed.data.slug,
    name: parsed.data.name,
    sku: parsed.data.sku?.trim() || null,
    category: parsed.data.category,
    industryVertical: parsed.data.industryVertical?.trim() || null,
    description: parsed.data.description?.trim() || null,
    shortDescription: parsed.data.shortDescription?.trim() || null,
    internalNotes: parsed.data.internalNotes?.trim() || null,
    tags: csvList(parsed.data.tags).map((t) => t.toLowerCase()),
    status: parsed.data.status,
    priceFromMinor,
    pricingFormulaSlug: parsed.data.pricingFormulaSlug?.trim() || null,
    pricingExpression: parsed.data.pricingExpression?.trim() || null,
    leadTimeDays: parsed.data.leadTimeDays,
    rushLeadTimeDays: parsed.data.rushLeadTimeDays ?? null,
    wasteFactorPct: new Prisma.Decimal(parsed.data.wasteFactorPct),
    requiredEquipment: csvList(parsed.data.requiredEquipment),
    capacityUnit: parsed.data.capacityUnit?.trim() || null,
    capacityValue: parsed.data.capacityValue != null
      ? new Prisma.Decimal(parsed.data.capacityValue)
      : null,
    certifications: csvList(parsed.data.certifications),
    complianceNotes: parsed.data.complianceNotes?.trim() || null,
    primaryImageUrl: parsed.data.primaryImageUrl?.trim() || null,
    seoTitle: parsed.data.seoTitle?.trim() || null,
    seoDescription: parsed.data.seoDescription?.trim() || null,
    ogImageUrl: parsed.data.ogImageUrl?.trim() || null,
  };

  if (parsed.data.id) {
    await db.masterProduct.update({
      where: { id: parsed.data.id },
      data: {
        ...data,
        publishedAt: parsed.data.status === "PUBLISHED" ? (await db.masterProduct.findUnique({
          where: { id: parsed.data.id },
          select: { publishedAt: true },
        }))?.publishedAt ?? new Date() : null,
      },
    });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.master_product_updated",
      entityType: "MasterProduct",
      entityId: parsed.data.id,
      metadata: { actor: ctx.email, slug: parsed.data.slug, status: parsed.data.status },
    });
    revalidatePath(ROUTE);
    redirect(`${ROUTE}/${parsed.data.id}?ok=saved`);
  } else {
    const created = await db.masterProduct.create({
      data: {
        ...data,
        publishedAt: parsed.data.status === "PUBLISHED" ? new Date() : null,
        createdById: ctx.userId,
      },
      select: { id: true },
    });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.master_product_created",
      entityType: "MasterProduct",
      entityId: created.id,
      metadata: { actor: ctx.email, slug: parsed.data.slug, status: parsed.data.status },
    });
    revalidatePath(ROUTE);
    redirect(`${ROUTE}/${created.id}?ok=created`);
  }
}

/* ── Status transitions ──────────────────────────────────── */

export async function publishMasterProduct(productId: string) {
  const ctx = await requirePlatformPermission("plans.manage");
  const p = await db.masterProduct.findUnique({
    where: { id: productId },
    include: { attributes: true, materials: true, images: true },
  });
  if (!p) redirect(`${ROUTE}?error=${encodeURIComponent("Product not found")}`);

  // Snapshot a version at publish time.
  const lastVersion = await db.masterProductVersion.findFirst({
    where: { productId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (lastVersion?.version ?? 0) + 1;

  await db.$transaction([
    db.masterProduct.update({
      where: { id: productId },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    }),
    db.masterProductVersion.create({
      data: {
        productId,
        version: nextVersion,
        publishedByUserId: ctx.userId,
        note: `Published v${nextVersion}`,
        snapshot: {
          name: p.name,
          slug: p.slug,
          category: p.category,
          status: "PUBLISHED",
          priceFromMinor: p.priceFromMinor,
          leadTimeDays: p.leadTimeDays,
          attributeCount: p.attributes.length,
          materialCount: p.materials.length,
          imageCount: p.images.length,
        },
      },
    }),
  ]);
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.master_product_published",
    entityType: "MasterProduct",
    entityId: productId,
    metadata: { actor: ctx.email, slug: p.slug, version: nextVersion },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${productId}?ok=published`);
}

export async function archiveMasterProduct(productId: string) {
  const ctx = await requirePlatformPermission("plans.manage");
  const p = await db.masterProduct.findUnique({
    where: { id: productId },
    select: { id: true, slug: true },
  });
  if (!p) redirect(`${ROUTE}?error=${encodeURIComponent("Product not found")}`);
  await db.masterProduct.update({
    where: { id: productId },
    data: { status: "ARCHIVED" },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.master_product_archived",
    entityType: "MasterProduct",
    entityId: productId,
    metadata: { actor: ctx.email, slug: p.slug },
    severity: "WARNING",
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${productId}?ok=archived`);
}

export async function duplicateMasterProduct(productId: string) {
  const ctx = await requirePlatformPermission("plans.manage");
  const src = await db.masterProduct.findUnique({
    where: { id: productId },
    include: { attributes: true, materials: true, images: true },
  });
  if (!src) redirect(`${ROUTE}?error=${encodeURIComponent("Product not found")}`);

  // Pick a unique slug.
  let slug = `${src.slug}-copy`;
  for (let i = 1; i <= 50; i++) {
    const trial = i === 1 ? slug : `${slug}-${i}`;
    const taken = await db.masterProduct.findUnique({ where: { slug: trial }, select: { id: true } });
    if (!taken) { slug = trial; break; }
  }

  const dup = await db.masterProduct.create({
    data: {
      slug,
      name: `${src.name} (copy)`,
      sku: src.sku ? `${src.sku}-COPY` : null,
      category: src.category,
      industryVertical: src.industryVertical,
      description: src.description,
      shortDescription: src.shortDescription,
      internalNotes: src.internalNotes,
      tags: src.tags,
      status: "DRAFT",
      priceFromMinor: src.priceFromMinor,
      pricingFormulaSlug: src.pricingFormulaSlug,
      pricingExpression: src.pricingExpression,
      leadTimeDays: src.leadTimeDays,
      rushLeadTimeDays: src.rushLeadTimeDays,
      wasteFactorPct: src.wasteFactorPct,
      requiredEquipment: src.requiredEquipment,
      capacityUnit: src.capacityUnit,
      capacityValue: src.capacityValue,
      certifications: src.certifications,
      complianceNotes: src.complianceNotes,
      primaryImageUrl: src.primaryImageUrl,
      seoTitle: src.seoTitle,
      seoDescription: src.seoDescription,
      ogImageUrl: src.ogImageUrl,
      createdById: ctx.userId,
      attributes: {
        create: src.attributes.map((a) => ({
          key: a.key,
          label: a.label,
          type: a.type,
          sortOrder: a.sortOrder,
          required: a.required,
          customerVisible: a.customerVisible,
          defaultValue: (a.defaultValue ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
          validation: (a.validation ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
          options: (a.options ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
          conditional: (a.conditional ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
          helpText: a.helpText,
        })),
      },
      materials: {
        create: src.materials.map((m) => ({
          materialKey: m.materialKey,
          label: m.label,
          defaultConsumption: m.defaultConsumption,
          costPerUnit: m.costPerUnit,
          unit: m.unit,
          preferredSupplier: m.preferredSupplier,
          notes: m.notes,
        })),
      },
      images: {
        create: src.images.map((img) => ({
          url: img.url,
          altText: img.altText,
          kind: img.kind,
          sortOrder: img.sortOrder,
          mockupAreas: (img.mockupAreas ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
        })),
      },
    },
    select: { id: true },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.master_product_duplicated",
    entityType: "MasterProduct",
    entityId: dup.id,
    metadata: { actor: ctx.email, sourceId: productId, slug },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${dup.id}?ok=duplicated`);
}

/* ── Push update to clones ─────────────────────────────── */

export async function pushMasterProductUpdate(productId: string) {
  const ctx = await requirePlatformPermission("plans.manage");
  const src = await db.masterProduct.findUnique({
    where: { id: productId },
    select: {
      id: true, name: true, slug: true, status: true,
      shortDescription: true, description: true, primaryImageUrl: true,
      priceFromMinor: true, leadTimeDays: true,
    },
  });
  if (!src) redirect(`${ROUTE}?error=${encodeURIComponent("Product not found")}`);
  if (src.status !== "PUBLISHED") {
    redirect(`${ROUTE}/${productId}?error=${encodeURIComponent("Publish first before pushing to tenants")}`);
  }

  // Push: update every cloned tenant Product row's name + description +
  // image URL + base price. We do NOT overwrite the tenant's local
  // pricing tier overrides or option groups — only the headline fields.
  const result = await db.product.updateMany({
    where: { masterProductId: src.id },
    data: {
      name: src.name,
      description: src.description ?? src.shortDescription,
      imageUrl: src.primaryImageUrl,
      basePrice: new Prisma.Decimal(src.priceFromMinor / 100),
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.master_product_pushed",
    entityType: "MasterProduct",
    entityId: productId,
    metadata: { actor: ctx.email, slug: src.slug, clonesUpdated: result.count },
    severity: "WARNING",
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${productId}?ok=pushed`);
}

/* ── Attributes / Materials / Images (small upserts) ───── */

const attributeSchema = z.object({
  id: z.string().optional(),
  productId: z.string().min(1),
  key: z.string().trim().min(1).max(60).regex(/^[a-z0-9_]+$/, "Use lowercase letters, digits, underscores"),
  label: z.string().trim().min(1).max(120),
  type: z.enum(["NUMBER", "SELECT", "MULTI_SELECT", "COLOR", "BOOLEAN", "DATE", "FILE_UPLOAD", "TEXT"]),
  sortOrder: z.coerce.number().int().min(0).default(0),
  required: z.union([z.literal("on"), z.literal("")]).optional(),
  customerVisible: z.union([z.literal("on"), z.literal("")]).optional(),
  helpText: z.string().trim().max(500).optional().or(z.literal("")),
  /** Optional JSON string for options / validation / default — admin can paste it. */
  optionsJson: z.string().optional().or(z.literal("")),
  validationJson: z.string().optional().or(z.literal("")),
  defaultValueJson: z.string().optional().or(z.literal("")),
});

function parseJsonField(raw: string | undefined, name: string): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (!raw || raw.trim() === "") return Prisma.JsonNull;
  try {
    return JSON.parse(raw) as Prisma.InputJsonValue;
  } catch {
    throw new Error(`Invalid JSON for ${name}`);
  }
}

export async function upsertMasterProductAttribute(formData: FormData) {
  const ctx = await requirePlatformPermission("plans.manage");
  const parsed = attributeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid attribute";
    redirect(`${ROUTE}/${(formData.get("productId") as string) ?? ""}?tab=attributes&error=${encodeURIComponent(msg)}`);
  }
  let options: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  let validation: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  let defaultValue: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  try {
    options = parseJsonField(parsed.data.optionsJson, "options");
    validation = parseJsonField(parsed.data.validationJson, "validation");
    defaultValue = parseJsonField(parsed.data.defaultValueJson, "default value");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid JSON";
    redirect(`${ROUTE}/${parsed.data.productId}?tab=attributes&error=${encodeURIComponent(msg)}`);
  }
  const data = {
    key: parsed.data.key,
    label: parsed.data.label,
    type: parsed.data.type,
    sortOrder: parsed.data.sortOrder,
    required: parsed.data.required === "on",
    customerVisible: parsed.data.customerVisible !== "",
    helpText: parsed.data.helpText?.trim() || null,
    options,
    validation,
    defaultValue,
  };
  if (parsed.data.id) {
    await db.masterProductAttribute.update({ where: { id: parsed.data.id }, data });
  } else {
    await db.masterProductAttribute.create({
      data: { ...data, productId: parsed.data.productId },
    });
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.master_attribute_saved",
    entityType: "MasterProductAttribute",
    entityId: parsed.data.id ?? "(new)",
    metadata: { actor: ctx.email, productId: parsed.data.productId, key: parsed.data.key, type: parsed.data.type },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${parsed.data.productId}?tab=attributes&ok=attribute_saved`);
}

export async function deleteMasterProductAttribute(attributeId: string) {
  const ctx = await requirePlatformPermission("plans.manage");
  const attr = await db.masterProductAttribute.findUnique({
    where: { id: attributeId },
    select: { id: true, productId: true, key: true },
  });
  if (!attr) redirect(`${ROUTE}?error=${encodeURIComponent("Attribute not found")}`);
  await db.masterProductAttribute.delete({ where: { id: attributeId } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.master_attribute_deleted",
    entityType: "MasterProductAttribute",
    entityId: attributeId,
    metadata: { actor: ctx.email, productId: attr.productId, key: attr.key },
    severity: "WARNING",
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${attr.productId}?tab=attributes&ok=attribute_deleted`);
}

const materialSchema = z.object({
  id: z.string().optional(),
  productId: z.string().min(1),
  materialKey: z.string().trim().min(1).max(60).regex(/^[a-z0-9_]+$/, "Use lowercase letters, digits, underscores"),
  label: z.string().trim().min(1).max(120),
  defaultConsumption: z.string().trim().max(200).optional().or(z.literal("")),
  costPerUnit: z.coerce.number().int().min(0).default(0),
  unit: z.string().trim().max(40).optional().or(z.literal("")),
  preferredSupplier: z.string().trim().max(120).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function upsertMasterProductMaterial(formData: FormData) {
  const ctx = await requirePlatformPermission("plans.manage");
  const parsed = materialSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid material";
    redirect(`${ROUTE}/${(formData.get("productId") as string) ?? ""}?tab=materials&error=${encodeURIComponent(msg)}`);
  }
  const data = {
    materialKey: parsed.data.materialKey,
    label: parsed.data.label,
    defaultConsumption: parsed.data.defaultConsumption?.trim() || null,
    costPerUnit: parsed.data.costPerUnit,
    unit: parsed.data.unit?.trim() || null,
    preferredSupplier: parsed.data.preferredSupplier?.trim() || null,
    notes: parsed.data.notes?.trim() || null,
  };
  if (parsed.data.id) {
    await db.masterProductMaterial.update({ where: { id: parsed.data.id }, data });
  } else {
    await db.masterProductMaterial.create({
      data: { ...data, productId: parsed.data.productId },
    });
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.master_material_saved",
    entityType: "MasterProductMaterial",
    entityId: parsed.data.id ?? "(new)",
    metadata: { actor: ctx.email, productId: parsed.data.productId, materialKey: parsed.data.materialKey },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${parsed.data.productId}?tab=materials&ok=material_saved`);
}

export async function deleteMasterProductMaterial(materialId: string) {
  const ctx = await requirePlatformPermission("plans.manage");
  const m = await db.masterProductMaterial.findUnique({
    where: { id: materialId },
    select: { id: true, productId: true, materialKey: true },
  });
  if (!m) redirect(`${ROUTE}?error=${encodeURIComponent("Material not found")}`);
  await db.masterProductMaterial.delete({ where: { id: materialId } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.master_material_deleted",
    entityType: "MasterProductMaterial",
    entityId: materialId,
    metadata: { actor: ctx.email, productId: m.productId, materialKey: m.materialKey },
    severity: "WARNING",
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${m.productId}?tab=materials&ok=material_deleted`);
}

const imageSchema = z.object({
  id: z.string().optional(),
  productId: z.string().min(1),
  url: z.string().trim().min(4).max(500),
  altText: z.string().trim().max(200).optional().or(z.literal("")),
  kind: z.enum(["HERO", "GALLERY", "MOCKUP", "LIFESTYLE", "HOVER"]),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export async function upsertMasterProductImage(formData: FormData) {
  const ctx = await requirePlatformPermission("plans.manage");
  const parsed = imageSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid image";
    redirect(`${ROUTE}/${(formData.get("productId") as string) ?? ""}?tab=images&error=${encodeURIComponent(msg)}`);
  }
  const data = {
    url: parsed.data.url,
    altText: parsed.data.altText?.trim() || null,
    kind: parsed.data.kind,
    sortOrder: parsed.data.sortOrder,
  };
  if (parsed.data.id) {
    await db.masterProductImage.update({ where: { id: parsed.data.id }, data });
  } else {
    await db.masterProductImage.create({
      data: { ...data, productId: parsed.data.productId },
    });
  }
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${parsed.data.productId}?tab=images&ok=image_saved`);
  void ctx;
}

export async function deleteMasterProductImage(imageId: string) {
  await requirePlatformPermission("plans.manage");
  const img = await db.masterProductImage.findUnique({
    where: { id: imageId },
    select: { id: true, productId: true },
  });
  if (!img) redirect(`${ROUTE}?error=${encodeURIComponent("Image not found")}`);
  await db.masterProductImage.delete({ where: { id: imageId } });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${img.productId}?tab=images&ok=image_deleted`);
}
