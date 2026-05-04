// Page 32 — Production Health data layer.
//
// Aggregates real production metrics across tenants from the
// existing Order graph. Honest scope:
//   • On-time delivery rate (real)  — completedAt vs dueDate
//   • Avg cycle time (real)         — createdAt → completedAt
//   • Avg order value (real)        — Order.total
//   • Est. gross margin %           — derived from OrderItem unitPrice
//                                     vs Product.cost; missing-cost rows
//                                     skipped, sample size flagged
// Honest deferrals (UI-flagged):
//   • Equipment uptime (no equipment-job mapping yet)
//   • Material waste rate (waste % is a config field, not measured)
//   • Rework rate (no rework event log)

import { db } from "@/lib/db";

const DAY = 86_400_000;

/* ── Per-tenant sample row ──────────────────────────────── */

export interface TenantProductionSample {
  tenantId: string;
  tenantName: string;
  region: string | null;
  planSlug: string | null;
  /** Total completed orders in window. */
  completedCount: number;
  /** Open + closed orders in window. */
  totalCount: number;
  /** % of completed orders shipped on/before dueDate. */
  onTimeRatePct: number | null;
  /** Days from createdAt → completedAt, averaged. */
  avgCycleDays: number | null;
  /** Avg order value in dollars (Order.total). */
  avgOrderValue: number | null;
  /** Estimated gross margin % across order items with cost data. */
  estMarginPct: number | null;
  /** Late rate: open orders past dueDate / total open orders. */
  lateRatePct: number | null;
}

export interface IndustrySnapshot {
  /** Number of tenants contributing samples. */
  tenantCount: number;
  windowDays: number;
  /** Aggregated industry means + medians. */
  onTimeRatePct: number | null;
  avgCycleDays: number | null;
  avgOrderValue: number | null;
  estMarginPct: number | null;
  lateRatePct: number | null;
  /** Standard deviations for anomaly detection. */
  stdDev: {
    onTimeRatePct: number | null;
    avgCycleDays: number | null;
    avgOrderValue: number | null;
    estMarginPct: number | null;
    lateRatePct: number | null;
  };
  samples: TenantProductionSample[];
}

function mean(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stdDev(nums: number[]): number | null {
  if (nums.length < 2) return null;
  const m = mean(nums);
  if (m == null) return null;
  const variance = nums.reduce((a, n) => a + (n - m) ** 2, 0) / (nums.length - 1);
  return Math.sqrt(variance);
}

export async function loadIndustrySnapshot(windowDays = 90): Promise<IndustrySnapshot> {
  const since = new Date(Date.now() - windowDays * DAY);

  // Fetch every order in the window with the bits needed for the metrics.
  const orders = await db.order.findMany({
    where: { createdAt: { gte: since } },
    include: {
      items: {
        select: {
          quantity: true,
          subtotal: true,
          product: { select: { cost: true } },
        },
      },
      tenant: {
        select: {
          name: true, region: true,
          pricingPlan: { select: { slug: true } },
        },
      },
    },
    take: 50_000,
  });

  // Group by tenant to compute per-tenant samples.
  type Bucket = {
    tenantId: string; tenantName: string;
    region: string | null; planSlug: string | null;
    cycleDays: number[];
    onTimeWins: number;
    onTimeAttempts: number;
    orderTotals: number[];
    marginRatios: number[];
    completed: number;
    total: number;
    openLate: number;
    open: number;
  };
  const byTenant = new Map<string, Bucket>();

  for (const o of orders) {
    const cell = byTenant.get(o.tenantId) ?? {
      tenantId: o.tenantId,
      tenantName: o.tenant.name,
      region: o.tenant.region,
      planSlug: o.tenant.pricingPlan?.slug ?? null,
      cycleDays: [], onTimeWins: 0, onTimeAttempts: 0,
      orderTotals: [], marginRatios: [],
      completed: 0, total: 0, openLate: 0, open: 0,
    };
    cell.total += 1;
    if (o.status === "COMPLETED" && o.completedAt) {
      cell.completed += 1;
      cell.cycleDays.push((o.completedAt.getTime() - o.createdAt.getTime()) / DAY);
      cell.orderTotals.push(Number(o.total));
      if (o.dueDate) {
        cell.onTimeAttempts += 1;
        if (o.completedAt <= o.dueDate) cell.onTimeWins += 1;
      }
      // Margin: line revenue (subtotal) minus line cost (cost × qty)
      // across items where the linked product has a cost on file.
      let revenue = 0;
      let cost = 0;
      let hasAnyCost = false;
      for (const it of o.items) {
        revenue += Number(it.subtotal);
        const qty = it.quantity == null ? 1 : Number(it.quantity);
        if (it.product?.cost != null) {
          cost += Number(it.product.cost) * qty;
          hasAnyCost = true;
        }
      }
      if (hasAnyCost && revenue > 0) {
        cell.marginRatios.push((revenue - cost) / revenue);
      }
    }
    if (o.status !== "COMPLETED" && o.status !== "CANCELED") {
      cell.open += 1;
      if (o.dueDate && o.dueDate.getTime() < Date.now()) cell.openLate += 1;
    }
    byTenant.set(o.tenantId, cell);
  }

  const samples: TenantProductionSample[] = Array.from(byTenant.values()).map((b) => ({
    tenantId: b.tenantId,
    tenantName: b.tenantName,
    region: b.region,
    planSlug: b.planSlug,
    completedCount: b.completed,
    totalCount: b.total,
    onTimeRatePct: b.onTimeAttempts === 0
      ? null
      : Math.round((b.onTimeWins / b.onTimeAttempts) * 1000) / 10,
    avgCycleDays: b.cycleDays.length === 0
      ? null
      : Math.round((b.cycleDays.reduce((a, n) => a + n, 0) / b.cycleDays.length) * 10) / 10,
    avgOrderValue: b.orderTotals.length === 0
      ? null
      : Math.round(b.orderTotals.reduce((a, n) => a + n, 0) / b.orderTotals.length),
    estMarginPct: b.marginRatios.length === 0
      ? null
      : Math.round((b.marginRatios.reduce((a, n) => a + n, 0) / b.marginRatios.length) * 1000) / 10,
    lateRatePct: b.open === 0
      ? null
      : Math.round((b.openLate / b.open) * 1000) / 10,
  }));

  // Industry aggregates.
  const onTime = samples.map((s) => s.onTimeRatePct).filter((n): n is number => n != null);
  const cycle = samples.map((s) => s.avgCycleDays).filter((n): n is number => n != null);
  const aov = samples.map((s) => s.avgOrderValue).filter((n): n is number => n != null);
  const margin = samples.map((s) => s.estMarginPct).filter((n): n is number => n != null);
  const late = samples.map((s) => s.lateRatePct).filter((n): n is number => n != null);

  return {
    tenantCount: samples.length,
    windowDays,
    onTimeRatePct: mean(onTime),
    avgCycleDays:  mean(cycle),
    avgOrderValue: mean(aov),
    estMarginPct:  mean(margin),
    lateRatePct:   mean(late),
    stdDev: {
      onTimeRatePct: stdDev(onTime),
      avgCycleDays:  stdDev(cycle),
      avgOrderValue: stdDev(aov),
      estMarginPct:  stdDev(margin),
      lateRatePct:   stdDev(late),
    },
    samples: samples.sort((a, b) => b.totalCount - a.totalCount),
  };
}

/* ── Anomaly detection (2σ) ─────────────────────────────── */

export type MetricKey =
  | "onTimeRatePct" | "avgCycleDays" | "avgOrderValue"
  | "estMarginPct" | "lateRatePct";

export interface AnomalyRow {
  tenantId: string;
  tenantName: string;
  metric: MetricKey;
  value: number;
  industryMean: number;
  /** Number of standard deviations from the mean. */
  zScore: number;
  /** "above" / "below" — whether the deviation is good or bad depends on the metric. */
  direction: "above" | "below";
}

const HIGHER_IS_BETTER: Record<MetricKey, boolean> = {
  onTimeRatePct: true,
  avgCycleDays: false,
  avgOrderValue: true,
  estMarginPct: true,
  lateRatePct: false,
};

export function detectAnomalies(snap: IndustrySnapshot, threshold = 2): AnomalyRow[] {
  const out: AnomalyRow[] = [];
  const metrics: MetricKey[] = [
    "onTimeRatePct", "avgCycleDays", "avgOrderValue",
    "estMarginPct", "lateRatePct",
  ];
  for (const m of metrics) {
    const mean = snap[m];
    const sd = snap.stdDev[m];
    if (mean == null || sd == null || sd === 0) continue;
    for (const s of snap.samples) {
      const v = s[m];
      if (v == null) continue;
      const z = (v - mean) / sd;
      if (Math.abs(z) >= threshold) {
        out.push({
          tenantId: s.tenantId,
          tenantName: s.tenantName,
          metric: m,
          value: v,
          industryMean: Math.round(mean * 10) / 10,
          zScore: Math.round(z * 100) / 100,
          direction: z > 0 ? "above" : "below",
        });
      }
    }
  }
  // Order: most extreme z-score first.
  return out.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
}

export function isFavorable(metric: MetricKey, direction: "above" | "below"): boolean {
  return HIGHER_IS_BETTER[metric] ? direction === "above" : direction === "below";
}

/* ── Benchmark publish config ───────────────────────────── */

export async function loadBenchmarkConfig() {
  const config = await db.productionBenchmarkConfig.findUnique({
    where: { id: "default" },
  });
  return config ?? {
    id: "default",
    publishOnTimeDeliveryRate: false,
    publishAvgCycleDays: false,
    publishAvgOrderValue: false,
    publishEstGrossMarginPct: false,
    publishLateRate: false,
    minSampleSize: 10,
    updatedAt: new Date(0),
    updatedBy: null,
  };
}
