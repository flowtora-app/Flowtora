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

const createSchema = z.object({
  name:         z.string().min(1, "Name is required").max(120),
  kind:         z.string().min(1, "Kind is required").max(120),
  model:        z.string().max(120).optional().nullable(),
  serialNumber: z.string().max(120).optional().nullable(),
  status:       z.enum(["RUNNING", "IDLE", "MAINTENANCE", "DOWN"]).default("IDLE"),
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
