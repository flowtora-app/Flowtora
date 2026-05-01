// Audit Log data layer — Page 14.
//
// Three loaders: list (filtered + paged) · detail (with related
// events + permission trail + webhook deliveries) · KPIs.
//
// Hash chain verification is computed on demand by the verify
// endpoint, not surfaced through this loader.

import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type {
  AuditSeverity,
  AuditSource,
  AuditWebhookSubscription,
} from "@prisma/client";

const DAY = 86_400_000;

/* ────────────────────────────────────────────────────────── */
/* List + filters                                             */
/* ────────────────────────────────────────────────────────── */

export interface AuditFilters {
  q?: string;              // search action / entity / id
  actorId?: string;
  tenantId?: string;
  entityType?: string;
  action?: string;
  severity?: AuditSeverity;
  source?: AuditSource;
  ip?: string;
  since?: Date;
  until?: Date;
  /** When set, filter to success/failure rows only. */
  success?: boolean;
  /** Saved-view shorthand. */
  preset?: "sensitive" | "failures" | "mine" | "super_admin_week";
}

export interface AuditRow {
  id: string;
  createdAt: Date;
  action: string;
  entityType: string | null;
  entityId: string | null;
  severity: AuditSeverity;
  success: boolean;
  source: AuditSource;
  ipAddress: string | null;
  userAgent: string | null;
  hash: string | null;
  prevHash: string | null;
  correlationId: string | null;
  actor: { id: string; name: string | null; email: string; image: string | null; platformRole: string | null } | null;
  tenant: { id: string; name: string; slug: string } | null;
}

export interface AuditListResult {
  rows: AuditRow[];
  total: number;
}

/** Translate a saved-view preset into structured filters merged
 *  on top of explicit filters. */
function applyPreset(filters: AuditFilters, currentUserId: string | null): AuditFilters {
  if (!filters.preset) return filters;
  const merged: AuditFilters = { ...filters };
  switch (filters.preset) {
    case "sensitive":
      merged.severity = "CRITICAL";
      break;
    case "failures":
      merged.success = false;
      break;
    case "mine":
      if (currentUserId) merged.actorId = currentUserId;
      break;
    case "super_admin_week":
      // Set a since cutoff to last 7 days; the actor filter is
      // derived at query time below from the resolver.
      merged.since = merged.since ?? new Date(Date.now() - 7 * DAY);
      break;
  }
  return merged;
}

export async function loadAuditList(
  filters: AuditFilters,
  page = 1,
  pageSize = 50,
  currentUserId: string | null = null,
): Promise<AuditListResult> {
  const f = applyPreset(filters, currentUserId);
  const where: Prisma.AuditLogWhereInput = {};

  if (f.q) {
    const q = f.q.trim();
    where.OR = [
      { action: { contains: q, mode: "insensitive" } },
      { entityType: { contains: q, mode: "insensitive" } },
      { entityId: q },
      { id: q },
      { correlationId: q },
    ];
  }
  if (f.actorId) where.userId = f.actorId;
  if (f.tenantId) where.tenantId = f.tenantId;
  if (f.entityType) where.entityType = f.entityType;
  if (f.action) where.action = f.action;
  if (f.severity) where.severity = f.severity;
  if (f.source) where.source = f.source;
  if (f.ip) where.ipAddress = f.ip;
  if (typeof f.success === "boolean") where.success = f.success;
  if (f.since || f.until) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (f.since) createdAt.gte = f.since;
    if (f.until) createdAt.lte = f.until;
    where.createdAt = createdAt;
  }

  // super_admin_week preset: scope to actors with SUPER_ADMIN role.
  if (f.preset === "super_admin_week") {
    const superAdmins = await db.user.findMany({
      where: { platformRole: "SUPER_ADMIN" },
      select: { id: true },
    });
    where.userId = { in: superAdmins.map((u) => u.id) };
  }

  const [total, rows] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, createdAt: true, action: true,
        entityType: true, entityId: true,
        severity: true, success: true, source: true,
        ipAddress: true, userAgent: true,
        hash: true, prevHash: true, correlationId: true,
        userId: true, tenantId: true,
      },
    }),
  ]);

  // Resolve actors + tenants in bulk.
  const actorIds = Array.from(new Set(rows.map((r) => r.userId).filter((x): x is string => !!x)));
  const tenantIds = Array.from(new Set(rows.map((r) => r.tenantId).filter((x): x is string => !!x)));
  const [users, tenants] = await Promise.all([
    actorIds.length === 0 ? [] : db.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true, email: true, image: true, platformRole: true },
    }),
    tenantIds.length === 0 ? [] : db.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { id: true, name: true, slug: true },
    }),
  ]);
  const userMap = new Map(users.map((u) => [u.id, u]));
  const tenantMap = new Map(tenants.map((t) => [t.id, t]));

  const out: AuditRow[] = rows.map((r) => ({
    id: r.id, createdAt: r.createdAt, action: r.action,
    entityType: r.entityType, entityId: r.entityId,
    severity: r.severity, success: r.success, source: r.source,
    ipAddress: r.ipAddress, userAgent: r.userAgent,
    hash: r.hash, prevHash: r.prevHash, correlationId: r.correlationId,
    actor: r.userId ? (userMap.get(r.userId) ? {
      ...userMap.get(r.userId)!,
      platformRole: userMap.get(r.userId)!.platformRole as string | null,
    } : null) : null,
    tenant: r.tenantId ? tenantMap.get(r.tenantId) ?? null : null,
  }));
  return { rows: out, total };
}

/* ────────────────────────────────────────────────────────── */
/* KPIs                                                        */
/* ────────────────────────────────────────────────────────── */

export interface AuditKpi {
  totalLast24h: number;
  failuresLast24h: number;
  criticalLast24h: number;
  uniqueActorsLast24h: number;
}

export async function loadAuditKpi(): Promise<AuditKpi> {
  const since = new Date(Date.now() - DAY);
  const [total, failures, critical, recentRows] = await Promise.all([
    db.auditLog.count({ where: { createdAt: { gte: since } } }),
    db.auditLog.count({ where: { createdAt: { gte: since }, success: false } }),
    db.auditLog.count({ where: { createdAt: { gte: since }, severity: "CRITICAL" } }),
    db.auditLog.findMany({
      where: { createdAt: { gte: since }, userId: { not: null } },
      select: { userId: true },
      take: 50_000,
    }),
  ]);
  const uniqueActors = new Set(recentRows.map((r) => r.userId)).size;
  return {
    totalLast24h: total,
    failuresLast24h: failures,
    criticalLast24h: critical,
    uniqueActorsLast24h: uniqueActors,
  };
}

/* ────────────────────────────────────────────────────────── */
/* Detail (slide-over)                                        */
/* ────────────────────────────────────────────────────────── */

export interface AuditDetail extends AuditRow {
  metadata: Record<string, unknown> | null;
  requestId: string | null;
  sessionId: string | null;
  mfaUsed: boolean | null;
  impersonationSessionId: string | null;
  /** Other rows in the same correlation. */
  related: AuditRow[];
  /** Webhook deliveries triggered for this row. */
  deliveries: {
    id: string;
    subscriptionName: string;
    responseStatus: number | null;
    responseBody: string | null;
    succeeded: boolean;
    attempt: number;
    attemptedAt: Date;
  }[];
  /** Best-effort hash-chain integrity at this row: replays the
   *  previous row's hash and confirms it matches what we stored. */
  chainIntact: boolean;
}

export async function loadAuditDetail(id: string): Promise<AuditDetail | null> {
  const r = await db.auditLog.findUnique({
    where: { id },
    include: {
      tenant: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!r) return null;

  // Resolve actor.
  const actor = r.userId ? await db.user.findUnique({
    where: { id: r.userId },
    select: { id: true, name: true, email: true, image: true, platformRole: true },
  }) : null;

  // Related events.
  const related = r.correlationId
    ? await db.auditLog.findMany({
        where: { correlationId: r.correlationId, id: { not: r.id } },
        orderBy: { createdAt: "asc" },
        take: 50,
        select: {
          id: true, createdAt: true, action: true,
          entityType: true, entityId: true,
          severity: true, success: true, source: true,
          ipAddress: true, userAgent: true,
          hash: true, prevHash: true, correlationId: true,
          userId: true, tenantId: true,
        },
      })
    : [];

  // Webhook deliveries.
  const deliveries = await db.auditWebhookDelivery.findMany({
    where: { auditId: r.id },
    orderBy: { attemptedAt: "desc" },
    take: 50,
    include: {
      subscription: { select: { name: true } },
    },
  });

  // Chain integrity check (best-effort).
  let chainIntact = true;
  try {
    if (r.prevHash) {
      const prev = await db.auditLog.findFirst({
        where: { hash: r.prevHash },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (!prev) chainIntact = false;
    }
    // Recompute the stored hash and compare.
    if (r.hash) {
      const expected = createHash("sha256").update(JSON.stringify({
        action: r.action,
        userId: r.userId ?? "",
        tenantId: r.tenantId ?? null,
        entityType: r.entityType ?? null,
        entityId: r.entityId ?? null,
        createdAt: r.createdAt.toISOString(),
        prevHash: r.prevHash ?? null,
        metadata: r.metadata ?? null,
        severity: r.severity,
        success: r.success,
        source: r.source,
      })).digest("hex");
      if (expected !== r.hash) chainIntact = false;
    }
  } catch {
    chainIntact = false;
  }

  return {
    id: r.id, createdAt: r.createdAt, action: r.action,
    entityType: r.entityType, entityId: r.entityId,
    severity: r.severity, success: r.success, source: r.source,
    ipAddress: r.ipAddress, userAgent: r.userAgent,
    hash: r.hash, prevHash: r.prevHash, correlationId: r.correlationId,
    actor: actor ? { ...actor, platformRole: actor.platformRole as string | null } : null,
    tenant: r.tenant,
    metadata: (r.metadata ?? null) as Record<string, unknown> | null,
    requestId: r.requestId,
    sessionId: r.sessionId,
    mfaUsed: r.mfaUsed,
    impersonationSessionId: r.impersonationSessionId,
    chainIntact,
    related: related.map((rr) => ({
      id: rr.id, createdAt: rr.createdAt, action: rr.action,
      entityType: rr.entityType, entityId: rr.entityId,
      severity: rr.severity, success: rr.success, source: rr.source,
      ipAddress: rr.ipAddress, userAgent: rr.userAgent,
      hash: rr.hash, prevHash: rr.prevHash, correlationId: rr.correlationId,
      actor: null, tenant: null,
    })),
    deliveries: deliveries.map((d) => ({
      id: d.id,
      subscriptionName: d.subscription.name,
      responseStatus: d.responseStatus,
      responseBody: d.responseBody,
      succeeded: d.succeeded,
      attempt: d.attempt,
      attemptedAt: d.attemptedAt,
    })),
  };
}

/* ────────────────────────────────────────────────────────── */
/* Hash chain verification                                    */
/* ────────────────────────────────────────────────────────── */

export interface ChainVerifyResult {
  totalChecked: number;
  ok: number;
  broken: { id: string; reason: string; createdAt: Date }[];
}

/** Walks audit rows in chronological order and verifies that:
 *   1. Each row's prevHash points at the previous row's stored hash.
 *   2. Each row's stored hash matches a fresh re-compute.
 *  Bounded by `take` rows from the most recent N. */
export async function verifyHashChain(take = 5_000): Promise<ChainVerifyResult> {
  const rows = await db.auditLog.findMany({
    orderBy: { createdAt: "asc" },
    take,
    select: {
      id: true, action: true, userId: true, tenantId: true,
      entityType: true, entityId: true, createdAt: true,
      prevHash: true, hash: true, metadata: true,
      severity: true, success: true, source: true,
    },
  });
  let ok = 0;
  const broken: { id: string; reason: string; createdAt: Date }[] = [];
  let prev: typeof rows[number] | null = null;
  for (const r of rows) {
    let problem: string | null = null;
    if (prev && r.prevHash !== prev.hash) {
      problem = "prevHash mismatch";
    }
    if (r.hash) {
      const expected = createHash("sha256").update(JSON.stringify({
        action: r.action,
        userId: r.userId ?? "",
        tenantId: r.tenantId ?? null,
        entityType: r.entityType ?? null,
        entityId: r.entityId ?? null,
        createdAt: r.createdAt.toISOString(),
        prevHash: r.prevHash ?? null,
        metadata: r.metadata ?? null,
        severity: r.severity,
        success: r.success,
        source: r.source,
      })).digest("hex");
      if (expected !== r.hash) {
        problem = problem ? `${problem}; hash mismatch` : "hash mismatch";
      }
    } else {
      problem = problem ? `${problem}; missing hash` : "missing hash";
    }
    if (problem) {
      broken.push({ id: r.id, reason: problem, createdAt: r.createdAt });
    } else {
      ok += 1;
    }
    prev = r;
  }
  return { totalChecked: rows.length, ok, broken };
}

/* ────────────────────────────────────────────────────────── */
/* Webhooks + retention                                        */
/* ────────────────────────────────────────────────────────── */

export interface WebhookSubscriptionRow {
  id: string;
  name: string;
  url: string;
  actionFilter: string;
  minSeverity: AuditSeverity;
  active: boolean;
  totalDelivered: number;
  totalFailed: number;
  lastDeliveredAt: Date | null;
  lastFailureAt: Date | null;
  lastFailureReason: string | null;
  createdAt: Date;
}

export async function loadWebhookSubscriptions(): Promise<WebhookSubscriptionRow[]> {
  const rows = await db.auditWebhookSubscription.findMany({
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r: AuditWebhookSubscription) => ({
    id: r.id, name: r.name, url: r.url,
    actionFilter: r.actionFilter, minSeverity: r.minSeverity,
    active: r.active,
    totalDelivered: r.totalDelivered, totalFailed: r.totalFailed,
    lastDeliveredAt: r.lastDeliveredAt, lastFailureAt: r.lastFailureAt,
    lastFailureReason: r.lastFailureReason,
    createdAt: r.createdAt,
  }));
}

export interface RetentionPolicy {
  defaultDays: number;
  overrides: Record<string, number>;
  legalHold: boolean;
  updatedAt: Date | null;
}

export async function loadRetentionPolicy(): Promise<RetentionPolicy> {
  const r = await db.auditRetentionPolicy.findUnique({ where: { id: "default" } });
  return {
    defaultDays: r?.defaultDays ?? 2555,
    overrides: (r?.overrides ?? {}) as Record<string, number>,
    legalHold: r?.legalHold ?? false,
    updatedAt: r?.updatedAt ?? null,
  };
}

/* ────────────────────────────────────────────────────────── */
/* Distinct option pools (filter dropdowns)                   */
/* ────────────────────────────────────────────────────────── */

export interface AuditFilterOptions {
  actors: { id: string; label: string }[];
  tenants: { id: string; label: string }[];
  entityTypes: string[];
  actions: string[];
}

export async function loadAuditFilterOptions(): Promise<AuditFilterOptions> {
  const [actors, tenants, distincts] = await Promise.all([
    db.user.findMany({
      where: {
        OR: [{ platformRole: { not: null } }, { customPlatformRoleId: { not: null } }],
      },
      orderBy: { email: "asc" },
      select: { id: true, name: true, email: true },
      take: 200,
    }),
    db.tenant.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
      take: 500,
    }),
    db.auditLog.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 30 * DAY) } },
      select: { entityType: true, action: true },
      distinct: ["entityType", "action"],
      take: 5_000,
    }),
  ]);
  const entityTypes = Array.from(new Set(distincts.map((d) => d.entityType).filter((x): x is string => !!x))).sort();
  const actions = Array.from(new Set(distincts.map((d) => d.action))).sort();
  return {
    actors: actors.map((u) => ({ id: u.id, label: u.name?.trim() || u.email })),
    tenants: tenants.map((t) => ({ id: t.id, label: `${t.name} (${t.slug})` })),
    entityTypes, actions,
  };
}
