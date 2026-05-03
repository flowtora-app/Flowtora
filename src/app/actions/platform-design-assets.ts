"use server";

// Page 30 — Design Asset Library server actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logPlatformAudit, requirePlatformPermission } from "@/lib/platform";

const ROUTE = "/platform/catalog/assets";

const SLUG_RX = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

const KINDS = ["FONT", "ICON", "MOCKUP", "PALETTE", "PATTERN", "PHOTO", "TEMPLATE"] as const;
const LICENSES = ["CC0", "CC_BY", "CC_BY_SA", "COMMERCIAL", "PROPRIETARY", "CUSTOM"] as const;
const STATUSES = ["ACTIVE", "ARCHIVED"] as const;

function csvList(s: string | undefined): string[] {
  if (!s) return [];
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

function parseJsonField(raw: string | undefined, name: string): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (!raw || raw.trim() === "") return Prisma.JsonNull;
  try {
    return JSON.parse(raw) as Prisma.InputJsonValue;
  } catch {
    throw new Error(`Invalid JSON for ${name}`);
  }
}

const assetSchema = z.object({
  id: z.string().optional(),
  slug: z.string().trim().toLowerCase().regex(SLUG_RX, "Slug: lowercase letters/digits/hyphens/underscores").max(80),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  kind: z.enum(KINDS),
  fileUrl: z.string().trim().max(500).optional().or(z.literal("")),
  thumbnailUrl: z.string().trim().max(500).optional().or(z.literal("")),
  format: z.string().trim().max(40).optional().or(z.literal("")),
  sizeBytes: z.coerce.number().int().min(0).optional(),
  metadataJson: z.string().optional().or(z.literal("")),
  /** Comma-separated hex codes for PALETTE kind. */
  paletteColors: z.string().optional().or(z.literal("")),
  license: z.enum(LICENSES).default("COMMERCIAL"),
  licenseAttribution: z.string().trim().max(500).optional().or(z.literal("")),
  licenseUrl: z.string().trim().max(500).optional().or(z.literal("")),
  allowedPlanSlugs: z.string().optional(),
  status: z.enum(STATUSES).default("ACTIVE"),
  internalNotes: z.string().trim().max(2000).optional().or(z.literal("")),
  tags: z.string().optional(),
});

export async function upsertDesignAsset(formData: FormData) {
  const ctx = await requirePlatformPermission("plans.manage");
  const parsed = assetSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`${ROUTE}?error=${encodeURIComponent(msg)}`);
  }
  if (!parsed.data.id) {
    const clash = await db.designAsset.findUnique({
      where: { slug: parsed.data.slug }, select: { id: true },
    });
    if (clash) {
      redirect(`${ROUTE}?error=${encodeURIComponent(`Slug "${parsed.data.slug}" already exists`)}`);
    }
  }

  let metadata: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  try {
    metadata = parseJsonField(parsed.data.metadataJson, "metadata");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid JSON";
    const idPath = parsed.data.id ? `${ROUTE}/${parsed.data.id}` : ROUTE;
    redirect(`${idPath}?error=${encodeURIComponent(msg)}`);
  }

  const data = {
    slug: parsed.data.slug,
    name: parsed.data.name,
    description: parsed.data.description?.trim() || null,
    kind: parsed.data.kind,
    fileUrl: parsed.data.fileUrl?.trim() || null,
    thumbnailUrl: parsed.data.thumbnailUrl?.trim() || null,
    format: parsed.data.format?.trim() || null,
    sizeBytes: parsed.data.sizeBytes ?? null,
    metadata,
    paletteColors: csvList(parsed.data.paletteColors),
    license: parsed.data.license,
    licenseAttribution: parsed.data.licenseAttribution?.trim() || null,
    licenseUrl: parsed.data.licenseUrl?.trim() || null,
    allowedPlanSlugs: csvList(parsed.data.allowedPlanSlugs).map((s) => s.toLowerCase()),
    status: parsed.data.status,
    internalNotes: parsed.data.internalNotes?.trim() || null,
    tags: csvList(parsed.data.tags).map((t) => t.toLowerCase()),
  };

  if (parsed.data.id) {
    await db.designAsset.update({ where: { id: parsed.data.id }, data });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.design_asset_updated",
      entityType: "DesignAsset",
      entityId: parsed.data.id,
      metadata: { actor: ctx.email, slug: parsed.data.slug, kind: parsed.data.kind, status: parsed.data.status },
    });
    revalidatePath(ROUTE);
    redirect(`${ROUTE}/${parsed.data.id}?ok=saved`);
  } else {
    const created = await db.designAsset.create({
      data: { ...data, createdById: ctx.userId },
      select: { id: true },
    });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.design_asset_created",
      entityType: "DesignAsset",
      entityId: created.id,
      metadata: { actor: ctx.email, slug: parsed.data.slug, kind: parsed.data.kind },
    });
    revalidatePath(ROUTE);
    redirect(`${ROUTE}/${created.id}?ok=created`);
  }
}

export async function archiveDesignAsset(assetId: string) {
  const ctx = await requirePlatformPermission("plans.manage");
  const a = await db.designAsset.findUnique({
    where: { id: assetId }, select: { id: true, slug: true },
  });
  if (!a) redirect(`${ROUTE}?error=${encodeURIComponent("Asset not found")}`);
  await db.designAsset.update({
    where: { id: assetId }, data: { status: "ARCHIVED" },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.design_asset_archived",
    entityType: "DesignAsset",
    entityId: assetId,
    metadata: { actor: ctx.email, slug: a.slug },
    severity: "WARNING",
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${assetId}?ok=archived`);
}

export async function reactivateDesignAsset(assetId: string) {
  const ctx = await requirePlatformPermission("plans.manage");
  const a = await db.designAsset.findUnique({
    where: { id: assetId }, select: { id: true, slug: true },
  });
  if (!a) redirect(`${ROUTE}?error=${encodeURIComponent("Asset not found")}`);
  await db.designAsset.update({
    where: { id: assetId }, data: { status: "ACTIVE" },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.design_asset_reactivated",
    entityType: "DesignAsset",
    entityId: assetId,
    metadata: { actor: ctx.email, slug: a.slug },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${assetId}?ok=reactivated`);
}

export async function duplicateDesignAsset(assetId: string) {
  const ctx = await requirePlatformPermission("plans.manage");
  const src = await db.designAsset.findUnique({ where: { id: assetId } });
  if (!src) redirect(`${ROUTE}?error=${encodeURIComponent("Asset not found")}`);

  let slug = `${src.slug}-copy`;
  for (let i = 1; i <= 50; i++) {
    const trial = i === 1 ? slug : `${slug}-${i}`;
    const taken = await db.designAsset.findUnique({ where: { slug: trial }, select: { id: true } });
    if (!taken) { slug = trial; break; }
  }
  const dup = await db.designAsset.create({
    data: {
      slug,
      name: `${src.name} (copy)`,
      description: src.description,
      kind: src.kind,
      fileUrl: src.fileUrl,
      thumbnailUrl: src.thumbnailUrl,
      format: src.format,
      sizeBytes: src.sizeBytes,
      metadata: (src.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
      paletteColors: src.paletteColors,
      license: src.license,
      licenseAttribution: src.licenseAttribution,
      licenseUrl: src.licenseUrl,
      allowedPlanSlugs: src.allowedPlanSlugs,
      status: "ACTIVE",
      internalNotes: src.internalNotes,
      tags: src.tags,
      createdById: ctx.userId,
    },
    select: { id: true },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.design_asset_duplicated",
    entityType: "DesignAsset",
    entityId: dup.id,
    metadata: { actor: ctx.email, sourceId: assetId, slug },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${dup.id}?ok=duplicated`);
}
