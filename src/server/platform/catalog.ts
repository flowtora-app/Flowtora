// Page 25 — Master Product Catalog data layer.

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type {
  MasterAttributeType,
  MasterImageKind,
  MasterProductCategory,
  MasterProductStatus,
} from "@prisma/client";

const DAY = 86_400_000;

/* ── KPIs ───────────────────────────────────────────────── */

export interface CatalogKpis {
  totalProducts: number;
  publishedCount: number;
  draftCount: number;
  archivedCount: number;
  categories: number;
  /** Average # of cloned tenant products per master product (adoption rate). */
  avgAdoption: number | null;
  updatedThisMonth: number;
}

export async function loadCatalogKpis(): Promise<CatalogKpis> {
  const monthStart = new Date();
  monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  const [byStatus, categoriesSet, allProducts, updatedThisMonth, allClones] = await Promise.all([
    db.masterProduct.groupBy({ by: ["status"], _count: { _all: true } }),
    db.masterProduct.findMany({ select: { category: true }, distinct: ["category"] }),
    db.masterProduct.count(),
    db.masterProduct.count({ where: { updatedAt: { gte: monthStart } } }),
    db.product.groupBy({
      by: ["masterProductId"],
      where: { masterProductId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  let publishedCount = 0;
  let draftCount = 0;
  let archivedCount = 0;
  for (const r of byStatus) {
    if (r.status === "PUBLISHED") publishedCount = r._count._all;
    else if (r.status === "DRAFT")    draftCount = r._count._all;
    else if (r.status === "ARCHIVED") archivedCount = r._count._all;
  }

  // Adoption: cloned-product count divided by master products with at
  // least one clone. Returns null when no clones exist.
  const totalClones = allClones.reduce((acc, r) => acc + r._count._all, 0);
  const productsWithClones = allClones.length;
  const avgAdoption = productsWithClones === 0
    ? null
    : Math.round((totalClones / productsWithClones) * 10) / 10;

  return {
    totalProducts: allProducts,
    publishedCount,
    draftCount,
    archivedCount,
    categories: categoriesSet.length,
    avgAdoption,
    updatedThisMonth,
  };
}

/* ── List ───────────────────────────────────────────────── */

export interface CatalogListFilters {
  q?: string;
  category?: MasterProductCategory;
  status?: MasterProductStatus;
  industryVertical?: string;
  /** "low", "mid", "high" — bucketed by clone count. */
  adoption?: "low" | "mid" | "high";
  tag?: string;
  updatedSince?: Date;
}

export interface CatalogListRow {
  id: string;
  slug: string;
  name: string;
  sku: string | null;
  category: MasterProductCategory;
  industryVertical: string | null;
  status: MasterProductStatus;
  primaryImageUrl: string | null;
  priceFromMinor: number;
  leadTimeDays: number;
  tags: string[];
  cloneCount: number;
  updatedAt: Date;
}

export interface CatalogListResult {
  rows: CatalogListRow[];
  total: number;
  filteredTotal: number;
}

export async function loadCatalogList(args: {
  filters: CatalogListFilters;
  page: number;
  pageSize: number;
}): Promise<CatalogListResult> {
  const { filters, page, pageSize } = args;
  const where: Prisma.MasterProductWhereInput = {};

  if (filters.q) {
    const q = filters.q.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
      { sku: { contains: q, mode: "insensitive" } },
      { tags: { has: q.toLowerCase() } },
    ];
  }
  if (filters.category) where.category = filters.category;
  if (filters.status)   where.status   = filters.status;
  if (filters.industryVertical) {
    where.industryVertical = { equals: filters.industryVertical, mode: "insensitive" };
  }
  if (filters.tag) where.tags = { has: filters.tag.toLowerCase() };
  if (filters.updatedSince) where.updatedAt = { gte: filters.updatedSince };

  const [total, filteredTotal, rawRows] = await Promise.all([
    db.masterProduct.count(),
    db.masterProduct.count({ where }),
    db.masterProduct.findMany({
      where,
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { clones: true } } },
    }),
  ]);

  let rows: CatalogListRow[] = rawRows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    sku: r.sku,
    category: r.category,
    industryVertical: r.industryVertical,
    status: r.status,
    primaryImageUrl: r.primaryImageUrl,
    priceFromMinor: r.priceFromMinor,
    leadTimeDays: r.leadTimeDays,
    tags: r.tags,
    cloneCount: r._count.clones,
    updatedAt: r.updatedAt,
  }));

  // Apply post-filter adoption bucket (depends on clone count).
  if (filters.adoption) {
    rows = rows.filter((r) => {
      if (filters.adoption === "low")  return r.cloneCount === 0;
      if (filters.adoption === "mid")  return r.cloneCount >= 1 && r.cloneCount <= 5;
      if (filters.adoption === "high") return r.cloneCount > 5;
      return true;
    });
  }

  return { rows, total, filteredTotal };
}

/* ── Filter options ─────────────────────────────────────── */

export interface CatalogFilterOptions {
  industries: string[];
  tags: string[];
}

export async function loadCatalogFilterOptions(): Promise<CatalogFilterOptions> {
  const products = await db.masterProduct.findMany({
    select: { industryVertical: true, tags: true },
  });
  const industriesSet = new Set<string>();
  const tagsSet = new Set<string>();
  for (const p of products) {
    if (p.industryVertical) industriesSet.add(p.industryVertical);
    for (const t of p.tags) tagsSet.add(t);
  }
  return {
    industries: Array.from(industriesSet).sort(),
    tags: Array.from(tagsSet).sort(),
  };
}

/* ── Detail ──────────────────────────────────────────────── */

export interface CatalogDetail {
  id: string;
  slug: string;
  name: string;
  sku: string | null;
  category: MasterProductCategory;
  industryVertical: string | null;
  description: string | null;
  shortDescription: string | null;
  internalNotes: string | null;
  tags: string[];
  status: MasterProductStatus;
  priceFromMinor: number;
  pricingFormulaSlug: string | null;
  pricingExpression: string | null;
  leadTimeDays: number;
  rushLeadTimeDays: number | null;
  wasteFactorPct: number;
  requiredEquipment: string[];
  capacityUnit: string | null;
  capacityValue: number | null;
  certifications: string[];
  complianceNotes: string | null;
  primaryImageUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  attributes: {
    id: string;
    key: string;
    label: string;
    type: MasterAttributeType;
    sortOrder: number;
    required: boolean;
    customerVisible: boolean;
    helpText: string | null;
    options: unknown;
    validation: unknown;
    defaultValue: unknown;
    conditional: unknown;
  }[];
  materials: {
    id: string;
    materialKey: string;
    label: string;
    defaultConsumption: string | null;
    costPerUnit: number;
    unit: string | null;
    preferredSupplier: string | null;
    notes: string | null;
  }[];
  images: {
    id: string;
    url: string;
    altText: string | null;
    kind: MasterImageKind;
    sortOrder: number;
  }[];
  versions: {
    id: string;
    version: number;
    note: string | null;
    publishedByUserId: string | null;
    createdAt: Date;
  }[];
  clones: {
    id: string;
    name: string;
    tenantId: string;
    tenantName: string;
    createdAt: Date;
  }[];
  cloneCount: number;
}

export async function loadCatalogDetail(id: string): Promise<CatalogDetail | null> {
  const p = await db.masterProduct.findUnique({
    where: { id },
    include: {
      attributes: { orderBy: { sortOrder: "asc" } },
      materials: { orderBy: { createdAt: "asc" } },
      images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      versions: { orderBy: { version: "desc" }, take: 25 },
      clones: {
        select: {
          id: true, name: true, tenantId: true, createdAt: true,
          tenant: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      _count: { select: { clones: true } },
    },
  });
  if (!p) return null;

  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    sku: p.sku,
    category: p.category,
    industryVertical: p.industryVertical,
    description: p.description,
    shortDescription: p.shortDescription,
    internalNotes: p.internalNotes,
    tags: p.tags,
    status: p.status,
    priceFromMinor: p.priceFromMinor,
    pricingFormulaSlug: p.pricingFormulaSlug,
    pricingExpression: p.pricingExpression,
    leadTimeDays: p.leadTimeDays,
    rushLeadTimeDays: p.rushLeadTimeDays,
    wasteFactorPct: Number(p.wasteFactorPct),
    requiredEquipment: p.requiredEquipment,
    capacityUnit: p.capacityUnit,
    capacityValue: p.capacityValue ? Number(p.capacityValue) : null,
    certifications: p.certifications,
    complianceNotes: p.complianceNotes,
    primaryImageUrl: p.primaryImageUrl,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    ogImageUrl: p.ogImageUrl,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    publishedAt: p.publishedAt,
    attributes: p.attributes.map((a) => ({
      id: a.id,
      key: a.key,
      label: a.label,
      type: a.type,
      sortOrder: a.sortOrder,
      required: a.required,
      customerVisible: a.customerVisible,
      helpText: a.helpText,
      options: a.options,
      validation: a.validation,
      defaultValue: a.defaultValue,
      conditional: a.conditional,
    })),
    materials: p.materials.map((m) => ({
      id: m.id,
      materialKey: m.materialKey,
      label: m.label,
      defaultConsumption: m.defaultConsumption,
      costPerUnit: m.costPerUnit,
      unit: m.unit,
      preferredSupplier: m.preferredSupplier,
      notes: m.notes,
    })),
    images: p.images.map((i) => ({
      id: i.id,
      url: i.url,
      altText: i.altText,
      kind: i.kind,
      sortOrder: i.sortOrder,
    })),
    versions: p.versions.map((v) => ({
      id: v.id,
      version: v.version,
      note: v.note,
      publishedByUserId: v.publishedByUserId,
      createdAt: v.createdAt,
    })),
    clones: p.clones.map((c) => ({
      id: c.id,
      name: c.name,
      tenantId: c.tenantId,
      tenantName: c.tenant.name,
      createdAt: c.createdAt,
    })),
    cloneCount: p._count.clones,
  };
}

// Suppress lint for the DAY constant — kept for future "updated this week" filters.
void DAY;
