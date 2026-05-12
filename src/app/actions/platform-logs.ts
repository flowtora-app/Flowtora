"use server";

// Page 64 — Logs & Errors actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import type {
  LogSeverity,
  LogIssueStatus,
  LogIssueIgnoreType,
  LogAlertChannel,
  LogAlertStatus,
} from "@prisma/client";

const ROUTE = "/platform/system/logs";
const PERM_MANAGE  = "logs.manage" as const;
const PERM_RESOLVE = "logs.resolve" as const;

const SEVERITY_OPTS = ["DEBUG", "INFO", "WARN", "ERROR", "FATAL"] as const;
const STATUS_OPTS   = ["UNRESOLVED", "RESOLVED", "IGNORED"] as const;
const IGNORE_OPTS   = ["NONE", "UNTIL_VERSION", "UNTIL_N_EVENTS", "UNTIL_N_DAYS"] as const;
const CHANNEL_OPTS  = ["SLACK", "PAGERDUTY", "EMAIL", "WEBHOOK"] as const;
const ALERT_STATUS_OPTS = ["ACTIVE", "PAUSED", "FIRING"] as const;

/* ── Issues — resolve / assign / ignore ──────────────── */

const resolveSchema = z.object({
  id: z.string().min(1),
  note: z.string().max(500).optional(),
});

export async function resolveIssue(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_RESOLVE);
  const parsed = resolveSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const row = await db.logIssue.update({
    where: { id: parsed.data.id },
    data: {
      status: "RESOLVED",
      resolvedAt: new Date(),
      resolvedByEmail: ctx.email ?? null,
      resolvedNote: parsed.data.note || null,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.logs.issue_resolved",
    entityType: "LogIssue", entityId: row.id,
    metadata: { actor: ctx.email, title: row.title },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=errors&id=${row.id}&ok=resolved`);
}

export async function reopenIssue(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_RESOLVE);
  const parsed = z.object({ id: z.string().min(1) }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const row = await db.logIssue.update({
    where: { id: parsed.data.id },
    data: { status: "UNRESOLVED", resolvedAt: null, resolvedByEmail: null, resolvedNote: null, ignoreType: "NONE" },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.logs.issue_reopened",
    entityType: "LogIssue", entityId: row.id,
    metadata: { actor: ctx.email, title: row.title },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=errors&id=${row.id}&ok=reopened`);
}

const ignoreSchema = z.object({
  id: z.string().min(1),
  ignoreType: z.enum(IGNORE_OPTS),
  ignoreUntilVersion: z.string().max(60).optional(),
  ignoreUntilEvents: z.coerce.number().int().min(1).max(1_000_000).optional(),
  ignoreUntilDays: z.coerce.number().int().min(1).max(365).optional(),
});

export async function ignoreIssue(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_RESOLVE);
  const parsed = ignoreSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const d = parsed.data;
  const ignoreUntilDate = d.ignoreType === "UNTIL_N_DAYS" && d.ignoreUntilDays
    ? new Date(Date.now() + d.ignoreUntilDays * 86_400_000)
    : null;
  const row = await db.logIssue.update({
    where: { id: d.id },
    data: {
      status: d.ignoreType === "NONE" ? "UNRESOLVED" : "IGNORED",
      ignoreType: d.ignoreType as LogIssueIgnoreType,
      ignoreUntilVersion: d.ignoreType === "UNTIL_VERSION" ? (d.ignoreUntilVersion || null) : null,
      ignoreUntilEvents:  d.ignoreType === "UNTIL_N_EVENTS" ? (d.ignoreUntilEvents ?? null) : null,
      ignoreUntilDate,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.logs.issue_ignored",
    entityType: "LogIssue", entityId: row.id,
    metadata: { actor: ctx.email, type: d.ignoreType },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=errors&id=${row.id}&ok=ignored`);
}

const assignSchema = z.object({
  id: z.string().min(1),
  email: z.string().email().or(z.literal("")),
});

export async function assignIssue(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_RESOLVE);
  const parsed = assignSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const row = await db.logIssue.update({
    where: { id: parsed.data.id },
    data: { assigneeEmail: parsed.data.email ? parsed.data.email : null },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.logs.issue_assigned",
    entityType: "LogIssue", entityId: row.id,
    metadata: { actor: ctx.email, assignee: parsed.data.email || null },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=errors&id=${row.id}&ok=assigned`);
}

const linkSchema = z.object({
  id: z.string().min(1),
  linearUrl: z.string().url().or(z.literal("")),
});

export async function linkIssueToLinear(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_RESOLVE);
  const parsed = linkSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const row = await db.logIssue.update({
    where: { id: parsed.data.id },
    data: { linearUrl: parsed.data.linearUrl || null },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.logs.issue_linked",
    entityType: "LogIssue", entityId: row.id,
    metadata: { actor: ctx.email, url: parsed.data.linearUrl },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=errors&id=${row.id}&ok=linked`);
}

/* ── Saved queries ─────────────────────────────────────── */

const savedQuerySchema = z.object({
  id:          z.string().optional(),
  name:        z.string().min(1).max(120),
  description: z.string().max(300).optional(),
  query:       z.string().min(1).max(1000),
  team:        z.string().max(60).optional(),
  ownerEmail:  z.string().email().or(z.literal("")).optional(),
  pinned:      z.union([z.literal("on"), z.literal("")]).optional(),
  notifyChannel: z.enum([...CHANNEL_OPTS, ""]).optional(),
  notifyTarget:  z.string().max(200).optional(),
});

export async function saveSavedQuery(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = savedQuerySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid");
    redirect(`${ROUTE}?tab=saved&error=${msg}`);
  }
  const d = parsed.data;
  const owner = d.ownerEmail || ctx.email || null;
  const data = {
    name: d.name,
    description: d.description || null,
    query: d.query,
    team: d.team || null,
    ownerEmail: owner,
    pinned: d.pinned === "on",
    notifyChannel: d.notifyChannel ? (d.notifyChannel as LogAlertChannel) : null,
    notifyTarget: d.notifyTarget || null,
  };
  await db.logSavedQuery.upsert({
    where: { name_ownerEmail: { name: d.name, ownerEmail: owner ?? "" } },
    create: data,
    update: data,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.logs.query_saved",
    entityType: "LogSavedQuery", entityId: d.name,
    metadata: { actor: ctx.email, query: d.query },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=saved&ok=query-saved`);
}

const idSchema = z.object({ id: z.string().min(1) });

export async function deleteSavedQuery(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=saved&error=Invalid`);
  await db.logSavedQuery.delete({ where: { id: parsed.data.id } });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.logs.query_deleted",
    entityType: "LogSavedQuery", entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=saved&ok=query-deleted`);
}

/* ── Alerts ────────────────────────────────────────────── */

const alertSchema = z.object({
  id:           z.string().optional(),
  name:         z.string().min(1).max(120),
  description:  z.string().max(300).optional(),
  service:      z.string().max(60).optional(),
  severity:     z.enum([...SEVERITY_OPTS, ""]).optional(),
  query:        z.string().max(500).optional(),
  threshold:    z.coerce.number().int().min(1).max(1_000_000),
  windowMin:    z.coerce.number().int().min(1).max(1440),
  channel:      z.enum(CHANNEL_OPTS),
  channelTarget: z.string().min(1).max(300),
  status:       z.enum(ALERT_STATUS_OPTS),
  ownerEmail:   z.string().email().or(z.literal("")).optional(),
});

export async function saveAlert(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = alertSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid");
    redirect(`${ROUTE}?tab=alerts&error=${msg}`);
  }
  const d = parsed.data;
  const data = {
    name: d.name,
    description: d.description || null,
    service: d.service || null,
    severity: d.severity ? (d.severity as LogSeverity) : null,
    query: d.query || null,
    threshold: d.threshold,
    windowMin: d.windowMin,
    channel: d.channel as LogAlertChannel,
    channelTarget: d.channelTarget,
    status: d.status as LogAlertStatus,
    ownerEmail: d.ownerEmail || ctx.email || null,
  };
  await db.logAlert.upsert({
    where: { name: d.name },
    create: data,
    update: data,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.logs.alert_saved",
    entityType: "LogAlert", entityId: d.name,
    metadata: { actor: ctx.email, threshold: d.threshold, window: d.windowMin },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=alerts&ok=alert-saved`);
}

export async function deleteAlert(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=alerts&error=Invalid`);
  await db.logAlert.delete({ where: { id: parsed.data.id } });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.logs.alert_deleted",
    entityType: "LogAlert", entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=alerts&ok=alert-deleted`);
}

const alertStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(ALERT_STATUS_OPTS),
});

export async function setAlertStatus(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = alertStatusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=alerts&error=Invalid`);
  await db.logAlert.update({
    where: { id: parsed.data.id },
    data: { status: parsed.data.status as LogAlertStatus },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.logs.alert_status",
    entityType: "LogAlert", entityId: parsed.data.id,
    metadata: { actor: ctx.email, status: parsed.data.status },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=alerts&ok=status-saved`);
}

/* ── Settings ──────────────────────────────────────────── */

const settingsSchema = z.object({
  retentionDays:      z.coerce.number().int().min(1).max(3650),
  sampleRate:         z.coerce.number().min(0).max(1),
  defaultEnv:         z.string().min(1).max(40),
  sourcemapsEnabled:  z.union([z.literal("on"), z.literal("")]).optional(),
  autoGroupErrors:    z.union([z.literal("on"), z.literal("")]).optional(),
  autoResolveStaleDays: z.coerce.number().int().min(0).max(365),
  notes:              z.string().max(2000).optional(),
});

export async function saveLogSettings(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=settings&error=Invalid`);
  const d = parsed.data;
  const data = {
    retentionDays: d.retentionDays,
    sampleRate: d.sampleRate,
    defaultEnv: d.defaultEnv,
    sourcemapsEnabled: d.sourcemapsEnabled === "on",
    autoGroupErrors: d.autoGroupErrors === "on",
    autoResolveStaleDays: d.autoResolveStaleDays,
    notes: d.notes || null,
    updatedById: ctx.userId,
  };
  await db.logSettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...data },
    update: data,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.logs.settings_saved",
    entityType: "LogSettings", entityId: "default",
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=settings&ok=settings-saved`);
}
