"use server";

// Phase 12 — production workflow: stage lifecycle, defect reports,
// material usage. This file owns the "what happens on the shop floor"
// surface. Department + workstation CRUD lives in `departments.ts` —
// that's a settings concern, different audience.
//
// The shape every action shares:
//   1. Permission check (production:manage or production:view where relevant)
//   2. Tenant-scoped load of the subject (stage/defect/material)
//   3. State-machine or data validation
//   4. DB mutation (ideally in a transaction when we touch multiple rows)
//   5. Audit + optional notification
//   6. revalidatePath on the surfaces that show it
//
// Notifications are best-effort and should never block the mutation path
// (that's notifyMany's contract — it swallows errors).

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ProductionStageStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { notify, notifyMany } from "@/lib/notifications";
import { STAGE_TEMPLATES, STAGE_TRANSITIONS } from "@/lib/production";

const optionalString = z.string().max(200).optional().or(z.literal(""));
const optionalLong   = z.string().max(4000).optional().or(z.literal(""));
const empty = (s: string | undefined) => (s && s.length > 0 ? s : null);

// Validate an assignee is an active member of this tenant. We do this
// defensively because the UI sometimes sends a stale user id (e.g. the
// assignee was just deactivated in another tab); we want to fall back
// to "unassigned" instead of failing loudly.
async function validAssignee(tenantId: string, userId: string | null) {
  if (!userId) return null;
  const m = await db.membership.findFirst({
    where: { tenantId, userId, status: "ACTIVE" },
  });
  return m ? userId : null;
}

// Resolve a department id to a real record in this tenant. Returns null
// if the input is null/empty OR if the id doesn't match — defensive by
// design so a stale UI never writes an orphan reference.
async function resolveDepartment(tenantId: string, id: string | null): Promise<string | null> {
  if (!id) return null;
  const d = await db.department.findFirst({
    where:  { id, tenantId },
    select: { id: true },
  });
  return d?.id ?? null;
}

async function resolveWorkStation(tenantId: string, id: string | null): Promise<string | null> {
  if (!id) return null;
  const w = await db.workStation.findFirst({
    where:  { id, tenantId },
    select: { id: true },
  });
  return w?.id ?? null;
}

// Defect + material actions accept an optional stageId. We never want a
// caller to write a cross-order stage reference (which would corrupt the
// order's defect/material rollup). This helper verifies the stage lives
// on the specified order within this tenant.
async function resolveStageOnOrder(
  tenantId: string,
  orderId: string,
  stageId: string | null,
): Promise<string | null> {
  if (!stageId) return null;
  const s = await db.productionStage.findFirst({
    where:  { id: stageId, tenantId, orderId },
    select: { id: true },
  });
  return s?.id ?? null;
}

async function assertOrder(tenantId: string, orderId: string) {
  return db.order.findFirst({
    where:  { id: orderId, tenantId },
    select: {
      id: true, number: true, tenantId: true,
      productionManagerId: true, installerId: true, createdBy: true,
    },
  });
}

// Stage loads include department for notification copy and the order
// parent for path-based revalidation.
async function loadStage(tenantId: string, stageId: string) {
  return db.productionStage.findFirst({
    where:  { id: stageId, tenantId },
    include: {
      department: { select: { id: true, name: true, color: true } },
      order: {
        select: {
          id: true, number: true, tenantId: true,
          productionManagerId: true, installerId: true, createdBy: true,
        },
      },
    },
  });
}

// Guard a requested status transition. Returns the target status if the
// move is legal, null otherwise. We do this as a table lookup in
// `@/lib/production` so the UI and server stay in sync.
function canTransition(from: ProductionStageStatus, to: ProductionStageStatus): boolean {
  if (from === to) return false;
  return STAGE_TRANSITIONS[from]?.includes(to) ?? false;
}

function revalidateOrderSurfaces(slug: string, orderId: string) {
  revalidatePath(`/t/${slug}/orders/${orderId}`);
  revalidatePath(`/t/${slug}/production`);
  revalidatePath(`/t/${slug}/orders`);
}

// ────────────────────────────────────────────────────────────
// Create a single stage on an order (ad-hoc).
// ────────────────────────────────────────────────────────────

const createStageSchema = z.object({
  title:            z.string().min(1).max(200),
  description:      optionalLong,
  departmentId:     optionalString,
  workStationId:    optionalString,
  assignedTo:       optionalString,
  estimatedMinutes: z.string().optional().or(z.literal("")),
  dueAt:            optionalString, // YYYY-MM-DD
});

export async function createStage(slug: string, orderId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "production:manage");
  const order = await assertOrder(ctx.tenant.id, orderId);
  if (!order) return;

  const parsed = createStageSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/orders/${orderId}?error=${encodeURIComponent("Stage title is required.")}`);
  }
  const d = parsed.data;

  const assigneeId = await validAssignee(ctx.tenant.id, empty(d.assignedTo));
  const estimatedMinutes = (() => {
    if (!d.estimatedMinutes) return null;
    const n = Number(d.estimatedMinutes);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  })();

  // Verify department belongs to tenant (if provided). Don't error on
  // mismatch — quietly null it out, same logic as validAssignee.
  const departmentId = await resolveDepartment(ctx.tenant.id, empty(d.departmentId));
  const workStationId = await resolveWorkStation(ctx.tenant.id, empty(d.workStationId));

  // New stage sits at the end of the existing sequence.
  const last = await db.productionStage.findFirst({
    where:    { tenantId: ctx.tenant.id, orderId },
    orderBy:  { sortOrder: "desc" },
    select:   { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? 0) + 10;

  const stage = await db.productionStage.create({
    data: {
      tenantId:         ctx.tenant.id,
      orderId,
      title:            d.title,
      description:      empty(d.description),
      departmentId,
      workStationId,
      assigneeId,
      estimatedMinutes,
      dueAt:            d.dueAt ? new Date(d.dueAt) : null,
      sortOrder,
      status:           "PENDING",
    },
    include: { department: { select: { name: true } } },
  });

  // Notify the assignee if set.
  if (assigneeId && assigneeId !== ctx.userId) {
    await notify({
      tenantId:   ctx.tenant.id,
      userId:     assigneeId,
      type:       "stage.assigned",
      title:      `Stage assigned: ${stage.title}`,
      body:       `${order.number}${stage.department?.name ? ` · ${stage.department.name}` : ""}`,
      entityType: "ProductionStage",
      entityId:   stage.id,
      link:       `/t/${slug}/orders/${orderId}`,
    });
  }

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "stage.created",
    entityType: "ProductionStage",
    entityId:   stage.id,
    metadata:   { orderId, title: stage.title, departmentId },
  });

  revalidateOrderSurfaces(slug, orderId);
}

// ────────────────────────────────────────────────────────────
// Apply a stage template to an order — bulk-creates the canonical
// sequence for a given template. Departments are resolved by name
// within the tenant; if a name doesn't match, the stage is created
// with a null departmentId and the UI prompts the user to assign
// one. That's the least-surprising behaviour when a shop imports
// a template before setting up its departments.
// ────────────────────────────────────────────────────────────

const applyTemplateSchema = z.object({
  templateKey: z.string().min(1),
});

export async function applyStageTemplate(slug: string, orderId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "production:manage");
  const order = await assertOrder(ctx.tenant.id, orderId);
  if (!order) return;

  const parsed = applyTemplateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const tpl = STAGE_TEMPLATES.find((t) => t.key === parsed.data.templateKey);
  if (!tpl) return;

  // Resolve department names → ids in one round-trip.
  const wantedNames = [...new Set(tpl.steps.map((s) => s.deptName))];
  const depts = await db.department.findMany({
    where:  { tenantId: ctx.tenant.id, name: { in: wantedNames } },
    select: { id: true, name: true },
  });
  const byName = new Map(depts.map((d) => [d.name, d.id]));

  // Place the new stages AFTER any existing stages so we never disrupt
  // work already in progress.
  const last = await db.productionStage.findFirst({
    where:    { tenantId: ctx.tenant.id, orderId },
    orderBy:  { sortOrder: "desc" },
    select:   { sortOrder: true },
  });
  let cursor = (last?.sortOrder ?? 0) + 10;

  await db.$transaction(
    tpl.steps.map((step) => {
      const data = {
        tenantId:         ctx.tenant.id,
        orderId,
        title:            step.title,
        departmentId:     byName.get(step.deptName) ?? null,
        estimatedMinutes: step.estimatedMinutes ?? null,
        sortOrder:        cursor,
        status:           "PENDING" as const,
      };
      cursor += 10;
      return db.productionStage.create({ data });
    }),
  );

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "stage.template_applied",
    entityType: "Order",
    entityId:   orderId,
    metadata:   { templateKey: tpl.key, stageCount: tpl.steps.length },
  });

  revalidateOrderSurfaces(slug, orderId);
}

// ────────────────────────────────────────────────────────────
// Update stage details (title / description / est / due / dept / machine).
// Status is NOT editable here — use the lifecycle actions.
// ────────────────────────────────────────────────────────────

const updateStageSchema = z.object({
  title:            z.string().min(1).max(200),
  description:      optionalLong,
  departmentId:     optionalString,
  workStationId:    optionalString,
  assignedTo:       optionalString,
  estimatedMinutes: z.string().optional().or(z.literal("")),
  dueAt:            optionalString,
});

export async function updateStage(slug: string, stageId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "production:manage");
  const stage = await loadStage(ctx.tenant.id, stageId);
  if (!stage) return;

  const parsed = updateStageSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const d = parsed.data;

  const assigneeId = await validAssignee(ctx.tenant.id, empty(d.assignedTo));
  const departmentId = await resolveDepartment(ctx.tenant.id, empty(d.departmentId));
  const workStationId = await resolveWorkStation(ctx.tenant.id, empty(d.workStationId));

  const estimatedMinutes = (() => {
    if (!d.estimatedMinutes) return null;
    const n = Number(d.estimatedMinutes);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  })();

  const prevAssignee = stage.assigneeId;
  const assigneeChanged = prevAssignee !== assigneeId;

  await db.productionStage.update({
    where: { id: stage.id },
    data: {
      title:            d.title,
      description:      empty(d.description),
      departmentId,
      workStationId,
      assigneeId,
      estimatedMinutes,
      dueAt:            d.dueAt ? new Date(d.dueAt) : null,
    },
  });

  if (assigneeChanged && assigneeId && assigneeId !== ctx.userId) {
    await notify({
      tenantId:   ctx.tenant.id,
      userId:     assigneeId,
      type:       "stage.assigned",
      title:      `Stage assigned: ${d.title}`,
      body:       `${stage.order.number}${stage.department?.name ? ` · ${stage.department.name}` : ""}`,
      entityType: "ProductionStage",
      entityId:   stage.id,
      link:       `/t/${slug}/orders/${stage.orderId}`,
    });
  }

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "stage.updated",
    entityType: "ProductionStage",
    entityId:   stage.id,
    metadata:   { orderId: stage.orderId, title: d.title },
  });

  revalidateOrderSurfaces(slug, stage.orderId);
}

// ────────────────────────────────────────────────────────────
// Start / pause / complete / block / reopen.
//
// These are the "primary action" buttons on the board and the order
// detail page. Each one stamps the appropriate timestamp + actor so
// the audit log can reconstruct "Ben ran the plotter from 9:14 to
// 9:52". We keep them as separate actions rather than one generic
// setStageStatus so the UI can attach distinct copy, and so each
// mutation has a small, obvious blast radius.
// ────────────────────────────────────────────────────────────

export async function startStage(slug: string, stageId: string) {
  const ctx = await requirePermission(slug, "production:manage");
  const stage = await loadStage(ctx.tenant.id, stageId);
  if (!stage) return;
  if (!canTransition(stage.status, "ACTIVE")) return;

  await db.productionStage.update({
    where: { id: stage.id },
    data: {
      status:        "ACTIVE",
      startedAt:     stage.startedAt ?? new Date(), // preserve original start across pause/resume
      startedBy:     stage.startedBy ?? ctx.userId,
      // Clear block info when resuming from BLOCKED.
      blockedAt:     null,
      blockedReason: null,
      // If nobody's assigned yet, the person who hit Start claims it.
      assigneeId:    stage.assigneeId ?? ctx.userId,
    },
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "stage.started",
    entityType: "ProductionStage",
    entityId:   stage.id,
    metadata:   { orderId: stage.orderId, prevStatus: stage.status },
  });

  revalidateOrderSurfaces(slug, stage.orderId);
}

// Pause = back to PENDING. Keeps the started/startedBy stamp so we know
// who initially picked it up, but clears active state.
export async function pauseStage(slug: string, stageId: string) {
  const ctx = await requirePermission(slug, "production:manage");
  const stage = await loadStage(ctx.tenant.id, stageId);
  if (!stage) return;
  if (!canTransition(stage.status, "PENDING")) return;

  await db.productionStage.update({
    where: { id: stage.id },
    data:  { status: "PENDING" },
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "stage.paused",
    entityType: "ProductionStage",
    entityId:   stage.id,
  });

  revalidateOrderSurfaces(slug, stage.orderId);
}

const blockStageSchema = z.object({
  reason: z.string().min(1).max(500),
});

export async function blockStage(slug: string, stageId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "production:manage");
  const stage = await loadStage(ctx.tenant.id, stageId);
  if (!stage) return;
  if (!canTransition(stage.status, "BLOCKED")) return;

  const parsed = blockStageSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  await db.productionStage.update({
    where: { id: stage.id },
    data: {
      status:        "BLOCKED",
      blockedAt:     new Date(),
      blockedReason: parsed.data.reason,
    },
  });

  // Tell the people who care: production manager, order creator, the
  // stage's current assignee. Skip self.
  const recipients = [
    stage.order.productionManagerId,
    stage.order.createdBy,
    stage.assigneeId,
  ];
  await notifyMany(
    recipients,
    {
      tenantId:   ctx.tenant.id,
      type:       "stage.blocked",
      title:      `Blocked: ${stage.title}`,
      body:       `${stage.order.number} · ${parsed.data.reason}`,
      entityType: "ProductionStage",
      entityId:   stage.id,
      link:       `/t/${slug}/orders/${stage.orderId}`,
    },
    { excludeUserId: ctx.userId },
  );

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "stage.blocked",
    entityType: "ProductionStage",
    entityId:   stage.id,
    metadata:   { reason: parsed.data.reason },
  });

  revalidateOrderSurfaces(slug, stage.orderId);
}

export async function completeStage(slug: string, stageId: string) {
  const ctx = await requirePermission(slug, "production:manage");
  const stage = await loadStage(ctx.tenant.id, stageId);
  if (!stage) return;
  if (!canTransition(stage.status, "DONE")) return;

  await db.productionStage.update({
    where: { id: stage.id },
    data: {
      status:      "DONE",
      completedAt: new Date(),
      completedBy: ctx.userId,
      // If the stage was never started (skipped ahead manually), stamp
      // startedAt too so duration math doesn't blow up.
      startedAt:   stage.startedAt ?? new Date(),
      startedBy:   stage.startedBy ?? ctx.userId,
    },
  });

  // When this stage finishes, the next pending stage in the sequence
  // is implicitly "ready to go" — notify its assignee so they know
  // they're up. We don't auto-start to avoid silently claiming work
  // from an absent technician.
  const next = await db.productionStage.findFirst({
    where:   {
      tenantId:  ctx.tenant.id,
      orderId:   stage.orderId,
      status:    "PENDING",
      sortOrder: { gt: stage.sortOrder },
    },
    orderBy: { sortOrder: "asc" },
    include: { department: { select: { name: true } } },
  });
  if (next?.assigneeId && next.assigneeId !== ctx.userId) {
    await notify({
      tenantId:   ctx.tenant.id,
      userId:     next.assigneeId,
      type:       "stage.ready",
      title:      `Ready to start: ${next.title}`,
      body:       `${stage.order.number}${next.department?.name ? ` · ${next.department.name}` : ""}`,
      entityType: "ProductionStage",
      entityId:   next.id,
      link:       `/t/${slug}/orders/${stage.orderId}`,
    });
  }

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "stage.completed",
    entityType: "ProductionStage",
    entityId:   stage.id,
    metadata:   { orderId: stage.orderId, title: stage.title },
  });

  // If ALL stages are DONE or SKIPPED, flip the order to READY. We
  // only bump NEW/IN_PRODUCTION → READY; we never regress or touch a
  // terminal state (CANCELED, COMPLETED).
  await maybeAdvanceOrder(ctx.tenant.id, stage.orderId);

  revalidateOrderSurfaces(slug, stage.orderId);
}

export async function skipStage(slug: string, stageId: string) {
  const ctx = await requirePermission(slug, "production:manage");
  const stage = await loadStage(ctx.tenant.id, stageId);
  if (!stage) return;
  if (!canTransition(stage.status, "SKIPPED")) return;

  await db.productionStage.update({
    where: { id: stage.id },
    data:  { status: "SKIPPED" },
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "stage.skipped",
    entityType: "ProductionStage",
    entityId:   stage.id,
  });

  await maybeAdvanceOrder(ctx.tenant.id, stage.orderId);
  revalidateOrderSurfaces(slug, stage.orderId);
}

export async function reopenStage(slug: string, stageId: string) {
  const ctx = await requirePermission(slug, "production:manage");
  const stage = await loadStage(ctx.tenant.id, stageId);
  if (!stage) return;
  if (!canTransition(stage.status, "ACTIVE")) return;

  await db.productionStage.update({
    where: { id: stage.id },
    data:  {
      status:      "ACTIVE",
      completedAt: null,
      completedBy: null,
    },
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "stage.reopened",
    entityType: "ProductionStage",
    entityId:   stage.id,
  });

  revalidateOrderSurfaces(slug, stage.orderId);
}

// ────────────────────────────────────────────────────────────
// Delete — reserved for the "oops, wrong stage" path. Never deletes
// a stage that's mid-work; operator should explicitly reset it first.
// ────────────────────────────────────────────────────────────

export async function deleteStage(slug: string, stageId: string) {
  const ctx = await requirePermission(slug, "production:manage");
  const stage = await loadStage(ctx.tenant.id, stageId);
  if (!stage) return;
  if (stage.status === "ACTIVE" || stage.status === "DONE") return;

  await db.productionStage.delete({ where: { id: stage.id } });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "stage.deleted",
    entityType: "ProductionStage",
    entityId:   stage.id,
    metadata:   { orderId: stage.orderId, title: stage.title },
  });

  revalidateOrderSurfaces(slug, stage.orderId);
}

// ────────────────────────────────────────────────────────────
// Order rollup — when all stages are closed (DONE or SKIPPED), bump
// the order to READY. We don't touch IN_PRODUCTION vs NEW here; the
// existing order status machinery handles that.
// ────────────────────────────────────────────────────────────

async function maybeAdvanceOrder(tenantId: string, orderId: string) {
  const order = await db.order.findFirst({
    where:  { id: orderId, tenantId },
    select: { id: true, status: true },
  });
  if (!order) return;
  // Only advance from active pre-install states. READY can be reached
  // from NEW or IN_PRODUCTION; anything else (READY, OUT_FOR_INSTALL,
  // COMPLETED, CANCELED) we leave alone.
  if (order.status !== "NEW" && order.status !== "IN_PRODUCTION") return;

  const stages = await db.productionStage.findMany({
    where:  { tenantId, orderId },
    select: { status: true },
  });
  if (stages.length === 0) return;

  const allClosed = stages.every((s) => s.status === "DONE" || s.status === "SKIPPED");
  if (allClosed) {
    await db.order.update({
      where: { id: orderId },
      data:  { status: "READY", readyAt: new Date() },
    });
  }
}

// ────────────────────────────────────────────────────────────
// Defect reports — quality control log.
// ────────────────────────────────────────────────────────────

const createDefectSchema = z.object({
  stageId:  optionalString,
  severity: z.enum(["MINOR", "MAJOR", "CRITICAL"]).default("MINOR"),
  cause:    optionalString,
  notes:    z.string().min(1).max(2000),
});

export async function reportDefect(slug: string, orderId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "production:manage");
  const order = await assertOrder(ctx.tenant.id, orderId);
  if (!order) return;

  const parsed = createDefectSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/orders/${orderId}?error=${encodeURIComponent("Defect notes are required.")}`);
  }
  const d = parsed.data;

  // Stage is optional but must belong to this order if supplied.
  const stageId = await resolveStageOnOrder(ctx.tenant.id, orderId, empty(d.stageId));

  const defect = await db.defectReport.create({
    data: {
      tenantId:   ctx.tenant.id,
      orderId,
      stageId,
      severity:   d.severity,
      cause:      empty(d.cause),
      notes:      d.notes,
      reportedBy: ctx.userId,
    },
  });

  // MAJOR/CRITICAL defects ping the PM + order creator. MINOR is just logged.
  if (d.severity !== "MINOR") {
    await notifyMany(
      [order.productionManagerId, order.createdBy],
      {
        tenantId:   ctx.tenant.id,
        type:       "defect.reported",
        title:      `${d.severity === "CRITICAL" ? "Critical" : "Major"} defect on ${order.number}`,
        body:       d.notes.slice(0, 180),
        entityType: "DefectReport",
        entityId:   defect.id,
        link:       `/t/${slug}/orders/${orderId}`,
      },
      { excludeUserId: ctx.userId },
    );
  }

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "defect.reported",
    entityType: "DefectReport",
    entityId:   defect.id,
    metadata:   { orderId, severity: d.severity, stageId },
  });

  revalidateOrderSurfaces(slug, orderId);
}

const resolveDefectSchema = z.object({
  resolution: z.string().min(1).max(2000),
});

export async function resolveDefect(slug: string, defectId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "production:manage");
  const defect = await db.defectReport.findFirst({
    where:  { id: defectId, tenantId: ctx.tenant.id },
    select: { id: true, orderId: true, resolvedAt: true },
  });
  if (!defect || defect.resolvedAt) return;

  const parsed = resolveDefectSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  await db.defectReport.update({
    where: { id: defect.id },
    data: {
      resolvedAt: new Date(),
      resolvedBy: ctx.userId,
      resolution: parsed.data.resolution,
    },
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "defect.resolved",
    entityType: "DefectReport",
    entityId:   defect.id,
    metadata:   { orderId: defect.orderId },
  });

  revalidateOrderSurfaces(slug, defect.orderId);
}

// ────────────────────────────────────────────────────────────
// Material usage — light inventory logging.
// ────────────────────────────────────────────────────────────

const logMaterialSchema = z.object({
  stageId:  optionalString,
  material: z.string().min(1).max(200),
  quantity: z.string().min(1).max(20),
  unit:     z.string().min(1).max(20),
  wastePct: z.string().optional().or(z.literal("")),
  notes:    optionalLong,
});

export async function logMaterialUsage(slug: string, orderId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "production:manage");
  const order = await assertOrder(ctx.tenant.id, orderId);
  if (!order) return;

  const parsed = logMaterialSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/orders/${orderId}?error=${encodeURIComponent("Material name, quantity, and unit are required.")}`);
  }
  const d = parsed.data;

  const qty = Number(d.quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    redirect(`/t/${slug}/orders/${orderId}?error=${encodeURIComponent("Quantity must be a positive number.")}`);
  }

  const wastePct = (() => {
    if (!d.wastePct || d.wastePct.length === 0) return null;
    const n = Number(d.wastePct);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(100, Math.round(n)));
  })();

  const stageId = await resolveStageOnOrder(ctx.tenant.id, orderId, empty(d.stageId));

  const usage = await db.materialUsage.create({
    data: {
      tenantId: ctx.tenant.id,
      orderId,
      stageId,
      material: d.material,
      quantity: qty,
      unit:     d.unit,
      wastePct,
      notes:    empty(d.notes),
      loggedBy: ctx.userId,
    },
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "material.logged",
    entityType: "MaterialUsage",
    entityId:   usage.id,
    metadata:   { orderId, material: d.material, quantity: qty, unit: d.unit },
  });

  revalidateOrderSurfaces(slug, orderId);
}

export async function deleteMaterialUsage(slug: string, usageId: string) {
  const ctx = await requirePermission(slug, "production:manage");
  const usage = await db.materialUsage.findFirst({
    where:  { id: usageId, tenantId: ctx.tenant.id },
    select: { id: true, orderId: true, material: true },
  });
  if (!usage) return;

  await db.materialUsage.delete({ where: { id: usage.id } });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "material.deleted",
    entityType: "MaterialUsage",
    entityId:   usage.id,
    metadata:   { orderId: usage.orderId, material: usage.material },
  });

  revalidateOrderSurfaces(slug, usage.orderId);
}
