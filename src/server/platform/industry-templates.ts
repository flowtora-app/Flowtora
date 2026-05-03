// Page 29 — Industry Templates data layer.

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type {
  IndustryTemplateKind,
  IndustryTemplateStatus,
} from "@prisma/client";

/* ── KPIs ───────────────────────────────────────────────── */

export interface TemplateKpis {
  total: number;
  publishedCount: number;
  draftCount: number;
  archivedCount: number;
  byKind: Record<IndustryTemplateKind, number>;
}

export async function loadTemplateKpis(): Promise<TemplateKpis> {
  const [byStatus, byKind] = await Promise.all([
    db.industryTemplate.groupBy({ by: ["status"], _count: { _all: true } }),
    db.industryTemplate.groupBy({ by: ["kind"], _count: { _all: true } }),
  ]);
  let publishedCount = 0;
  let draftCount = 0;
  let archivedCount = 0;
  for (const r of byStatus) {
    if (r.status === "PUBLISHED") publishedCount = r._count._all;
    else if (r.status === "DRAFT") draftCount = r._count._all;
    else if (r.status === "ARCHIVED") archivedCount = r._count._all;
  }
  const byKindMap: Record<IndustryTemplateKind, number> = {
    STOREFRONT: 0, QUOTE_PDF: 0, WORK_ORDER: 0,
    INVOICE: 0, PROOF_EMAIL: 0, CUSTOMER_EMAIL: 0,
  };
  for (const r of byKind) byKindMap[r.kind] = r._count._all;
  return {
    total: publishedCount + draftCount + archivedCount,
    publishedCount, draftCount, archivedCount,
    byKind: byKindMap,
  };
}

/* ── List ───────────────────────────────────────────────── */

export interface TemplateListFilters {
  q?: string;
  kind?: IndustryTemplateKind;
  status?: IndustryTemplateStatus;
  locale?: string;
  tag?: string;
}

export interface TemplateListRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: IndustryTemplateKind;
  status: IndustryTemplateStatus;
  thumbnailUrl: string | null;
  locale: string;
  versionCount: number;
  updatedAt: Date;
  tags: string[];
}

export interface TemplateListResult {
  rows: TemplateListRow[];
  total: number;
  filteredTotal: number;
}

export async function loadTemplateList(args: {
  filters: TemplateListFilters;
  page: number;
  pageSize: number;
}): Promise<TemplateListResult> {
  const { filters, page, pageSize } = args;
  const where: Prisma.IndustryTemplateWhereInput = {};
  if (filters.q) {
    const q = filters.q.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { tags: { has: q.toLowerCase() } },
    ];
  }
  if (filters.kind)   where.kind = filters.kind;
  if (filters.status) where.status = filters.status;
  if (filters.locale) where.locale = filters.locale;
  if (filters.tag)    where.tags = { has: filters.tag.toLowerCase() };

  const [total, filteredTotal, rows] = await Promise.all([
    db.industryTemplate.count(),
    db.industryTemplate.count({ where }),
    db.industryTemplate.findMany({
      where,
      orderBy: [{ status: "asc" }, { name: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { versions: true } } },
    }),
  ]);
  return {
    total, filteredTotal,
    rows: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      kind: r.kind,
      status: r.status,
      thumbnailUrl: r.thumbnailUrl,
      locale: r.locale,
      versionCount: r._count.versions,
      updatedAt: r.updatedAt,
      tags: r.tags,
    })),
  };
}

/* ── Detail ─────────────────────────────────────────────── */

export interface TemplateDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: IndustryTemplateKind;
  subject: string | null;
  bodyHtml: string;
  bodyText: string | null;
  thumbnailUrl: string | null;
  locale: string;
  status: IndustryTemplateStatus;
  internalNotes: string | null;
  tags: string[];
  variables: string[];
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  versions: {
    id: string;
    version: number;
    note: string | null;
    publishedByUserId: string | null;
    createdAt: Date;
  }[];
}

export async function loadTemplateDetail(id: string): Promise<TemplateDetail | null> {
  const t = await db.industryTemplate.findUnique({
    where: { id },
    include: { versions: { orderBy: { version: "desc" }, take: 25 } },
  });
  if (!t) return null;
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    description: t.description,
    kind: t.kind,
    subject: t.subject,
    bodyHtml: t.bodyHtml,
    bodyText: t.bodyText,
    thumbnailUrl: t.thumbnailUrl,
    locale: t.locale,
    status: t.status,
    internalNotes: t.internalNotes,
    tags: t.tags,
    variables: t.variables,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    publishedAt: t.publishedAt,
    versions: t.versions.map((v) => ({
      id: v.id,
      version: v.version,
      note: v.note,
      publishedByUserId: v.publishedByUserId,
      createdAt: v.createdAt,
    })),
  };
}
