// Page 30 — Design Asset Library data layer.

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type {
  DesignAssetKind,
  DesignAssetLicense,
  DesignAssetStatus,
} from "@prisma/client";

/* ── KPIs ───────────────────────────────────────────────── */

export interface AssetKpis {
  total: number;
  activeCount: number;
  archivedCount: number;
  byKind: Record<DesignAssetKind, number>;
}

export async function loadAssetKpis(): Promise<AssetKpis> {
  const [byStatus, byKind] = await Promise.all([
    db.designAsset.groupBy({ by: ["status"], _count: { _all: true } }),
    db.designAsset.groupBy({ by: ["kind"], _count: { _all: true } }),
  ]);
  let activeCount = 0;
  let archivedCount = 0;
  for (const r of byStatus) {
    if (r.status === "ACTIVE") activeCount = r._count._all;
    else if (r.status === "ARCHIVED") archivedCount = r._count._all;
  }
  const byKindMap: Record<DesignAssetKind, number> = {
    FONT: 0, ICON: 0, MOCKUP: 0, PALETTE: 0,
    PATTERN: 0, PHOTO: 0, TEMPLATE: 0,
  };
  for (const r of byKind) byKindMap[r.kind] = r._count._all;
  return {
    total: activeCount + archivedCount,
    activeCount, archivedCount,
    byKind: byKindMap,
  };
}

/* ── List ───────────────────────────────────────────────── */

export interface AssetListFilters {
  q?: string;
  kind?: DesignAssetKind;
  license?: DesignAssetLicense;
  status?: DesignAssetStatus;
  tag?: string;
}

export interface AssetListRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: DesignAssetKind;
  thumbnailUrl: string | null;
  paletteColors: string[];
  format: string | null;
  license: DesignAssetLicense;
  status: DesignAssetStatus;
  allowedPlanSlugs: string[];
  tags: string[];
  updatedAt: Date;
}

export interface AssetListResult {
  rows: AssetListRow[];
  total: number;
  filteredTotal: number;
}

export async function loadAssetList(args: {
  filters: AssetListFilters;
  page: number;
  pageSize: number;
}): Promise<AssetListResult> {
  const { filters, page, pageSize } = args;
  const where: Prisma.DesignAssetWhereInput = {};
  if (filters.q) {
    const q = filters.q.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { tags: { has: q.toLowerCase() } },
    ];
  }
  if (filters.kind)    where.kind    = filters.kind;
  if (filters.license) where.license = filters.license;
  if (filters.status)  where.status  = filters.status;
  if (filters.tag)     where.tags    = { has: filters.tag.toLowerCase() };

  const [total, filteredTotal, rows] = await Promise.all([
    db.designAsset.count(),
    db.designAsset.count({ where }),
    db.designAsset.findMany({
      where,
      orderBy: [{ status: "asc" }, { name: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
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
      thumbnailUrl: r.thumbnailUrl,
      paletteColors: r.paletteColors,
      format: r.format,
      license: r.license,
      status: r.status,
      allowedPlanSlugs: r.allowedPlanSlugs,
      tags: r.tags,
      updatedAt: r.updatedAt,
    })),
  };
}

/* ── Detail ─────────────────────────────────────────────── */

export interface AssetDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: DesignAssetKind;
  fileUrl: string | null;
  thumbnailUrl: string | null;
  format: string | null;
  sizeBytes: number | null;
  metadata: unknown;
  paletteColors: string[];
  license: DesignAssetLicense;
  licenseAttribution: string | null;
  licenseUrl: string | null;
  allowedPlanSlugs: string[];
  status: DesignAssetStatus;
  internalNotes: string | null;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export async function loadAssetDetail(id: string): Promise<AssetDetail | null> {
  const a = await db.designAsset.findUnique({ where: { id } });
  if (!a) return null;
  return {
    id: a.id,
    slug: a.slug,
    name: a.name,
    description: a.description,
    kind: a.kind,
    fileUrl: a.fileUrl,
    thumbnailUrl: a.thumbnailUrl,
    format: a.format,
    sizeBytes: a.sizeBytes,
    metadata: a.metadata,
    paletteColors: a.paletteColors,
    license: a.license,
    licenseAttribution: a.licenseAttribution,
    licenseUrl: a.licenseUrl,
    allowedPlanSlugs: a.allowedPlanSlugs,
    status: a.status,
    internalNotes: a.internalNotes,
    tags: a.tags,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}
