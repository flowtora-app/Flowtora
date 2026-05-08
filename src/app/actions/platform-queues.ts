"use server";

// Page 57 — Background Jobs / Queues actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import type {
  QueueStatus,
  QueueJobStatus,
  CronScheduleStatus,
} from "@prisma/client";

const ROUTE = "/platform/system/queues";
const PERM_READ = "queues.read" as const;
const PERM_MANAGE = "queues.manage" as const;

/* ── Queue actions ─────────────────────────────────────── */

const queueIdSchema = z.object({ id: z.string().min(1) });

async function setQueueStatus(id: string, status: QueueStatus, ctxEmail: string, userId: string) {
  await db.jobQueue.update({ where: { id }, data: { status } });
  await logPlatformAudit({
    userId, action: `platform.queue.${status.toLowerCase()}`,
    entityType: "JobQueue", entityId: id,
    metadata: { actor: ctxEmail, status },
  });
}

export async function pauseQueue(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = queueIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  await setQueueStatus(parsed.data.id, "PAUSED", ctx.email, ctx.userId);
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=queue-paused`);
}

export async function resumeQueue(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = queueIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  await setQueueStatus(parsed.data.id, "ACTIVE", ctx.email, ctx.userId);
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=queue-resumed`);
}

export async function drainQueue(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = queueIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  await setQueueStatus(parsed.data.id, "DRAINING", ctx.email, ctx.userId);
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=queue-draining`);
}

export async function flushQueue(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = queueIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  // Synthesize a flush — wipe waiting jobs for this queue's mirrored records.
  await db.queueJob.deleteMany({
    where: { queueId: parsed.data.id, status: { in: ["WAITING", "DELAYED"] } },
  });
  await db.jobQueue.update({
    where: { id: parsed.data.id },
    data: { waiting: 0, delayed: 0 },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.queue.flushed",
    entityType: "JobQueue", entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=queue-flushed`);
}

export async function replayFailedJobs(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = queueIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const failed = await db.queueJob.findMany({
    where: { queueId: parsed.data.id, status: "FAILED" },
    select: { id: true },
  });
  if (failed.length > 0) {
    await db.queueJob.updateMany({
      where: { id: { in: failed.map((f) => f.id) } },
      data: { status: "RETRYING", attempts: { increment: 1 } },
    });
    await db.jobQueue.update({
      where: { id: parsed.data.id },
      data: {
        failed24h: { decrement: failed.length },
        waiting: { increment: failed.length },
      },
    });
  }
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.queue.replay_failed",
    entityType: "JobQueue", entityId: parsed.data.id,
    metadata: { actor: ctx.email, replayed: failed.length },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=queue-replayed`);
}

const concSchema = z.object({ id: z.string().min(1), concurrency: z.coerce.number().int().min(1).max(10000) });

export async function setQueueConcurrency(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = concSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  await db.jobQueue.update({
    where: { id: parsed.data.id },
    data: { concurrency: parsed.data.concurrency },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.queue.concurrency_set",
    entityType: "JobQueue", entityId: parsed.data.id,
    metadata: { actor: ctx.email, concurrency: parsed.data.concurrency },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=concurrency-set`);
}

/* ── Job actions ───────────────────────────────────────── */

const jobIdSchema = z.object({ id: z.string().min(1) });

async function setJobStatus(id: string, status: QueueJobStatus, ctxEmail: string, userId: string) {
  const before = await db.queueJob.findUnique({ where: { id }, select: { status: true, queueId: true } });
  if (!before) return;
  const data: Record<string, unknown> = {
    status,
    deadLetteredAt: status === "DEAD_LETTER" ? new Date() : undefined,
    attempts: status === "RETRYING" ? { increment: 1 } : undefined,
  };
  await db.queueJob.update({ where: { id }, data });
  await logPlatformAudit({
    userId, action: `platform.queue.job_${status.toLowerCase()}`,
    entityType: "QueueJob", entityId: id,
    metadata: { actor: ctxEmail, status, prev: before.status },
  });
}

export async function retryJob(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = jobIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  await setJobStatus(parsed.data.id, "RETRYING", ctx.email, ctx.userId);
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=job-retried`);
}

export async function skipJob(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = jobIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  await setJobStatus(parsed.data.id, "SKIPPED", ctx.email, ctx.userId);
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=job-skipped`);
}

export async function deadLetterJob(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = jobIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  await setJobStatus(parsed.data.id, "DEAD_LETTER", ctx.email, ctx.userId);
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=job-dlq`);
}

export async function deleteJob(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = jobIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  await db.queueJob.delete({ where: { id: parsed.data.id } });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.queue.job_deleted",
    entityType: "QueueJob", entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=job-deleted`);
}

/* ── Worker actions ────────────────────────────────────── */

const workerIdSchema = z.object({ id: z.string().min(1) });

export async function restartWorker(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = workerIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  await db.queueWorker.update({
    where: { id: parsed.data.id },
    data: { status: "STARTING", lastHeartbeatAt: new Date() },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.queue.worker_restarted",
    entityType: "QueueWorker", entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=worker-restarted`);
}

/* ── Cron actions ──────────────────────────────────────── */

const cronToggleSchema = z.object({ id: z.string().min(1) });

export async function toggleCron(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = cronToggleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const c = await db.cronSchedule.findUnique({ where: { id: parsed.data.id } });
  if (!c) redirect(`${ROUTE}?error=Not-found`);
  const enabled = !c!.enabled;
  await db.cronSchedule.update({
    where: { id: parsed.data.id },
    data: { enabled, status: (enabled ? "ACTIVE" : "DISABLED") as CronScheduleStatus },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: enabled ? "platform.cron.enabled" : "platform.cron.disabled",
    entityType: "CronSchedule", entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=cron-${enabled ? "enabled" : "disabled"}`);
}

export async function runCronNow(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = cronToggleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const synthDuration = Math.floor(Math.random() * 1500) + 50;
  await db.cronSchedule.update({
    where: { id: parsed.data.id },
    data: {
      status: "ACTIVE", lastRunAt: new Date(),
      lastDurationMs: synthDuration,
      lastResult: "Manually triggered — synthesized success.",
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.cron.run_now",
    entityType: "CronSchedule", entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=cron-run`);
}

const cronSaveSchema = z.object({
  id:         z.string().optional(),
  slug:       z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
  name:       z.string().min(1).max(160),
  description: z.string().max(500).optional(),
  expression: z.string().min(1).max(120),
  ownerEmail: z.string().email().optional().or(z.literal("")),
  timezone:   z.string().max(40),
  queueId:    z.string().optional().or(z.literal("")),
  enabled:    z.union([z.literal("on"), z.literal("")]).optional(),
});

export async function saveCron(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = cronSaveSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=schedules&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const data = {
    name: d.name,
    description: d.description || null,
    expression: d.expression,
    ownerEmail: d.ownerEmail || null,
    timezone: d.timezone,
    queueId: d.queueId || null,
    enabled: d.enabled === "on",
    status: (d.enabled === "on" ? "ACTIVE" : "DISABLED") as CronScheduleStatus,
  };
  await db.cronSchedule.upsert({
    where: { slug: d.slug },
    create: { slug: d.slug, ...data },
    update: data,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.cron.saved",
    entityType: "CronSchedule", entityId: d.slug,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=schedules&ok=cron-saved`);
}
