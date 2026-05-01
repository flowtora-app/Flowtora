"use server";

// Health-scoring server actions — Page 6 of the admin spec.
//
// Permissions:
//   • Edit / activate / save scoring model: system.write_settings
//     (Super Admin + Admin) — see spec §Permissions.
//   • Manual TenantHealthAdjustment: tenant.tag (CSMs have it).
//   • Recompute all: system.write_settings (it writes a snapshot for
//     every tenant + costs DB cycles, so we gate to admins).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { logPlatformAudit, requirePlatformStaff } from "@/lib/platform";
import {
  HEALTH_FACTORS,
  computeFactorScores,
  loadActiveModel,
  loadHealthRows,
  loadShadowModel,
  rollupScore,
  type HealthFactorKey,
} from "@/server/platform/health-scoring";

const VALID_FACTOR_KEYS = new Set(HEALTH_FACTORS.map((f) => f.key));

/* ── Save (and activate) a new scoring model version ─────── */

const saveModelSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  /** JSON map: { [factorKey]: number } summing to 100. */
  weightsJson: z.string().min(2),
  formula: z.string().max(500).optional(),
  /** When "active", flips the previous active row off + this one on.
   *  When "shadow", marks this as the A/B candidate. */
  mode: z.union([z.literal("active"), z.literal("shadow")]),
});

export async function saveScoringModel(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("system.write_settings")) {
    return { ok: false, error: "Your role can't edit the scoring model" } as const;
  }
  const parsed = saveModelSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" } as const;
  }

  let weights: Record<string, number>;
  try {
    weights = JSON.parse(parsed.data.weightsJson) as Record<string, number>;
  } catch {
    return { ok: false, error: "Weights must be valid JSON" } as const;
  }

  // Validate the weights — every key must be a known factor, every
  // value a non-negative number, and they must sum to exactly 100.
  let sum = 0;
  for (const [k, v] of Object.entries(weights)) {
    if (!VALID_FACTOR_KEYS.has(k as HealthFactorKey)) {
      return { ok: false, error: `Unknown factor: ${k}` } as const;
    }
    if (typeof v !== "number" || Number.isNaN(v) || v < 0) {
      return { ok: false, error: `Invalid weight for ${k}` } as const;
    }
    sum += v;
  }
  if (Math.round(sum) !== 100) {
    return { ok: false, error: `Weights must sum to 100 (got ${Math.round(sum)})` } as const;
  }

  const lastVersion = await db.healthScoringModel.findFirst({
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (lastVersion?.version ?? 0) + 1;

  // Atomic flip: if this is the new active model, unset the previous
  // active flag in the same transaction; if shadow, unset the
  // previous shadow.
  await db.$transaction(async (tx) => {
    if (parsed.data.mode === "active") {
      await tx.healthScoringModel.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
    } else {
      await tx.healthScoringModel.updateMany({
        where: { isShadow: true },
        data: { isShadow: false },
      });
    }
    await tx.healthScoringModel.create({
      data: {
        version: nextVersion,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        weights: weights as Record<string, number>,
        formula: parsed.data.formula ?? null,
        isActive: parsed.data.mode === "active",
        isShadow: parsed.data.mode === "shadow",
        activatedAt: parsed.data.mode === "active" ? new Date() : null,
        createdBy: ctx.userId,
      },
    });
  });

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.health_scoring_model_saved",
    entityType: "HealthScoringModel",
    metadata: { actor: ctx.email, mode: parsed.data.mode, version: nextVersion },
  });
  revalidatePath("/platform/tenants/health");
  return { ok: true, version: nextVersion } as const;
}

/* ── Activate or clear the shadow on an existing model ───── */

const setShadowSchema = z.object({
  modelId: z.string().min(1).optional(), // omit = clear current shadow
});

export async function setShadowModel(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("system.write_settings")) {
    return { ok: false, error: "Your role can't edit the scoring model" } as const;
  }
  const parsed = setShadowSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  await db.$transaction(async (tx) => {
    await tx.healthScoringModel.updateMany({
      where: { isShadow: true },
      data: { isShadow: false },
    });
    if (parsed.data.modelId) {
      await tx.healthScoringModel.update({
        where: { id: parsed.data.modelId },
        data: { isShadow: true },
      });
    }
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: parsed.data.modelId
      ? "platform.health_shadow_model_set"
      : "platform.health_shadow_model_cleared",
    entityType: "HealthScoringModel",
    entityId: parsed.data.modelId,
    metadata: { actor: ctx.email },
  });
  revalidatePath("/platform/tenants/health");
  return { ok: true } as const;
}

/* ── Promote shadow → active ─────────────────────────────── */

const promoteSchema = z.object({
  modelId: z.string().min(1),
});

export async function promoteShadowToActive(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("system.write_settings")) {
    return { ok: false, error: "Your role can't edit the scoring model" } as const;
  }
  const parsed = promoteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  await db.$transaction(async (tx) => {
    await tx.healthScoringModel.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });
    await tx.healthScoringModel.update({
      where: { id: parsed.data.modelId },
      data: { isActive: true, isShadow: false, activatedAt: new Date() },
    });
  });

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.health_model_promoted",
    entityType: "HealthScoringModel",
    entityId: parsed.data.modelId,
    metadata: { actor: ctx.email },
  });
  revalidatePath("/platform/tenants/health");
  return { ok: true } as const;
}

/* ── Manual health adjustment (CSM-only) ─────────────────── */

const adjustmentSchema = z.object({
  tenantId: z.string().min(1),
  delta: z.coerce.number().int().min(-50).max(50),
  reason: z.string().min(3).max(500),
  expiresAt: z.string().optional(),
});

export async function addManualHealthAdjustment(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("tenant.tag")) {
    return { ok: false, error: "Your role can't apply manual adjustments" } as const;
  }
  const parsed = adjustmentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" } as const;
  }
  if (parsed.data.delta === 0) {
    return { ok: false, error: "Delta must be non-zero" } as const;
  }
  let expiresAt: Date | null = null;
  if (parsed.data.expiresAt) {
    const d = new Date(parsed.data.expiresAt);
    if (Number.isNaN(d.getTime())) return { ok: false, error: "Invalid expiry date" } as const;
    expiresAt = d;
  }

  const adj = await db.tenantHealthAdjustment.create({
    data: {
      tenantId: parsed.data.tenantId,
      delta: parsed.data.delta,
      reason: parsed.data.reason,
      expiresAt,
      createdBy: ctx.userId,
    },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: parsed.data.tenantId,
    action: "platform.health_adjustment_added",
    entityType: "TenantHealthAdjustment",
    entityId: adj.id,
    metadata: { actor: ctx.email, delta: parsed.data.delta, reason: parsed.data.reason },
  });
  revalidatePath("/platform/tenants/health");
  revalidatePath(`/platform/tenants/${parsed.data.tenantId}`);
  return { ok: true, id: adj.id } as const;
}

const clearAdjSchema = z.object({
  adjustmentId: z.string().min(1),
});

export async function clearManualHealthAdjustment(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("tenant.tag")) {
    return { ok: false, error: "Your role can't clear manual adjustments" } as const;
  }
  const parsed = clearAdjSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const row = await db.tenantHealthAdjustment.findUnique({
    where: { id: parsed.data.adjustmentId },
    select: { id: true, tenantId: true },
  });
  if (!row) return { ok: false, error: "Adjustment not found" } as const;

  await db.tenantHealthAdjustment.delete({ where: { id: row.id } });

  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: row.tenantId,
    action: "platform.health_adjustment_cleared",
    entityType: "TenantHealthAdjustment",
    entityId: row.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath("/platform/tenants/health");
  revalidatePath(`/platform/tenants/${row.tenantId}`);
  return { ok: true } as const;
}

/* ── Recompute all snapshots (admin button + cron entry) ─── */

export async function recomputeAllHealthScores() {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("system.write_settings")) {
    return { ok: false, error: "Your role can't recompute" } as const;
  }
  const count = await runRecompute("manual");

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.health_scores_recomputed",
    entityType: "TenantHealthSnapshot",
    metadata: { actor: ctx.email, count },
  });
  revalidatePath("/platform/tenants/health");
  return { ok: true, count } as const;
}

/** Stand-alone runner used by the cron + the manual button. Returns
 *  the number of snapshot rows created (one per tenant, plus one per
 *  tenant when a shadow model is configured). */
export async function runRecompute(trigger: "scheduled" | "manual"): Promise<number> {
  const { rows, active, shadow } = await loadHealthRows();

  // We re-compute factor scores per tenant fresh with each model so
  // shadow runs are honest (same inputs → different weights → different
  // score). Pull inputs once via loadHealthRows already done — we can
  // just rollup with shadow.weights.
  const writes: Promise<unknown>[] = [];
  for (const r of rows) {
    writes.push(
      db.tenantHealthSnapshot.create({
        data: {
          tenantId: r.tenantId,
          score: r.score,
          subscores: r.subscores as Record<string, number>,
          modelVersion: active.version,
          shadow: false,
          adjustmentDelta: r.adjustmentDelta,
          trigger,
        },
      }),
    );
    if (shadow && r.shadowScore != null) {
      writes.push(
        db.tenantHealthSnapshot.create({
          data: {
            tenantId: r.tenantId,
            score: r.shadowScore,
            subscores: r.subscores as Record<string, number>,
            modelVersion: shadow.version,
            shadow: true,
            adjustmentDelta: r.adjustmentDelta,
            trigger,
          },
        }),
      );
    }
  }
  await Promise.all(writes);
  return writes.length;
}

/** Used from the modal's "Save & preview" path — returns what each
 *  tenant's score would be under a candidate weights map without
 *  writing anything. */
export async function previewScoringChange(weightsJson: string) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("system.write_settings")) {
    return { ok: false, error: "Forbidden" } as const;
  }
  let weights: Record<string, number>;
  try {
    weights = JSON.parse(weightsJson) as Record<string, number>;
  } catch {
    return { ok: false, error: "Invalid JSON" } as const;
  }
  const { rows } = await loadHealthRows();
  const candidate = rows.map((r) => {
    const score = rollupScore(r.subscores, weights as Record<HealthFactorKey, number>);
    const next = Math.max(0, Math.min(100, score + r.adjustmentDelta));
    return {
      tenantId: r.tenantId,
      tenantName: r.tenantName,
      currentScore: r.score,
      candidateScore: next,
      delta: next - r.score,
    };
  });
  candidate.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return { ok: true, candidate: candidate.slice(0, 50) } as const;
}

void computeFactorScores;
void loadActiveModel;
void loadShadowModel;
