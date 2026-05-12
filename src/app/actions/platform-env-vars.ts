"use server";

// Page 63 — Environment Variables actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import type {
  EnvVarType,
  EnvVarSource,
  EnvVarSyncStatus,
  EnvVarChangeKind,
} from "@prisma/client";

const ROUTE = "/platform/system/env";
const PERM_MANAGE = "env.manage" as const;
const PERM_REVEAL = "env.reveal" as const;

const TYPES   = ["SECRET", "CONFIG"] as const;
const SOURCES = ["VAULT", "DOPPLER", "AWS_SECRETS_MANAGER", "GCP_SECRET_MANAGER", "AZURE_KEY_VAULT", "ENV_FILE", "KUBERNETES", "VERCEL", "OTHER"] as const;
const SYNC    = ["SYNCED", "OUT_OF_SYNC", "PENDING", "FAILED", "NOT_SET"] as const;

/* ── Helpers ───────────────────────────────────────────── */

async function recordChange(args: {
  envVarId: string;
  kind: EnvVarChangeKind;
  actorEmail: string;
  reason?: string;
  env?: string;
  reauthConfirmed?: boolean;
}) {
  await db.envVarChange.create({
    data: {
      envVarId: args.envVarId,
      kind: args.kind,
      actorEmail: args.actorEmail,
      reason: args.reason ?? null,
      env: args.env ?? null,
      reauthConfirmed: args.reauthConfirmed ?? false,
    },
  });
}

/* ── Save (metadata only — values are managed via the secret store) ─ */

const envVarSchema = z.object({
  id:          z.string().optional(),
  key:         z.string().min(1).max(120).regex(/^[A-Z_][A-Z0-9_]*$/, "Use SCREAMING_SNAKE_CASE"),
  service:     z.string().min(1).max(60).regex(/^[a-z0-9-]+$/i, "Lowercase + hyphens"),
  type:        z.enum(TYPES),
  source:      z.enum(SOURCES),
  description: z.string().max(500).optional(),
  rotationPolicyDays: z.coerce.number().int().min(0).max(3650).optional(),
  ownerEmail:  z.string().email().optional().or(z.literal("")),
  tags:        z.string().max(500).optional(),
});

export async function saveEnvVar(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = envVarSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input");
    redirect(`${ROUTE}?error=${msg}`);
  }
  const d = parsed.data;
  const tags = (d.tags ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);
  const data = {
    key: d.key,
    service: d.service,
    type: d.type as EnvVarType,
    source: d.source as EnvVarSource,
    description: d.description || null,
    rotationPolicyDays: d.rotationPolicyDays && d.rotationPolicyDays > 0 ? d.rotationPolicyDays : null,
    ownerEmail: d.ownerEmail ? d.ownerEmail : null,
    tags,
    updatedByEmail: ctx.email ?? null,
  };
  const existing = await db.platformEnvVar.findUnique({
    where: { key_service: { key: d.key, service: d.service } },
  });
  const row = await db.platformEnvVar.upsert({
    where: { key_service: { key: d.key, service: d.service } },
    create: data,
    update: data,
  });
  await recordChange({
    envVarId: row.id,
    kind: existing ? "UPDATED" : "CREATED",
    actorEmail: ctx.email ?? "platform",
    reason: existing ? "Metadata updated" : "Variable registered",
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.envvar.saved",
    entityType: "PlatformEnvVar", entityId: row.id,
    metadata: { actor: ctx.email, key: d.key, service: d.service, created: !existing },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?id=${row.id}&ok=saved`);
}

/* ── Delete ────────────────────────────────────────────── */

const idSchema = z.object({
  id: z.string().min(1),
  confirm: z.string().min(1),
  expected: z.string().min(1),
});

export async function deleteEnvVar(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  if (parsed.data.confirm !== parsed.data.expected) {
    redirect(`${ROUTE}?id=${parsed.data.id}&error=${encodeURIComponent("Confirmation text did not match")}`);
  }
  const row = await db.platformEnvVar.findUnique({ where: { id: parsed.data.id }, select: { key: true, service: true } });
  await db.platformEnvVar.delete({ where: { id: parsed.data.id } });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.envvar.deleted",
    entityType: "PlatformEnvVar", entityId: parsed.data.id,
    metadata: { actor: ctx.email, key: row?.key, service: row?.service },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=deleted`);
}

/* ── Reveal (audit-only — actual reveal flow is owned by client) ── */

const revealSchema = z.object({
  id: z.string().min(1),
  env: z.enum(["PRODUCTION", "STAGING", "SANDBOX", "PREVIEW"]),
  reason: z.string().min(8, "Provide at least 8 chars of context").max(280),
});

/** Records a reveal-attempt audit row + flips a UI hint that the value is
    momentarily unmasked. Server still does NOT return the value — the
    real reveal is gated by re-auth in the client. */
export async function revealEnvVar(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_REVEAL);
  const parsed = revealSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid reveal request");
    redirect(`${ROUTE}?error=${msg}`);
  }
  const d = parsed.data;
  const envVar = await db.platformEnvVar.findUnique({ where: { id: d.id }, select: { id: true, key: true, type: true } });
  if (!envVar) redirect(`${ROUTE}?error=Variable not found`);
  await recordChange({
    envVarId: d.id,
    kind: "REVEALED",
    actorEmail: ctx.email ?? "platform",
    reason: d.reason,
    env: d.env,
    reauthConfirmed: true, // assume re-auth happened upstream
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.envvar.revealed",
    entityType: "PlatformEnvVar", entityId: d.id,
    metadata: { actor: ctx.email, key: envVar?.key, env: d.env, reason: d.reason, type: envVar?.type },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?id=${d.id}&reveal=${d.env}&ok=revealed`);
}

/* ── Rotate ────────────────────────────────────────────── */

const rotateSchema = z.object({
  id: z.string().min(1),
  reason: z.string().max(280).optional(),
});

export async function rotateEnvVar(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = rotateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const row = await db.platformEnvVar.update({
    where: { id: parsed.data.id },
    data: { lastRotatedAt: new Date(), updatedByEmail: ctx.email ?? null },
  });
  await recordChange({
    envVarId: row.id,
    kind: "ROTATED",
    actorEmail: ctx.email ?? "platform",
    reason: parsed.data.reason ?? "Manual rotation",
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.envvar.rotated",
    entityType: "PlatformEnvVar", entityId: row.id,
    metadata: { actor: ctx.email, key: row.key, service: row.service },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?id=${row.id}&ok=rotated`);
}

/* ── Trigger sync ──────────────────────────────────────── */

const syncSchema = z.object({
  id: z.string().min(1),
  env: z.enum(["PRODUCTION", "STAGING", "SANDBOX", "PREVIEW"]),
});

export async function triggerSync(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = syncSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const d = parsed.data;
  const fieldMap: Record<typeof d.env, string> = {
    PRODUCTION: "prodSyncStatus",
    STAGING:    "stagingSyncStatus",
    SANDBOX:    "sandboxSyncStatus",
    PREVIEW:    "previewSyncStatus",
  };
  const data: Record<string, unknown> = {
    [fieldMap[d.env]]: "PENDING" as EnvVarSyncStatus,
    updatedByEmail: ctx.email ?? null,
  };
  await db.platformEnvVar.update({ where: { id: d.id }, data });
  await recordChange({
    envVarId: d.id,
    kind: "SYNC_TRIGGERED",
    actorEmail: ctx.email ?? "platform",
    env: d.env,
    reason: `Sync triggered for ${d.env}`,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.envvar.sync_triggered",
    entityType: "PlatformEnvVar", entityId: d.id,
    metadata: { actor: ctx.email, env: d.env },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?id=${d.id}&ok=sync-queued`);
}

/* ── Settings ──────────────────────────────────────────── */

const settingsSchema = z.object({
  rotationReminderDays:   z.coerce.number().int().min(0).max(365),
  defaultSyncProvider:    z.enum(SOURCES),
  requireReauthOnReveal:  z.union([z.literal("on"), z.literal("")]).optional(),
  reauthValiditySec:      z.coerce.number().int().min(30).max(86400),
  autoRedactDiff:         z.union([z.literal("on"), z.literal("")]).optional(),
  notes:                  z.string().max(2000).optional(),
});

export async function saveEnvVarSettings(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=settings&error=Invalid`);
  const d = parsed.data;
  await db.envVarSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      rotationReminderDays:  d.rotationReminderDays,
      defaultSyncProvider:   d.defaultSyncProvider as EnvVarSource,
      requireReauthOnReveal: d.requireReauthOnReveal === "on",
      reauthValiditySec:     d.reauthValiditySec,
      autoRedactDiff:        d.autoRedactDiff === "on",
      notes:                 d.notes || null,
      updatedById:           ctx.userId,
    },
    update: {
      rotationReminderDays:  d.rotationReminderDays,
      defaultSyncProvider:   d.defaultSyncProvider as EnvVarSource,
      requireReauthOnReveal: d.requireReauthOnReveal === "on",
      reauthValiditySec:     d.reauthValiditySec,
      autoRedactDiff:        d.autoRedactDiff === "on",
      notes:                 d.notes || null,
      updatedById:           ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.envvar.settings_saved",
    entityType: "EnvVarSettings", entityId: "default",
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=settings&ok=settings-saved`);
}
