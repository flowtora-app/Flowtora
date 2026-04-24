"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";

/**
 * Mark a single notification as read. Scoped to (tenantId, userId) so one user
 * can never touch another's inbox — even via forged notification IDs.
 */
export async function markNotificationRead(slug: string, notificationId: string) {
  const ctx = await requireTenant(slug);
  await db.notification.updateMany({
    where: {
      id:       notificationId,
      tenantId: ctx.tenant.id,
      userId:   ctx.userId,
      readAt:   null,
    },
    data: { readAt: new Date() },
  });
  revalidatePath(`/t/${slug}/inbox`);
  revalidatePath(`/t/${slug}`, "layout");
}

export async function markAllNotificationsRead(slug: string) {
  const ctx = await requireTenant(slug);
  await db.notification.updateMany({
    where: { tenantId: ctx.tenant.id, userId: ctx.userId, readAt: null },
    data:  { readAt: new Date() },
  });
  revalidatePath(`/t/${slug}/inbox`);
  revalidatePath(`/t/${slug}`, "layout");
}

export async function dismissNotification(slug: string, notificationId: string) {
  const ctx = await requireTenant(slug);
  await db.notification.deleteMany({
    where: {
      id:       notificationId,
      tenantId: ctx.tenant.id,
      userId:   ctx.userId,
    },
  });
  revalidatePath(`/t/${slug}/inbox`);
  revalidatePath(`/t/${slug}`, "layout");
}

export async function clearReadNotifications(slug: string) {
  const ctx = await requireTenant(slug);
  await db.notification.deleteMany({
    where: {
      tenantId: ctx.tenant.id,
      userId:   ctx.userId,
      readAt:   { not: null },
    },
  });
  revalidatePath(`/t/${slug}/inbox`);
  revalidatePath(`/t/${slug}`, "layout");
}
