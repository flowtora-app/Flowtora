// Page 35 — Announcements & Changelog data layer.
//
// Reads PlatformAnnouncement + PlatformAnnouncementView for the
// command center. The legacy /platform/announcements route uses its
// own loader; this surface mirrors the spec layout (tabs +
// performance dashboard).

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type {
  AnnouncementType,
  AnnouncementPriority,
  AnnouncementStatus,
  AnnouncementAudience,
  AnnouncementChannel,
  AnnouncementFrequencyCap,
  ChangelogCategory,
  AnnouncementRecurrence,
  Plan,
  BetaCohort,
} from "@prisma/client";

const DAY = 86_400_000;

/* ── Tabs / scope ──────────────────────────────────────── */

export type AnnouncementTab =
  | "all"
  | "drafts"
  | "scheduled"
  | "live"
  | "archived"
  | "changelog"
  | "templates";

export const TAB_KEYS: readonly AnnouncementTab[] = [
  "all", "drafts", "scheduled", "live", "archived", "changelog", "templates",
];

export interface AnnouncementListFilters {
  tab: AnnouncementTab;
  q?: string;
  type?: AnnouncementType;
  audience?: AnnouncementAudience;
  channel?: AnnouncementChannel;
}

function buildWhere(filters: AnnouncementListFilters): Prisma.PlatformAnnouncementWhereInput {
  const where: Prisma.PlatformAnnouncementWhereInput = {};
  const ands: Prisma.PlatformAnnouncementWhereInput[] = [];
  const now = new Date();

  switch (filters.tab) {
    case "drafts":    ands.push({ status: "DRAFT" }); break;
    case "scheduled": ands.push({ status: "SCHEDULED" }); break;
    case "live":
      ands.push({ status: "PUBLISHED" });
      ands.push({ OR: [{ expireAt: null }, { expireAt: { gt: now } }] });
      break;
    case "archived":  ands.push({ status: "ARCHIVED" }); break;
    case "changelog": ands.push({ channels: { has: "CHANGELOG" } }); break;
    case "templates":
      // We don't model templates separately yet — surface DRAFT rows
      // tagged "template" as a stop-gap so the tab isn't empty.
      ands.push({ status: "DRAFT" });
      ands.push({ tags: { has: "template" } });
      break;
    case "all":       /* no filter */ break;
  }

  if (filters.type)     ands.push({ type: filters.type });
  if (filters.audience) ands.push({ audience: filters.audience });
  if (filters.channel)  ands.push({ channels: { has: filters.channel } });
  if (filters.q) {
    const q = filters.q.trim();
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { body:  { contains: q, mode: "insensitive" } },
      { tags:  { has: q.toLowerCase() } },
    ];
  }
  if (ands.length > 0) where.AND = ands;
  return where;
}

/* ── KPIs ──────────────────────────────────────────────── */

export interface AnnouncementKpis {
  drafts: number;
  scheduled: number;
  live: number;
  archived: number;
  views30d: number;
  clicks30d: number;
  dismissals30d: number;
  /** clicks / views, 30d. */
  clickRatePct: number | null;
  /** dismissals / views, 30d. */
  dismissalRatePct: number | null;
}

export async function loadAnnouncementKpis(): Promise<AnnouncementKpis> {
  const window30 = new Date(Date.now() - 30 * DAY);
  const now = new Date();

  const [drafts, scheduled, live, archived, viewRows] = await Promise.all([
    db.platformAnnouncement.count({ where: { status: "DRAFT" } }),
    db.platformAnnouncement.count({ where: { status: "SCHEDULED" } }),
    db.platformAnnouncement.count({
      where: {
        status: "PUBLISHED",
        OR: [{ expireAt: null }, { expireAt: { gt: now } }],
      },
    }),
    db.platformAnnouncement.count({ where: { status: "ARCHIVED" } }),
    db.platformAnnouncementView.findMany({
      where: { seenAt: { gte: window30 } },
      select: { dismissedAt: true, clickedAt: true },
      take: 50_000,
    }),
  ]);

  const views30d = viewRows.length;
  const clicks30d = viewRows.filter((v) => v.clickedAt != null).length;
  const dismissals30d = viewRows.filter((v) => v.dismissedAt != null).length;
  const clickRatePct = views30d === 0 ? null : clicks30d / views30d;
  const dismissalRatePct = views30d === 0 ? null : dismissals30d / views30d;

  return {
    drafts, scheduled, live, archived,
    views30d, clicks30d, dismissals30d,
    clickRatePct, dismissalRatePct,
  };
}

/* ── Tab counts ────────────────────────────────────────── */

export interface TabCounts {
  all: number;
  drafts: number;
  scheduled: number;
  live: number;
  archived: number;
  changelog: number;
  templates: number;
}

export async function loadTabCounts(): Promise<TabCounts> {
  const now = new Date();
  const [all, drafts, scheduled, live, archived, changelog, templates] = await Promise.all([
    db.platformAnnouncement.count(),
    db.platformAnnouncement.count({ where: { status: "DRAFT" } }),
    db.platformAnnouncement.count({ where: { status: "SCHEDULED" } }),
    db.platformAnnouncement.count({
      where: {
        status: "PUBLISHED",
        OR: [{ expireAt: null }, { expireAt: { gt: now } }],
      },
    }),
    db.platformAnnouncement.count({ where: { status: "ARCHIVED" } }),
    db.platformAnnouncement.count({ where: { channels: { has: "CHANGELOG" } } }),
    db.platformAnnouncement.count({ where: { status: "DRAFT", tags: { has: "template" } } }),
  ]);
  return { all, drafts, scheduled, live, archived, changelog, templates };
}

/* ── List rows ─────────────────────────────────────────── */

export interface AnnouncementListRow {
  id: string;
  title: string;
  type: AnnouncementType;
  priority: AnnouncementPriority;
  status: AnnouncementStatus;
  audience: AnnouncementAudience;
  channels: AnnouncementChannel[];
  changelogCategory: ChangelogCategory | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  heroImageUrl: string | null;
  publishAt: Date | null;
  publishedAt: Date | null;
  expireAt: Date | null;
  tags: string[];
  authorId: string | null;
  authorName: string | null;
  views: number;
  clicks: number;
  dismissals: number;
  emailedRecipientCount: number;
  emailedAt: Date | null;
  updatedAt: Date;
  /** Effective live state factoring expireAt + publishAt against now. */
  isLive: boolean;
  isExpired: boolean;
}

export interface AnnouncementListResult {
  rows: AnnouncementListRow[];
  total: number;
  filteredTotal: number;
}

export async function loadAnnouncementList(args: {
  filters: AnnouncementListFilters;
  page: number;
  pageSize: number;
}): Promise<AnnouncementListResult> {
  const { filters, page, pageSize } = args;
  const where = buildWhere(filters);

  const [total, filteredTotal, rows] = await Promise.all([
    db.platformAnnouncement.count(),
    db.platformAnnouncement.count({ where }),
    db.platformAnnouncement.findMany({
      where,
      orderBy: [
        { publishedAt: { sort: "desc", nulls: "last" } },
        { publishAt:   { sort: "desc", nulls: "last" } },
        { updatedAt:   "desc" },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  // Author lookup
  const authorIds = Array.from(
    new Set(rows.map((r) => r.authorId).filter((x): x is string => Boolean(x))),
  );
  const authors = authorIds.length === 0
    ? []
    : await db.user.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, name: true, email: true },
      });
  const authorMap = new Map(authors.map((u) => [u.id, u]));

  // Aggregate views/clicks/dismissals by announcement.
  const ids = rows.map((r) => r.id);
  const viewCounts = ids.length === 0
    ? []
    : await db.platformAnnouncementView.groupBy({
        by: ["announcementId"],
        where: { announcementId: { in: ids } },
        _count: { _all: true },
      });
  const clickCounts = ids.length === 0
    ? []
    : await db.platformAnnouncementView.groupBy({
        by: ["announcementId"],
        where: { announcementId: { in: ids }, clickedAt: { not: null } },
        _count: { _all: true },
      });
  const dismissCounts = ids.length === 0
    ? []
    : await db.platformAnnouncementView.groupBy({
        by: ["announcementId"],
        where: { announcementId: { in: ids }, dismissedAt: { not: null } },
        _count: { _all: true },
      });
  const vMap = new Map(viewCounts.map((v) => [v.announcementId, v._count._all]));
  const cMap = new Map(clickCounts.map((v) => [v.announcementId, v._count._all]));
  const dMap = new Map(dismissCounts.map((v) => [v.announcementId, v._count._all]));

  const now = Date.now();
  return {
    total, filteredTotal,
    rows: rows.map((a): AnnouncementListRow => {
      const author = a.authorId ? authorMap.get(a.authorId) : null;
      const isExpired = !!a.expireAt && a.expireAt.getTime() <= now;
      const isLive = a.status === "PUBLISHED" && !isExpired;
      return {
        id: a.id,
        title: a.title,
        type: a.type,
        priority: a.priority,
        status: a.status,
        audience: a.audience,
        channels: a.channels,
        changelogCategory: a.changelogCategory,
        ctaLabel: a.ctaLabel,
        ctaUrl: a.ctaUrl,
        heroImageUrl: a.heroImageUrl,
        publishAt: a.publishAt,
        publishedAt: a.publishedAt,
        expireAt: a.expireAt,
        tags: a.tags,
        authorId: a.authorId,
        authorName: author ? author.name ?? author.email : null,
        views: vMap.get(a.id) ?? 0,
        clicks: cMap.get(a.id) ?? 0,
        dismissals: dMap.get(a.id) ?? 0,
        emailedRecipientCount: a.emailedRecipientCount,
        emailedAt: a.emailedAt,
        updatedAt: a.updatedAt,
        isLive, isExpired,
      };
    }),
  };
}

/* ── Detail ────────────────────────────────────────────── */

export interface AnnouncementDetail {
  id: string;
  title: string;
  body: string;
  type: AnnouncementType;
  priority: AnnouncementPriority;
  status: AnnouncementStatus;
  audience: AnnouncementAudience;
  audiencePlans: string[];
  audienceCohorts: string[];
  audienceTenantIds: string[];
  channels: AnnouncementChannel[];
  ctaLabel: string | null;
  ctaUrl: string | null;
  heroImageUrl: string | null;
  frequencyCap: AnnouncementFrequencyCap;
  changelogCategory: ChangelogCategory | null;
  audienceCustomersOnly: boolean;
  recurrence: AnnouncementRecurrence;
  recurrenceEnd: Date | null;
  publishAt: Date | null;
  expireAt: Date | null;
  publishedAt: Date | null;
  emailedAt: Date | null;
  emailedRecipientCount: number;
  tags: string[];
  authorId: string | null;
  authorName: string | null;
  createdAt: Date;
  updatedAt: Date;
  perf: {
    views: number;
    clicks: number;
    dismissals: number;
    distinctTenants: number;
    /** Estimated audience size — count of tenants matching targeting at read time. */
    audienceTenantCount: number | null;
  };
  channelVariants: {
    channel: AnnouncementChannel;
    title: string | null;
    body: string | null;
    ctaLabel: string | null;
    ctaUrl: string | null;
    heroImageUrl: string | null;
  }[];
  abVariants: {
    id: string;
    label: string;
    title: string | null;
    body: string | null;
    ctaLabel: string | null;
    ctaUrl: string | null;
    weightPct: number;
    viewCount: number;
    clickCount: number;
  }[];
}

export async function loadAnnouncementDetail(id: string): Promise<AnnouncementDetail | null> {
  const a = await db.platformAnnouncement.findUnique({
    where: { id },
    include: {
      channelVariants: true,
      abVariants: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!a) return null;

  const [author, views, clicks, dismissals, distinctTenantRows] = await Promise.all([
    a.authorId
      ? db.user.findUnique({
          where: { id: a.authorId },
          select: { id: true, name: true, email: true },
        })
      : Promise.resolve(null),
    db.platformAnnouncementView.count({ where: { announcementId: id } }),
    db.platformAnnouncementView.count({ where: { announcementId: id, clickedAt: { not: null } } }),
    db.platformAnnouncementView.count({ where: { announcementId: id, dismissedAt: { not: null } } }),
    db.platformAnnouncementView.findMany({
      where: { announcementId: id },
      distinct: ["tenantId"],
      select: { tenantId: true },
      take: 5_000,
    }),
  ]);

  const audienceTenantCount = await estimateAudience(a);

  return {
    id: a.id,
    title: a.title,
    body: a.body,
    type: a.type,
    priority: a.priority,
    status: a.status,
    audience: a.audience,
    audiencePlans: a.audiencePlans,
    audienceCohorts: a.audienceCohorts,
    audienceTenantIds: a.audienceTenantIds,
    channels: a.channels,
    ctaLabel: a.ctaLabel,
    ctaUrl: a.ctaUrl,
    heroImageUrl: a.heroImageUrl,
    frequencyCap: a.frequencyCap,
    changelogCategory: a.changelogCategory,
    audienceCustomersOnly: a.audienceCustomersOnly,
    recurrence: a.recurrence,
    recurrenceEnd: a.recurrenceEnd,
    publishAt: a.publishAt,
    expireAt: a.expireAt,
    publishedAt: a.publishedAt,
    emailedAt: a.emailedAt,
    emailedRecipientCount: a.emailedRecipientCount,
    tags: a.tags,
    authorId: a.authorId,
    authorName: author ? author.name ?? author.email : null,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    perf: {
      views,
      clicks,
      dismissals,
      distinctTenants: distinctTenantRows.length,
      audienceTenantCount,
    },
    channelVariants: a.channelVariants.map((v) => ({
      channel: v.channel,
      title: v.title,
      body: v.body,
      ctaLabel: v.ctaLabel,
      ctaUrl: v.ctaUrl,
      heroImageUrl: v.heroImageUrl,
    })),
    abVariants: a.abVariants.map((v) => ({
      id: v.id,
      label: v.label,
      title: v.title,
      body: v.body,
      ctaLabel: v.ctaLabel,
      ctaUrl: v.ctaUrl,
      weightPct: v.weightPct,
      viewCount: v.viewCount,
      clickCount: v.clickCount,
    })),
  };
}

async function estimateAudience(a: {
  audience: AnnouncementAudience;
  audiencePlans: string[];
  audienceCohorts: string[];
  audienceTenantIds: string[];
}): Promise<number | null> {
  switch (a.audience) {
    case "ALL":   return db.tenant.count();
    case "PLAN":
      if (a.audiencePlans.length === 0) return 0;
      // Plans are stored as strings; cast to the Plan enum at the
      // query boundary. Invalid entries silently miss in the count.
      return db.tenant.count({ where: { plan: { in: a.audiencePlans as Plan[] } } });
    case "COHORT":
      if (a.audienceCohorts.length === 0) return 0;
      return db.tenant.count({ where: { betaCohort: { in: a.audienceCohorts as BetaCohort[] } } });
    case "TENANT":
      return a.audienceTenantIds.length;
    default:
      return null;
  }
}

/* ── Filter options ────────────────────────────────────── */

export interface AnnouncementFilterOptions {
  plans: string[];
  cohorts: string[];
}

export async function loadAnnouncementFilterOptions(): Promise<AnnouncementFilterOptions> {
  const [plans, cohorts] = await Promise.all([
    db.tenant.findMany({
      distinct: ["plan"],
      select: { plan: true },
      take: 50,
    }),
    db.tenant.findMany({
      distinct: ["betaCohort"],
      where: { NOT: { betaCohort: "NONE" } },
      select: { betaCohort: true },
      take: 50,
    }),
  ]);
  return {
    plans: plans.map((p) => p.plan as string),
    cohorts: cohorts.map((c) => c.betaCohort as string),
  };
}
