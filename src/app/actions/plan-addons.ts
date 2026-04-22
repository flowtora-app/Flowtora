"use server";

// M5 — PlanAddOn admin actions used from the plan editor's Add-ons tab.
//
// Add-ons are things customers pay for on top of the base plan —
// "+$12/extra seat after 15", "+$29 for API access", etc. Each add-on
// is scoped to one plan row (so copy/pricing can differ per tier) and
// is optionally linked to a Stripe Price object.
//
// Write guard: requirePlatformAdmin. Flush pricing caches on every
// mutation so the public /pricing page reflects add-on changes.

import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePlatformAdmin, logPlatformAudit } from "@/lib/platform";
import { PRICING_CACHE_TAGS } from "@/lib/plans";

function flushPricingCaches() {
  revalidateTag(PRICING_CACHE_TAGS.published);
  revalidateTag(PRICING_CACHE_TAGS.all);
  revalidatePath("/");
  revalidatePath("/pricing");
  revalidatePath("/platform/plans");
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ─────────────────────────────────────────────────────────────
// Create a new add-on (inactive, placeholder slug).
// ─────────────────────────────────────────────────────────────

export async function createPlanAddOn(planId: string) {
  const ctx = await requirePlatformAdmin();

  const plan = await db.pricingPlan.findUnique({
    where: { id: planId },
    select: { id: true, slug: true },
  });
  if (!plan) redirect(`/platform/plans?error=${encodeURIComponent("Plan not found")}`);

  // Placeholder slug unique within the plan (PlanAddOn has a
  // (planId, slug) composite unique). Loop until we find one free.
  let slug = "new-addon";
  for (let i = 1; i <= 50; i++) {
    const trial = i === 1 ? slug : `${slug}-${i}`;
    const exists = await db.planAddOn.findUnique({
      where: { planId_slug: { planId, slug: trial } },
      select: { id: true },
    });
    if (!exists) {
      slug = trial;
      break;
    }
  }

  const addOn = await db.planAddOn.create({
    data: {
      planId,
      slug,
      name: "Untitled add-on",
      active: false,
      sortOrder: 100,
    },
    select: { id: true },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.plan_addon_created",
    entityType: "PlanAddOn",
    entityId: addOn.id,
    metadata: { planId, slug, actor: ctx.email },
  });

  flushPricingCaches();
  redirect(`/platform/plans/${planId}?tab=addons&ok=1`);
}

// ─────────────────────────────────────────────────────────────
// Update a single add-on. Matches the inline form on the tab.
// ─────────────────────────────────────────────────────────────

const priceStrSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Use dollars.cents, e.g. 12 or 12.50")
  .optional()
  .or(z.literal(""));

const addOnSchema = z.object({
  slug: z.string().min(2).max(40).regex(SLUG_RE, "Slug: lowercase, digits, hyphens."),
  name: z.string().min(1).max(80),
  description: z.string().max(400).optional().or(z.literal("")),
  priceMonthly: priceStrSchema,
  priceAnnual: priceStrSchema,
  unitLabel: z.string().max(40).optional().or(z.literal("")),
  stripePriceId: z.string().max(120).optional().or(z.literal("")),
  sortOrder: z.coerce.number().int().min(-10000).max(10000),
  active: z.union([z.literal("on"), z.literal("")]).optional(),
});

export async function updatePlanAddOn(addOnId: string, formData: FormData) {
  const ctx = await requirePlatformAdmin();
  const raw = Object.fromEntries(formData.entries());
  const parsed = addOnSchema.safeParse(raw);

  const existing = await db.planAddOn.findUnique({
    where: { id: addOnId },
    select: { id: true, planId: true, slug: true },
  });
  if (!existing) redirect(`/platform/plans?error=${encodeURIComponent("Add-on not found")}`);

  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(
      `/platform/plans/${existing.planId}?tab=addons&error=${encodeURIComponent(msg)}`,
    );
  }

  // Slug collision check within the same plan.
  if (parsed.data.slug !== existing.slug) {
    const taken = await db.planAddOn.findUnique({
      where: { planId_slug: { planId: existing.planId, slug: parsed.data.slug } },
      select: { id: true },
    });
    if (taken && taken.id !== addOnId) {
      redirect(
        `/platform/plans/${existing.planId}?tab=addons&error=${encodeURIComponent(
          `Slug "${parsed.data.slug}" already used by another add-on on this plan.`,
        )}`,
      );
    }
  }

  await db.planAddOn.update({
    where: { id: addOnId },
    data: {
      slug: parsed.data.slug,
      name: parsed.data.name,
      description: parsed.data.description || null,
      priceMonthly: parsed.data.priceMonthly ? parsed.data.priceMonthly : null,
      priceAnnual: parsed.data.priceAnnual ? parsed.data.priceAnnual : null,
      unitLabel: parsed.data.unitLabel || null,
      stripePriceId: parsed.data.stripePriceId || null,
      sortOrder: parsed.data.sortOrder,
      active: parsed.data.active === "on",
    },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.plan_addon_updated",
    entityType: "PlanAddOn",
    entityId: addOnId,
    metadata: {
      planId: existing.planId,
      slug: parsed.data.slug,
      active: parsed.data.active === "on",
      actor: ctx.email,
    },
  });

  flushPricingCaches();
  redirect(`/platform/plans/${existing.planId}?tab=addons&ok=1`);
}

// ─────────────────────────────────────────────────────────────
// Delete. Hard-delete; no history retained for add-ons (the
// PlanVersion snapshot already captures them as JSON for rollback
// purposes).
// ─────────────────────────────────────────────────────────────

export async function deletePlanAddOn(addOnId: string) {
  const ctx = await requirePlatformAdmin();
  const addOn = await db.planAddOn.findUnique({
    where: { id: addOnId },
    select: { id: true, planId: true, slug: true },
  });
  if (!addOn) redirect(`/platform/plans?error=${encodeURIComponent("Add-on not found")}`);

  await db.planAddOn.delete({ where: { id: addOnId } });

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.plan_addon_deleted",
    entityType: "PlanAddOn",
    entityId: addOnId,
    metadata: { planId: addOn.planId, slug: addOn.slug, actor: ctx.email },
  });

  flushPricingCaches();
  redirect(`/platform/plans/${addOn.planId}?tab=addons&ok=1`);
}
