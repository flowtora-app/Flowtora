"use server";

// Page 60 — Database Health actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import type { DbVacuumKind } from "@prisma/client";

const ROUTE = "/platform/system/database";
const PERM_MANAGE = "database.manage" as const;

/* ── Kill session (typed confirm) ─────────────────────── */

const killSessionSchema = z.object({
  id:       z.string().min(1),
  confirm:  z.string().min(1),
  expected: z.string().min(1),
});

export async function killSession(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = killSessionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=connections&error=Invalid`);
  const d = parsed.data;
  if (d.confirm !== d.expected) {
    redirect(`${ROUTE}?tab=connections&error=${encodeURIComponent(`Confirm phrase must equal "${d.expected}"`)}`);
  }
  const s = await db.dbSession.findUnique({ where: { id: d.id }, select: { pid: true, instanceId: true } });
  if (!s) redirect(`${ROUTE}?tab=connections&error=Not-found`);
  await db.dbSession.delete({ where: { id: d.id } });
  // Bump connection count.
  await db.dbInstance.update({
    where: { id: s!.instanceId },
    data: { connectionsUsed: { decrement: 1 } },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.database.session_killed",
    entityType: "DbSession", entityId: d.id,
    metadata: { actor: ctx.email, pid: s!.pid },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=connections&ok=session-killed`);
}

/* ── Kill all stale idle-in-transaction ────────────────── */

const killStaleSchema = z.object({
  instanceId: z.string().min(1),
  confirm:    z.string().min(1),
});

export async function killAllStale(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = killStaleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=connections&error=Invalid`);
  if (parsed.data.confirm !== "KILL-STALE") {
    redirect(`${ROUTE}?tab=connections&error=${encodeURIComponent(`Confirm phrase must equal "KILL-STALE"`)}`);
  }
  const stale = await db.dbSession.findMany({
    where: { instanceId: parsed.data.instanceId, staleIdle: true },
    select: { id: true },
  });
  if (stale.length > 0) {
    await db.dbSession.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
    await db.dbInstance.update({
      where: { id: parsed.data.instanceId },
      data: { connectionsUsed: { decrement: stale.length } },
    });
  }
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.database.stale_sessions_killed",
    entityType: "DbInstance", entityId: parsed.data.instanceId,
    metadata: { actor: ctx.email, killed: stale.length },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=connections&ok=stale-killed`);
}

/* ── Run vacuum / analyze ──────────────────────────────── */

const vacuumSchema = z.object({
  instanceId: z.string().min(1),
  tableName:  z.string().min(1).max(120),
  kind:       z.enum(["AUTO", "MANUAL", "FULL", "ANALYZE_ONLY"]),
});

export async function runVacuum(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = vacuumSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=vacuum&error=Invalid`);
  const d = parsed.data;
  const startedAt = new Date(Date.now() - 1000);
  const durationSec = Math.floor(Math.random() * 240) + 10;
  const rowsRemoved = Math.floor(Math.random() * 10_000);
  const completedAt = new Date(startedAt.getTime() + durationSec * 1000);
  const created = await db.dbVacuumRun.create({
    data: {
      instanceId: d.instanceId,
      kind: d.kind as DbVacuumKind,
      tableName: d.tableName,
      startedAt,
      completedAt,
      durationSec,
      rowsRemoved,
      rowsDead: Math.floor(rowsRemoved * 1.5),
      triggeredBy: ctx.userId,
    },
  });
  // Mark the table as freshly vacuumed.
  await db.dbTableStats.updateMany({
    where: { instanceId: d.instanceId, tableName: d.tableName },
    data: {
      lastVacuumAt: completedAt,
      lastAnalyzeAt: completedAt,
      vacuumOverdue: false,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.database.vacuum_run",
    entityType: "DbVacuumRun", entityId: created.id,
    metadata: { actor: ctx.email, table: d.tableName, kind: d.kind },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=vacuum&ok=vacuum-${d.kind.toLowerCase()}-${d.tableName}`);
}

/* ── Mark slow query reviewed ──────────────────────────── */

const reviewSchema = z.object({
  id:          z.string().min(1),
  reviewed:    z.union([z.literal("1"), z.literal("0")]),
  externalRef: z.string().max(60).optional(),
});

export async function markSlowQueryReviewed(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=slow&error=Invalid`);
  await db.dbSlowQuery.update({
    where: { id: parsed.data.id },
    data: {
      reviewed: parsed.data.reviewed === "1",
      externalRef: parsed.data.externalRef || null,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.database.slow_query_reviewed",
    entityType: "DbSlowQuery", entityId: parsed.data.id,
    metadata: { actor: ctx.email, reviewed: parsed.data.reviewed === "1" },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=slow&ok=slow-query-reviewed`);
}

/* ── Mark index unused / used ──────────────────────────── */

const indexFlagSchema = z.object({
  id:     z.string().min(1),
  unused: z.union([z.literal("1"), z.literal("0")]),
});

export async function flagIndex(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = indexFlagSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=indexes&error=Invalid`);
  await db.dbIndexUsage.update({
    where: { id: parsed.data.id },
    data: { unused: parsed.data.unused === "1" },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=indexes&ok=index-flagged`);
}

/* ── Settings ──────────────────────────────────────────── */

const settingsSchema = z.object({
  connectionWarnPct:    z.coerce.number().int().min(1).max(100),
  replicationLagWarnSec: z.coerce.number().int().min(1).max(86400),
  slowQueryThresholdMs:  z.coerce.number().int().min(1).max(600_000),
  bufferHitTargetPct:    z.coerce.number().int().min(1).max(100),
  autoVacuumCadenceDays: z.coerce.number().int().min(1).max(60),
  notes:                 z.string().max(500).optional(),
});

export async function saveDbSettings(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=settings&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  await db.dbHealthSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      connectionWarnPct: d.connectionWarnPct,
      replicationLagWarnSec: d.replicationLagWarnSec,
      slowQueryThresholdMs: d.slowQueryThresholdMs,
      bufferHitTargetPct: d.bufferHitTargetPct,
      autoVacuumCadenceDays: d.autoVacuumCadenceDays,
      notes: d.notes || null,
      updatedById: ctx.userId,
    },
    update: {
      connectionWarnPct: d.connectionWarnPct,
      replicationLagWarnSec: d.replicationLagWarnSec,
      slowQueryThresholdMs: d.slowQueryThresholdMs,
      bufferHitTargetPct: d.bufferHitTargetPct,
      autoVacuumCadenceDays: d.autoVacuumCadenceDays,
      notes: d.notes || null,
      updatedById: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.database.settings_saved",
    entityType: "DbHealthSettings", entityId: "default",
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=settings&ok=settings-saved`);
}
