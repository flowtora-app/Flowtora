"use server";

// Page 56 — System Status actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import type {
  SystemServiceKind,
  SystemServiceStatus,
  ServiceAlertSeverity,
  ServiceAlertStatus,
  ServiceDeployStatus,
} from "@prisma/client";

const ROUTE = "/platform/system/status";
const PERM_READ = "system.status.read" as const;
const PERM_MANAGE = "system.status.manage" as const;

const KINDS = [
  "API", "WEB_APP", "AUTH", "DB_PRIMARY", "DB_REPLICA", "REDIS",
  "QUEUE_WORKER", "OBJECT_STORAGE", "SEARCH", "EMAIL", "WEBHOOKS",
  "CDN", "WEBSOCKET", "AI", "CRON", "OTHER",
] as const;
const STATUSES = ["OPERATIONAL", "DEGRADED", "PARTIAL_OUTAGE", "MAJOR_OUTAGE", "MAINTENANCE"] as const;
const ALERT_SEVERITIES = ["PAGE", "WARNING", "INFO"] as const;
const ALERT_STATUSES = ["FIRING", "ACKNOWLEDGED", "RESOLVED", "SUPPRESSED"] as const;
const DEPLOY_STATUSES = ["IN_PROGRESS", "SUCCEEDED", "FAILED", "ROLLED_BACK"] as const;

/* ── Service CRUD ──────────────────────────────────────── */

const serviceSchema = z.object({
  id:          z.string().optional(),
  slug:        z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
  name:        z.string().min(1).max(120),
  kind:        z.enum(KINDS),
  description: z.string().max(500).optional(),
  region:      z.string().max(60).optional(),
  status:      z.enum(STATUSES),
  runbookSlug: z.string().max(80).optional(),
  displayOrder: z.coerce.number().int().min(0).max(9999),
});

export async function saveService(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = serviceSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const data = {
    name: d.name,
    kind: d.kind as SystemServiceKind,
    description: d.description || null,
    region: d.region || null,
    status: d.status as SystemServiceStatus,
    runbookSlug: d.runbookSlug || null,
    displayOrder: d.displayOrder,
  };
  const saved = await db.systemService.upsert({
    where: { slug: d.slug },
    create: { slug: d.slug, ...data },
    update: data,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.system.service_saved",
    entityType: "SystemService", entityId: saved.id,
    metadata: { actor: ctx.email, slug: d.slug, status: d.status },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=service-saved`);
}

const setStatusSchema = z.object({
  id:     z.string().min(1),
  status: z.enum(STATUSES),
});

export async function setServiceStatus(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = setStatusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  await db.systemService.update({
    where: { id: parsed.data.id },
    data: { status: parsed.data.status as SystemServiceStatus },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.system.service_status_set",
    entityType: "SystemService", entityId: parsed.data.id,
    metadata: { actor: ctx.email, status: parsed.data.status },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=status-set`);
}

/* ── Dependency edges ──────────────────────────────────── */

const dependencySchema = z.object({
  fromId:   z.string().min(1),
  toId:     z.string().min(1),
  kind:     z.string().max(40).optional(),
  critical: z.union([z.literal("on"), z.literal("")]).optional(),
});

export async function saveDependency(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = dependencySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const d = parsed.data;
  if (d.fromId === d.toId) redirect(`${ROUTE}?error=Cannot-depend-on-self`);
  await db.serviceDependency.upsert({
    where: { fromId_toId: { fromId: d.fromId, toId: d.toId } },
    create: {
      fromId: d.fromId, toId: d.toId,
      kind: d.kind || null,
      critical: d.critical === "on",
    },
    update: { kind: d.kind || null, critical: d.critical === "on" },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.system.dependency_saved",
    entityType: "ServiceDependency", entityId: `${d.fromId}->${d.toId}`,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=dependency-saved`);
}

const deleteDepSchema = z.object({ fromId: z.string().min(1), toId: z.string().min(1) });

export async function deleteDependency(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = deleteDepSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  await db.serviceDependency.delete({
    where: { fromId_toId: { fromId: parsed.data.fromId, toId: parsed.data.toId } },
  }).catch(() => {});
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=dependency-deleted`);
}

/* ── Alerts ────────────────────────────────────────────── */

const ackSchema = z.object({ id: z.string().min(1) });

export async function ackAlert(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = ackSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const a = await db.serviceAlert.update({
    where: { id: parsed.data.id },
    data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date(), acknowledgedById: ctx.userId },
    select: { serviceId: true, service: { select: { slug: true } } },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.system.alert_acked",
    entityType: "ServiceAlert", entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${a.service.slug}?ok=alert-acked`);
}

const resolveAlertSchema = z.object({ id: z.string().min(1) });

export async function resolveAlert(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = resolveAlertSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const a = await db.serviceAlert.update({
    where: { id: parsed.data.id },
    data: { status: "RESOLVED", resolvedAt: new Date() },
    select: { service: { select: { slug: true } } },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.system.alert_resolved",
    entityType: "ServiceAlert", entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${a.service.slug}?ok=alert-resolved`);
}

/* ── Deploy markers ────────────────────────────────────── */

const deploySchema = z.object({
  serviceId: z.string().min(1),
  ref:       z.string().min(1).max(80),
  title:     z.string().max(200).optional(),
  source:    z.string().max(60).optional(),
  status:    z.enum(DEPLOY_STATUSES),
  showOnChart: z.union([z.literal("on"), z.literal("")]).optional(),
});

export async function recordDeploy(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = deploySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const d = parsed.data;
  const created = await db.serviceDeployMarker.create({
    data: {
      serviceId: d.serviceId,
      ref: d.ref,
      title: d.title || null,
      source: d.source || null,
      status: d.status as ServiceDeployStatus,
      showOnChart: d.showOnChart !== "",
    },
    select: { id: true, service: { select: { slug: true } } },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.system.deploy_recorded",
    entityType: "ServiceDeployMarker", entityId: created.id,
    metadata: { actor: ctx.email, ref: d.ref, status: d.status },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${created.service.slug}?ok=deploy-recorded`);
}
