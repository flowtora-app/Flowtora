// Impersonation Sessions server data layer — Page 8 of the admin
// spec.
//
// Three tabs read from this file:
//   • Active  — currently-running sessions (endedAt IS NULL)
//   • History — every session, with filters
//   • Settings — singleton compliance row (lazy-seeded)
//
// We don't ship "WebSocket live updates" today; the Active tab is a
// regular server component that the client polls every 10s via
// router.refresh() to keep duration counters honest. Spec acknowledges
// real-time as a follow-up.

import { db } from "@/lib/db";
import type {
  ImpersonationCategory,
  ImpersonationEndReason,
  ImpersonationSettings,
} from "@prisma/client";
import { Prisma } from "@prisma/client";

const DAY = 86_400_000;

/* ────────────────────────────────────────────────────────── */
/* Settings                                                   */
/* ────────────────────────────────────────────────────────── */

export interface ResolvedSettings {
  maxDurationMin: number;
  idleTimeoutMin: number;
  reasonRequired: boolean;
  approvalRequired: boolean;
  approverIds: string[];
  bannerCopy: string;
  recordingRetentionDays: number;
  auditOnlyMode: boolean;
  disabledActions: string[];
  updatedAt: Date | null;
  updatedBy: string | null;
}

const DEFAULT_BANNER_COPY = "You are impersonating {tenant}. Started {time} · {duration} elapsed.";

export async function loadImpersonationSettings(): Promise<ResolvedSettings> {
  const row = await db.impersonationSettings.findUnique({ where: { id: "default" } });
  return resolve(row);
}

function resolve(row: ImpersonationSettings | null): ResolvedSettings {
  return {
    maxDurationMin: row?.maxDurationMin ?? 60,
    idleTimeoutMin: row?.idleTimeoutMin ?? 15,
    reasonRequired: row?.reasonRequired ?? true,
    approvalRequired: row?.approvalRequired ?? false,
    approverIds: row?.approverIds ?? [],
    bannerCopy: row?.bannerCopy ?? DEFAULT_BANNER_COPY,
    recordingRetentionDays: row?.recordingRetentionDays ?? 90,
    auditOnlyMode: row?.auditOnlyMode ?? false,
    disabledActions: row?.disabledActions ?? [],
    updatedAt: row?.updatedAt ?? null,
    updatedBy: row?.updatedBy ?? null,
  };
}

/* ────────────────────────────────────────────────────────── */
/* Active sessions                                            */
/* ────────────────────────────────────────────────────────── */

export interface ActiveSessionRow {
  id: string;
  startedAt: Date;
  durationSec: number;          // live, computed at read time
  reason: string | null;
  categoryCode: ImpersonationCategory;
  expectedDurationMin: number | null;
  ip: string | null;
  userAgent: string | null;
  actionsCount: number;
  lastActivityAt: Date | null;
  /** True when duration has crossed the configured maxDurationMin. */
  overMaxDuration: boolean;
  /** True when lastActivityAt drifted past idleTimeoutMin. */
  idleTimedOut: boolean;
  admin: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
}

export async function loadActiveSessions(settings?: ResolvedSettings): Promise<ActiveSessionRow[]> {
  const cfg = settings ?? (await loadImpersonationSettings());
  const rows = await db.impersonationSession.findMany({
    where: { endedAt: null },
    orderBy: { startedAt: "desc" },
    take: 200,
  });
  if (rows.length === 0) return [];

  const adminIds = Array.from(new Set(rows.map((r) => r.platformUserId)));
  const tenantIds = Array.from(new Set(rows.map((r) => r.tenantId)));
  const [admins, tenants] = await Promise.all([
    db.user.findMany({
      where: { id: { in: adminIds } },
      select: { id: true, name: true, email: true, image: true },
    }),
    db.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { id: true, name: true, slug: true },
    }),
  ]);
  const adminMap = new Map(admins.map((a) => [a.id, a]));
  const tenantMap = new Map(tenants.map((t) => [t.id, t]));

  const now = Date.now();
  return rows.map((r) => {
    const durationSec = Math.max(0, Math.floor((now - r.startedAt.getTime()) / 1000));
    const overMaxDuration = durationSec / 60 > cfg.maxDurationMin;
    const idleSinceMs = r.lastActivityAt ? now - r.lastActivityAt.getTime() : 0;
    const idleTimedOut = !!r.lastActivityAt && idleSinceMs / 60_000 > cfg.idleTimeoutMin;
    return {
      id: r.id,
      startedAt: r.startedAt,
      durationSec,
      reason: r.reason,
      categoryCode: r.categoryCode,
      expectedDurationMin: r.expectedDurationMin,
      ip: r.ip,
      userAgent: r.userAgent,
      actionsCount: r.actionsCount,
      lastActivityAt: r.lastActivityAt,
      overMaxDuration,
      idleTimedOut,
      admin: adminMap.get(r.platformUserId) ?? {
        id: r.platformUserId, name: null, email: "(deleted)", image: null,
      },
      tenant: tenantMap.get(r.tenantId) ?? {
        id: r.tenantId, name: "(unknown)", slug: "",
      },
    };
  });
}

/* ────────────────────────────────────────────────────────── */
/* History                                                    */
/* ────────────────────────────────────────────────────────── */

export interface HistoryFilters {
  adminId?: string;
  tenantId?: string;
  /** ISO date-only — sessions that started on or after. */
  since?: Date;
  until?: Date;
  /** Min duration in minutes. */
  minDurationMin?: number;
  /** Max duration in minutes. */
  maxDurationMin?: number;
  /** Filter by recording presence — we don't actually record video,
   *  but the action timeline counts as "has recording" when there's
   *  at least one audit row. */
  hasActions?: boolean;
  /** Only those that ended in this manner. */
  endedReason?: ImpersonationEndReason;
}

export interface HistoryRow {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  durationMin: number | null;
  reason: string | null;
  categoryCode: ImpersonationCategory;
  endedReason: ImpersonationEndReason | null;
  actionsCount: number;
  ip: string | null;
  admin: { id: string; name: string | null; email: string };
  tenant: { id: string; name: string; slug: string };
}

export async function loadHistory(
  filters: HistoryFilters = {},
  page = 1,
  pageSize = 50,
): Promise<{ rows: HistoryRow[]; total: number }> {
  const where: Prisma.ImpersonationSessionWhereInput = {};
  if (filters.adminId) where.platformUserId = filters.adminId;
  if (filters.tenantId) where.tenantId = filters.tenantId;
  if (filters.since || filters.until) {
    const startedAt: Prisma.DateTimeFilter = {};
    if (filters.since) startedAt.gte = filters.since;
    if (filters.until) startedAt.lte = filters.until;
    where.startedAt = startedAt;
  }
  if (filters.endedReason) where.endedReason = filters.endedReason;
  if (filters.hasActions === true) where.actionsCount = { gt: 0 };
  if (filters.hasActions === false) where.actionsCount = 0;

  const [rows, total] = await Promise.all([
    db.impersonationSession.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.impersonationSession.count({ where }),
  ]);

  // Resolve admin + tenant in batches.
  const adminIds = Array.from(new Set(rows.map((r) => r.platformUserId)));
  const tenantIds = Array.from(new Set(rows.map((r) => r.tenantId)));
  const [admins, tenants] = await Promise.all([
    adminIds.length === 0 ? [] : db.user.findMany({
      where: { id: { in: adminIds } },
      select: { id: true, name: true, email: true },
    }),
    tenantIds.length === 0 ? [] : db.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { id: true, name: true, slug: true },
    }),
  ]);
  const adminMap = new Map(admins.map((a) => [a.id, a]));
  const tenantMap = new Map(tenants.map((t) => [t.id, t]));

  let mapped: HistoryRow[] = rows.map((r) => {
    const durationMin = r.endedAt ? Math.max(0, Math.round((r.endedAt.getTime() - r.startedAt.getTime()) / 60_000)) : null;
    return {
      id: r.id,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      durationMin,
      reason: r.reason,
      categoryCode: r.categoryCode,
      endedReason: r.endedReason,
      actionsCount: r.actionsCount,
      ip: r.ip,
      admin: adminMap.get(r.platformUserId) ?? {
        id: r.platformUserId, name: null, email: "(deleted)",
      },
      tenant: tenantMap.get(r.tenantId) ?? {
        id: r.tenantId, name: "(unknown)", slug: "",
      },
    };
  });

  // Min/max duration filtering happens post-aggregate because
  // durationMin is computed.
  if (filters.minDurationMin != null) {
    const min = filters.minDurationMin;
    mapped = mapped.filter((r) => r.durationMin != null && r.durationMin >= min);
  }
  if (filters.maxDurationMin != null) {
    const max = filters.maxDurationMin;
    mapped = mapped.filter((r) => r.durationMin != null && r.durationMin <= max);
  }

  return { rows: mapped, total };
}

/* ────────────────────────────────────────────────────────── */
/* Session detail (with action timeline)                       */
/* ────────────────────────────────────────────────────────── */

export interface SessionTimelineEntry {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: Date;
  metadata: Record<string, unknown> | null;
}

export interface SessionDetail {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  durationSec: number;
  reason: string | null;
  notes: string | null;
  categoryCode: ImpersonationCategory;
  expectedDurationMin: number | null;
  endedReason: ImpersonationEndReason | null;
  endedBy: { id: string; name: string | null; email: string } | null;
  approvedBy: { id: string; name: string | null; email: string } | null;
  approvedAt: Date | null;
  actionsCount: number;
  ip: string | null;
  userAgent: string | null;
  lastActivityAt: Date | null;
  admin: { id: string; name: string | null; email: string; image: string | null };
  tenant: { id: string; name: string; slug: string };
  timeline: SessionTimelineEntry[];
}

export async function loadSessionDetail(id: string): Promise<SessionDetail | null> {
  const row = await db.impersonationSession.findUnique({ where: { id } });
  if (!row) return null;

  const userIds = [row.platformUserId, row.endedById, row.approvedById].filter(Boolean) as string[];
  const [users, tenant, timeline] = await Promise.all([
    userIds.length === 0 ? [] : db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true, image: true },
    }),
    db.tenant.findUnique({
      where: { id: row.tenantId },
      select: { id: true, name: true, slug: true },
    }),
    db.auditLog.findMany({
      where: { impersonationSessionId: id },
      orderBy: { createdAt: "asc" },
      take: 1_000,
      select: {
        id: true, action: true, entityType: true, entityId: true,
        createdAt: true, metadata: true,
      },
    }),
  ]);
  const userMap = new Map(users.map((u) => [u.id, u]));
  const admin = userMap.get(row.platformUserId);
  const endedAtMs = row.endedAt?.getTime() ?? Date.now();
  const durationSec = Math.max(0, Math.floor((endedAtMs - row.startedAt.getTime()) / 1000));

  return {
    id: row.id,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    durationSec,
    reason: row.reason,
    notes: row.notes,
    categoryCode: row.categoryCode,
    expectedDurationMin: row.expectedDurationMin,
    endedReason: row.endedReason,
    endedBy: row.endedById ? (userMap.get(row.endedById) ?? null) : null,
    approvedBy: row.approvedById ? (userMap.get(row.approvedById) ?? null) : null,
    approvedAt: row.approvedAt,
    actionsCount: row.actionsCount,
    ip: row.ip,
    userAgent: row.userAgent,
    lastActivityAt: row.lastActivityAt,
    admin: admin ? { id: admin.id, name: admin.name, email: admin.email, image: admin.image }
                 : { id: row.platformUserId, name: null, email: "(deleted)", image: null },
    tenant: tenant ?? { id: row.tenantId, name: "(unknown)", slug: "" },
    timeline: timeline.map((t) => ({
      id: t.id,
      action: t.action,
      entityType: t.entityType,
      entityId: t.entityId,
      createdAt: t.createdAt,
      metadata: (t.metadata ?? null) as Record<string, unknown> | null,
    })),
  };
}

/* ────────────────────────────────────────────────────────── */
/* KPIs                                                       */
/* ────────────────────────────────────────────────────────── */

export interface ImpersonationKpi {
  activeCount: number;
  totalLast30d: number;
  forceEndedLast30d: number;
  expiredLast30d: number;
  avgDurationMin: number | null;
}

export async function loadKpi(): Promise<ImpersonationKpi> {
  const since = new Date(Date.now() - 30 * DAY);
  const [activeCount, recent] = await Promise.all([
    db.impersonationSession.count({ where: { endedAt: null } }),
    db.impersonationSession.findMany({
      where: { startedAt: { gte: since } },
      select: { startedAt: true, endedAt: true, endedReason: true },
    }),
  ]);
  let durationSum = 0;
  let durationN = 0;
  let force = 0;
  let expired = 0;
  for (const r of recent) {
    if (r.endedAt) {
      const min = (r.endedAt.getTime() - r.startedAt.getTime()) / 60_000;
      if (min >= 0) { durationSum += min; durationN += 1; }
    }
    if (r.endedReason === "FORCE_ENDED") force += 1;
    if (r.endedReason === "EXPIRED" || r.endedReason === "IDLE_TIMEOUT") expired += 1;
  }
  return {
    activeCount,
    totalLast30d: recent.length,
    forceEndedLast30d: force,
    expiredLast30d: expired,
    avgDurationMin: durationN === 0 ? null : Math.round(durationSum / durationN),
  };
}

/* ────────────────────────────────────────────────────────── */
/* Helpers                                                    */
/* ────────────────────────────────────────────────────────── */

export const IMPERSONATION_CATEGORY_LABEL: Record<ImpersonationCategory, string> = {
  SUPPORT_INVESTIGATION: "Support investigation",
  CUSTOMER_REQUESTED_FIX: "Customer-requested fix",
  BUG_REPRO: "Bug repro",
  ONBOARDING_ASSIST: "Onboarding assist",
  COMPLIANCE_AUDIT: "Compliance audit",
  OTHER: "Other",
};

export const IMPERSONATION_END_REASON_LABEL: Record<ImpersonationEndReason, string> = {
  COMPLETED: "Completed",
  FORCE_ENDED: "Force-ended",
  EXPIRED: "Expired",
  IDLE_TIMEOUT: "Idle timeout",
};
