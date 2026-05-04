// Page 36 — Feature Requests / Roadmap data layer.
//
// Powers the kanban board, list, roadmap timeline, and submitted-triage
// tabs at /platform/operations/feature-requests, plus the public
// /roadmap surface.

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type {
  FeatureRequestStatus,
  EngineeringEffort,
  VoteDirection,
} from "@prisma/client";

const DAY = 86_400_000;

/* ── Tabs ──────────────────────────────────────────────── */

export type FeatureRequestTab = "board" | "list" | "roadmap" | "submitted";
export const TAB_KEYS: readonly FeatureRequestTab[] = ["board", "list", "roadmap", "submitted"];

export const KANBAN_COLUMNS: FeatureRequestStatus[] = [
  "BACKLOG", "UNDER_REVIEW", "PLANNED", "IN_PROGRESS", "BETA", "SHIPPED", "WONT_DO",
];

/** WIP limits per column — soft cap surfaced in the UI as a warning. */
export const WIP_LIMITS: Partial<Record<FeatureRequestStatus, number>> = {
  PLANNED: 12,
  IN_PROGRESS: 5,
  BETA: 4,
};

/* ── Filters ───────────────────────────────────────────── */

export interface FeatureRequestFilters {
  q?: string;
  status?: FeatureRequestStatus;
  effort?: EngineeringEffort;
  swimlane?: string;
  tag?: string;
  isPublic?: boolean;
  /** "submitted" tab — pin to SUBMITTED only. */
  pinSubmitted?: boolean;
}

function buildWhere(filters: FeatureRequestFilters): Prisma.FeatureRequestWhereInput {
  const where: Prisma.FeatureRequestWhereInput = { mergedIntoId: null };
  const ands: Prisma.FeatureRequestWhereInput[] = [];
  if (filters.pinSubmitted) ands.push({ status: "SUBMITTED" });
  if (filters.status) ands.push({ status: filters.status });
  if (filters.effort) ands.push({ effort: filters.effort });
  if (filters.swimlane) ands.push({ swimlane: filters.swimlane });
  if (filters.tag) ands.push({ tags: { has: filters.tag.toLowerCase() } });
  if (filters.isPublic != null) ands.push({ isPublic: filters.isPublic });
  if (filters.q) {
    const q = filters.q.trim();
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { tags: { has: q.toLowerCase() } },
    ];
  }
  if (ands.length > 0) where.AND = ands;
  return where;
}

/* ── KPIs ──────────────────────────────────────────────── */

export interface FeatureRequestKpis {
  submittedCount: number;
  inProgressCount: number;
  betaCount: number;
  shippedThisQuarterCount: number;
  totalVotes: number;
  publicCount: number;
}

export async function loadFeatureRequestKpis(): Promise<FeatureRequestKpis> {
  const now = new Date();
  const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  const [byStatus, agg, publicCount, shippedQ] = await Promise.all([
    db.featureRequest.groupBy({
      by: ["status"],
      where: { mergedIntoId: null },
      _count: { _all: true },
    }),
    db.featureRequest.aggregate({
      where: { mergedIntoId: null },
      _sum: { upvoteCount: true },
    }),
    db.featureRequest.count({
      where: { mergedIntoId: null, isPublic: true },
    }),
    db.featureRequest.count({
      where: { mergedIntoId: null, status: "SHIPPED", shippedAt: { gte: quarterStart } },
    }),
  ]);
  const map = new Map<FeatureRequestStatus, number>();
  for (const r of byStatus) map.set(r.status, r._count._all);
  return {
    submittedCount: map.get("SUBMITTED") ?? 0,
    inProgressCount: map.get("IN_PROGRESS") ?? 0,
    betaCount: map.get("BETA") ?? 0,
    shippedThisQuarterCount: shippedQ,
    totalVotes: agg._sum.upvoteCount ?? 0,
    publicCount,
  };
}

/* ── List rows ─────────────────────────────────────────── */

export interface FeatureRequestRow {
  id: string;
  title: string;
  description: string;
  status: FeatureRequestStatus;
  upvoteCount: number;
  downvoteCount: number;
  iceImpact: number | null;
  iceConfidence: number | null;
  iceEase: number | null;
  iceScore: number | null;
  effort: EngineeringEffort | null;
  plannedRelease: string | null;
  swimlane: string | null;
  isPublic: boolean;
  tags: string[];
  submitterUserId: string | null;
  submitterUserName: string | null;
  submitterTenantId: string | null;
  submitterTenantName: string | null;
  linkedSupportTicketIds: string[];
  linkedBugId: string | null;
  commentCount: number;
  voteCount: number;
  createdAt: Date;
  updatedAt: Date;
  shippedAt: Date | null;
}

function iceScoreOf(impact: number | null, conf: number | null, ease: number | null): number | null {
  if (impact == null || conf == null || ease == null) return null;
  return Math.round((impact * conf * ease) / 10);
}

export interface FeatureRequestList {
  rows: FeatureRequestRow[];
  total: number;
  filteredTotal: number;
}

export async function loadFeatureRequestList(args: {
  filters: FeatureRequestFilters;
  page: number;
  pageSize: number;
}): Promise<FeatureRequestList> {
  const where = buildWhere(args.filters);
  const [total, filteredTotal, rows] = await Promise.all([
    db.featureRequest.count({ where: { mergedIntoId: null } }),
    db.featureRequest.count({ where }),
    db.featureRequest.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      skip: (args.page - 1) * args.pageSize,
      take: args.pageSize,
      include: {
        _count: { select: { comments: true, votes: true } },
      },
    }),
  ]);
  return enrichRows(rows, total, filteredTotal);
}

/** Loads ALL rows (no pagination) for the kanban board / roadmap. */
export async function loadFeatureRequestBoard(filters: FeatureRequestFilters = {}) {
  const where = buildWhere(filters);
  const rows = await db.featureRequest.findMany({
    where,
    orderBy: [{ status: "asc" }, { upvoteCount: "desc" }, { updatedAt: "desc" }],
    include: { _count: { select: { comments: true, votes: true } } },
    take: 2000,
  });
  return enrichRows(rows, rows.length, rows.length);
}

async function enrichRows(
  rows: (Prisma.FeatureRequestGetPayload<{ include: { _count: { select: { comments: true; votes: true } } } }>)[],
  total: number,
  filteredTotal: number,
): Promise<FeatureRequestList> {
  // Hydrate submitter user/tenant for the rows.
  const userIds = Array.from(new Set(rows.map((r) => r.submitterUserId).filter((x): x is string => Boolean(x))));
  const tenantIds = Array.from(new Set(rows.map((r) => r.submitterTenantId).filter((x): x is string => Boolean(x))));
  const [users, tenants] = await Promise.all([
    userIds.length === 0
      ? Promise.resolve([] as { id: string; name: string | null; email: string }[])
      : db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }),
    tenantIds.length === 0
      ? Promise.resolve([] as { id: string; name: string }[])
      : db.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } }),
  ]);
  const userMap = new Map(users.map((u) => [u.id, u]));
  const tenantMap = new Map(tenants.map((t) => [t.id, t]));

  return {
    total,
    filteredTotal,
    rows: rows.map((r): FeatureRequestRow => {
      const u = r.submitterUserId ? userMap.get(r.submitterUserId) : null;
      const t = r.submitterTenantId ? tenantMap.get(r.submitterTenantId) : null;
      return {
        id: r.id,
        title: r.title,
        description: r.description,
        status: r.status,
        upvoteCount: r.upvoteCount,
        downvoteCount: r.downvoteCount,
        iceImpact: r.iceImpact,
        iceConfidence: r.iceConfidence,
        iceEase: r.iceEase,
        iceScore: iceScoreOf(r.iceImpact, r.iceConfidence, r.iceEase),
        effort: r.effort,
        plannedRelease: r.plannedRelease,
        swimlane: r.swimlane,
        isPublic: r.isPublic,
        tags: r.tags,
        submitterUserId: r.submitterUserId,
        submitterUserName: u ? u.name ?? u.email : null,
        submitterTenantId: r.submitterTenantId,
        submitterTenantName: t ? t.name : null,
        linkedSupportTicketIds: r.linkedSupportTicketIds,
        linkedBugId: r.linkedBugId,
        commentCount: r._count.comments,
        voteCount: r._count.votes,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        shippedAt: r.shippedAt,
      };
    }),
  };
}

/* ── Detail ────────────────────────────────────────────── */

export interface FeatureRequestDetail extends FeatureRequestRow {
  comments: { id: string; body: string; authorId: string; authorName: string | null; createdAt: Date }[];
  /** Other open requests that share ≥1 tag — auto-suggested related. */
  relatedRequests: { id: string; title: string; status: FeatureRequestStatus; voteCount: number }[];
  /** Linked tickets resolved with subjects. */
  linkedTickets: { id: string; subject: string; status: string }[];
  /** Status timeline — derived from createdAt + status transitions stored in audit. */
  timeline: { event: string; at: Date }[];
  /** Merged-in requests (this row is a survivor). */
  mergedIn: { id: string; title: string; mergedAt: Date }[];
}

export async function loadFeatureRequestDetail(id: string): Promise<FeatureRequestDetail | null> {
  const row = await db.featureRequest.findUnique({
    where: { id },
    include: {
      comments: { orderBy: { createdAt: "asc" }, take: 200 },
      _count: { select: { comments: true, votes: true } },
    },
  });
  if (!row) return null;

  const authorIds = Array.from(new Set(row.comments.map((c) => c.authorId)));
  const [users, tenant, tickets, mergedIn, related] = await Promise.all([
    authorIds.length === 0
      ? Promise.resolve([] as { id: string; name: string | null; email: string }[])
      : db.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true, email: true } }),
    row.submitterTenantId
      ? db.tenant.findUnique({ where: { id: row.submitterTenantId }, select: { id: true, name: true } })
      : Promise.resolve(null),
    row.linkedSupportTicketIds.length === 0
      ? Promise.resolve([] as { id: string; subject: string; status: string }[])
      : db.supportTicket.findMany({
          where: { id: { in: row.linkedSupportTicketIds } },
          select: { id: true, subject: true, status: true },
        }),
    db.featureRequest.findMany({
      where: { mergedIntoId: id },
      select: { id: true, title: true, mergedAt: true },
    }),
    db.featureRequest.findMany({
      where: {
        mergedIntoId: null,
        id: { not: id },
        OR: [
          { tags: { hasSome: row.tags } },
        ],
        status: { notIn: ["SHIPPED", "WONT_DO"] },
      },
      orderBy: { upvoteCount: "desc" },
      take: 5,
      include: { _count: { select: { votes: true } } },
    }),
  ]);
  const userMap = new Map(users.map((u) => [u.id, u]));
  const submitterUser = row.submitterUserId ? users.find((u) => u.id === row.submitterUserId) ?? null : null;

  const timeline: { event: string; at: Date }[] = [
    { event: "Submitted", at: row.createdAt },
  ];
  if (row.shippedAt) timeline.push({ event: "Shipped", at: row.shippedAt });
  if (row.mergedAt) timeline.push({ event: "Merged", at: row.mergedAt });
  // updatedAt as a "Last edited" entry — only when distinct from created.
  if (row.updatedAt.getTime() - row.createdAt.getTime() > 60_000) {
    timeline.push({ event: "Last edited", at: row.updatedAt });
  }

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    upvoteCount: row.upvoteCount,
    downvoteCount: row.downvoteCount,
    iceImpact: row.iceImpact,
    iceConfidence: row.iceConfidence,
    iceEase: row.iceEase,
    iceScore: iceScoreOf(row.iceImpact, row.iceConfidence, row.iceEase),
    effort: row.effort,
    plannedRelease: row.plannedRelease,
    swimlane: row.swimlane,
    isPublic: row.isPublic,
    tags: row.tags,
    submitterUserId: row.submitterUserId,
    submitterUserName: submitterUser ? submitterUser.name ?? submitterUser.email : null,
    submitterTenantId: row.submitterTenantId,
    submitterTenantName: tenant ? tenant.name : null,
    linkedSupportTicketIds: row.linkedSupportTicketIds,
    linkedBugId: row.linkedBugId,
    commentCount: row._count.comments,
    voteCount: row._count.votes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    shippedAt: row.shippedAt,
    comments: row.comments.map((c) => ({
      id: c.id,
      body: c.body,
      authorId: c.authorId,
      authorName: (() => {
        const u = userMap.get(c.authorId);
        return u ? u.name ?? u.email : null;
      })(),
      createdAt: c.createdAt,
    })),
    relatedRequests: related.map((r) => ({
      id: r.id, title: r.title, status: r.status, voteCount: r._count.votes,
    })),
    linkedTickets: tickets,
    timeline,
    mergedIn: mergedIn.map((m) => ({
      id: m.id, title: m.title, mergedAt: m.mergedAt ?? new Date(0),
    })),
  };
}

/* ── User vote (per request) ───────────────────────────── */

export async function loadUserVote(requestId: string, userId: string): Promise<VoteDirection | null> {
  const v = await db.featureRequestVote.findUnique({
    where: { requestId_userId: { requestId, userId } },
    select: { direction: true },
  });
  return v?.direction ?? null;
}

/* ── Filter options ────────────────────────────────────── */

export interface FeatureRequestFilterOptions {
  swimlanes: string[];
  releases: string[];
  tags: string[];
}

export async function loadFeatureRequestFilterOptions(): Promise<FeatureRequestFilterOptions> {
  const [swimlaneRows, releaseRows, tagRows] = await Promise.all([
    db.featureRequest.findMany({
      where: { mergedIntoId: null, swimlane: { not: null } },
      distinct: ["swimlane"],
      select: { swimlane: true },
    }),
    db.featureRequest.findMany({
      where: { mergedIntoId: null, plannedRelease: { not: null } },
      distinct: ["plannedRelease"],
      select: { plannedRelease: true },
    }),
    db.featureRequest.findMany({
      where: { mergedIntoId: null },
      select: { tags: true },
      take: 1000,
    }),
  ]);
  const tagSet = new Set<string>();
  for (const r of tagRows) for (const t of r.tags) tagSet.add(t);
  return {
    swimlanes: swimlaneRows.map((r) => r.swimlane).filter((x): x is string => Boolean(x)),
    releases: releaseRows.map((r) => r.plannedRelease).filter((x): x is string => Boolean(x)).sort(),
    tags: Array.from(tagSet).sort(),
  };
}

/* ── Public roadmap config + reads ─────────────────────── */

export const PUBLIC_ROADMAP_COLUMNS: FeatureRequestStatus[] = [
  "PLANNED", "IN_PROGRESS", "BETA", "SHIPPED",
];

export interface PublicRoadmapItem {
  id: string;
  title: string;
  description: string;
  status: FeatureRequestStatus;
  plannedRelease: string | null;
  shippedAt: Date | null;
  voteCount: number;
}

export async function loadPublicRoadmap(): Promise<PublicRoadmapItem[]> {
  const rows = await db.featureRequest.findMany({
    where: {
      mergedIntoId: null,
      isPublic: true,
      status: { in: PUBLIC_ROADMAP_COLUMNS },
    },
    orderBy: [{ status: "asc" }, { upvoteCount: "desc" }],
    include: { _count: { select: { votes: true } } },
    take: 200,
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    plannedRelease: r.plannedRelease,
    shippedAt: r.shippedAt,
    voteCount: r._count.votes,
  }));
}

/* ── Roadmap timeline (for the admin tab) ─────────────── */

export interface RoadmapLane {
  swimlane: string;
  items: {
    id: string;
    title: string;
    status: FeatureRequestStatus;
    plannedRelease: string | null;
    effort: EngineeringEffort | null;
    voteCount: number;
  }[];
}

export async function loadRoadmapLanes(): Promise<RoadmapLane[]> {
  const rows = await db.featureRequest.findMany({
    where: {
      mergedIntoId: null,
      status: { in: ["PLANNED", "IN_PROGRESS", "BETA", "SHIPPED"] },
    },
    orderBy: [{ swimlane: "asc" }, { plannedRelease: "asc" }, { upvoteCount: "desc" }],
    include: { _count: { select: { votes: true } } },
    take: 500,
  });
  const byLane = new Map<string, RoadmapLane["items"]>();
  for (const r of rows) {
    const lane = r.swimlane ?? "Unassigned";
    const list = byLane.get(lane) ?? [];
    list.push({
      id: r.id,
      title: r.title,
      status: r.status,
      plannedRelease: r.plannedRelease,
      effort: r.effort,
      voteCount: r._count.votes,
    });
    byLane.set(lane, list);
  }
  return Array.from(byLane.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([swimlane, items]) => ({ swimlane, items }));
}

/* ── Quarter helpers (for roadmap timeline) ──────────── */

export function currentQuarterCode(): string {
  const d = new Date();
  return `${d.getFullYear()}Q${Math.floor(d.getMonth() / 3) + 1}`;
}

export function nextNQuarters(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  let year = d.getFullYear();
  let q = Math.floor(d.getMonth() / 3) + 1;
  for (let i = 0; i < n; i++) {
    out.push(`${year}Q${q}`);
    q += 1;
    if (q > 4) { q = 1; year += 1; }
  }
  return out;
}
