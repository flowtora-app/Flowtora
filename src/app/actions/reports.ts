"use server";

// Reports server actions — favorite / pin, schedule create/delete/pause.
//
// Saved-customizations (custom Report rows) are reserved for the
// future report builder; the actions below cover the surfaces the
// library + detail pages exercise today.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePlatformStaff, logPlatformAudit } from "@/lib/platform";
import type { PlatformPermission } from "@/lib/rbac";
import { findReportByKey } from "@/server/platform/reports/registry";

// Reports & Insights actions enforce permission gates via
// `ctx.can("reports.*")`. The relevant permissions are:
//   • reports.read     — implicit via PLATFORM_BASELINE_READ
//   • reports.create   — fork prebuilt → custom Report
//   • reports.edit     — rename, share, revert version, set defaults
//   • reports.delete   — destroy a custom Report (owner-only too)
//   • reports.schedule — create / pause / delete schedules
//   • reports.export   — download CSV / JSON / PDF
//
// READ_ONLY_VIEWER + ANALYST get reports.read + .export but not the
// mutating ones, so an auditor can run + export every report
// without being able to change anyone's saved view.

const NAME_LIMIT = 80;
const FILTERS_LIMIT = 4_000;

/* ── Per-user state: favorite + pin + lastViewedAt + viewCount ───── */

const stateSchema = z.object({
  reportKey: z.string().min(1).max(120),
  isFavorite: z.union([z.literal("on"), z.literal("off")]).optional(),
  isPinned:   z.union([z.literal("on"), z.literal("off")]).optional(),
  touchLastViewed: z.union([z.literal("1"), z.literal("0")]).optional(),
  bumpViewCount:   z.union([z.literal("1"), z.literal("0")]).optional(),
});

export async function setReportUserState(formData: FormData) {
  const ctx = await requirePlatformStaff();
  const parsed = stateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const data: { isFavorite?: boolean; isPinned?: boolean; lastViewedAt?: Date; viewCount?: { increment: number } } = {};
  if (parsed.data.isFavorite != null) data.isFavorite = parsed.data.isFavorite === "on";
  if (parsed.data.isPinned   != null) data.isPinned   = parsed.data.isPinned === "on";
  if (parsed.data.touchLastViewed === "1") data.lastViewedAt = new Date();
  if (parsed.data.bumpViewCount === "1") data.viewCount = { increment: 1 };

  await db.reportUserState.upsert({
    where: { userId_reportKey: { userId: ctx.userId, reportKey: parsed.data.reportKey } },
    update: data,
    create: {
      userId: ctx.userId,
      reportKey: parsed.data.reportKey,
      isFavorite: data.isFavorite ?? false,
      isPinned:   data.isPinned ?? false,
      lastViewedAt: data.lastViewedAt ?? null,
      viewCount: parsed.data.bumpViewCount === "1" ? 1 : 0,
    },
  });

  revalidatePath("/platform/reports");
  revalidatePath(`/platform/reports/${parsed.data.reportKey}`);
  return { ok: true } as const;
}

/* ── Duplicate / share / delete / rename ─────────────────────── */

const dupeSchema = z.object({
  fromKey: z.string().min(1).max(120),
  name:    z.string().max(NAME_LIMIT).optional(),
  filters: z.string().max(FILTERS_LIMIT).optional(),
});

/** Fork a prebuilt registry entry into a new custom Report row.
 *  Redirects to the new custom report's detail page. */
export async function duplicateReport(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("reports.create")) return { ok: false, error: "Your role can't create reports" } as const;
  const parsed = dupeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
  const source = findReportByKey(parsed.data.fromKey);
  if (!source) return { ok: false, error: "Unknown source report" } as const;

  const created = await db.report.create({
    data: {
      key: source.key,
      name: parsed.data.name?.trim() || `${source.name} (copy)`,
      description: source.description,
      category: source.category,
      filters: parsed.data.filters ?? "",
      ownerUserId: ctx.userId,
      isShared: false,
    },
  });
  await db.reportVersion.create({
    data: {
      reportId: created.id,
      name: created.name,
      description: created.description,
      category: created.category,
      filters: created.filters,
      authorUserId: ctx.userId,
      note: `Forked from prebuilt ${source.key}`,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.report_duplicated",
    entityType: "Report",
    entityId: created.id,
    metadata: { actor: ctx.email, fromKey: source.key, name: created.name },
  });
  revalidatePath("/platform/reports");
  redirect(`/platform/reports/r/${created.id}`);
}

const renameSchema = z.object({
  reportId:    z.string().min(1),
  name:        z.string().min(1).max(NAME_LIMIT),
  description: z.string().max(2_000).optional(),
});

export async function renameReport(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("reports.edit")) return { ok: false, error: "Your role can't edit reports" } as const;
  const parsed = renameSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
  const r = await db.report.findUnique({
    where: { id: parsed.data.reportId },
    select: { id: true, ownerUserId: true, name: true, description: true, category: true, filters: true, chartConfig: true },
  });
  if (!r) return { ok: false, error: "Not found" } as const;
  if (r.ownerUserId !== ctx.userId) return { ok: false, error: "Forbidden" } as const;

  await db.$transaction(async (tx) => {
    // Snapshot the prior state as a version BEFORE updating.
    await tx.reportVersion.create({
      data: {
        reportId: r.id,
        name: r.name,
        description: r.description,
        category: r.category,
        filters: r.filters,
        chartConfig: r.chartConfig === null ? undefined : r.chartConfig,
        authorUserId: ctx.userId,
        note: "Auto-snapshot before rename",
      },
    });
    await tx.report.update({
      where: { id: r.id },
      data: {
        name:        parsed.data.name.trim(),
        description: parsed.data.description?.trim() ?? r.description,
      },
    });
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.report_renamed",
    entityType: "Report",
    entityId: r.id,
    metadata: { actor: ctx.email, from: r.name, to: parsed.data.name },
  });
  revalidatePath(`/platform/reports/r/${r.id}`);
  return { ok: true } as const;
}

const shareSchema = z.object({
  reportId: z.string().min(1),
  isShared: z.union([z.literal("on"), z.literal("off")]),
});

export async function setReportShared(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("reports.edit")) return { ok: false, error: "Your role can't edit reports" } as const;
  const parsed = shareSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
  const r = await db.report.findUnique({ where: { id: parsed.data.reportId }, select: { id: true, ownerUserId: true, name: true } });
  if (!r) return { ok: false, error: "Not found" } as const;
  if (r.ownerUserId !== ctx.userId) return { ok: false, error: "Forbidden" } as const;
  const isShared = parsed.data.isShared === "on";
  await db.report.update({ where: { id: r.id }, data: { isShared } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: isShared ? "platform.report_shared" : "platform.report_unshared",
    entityType: "Report",
    entityId: r.id,
    metadata: { actor: ctx.email, name: r.name },
  });
  revalidatePath(`/platform/reports/r/${r.id}`);
  return { ok: true } as const;
}

export async function deleteReport(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("reports.delete")) return { ok: false, error: "Your role can't delete reports" } as const;
  const id = String(formData.get("reportId") ?? formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "Missing id" } as const;
  const r = await db.report.findUnique({ where: { id }, select: { id: true, ownerUserId: true, name: true } });
  if (!r) return { ok: false, error: "Not found" } as const;
  if (r.ownerUserId !== ctx.userId) return { ok: false, error: "Forbidden" } as const;
  await db.report.delete({ where: { id } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.report_deleted",
    entityType: "Report",
    entityId: id,
    metadata: { actor: ctx.email, name: r.name },
  });
  revalidatePath("/platform/reports");
  redirect("/platform/reports");
}

/* ── Versioning ────────────────────────────────────────────── */

export async function revertReportVersion(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("reports.edit")) return { ok: false, error: "Your role can't edit reports" } as const;
  const versionId = String(formData.get("versionId") ?? "").trim();
  if (!versionId) return { ok: false, error: "Missing versionId" } as const;

  const v = await db.reportVersion.findUnique({
    where: { id: versionId },
    select: {
      id: true, reportId: true, name: true, description: true, category: true,
      filters: true, chartConfig: true,
      report: { select: { id: true, ownerUserId: true } },
    },
  });
  if (!v) return { ok: false, error: "Not found" } as const;
  if (v.report.ownerUserId !== ctx.userId) return { ok: false, error: "Forbidden" } as const;

  await db.$transaction(async (tx) => {
    // Snapshot the current live state before reverting so the user
    // can revert again if they change their mind.
    const live = await tx.report.findUnique({
      where: { id: v.reportId },
      select: { name: true, description: true, category: true, filters: true, chartConfig: true },
    });
    if (live) {
      await tx.reportVersion.create({
        data: {
          reportId: v.reportId,
          name: live.name,
          description: live.description,
          category: live.category,
          filters: live.filters,
          chartConfig: live.chartConfig === null ? undefined : live.chartConfig,
          authorUserId: ctx.userId,
          note: "Auto-snapshot before revert",
        },
      });
    }
    await tx.report.update({
      where: { id: v.reportId },
      data: {
        name:        v.name,
        description: v.description,
        category:    v.category,
        filters:     v.filters,
        chartConfig: v.chartConfig === null ? undefined : v.chartConfig,
      },
    });
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.report_version_reverted",
    entityType: "Report",
    entityId: v.reportId,
    metadata: { actor: ctx.email, versionId },
  });
  revalidatePath(`/platform/reports/r/${v.reportId}`);
  return { ok: true } as const;
}

/* ── Schedules ─────────────────────────────────────────────── */

const FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "CRON"] as const;
const FORMATS     = ["HTML_EMAIL", "CSV"] as const;

const scheduleCreateSchema = z.object({
  reportKey:  z.string().min(1).max(120),
  name:       z.string().min(1).max(NAME_LIMIT),
  recipients: z.string().min(1).max(2_000), // CSV
  filters:    z.string().max(FILTERS_LIMIT).optional(),
  format:     z.enum(FORMATS).default("HTML_EMAIL"),
  frequency:  z.enum(FREQUENCIES).default("DAILY"),
  dayOfWeek:  z.string().regex(/^\d+$/).optional(),
  dayOfMonth: z.string().regex(/^\d+$/).optional(),
  timeOfDay:  z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
  timezone:   z.string().max(64).optional(),
  cron:       z.string().max(120).optional(),
});

export async function createReportSchedule(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("reports.schedule")) return { ok: false, error: "Your role can't schedule report deliveries" } as const;
  const parsed = scheduleCreateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const recipientList = parsed.data.recipients.split(",").map((s) => s.trim()).filter(Boolean);
  if (recipientList.length === 0) return { ok: false, error: "At least one recipient" } as const;
  // Light shape check on each recipient.
  for (const r of recipientList) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r)) {
      return { ok: false, error: `Invalid recipient: ${r}` } as const;
    }
  }

  await db.reportSchedule.create({
    data: {
      reportKey:    parsed.data.reportKey,
      ownerUserId:  ctx.userId,
      name:         parsed.data.name.trim(),
      recipients:   recipientList.join(","),
      filters:      parsed.data.filters ?? "",
      format:       parsed.data.format,
      frequency:    parsed.data.frequency,
      dayOfWeek:    parsed.data.dayOfWeek  ? parseInt(parsed.data.dayOfWeek,  10) : null,
      dayOfMonth:   parsed.data.dayOfMonth ? parseInt(parsed.data.dayOfMonth, 10) : null,
      timeOfDay:    parsed.data.timeOfDay ?? "13:00",
      timezone:     parsed.data.timezone ?? "UTC",
      cronExpression: parsed.data.cron ?? null,
    },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.report_schedule_created",
    entityType: "ReportSchedule",
    metadata: {
      actor: ctx.email,
      reportKey: parsed.data.reportKey,
      recipients: recipientList,
      frequency: parsed.data.frequency,
      format: parsed.data.format,
    },
  });

  revalidatePath(`/platform/reports/${parsed.data.reportKey}`);
  return { ok: true } as const;
}

export async function deleteReportSchedule(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("reports.schedule")) return { ok: false, error: "Your role can't manage schedules" } as const;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "Missing id" } as const;

  const sch = await db.reportSchedule.findUnique({
    where: { id },
    select: { id: true, ownerUserId: true, name: true, reportKey: true },
  });
  if (!sch) return { ok: false, error: "Not found" } as const;
  if (sch.ownerUserId !== ctx.userId) return { ok: false, error: "Forbidden" } as const;

  await db.reportSchedule.delete({ where: { id } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.report_schedule_deleted",
    entityType: "ReportSchedule",
    entityId: id,
    metadata: { actor: ctx.email, name: sch.name, reportKey: sch.reportKey },
  });
  if (sch.reportKey) revalidatePath(`/platform/reports/${sch.reportKey}`);
  return { ok: true } as const;
}

export async function toggleReportSchedulePause(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("reports.schedule")) return { ok: false, error: "Your role can't manage schedules" } as const;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "Missing id" } as const;

  const sch = await db.reportSchedule.findUnique({
    where: { id },
    select: { id: true, ownerUserId: true, pausedAt: true, name: true, reportKey: true },
  });
  if (!sch) return { ok: false, error: "Not found" } as const;
  if (sch.ownerUserId !== ctx.userId) return { ok: false, error: "Forbidden" } as const;

  const nextPausedAt = sch.pausedAt ? null : new Date();
  await db.reportSchedule.update({ where: { id }, data: { pausedAt: nextPausedAt } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: nextPausedAt ? "platform.report_schedule_paused" : "platform.report_schedule_resumed",
    entityType: "ReportSchedule",
    entityId: id,
    metadata: { actor: ctx.email, name: sch.name },
  });
  if (sch.reportKey) revalidatePath(`/platform/reports/${sch.reportKey}`);
  return { ok: true } as const;
}
