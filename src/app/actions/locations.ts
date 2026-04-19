"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";

// Phase 15 Slice A — CRUD server actions for tenant locations.
//
// Gated on `locations:manage`. Side-effects (audit logging) swallow-on-
// failure to keep with the rest of the app's pattern.

const optionalString = z.string().max(200).optional().or(z.literal(""));
const shortCode = z.string().max(24).regex(/^[A-Za-z0-9_-]*$/, "Letters, numbers, dash, underscore only").optional().or(z.literal(""));
const empty = (s: string | undefined) => (s && s.length > 0 ? s : null);

const createSchema = z.object({
  name:         z.string().min(1).max(120),
  code:         shortCode,
  addressLine1: optionalString,
  addressLine2: optionalString,
  city:         optionalString,
  region:       optionalString,
  postalCode:   optionalString,
  country:      optionalString,
  phone:        optionalString,
  email:        z.string().email().optional().or(z.literal("")),
  timezone:     optionalString,
  isDefault:    z.preprocess((v) => v === "on" || v === "true", z.boolean()).optional(),
});

export async function createLocation(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "locations:manage");
  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/settings/locations?error=${encodeURIComponent("Invalid location input.")}`);
  }
  const d = parsed.data;

  // Names are unique per-tenant at the DB level — check first for a friendly
  // error rather than a generic "unique constraint" bubble-up.
  const clash = await db.location.findFirst({
    where: { tenantId: ctx.tenant.id, name: d.name },
    select: { id: true },
  });
  if (clash) {
    redirect(`/t/${slug}/settings/locations?error=${encodeURIComponent("A location with that name already exists.")}`);
  }

  const location = await db.$transaction(async (tx) => {
    // If the new row is flagged default, demote any existing default first.
    if (d.isDefault) {
      await tx.location.updateMany({
        where: { tenantId: ctx.tenant.id, isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.location.create({
      data: {
        tenantId:     ctx.tenant.id,
        name:         d.name,
        code:         empty(d.code),
        addressLine1: empty(d.addressLine1),
        addressLine2: empty(d.addressLine2),
        city:         empty(d.city),
        region:       empty(d.region),
        postalCode:   empty(d.postalCode),
        country:      empty(d.country),
        phone:        empty(d.phone),
        email:        empty(d.email),
        timezone:     empty(d.timezone),
        isDefault:    d.isDefault ?? false,
      },
    });
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "location.created",
    entityType: "Location",
    entityId:   location.id,
    metadata:   { name: location.name, isDefault: location.isDefault },
  });
  revalidatePath(`/t/${slug}/settings/locations`);
  redirect(`/t/${slug}/settings/locations`);
}

const updateSchema = createSchema.extend({
  active: z.preprocess((v) => v === "on" || v === "true", z.boolean()).optional(),
});

export async function updateLocation(slug: string, locationId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "locations:manage");
  const existing = await db.location.findFirst({
    where: { id: locationId, tenantId: ctx.tenant.id },
  });
  if (!existing) redirect(`/t/${slug}/settings/locations`);

  const parsed = updateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/settings/locations?error=${encodeURIComponent("Invalid input.")}`);
  }
  const d = parsed.data;

  if (d.name !== existing.name) {
    const clash = await db.location.findFirst({
      where: { tenantId: ctx.tenant.id, name: d.name, NOT: { id: locationId } },
      select: { id: true },
    });
    if (clash) {
      redirect(`/t/${slug}/settings/locations?error=${encodeURIComponent("A location with that name already exists.")}`);
    }
  }

  await db.$transaction(async (tx) => {
    // "Promoting" this row to default demotes the current default.
    if (d.isDefault && !existing.isDefault) {
      await tx.location.updateMany({
        where: { tenantId: ctx.tenant.id, isDefault: true, NOT: { id: locationId } },
        data: { isDefault: false },
      });
    }
    await tx.location.update({
      where: { id: locationId },
      data: {
        name:         d.name,
        code:         empty(d.code),
        addressLine1: empty(d.addressLine1),
        addressLine2: empty(d.addressLine2),
        city:         empty(d.city),
        region:       empty(d.region),
        postalCode:   empty(d.postalCode),
        country:      empty(d.country),
        phone:        empty(d.phone),
        email:        empty(d.email),
        timezone:     empty(d.timezone),
        isDefault:    d.isDefault ?? existing.isDefault,
        active:       d.active   ?? true,
      },
    });
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "location.updated",
    entityType: "Location",
    entityId:   locationId,
    metadata:   { name: d.name, isDefault: d.isDefault ?? existing.isDefault, active: d.active ?? true },
  });
  revalidatePath(`/t/${slug}/settings/locations`);
}

export async function deleteLocation(slug: string, locationId: string) {
  const ctx = await requirePermission(slug, "locations:manage");
  const existing = await db.location.findFirst({
    where: { id: locationId, tenantId: ctx.tenant.id },
    select: { id: true, name: true, isDefault: true },
  });
  if (!existing) return;

  // Don't let the tenant nuke their only / default location — that would
  // orphan the backfill path for new rows.
  if (existing.isDefault) {
    redirect(`/t/${slug}/settings/locations?error=${encodeURIComponent("Can't delete the default location. Pick another one as default first.")}`);
  }

  // Referenced rows fall back to SetNull (see schema) so delete is safe.
  await db.location.delete({ where: { id: locationId } });
  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "location.deleted",
    entityType: "Location",
    entityId:   locationId,
    metadata:   { name: existing.name },
  });
  revalidatePath(`/t/${slug}/settings/locations`);
}

// Convenience toggle used by the list page's "Make default" link. Keeps the
// full edit form free from implicit default flipping.
export async function setDefaultLocation(slug: string, locationId: string) {
  const ctx = await requirePermission(slug, "locations:manage");
  const location = await db.location.findFirst({
    where: { id: locationId, tenantId: ctx.tenant.id },
    select: { id: true, name: true, active: true },
  });
  if (!location) return;
  if (!location.active) {
    redirect(`/t/${slug}/settings/locations?error=${encodeURIComponent("Activate the location before making it default.")}`);
  }

  await db.$transaction(async (tx) => {
    await tx.location.updateMany({
      where: { tenantId: ctx.tenant.id, isDefault: true, NOT: { id: locationId } },
      data: { isDefault: false },
    });
    await tx.location.update({
      where: { id: locationId },
      data: { isDefault: true },
    });
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "location.default_changed",
    entityType: "Location",
    entityId:   locationId,
    metadata:   { name: location.name },
  });
  revalidatePath(`/t/${slug}/settings/locations`);
}
