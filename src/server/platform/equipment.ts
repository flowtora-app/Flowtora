// Page 27 — Master Equipment Templates data layer.

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type {
  MasterEquipmentCategory,
  MasterEquipmentStatus,
  MasterMaintenanceFrequency,
} from "@prisma/client";

/* ── KPIs ───────────────────────────────────────────────── */

export interface EquipmentKpis {
  total: number;
  activeCount: number;
  discontinuedCount: number;
  categoriesUsed: number;
  /** Brands with at least one equipment template. */
  brands: number;
}

export async function loadEquipmentKpis(): Promise<EquipmentKpis> {
  const [byStatus, distinctCategories, distinctBrands] = await Promise.all([
    db.masterEquipment.groupBy({ by: ["status"], _count: { _all: true } }),
    db.masterEquipment.findMany({ select: { category: true }, distinct: ["category"] }),
    db.masterEquipment.findMany({ select: { brand: true }, distinct: ["brand"] }),
  ]);
  let activeCount = 0;
  let discontinuedCount = 0;
  for (const r of byStatus) {
    if (r.status === "ACTIVE") activeCount = r._count._all;
    else if (r.status === "DISCONTINUED") discontinuedCount = r._count._all;
  }
  return {
    total: activeCount + discontinuedCount,
    activeCount,
    discontinuedCount,
    categoriesUsed: distinctCategories.length,
    brands: distinctBrands.length,
  };
}

/* ── List ───────────────────────────────────────────────── */

export interface EquipmentListFilters {
  q?: string;
  category?: MasterEquipmentCategory;
  brand?: string;
  status?: MasterEquipmentStatus;
}

export interface EquipmentListRow {
  id: string;
  slug: string;
  brand: string;
  model: string;
  displayName: string | null;
  category: MasterEquipmentCategory;
  ratedSpeed: number | null;
  speedUnit: string | null;
  imageUrl: string | null;
  status: MasterEquipmentStatus;
  materialCount: number;
  taskCount: number;
  updatedAt: Date;
}

export interface EquipmentListResult {
  rows: EquipmentListRow[];
  total: number;
  filteredTotal: number;
}

export async function loadEquipmentList(args: {
  filters: EquipmentListFilters;
  page: number;
  pageSize: number;
}): Promise<EquipmentListResult> {
  const { filters, page, pageSize } = args;
  const where: Prisma.MasterEquipmentWhereInput = {};

  if (filters.q) {
    const q = filters.q.trim();
    where.OR = [
      { brand: { contains: q, mode: "insensitive" } },
      { model: { contains: q, mode: "insensitive" } },
      { displayName: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
      { tags: { has: q.toLowerCase() } },
    ];
  }
  if (filters.category) where.category = filters.category;
  if (filters.brand) {
    where.brand = { equals: filters.brand, mode: "insensitive" };
  }
  if (filters.status) where.status = filters.status;

  const [total, filteredTotal, rawRows] = await Promise.all([
    db.masterEquipment.count(),
    db.masterEquipment.count({ where }),
    db.masterEquipment.findMany({
      where,
      orderBy: [{ status: "asc" }, { brand: "asc" }, { model: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: { select: { materials: true, maintenance: true } },
      },
    }),
  ]);

  const rows: EquipmentListRow[] = rawRows.map((r) => ({
    id: r.id,
    slug: r.slug,
    brand: r.brand,
    model: r.model,
    displayName: r.displayName,
    category: r.category,
    ratedSpeed: r.ratedSpeed ? Number(r.ratedSpeed) : null,
    speedUnit: r.speedUnit,
    imageUrl: r.imageUrl,
    status: r.status,
    materialCount: r._count.materials,
    taskCount: r._count.maintenance,
    updatedAt: r.updatedAt,
  }));

  return { rows, total, filteredTotal };
}

/* ── Filter options ─────────────────────────────────────── */

export interface EquipmentFilterOptions {
  brands: string[];
}

export async function loadEquipmentFilterOptions(): Promise<EquipmentFilterOptions> {
  const rows = await db.masterEquipment.findMany({
    select: { brand: true },
    distinct: ["brand"],
    orderBy: { brand: "asc" },
  });
  return { brands: rows.map((r) => r.brand) };
}

/* ── Detail ──────────────────────────────────────────────── */

export interface EquipmentDetail {
  id: string;
  slug: string;
  brand: string;
  model: string;
  displayName: string | null;
  category: MasterEquipmentCategory;
  maxWidthIn: number | null;
  maxLengthFt: number | null;
  colorModes: string[];
  inkTypes: string[];
  resolution: string | null;
  ratedSpeed: number | null;
  speedUnit: string | null;
  warmupMinutes: number;
  changeoverMinutes: number;
  defaultUptimePct: number;
  defaultWastePct: number;
  purchaseCostMinor: number;
  depreciationYears: number;
  hourlyOperatingCostMinor: number;
  imageUrl: string | null;
  manualUrl: string | null;
  status: MasterEquipmentStatus;
  internalNotes: string | null;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  materials: {
    id: string;
    materialId: string;
    materialName: string;
    materialSlug: string;
    materialCategory: string;
    recommended: boolean;
    notes: string | null;
  }[];
  maintenance: {
    id: string;
    taskName: string;
    description: string | null;
    frequency: MasterMaintenanceFrequency;
    intervalCount: number | null;
    estimatedMinutes: number;
    toolsNeeded: string[];
    sortOrder: number;
    notes: string | null;
  }[];
}

export async function loadEquipmentDetail(id: string): Promise<EquipmentDetail | null> {
  const e = await db.masterEquipment.findUnique({
    where: { id },
    include: {
      materials: {
        orderBy: [{ recommended: "desc" }, { createdAt: "asc" }],
        include: {
          material: { select: { id: true, slug: true, name: true, category: true } },
        },
      },
      maintenance: { orderBy: [{ sortOrder: "asc" }, { taskName: "asc" }] },
    },
  });
  if (!e) return null;
  return {
    id: e.id,
    slug: e.slug,
    brand: e.brand,
    model: e.model,
    displayName: e.displayName,
    category: e.category,
    maxWidthIn: e.maxWidthIn ? Number(e.maxWidthIn) : null,
    maxLengthFt: e.maxLengthFt ? Number(e.maxLengthFt) : null,
    colorModes: e.colorModes,
    inkTypes: e.inkTypes,
    resolution: e.resolution,
    ratedSpeed: e.ratedSpeed ? Number(e.ratedSpeed) : null,
    speedUnit: e.speedUnit,
    warmupMinutes: e.warmupMinutes,
    changeoverMinutes: e.changeoverMinutes,
    defaultUptimePct: Number(e.defaultUptimePct),
    defaultWastePct: Number(e.defaultWastePct),
    purchaseCostMinor: e.purchaseCostMinor,
    depreciationYears: e.depreciationYears,
    hourlyOperatingCostMinor: e.hourlyOperatingCostMinor,
    imageUrl: e.imageUrl,
    manualUrl: e.manualUrl,
    status: e.status,
    internalNotes: e.internalNotes,
    tags: e.tags,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    materials: e.materials.map((m) => ({
      id: m.id,
      materialId: m.materialId,
      materialName: m.material.name,
      materialSlug: m.material.slug,
      materialCategory: m.material.category,
      recommended: m.recommended,
      notes: m.notes,
    })),
    maintenance: e.maintenance.map((t) => ({
      id: t.id,
      taskName: t.taskName,
      description: t.description,
      frequency: t.frequency,
      intervalCount: t.intervalCount,
      estimatedMinutes: t.estimatedMinutes,
      toolsNeeded: t.toolsNeeded,
      sortOrder: t.sortOrder,
      notes: t.notes,
    })),
  };
}
