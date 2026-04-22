"use server";

// M4 — PlanFeature library admin actions used from /platform/features.
//
// The feature library is the master list of bullets that can appear
// on pricing pages. Each `PlanFeature` row is referenced by one
// `PlanFeatureValue` cell per plan (populated lazily by the plan
// editor's savePlanFeatures action). Edits here re-render:
//   • /platform/features — the library list
//   • every /platform/plans/<id>?tab=features — the matrix
//   • /pricing & / — the public marketing pages
//
// Write guard: requirePlatformAdmin (SUPER_ADMIN or SITE_MANAGER).
// Support agents can read the library but their submit redirects
// back with ?error=forbidden via the guard.

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
  revalidatePath("/platform/features");
}

// Feature key: the programmatic identifier checked by `hasFeature(…)`.
// Must match existing entitlement keys exactly — camelCase, alphanum,
// no spaces. Changing a key silently breaks gates, so the editor
// warns before committing when an existing key changes.
const KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;

const featureSchema = z.object({
  key: z
    .string()
    .min(2)
    .max(60)
    .regex(KEY_RE, "Use camelCase or snake_case — letters, digits, underscores."),
  label: z.string().min(1).max(120),
  groupLabel: z.string().max(60).optional().or(z.literal("")),
  description: z.string().max(400).optional().or(z.literal("")),
  valueType: z.enum(["BOOLEAN", "NUMBER", "TEXT"]),
  enforcement: z.enum(["GATE", "MARKETING_ONLY"]),
  sortOrder: z.coerce.number().int().min(-10000).max(10000),
  groupSortOrder: z.coerce.number().int().min(-10000).max(10000),
});

// ─────────────────────────────────────────────────────────────
// Create — picks a placeholder key/label and redirects to edit.
// ─────────────────────────────────────────────────────────────

export async function createPlanFeature() {
  const ctx = await requirePlatformAdmin();

  // Placeholder key that won't collide — tack on counter until unique.
  let key = "newFeature";
  for (let i = 1; i <= 50; i++) {
    const trial = i === 1 ? key : `${key}${i}`;
    const exists = await db.planFeature.findUnique({
      where: { key: trial },
      select: { id: true },
    });
    if (!exists) {
      key = trial;
      break;
    }
  }

  const feature = await db.planFeature.create({
    data: {
      key,
      label: "Untitled feature",
      valueType: "BOOLEAN",
      enforcement: "MARKETING_ONLY",
      sortOrder: 100,
      groupSortOrder: 100,
    },
    select: { id: true },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.plan_feature_created",
    entityType: "PlanFeature",
    entityId: feature.id,
    metadata: { key, actor: ctx.email },
  });

  flushPricingCaches();
  redirect(`/platform/features/${feature.id}`);
}

// ─────────────────────────────────────────────────────────────
// Update — full form save.
//
// Key renames need the matching entitlement code to be updated
// too, so changing an existing key logs a warning-level audit row
// with the before/after for easy grepping.
// ─────────────────────────────────────────────────────────────

export async function updatePlanFeature(featureId: string, formData: FormData) {
  const ctx = await requirePlatformAdmin();
  const raw = Object.fromEntries(formData.entries());
  const parsed = featureSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`/platform/features/${featureId}?error=${encodeURIComponent(msg)}`);
  }

  const existing = await db.planFeature.findUnique({
    where: { id: featureId },
    select: { id: true, key: true },
  });
  if (!existing) redirect(`/platform/features?error=${encodeURIComponent("Feature not found")}`);

  // Key collision check.
  if (parsed.data.key !== existing.key) {
    const taken = await db.planFeature.findUnique({
      where: { key: parsed.data.key },
      select: { id: true },
    });
    if (taken && taken.id !== featureId) {
      redirect(
        `/platform/features/${featureId}?error=${encodeURIComponent("Key already in use.")}`,
      );
    }
  }

  await db.planFeature.update({
    where: { id: featureId },
    data: {
      key: parsed.data.key,
      label: parsed.data.label,
      groupLabel: parsed.data.groupLabel || null,
      description: parsed.data.description || null,
      valueType: parsed.data.valueType,
      enforcement: parsed.data.enforcement,
      sortOrder: parsed.data.sortOrder,
      groupSortOrder: parsed.data.groupSortOrder,
    },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    action:
      parsed.data.key !== existing.key
        ? "platform.plan_feature_key_renamed"
        : "platform.plan_feature_updated",
    entityType: "PlanFeature",
    entityId: featureId,
    metadata: {
      actor: ctx.email,
      ...(parsed.data.key !== existing.key
        ? { fromKey: existing.key, toKey: parsed.data.key }
        : { key: parsed.data.key }),
    },
  });

  flushPricingCaches();
  redirect(`/platform/features/${featureId}?ok=1`);
}

// ─────────────────────────────────────────────────────────────
// Delete — nukes the feature and (via schema cascade) all cells.
//
// Because every plan gets an auto-populated cell per feature, the
// "is this in use" signal is the count of non-empty cells. We show
// that number in the UI as a warning chip; the delete itself always
// succeeds — this is platform admin, not a self-service surface.
// ─────────────────────────────────────────────────────────────

export async function deletePlanFeature(featureId: string) {
  const ctx = await requirePlatformAdmin();

  const feature = await db.planFeature.findUnique({
    where: { id: featureId },
    select: {
      id: true,
      key: true,
      enforcement: true,
      _count: { select: { values: true } },
    },
  });
  if (!feature) redirect(`/platform/features?error=${encodeURIComponent("Feature not found")}`);

  await db.planFeature.delete({ where: { id: featureId } });

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.plan_feature_deleted",
    entityType: "PlanFeature",
    entityId: featureId,
    metadata: {
      key: feature.key,
      enforcement: feature.enforcement,
      cellsRemoved: feature._count.values,
      actor: ctx.email,
    },
  });

  flushPricingCaches();
  redirect(`/platform/features?ok=deleted`);
}
