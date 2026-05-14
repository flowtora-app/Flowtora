"use server";

// Pages 72-75 — personal admin self-service actions.

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformStaff,
} from "@/lib/platform";
import type {
  AdminDensity,
  SidebarDefault,
  ThemePreference,
  AdminNotificationCategory,
  AdminNotificationChannel,
  AdminNotificationFrequency,
} from "@prisma/client";

const ROUTE_PROFILE       = "/platform/me/profile";
const ROUTE_NOTIFICATIONS = "/platform/me/notifications";
const ROUTE_KEYS          = "/platform/me/api-keys";
const ROUTE_SHORTCUTS     = "/platform/me/shortcuts";

/* ── Page 72 — Profile ────────────────────────────────── */

const profileSchema = z.object({
  name:           z.string().max(120).optional(),
  firstName:      z.string().max(80).optional(),
  lastName:       z.string().max(80).optional(),
  pronouns:       z.string().max(40).optional(),
  title:          z.string().max(120).optional(),
  department:     z.string().max(120).optional(),
  bio:            z.string().max(1000).optional(),
  phone:          z.string().max(40).optional(),
  slackHandle:    z.string().max(80).optional(),
  secondaryEmail: z.string().email().or(z.literal("")).optional(),
  timezone:       z.string().max(60).optional(),
  language:       z.string().max(20).optional(),
  dateFormat:     z.string().max(40).optional(),
  timeFormat:     z.string().max(40).optional(),
});

export async function saveMyProfile(formData: FormData) {
  const ctx = await requirePlatformStaff();
  const parsed = profileSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE_PROFILE}?tab=profile&error=${encodeURIComponent("Invalid input")}`);
  }
  const d = parsed.data;
  await db.user.update({
    where: { id: ctx.userId },
    data: {
      name: d.name || null,
      firstName: d.firstName || null,
      lastName:  d.lastName  || null,
      pronouns:  d.pronouns  || null,
      title:     d.title     || null,
      department:d.department|| null,
      bio:       d.bio       || null,
      phone:     d.phone     || null,
      slackHandle:d.slackHandle    || null,
      secondaryEmail: d.secondaryEmail || null,
      timezone:  d.timezone  || null,
      language:  d.language  || null,
      dateFormat:d.dateFormat|| null,
      timeFormat:d.timeFormat|| null,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.me.profile_saved",
    entityType: "User", entityId: ctx.userId,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE_PROFILE);
  redirect(`${ROUTE_PROFILE}?tab=profile&ok=profile-saved`);
}

const prefsSchema = z.object({
  themePreference: z.enum(["AUTO", "LIGHT", "DARK"]),
  density:         z.enum(["COMFORTABLE", "COMPACT"]),
  sidebarDefault:  z.enum(["EXPANDED", "COLLAPSED"]),
  defaultLanding:  z.string().max(120).optional(),
  autoRefreshSec:  z.coerce.number().int().min(0).max(3600),
  currencyDisplay: z.string().max(10).optional(),
  betaFeaturesOptIn: z.union([z.literal("on"), z.literal("")]).optional(),
});

export async function saveMyPreferences(formData: FormData) {
  const ctx = await requirePlatformStaff();
  const parsed = prefsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE_PROFILE}?tab=preferences&error=${encodeURIComponent("Invalid")}`);
  }
  const d = parsed.data;
  await db.user.update({
    where: { id: ctx.userId },
    data: {
      themePreference: d.themePreference as ThemePreference,
      density:         d.density         as AdminDensity,
      sidebarDefault:  d.sidebarDefault  as SidebarDefault,
      defaultLanding:  d.defaultLanding  || null,
      autoRefreshSec:  d.autoRefreshSec,
      currencyDisplay: d.currencyDisplay || null,
      betaFeaturesOptIn: d.betaFeaturesOptIn === "on",
    },
  });
  // Mirror theme into cookie for the SSR boot script.
  const cookieValue =
    d.themePreference === "AUTO"  ? "system" :
    d.themePreference === "LIGHT" ? "light"  : "dark";
  const jar = await cookies();
  jar.set("ts_theme", cookieValue, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.me.preferences_saved",
    entityType: "User", entityId: ctx.userId,
    metadata: { actor: ctx.email, theme: d.themePreference, density: d.density },
  });
  revalidatePath(ROUTE_PROFILE);
  redirect(`${ROUTE_PROFILE}?tab=preferences&ok=preferences-saved`);
}

/* ── Page 73 — Notifications ──────────────────────────── */

const prefMatrixSchema = z.object({
  category:  z.string(),
  channel:   z.string(),
  frequency: z.enum(["REAL_TIME", "HOURLY_DIGEST", "DAILY_DIGEST", "WEEKLY_DIGEST", "OFF"]),
});

export async function saveNotificationPref(formData: FormData) {
  const ctx = await requirePlatformStaff();
  const parsed = prefMatrixSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE_NOTIFICATIONS}?error=${encodeURIComponent("Invalid")}`);
  }
  const d = parsed.data;
  await db.adminNotificationPreference.upsert({
    where: { userId_category_channel: {
      userId: ctx.userId,
      category: d.category as AdminNotificationCategory,
      channel: d.channel as AdminNotificationChannel,
    } },
    create: {
      userId: ctx.userId,
      category: d.category as AdminNotificationCategory,
      channel:  d.channel  as AdminNotificationChannel,
      frequency: d.frequency as AdminNotificationFrequency,
    },
    update: {
      frequency: d.frequency as AdminNotificationFrequency,
    },
  });
  revalidatePath(ROUTE_NOTIFICATIONS);
  redirect(`${ROUTE_NOTIFICATIONS}?ok=pref-saved`);
}

const deliverySchema = z.object({
  quietHoursStart:  z.string().max(5).optional(),
  quietHoursEnd:    z.string().max(5).optional(),
  slackWorkspace:   z.string().max(120).optional(),
  slackChannel:     z.string().max(120).optional(),
  smsPhone:         z.string().max(40).optional(),
  emailDigestSchedule: z.string().max(80).optional(),
});

export async function saveDeliverySetup(formData: FormData) {
  const ctx = await requirePlatformStaff();
  const parsed = deliverySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE_NOTIFICATIONS}?error=${encodeURIComponent("Invalid")}`);
  }
  const d = parsed.data;
  const quiet =
    d.quietHoursStart && d.quietHoursEnd
      ? { start: d.quietHoursStart, end: d.quietHoursEnd }
      : null;
  await db.adminNotificationDeliverySetup.upsert({
    where: { userId: ctx.userId },
    create: {
      userId: ctx.userId,
      quietHoursJson: quiet as never,
      slackWorkspace: d.slackWorkspace || null,
      slackChannel:   d.slackChannel   || null,
      smsPhone:       d.smsPhone       || null,
      emailDigestSchedule: d.emailDigestSchedule || null,
    },
    update: {
      quietHoursJson: quiet as never,
      slackWorkspace: d.slackWorkspace || null,
      slackChannel:   d.slackChannel   || null,
      smsPhone:       d.smsPhone       || null,
      emailDigestSchedule: d.emailDigestSchedule || null,
    },
  });
  revalidatePath(ROUTE_NOTIFICATIONS);
  redirect(`${ROUTE_NOTIFICATIONS}?ok=delivery-saved`);
}

const snoozeSchema = z.object({ minutes: z.coerce.number().int().min(0).max(60 * 24 * 7) });
export async function snoozeAllNotifications(formData: FormData) {
  const ctx = await requirePlatformStaff();
  const parsed = snoozeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE_NOTIFICATIONS}?error=Invalid`);
  const until = parsed.data.minutes > 0
    ? new Date(Date.now() + parsed.data.minutes * 60_000)
    : null;
  await db.adminNotificationDeliverySetup.upsert({
    where: { userId: ctx.userId },
    create: { userId: ctx.userId, snoozeUntil: until },
    update: { snoozeUntil: until },
  });
  revalidatePath(ROUTE_NOTIFICATIONS);
  redirect(`${ROUTE_NOTIFICATIONS}?ok=${until ? "snoozed" : "unsnoozed"}`);
}

/* ── Page 74 — Personal API keys ──────────────────────── */

const createTokenSchema = z.object({
  name:        z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  scopes:      z.string().max(2000),
  ipAllowlist: z.string().max(500).optional(),
  expiresInDays: z.coerce.number().int().min(0).max(365),
});

export async function createPersonalToken(formData: FormData) {
  const ctx = await requirePlatformStaff();
  const parsed = createTokenSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE_KEYS}?error=${encodeURIComponent("Invalid input")}`);
  }
  const d = parsed.data;
  const scopes = d.scopes.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean).slice(0, 50);
  const ipAllow = (d.ipAllowlist ?? "").split(/[,\s]+/).map((s) => s.trim()).filter(Boolean).slice(0, 20);
  const raw = `fk_${crypto.randomBytes(24).toString("base64url")}`;
  const prefix = raw.slice(0, 11);
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const expiresAt = d.expiresInDays > 0 ? new Date(Date.now() + d.expiresInDays * 86_400_000) : null;
  const row = await db.personalApiToken.create({
    data: {
      userId: ctx.userId,
      name: d.name,
      description: d.description || null,
      prefix,
      hash,
      scopes,
      ipAllowlist: ipAllow,
      expiresAt,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.me.personal_token_created",
    entityType: "PersonalApiToken", entityId: row.id,
    metadata: { actor: ctx.email, scopes: scopes.length, expiresAt },
  });
  revalidatePath(ROUTE_KEYS);
  redirect(`${ROUTE_KEYS}?reveal=${encodeURIComponent(raw)}&id=${row.id}&ok=created`);
}

const tokenIdSchema = z.object({ id: z.string().min(1) });

export async function revokePersonalToken(formData: FormData) {
  const ctx = await requirePlatformStaff();
  const parsed = tokenIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE_KEYS}?error=Invalid`);
  await db.personalApiToken.update({
    where: { id: parsed.data.id, userId: ctx.userId },
    data: { status: "REVOKED", revokedAt: new Date(), revokedReason: "User-initiated revoke" },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.me.personal_token_revoked",
    entityType: "PersonalApiToken", entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE_KEYS);
  redirect(`${ROUTE_KEYS}?ok=revoked`);
}

export async function rotatePersonalToken(formData: FormData) {
  const ctx = await requirePlatformStaff();
  const parsed = tokenIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE_KEYS}?error=Invalid`);
  const old = await db.personalApiToken.findFirst({ where: { id: parsed.data.id, userId: ctx.userId } });
  if (!old) redirect(`${ROUTE_KEYS}?error=${encodeURIComponent("Not found")}`);
  // Revoke the old one.
  await db.personalApiToken.update({
    where: { id: old!.id },
    data: { status: "REVOKED", revokedAt: new Date(), revokedReason: "Rotated" },
  });
  // Mint a replacement with the same scopes.
  const raw = `fk_${crypto.randomBytes(24).toString("base64url")}`;
  const prefix = raw.slice(0, 11);
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const row = await db.personalApiToken.create({
    data: {
      userId: ctx.userId,
      name: `${old!.name} (rotated)`,
      description: old!.description,
      prefix, hash,
      scopes: old!.scopes,
      ipAllowlist: old!.ipAllowlist,
      expiresAt: old!.expiresAt,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.me.personal_token_rotated",
    entityType: "PersonalApiToken", entityId: row.id,
    metadata: { actor: ctx.email, replaced: old!.id },
  });
  revalidatePath(ROUTE_KEYS);
  redirect(`${ROUTE_KEYS}?reveal=${encodeURIComponent(raw)}&id=${row.id}&ok=rotated`);
}

/* ── Page 75 — Keyboard shortcuts ─────────────────────── */

const shortcutSchema = z.object({
  actionKey: z.string().min(1).max(120),
  binding:   z.string().min(1).max(40),
});

export async function saveShortcutOverride(formData: FormData) {
  const ctx = await requirePlatformStaff();
  const parsed = shortcutSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE_SHORTCUTS}?error=${encodeURIComponent("Invalid binding")}`);
  await db.keyboardShortcutOverride.upsert({
    where: { userId_actionKey: { userId: ctx.userId, actionKey: parsed.data.actionKey } },
    create: {
      userId: ctx.userId,
      actionKey: parsed.data.actionKey,
      binding: parsed.data.binding,
    },
    update: { binding: parsed.data.binding },
  });
  revalidatePath(ROUTE_SHORTCUTS);
  redirect(`${ROUTE_SHORTCUTS}?ok=binding-saved`);
}

export async function resetShortcutOverride(formData: FormData) {
  const ctx = await requirePlatformStaff();
  const actionKey = formData.get("actionKey");
  if (typeof actionKey !== "string" || !actionKey) redirect(`${ROUTE_SHORTCUTS}?error=Invalid`);
  await db.keyboardShortcutOverride.deleteMany({
    where: { userId: ctx.userId, actionKey: actionKey as string },
  });
  revalidatePath(ROUTE_SHORTCUTS);
  redirect(`${ROUTE_SHORTCUTS}?ok=reset`);
}
