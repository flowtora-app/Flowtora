"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";

// Phase 14 — vendor directory.
//
// Simple by design. A vendor is a name + contact info the shop uses
// when logging expenses. Soft-delete via `active=false` so historical
// expenses keep their reference.

const optionalString = z.string().max(200).optional().or(z.literal(""));
const optionalLong = z.string().max(4000).optional().or(z.literal(""));
const empty = (s: string | undefined) => (s && s.length > 0 ? s : null);

const vendorSchema = z.object({
  name: z.string().min(1).max(200),
  contact: optionalString,
  email: optionalString,
  phone: optionalString,
  website: optionalString,
  category: optionalString,
  accountNumber: optionalString,
  addressLine1: optionalString,
  addressLine2: optionalString,
  city: optionalString,
  region: optionalString,
  postalCode: optionalString,
  country: optionalString,
  notes: optionalLong,
});

export async function createVendor(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "vendors:manage");
  const parsed = vendorSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/vendors/new?error=${encodeURIComponent("Vendor name is required.")}`);
  }
  const v = parsed.data;

  const vendor = await db.vendor.create({
    data: {
      tenantId:      ctx.tenant.id,
      name:          v.name,
      contact:       empty(v.contact),
      email:         empty(v.email),
      phone:         empty(v.phone),
      website:       empty(v.website),
      category:      empty(v.category),
      accountNumber: empty(v.accountNumber),
      addressLine1:  empty(v.addressLine1),
      addressLine2:  empty(v.addressLine2),
      city:          empty(v.city),
      region:        empty(v.region),
      postalCode:    empty(v.postalCode),
      country:       empty(v.country),
      notes:         empty(v.notes),
      createdBy:     ctx.userId,
    },
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "vendor.created",
    entityType: "Vendor",
    entityId: vendor.id,
    metadata: { name: vendor.name },
  });

  revalidatePath(`/t/${slug}/vendors`);
  redirect(`/t/${slug}/vendors/${vendor.id}`);
}

export async function updateVendor(slug: string, vendorId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "vendors:manage");
  const vendor = await db.vendor.findFirst({
    where: { id: vendorId, tenantId: ctx.tenant.id },
  });
  if (!vendor) redirect(`/t/${slug}/vendors`);

  const parsed = vendorSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/vendors/${vendorId}?error=${encodeURIComponent("Vendor name is required.")}`);
  }
  const v = parsed.data;

  await db.vendor.update({
    where: { id: vendorId },
    data: {
      name:          v.name,
      contact:       empty(v.contact),
      email:         empty(v.email),
      phone:         empty(v.phone),
      website:       empty(v.website),
      category:      empty(v.category),
      accountNumber: empty(v.accountNumber),
      addressLine1:  empty(v.addressLine1),
      addressLine2:  empty(v.addressLine2),
      city:          empty(v.city),
      region:        empty(v.region),
      postalCode:    empty(v.postalCode),
      country:       empty(v.country),
      notes:         empty(v.notes),
    },
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "vendor.updated",
    entityType: "Vendor",
    entityId: vendorId,
  });

  revalidatePath(`/t/${slug}/vendors/${vendorId}`);
  revalidatePath(`/t/${slug}/vendors`);
}

// Soft delete — flip active=false. Doing it this way keeps vendor names
// readable on historical expenses; hard delete would set vendorId=null
// on SetNull cascade and lose the context.
export async function archiveVendor(slug: string, vendorId: string) {
  const ctx = await requirePermission(slug, "vendors:manage");
  await db.vendor.updateMany({
    where: { id: vendorId, tenantId: ctx.tenant.id },
    data:  { active: false },
  });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "vendor.archived",
    entityType: "Vendor",
    entityId: vendorId,
  });
  revalidatePath(`/t/${slug}/vendors`);
  redirect(`/t/${slug}/vendors`);
}

export async function restoreVendor(slug: string, vendorId: string) {
  const ctx = await requirePermission(slug, "vendors:manage");
  await db.vendor.updateMany({
    where: { id: vendorId, tenantId: ctx.tenant.id },
    data:  { active: true },
  });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "vendor.restored",
    entityType: "Vendor",
    entityId: vendorId,
  });
  revalidatePath(`/t/${slug}/vendors`);
  revalidatePath(`/t/${slug}/vendors/${vendorId}`);
}

// Hard delete, only allowed when the vendor has no expenses. Returns
// the caller to the vendor list either way — the error path redirects
// with a flash so the user sees why the delete was refused.
export async function deleteVendor(slug: string, vendorId: string) {
  const ctx = await requirePermission(slug, "vendors:manage");
  const vendor = await db.vendor.findFirst({
    where: { id: vendorId, tenantId: ctx.tenant.id },
    select: { id: true, _count: { select: { expenses: true } } },
  });
  if (!vendor) redirect(`/t/${slug}/vendors`);
  if (vendor._count.expenses > 0) {
    redirect(`/t/${slug}/vendors/${vendorId}?error=${encodeURIComponent("Vendor has expenses — archive instead.")}`);
  }

  await db.vendor.delete({ where: { id: vendor.id } });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "vendor.deleted",
    entityType: "Vendor",
    entityId: vendorId,
  });
  redirect(`/t/${slug}/vendors`);
}
