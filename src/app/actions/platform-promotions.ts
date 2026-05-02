"use server";

// Page 20 — Promotion server actions.
//
// A Promotion bundles a Coupon with marketing context (landing URL,
// audience description, run window, goal). Promotions don't change
// how the underlying coupon is redeemed — they're reporting metadata
// for the operator to track campaigns against.
//
// All mutations gated by `billing.coupon` (same as coupon creation).

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { logPlatformAudit, requirePlatformPermission } from "@/lib/platform";

const baseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  couponId: z.string().min(1),
  landingUrl: z.string().trim().max(500).optional().or(z.literal("")),
  emailTemplateKind: z.string().trim().max(100).optional().or(z.literal("")),
  audience: z.string().trim().max(500).optional().or(z.literal("")),
  goal: z.string().trim().max(500).optional().or(z.literal("")),
  startsAt: z.string().optional().or(z.literal("")),
  endsAt: z.string().optional().or(z.literal("")),
  status: z.enum(["DRAFT", "SCHEDULED", "ACTIVE", "ENDED", "ARCHIVED"]).default("DRAFT"),
});

type WindowResult =
  | { error: string }
  | { startsAt: Date | null; endsAt: Date | null };

function parseWindow(startsAtRaw?: string, endsAtRaw?: string): WindowResult {
  const startsAt = startsAtRaw && startsAtRaw.trim() !== ""
    ? new Date(startsAtRaw) : null;
  const endsAt = endsAtRaw && endsAtRaw.trim() !== ""
    ? new Date(endsAtRaw) : null;
  if (startsAt && Number.isNaN(startsAt.getTime())) return { error: "Invalid start date" };
  if (endsAt && Number.isNaN(endsAt.getTime())) return { error: "Invalid end date" };
  if (startsAt && endsAt && endsAt < startsAt) return { error: "End must be after start" };
  return { startsAt, endsAt };
}

function deriveStatus(input: {
  status: "DRAFT" | "SCHEDULED" | "ACTIVE" | "ENDED" | "ARCHIVED";
  startsAt: Date | null;
  endsAt: Date | null;
}): "DRAFT" | "SCHEDULED" | "ACTIVE" | "ENDED" | "ARCHIVED" {
  // ARCHIVED + ENDED are sticky (admin chose them).
  if (input.status === "ARCHIVED" || input.status === "ENDED") return input.status;
  // If end date is past, force ENDED.
  if (input.endsAt && input.endsAt < new Date()) return "ENDED";
  // If start is future, force SCHEDULED. Otherwise ACTIVE.
  if (input.status === "DRAFT") return "DRAFT";
  if (input.startsAt && input.startsAt > new Date()) return "SCHEDULED";
  return "ACTIVE";
}

export async function createPromotion(formData: FormData) {
  const ctx = await requirePlatformPermission("billing.coupon");
  const parsed = baseSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`/platform/billing/coupons?tab=promotions&error=${encodeURIComponent(msg)}`);
  }

  // Validate the coupon exists.
  const coupon = await db.coupon.findUnique({
    where: { id: parsed.data.couponId },
    select: { id: true, code: true },
  });
  if (!coupon) {
    redirect(`/platform/billing/coupons?tab=promotions&error=${encodeURIComponent("Coupon not found")}`);
  }

  const win = parseWindow(parsed.data.startsAt, parsed.data.endsAt);
  if ("error" in win) {
    redirect(`/platform/billing/coupons?tab=promotions&error=${encodeURIComponent(win.error)}`);
  }

  const status = deriveStatus({
    status: parsed.data.status, startsAt: win.startsAt, endsAt: win.endsAt,
  });

  const created = await db.promotion.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description?.trim() || null,
      couponId: coupon.id,
      landingUrl: parsed.data.landingUrl?.trim() || null,
      emailTemplateKind: parsed.data.emailTemplateKind?.trim() || null,
      audience: parsed.data.audience?.trim() || null,
      goal: parsed.data.goal?.trim() || null,
      startsAt: win.startsAt,
      endsAt: win.endsAt,
      status,
      createdById: ctx.userId,
    },
    select: { id: true, name: true },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.promotion_created",
    entityType: "Promotion",
    entityId: created.id,
    metadata: { actor: ctx.email, name: created.name, couponCode: coupon.code },
  });
  revalidatePath("/platform/billing/coupons");
  redirect(`/platform/billing/coupons?tab=promotions&ok=created`);
}

const updateSchema = baseSchema.extend({ id: z.string().min(1) });

export async function updatePromotion(formData: FormData) {
  const ctx = await requirePlatformPermission("billing.coupon");
  const parsed = updateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`/platform/billing/coupons?tab=promotions&error=${encodeURIComponent(msg)}`);
  }

  const existing = await db.promotion.findUnique({
    where: { id: parsed.data.id },
    select: { id: true, status: true },
  });
  if (!existing) {
    redirect(`/platform/billing/coupons?tab=promotions&error=${encodeURIComponent("Promotion not found")}`);
  }

  const win = parseWindow(parsed.data.startsAt, parsed.data.endsAt);
  if ("error" in win) {
    redirect(`/platform/billing/coupons?tab=promotions&error=${encodeURIComponent(win.error)}`);
  }
  const status = deriveStatus({
    status: parsed.data.status, startsAt: win.startsAt, endsAt: win.endsAt,
  });

  await db.promotion.update({
    where: { id: parsed.data.id },
    data: {
      name: parsed.data.name,
      description: parsed.data.description?.trim() || null,
      couponId: parsed.data.couponId,
      landingUrl: parsed.data.landingUrl?.trim() || null,
      emailTemplateKind: parsed.data.emailTemplateKind?.trim() || null,
      audience: parsed.data.audience?.trim() || null,
      goal: parsed.data.goal?.trim() || null,
      startsAt: win.startsAt,
      endsAt: win.endsAt,
      status,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.promotion_updated",
    entityType: "Promotion",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email, name: parsed.data.name, status },
  });
  revalidatePath("/platform/billing/coupons");
  redirect(`/platform/billing/coupons?tab=promotions&ok=saved`);
}

export async function endPromotion(promotionId: string) {
  const ctx = await requirePlatformPermission("billing.coupon");
  const existing = await db.promotion.findUnique({
    where: { id: promotionId },
    select: { id: true, name: true, status: true },
  });
  if (!existing) {
    redirect(`/platform/billing/coupons?tab=promotions&error=${encodeURIComponent("Promotion not found")}`);
  }
  await db.promotion.update({
    where: { id: promotionId },
    data: { status: "ENDED", endsAt: new Date() },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.promotion_ended",
    entityType: "Promotion",
    entityId: promotionId,
    metadata: { actor: ctx.email, name: existing.name },
    severity: "WARNING",
  });
  revalidatePath("/platform/billing/coupons");
  redirect(`/platform/billing/coupons?tab=promotions&ok=ended`);
}

export async function archivePromotion(promotionId: string) {
  const ctx = await requirePlatformPermission("billing.coupon");
  const existing = await db.promotion.findUnique({
    where: { id: promotionId },
    select: { id: true, name: true },
  });
  if (!existing) {
    redirect(`/platform/billing/coupons?tab=promotions&error=${encodeURIComponent("Promotion not found")}`);
  }
  await db.promotion.update({
    where: { id: promotionId },
    data: { status: "ARCHIVED" },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.promotion_archived",
    entityType: "Promotion",
    entityId: promotionId,
    metadata: { actor: ctx.email, name: existing.name },
  });
  revalidatePath("/platform/billing/coupons");
  redirect(`/platform/billing/coupons?tab=promotions&ok=archived`);
}
