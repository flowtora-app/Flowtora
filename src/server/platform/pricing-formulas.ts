// Page 28 — Pricing Formulas Library data layer.

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type {
  PricingFormulaCategory,
  PricingFormulaStatus,
} from "@prisma/client";
import type {
  FormulaConstant,
  FormulaTier,
  FormulaVariable,
} from "@/lib/pricing-formula-eval";

/* ── KPIs ───────────────────────────────────────────────── */

export interface PricingFormulaKpis {
  total: number;
  publishedCount: number;
  draftCount: number;
  archivedCount: number;
  categoriesUsed: number;
  totalVersions: number;
}

export async function loadPricingFormulaKpis(): Promise<PricingFormulaKpis> {
  const [byStatus, distinctCategories, totalVersions] = await Promise.all([
    db.pricingFormula.groupBy({ by: ["status"], _count: { _all: true } }),
    db.pricingFormula.findMany({ select: { category: true }, distinct: ["category"] }),
    db.pricingFormulaVersion.count(),
  ]);
  let publishedCount = 0;
  let draftCount = 0;
  let archivedCount = 0;
  for (const r of byStatus) {
    if (r.status === "PUBLISHED") publishedCount = r._count._all;
    else if (r.status === "DRAFT") draftCount = r._count._all;
    else if (r.status === "ARCHIVED") archivedCount = r._count._all;
  }
  return {
    total: publishedCount + draftCount + archivedCount,
    publishedCount,
    draftCount,
    archivedCount,
    categoriesUsed: distinctCategories.length,
    totalVersions,
  };
}

/* ── List ───────────────────────────────────────────────── */

export interface PricingFormulaListFilters {
  q?: string;
  category?: PricingFormulaCategory;
  status?: PricingFormulaStatus;
  tag?: string;
}

export interface PricingFormulaListRow {
  id: string;
  slug: string;
  name: string;
  category: PricingFormulaCategory;
  status: PricingFormulaStatus;
  /** Number of declared input variables (parsed from JSON). */
  inputCount: number;
  versionCount: number;
  updatedAt: Date;
  tags: string[];
}

export interface PricingFormulaListResult {
  rows: PricingFormulaListRow[];
  total: number;
  filteredTotal: number;
}

export async function loadPricingFormulaList(args: {
  filters: PricingFormulaListFilters;
  page: number;
  pageSize: number;
}): Promise<PricingFormulaListResult> {
  const { filters, page, pageSize } = args;
  const where: Prisma.PricingFormulaWhereInput = {};

  if (filters.q) {
    const q = filters.q.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { tags: { has: q.toLowerCase() } },
    ];
  }
  if (filters.category) where.category = filters.category;
  if (filters.status)   where.status = filters.status;
  if (filters.tag)      where.tags = { has: filters.tag.toLowerCase() };

  const [total, filteredTotal, rows] = await Promise.all([
    db.pricingFormula.count(),
    db.pricingFormula.count({ where }),
    db.pricingFormula.findMany({
      where,
      orderBy: [{ status: "asc" }, { name: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: { select: { versions: true } },
      },
    }),
  ]);

  return {
    total,
    filteredTotal,
    rows: rows.map((r) => {
      const vars = Array.isArray(r.variables) ? r.variables : [];
      return {
        id: r.id,
        slug: r.slug,
        name: r.name,
        category: r.category,
        status: r.status,
        inputCount: vars.length,
        versionCount: r._count.versions,
        updatedAt: r.updatedAt,
        tags: r.tags,
      };
    }),
  };
}

/* ── Filter options ─────────────────────────────────────── */

export interface PricingFormulaFilterOptions {
  tags: string[];
}

export async function loadPricingFormulaFilterOptions(): Promise<PricingFormulaFilterOptions> {
  const rows = await db.pricingFormula.findMany({ select: { tags: true } });
  const tagSet = new Set<string>();
  for (const r of rows) for (const t of r.tags) tagSet.add(t);
  return { tags: Array.from(tagSet).sort() };
}

/* ── Detail ─────────────────────────────────────────────── */

export interface PricingFormulaDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: PricingFormulaCategory;
  expression: string;
  summary: string | null;
  variables: FormulaVariable[];
  constants: FormulaConstant[];
  tierTable: FormulaTier[] | null;
  status: PricingFormulaStatus;
  internalNotes: string | null;
  tags: string[];
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

export async function loadPricingFormulaDetail(id: string): Promise<PricingFormulaDetail | null> {
  const f = await db.pricingFormula.findUnique({
    where: { id },
    include: { versions: { orderBy: { version: "desc" }, take: 25 } },
  });
  if (!f) return null;
  const variables = Array.isArray(f.variables) ? (f.variables as unknown as FormulaVariable[]) : [];
  const constants = Array.isArray(f.constants) ? (f.constants as unknown as FormulaConstant[]) : [];
  const tierTable = Array.isArray(f.tierTable) ? (f.tierTable as unknown as FormulaTier[]) : null;
  return {
    id: f.id,
    slug: f.slug,
    name: f.name,
    description: f.description,
    category: f.category,
    expression: f.expression,
    summary: f.summary,
    variables,
    constants,
    tierTable,
    status: f.status,
    internalNotes: f.internalNotes,
    tags: f.tags,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    publishedAt: f.publishedAt,
    versions: f.versions.map((v) => ({
      id: v.id,
      version: v.version,
      note: v.note,
      publishedByUserId: v.publishedByUserId,
      createdAt: v.createdAt,
    })),
  };
}
