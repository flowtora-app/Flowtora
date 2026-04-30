"use server";

// Activity Feed server actions — saved views + subscriptions.
//
// Every mutation requires platform staff. Saved views and subscriptions
// are scoped to the user that owns them; we never let one staff
// member edit another's row, but shared views can be read by anyone
// (write still gated to the owner). The subscription cron uses
// `pausedAt` and `lastDeliveredAt` to coordinate delivery without
// double-firing — see scripts/cron/deliver-activity-subscriptions.ts.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePlatformStaff, logPlatformAudit } from "@/lib/platform";

const NAME_LIMIT = 80;
const FILTERS_LIMIT = 4_000;

const savedViewSchema = z.object({
  name: z.string().min(1).max(NAME_LIMIT),
  filters: z.string().max(FILTERS_LIMIT),
  isShared: z.union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal("")]).optional(),
});

export async function createPlatformSavedView(formData: FormData) {
  const ctx = await requirePlatformStaff();
  const parsed = savedViewSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: "Invalid input" } as const;
  }
  const isShared = parsed.data.isShared === "on" || parsed.data.isShared === "true";

  await db.platformSavedView.create({
    data: {
      userId: ctx.userId,
      kind: "activity",
      name: parsed.data.name.trim(),
      filters: parsed.data.filters,
      isShared,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.activity_saved_view_created",
    entityType: "PlatformSavedView",
    metadata: { actor: ctx.email, name: parsed.data.name, isShared },
  });
  revalidatePath("/platform/activity");
  return { ok: true } as const;
}

export async function deletePlatformSavedView(formData: FormData) {
  const ctx = await requirePlatformStaff();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "Missing id" } as const;

  // Owner-only delete. Shared views are read-only to non-owners.
  const view = await db.platformSavedView.findUnique({ where: { id }, select: { id: true, userId: true, name: true } });
  if (!view) return { ok: false, error: "Not found" } as const;
  if (view.userId !== ctx.userId) return { ok: false, error: "Forbidden" } as const;

  await db.platformSavedView.delete({ where: { id } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.activity_saved_view_deleted",
    entityType: "PlatformSavedView",
    entityId: id,
    metadata: { actor: ctx.email, name: view.name },
  });
  revalidatePath("/platform/activity");
  return { ok: true } as const;
}

/* ── Subscriptions ────────────────────────────────────────── */

const FREQUENCIES = ["LIVE", "HOURLY", "DAILY"] as const;
const subscriptionSchema = z.object({
  name: z.string().min(1).max(NAME_LIMIT),
  filters: z.string().max(FILTERS_LIMIT),
  email: z.string().email().max(254),
  frequency: z.enum(FREQUENCIES),
});

export async function createActivitySubscription(formData: FormData) {
  const ctx = await requirePlatformStaff();
  const parsed = subscriptionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: "Invalid input" } as const;
  }

  await db.activitySubscription.create({
    data: {
      userId: ctx.userId,
      name: parsed.data.name.trim(),
      filters: parsed.data.filters,
      // EMAIL is the only channel currently — Slack reserved for a
      // later slice (needs OAuth + workspace tokens).
      channel: "EMAIL",
      email: parsed.data.email,
      frequency: parsed.data.frequency,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.activity_subscription_created",
    entityType: "ActivitySubscription",
    metadata: { actor: ctx.email, name: parsed.data.name, email: parsed.data.email, frequency: parsed.data.frequency },
  });
  revalidatePath("/platform/activity");
  return { ok: true } as const;
}

export async function deleteActivitySubscription(formData: FormData) {
  const ctx = await requirePlatformStaff();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "Missing id" } as const;

  const sub = await db.activitySubscription.findUnique({ where: { id }, select: { id: true, userId: true, name: true } });
  if (!sub) return { ok: false, error: "Not found" } as const;
  if (sub.userId !== ctx.userId) return { ok: false, error: "Forbidden" } as const;

  await db.activitySubscription.delete({ where: { id } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.activity_subscription_deleted",
    entityType: "ActivitySubscription",
    entityId: id,
    metadata: { actor: ctx.email, name: sub.name },
  });
  revalidatePath("/platform/activity");
  return { ok: true } as const;
}

export async function toggleActivitySubscriptionPause(formData: FormData) {
  const ctx = await requirePlatformStaff();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "Missing id" } as const;

  const sub = await db.activitySubscription.findUnique({ where: { id }, select: { id: true, userId: true, pausedAt: true, name: true } });
  if (!sub) return { ok: false, error: "Not found" } as const;
  if (sub.userId !== ctx.userId) return { ok: false, error: "Forbidden" } as const;

  const nextPausedAt = sub.pausedAt ? null : new Date();
  await db.activitySubscription.update({
    where: { id },
    data: { pausedAt: nextPausedAt },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: nextPausedAt ? "platform.activity_subscription_paused" : "platform.activity_subscription_resumed",
    entityType: "ActivitySubscription",
    entityId: id,
    metadata: { actor: ctx.email, name: sub.name },
  });
  revalidatePath("/platform/activity");
  return { ok: true } as const;
}
