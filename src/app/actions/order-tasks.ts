"use server";

// Phase 10 — order-scoped tasks + subtasks.
//
// We could have shoved these into `customers.ts` alongside the generic task
// actions, but order tasks are their own thing conceptually: they live on
// the order detail page, they can nest (parent → subtasks), and they tend
// to get assigned to production/install staff rather than the sales owner.
// Keeping them in a separate file makes the intent obvious and keeps the
// customers action surface from ballooning.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { notifyMany } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";

const optionalString = z.string().max(200).optional().or(z.literal(""));
const optionalLong   = z.string().max(4000).optional().or(z.literal(""));
const empty = (s: string | undefined) => (s && s.length > 0 ? s : null);

// Same helper as customers.ts — kept local so this file compiles standalone
// (no cross-file dependency on an internal helper that isn't exported).
async function validAssignee(tenantId: string, userId: string | null) {
  if (!userId) return null;
  const m = await db.membership.findFirst({
    where: { tenantId, userId, status: "ACTIVE" },
  });
  return m ? userId : null;
}

async function assertOrder(tenantId: string, orderId: string) {
  return db.order.findFirst({
    where:  { id: orderId, tenantId },
    select: { id: true, tenantId: true, number: true, locationId: true },
  });
}

// ────────────────────────────────────────────────────────────
// Create — top-level order task
// ────────────────────────────────────────────────────────────

const createTaskSchema = z.object({
  title:       z.string().min(1).max(200),
  description: optionalLong,
  assignedTo:  optionalString,
  dueDate:     optionalString, // YYYY-MM-DD
  priority:    z.enum(["LOW", "NORMAL", "HIGH"]).default("NORMAL"),
});

export async function createOrderTask(slug: string, orderId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "orders:manage");
  const order = await assertOrder(ctx.tenant.id, orderId);
  if (!order) return;

  const parsed = createTaskSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/orders/${orderId}?error=${encodeURIComponent("Task title is required.")}`);
  }

  const assignedTo = await validAssignee(ctx.tenant.id, empty(parsed.data.assignedTo));

  const task = await db.task.create({
    data: {
      tenantId:    ctx.tenant.id,
      orderId,
      assignedTo,
      createdBy:   ctx.userId,
      title:       parsed.data.title,
      description: empty(parsed.data.description),
      priority:    parsed.data.priority,
      dueDate:     parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    },
  });

  // Notify the assignee (excluding self). Deep-link back to the order so they
  // can see the surrounding context, not just the task title on /tasks.
  if (assignedTo) {
    await notifyMany(
      [assignedTo],
      {
        tenantId:   ctx.tenant.id,
        type:       "task.assigned",
        title:      `You were assigned a task on ${order.number}: ${task.title}`,
        body:       task.description,
        entityType: "Task",
        entityId:   task.id,
        link:       `/t/${slug}/orders/${orderId}`,
      },
      { excludeUserId: ctx.userId },
    );
  }

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "order_task.created",
    entityType: "Task",
    entityId:   task.id,
    metadata:   { orderId },
  });

  revalidatePath(`/t/${slug}/orders/${orderId}`);
  revalidatePath(`/t/${slug}/tasks`);
}

// ────────────────────────────────────────────────────────────
// Add subtask — nest under an existing order task
// ────────────────────────────────────────────────────────────
//
// Subtasks inherit the parent's orderId so they show up wherever the parent
// does (order detail, /tasks filtered by orderId). They can have their own
// assignee and due date — e.g. "Install Monday" (assigned to lead installer)
// has "Pick up permit" (assigned to admin, due Friday).

const addSubtaskSchema = z.object({
  title:      z.string().min(1).max(200),
  assignedTo: optionalString,
  dueDate:    optionalString,
  priority:   z.enum(["LOW", "NORMAL", "HIGH"]).default("NORMAL"),
});

export async function addSubtask(slug: string, parentTaskId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "orders:manage");

  const parent = await db.task.findFirst({
    where:  { id: parentTaskId, tenantId: ctx.tenant.id },
    select: { id: true, orderId: true, title: true },
  });
  if (!parent || !parent.orderId) return; // only nest under order tasks

  const parsed = addSubtaskSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/orders/${parent.orderId}?error=${encodeURIComponent("Subtask title is required.")}`);
  }

  const assignedTo = await validAssignee(ctx.tenant.id, empty(parsed.data.assignedTo));

  const sub = await db.task.create({
    data: {
      tenantId:     ctx.tenant.id,
      orderId:      parent.orderId,
      parentTaskId: parent.id,
      assignedTo,
      createdBy:    ctx.userId,
      title:        parsed.data.title,
      priority:     parsed.data.priority,
      dueDate:      parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    },
  });

  if (assignedTo) {
    await notifyMany(
      [assignedTo],
      {
        tenantId:   ctx.tenant.id,
        type:       "task.assigned",
        title:      `You were assigned a subtask: ${sub.title}`,
        body:       `Under: ${parent.title}`,
        entityType: "Task",
        entityId:   sub.id,
        link:       `/t/${slug}/orders/${parent.orderId}`,
      },
      { excludeUserId: ctx.userId },
    );
  }

  revalidatePath(`/t/${slug}/orders/${parent.orderId}`);
  revalidatePath(`/t/${slug}/tasks`);
}

// ────────────────────────────────────────────────────────────
// Reassign — change who owns an existing order task
// ────────────────────────────────────────────────────────────

const reassignSchema = z.object({
  assignedTo: optionalString, // "" = unassign
});

export async function updateTaskAssignment(slug: string, taskId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "orders:manage");

  const task = await db.task.findFirst({
    where:  { id: taskId, tenantId: ctx.tenant.id },
    select: { id: true, orderId: true, assignedTo: true, title: true },
  });
  if (!task || !task.orderId) return;

  const parsed = reassignSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const next = await validAssignee(ctx.tenant.id, empty(parsed.data.assignedTo));

  await db.task.update({
    where: { id: task.id },
    data:  { assignedTo: next },
  });

  // Only notify if the assignee actually changed and someone new is on the hook.
  if (next && next !== task.assignedTo) {
    await notifyMany(
      [next],
      {
        tenantId:   ctx.tenant.id,
        type:       "task.assigned",
        title:      `Task reassigned to you: ${task.title}`,
        entityType: "Task",
        entityId:   task.id,
        link:       `/t/${slug}/orders/${task.orderId}`,
      },
      { excludeUserId: ctx.userId },
    );
  }

  revalidatePath(`/t/${slug}/orders/${task.orderId}`);
  revalidatePath(`/t/${slug}/tasks`);
}

// ────────────────────────────────────────────────────────────
// Toggle complete
// ────────────────────────────────────────────────────────────
//
// Mirror of customers.ts toggleTask, but scoped to order tasks and
// revalidating the order page. We don't cascade-complete subtasks when
// a parent is completed — that's an opinion, and shops have different
// ones. Leaving it separate lets people check parents for reporting
// while subtasks keep their own state.

export async function toggleTaskComplete(slug: string, taskId: string) {
  const ctx = await requirePermission(slug, "orders:manage");

  const task = await db.task.findFirst({
    where:  { id: taskId, tenantId: ctx.tenant.id },
    select: { id: true, orderId: true, completedAt: true, createdBy: true, title: true },
  });
  if (!task || !task.orderId) return;

  const wasCompleted = !!task.completedAt;
  await db.task.update({
    where: { id: task.id },
    data:  { completedAt: wasCompleted ? null : new Date() },
  });

  // Notify the creator on completion (unless they did it themselves).
  if (!wasCompleted && task.createdBy) {
    await notifyMany(
      [task.createdBy],
      {
        tenantId:   ctx.tenant.id,
        type:       "task.completed",
        title:      `Task completed: ${task.title}`,
        entityType: "Task",
        entityId:   task.id,
        link:       `/t/${slug}/orders/${task.orderId}`,
      },
      { excludeUserId: ctx.userId },
    );
  }

  revalidatePath(`/t/${slug}/orders/${task.orderId}`);
  revalidatePath(`/t/${slug}/tasks`);
}

// ────────────────────────────────────────────────────────────
// Delete — cascade handled at the DB level via onDelete: Cascade
// on the self-relation, so deleting a parent drops its subtasks.
// ────────────────────────────────────────────────────────────

export async function deleteOrderTask(slug: string, taskId: string) {
  const ctx = await requirePermission(slug, "orders:manage");

  const task = await db.task.findFirst({
    where:  { id: taskId, tenantId: ctx.tenant.id },
    select: { id: true, orderId: true },
  });
  if (!task || !task.orderId) return;

  await db.task.delete({ where: { id: task.id } });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "order_task.deleted",
    entityType: "Task",
    entityId:   task.id,
    metadata:   { orderId: task.orderId },
  });

  revalidatePath(`/t/${slug}/orders/${task.orderId}`);
  revalidatePath(`/t/${slug}/tasks`);
}
