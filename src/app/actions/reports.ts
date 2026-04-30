"use server";

// Reports server actions — favorite / pin, schedule create/delete/pause.
//
// Saved-customizations (custom Report rows) are reserved for the
// future report builder; the actions below cover the surfaces the
// library + detail pages exercise today.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePlatformStaff, logPlatformAudit } from "@/lib/platform";

const NAME_LIMIT = 80;
const FILTERS_LIMIT = 4_000;

/* ── Per-user state: favorite + pin + lastViewedAt ─────────── */

const stateSchema = z.object({
  reportKey: z.string().min(1).max(120),
  isFavorite: z.union([z.literal("on"), z.literal("off")]).optional(),
  isPinned:   z.union([z.literal("on"), z.literal("off")]).optional(),
  touchLastViewed: z.union([z.literal("1"), z.literal("0")]).optional(),
});

export async function setReportUserState(formData: FormData) {
  const ctx = await requirePlatformStaff();
  const parsed = stateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const data: { isFavorite?: boolean; isPinned?: boolean; lastViewedAt?: Date } = {};
  if (parsed.data.isFavorite != null) data.isFavorite = parsed.data.isFavorite === "on";
  if (parsed.data.isPinned   != null) data.isPinned   = parsed.data.isPinned === "on";
  if (parsed.data.touchLastViewed === "1") data.lastViewedAt = new Date();

  await db.reportUserState.upsert({
    where: { userId_reportKey: { userId: ctx.userId, reportKey: parsed.data.reportKey } },
    update: data,
    create: { userId: ctx.userId, reportKey: parsed.data.reportKey, ...data },
  });

  revalidatePath("/platform/reports");
  revalidatePath(`/platform/reports/${parsed.data.reportKey}`);
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
