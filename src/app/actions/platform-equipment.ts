"use server";

// Page 27 — Master Equipment Templates server actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logPlatformAudit, requirePlatformPermission } from "@/lib/platform";

const ROUTE = "/platform/catalog/equipment";

const SLUG_RX = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

const CATEGORIES = [
  "PRINTER", "CUTTER", "PRESS", "EMBROIDERY", "CNC",
  "LASER", "HEAT_PRESS", "LAMINATION", "WORKSTATION", "FINISHING",
] as const;

const FREQUENCIES = [
  "DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUALLY",
  "HOURS_OF_USE", "CYCLES",
] as const;

function csvList(s: string | undefined): string[] {
  if (!s) return [];
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

/* ── Equipment upsert ───────────────────────────────────── */

const equipmentSchema = z.object({
  id: z.string().optional(),
  slug: z.string().trim().toLowerCase().regex(SLUG_RX, "Slug: lowercase letters/digits/hyphens/underscores").max(80),
  brand: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(120),
  category: z.enum(CATEGORIES),
  displayName: z.string().trim().max(160).optional().or(z.literal("")),

  maxWidthIn: z.coerce.number().min(0).optional(),
  maxLengthFt: z.coerce.number().min(0).optional(),
  colorModes: z.string().optional(), // comma-separated
  inkTypes: z.string().optional(),   // comma-separated
  resolution: z.string().trim().max(80).optional().or(z.literal("")),

  ratedSpeed: z.coerce.number().min(0).optional(),
  speedUnit: z.string().trim().max(40).optional().or(z.literal("")),
  warmupMinutes: z.coerce.number().int().min(0).max(600).default(0),
  changeoverMinutes: z.coerce.number().int().min(0).max(600).default(0),
  defaultUptimePct: z.coerce.number().min(0).max(100).default(85),
  defaultWastePct: z.coerce.number().min(0).max(100).default(5),

  purchaseCostMinor: z.coerce.number().int().min(0).default(0),
  depreciationYears: z.coerce.number().int().min(1).max(50).default(7),
  hourlyOperatingCostMinor: z.coerce.number().int().min(0).default(0),

  imageUrl: z.string().trim().max(500).optional().or(z.literal("")),
  manualUrl: z.string().trim().max(500).optional().or(z.literal("")),
  status: z.enum(["ACTIVE", "DISCONTINUED"]).default("ACTIVE"),
  internalNotes: z.string().trim().max(2000).optional().or(z.literal("")),
  tags: z.string().optional(),
});

export async function upsertMasterEquipment(formData: FormData) {
  const ctx = await requirePlatformPermission("plans.manage");
  const parsed = equipmentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`${ROUTE}?error=${encodeURIComponent(msg)}`);
  }
  if (!parsed.data.id) {
    const clash = await db.masterEquipment.findUnique({
      where: { slug: parsed.data.slug }, select: { id: true },
    });
    if (clash) {
      redirect(`${ROUTE}?error=${encodeURIComponent(`Slug "${parsed.data.slug}" already exists`)}`);
    }
  }

  const data = {
    slug: parsed.data.slug,
    brand: parsed.data.brand,
    model: parsed.data.model,
    category: parsed.data.category,
    displayName: parsed.data.displayName?.trim() || null,
    maxWidthIn: parsed.data.maxWidthIn != null
      ? new Prisma.Decimal(parsed.data.maxWidthIn) : null,
    maxLengthFt: parsed.data.maxLengthFt != null
      ? new Prisma.Decimal(parsed.data.maxLengthFt) : null,
    colorModes: csvList(parsed.data.colorModes),
    inkTypes: csvList(parsed.data.inkTypes).map((x) => x.toLowerCase()),
    resolution: parsed.data.resolution?.trim() || null,
    ratedSpeed: parsed.data.ratedSpeed != null
      ? new Prisma.Decimal(parsed.data.ratedSpeed) : null,
    speedUnit: parsed.data.speedUnit?.trim() || null,
    warmupMinutes: parsed.data.warmupMinutes,
    changeoverMinutes: parsed.data.changeoverMinutes,
    defaultUptimePct: new Prisma.Decimal(parsed.data.defaultUptimePct),
    defaultWastePct: new Prisma.Decimal(parsed.data.defaultWastePct),
    purchaseCostMinor: parsed.data.purchaseCostMinor,
    depreciationYears: parsed.data.depreciationYears,
    hourlyOperatingCostMinor: parsed.data.hourlyOperatingCostMinor,
    imageUrl: parsed.data.imageUrl?.trim() || null,
    manualUrl: parsed.data.manualUrl?.trim() || null,
    status: parsed.data.status,
    internalNotes: parsed.data.internalNotes?.trim() || null,
    tags: csvList(parsed.data.tags).map((t) => t.toLowerCase()),
  };

  if (parsed.data.id) {
    await db.masterEquipment.update({ where: { id: parsed.data.id }, data });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.master_equipment_updated",
      entityType: "MasterEquipment",
      entityId: parsed.data.id,
      metadata: { actor: ctx.email, slug: parsed.data.slug, status: parsed.data.status },
    });
    revalidatePath(ROUTE);
    redirect(`${ROUTE}/${parsed.data.id}?ok=saved`);
  } else {
    const created = await db.masterEquipment.create({
      data: { ...data, createdById: ctx.userId },
      select: { id: true },
    });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.master_equipment_created",
      entityType: "MasterEquipment",
      entityId: created.id,
      metadata: { actor: ctx.email, slug: parsed.data.slug },
    });
    revalidatePath(ROUTE);
    redirect(`${ROUTE}/${created.id}?ok=created`);
  }
}

export async function discontinueMasterEquipment(equipmentId: string) {
  const ctx = await requirePlatformPermission("plans.manage");
  const e = await db.masterEquipment.findUnique({
    where: { id: equipmentId }, select: { id: true, slug: true },
  });
  if (!e) redirect(`${ROUTE}?error=${encodeURIComponent("Equipment not found")}`);
  await db.masterEquipment.update({
    where: { id: equipmentId }, data: { status: "DISCONTINUED" },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.master_equipment_discontinued",
    entityType: "MasterEquipment",
    entityId: equipmentId,
    metadata: { actor: ctx.email, slug: e.slug },
    severity: "WARNING",
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${equipmentId}?ok=discontinued`);
}

export async function reactivateMasterEquipment(equipmentId: string) {
  const ctx = await requirePlatformPermission("plans.manage");
  const e = await db.masterEquipment.findUnique({
    where: { id: equipmentId }, select: { id: true, slug: true },
  });
  if (!e) redirect(`${ROUTE}?error=${encodeURIComponent("Equipment not found")}`);
  await db.masterEquipment.update({
    where: { id: equipmentId }, data: { status: "ACTIVE" },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.master_equipment_reactivated",
    entityType: "MasterEquipment",
    entityId: equipmentId,
    metadata: { actor: ctx.email, slug: e.slug },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${equipmentId}?ok=reactivated`);
}

/* ── Material compatibility ─────────────────────────────── */

const compatSchema = z.object({
  equipmentId: z.string().min(1),
  materialId: z.string().min(1),
  recommended: z.union([z.literal("on"), z.literal("")]).optional(),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function addEquipmentMaterialCompat(formData: FormData) {
  const ctx = await requirePlatformPermission("plans.manage");
  const parsed = compatSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`${ROUTE}/${(formData.get("equipmentId") as string) ?? ""}?tab=materials&error=${encodeURIComponent(msg)}`);
  }
  // Avoid duplicates.
  const existing = await db.masterEquipmentMaterial.findUnique({
    where: { equipmentId_materialId: {
      equipmentId: parsed.data.equipmentId, materialId: parsed.data.materialId,
    } },
    select: { id: true },
  });
  if (existing) {
    redirect(`${ROUTE}/${parsed.data.equipmentId}?tab=materials&error=${encodeURIComponent("Compatibility already exists")}`);
  }
  await db.masterEquipmentMaterial.create({
    data: {
      equipmentId: parsed.data.equipmentId,
      materialId: parsed.data.materialId,
      recommended: parsed.data.recommended === "on",
      notes: parsed.data.notes?.trim() || null,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.equipment_material_compat_added",
    entityType: "MasterEquipmentMaterial",
    entityId: parsed.data.equipmentId,
    metadata: { actor: ctx.email, equipmentId: parsed.data.equipmentId, materialId: parsed.data.materialId },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${parsed.data.equipmentId}?tab=materials&ok=compat_added`);
}

export async function removeEquipmentMaterialCompat(joinId: string) {
  const ctx = await requirePlatformPermission("plans.manage");
  const row = await db.masterEquipmentMaterial.findUnique({
    where: { id: joinId },
    select: { id: true, equipmentId: true, materialId: true },
  });
  if (!row) redirect(`${ROUTE}?error=${encodeURIComponent("Compat row not found")}`);
  await db.masterEquipmentMaterial.delete({ where: { id: joinId } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.equipment_material_compat_removed",
    entityType: "MasterEquipmentMaterial",
    entityId: joinId,
    metadata: { actor: ctx.email, equipmentId: row.equipmentId, materialId: row.materialId },
    severity: "WARNING",
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${row.equipmentId}?tab=materials&ok=compat_removed`);
}

/* ── Maintenance tasks ──────────────────────────────────── */

const taskSchema = z.object({
  id: z.string().optional(),
  equipmentId: z.string().min(1),
  taskName: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  frequency: z.enum(FREQUENCIES),
  intervalCount: z.coerce.number().int().min(1).optional(),
  estimatedMinutes: z.coerce.number().int().min(1).max(600).default(15),
  toolsNeeded: z.string().optional(),
  sortOrder: z.coerce.number().int().min(0).default(0),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function upsertEquipmentMaintenanceTask(formData: FormData) {
  const ctx = await requirePlatformPermission("plans.manage");
  const parsed = taskSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid task";
    redirect(`${ROUTE}/${(formData.get("equipmentId") as string) ?? ""}?tab=maintenance&error=${encodeURIComponent(msg)}`);
  }
  const data = {
    taskName: parsed.data.taskName,
    description: parsed.data.description?.trim() || null,
    frequency: parsed.data.frequency,
    intervalCount: parsed.data.intervalCount ?? null,
    estimatedMinutes: parsed.data.estimatedMinutes,
    toolsNeeded: csvList(parsed.data.toolsNeeded),
    sortOrder: parsed.data.sortOrder,
    notes: parsed.data.notes?.trim() || null,
  };
  if (parsed.data.id) {
    await db.masterEquipmentMaintenanceTask.update({ where: { id: parsed.data.id }, data });
  } else {
    await db.masterEquipmentMaintenanceTask.create({
      data: { ...data, equipmentId: parsed.data.equipmentId },
    });
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.equipment_maintenance_task_saved",
    entityType: "MasterEquipmentMaintenanceTask",
    entityId: parsed.data.id ?? "(new)",
    metadata: { actor: ctx.email, equipmentId: parsed.data.equipmentId, taskName: parsed.data.taskName },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${parsed.data.equipmentId}?tab=maintenance&ok=task_saved`);
}

export async function deleteEquipmentMaintenanceTask(taskId: string) {
  const ctx = await requirePlatformPermission("plans.manage");
  const t = await db.masterEquipmentMaintenanceTask.findUnique({
    where: { id: taskId },
    select: { id: true, equipmentId: true, taskName: true },
  });
  if (!t) redirect(`${ROUTE}?error=${encodeURIComponent("Task not found")}`);
  await db.masterEquipmentMaintenanceTask.delete({ where: { id: taskId } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.equipment_maintenance_task_deleted",
    entityType: "MasterEquipmentMaintenanceTask",
    entityId: taskId,
    metadata: { actor: ctx.email, equipmentId: t.equipmentId, taskName: t.taskName },
    severity: "WARNING",
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${t.equipmentId}?tab=maintenance&ok=task_deleted`);
}
