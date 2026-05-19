"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";

// Server actions for the Equipment registry (T-8).
//
// Permissions: we gate on customers:view today since there's no
// dedicated equipment:manage perm yet — that gets refined when the
// production team's RBAC matrix lands.

const STATUS_ENUM = z.enum(["RUNNING", "IDLE", "MAINTENANCE", "DOWN"]);

const createSchema = z.object({
  name:         z.string().min(1, "Name is required").max(120),
  kind:         z.string().min(1, "Kind is required").max(120),
  model:        z.string().max(120).optional().nullable(),
  serialNumber: z.string().max(120).optional().nullable(),
  status:       STATUS_ENUM.default("IDLE"),
  internalNotes: z.string().max(2000).optional().nullable(),
});

export async function createEquipment(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "customers:view");

  const parsed = createSchema.safeParse({
    name:          formData.get("name"),
    kind:          formData.get("kind"),
    model:         formData.get("model") || null,
    serialNumber:  formData.get("serialNumber") || null,
    status:        formData.get("status") || "IDLE",
    internalNotes: formData.get("internalNotes") || null,
  });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`/t/${slug}/equipment/new?error=${encodeURIComponent(msg)}`);
  }

  await db.equipment.create({
    data: {
      tenantId:      ctx.tenant.id,
      name:          parsed.data.name,
      kind:          parsed.data.kind,
      model:         parsed.data.model,
      serialNumber:  parsed.data.serialNumber,
      status:        parsed.data.status,
      internalNotes: parsed.data.internalNotes,
    },
  });

  revalidatePath(`/t/${slug}/equipment`);
  redirect(`/t/${slug}/equipment`);
}

// ── Update ───────────────────────────────────────────────────────────
//
// Used by the edit page. Accepts all fields plus the maintenance
// metadata and the operator / current-order assignments. Empty strings
// are normalized to null so the user can clear a field by submitting
// it empty.

const updateSchema = z.object({
  name:             z.string().min(1, "Name is required").max(120),
  kind:             z.string().min(1, "Kind is required").max(120),
  model:            z.string().max(120).optional().nullable(),
  serialNumber:     z.string().max(120).optional().nullable(),
  status:           STATUS_ENUM,
  operatorId:       z.string().optional().nullable(),
  currentOrderId:   z.string().optional().nullable(),
  lastServicedAt:   z.string().optional().nullable(),
  nextServiceDueAt: z.string().optional().nullable(),
  downReason:       z.string().max(500).optional().nullable(),
  internalNotes:    z.string().max(2000).optional().nullable(),
});

/** Parse a YYYY-MM-DD <input type="date"> value into a Date or null. */
function parseDateInput(v: string | null | undefined): Date | null {
  if (!v) return null;
  const trimmed = String(v).trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function updateEquipment(
  slug: string,
  id: string,
  formData: FormData,
) {
  const ctx = await requirePermission(slug, "customers:view");

  const parsed = updateSchema.safeParse({
    name:             formData.get("name"),
    kind:             formData.get("kind"),
    model:            formData.get("model") || null,
    serialNumber:     formData.get("serialNumber") || null,
    status:           formData.get("status") || "IDLE",
    operatorId:       formData.get("operatorId") || null,
    currentOrderId:   formData.get("currentOrderId") || null,
    lastServicedAt:   formData.get("lastServicedAt") || null,
    nextServiceDueAt: formData.get("nextServiceDueAt") || null,
    downReason:       formData.get("downReason") || null,
    internalNotes:    formData.get("internalNotes") || null,
  });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(
      `/t/${slug}/equipment/${id}/edit?error=${encodeURIComponent(msg)}`,
    );
  }

  // Tenant-scope the update — never allow a user to mutate equipment
  // belonging to another tenant by guessing the cuid.
  const existing = await db.equipment.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    select: { id: true },
  });
  if (!existing) {
    redirect(`/t/${slug}/equipment?error=${encodeURIComponent("Equipment not found")}`);
  }

  await db.equipment.update({
    where: { id },
    data: {
      name:             parsed.data.name,
      kind:             parsed.data.kind,
      model:            parsed.data.model,
      serialNumber:     parsed.data.serialNumber,
      status:           parsed.data.status,
      operatorId:       parsed.data.operatorId || null,
      currentOrderId:   parsed.data.currentOrderId || null,
      lastServicedAt:   parseDateInput(parsed.data.lastServicedAt),
      nextServiceDueAt: parseDateInput(parsed.data.nextServiceDueAt),
      // Only persist downReason when the machine is actually DOWN —
      // avoids stale reasons sticking around after the machine comes
      // back up.
      downReason:       parsed.data.status === "DOWN" ? parsed.data.downReason : null,
      internalNotes:    parsed.data.internalNotes,
    },
  });

  revalidatePath(`/t/${slug}/equipment`);
  revalidatePath(`/t/${slug}/equipment/${id}`);
  redirect(`/t/${slug}/equipment/${id}`);
}

// ── Soft-delete ──────────────────────────────────────────────────────
//
// We never hard-delete equipment because production history (e.g.
// "which press ran O-1042 last spring") may still reference the row.
// Archive flips `archivedAt` and the list view filters it out.

export async function archiveEquipment(slug: string, id: string) {
  const ctx = await requirePermission(slug, "customers:view");

  await db.equipment.updateMany({
    where: { id, tenantId: ctx.tenant.id, archivedAt: null },
    data:  { archivedAt: new Date(), status: "IDLE", currentOrderId: null, operatorId: null },
  });

  revalidatePath(`/t/${slug}/equipment`);
  redirect(`/t/${slug}/equipment`);
}

export async function unarchiveEquipment(slug: string, id: string) {
  const ctx = await requirePermission(slug, "customers:view");

  await db.equipment.updateMany({
    where: { id, tenantId: ctx.tenant.id },
    data:  { archivedAt: null },
  });

  revalidatePath(`/t/${slug}/equipment`);
  revalidatePath(`/t/${slug}/equipment/${id}`);
  redirect(`/t/${slug}/equipment/${id}`);
}
