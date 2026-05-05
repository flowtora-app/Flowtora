"use server";

// Page 40 — Lifecycle / Drip Sequences actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import {
  defaultStepConfig,
  PREBUILT_TEMPLATES,
} from "@/lib/sequence-steps";
import type {
  SequenceStepKind,
  SequenceTriggerType,
} from "@prisma/client";

const LIST_ROUTE = "/platform/marketing/sequences";
const PERM_WRITE = "announcement.write" as const;
const detailRoute = (id: string) => `${LIST_ROUTE}/${id}`;

const STEP_KINDS = [
  "SEND_EMAIL", "SEND_SMS", "SEND_IN_APP", "NOTIFY_CSM",
  "ADD_TAG", "REMOVE_TAG", "MOVE_TO_PLAN", "APPLY_COUPON",
  "WEBHOOK_OUT", "BRANCH", "WAIT", "SPLIT",
] as const;

const TRIGGERS = [
  "SIGNUP", "PLAN_STARTED", "PLAN_CHANGED", "FAILED_PAYMENT",
  "TRIAL_ENDING", "DAYS_INACTIVE", "FEATURE_FIRST_USE",
  "CUSTOM_EVENT", "TAG_ADDED", "WEBHOOK",
] as const;

/* ── Create ────────────────────────────────────────────── */

const createSchema = z.object({
  name: z.string().min(1, "Name required").max(200),
  description: z.string().max(400).optional().or(z.literal("")),
  triggerType: z.enum(TRIGGERS).default("SIGNUP"),
  templateId: z.string().optional().or(z.literal("")),
});

export async function createSequence(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${LIST_ROUTE}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;

  let triggerType: SequenceTriggerType = d.triggerType;
  let triggerConfig: unknown = {};
  let blueprint: { kind: SequenceStepKind; title?: string; config: unknown; branchKey?: string }[] = [];

  if (d.templateId) {
    const tmpl = await db.sequenceTemplate.findUnique({ where: { id: d.templateId } });
    if (tmpl) {
      triggerType = tmpl.triggerType;
      triggerConfig = tmpl.triggerConfig ?? {};
      blueprint = Array.isArray(tmpl.blueprint) ? tmpl.blueprint as never : [];
    }
  }

  const created = await db.sequence.create({
    data: {
      name: d.name,
      description: d.description || null,
      triggerType,
      triggerConfig: triggerConfig as never,
      authorId: ctx.userId,
      status: "DRAFT",
    },
    select: { id: true },
  });

  // Materialize the blueprint into real steps (with parent linking through positions).
  if (blueprint.length > 0) {
    // Build steps in order; each step's parent is the previous non-branch step,
    // unless the step has a branchKey — then the parent is the most recent
    // BRANCH/SPLIT step. (This is the encoding our blueprints use.)
    const idByPosition = new Map<number, string>();
    let lastBranchPos: number | null = null;
    let lastLinearPos: number | null = null;

    for (let i = 0; i < blueprint.length; i++) {
      const node = blueprint[i]!;
      let parentId: string | null = null;
      let branchKey: string | null = null;
      if (node.branchKey) {
        // Child of the most recent BRANCH/SPLIT.
        parentId = lastBranchPos != null ? idByPosition.get(lastBranchPos) ?? null : null;
        branchKey = node.branchKey;
      } else {
        parentId = lastLinearPos != null ? idByPosition.get(lastLinearPos) ?? null : null;
      }
      const stepRow = await db.sequenceStep.create({
        data: {
          sequenceId: created.id,
          position: i,
          parentStepId: parentId,
          branchKey,
          kind: node.kind,
          config: (node.config ?? {}) as never,
          title: node.title ?? null,
        },
        select: { id: true },
      });
      idByPosition.set(i, stepRow.id);
      if (node.kind === "BRANCH" || node.kind === "SPLIT") lastBranchPos = i;
      if (!node.branchKey) lastLinearPos = i;
    }
  }

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.sequence.created",
    entityType: "Sequence",
    entityId: created.id,
    metadata: { actor: ctx.email, name: d.name, fromTemplate: d.templateId || null },
  });
  revalidatePath(LIST_ROUTE);
  redirect(`${detailRoute(created.id)}?ok=created`);
}

/* ── Save (sequence-level metadata) ───────────────────── */

const saveSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(400).optional().or(z.literal("")),
  triggerType: z.enum(TRIGGERS),
  triggerConfigJson: z.string().default("{}"),
  conversionGoal: z.string().max(200).optional().or(z.literal("")),
  exitOnGoal: z.union([z.literal("on"), z.literal("")]).optional(),
});

export async function saveSequence(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = saveSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const id = formData.get("id");
    redirect(`${detailRoute(String(id))}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  let triggerConfig: unknown = {};
  try { triggerConfig = JSON.parse(d.triggerConfigJson); } catch { triggerConfig = {}; }
  await db.sequence.update({
    where: { id: d.id },
    data: {
      name: d.name,
      description: d.description || null,
      triggerType: d.triggerType,
      triggerConfig: triggerConfig as never,
      conversionGoal: d.conversionGoal || null,
      exitOnGoal: d.exitOnGoal === "on",
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.sequence.saved",
    entityType: "Sequence",
    entityId: d.id,
    metadata: { actor: ctx.email, name: d.name },
  });
  revalidatePath(detailRoute(d.id));
  redirect(`${detailRoute(d.id)}?ok=saved`);
}

/* ── Status transitions ────────────────────────────────── */

const transitionSchema = z.object({
  id: z.string().min(1),
  to: z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]),
});

export async function transitionSequence(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = transitionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Invalid")}`);
  const { id, to } = parsed.data;
  const now = new Date();
  await db.sequence.update({
    where: { id },
    data: {
      status: to,
      publishedAt: to === "ACTIVE" ? now : undefined,
      pausedAt: to === "PAUSED" ? now : undefined,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: `platform.sequence.${to.toLowerCase()}`,
    entityType: "Sequence",
    entityId: id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(LIST_ROUTE);
  revalidatePath(detailRoute(id));
  redirect(`${detailRoute(id)}?ok=transitioned`);
}

/* ── Step graph ────────────────────────────────────────── */

const addStepSchema = z.object({
  sequenceId: z.string().min(1),
  kind: z.enum(STEP_KINDS),
  parentStepId: z.string().optional().or(z.literal("")),
  branchKey: z.string().max(40).optional().or(z.literal("")),
});

export async function addSequenceStep(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = addStepSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Invalid")}`);
  }
  const d = parsed.data;
  const last = await db.sequenceStep.findFirst({
    where: { sequenceId: d.sequenceId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = (last?.position ?? -1) + 1;
  const created = await db.sequenceStep.create({
    data: {
      sequenceId: d.sequenceId,
      position,
      parentStepId: d.parentStepId || null,
      branchKey: d.branchKey || null,
      kind: d.kind,
      config: defaultStepConfig(d.kind) as never,
    },
    select: { id: true },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.sequence.step_added",
    entityType: "SequenceStep",
    entityId: created.id,
    metadata: { actor: ctx.email, kind: d.kind, sequenceId: d.sequenceId },
  });
  revalidatePath(detailRoute(d.sequenceId));
  redirect(`${detailRoute(d.sequenceId)}?ok=step-added#step-${created.id.slice(0, 8)}`);
}

const updateStepSchema = z.object({
  stepId: z.string().min(1),
  sequenceId: z.string().min(1),
  title: z.string().max(120).optional().or(z.literal("")),
  configJson: z.string().default("{}"),
});

export async function updateSequenceStep(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = updateStepSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Invalid")}`);
  }
  const d = parsed.data;
  let config: unknown = {};
  try { config = JSON.parse(d.configJson); } catch { config = {}; }
  await db.sequenceStep.update({
    where: { id: d.stepId },
    data: {
      title: d.title || null,
      config: config as never,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.sequence.step_updated",
    entityType: "SequenceStep",
    entityId: d.stepId,
    metadata: { actor: ctx.email, sequenceId: d.sequenceId },
  });
  revalidatePath(detailRoute(d.sequenceId));
  redirect(`${detailRoute(d.sequenceId)}?ok=step-saved#step-${d.stepId.slice(0, 8)}`);
}

const moveStepSchema = z.object({
  stepId: z.string().min(1),
  sequenceId: z.string().min(1),
  direction: z.enum(["up", "down"]),
});

export async function moveSequenceStep(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = moveStepSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Invalid")}`);
  const { stepId, sequenceId, direction } = parsed.data;
  const step = await db.sequenceStep.findUnique({
    where: { id: stepId },
    select: { id: true, position: true, parentStepId: true, branchKey: true },
  });
  if (!step) redirect(`${detailRoute(sequenceId)}?error=${encodeURIComponent("Step not found")}`);
  if (!step) return;
  // Find sibling among same parent + branchKey ordered by position.
  const siblings = await db.sequenceStep.findMany({
    where: {
      sequenceId,
      parentStepId: step.parentStepId,
      branchKey: step.branchKey,
    },
    orderBy: { position: "asc" },
    select: { id: true, position: true },
  });
  const idx = siblings.findIndex((s) => s.id === step.id);
  const target = direction === "up" ? idx - 1 : idx + 1;
  if (target < 0 || target >= siblings.length) {
    redirect(`${detailRoute(sequenceId)}?error=${encodeURIComponent("Already at edge")}`);
  }
  // Swap positions.
  const a = siblings[idx]!;
  const b = siblings[target]!;
  await db.$transaction([
    db.sequenceStep.update({ where: { id: a.id }, data: { position: b.position } }),
    db.sequenceStep.update({ where: { id: b.id }, data: { position: a.position } }),
  ]);
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.sequence.step_moved",
    entityType: "SequenceStep",
    entityId: stepId,
    metadata: { actor: ctx.email, direction },
  });
  revalidatePath(detailRoute(sequenceId));
  redirect(`${detailRoute(sequenceId)}?ok=moved#step-${stepId.slice(0, 8)}`);
}

const deleteStepSchema = z.object({
  stepId: z.string().min(1),
  sequenceId: z.string().min(1),
});

export async function deleteSequenceStep(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = deleteStepSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Invalid")}`);
  // Cascade-delete handled by Prisma — children rows lose their parent (SetNull),
  // but that orphans them. Prefer to delete the subtree explicitly.
  await deleteSubtree(parsed.data.stepId);
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.sequence.step_deleted",
    entityType: "SequenceStep",
    entityId: parsed.data.stepId,
    metadata: { actor: ctx.email },
  });
  revalidatePath(detailRoute(parsed.data.sequenceId));
  redirect(`${detailRoute(parsed.data.sequenceId)}?ok=step-deleted`);
}

async function deleteSubtree(stepId: string): Promise<void> {
  const children = await db.sequenceStep.findMany({
    where: { parentStepId: stepId },
    select: { id: true },
  });
  for (const c of children) await deleteSubtree(c.id);
  await db.sequenceStep.delete({ where: { id: stepId } }).catch(() => { /* already gone */ });
}

/* ── Templates ─────────────────────────────────────────── */

export async function seedPrebuiltTemplates() {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  for (const t of PREBUILT_TEMPLATES) {
    const existing = await db.sequenceTemplate.findFirst({
      where: { name: t.name },
      select: { id: true },
    });
    if (existing) continue;
    await db.sequenceTemplate.create({
      data: {
        name: t.name,
        description: t.description,
        category: t.category,
        triggerType: t.triggerType,
        triggerConfig: t.triggerConfig as never,
        blueprint: t.blueprint as never,
      },
    });
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.sequence.prebuilt_templates_loaded",
    entityType: "SequenceTemplate",
    entityId: "(many)",
    metadata: { actor: ctx.email, count: PREBUILT_TEMPLATES.length },
  });
  revalidatePath(`${LIST_ROUTE}/templates`);
  redirect(`${LIST_ROUTE}/templates?ok=loaded`);
}

const removeTemplateSchema = z.object({ id: z.string().min(1) });

export async function removeSequenceTemplate(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = removeTemplateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${LIST_ROUTE}/templates?error=${encodeURIComponent("Invalid")}`);
  await db.sequenceTemplate.delete({ where: { id: parsed.data.id } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.sequence.template_removed",
    entityType: "SequenceTemplate",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(`${LIST_ROUTE}/templates`);
  redirect(`${LIST_ROUTE}/templates?ok=removed`);
}

/* ── Manual enrollment + runtime simulator ─────────────── */

const enrollSchema = z.object({
  sequenceId: z.string().min(1),
  tenantId: z.string().min(1),
});

export async function enrollTenant(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = enrollSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Invalid")}`);
  const { sequenceId, tenantId } = parsed.data;

  const seq = await db.sequence.findUnique({
    where: { id: sequenceId },
    include: { steps: { orderBy: { position: "asc" } } },
  });
  if (!seq) redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Sequence missing")}`);
  if (!seq) return;

  const firstStep = seq.steps.find((s) => s.parentStepId == null);
  const existing = await db.sequenceEnrollment.findFirst({
    where: { sequenceId, tenantId, userId: null },
    select: { id: true },
  });
  const enrollment = existing
    ? await db.sequenceEnrollment.update({
        where: { id: existing.id },
        data: {
          status: "ACTIVE",
          currentStepId: firstStep?.id ?? null,
          enrolledAt: new Date(),
          completedAt: null,
          exitedAt: null,
          exitReason: null,
        },
      })
    : await db.sequenceEnrollment.create({
        data: {
          sequenceId,
          tenantId,
          currentStepId: firstStep?.id ?? null,
          status: "ACTIVE",
        },
      });
  if (firstStep) {
    await db.sequenceStepEvent.create({
      data: { enrollmentId: enrollment.id, stepId: firstStep.id, event: "entered" },
    });
    await db.sequenceStep.update({
      where: { id: firstStep.id },
      data: { enteredCount: { increment: 1 } },
    });
  }
  await db.sequence.update({
    where: { id: sequenceId },
    data: {
      totalEnrolled: { increment: 1 },
      activeEnrolled: { increment: 1 },
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.sequence.enrolled",
    entityType: "SequenceEnrollment",
    entityId: enrollment.id,
    metadata: { actor: ctx.email, sequenceId, tenantId },
  });
  revalidatePath(detailRoute(sequenceId));
  redirect(`${detailRoute(sequenceId)}?step=enrollments&ok=enrolled`);
}

const advanceSchema = z.object({
  sequenceId: z.string().min(1),
  enrollmentId: z.string().min(1),
  branchKey: z.string().optional().or(z.literal("")),
});

/**
 * Advance an enrollment one step forward. Used by the manual debug UI;
 * the production worker would call the same logic in a loop, honoring
 * WAIT durations.
 */
export async function advanceEnrollment(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = advanceSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Invalid")}`);
  const { sequenceId, enrollmentId, branchKey } = parsed.data;

  const enrollment = await db.sequenceEnrollment.findUnique({
    where: { id: enrollmentId },
    include: { sequence: { select: { exitOnGoal: true, conversionGoal: true } } },
  });
  if (!enrollment || !enrollment.currentStepId) {
    redirect(`${detailRoute(sequenceId)}?error=${encodeURIComponent("No current step")}`);
  }
  if (!enrollment || !enrollment.currentStepId) return;

  const currentStep = await db.sequenceStep.findUnique({
    where: { id: enrollment.currentStepId },
  });
  if (!currentStep) return;

  // Mark current step completed.
  await db.sequenceStepEvent.create({
    data: { enrollmentId: enrollment.id, stepId: currentStep.id, event: "completed" },
  });

  // Find next step. If branch-aware, we need a branchKey.
  let nextStep: { id: string } | null = null;
  if (currentStep.kind === "BRANCH" || currentStep.kind === "SPLIT") {
    if (!branchKey) {
      redirect(`${detailRoute(sequenceId)}?error=${encodeURIComponent("Branch key required for BRANCH/SPLIT step")}`);
    }
    nextStep = await db.sequenceStep.findFirst({
      where: { parentStepId: currentStep.id, branchKey },
      orderBy: { position: "asc" },
      select: { id: true },
    });
  } else {
    nextStep = await db.sequenceStep.findFirst({
      where: { parentStepId: currentStep.id },
      orderBy: { position: "asc" },
      select: { id: true },
    });
  }

  if (!nextStep) {
    // Sequence complete.
    await db.sequenceEnrollment.update({
      where: { id: enrollment.id },
      data: { status: "COMPLETED", completedAt: new Date(), currentStepId: null },
    });
    await db.sequence.update({
      where: { id: sequenceId },
      data: {
        activeEnrolled: { decrement: 1 },
        totalConverted: { increment: 1 },
      },
    });
    await db.sequenceStep.update({
      where: { id: currentStep.id },
      data: { convertedCount: { increment: 1 } },
    });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.sequence.enrollment_completed",
      entityType: "SequenceEnrollment",
      entityId: enrollment.id,
      metadata: { actor: ctx.email },
    });
    revalidatePath(detailRoute(sequenceId));
    redirect(`${detailRoute(sequenceId)}?step=enrollments&ok=completed`);
  }

  await db.sequenceEnrollment.update({
    where: { id: enrollment.id },
    data: { currentStepId: nextStep.id },
  });
  await db.sequenceStepEvent.create({
    data: { enrollmentId: enrollment.id, stepId: nextStep.id, event: "entered" },
  });
  await db.sequenceStep.update({
    where: { id: nextStep.id },
    data: { enteredCount: { increment: 1 } },
  });
  revalidatePath(detailRoute(sequenceId));
  redirect(`${detailRoute(sequenceId)}?step=enrollments&ok=advanced`);
}

const exitSchema = z.object({
  sequenceId: z.string().min(1),
  enrollmentId: z.string().min(1),
  reason: z.string().max(200).optional().or(z.literal("")),
});

export async function exitEnrollment(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = exitSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Invalid")}`);
  await db.sequenceEnrollment.update({
    where: { id: parsed.data.enrollmentId },
    data: {
      status: "EXITED",
      exitedAt: new Date(),
      exitReason: parsed.data.reason || "Manual exit",
      currentStepId: null,
    },
  });
  await db.sequence.update({
    where: { id: parsed.data.sequenceId },
    data: { activeEnrolled: { decrement: 1 } },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.sequence.enrollment_exited",
    entityType: "SequenceEnrollment",
    entityId: parsed.data.enrollmentId,
    metadata: { actor: ctx.email, reason: parsed.data.reason || null },
  });
  revalidatePath(detailRoute(parsed.data.sequenceId));
  redirect(`${detailRoute(parsed.data.sequenceId)}?step=enrollments&ok=exited`);
}

