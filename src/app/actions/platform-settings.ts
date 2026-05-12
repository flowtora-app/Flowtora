"use server";

// Page 65 — Platform Settings actions.
//
// One server action per section so the audit row records WHICH section
// was touched + the diff. All actions write a PlatformSettingsChange row.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import {
  FEATURE_DEFAULT_CATALOG,
  parseBusinessHours,
  parseFeatureDefaults,
  parseHolidays,
  WEEKDAYS,
} from "@/server/platform/platform-settings";
import type {
  SystemBannerVariant,
  FirstDayOfWeek,
  TimeFormat,
  MeasurementSystem,
} from "@prisma/client";

const ROUTE = "/platform/settings/general";
const PERM = "system.write_settings" as const;

const BANNER_VARIANTS = ["INFO", "SUCCESS", "WARNING", "DANGER"] as const;
const TIME_FORMATS    = ["TWELVE_HOUR", "TWENTY_FOUR_HOUR"] as const;
const FIRST_DAYS      = ["SUNDAY", "MONDAY"] as const;
const MEASUREMENTS    = ["IMPERIAL", "METRIC"] as const;

async function audit(args: {
  settingsId: string;
  actorEmail: string;
  section: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  note?: string;
}) {
  const changedFields = Array.from(new Set([
    ...Object.keys(args.before),
    ...Object.keys(args.after),
  ])).filter((k) => JSON.stringify(args.before[k]) !== JSON.stringify(args.after[k]));
  if (changedFields.length === 0) return;
  await db.platformSettingsChange.create({
    data: {
      settingsId: args.settingsId,
      actorEmail: args.actorEmail,
      section: args.section,
      changedFields,
      beforeJson: args.before as never,
      afterJson:  args.after as never,
      note: args.note ?? null,
    },
  });
}

async function ensureSettings() {
  const row = await db.platformSettings.findUnique({ where: { id: "default" } });
  if (row) return row;
  return db.platformSettings.create({ data: { id: "default" } });
}

/* ── Identity ──────────────────────────────────────────── */

const identitySchema = z.object({
  platformName:      z.string().min(1).max(120),
  platformShortName: z.string().min(1).max(60),
  tagline:           z.string().max(200).optional(),
  supportEmail:      z.string().email().or(z.literal("")).optional(),
  noreplyEmail:      z.string().email().or(z.literal("")).optional(),
  salesEmail:        z.string().email().or(z.literal("")).optional(),
  pressEmail:        z.string().email().or(z.literal("")).optional(),
  mailingAddress:    z.string().max(500).optional(),
  phoneNumber:       z.string().max(40).optional(),
});

export async function saveIdentity(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = identitySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid");
    redirect(`${ROUTE}?error=${msg}#identity`);
  }
  const d = parsed.data;
  const before = await ensureSettings();
  const data = {
    platformName: d.platformName,
    platformShortName: d.platformShortName,
    tagline: d.tagline || null,
    supportEmail: d.supportEmail || null,
    noreplyEmail: d.noreplyEmail || null,
    salesEmail:   d.salesEmail   || null,
    pressEmail:   d.pressEmail   || null,
    mailingAddress: d.mailingAddress || null,
    phoneNumber: d.phoneNumber || null,
    updatedByEmail: ctx.email ?? null,
  };
  const after = await db.platformSettings.update({ where: { id: "default" }, data });
  await audit({
    settingsId: "default",
    actorEmail: ctx.email ?? "platform",
    section: "identity",
    before: {
      platformName: before.platformName, platformShortName: before.platformShortName,
      tagline: before.tagline, supportEmail: before.supportEmail,
      noreplyEmail: before.noreplyEmail, salesEmail: before.salesEmail,
      pressEmail: before.pressEmail, mailingAddress: before.mailingAddress,
      phoneNumber: before.phoneNumber,
    },
    after: {
      platformName: after.platformName, platformShortName: after.platformShortName,
      tagline: after.tagline, supportEmail: after.supportEmail,
      noreplyEmail: after.noreplyEmail, salesEmail: after.salesEmail,
      pressEmail: after.pressEmail, mailingAddress: after.mailingAddress,
      phoneNumber: after.phoneNumber,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.settings.identity_saved",
    entityType: "PlatformSettings", entityId: "default",
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=identity-saved#identity`);
}

/* ── Defaults ──────────────────────────────────────────── */

const defaultsSchema = z.object({
  defaultTimezone:       z.string().min(1).max(80),
  defaultLanguage:       z.string().min(2).max(20),
  defaultCurrency:       z.string().min(3).max(3),
  defaultDateFormat:     z.string().min(4).max(40),
  defaultTimeFormat:     z.enum(TIME_FORMATS),
  defaultFirstDayOfWeek: z.enum(FIRST_DAYS),
  defaultMeasurement:    z.enum(MEASUREMENTS),
});

export async function saveDefaults(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = defaultsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid");
    redirect(`${ROUTE}?error=${msg}#defaults`);
  }
  const d = parsed.data;
  const before = await ensureSettings();
  const data = {
    defaultTimezone: d.defaultTimezone,
    defaultLanguage: d.defaultLanguage,
    defaultCurrency: d.defaultCurrency,
    defaultDateFormat: d.defaultDateFormat,
    defaultTimeFormat: d.defaultTimeFormat as TimeFormat,
    defaultFirstDayOfWeek: d.defaultFirstDayOfWeek as FirstDayOfWeek,
    defaultMeasurement: d.defaultMeasurement as MeasurementSystem,
    updatedByEmail: ctx.email ?? null,
  };
  const after = await db.platformSettings.update({ where: { id: "default" }, data });
  await audit({
    settingsId: "default", actorEmail: ctx.email ?? "platform", section: "defaults",
    before: {
      defaultTimezone: before.defaultTimezone, defaultLanguage: before.defaultLanguage,
      defaultCurrency: before.defaultCurrency, defaultDateFormat: before.defaultDateFormat,
      defaultTimeFormat: before.defaultTimeFormat, defaultFirstDayOfWeek: before.defaultFirstDayOfWeek,
      defaultMeasurement: before.defaultMeasurement,
    },
    after: {
      defaultTimezone: after.defaultTimezone, defaultLanguage: after.defaultLanguage,
      defaultCurrency: after.defaultCurrency, defaultDateFormat: after.defaultDateFormat,
      defaultTimeFormat: after.defaultTimeFormat, defaultFirstDayOfWeek: after.defaultFirstDayOfWeek,
      defaultMeasurement: after.defaultMeasurement,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.settings.defaults_saved",
    entityType: "PlatformSettings", entityId: "default",
    metadata: { actor: ctx.email, timezone: d.defaultTimezone, currency: d.defaultCurrency },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=defaults-saved#defaults`);
}

/* ── Business hours + holidays ─────────────────────────── */

export async function saveBusinessHours(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const before = await ensureSettings();
  // Build the business hours object from per-day inputs.
  const hours: Record<string, { open: string; close: string; closed: boolean }> = {};
  for (const w of WEEKDAYS) {
    const open  = String(formData.get(`hours_${w.key}_open`)  ?? "");
    const close = String(formData.get(`hours_${w.key}_close`) ?? "");
    const closed = formData.get(`hours_${w.key}_closed`) === "on";
    hours[w.key] = { open: open || "09:00", close: close || "17:00", closed };
  }
  // Parse holidays from a multi-line textarea: each line "YYYY-MM-DD,Name"
  const holidaysRaw = String(formData.get("holidays") ?? "");
  const holidays = holidaysRaw.split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [date, ...rest] = l.split(",");
      return { date: (date ?? "").trim(), name: rest.join(",").trim() };
    })
    .filter((h) => /^\d{4}-\d{2}-\d{2}$/.test(h.date) && h.name.length > 0);
  const data = {
    businessHoursJson: hours as never,
    holidaysJson: holidays as never,
    updatedByEmail: ctx.email ?? null,
  };
  await db.platformSettings.update({ where: { id: "default" }, data });
  await audit({
    settingsId: "default", actorEmail: ctx.email ?? "platform", section: "business_hours",
    before: { businessHours: before.businessHoursJson, holidays: before.holidaysJson },
    after:  { businessHours: hours, holidays },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.settings.business_hours_saved",
    entityType: "PlatformSettings", entityId: "default",
    metadata: { actor: ctx.email, holidayCount: holidays.length },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=business-hours-saved#business-hours`);
}

/* ── Maintenance ──────────────────────────────────────── */

const maintenanceSchema = z.object({
  maintenanceMode:       z.union([z.literal("on"), z.literal("")]).optional(),
  maintenanceMessage:    z.string().max(2000).optional(),
  maintenanceEta:        z.string().optional(),
  maintenanceAllowedIps: z.string().max(2000).optional(),
});

export async function saveMaintenance(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = maintenanceSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid#maintenance`);
  const d = parsed.data;
  const before = await ensureSettings();
  const ips = (d.maintenanceAllowedIps ?? "")
    .split(/[,\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 60);
  let eta: Date | null = null;
  if (d.maintenanceEta && d.maintenanceEta.trim()) {
    const t = new Date(d.maintenanceEta);
    if (!Number.isNaN(t.getTime())) eta = t;
  }
  const data = {
    maintenanceMode: d.maintenanceMode === "on",
    maintenanceMessage: d.maintenanceMessage || null,
    maintenanceEta: eta,
    maintenanceAllowedIps: ips,
    updatedByEmail: ctx.email ?? null,
  };
  const after = await db.platformSettings.update({ where: { id: "default" }, data });
  await audit({
    settingsId: "default", actorEmail: ctx.email ?? "platform", section: "maintenance",
    before: {
      maintenanceMode: before.maintenanceMode,
      maintenanceMessage: before.maintenanceMessage,
      maintenanceEta: before.maintenanceEta,
      maintenanceAllowedIps: before.maintenanceAllowedIps,
    },
    after: {
      maintenanceMode: after.maintenanceMode,
      maintenanceMessage: after.maintenanceMessage,
      maintenanceEta: after.maintenanceEta,
      maintenanceAllowedIps: after.maintenanceAllowedIps,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.settings.maintenance_saved",
    entityType: "PlatformSettings", entityId: "default",
    metadata: { actor: ctx.email, mode: data.maintenanceMode, eta: eta?.toISOString() ?? null },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=maintenance-saved#maintenance`);
}

/* ── Signup & Trial ────────────────────────────────────── */

const signupSchema = z.object({
  publicSignupEnabled:    z.union([z.literal("on"), z.literal("")]).optional(),
  defaultTrialLengthDays: z.coerce.number().int().min(0).max(60),
  requireCardForTrial:    z.union([z.literal("on"), z.literal("")]).optional(),
  defaultSignupPlan:      z.string().min(1).max(40),
  blockDisposableEmails:  z.union([z.literal("on"), z.literal("")]).optional(),
});

export async function saveSignup(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = signupSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid");
    redirect(`${ROUTE}?error=${msg}#signup`);
  }
  const d = parsed.data;
  const before = await ensureSettings();
  const data = {
    publicSignupEnabled: d.publicSignupEnabled === "on",
    defaultTrialLengthDays: d.defaultTrialLengthDays,
    requireCardForTrial: d.requireCardForTrial === "on",
    defaultSignupPlan: d.defaultSignupPlan,
    blockDisposableEmails: d.blockDisposableEmails === "on",
    updatedByEmail: ctx.email ?? null,
  };
  const after = await db.platformSettings.update({ where: { id: "default" }, data });
  await audit({
    settingsId: "default", actorEmail: ctx.email ?? "platform", section: "signup",
    before: {
      publicSignupEnabled: before.publicSignupEnabled,
      defaultTrialLengthDays: before.defaultTrialLengthDays,
      requireCardForTrial: before.requireCardForTrial,
      defaultSignupPlan: before.defaultSignupPlan,
      blockDisposableEmails: before.blockDisposableEmails,
    },
    after: {
      publicSignupEnabled: after.publicSignupEnabled,
      defaultTrialLengthDays: after.defaultTrialLengthDays,
      requireCardForTrial: after.requireCardForTrial,
      defaultSignupPlan: after.defaultSignupPlan,
      blockDisposableEmails: after.blockDisposableEmails,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.settings.signup_saved",
    entityType: "PlatformSettings", entityId: "default",
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=signup-saved#signup`);
}

/* ── Session & Security ────────────────────────────────── */

const sessionSchema = z.object({
  adminSessionLifetimeMin: z.coerce.number().int().min(15).max(43200),
  idleTimeoutMin:          z.coerce.number().int().min(1).max(1440),
  concurrentAdminSessions: z.coerce.number().int().min(1).max(50),
  forceMfaForAdmins:       z.union([z.literal("on"), z.literal("")]).optional(),
});

export async function saveSession(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = sessionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid");
    redirect(`${ROUTE}?error=${msg}#session`);
  }
  const d = parsed.data;
  const before = await ensureSettings();
  const data = {
    adminSessionLifetimeMin: d.adminSessionLifetimeMin,
    idleTimeoutMin: d.idleTimeoutMin,
    concurrentAdminSessions: d.concurrentAdminSessions,
    forceMfaForAdmins: d.forceMfaForAdmins === "on",
    updatedByEmail: ctx.email ?? null,
  };
  const after = await db.platformSettings.update({ where: { id: "default" }, data });
  await audit({
    settingsId: "default", actorEmail: ctx.email ?? "platform", section: "session",
    before: {
      adminSessionLifetimeMin: before.adminSessionLifetimeMin,
      idleTimeoutMin: before.idleTimeoutMin,
      concurrentAdminSessions: before.concurrentAdminSessions,
      forceMfaForAdmins: before.forceMfaForAdmins,
    },
    after: {
      adminSessionLifetimeMin: after.adminSessionLifetimeMin,
      idleTimeoutMin: after.idleTimeoutMin,
      concurrentAdminSessions: after.concurrentAdminSessions,
      forceMfaForAdmins: after.forceMfaForAdmins,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.settings.session_saved",
    entityType: "PlatformSettings", entityId: "default",
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=session-saved#session`);
}

/* ── Communication preferences ─────────────────────────── */

const commSchema = z.object({
  defaultSenderName:       z.string().min(1).max(120),
  defaultReplyTo:          z.string().email().or(z.literal("")).optional(),
  systemBannerText:        z.string().max(500).optional(),
  systemBannerVariant:     z.enum(BANNER_VARIANTS),
  systemBannerDismissable: z.union([z.literal("on"), z.literal("")]).optional(),
  systemBannerExpiresAt:   z.string().optional(),
});

export async function saveCommunication(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = commSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid");
    redirect(`${ROUTE}?error=${msg}#communication`);
  }
  const d = parsed.data;
  const before = await ensureSettings();
  let expires: Date | null = null;
  if (d.systemBannerExpiresAt && d.systemBannerExpiresAt.trim()) {
    const t = new Date(d.systemBannerExpiresAt);
    if (!Number.isNaN(t.getTime())) expires = t;
  }
  const data = {
    defaultSenderName: d.defaultSenderName,
    defaultReplyTo: d.defaultReplyTo || null,
    systemBannerText: d.systemBannerText || null,
    systemBannerVariant: d.systemBannerVariant as SystemBannerVariant,
    systemBannerDismissable: d.systemBannerDismissable === "on",
    systemBannerExpiresAt: expires,
    updatedByEmail: ctx.email ?? null,
  };
  const after = await db.platformSettings.update({ where: { id: "default" }, data });
  await audit({
    settingsId: "default", actorEmail: ctx.email ?? "platform", section: "communication",
    before: {
      defaultSenderName: before.defaultSenderName,
      defaultReplyTo: before.defaultReplyTo,
      systemBannerText: before.systemBannerText,
      systemBannerVariant: before.systemBannerVariant,
      systemBannerDismissable: before.systemBannerDismissable,
      systemBannerExpiresAt: before.systemBannerExpiresAt,
    },
    after: {
      defaultSenderName: after.defaultSenderName,
      defaultReplyTo: after.defaultReplyTo,
      systemBannerText: after.systemBannerText,
      systemBannerVariant: after.systemBannerVariant,
      systemBannerDismissable: after.systemBannerDismissable,
      systemBannerExpiresAt: after.systemBannerExpiresAt,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.settings.communication_saved",
    entityType: "PlatformSettings", entityId: "default",
    metadata: { actor: ctx.email, bannerOn: !!data.systemBannerText },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=communication-saved#communication`);
}

/* ── Audit & Compliance ────────────────────────────────── */

const auditSettingsSchema = z.object({
  auditRetentionDays:    z.coerce.number().int().min(7).max(3650),
  anonymizePiiAfterDays: z.string().optional(),
});

export async function saveAuditCompliance(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = auditSettingsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid");
    redirect(`${ROUTE}?error=${msg}#audit`);
  }
  const d = parsed.data;
  const before = await ensureSettings();
  const anonymize = d.anonymizePiiAfterDays && d.anonymizePiiAfterDays.trim()
    ? Math.min(3650, Math.max(0, parseInt(d.anonymizePiiAfterDays, 10) || 0))
    : null;
  const data = {
    auditRetentionDays: d.auditRetentionDays,
    anonymizePiiAfterDays: anonymize,
    updatedByEmail: ctx.email ?? null,
  };
  const after = await db.platformSettings.update({ where: { id: "default" }, data });
  await audit({
    settingsId: "default", actorEmail: ctx.email ?? "platform", section: "audit",
    before: {
      auditRetentionDays: before.auditRetentionDays,
      anonymizePiiAfterDays: before.anonymizePiiAfterDays,
    },
    after: {
      auditRetentionDays: after.auditRetentionDays,
      anonymizePiiAfterDays: after.anonymizePiiAfterDays,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.settings.audit_saved",
    entityType: "PlatformSettings", entityId: "default",
    metadata: { actor: ctx.email, retentionDays: d.auditRetentionDays },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=audit-saved#audit`);
}

/* ── Feature defaults ──────────────────────────────────── */

export async function saveFeatureDefaults(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const before = await ensureSettings();
  const map: Record<string, boolean> = {};
  for (const f of FEATURE_DEFAULT_CATALOG) {
    map[f.key] = formData.get(`feat_${f.key}`) === "on";
  }
  const after = await db.platformSettings.update({
    where: { id: "default" },
    data: { featureDefaultsJson: map as never, updatedByEmail: ctx.email ?? null },
  });
  await audit({
    settingsId: "default", actorEmail: ctx.email ?? "platform", section: "feature_defaults",
    before: { features: parseFeatureDefaults(before.featureDefaultsJson) },
    after:  { features: parseFeatureDefaults(after.featureDefaultsJson) },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.settings.feature_defaults_saved",
    entityType: "PlatformSettings", entityId: "default",
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=feature-defaults-saved#features`);
}
