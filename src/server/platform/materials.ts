// Page 26 — Master Material Library data layer.

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type {
  MasterMaterialCategory,
  MasterMaterialFinish,
  MasterMaterialStatus,
  MasterMaterialUsage,
} from "@prisma/client";

const DAY = 86_400_000;

/* ── KPIs ───────────────────────────────────────────────── */

export interface MaterialKpis {
  total: number;
  activeCount: number;
  discontinuedCount: number;
  categoriesUsed: number;
  /** Suppliers with prices last updated > 90 days ago. */
  outdatedSupplierPrices: number;
}

export async function loadMaterialKpis(): Promise<MaterialKpis> {
  const stale = new Date(Date.now() - 90 * DAY);
  const [byStatus, distinctCategories, totalSuppliers, oldSuppliers] = await Promise.all([
    db.masterMaterial.groupBy({ by: ["status"], _count: { _all: true } }),
    db.masterMaterial.findMany({ select: { category: true }, distinct: ["category"] }),
    db.masterMaterialSupplier.count(),
    db.masterMaterialSupplier.count({
      where: {
        OR: [
          { lastPriceUpdate: { lt: stale } },
          { lastPriceUpdate: null },
        ],
      },
    }),
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
    outdatedSupplierPrices: totalSuppliers === 0 ? 0 : oldSuppliers,
  };
}

/* ── List ───────────────────────────────────────────────── */

export interface MaterialListFilters {
  q?: string;
  category?: MasterMaterialCategory;
  subcategory?: string;
  usage?: MasterMaterialUsage;
  finish?: MasterMaterialFinish;
  durabilityYears?: number;
  status?: MasterMaterialStatus;
  tag?: string;
}

export interface MaterialListRow {
  id: string;
  slug: string;
  name: string;
  sku: string | null;
  category: MasterMaterialCategory;
  subcategory: string | null;
  usage: MasterMaterialUsage;
  finish: MasterMaterialFinish | null;
  durabilityYears: number | null;
  widthIn: number | null;
  rollLengthFt: number | null;
  defaultCost: number;
  defaultUnit: string;
  defaultMarkupPct: number;
  imageUrl: string | null;
  status: MasterMaterialStatus;
  updatedAt: Date;
  primarySupplier: string | null;
  supplierCount: number;
  hasOutdatedSupplier: boolean;
}

export interface MaterialListResult {
  rows: MaterialListRow[];
  total: number;
  filteredTotal: number;
}

export async function loadMaterialList(args: {
  filters: MaterialListFilters;
  page: number;
  pageSize: number;
}): Promise<MaterialListResult> {
  const { filters, page, pageSize } = args;
  const where: Prisma.MasterMaterialWhereInput = {};

  if (filters.q) {
    const q = filters.q.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
      { sku: { contains: q, mode: "insensitive" } },
      { tags: { has: q.toLowerCase() } },
      { suppliers: { some: { supplierName: { contains: q, mode: "insensitive" } } } },
    ];
  }
  if (filters.category) where.category = filters.category;
  if (filters.subcategory) {
    where.subcategory = { equals: filters.subcategory, mode: "insensitive" };
  }
  if (filters.usage)    where.usage = filters.usage;
  if (filters.finish)   where.finish = filters.finish;
  if (filters.durabilityYears != null) where.durabilityYears = filters.durabilityYears;
  if (filters.status)   where.status = filters.status;
  if (filters.tag)      where.tags = { has: filters.tag.toLowerCase() };

  const stale = new Date(Date.now() - 90 * DAY);

  const [total, filteredTotal, rawRows] = await Promise.all([
    db.masterMaterial.count(),
    db.masterMaterial.count({ where }),
    db.masterMaterial.findMany({
      where,
      orderBy: [{ status: "asc" }, { name: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        suppliers: {
          orderBy: [{ isPrimary: "desc" }, { supplierName: "asc" }],
          select: { supplierName: true, isPrimary: true, lastPriceUpdate: true },
        },
      },
    }),
  ]);

  const rows: MaterialListRow[] = rawRows.map((r) => {
    const primary = r.suppliers.find((s) => s.isPrimary) ?? r.suppliers[0] ?? null;
    const hasOutdated = r.suppliers.some(
      (s) => s.lastPriceUpdate == null || s.lastPriceUpdate < stale,
    );
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      sku: r.sku,
      category: r.category,
      subcategory: r.subcategory,
      usage: r.usage,
      finish: r.finish,
      durabilityYears: r.durabilityYears,
      widthIn: r.widthIn ? Number(r.widthIn) : null,
      rollLengthFt: r.rollLengthFt ? Number(r.rollLengthFt) : null,
      defaultCost: r.defaultCost,
      defaultUnit: r.defaultUnit,
      defaultMarkupPct: Number(r.defaultMarkupPct),
      imageUrl: r.imageUrl,
      status: r.status,
      updatedAt: r.updatedAt,
      primarySupplier: primary?.supplierName ?? null,
      supplierCount: r.suppliers.length,
      hasOutdatedSupplier: hasOutdated && r.suppliers.length > 0,
    };
  });

  return { rows, total, filteredTotal };
}

/* ── Filter options ─────────────────────────────────────── */

export interface MaterialFilterOptions {
  subcategories: string[];
  tags: string[];
}

export async function loadMaterialFilterOptions(): Promise<MaterialFilterOptions> {
  const rows = await db.masterMaterial.findMany({
    select: { subcategory: true, tags: true },
  });
  const subSet = new Set<string>();
  const tagSet = new Set<string>();
  for (const r of rows) {
    if (r.subcategory) subSet.add(r.subcategory);
    for (const t of r.tags) tagSet.add(t);
  }
  return {
    subcategories: Array.from(subSet).sort(),
    tags: Array.from(tagSet).sort(),
  };
}

/* ── Detail ─────────────────────────────────────────────── */

export interface MaterialDetail {
  id: string;
  slug: string;
  name: string;
  sku: string | null;
  category: MasterMaterialCategory;
  subcategory: string | null;
  widthIn: number | null;
  rollLengthFt: number | null;
  thicknessMil: number | null;
  gsm: number | null;
  colorHex: string | null;
  pantoneCode: string | null;
  finish: MasterMaterialFinish | null;
  usage: MasterMaterialUsage;
  durabilityYears: number | null;
  fireRating: string | null;
  recyclable: boolean;
  opacityPct: number | null;
  adhesiveType: string | null;
  defaultCost: number;
  defaultUnit: string;
  defaultMarkupPct: number;
  wasteFactorPct: number;
  minOrderQty: number | null;
  imageUrl: string | null;
  datasheetUrl: string | null;
  equipmentCompatibility: string[];
  compatibleProductSlugs: string[];
  status: MasterMaterialStatus;
  internalNotes: string | null;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  suppliers: {
    id: string;
    supplierName: string;
    supplierSku: string | null;
    leadTimeDays: number | null;
    moq: number | null;
    costAtSupplier: number;
    lastPriceUpdate: Date | null;
    portalUrl: string | null;
    isPrimary: boolean;
    notes: string | null;
  }[];
  swatches: {
    id: string;
    colorName: string;
    colorKey: string;
    hex: string | null;
    pantoneCode: string | null;
    skuSuffix: string | null;
    imageUrl: string | null;
    sortOrder: number;
    active: boolean;
    notes: string | null;
  }[];
}

export async function loadMaterialDetail(id: string): Promise<MaterialDetail | null> {
  const m = await db.masterMaterial.findUnique({
    where: { id },
    include: {
      suppliers: { orderBy: [{ isPrimary: "desc" }, { supplierName: "asc" }] },
      swatches: { orderBy: [{ sortOrder: "asc" }, { colorName: "asc" }] },
    },
  });
  if (!m) return null;
  return {
    id: m.id,
    slug: m.slug,
    name: m.name,
    sku: m.sku,
    category: m.category,
    subcategory: m.subcategory,
    widthIn: m.widthIn ? Number(m.widthIn) : null,
    rollLengthFt: m.rollLengthFt ? Number(m.rollLengthFt) : null,
    thicknessMil: m.thicknessMil ? Number(m.thicknessMil) : null,
    gsm: m.gsm,
    colorHex: m.colorHex,
    pantoneCode: m.pantoneCode,
    finish: m.finish,
    usage: m.usage,
    durabilityYears: m.durabilityYears,
    fireRating: m.fireRating,
    recyclable: m.recyclable,
    opacityPct: m.opacityPct,
    adhesiveType: m.adhesiveType,
    defaultCost: m.defaultCost,
    defaultUnit: m.defaultUnit,
    defaultMarkupPct: Number(m.defaultMarkupPct),
    wasteFactorPct: Number(m.wasteFactorPct),
    minOrderQty: m.minOrderQty ? Number(m.minOrderQty) : null,
    imageUrl: m.imageUrl,
    datasheetUrl: m.datasheetUrl,
    equipmentCompatibility: m.equipmentCompatibility,
    compatibleProductSlugs: m.compatibleProductSlugs,
    status: m.status,
    internalNotes: m.internalNotes,
    tags: m.tags,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    suppliers: m.suppliers.map((s) => ({
      id: s.id,
      supplierName: s.supplierName,
      supplierSku: s.supplierSku,
      leadTimeDays: s.leadTimeDays,
      moq: s.moq ? Number(s.moq) : null,
      costAtSupplier: s.costAtSupplier,
      lastPriceUpdate: s.lastPriceUpdate,
      portalUrl: s.portalUrl,
      isPrimary: s.isPrimary,
      notes: s.notes,
    })),
    swatches: m.swatches.map((s) => ({
      id: s.id,
      colorName: s.colorName,
      colorKey: s.colorKey,
      hex: s.hex,
      pantoneCode: s.pantoneCode,
      skuSuffix: s.skuSuffix,
      imageUrl: s.imageUrl,
      sortOrder: s.sortOrder,
      active: s.active,
      notes: s.notes,
    })),
  };
}
