"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTenant, requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { PREF_GROUPS, type NotifPrefs } from "@/lib/notif-prefs";
import type { NotificationType } from "@/lib/notifications";

// Flatten all known notification types from the group definitions.
const ALL_TYPES = new Set<NotificationType>(
  PREF_GROUPS.flatMap((g) => g.items.map((i) => i.type)),
);

export async function saveNotifPrefs(slug: string, formData: FormData) {
  const ctx = await requireTenant(slug);

  const prefs: NotifPrefs = {};

  for (const type of ALL_TYPES) {
    prefs[type] = {
      inApp: formData.get(`inApp:${type}`) === "on",
      email: formData.get(`email:${type}`) === "on",
    };
  }

  await db.membership.updateMany({
    where: { userId: ctx.userId, tenantId: ctx.tenant.id },
    data:  { notifPrefs: prefs },
  });

  revalidatePath(`/t/${slug}/settings/notifications`);
  redirect(`/t/${slug}/settings/notifications?ok=1`);
}

// Phase 21 Slice C — tenant-wide defaults. Only owners/managers (tenant:manage)
// can change these; they're the starting point for every new member who joins
// after the defaults are saved. Existing members keep whatever they've got.
export async function saveNotifDefaults(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "tenant:manage");

  const prefs: NotifPrefs = {};
  for (const type of ALL_TYPES) {
    prefs[type] = {
      inApp: formData.get(`inApp:${type}`) === "on",
      email: formData.get(`email:${type}`) === "on",
    };
  }

  await db.tenant.update({
    where: { id: ctx.tenant.id },
    data:  { defaultNotifPrefs: prefs },
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId:   ctx.userId,
    action:   "settings.notif_defaults",
  });

  revalidatePath(`/t/${slug}/settings/notifications-defaults`);
  redirect(`/t/${slug}/settings/notifications-defaults?ok=1`);
}

// Reset personal prefs to the tenant defaults. Wipes the membership blob
// entirely — next read falls through to tenant defaults, then built-in.
export async function resetNotifPrefsToDefaults(slug: string) {
  const ctx = await requireTenant(slug);
  await db.membership.updateMany({
    where: { userId: ctx.userId, tenantId: ctx.tenant.id },
    data:  { notifPrefs: {} as never },
  });
  revalidatePath(`/t/${slug}/settings/notifications`);
  redirect(`/t/${slug}/settings/notifications?ok=1`);
}
