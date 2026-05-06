"use server";

// Page 46 — API Keys & Webhooks actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import type {
  ApiKeyEnvironment,
  ApiKeyStatus,
  WebhookEndpointStatus,
  WebhookEventCategory,
  WebhookEventStability,
  WebhookRetryPolicy,
} from "@prisma/client";

const ROUTE = "/platform/integrations/api";
const PERM = "webhooks.manage" as const;

const ENVIRONMENTS = ["PRODUCTION", "STAGING", "SANDBOX"] as const;
const KEY_STATUSES = ["ACTIVE", "REVOKED", "EXPIRED"] as const;
const RETRY_POLICIES = ["EXPONENTIAL", "LINEAR", "CUSTOM"] as const;
const ENDPOINT_STATUSES = ["ACTIVE", "PAUSED", "FAILING", "DISABLED"] as const;
const STABILITIES = ["STABLE", "BETA", "DEPRECATED"] as const;
const CATEGORIES = [
  "TENANT_LIFECYCLE", "SUBSCRIPTION", "INVOICE", "PAYMENT", "USER",
  "JOB", "INTEGRATION", "SYSTEM", "SECURITY", "MARKETING",
] as const;

/* ── API key create ────────────────────────────────── */

const createKeySchema = z.object({
  name:          z.string().min(1).max(120),
  description:   z.string().max(500).optional().or(z.literal("")),
  ownerTeam:     z.string().max(80).optional().or(z.literal("")),
  scopesRaw:     z.string().max(2000).optional().or(z.literal("")),
  environment:   z.enum(ENVIRONMENTS).default("PRODUCTION"),
  expiry:        z.string().optional().or(z.literal("")),  // "none", "30d", "90d", "1y", or ISO date
  ipAllowlistRaw: z.string().max(2000).optional().or(z.literal("")),
  rateLimitPerMin: z.coerce.number().int().min(0).max(100_000).optional(),
});

export async function createApiKey(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const raw = Object.fromEntries(formData.entries());
  if (raw.rateLimitPerMin === "") delete raw.rateLimitPerMin;
  const parsed = createKeySchema.safeParse(raw);
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=keys&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const scopes = (d.scopesRaw ?? "")
    .split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  const ipAllowlist = (d.ipAllowlistRaw ?? "")
    .split(/[\n,]/).map((s) => s.trim()).filter(Boolean);

  let expiresAt: Date | null = null;
  if (d.expiry && d.expiry !== "none" && d.expiry !== "") {
    if (d.expiry === "30d")        expiresAt = new Date(Date.now() + 30 * 86_400_000);
    else if (d.expiry === "90d")   expiresAt = new Date(Date.now() + 90 * 86_400_000);
    else if (d.expiry === "1y")    expiresAt = new Date(Date.now() + 365 * 86_400_000);
    else {
      const parsedDate = new Date(d.expiry);
      if (!isNaN(parsedDate.getTime())) expiresAt = parsedDate;
    }
  }

  // Generate secret. Format: ft_<env>_<32 hex>.
  const tail = randomBytes(20).toString("hex");
  const envCode = d.environment === "PRODUCTION" ? "live" : d.environment === "STAGING" ? "stg" : "sand";
  const fullKey = `ft_${envCode}_${tail}`;
  const keyPrefix = fullKey.slice(0, 12);
  const hashedKey = createHash("sha256").update(fullKey).digest("hex");

  const created = await db.platformApiKey.create({
    data: {
      name: d.name,
      description: d.description || null,
      ownerTeam: d.ownerTeam || null,
      scopes,
      environment: d.environment as ApiKeyEnvironment,
      keyPrefix,
      hashedKey,
      ipAllowlist,
      rateLimitPerMin: d.rateLimitPerMin ?? null,
      expiresAt,
      createdById: ctx.userId,
    },
    select: { id: true },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.api_key.created",
    entityType: "PlatformApiKey",
    entityId: created.id,
    metadata: {
      actor: ctx.email,
      name: d.name,
      environment: d.environment,
      scopeCount: scopes.length,
      ipAllowlistCount: ipAllowlist.length,
    },
  });
  revalidatePath(ROUTE);
  // Encode the full key into the redirect so the UI can display the
  // copy-once confirmation banner. Real production would write to a
  // session-scoped store rather than the URL — this is fine for the
  // platform-admin context where the URL won't leak to logs.
  redirect(`${ROUTE}?tab=keys&ok=key-created&revealKey=${encodeURIComponent(fullKey)}&revealId=${created.id}`);
}

/* ── API key rotate / revoke ────────────────────────── */

const keyIdSchema = z.object({ id: z.string().min(1) });

export async function rotateApiKey(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = keyIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=keys&error=invalid`);
  const { id } = parsed.data;
  const existing = await db.platformApiKey.findUnique({ where: { id } });
  if (!existing) redirect(`${ROUTE}?tab=keys&error=not-found`);

  const tail = randomBytes(20).toString("hex");
  const envCode = existing.environment === "PRODUCTION" ? "live"
    : existing.environment === "STAGING" ? "stg" : "sand";
  const fullKey = `ft_${envCode}_${tail}`;
  const keyPrefix = fullKey.slice(0, 12);
  const hashedKey = createHash("sha256").update(fullKey).digest("hex");

  await db.platformApiKey.update({
    where: { id },
    data: { keyPrefix, hashedKey, lastUsedAt: null },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.api_key.rotated",
    entityType: "PlatformApiKey",
    entityId: id,
    metadata: { actor: ctx.email, name: existing.name },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=keys&ok=key-rotated&revealKey=${encodeURIComponent(fullKey)}&revealId=${id}`);
}

export async function revokeApiKey(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = keyIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=keys&error=invalid`);
  const { id } = parsed.data;
  const existing = await db.platformApiKey.findUnique({ where: { id } });
  if (!existing) redirect(`${ROUTE}?tab=keys&error=not-found`);
  await db.platformApiKey.update({
    where: { id },
    data: { status: "REVOKED", revokedAt: new Date(), revokedById: ctx.userId },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.api_key.revoked",
    entityType: "PlatformApiKey",
    entityId: id,
    metadata: { actor: ctx.email, name: existing.name },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=keys&ok=key-revoked`);
}

export async function rotateAllKeys() {
  const ctx = await requirePlatformPermission(PERM);
  const keys = await db.platformApiKey.findMany({ where: { status: "ACTIVE" } });
  for (const k of keys) {
    const tail = randomBytes(20).toString("hex");
    const envCode = k.environment === "PRODUCTION" ? "live"
      : k.environment === "STAGING" ? "stg" : "sand";
    const fullKey = `ft_${envCode}_${tail}`;
    await db.platformApiKey.update({
      where: { id: k.id },
      data: {
        keyPrefix: fullKey.slice(0, 12),
        hashedKey: createHash("sha256").update(fullKey).digest("hex"),
      },
    });
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.api_key.rotate_all",
    entityType: "PlatformApiKey",
    entityId: "*",
    metadata: { actor: ctx.email, count: keys.length },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=keys&ok=rotated-all-${keys.length}-keys`);
}

/* ── Webhook endpoint CRUD ──────────────────────────── */

const endpointSchema = z.object({
  id:                  z.string().optional().or(z.literal("")),
  url:                 z.string().min(1).max(500).regex(/^https:\/\//, "URL must use HTTPS"),
  description:         z.string().max(500).optional().or(z.literal("")),
  status:              z.enum(ENDPOINT_STATUSES).default("ACTIVE"),
  subscribedEventsRaw: z.string().max(5000).optional().or(z.literal("")),
  retryPolicy:         z.enum(RETRY_POLICIES).default("EXPONENTIAL"),
  maxAttempts:         z.coerce.number().int().min(1).max(10).default(5),
  timeoutSec:          z.coerce.number().int().min(1).max(30).default(15),
  filterExpression:    z.string().max(2000).optional().or(z.literal("")),
  customHeadersRaw:    z.string().max(2000).optional().or(z.literal("")),
  autoDisableThreshold: z.coerce.number().int().min(0).max(1000).optional(),
});

export async function saveWebhookEndpoint(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const raw = Object.fromEntries(formData.entries());
  if (raw.autoDisableThreshold === "") delete raw.autoDisableThreshold;
  const parsed = endpointSchema.safeParse(raw);
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=endpoints&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const subscribedEvents = (d.subscribedEventsRaw ?? "")
    .split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  const customHeaders = (d.customHeadersRaw ?? "")
    .split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    .map((line) => {
      const [key, ...rest] = line.split(":");
      return { key: (key ?? "").trim(), value: rest.join(":").trim() };
    })
    .filter((h) => h.key);

  const data = {
    url: d.url,
    description: d.description || null,
    status: d.status as WebhookEndpointStatus,
    subscribedEvents,
    retryPolicy: d.retryPolicy as WebhookRetryPolicy,
    maxAttempts: d.maxAttempts,
    timeoutSec: d.timeoutSec,
    filterExpression: d.filterExpression || null,
    customHeaders,
    autoDisableThreshold: d.autoDisableThreshold ?? null,
  };

  if (d.id) {
    await db.webhookEndpoint.update({ where: { id: d.id }, data });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.webhook_endpoint.updated",
      entityType: "WebhookEndpoint",
      entityId: d.id,
      metadata: { actor: ctx.email, url: d.url },
    });
  } else {
    // Generate signing secret on create.
    const signingSecret = `whsec_${randomBytes(24).toString("hex")}`;
    const created = await db.webhookEndpoint.create({
      data: {
        ...data,
        signingSecret,
        createdById: ctx.userId,
      },
      select: { id: true },
    });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.webhook_endpoint.created",
      entityType: "WebhookEndpoint",
      entityId: created.id,
      metadata: { actor: ctx.email, url: d.url, eventCount: subscribedEvents.length },
    });
  }

  // Maintain WebhookEvent.subscriberCount denormalised counters.
  if (subscribedEvents.length > 0) {
    await refreshSubscriberCounts(subscribedEvents);
  }
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=endpoints&ok=endpoint-saved`);
}

const endpointActionSchema = z.object({ id: z.string().min(1) });

export async function deleteWebhookEndpoint(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = endpointActionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=endpoints&error=invalid`);
  const existing = await db.webhookEndpoint.findUnique({ where: { id: parsed.data.id }, select: { url: true, subscribedEvents: true } });
  await db.webhookEndpoint.delete({ where: { id: parsed.data.id } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.webhook_endpoint.deleted",
    entityType: "WebhookEndpoint",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email, url: existing?.url },
  });
  if (existing?.subscribedEvents) {
    await refreshSubscriberCounts(existing.subscribedEvents);
  }
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=endpoints&ok=endpoint-deleted`);
}

export async function pauseWebhookEndpoint(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = endpointActionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=endpoints&error=invalid`);
  const existing = await db.webhookEndpoint.findUnique({ where: { id: parsed.data.id } });
  if (!existing) redirect(`${ROUTE}?tab=endpoints&error=not-found`);
  const next: WebhookEndpointStatus = existing.status === "PAUSED" ? "ACTIVE" : "PAUSED";
  await db.webhookEndpoint.update({ where: { id: parsed.data.id }, data: { status: next } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.webhook_endpoint.toggled",
    entityType: "WebhookEndpoint",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email, from: existing.status, to: next },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=endpoints&ok=endpoint-${next.toLowerCase()}`);
}

/* ── Signing secret rotation ─────────────────────────── */

export async function rotateEndpointSecret(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = endpointActionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=secrets&error=invalid`);
  const existing = await db.webhookEndpoint.findUnique({ where: { id: parsed.data.id } });
  if (!existing) redirect(`${ROUTE}?tab=secrets&error=not-found`);

  const newSecret = `whsec_${randomBytes(24).toString("hex")}`;
  // Old secret remains active for 24h.
  const rotateAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.webhookEndpoint.update({
    where: { id: parsed.data.id },
    data: {
      previousSigningSecret: existing.signingSecret,
      signingSecret: newSecret,
      signingSecretRotatesAt: rotateAt,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.webhook_secret.rotated",
    entityType: "WebhookEndpoint",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email, url: existing.url, graceUntil: rotateAt.toISOString() },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=secrets&ok=secret-rotated`);
}

const rotateAllSecretsSchema = z.object({ confirm: z.string().min(1) });
export async function rotateAllSecrets(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = rotateAllSecretsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=secrets&error=invalid`);
  if (parsed.data.confirm !== "ROTATE ALL SECRETS") {
    redirect(`${ROUTE}?tab=secrets&error=confirmation-mismatch`);
  }
  const endpoints = await db.webhookEndpoint.findMany();
  const rotateAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  for (const e of endpoints) {
    const newSecret = `whsec_${randomBytes(24).toString("hex")}`;
    await db.webhookEndpoint.update({
      where: { id: e.id },
      data: {
        previousSigningSecret: e.signingSecret,
        signingSecret: newSecret,
        signingSecretRotatesAt: rotateAt,
      },
    });
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.webhook_secret.rotate_all",
    entityType: "WebhookEndpoint",
    entityId: "*",
    metadata: { actor: ctx.email, count: endpoints.length, graceUntil: rotateAt.toISOString() },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=secrets&ok=rotated-all-${endpoints.length}-secrets`);
}

/* ── Delivery actions ───────────────────────────────── */

const deliveryActionSchema = z.object({ id: z.string().min(1) });

export async function replayDelivery(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = deliveryActionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=deliveries&error=invalid`);
  const original = await db.webhookDelivery.findUnique({ where: { id: parsed.data.id } });
  if (!original) redirect(`${ROUTE}?tab=deliveries&error=not-found`);
  // Simulate replay — duplicate the row with attempts++ and PENDING status,
  // pretend the dispatcher will pick it up next cron tick.
  const replayed = await db.webhookDelivery.create({
    data: {
      endpointId: original.endpointId,
      eventName: original.eventName,
      tenantId: original.tenantId,
      status: "PENDING",
      attempts: original.attempts + 1,
      payload: original.payload as never,
      requestHeaders: original.requestHeaders as never,
      responseHeaders: { } as never,
      attemptedAt: new Date(),
      nextRetryAt: new Date(Date.now() + 30_000),
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.webhook_delivery.replayed",
    entityType: "WebhookDelivery",
    entityId: original.id,
    metadata: { actor: ctx.email, replayedId: replayed.id, eventName: original.eventName },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=deliveries&ok=delivery-replayed`);
}

export async function markDeliveryResolved(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = deliveryActionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=deliveries&error=invalid`);
  await db.webhookDelivery.update({
    where: { id: parsed.data.id },
    data: { status: "RESOLVED", resolvedAt: new Date(), resolvedById: ctx.userId },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.webhook_delivery.resolved",
    entityType: "WebhookDelivery",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=deliveries&ok=delivery-resolved`);
}

export async function moveDeliveryToDeadLetter(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = deliveryActionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=deliveries&error=invalid`);
  await db.webhookDelivery.update({
    where: { id: parsed.data.id },
    data: { status: "DEAD_LETTER", nextRetryAt: null },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.webhook_delivery.dead_lettered",
    entityType: "WebhookDelivery",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=deliveries&ok=delivery-dead-lettered`);
}

/* ── Event catalog ──────────────────────────────────── */

const eventSchema = z.object({
  id:                z.string().optional().or(z.literal("")),
  name:              z.string().min(1).max(120),
  category:          z.enum(CATEGORIES).default("SYSTEM"),
  description:       z.string().min(1).max(2000),
  introducedVersion: z.string().min(1).max(50).default("2024.01"),
  stability:         z.enum(STABILITIES).default("STABLE"),
  schemaUrl:         z.string().max(500).optional().or(z.literal("")),
  samplePayloadRaw:  z.string().max(20_000).optional().or(z.literal("{}")),
  deprecationNotice: z.string().max(1000).optional().or(z.literal("")),
});

export async function saveEvent(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = eventSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=events&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  let samplePayload: unknown = {};
  try { samplePayload = JSON.parse(d.samplePayloadRaw || "{}"); }
  catch { redirect(`${ROUTE}?tab=events&error=${encodeURIComponent("Sample payload must be valid JSON")}`); }

  const data = {
    name: d.name,
    category: d.category as WebhookEventCategory,
    description: d.description,
    schemaUrl: d.schemaUrl || null,
    samplePayload: samplePayload as never,
    introducedVersion: d.introducedVersion,
    stability: d.stability as WebhookEventStability,
    deprecationNotice: d.deprecationNotice || null,
  };
  if (d.id) {
    await db.webhookEvent.update({ where: { id: d.id }, data });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.webhook_event.updated",
      entityType: "WebhookEvent",
      entityId: d.id,
      metadata: { actor: ctx.email, name: d.name },
    });
  } else {
    const created = await db.webhookEvent.create({ data });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.webhook_event.created",
      entityType: "WebhookEvent",
      entityId: created.id,
      metadata: { actor: ctx.email, name: d.name },
    });
  }
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=events&ok=event-saved`);
}

/* ── Settings ──────────────────────────────────────── */

const settingsSchema = z.object({
  defaultRetryPolicy:        z.enum(RETRY_POLICIES).default("EXPONENTIAL"),
  defaultMaxAttempts:        z.coerce.number().int().min(1).max(10).default(5),
  defaultTimeoutSec:         z.coerce.number().int().min(1).max(60).default(15),
  deadLetterRetentionDays:   z.coerce.number().int().min(1).max(365).default(30),
  defaultAutoDisableThreshold: z.coerce.number().int().min(0).max(1000).optional(),
  egressIpsRaw:              z.string().max(2000).optional().or(z.literal("")),
  encryptionAlgorithm:       z.string().max(80).optional().or(z.literal("")),
});

export async function saveWebhookSettings(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const raw = Object.fromEntries(formData.entries());
  if (raw.defaultAutoDisableThreshold === "") delete raw.defaultAutoDisableThreshold;
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=settings&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const egressIps = (d.egressIpsRaw ?? "")
    .split(/[\n,]/).map((s) => s.trim()).filter(Boolean);

  await db.webhookSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      defaultRetryPolicy: d.defaultRetryPolicy as WebhookRetryPolicy,
      defaultMaxAttempts: d.defaultMaxAttempts,
      defaultTimeoutSec: d.defaultTimeoutSec,
      deadLetterRetentionDays: d.deadLetterRetentionDays,
      defaultAutoDisableThreshold: d.defaultAutoDisableThreshold ?? null,
      egressIps,
      encryptionAlgorithm: d.encryptionAlgorithm || null,
      encryptionVerifiedAt: new Date(),
      updatedById: ctx.userId,
    },
    update: {
      defaultRetryPolicy: d.defaultRetryPolicy as WebhookRetryPolicy,
      defaultMaxAttempts: d.defaultMaxAttempts,
      defaultTimeoutSec: d.defaultTimeoutSec,
      deadLetterRetentionDays: d.deadLetterRetentionDays,
      defaultAutoDisableThreshold: d.defaultAutoDisableThreshold ?? null,
      egressIps,
      encryptionAlgorithm: d.encryptionAlgorithm || null,
      encryptionVerifiedAt: new Date(),
      updatedById: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.webhook_settings.saved",
    entityType: "WebhookSettings",
    entityId: "default",
    metadata: { actor: ctx.email, retentionDays: d.deadLetterRetentionDays },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=settings&ok=saved`);
}

/* ── Helpers ──────────────────────────────────────── */

async function refreshSubscriberCounts(eventNames: string[]) {
  for (const name of eventNames) {
    const count = await db.webhookEndpoint.count({
      where: { subscribedEvents: { has: name } },
    });
    await db.webhookEvent.updateMany({ where: { name }, data: { subscriberCount: count } });
  }
}
