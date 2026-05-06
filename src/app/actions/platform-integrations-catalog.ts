"use server";

// Page 45 — Integrations Catalog actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import type {
  IntegrationCatalogStatus,
  IntegrationCategory,
  IntegrationAuthType,
  IntegrationRegion,
} from "@prisma/client";

const ROUTE = "/platform/integrations";
const PERM = "integrations.manage" as const;
const detailRoute = (slug: string) => `${ROUTE}/${slug}`;

const STATUSES = ["ACTIVE", "BETA", "COMING_SOON", "DEPRECATED", "INTERNAL_ONLY"] as const;
const CATEGORIES = [
  "ACCOUNTING", "PAYMENTS", "ECOMMERCE", "MARKETPLACES", "AUTOMATION", "COMMUNICATION",
  "EMAIL_MARKETING", "CRM", "TEAM_COLLAB", "PRODUCTIVITY", "SHIPPING", "CARRIERS",
  "DESIGN", "FILE_TRANSFER", "PRINT_INDUSTRY", "EQUIPMENT", "ANALYTICS", "TELEPHONY",
  "CALENDAR", "REVIEWS", "OTHER",
] as const;
const AUTH_TYPES = ["OAUTH2", "API_KEY", "BASIC_AUTH", "SAML", "CUSTOM"] as const;
const REGIONS = ["US", "CA", "EU", "UK", "APAC", "GLOBAL"] as const;

/* ── Create / update catalog entry ─────────────────── */

const upsertSchema = z.object({
  id:             z.string().optional().or(z.literal("")),
  slug:           z.string().min(1).max(80).regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, dashes"),
  name:           z.string().min(1).max(120),
  category:       z.enum(CATEGORIES),
  status:         z.enum(STATUSES),
  authType:       z.enum(AUTH_TYPES),
  logoUrl:        z.string().max(500).optional().or(z.literal("")),
  vendorUrl:      z.string().max(500).optional().or(z.literal("")),
  supportEmail:   z.string().max(200).optional().or(z.literal("")),
  shortDescription: z.string().min(1).max(140),
  description:    z.string().min(1).max(20_000),
  regions:        z.string().optional().or(z.literal("")),         // comma-separated
  availablePlans: z.string().optional().or(z.literal("")),
  envVarsRequired: z.string().optional().or(z.literal("")),
  redirectUri:    z.string().max(500).optional().or(z.literal("")),
  webhookEndpoint: z.string().max(500).optional().or(z.literal("")),
  requiresUpgrade: z.coerce.boolean().optional().default(false),
  perCallCents:   z.coerce.number().int().min(0).max(1_000_000).optional(),
  passThroughFees: z.string().max(500).optional().or(z.literal("")),
  documentation:  z.string().max(50_000).optional().or(z.literal("")),
  faq:            z.string().max(20_000).optional().or(z.literal("")),
  defaultVersion: z.string().min(1).max(50).default("1.0.0"),
  internalOnly:   z.coerce.boolean().optional().default(false),
});

export async function saveIntegration(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const raw = Object.fromEntries(formData.entries());
  for (const k of ["requiresUpgrade", "internalOnly"]) {
    raw[k] = raw[k] === "on" || raw[k] === "true" ? "true" : "false";
  }
  if (raw.perCallCents === "") delete raw.perCallCents;
  const parsed = upsertSchema.safeParse(raw);
  if (!parsed.success) {
    redirect(`${ROUTE}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const regions = (d.regions ?? "").split(",").map((s) => s.trim()).filter(Boolean) as IntegrationRegion[];
  const validRegions = regions.filter((r) => (REGIONS as readonly string[]).includes(r));
  const plans = (d.availablePlans ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const envVars = (d.envVarsRequired ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  const data = {
    slug: d.slug,
    name: d.name,
    category: d.category as IntegrationCategory,
    status: d.status as IntegrationCatalogStatus,
    authType: d.authType as IntegrationAuthType,
    logoUrl: d.logoUrl || null,
    vendorUrl: d.vendorUrl || null,
    supportEmail: d.supportEmail || null,
    shortDescription: d.shortDescription,
    description: d.description,
    regions: validRegions,
    availablePlans: plans,
    envVarsRequired: envVars,
    redirectUri: d.redirectUri || null,
    webhookEndpoint: d.webhookEndpoint || null,
    requiresUpgrade: d.requiresUpgrade,
    perCallCents: d.perCallCents ?? null,
    passThroughFees: d.passThroughFees || null,
    documentation: d.documentation || null,
    faq: d.faq || null,
    defaultVersion: d.defaultVersion,
    internalOnly: d.internalOnly,
  };

  if (d.id) {
    await db.integrationCatalog.update({ where: { id: d.id }, data });
    await db.integrationCatalogAuditLog.create({
      data: {
        integrationId: d.id,
        action: "config_updated",
        detail: `Saved by ${ctx.email}`,
        authorId: ctx.userId,
      },
    });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.integration.updated",
      entityType: "IntegrationCatalog",
      entityId: d.id,
      metadata: { actor: ctx.email, slug: d.slug, status: d.status },
    });
    revalidatePath(detailRoute(d.slug));
    revalidatePath(ROUTE);
    redirect(`${detailRoute(d.slug)}?ok=saved`);
  } else {
    const created = await db.integrationCatalog.create({
      data: { ...data, createdById: ctx.userId },
      select: { id: true, slug: true },
    });
    // Seed an initial v1.0.0 version row when missing.
    await db.integrationVersion.create({
      data: {
        integrationId: created.id,
        version: d.defaultVersion,
        changes: "Initial release.",
        isDefault: true,
        releasedAt: new Date(),
      },
    });
    await db.integrationCatalogAuditLog.create({
      data: {
        integrationId: created.id,
        action: "created",
        detail: `Created by ${ctx.email}`,
        authorId: ctx.userId,
      },
    });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.integration.created",
      entityType: "IntegrationCatalog",
      entityId: created.id,
      metadata: { actor: ctx.email, slug: d.slug },
    });
    revalidatePath(ROUTE);
    redirect(`${detailRoute(created.slug)}?ok=created`);
  }
}

/* ── Versions ───────────────────────────────────────── */

const versionSchema = z.object({
  integrationId: z.string().min(1),
  slug:          z.string().min(1),
  version:       z.string().min(1).max(50),
  changes:       z.string().max(10_000).optional().or(z.literal("")),
  isDefault:     z.coerce.boolean().optional().default(false),
});

export async function createVersion(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const raw = Object.fromEntries(formData.entries());
  raw.isDefault = raw.isDefault === "on" || raw.isDefault === "true" ? "true" : "false";
  const parsed = versionSchema.safeParse(raw);
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const { integrationId, slug, version, changes, isDefault } = parsed.data;
  if (isDefault) {
    await db.integrationVersion.updateMany({ where: { integrationId }, data: { isDefault: false } });
    await db.integrationCatalog.update({ where: { id: integrationId }, data: { defaultVersion: version } });
  }
  await db.integrationVersion.create({
    data: {
      integrationId,
      version,
      changes: changes || null,
      isDefault,
    },
  });
  await db.integrationCatalogAuditLog.create({
    data: {
      integrationId,
      action: "version_created",
      detail: `${version}${isDefault ? " (default)" : ""}`,
      authorId: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.integration.version_created",
    entityType: "IntegrationCatalog",
    entityId: integrationId,
    metadata: { actor: ctx.email, version, isDefault },
  });
  revalidatePath(detailRoute(slug));
  redirect(`${detailRoute(slug)}?tab=versions&ok=version-created`);
}

const setDefaultVersion = z.object({
  versionId:     z.string().min(1),
  integrationId: z.string().min(1),
  slug:          z.string().min(1),
});
export async function setVersionDefault(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = setDefaultVersion.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const { versionId, integrationId, slug } = parsed.data;
  const target = await db.integrationVersion.findUnique({ where: { id: versionId } });
  if (!target) redirect(`${detailRoute(slug)}?error=version-not-found`);
  await db.integrationVersion.updateMany({ where: { integrationId }, data: { isDefault: false } });
  await db.integrationVersion.update({ where: { id: versionId }, data: { isDefault: true } });
  await db.integrationCatalog.update({ where: { id: integrationId }, data: { defaultVersion: target.version } });
  await db.integrationCatalogAuditLog.create({
    data: {
      integrationId,
      action: "version_set_default",
      detail: target.version,
      authorId: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.integration.version_set_default",
    entityType: "IntegrationVersion",
    entityId: versionId,
    metadata: { actor: ctx.email, version: target.version, integrationId },
  });
  revalidatePath(detailRoute(slug));
  redirect(`${detailRoute(slug)}?tab=versions&ok=default-set`);
}

const deprecateVersion = z.object({
  versionId:     z.string().min(1),
  integrationId: z.string().min(1),
  slug:          z.string().min(1),
});
export async function deprecateVersionAction(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = deprecateVersion.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const { versionId, integrationId, slug } = parsed.data;
  const target = await db.integrationVersion.findUnique({ where: { id: versionId } });
  if (!target) redirect(`${detailRoute(slug)}?error=version-not-found`);
  await db.integrationVersion.update({
    where: { id: versionId },
    data: { deprecatedAt: target.deprecatedAt ? null : new Date() },
  });
  await db.integrationCatalogAuditLog.create({
    data: {
      integrationId,
      action: target.deprecatedAt ? "version_undeprecated" : "version_deprecated",
      detail: target.version,
      authorId: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: target.deprecatedAt ? "platform.integration.version_undeprecated" : "platform.integration.version_deprecated",
    entityType: "IntegrationVersion",
    entityId: versionId,
    metadata: { actor: ctx.email, version: target.version },
  });
  revalidatePath(detailRoute(slug));
  redirect(`${detailRoute(slug)}?tab=versions&ok=version-toggled`);
}

/* ── Danger zone ────────────────────────────────────── */

const deprecateSchema = z.object({
  id:        z.string().min(1),
  slug:      z.string().min(1),
  sunsetAt:  z.string().optional().or(z.literal("")),
});

export async function deprecateIntegration(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = deprecateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const { id, slug, sunsetAt } = parsed.data;
  const sunset = sunsetAt ? new Date(sunsetAt) : null;
  await db.integrationCatalog.update({
    where: { id },
    data: {
      status: "DEPRECATED",
      deprecatedAt: new Date(),
      sunsetAt: sunset && !isNaN(sunset.getTime()) ? sunset : null,
    },
  });
  await db.integrationCatalogAuditLog.create({
    data: {
      integrationId: id,
      action: "deprecated",
      detail: sunset ? `Sunset ${sunset.toISOString().slice(0, 10)}` : "No sunset date",
      authorId: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.integration.deprecated",
    entityType: "IntegrationCatalog",
    entityId: id,
    metadata: { actor: ctx.email, slug, sunsetAt: sunset?.toISOString() ?? null },
  });
  revalidatePath(detailRoute(slug));
  revalidatePath(ROUTE);
  redirect(`${detailRoute(slug)}?ok=deprecated`);
}

const forceDisconnectSchema = z.object({
  id:   z.string().min(1),
  slug: z.string().min(1),
});

export async function forceDisconnectAll(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = forceDisconnectSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const { id, slug } = parsed.data;
  // Mark all tenant connections DISCONNECTED — keep the rows around so
  // there's an audit trail.
  const result = await db.tenantIntegration.updateMany({
    where: { provider: slug, status: { not: "DISCONNECTED" } },
    data: { status: "DISCONNECTED", lastError: "Force disconnect by platform admin", lastErrorAt: new Date() },
  });
  await db.integrationCatalog.update({
    where: { id },
    data: { connectedTenantCount: 0 },
  });
  await db.integrationCatalogAuditLog.create({
    data: {
      integrationId: id,
      action: "force_disconnect_all",
      detail: `Disconnected ${result.count} tenant connections`,
      authorId: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.integration.force_disconnect_all",
    entityType: "IntegrationCatalog",
    entityId: id,
    metadata: { actor: ctx.email, slug, disconnected: result.count },
  });
  revalidatePath(detailRoute(slug));
  revalidatePath(ROUTE);
  redirect(`${detailRoute(slug)}?ok=disconnected-${result.count}`);
}

const deleteSchema = z.object({
  id:   z.string().min(1),
  confirm: z.string().min(1),
});
export async function deleteIntegrationCatalog(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = deleteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const { id, confirm } = parsed.data;
  const integration = await db.integrationCatalog.findUnique({ where: { id }, select: { slug: true } });
  if (!integration) redirect(`${ROUTE}?error=not-found`);
  if (confirm !== integration.slug) redirect(`${ROUTE}?error=confirmation-mismatch`);
  await db.integrationCatalog.delete({ where: { id } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.integration.deleted",
    entityType: "IntegrationCatalog",
    entityId: id,
    metadata: { actor: ctx.email, slug: integration.slug },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=deleted`);
}

/* ── Sync availability — pretend cron sync ─────────── */

export async function syncCatalogAvailability() {
  const ctx = await requirePlatformPermission(PERM);
  const all = await db.integrationCatalog.findMany({ select: { id: true, slug: true } });
  for (const integration of all) {
    const connectedCount = await db.tenantIntegration.count({
      where: { provider: integration.slug, status: { in: ["CONNECTED", "ERRORED"] } },
    });
    const since30 = new Date(Date.now() - 30 * 86_400_000);
    const errorCount = await db.integrationSyncEvent.count({
      where: { integrationId: integration.id, success: false, occurredAt: { gte: since30 } },
    });
    const since7 = new Date(Date.now() - 7 * 86_400_000);
    const syncCount = await db.integrationSyncEvent.count({
      where: { integrationId: integration.id, occurredAt: { gte: since7 } },
    });
    const since90 = new Date(Date.now() - 90 * 86_400_000);
    const totalIn90 = await db.integrationSyncEvent.count({
      where: { integrationId: integration.id, occurredAt: { gte: since90 } },
    });
    const successIn90 = await db.integrationSyncEvent.count({
      where: { integrationId: integration.id, success: true, occurredAt: { gte: since90 } },
    });
    const uptimePct90d = totalIn90 === 0 ? null : (successIn90 / totalIn90) * 100;
    await db.integrationCatalog.update({
      where: { id: integration.id },
      data: {
        connectedTenantCount: connectedCount,
        errorCount30d: errorCount,
        syncCount7d: syncCount,
        uptimePct90d,
      },
    });
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.integration.sync_availability",
    entityType: "IntegrationCatalog",
    entityId: "*",
    metadata: { actor: ctx.email, count: all.length },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=availability-synced-${all.length}`);
}
