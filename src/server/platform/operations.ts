// Page 31 — Job Queue Monitor data layer.
//
// Reads tenant-scoped Order rows aggregated across the whole platform.
// Read-only — no mutations from this surface. Anonymized by default;
// impersonation (Page 8) is the cross-tenant drill-down path.

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { OrderStatus } from "@prisma/client";

const DAY = 86_400_000;

/* ── Filters ────────────────────────────────────────────── */

export interface OperationsFilters {
  tenantId?: string;
  status?: OrderStatus;
  region?: string;
  planSlug?: string;
  since?: Date;
  until?: Date;
}

function buildOrderWhere(filters: OperationsFilters): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};
  if (filters.tenantId) where.tenantId = filters.tenantId;
  if (filters.status)   where.status = filters.status;
  if (filters.region || filters.planSlug) {
    where.tenant = {};
    if (filters.region)   where.tenant.region = { equals: filters.region, mode: "insensitive" };
    if (filters.planSlug) where.tenant.pricingPlan = { slug: filters.planSlug };
  }
  if (filters.since || filters.until) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (filters.since) createdAt.gte = filters.since;
    if (filters.until) createdAt.lte = filters.until;
    where.createdAt = createdAt;
  }
  return where;
}

/* ── KPIs ───────────────────────────────────────────────── */

export interface OperationsKpis {
  inProductionCount: number;
  completedToday: number;
  /** Average cycle time in days (createdAt → completedAt). */
  avgCycleDays: number | null;
  /** Orders past their dueDate but not yet completed/canceled. */
  lateCount: number;
  /** Total open orders (NEW/IN_PRODUCTION/READY/OUT_FOR_INSTALL). */
  openCount: number;
}

export async function loadOperationsKpis(filters: OperationsFilters): Promise<OperationsKpis> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const baseWhere = buildOrderWhere(filters);

  const [inProduction, completedToday, completedSample, late, openCount] = await Promise.all([
    db.order.count({ where: { ...baseWhere, status: "IN_PRODUCTION" } }),
    db.order.count({ where: { ...baseWhere, status: "COMPLETED", completedAt: { gte: todayStart } } }),
    // For avg cycle time: pull the last 200 completed orders + average their cycle.
    db.order.findMany({
      where: { ...baseWhere, status: "COMPLETED", completedAt: { not: null } },
      select: { createdAt: true, completedAt: true },
      orderBy: { completedAt: "desc" },
      take: 200,
    }),
    db.order.count({
      where: {
        ...baseWhere,
        status: { in: ["NEW", "IN_PRODUCTION", "READY", "OUT_FOR_INSTALL"] },
        dueDate: { not: null, lt: new Date() },
      },
    }),
    db.order.count({
      where: { ...baseWhere, status: { in: ["NEW", "IN_PRODUCTION", "READY", "OUT_FOR_INSTALL"] } },
    }),
  ]);

  const avgCycleDays = completedSample.length === 0
    ? null
    : Math.round(
        completedSample.reduce((acc, o) => {
          if (!o.completedAt) return acc;
          return acc + (o.completedAt.getTime() - o.createdAt.getTime()) / DAY;
        }, 0) / completedSample.length * 10,
      ) / 10;

  return {
    inProductionCount: inProduction,
    completedToday,
    avgCycleDays,
    lateCount: late,
    openCount,
  };
}

/* ── Throughput trend ───────────────────────────────────── */

export interface ThroughputPoint {
  date: string; // YYYY-MM-DD
  created: number;
  completed: number;
}

export async function loadThroughputTrend(filters: OperationsFilters, days = 30): Promise<ThroughputPoint[]> {
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);

  const baseWhere = buildOrderWhere(filters);

  const [createdRows, completedRows] = await Promise.all([
    db.order.findMany({
      where: { ...baseWhere, createdAt: { gte: since } },
      select: { createdAt: true },
      take: 50_000,
    }),
    db.order.findMany({
      where: { ...baseWhere, completedAt: { gte: since } },
      select: { completedAt: true },
      take: 50_000,
    }),
  ]);

  // Initialize every day in window.
  const acc = new Map<string, ThroughputPoint>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    acc.set(key, { date: key, created: 0, completed: 0 });
  }
  for (const r of createdRows) {
    const key = r.createdAt.toISOString().slice(0, 10);
    const row = acc.get(key);
    if (row) row.created += 1;
  }
  for (const r of completedRows) {
    if (!r.completedAt) continue;
    const key = r.completedAt.toISOString().slice(0, 10);
    const row = acc.get(key);
    if (row) row.completed += 1;
  }
  return Array.from(acc.values());
}

/* ── Status distribution ────────────────────────────────── */

export interface StatusSlice {
  status: OrderStatus;
  count: number;
}

export async function loadStatusDistribution(filters: OperationsFilters): Promise<StatusSlice[]> {
  const rows = await db.order.groupBy({
    by: ["status"],
    where: buildOrderWhere(filters),
    _count: { _all: true },
  });
  return rows.map((r) => ({ status: r.status, count: r._count._all }))
    .sort((a, b) => b.count - a.count);
}

/* ── Bottleneck: avg time spent in each status (proxy) ─── */

export interface BottleneckRow {
  status: OrderStatus;
  /** Avg days currently spent in this status (open orders only). */
  avgDays: number;
  count: number;
}

export async function loadBottlenecks(filters: OperationsFilters): Promise<BottleneckRow[]> {
  // For open orders, treat "time in current status" as a proxy for
  // bottleneck pressure: lots of orders sitting long in NEW = approval
  // bottleneck; lots in IN_PRODUCTION = production bottleneck; etc.
  const openRows = await db.order.findMany({
    where: {
      ...buildOrderWhere(filters),
      status: { in: ["NEW", "IN_PRODUCTION", "READY", "OUT_FOR_INSTALL"] },
    },
    select: { status: true, createdAt: true, startedAt: true, readyAt: true },
    take: 50_000,
  });

  const acc = new Map<OrderStatus, { sumDays: number; count: number }>();
  const now = Date.now();
  for (const o of openRows) {
    const reference = (() => {
      if (o.status === "NEW") return o.createdAt;
      if (o.status === "IN_PRODUCTION") return o.startedAt ?? o.createdAt;
      if (o.status === "READY" || o.status === "OUT_FOR_INSTALL") return o.readyAt ?? o.createdAt;
      return o.createdAt;
    })();
    const days = (now - reference.getTime()) / DAY;
    const cell = acc.get(o.status) ?? { sumDays: 0, count: 0 };
    cell.sumDays += days;
    cell.count += 1;
    acc.set(o.status, cell);
  }
  return Array.from(acc.entries())
    .map(([status, cell]) => ({
      status,
      avgDays: cell.count === 0 ? 0 : Math.round(cell.sumDays / cell.count * 10) / 10,
      count: cell.count,
    }))
    .sort((a, b) => b.avgDays - a.avgDays);
}

/* ── Capacity gauge + Job-type breakdown ────────────────── */

export interface CapacityRow {
  /** Bucket — Product kind value or "MIXED" / "UNKNOWN". */
  bucket: string;
  /** Active jobs touching this bucket. */
  active: number;
  /** Completed in last 30 days — proxy for steady-state throughput. */
  recentCompleted: number;
  /** Computed utilization 0..1 — active / (active + recentThroughput). */
  utilizationPct: number;
}

const CAPACITY_BUCKET_ORDER = [
  "SIGN", "PRINT", "INSTALL_SERVICE", "DESIGN_SERVICE",
  "LABOR", "SETUP_FEE", "RUSH_FEE", "DELIVERY_FEE",
  "STANDARD", "CUSTOM",
];

export async function loadCapacityGauge(filters: OperationsFilters): Promise<CapacityRow[]> {
  // Active jobs joined to their items + products to bucket by Product.kind.
  const baseWhere = buildOrderWhere(filters);
  const window30 = new Date(Date.now() - 30 * DAY);

  const [activeOrders, completedOrders] = await Promise.all([
    db.order.findMany({
      where: { ...baseWhere, status: { in: ["NEW", "IN_PRODUCTION", "READY", "OUT_FOR_INSTALL"] } },
      select: {
        id: true,
        items: { select: { product: { select: { kind: true } } } },
      },
      take: 50_000,
    }),
    db.order.findMany({
      where: { ...baseWhere, status: "COMPLETED", completedAt: { gte: window30 } },
      select: {
        id: true,
        items: { select: { product: { select: { kind: true } } } },
      },
      take: 50_000,
    }),
  ]);

  function bucketsForOrder(items: { product: { kind: string } | null }[]): string[] {
    const set = new Set<string>();
    for (const it of items) {
      const k = it.product?.kind;
      if (k) set.add(k);
    }
    if (set.size === 0) return ["UNKNOWN"];
    return Array.from(set);
  }

  const activeMap = new Map<string, number>();
  for (const o of activeOrders) {
    for (const b of bucketsForOrder(o.items)) {
      activeMap.set(b, (activeMap.get(b) ?? 0) + 1);
    }
  }
  const completedMap = new Map<string, number>();
  for (const o of completedOrders) {
    for (const b of bucketsForOrder(o.items)) {
      completedMap.set(b, (completedMap.get(b) ?? 0) + 1);
    }
  }

  const buckets = new Set<string>([...activeMap.keys(), ...completedMap.keys()]);
  const rows: CapacityRow[] = Array.from(buckets).map((b) => {
    const active = activeMap.get(b) ?? 0;
    const recentCompleted = completedMap.get(b) ?? 0;
    const denom = active + recentCompleted;
    return {
      bucket: b,
      active,
      recentCompleted,
      utilizationPct: denom === 0 ? 0 : active / denom,
    };
  });
  // Sort by canonical order, falling back to active count.
  rows.sort((a, b) => {
    const ai = CAPACITY_BUCKET_ORDER.indexOf(a.bucket);
    const bi = CAPACITY_BUCKET_ORDER.indexOf(b.bucket);
    if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return b.active - a.active;
  });
  return rows;
}

/* ── Anonymized job queue rows ──────────────────────────── */

export interface JobQueueRow {
  id: string;
  /** Redacted job ref — first 5 chars of id. */
  redactedRef: string;
  tenantId: string;
  tenantName: string;
  region: string | null;
  planSlug: string | null;
  status: OrderStatus;
  priority: "NORMAL" | "HIGH" | "RUSH";
  createdAt: Date;
  /** Last status change — uses the tightest available timestamp. */
  lastStatusChange: Date;
  /** Days currently in this status. */
  daysInStatus: number;
  /** Late if dueDate < now and not closed. */
  isLate: boolean;
  dueDate: Date | null;
}

export interface JobQueueResult {
  rows: JobQueueRow[];
  total: number;
  filteredTotal: number;
}

export async function loadJobQueueRows(args: {
  filters: OperationsFilters;
  page: number;
  pageSize: number;
}): Promise<JobQueueResult> {
  const { filters, page, pageSize } = args;
  const baseWhere = buildOrderWhere(filters);

  const [total, filteredTotal, rows] = await Promise.all([
    db.order.count(),
    db.order.count({ where: baseWhere }),
    db.order.findMany({
      where: baseWhere,
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        tenant: {
          select: {
            id: true, name: true, region: true,
            pricingPlan: { select: { slug: true } },
          },
        },
      },
    }),
  ]);

  const now = Date.now();
  const list: JobQueueRow[] = rows.map((o) => {
    const lastStatusChange = (() => {
      if (o.canceledAt) return o.canceledAt;
      if (o.completedAt) return o.completedAt;
      if (o.readyAt) return o.readyAt;
      if (o.startedAt) return o.startedAt;
      return o.createdAt;
    })();
    const daysInStatus = (now - lastStatusChange.getTime()) / DAY;
    const isClosed = o.status === "COMPLETED" || o.status === "CANCELED";
    return {
      id: o.id,
      redactedRef: `J-••${o.id.slice(-4).toUpperCase()}`,
      tenantId: o.tenantId,
      tenantName: o.tenant.name,
      region: o.tenant.region,
      planSlug: o.tenant.pricingPlan?.slug ?? null,
      status: o.status,
      priority: o.priority,
      createdAt: o.createdAt,
      lastStatusChange,
      daysInStatus: Math.round(daysInStatus * 10) / 10,
      isLate: !isClosed && !!o.dueDate && o.dueDate.getTime() < now,
      dueDate: o.dueDate,
    };
  });

  return { rows: list, total, filteredTotal };
}

/* ── Filter options ─────────────────────────────────────── */

export interface OperationsFilterOptions {
  tenants: { id: string; name: string }[];
  regions: string[];
  planSlugs: string[];
}

export async function loadOperationsFilterOptions(): Promise<OperationsFilterOptions> {
  const [tenants, plans] = await Promise.all([
    db.tenant.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, region: true },
      take: 500,
    }),
    db.pricingPlan.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { sortOrder: "asc" },
      select: { slug: true },
    }),
  ]);
  const regionSet = new Set<string>();
  for (const t of tenants) if (t.region) regionSet.add(t.region);
  return {
    tenants: tenants.map(({ id, name }) => ({ id, name })),
    regions: Array.from(regionSet).sort(),
    planSlugs: plans.map((p) => p.slug),
  };
}
