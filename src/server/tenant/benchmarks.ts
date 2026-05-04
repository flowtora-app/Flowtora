// Tenant-side benchmark surface for Page 32.
//
// Reads the platform-wide ProductionBenchmarkConfig and the
// industry snapshot, then returns only the metrics where:
//   1. The platform admin has flipped the publish toggle on, AND
//   2. The industry snapshot has ≥ minSampleSize tenants
//      contributing valid samples (privacy floor).
//
// If neither condition holds, the metric is omitted — the badge
// silently absents itself.

import { db } from "@/lib/db";
import {
  loadIndustrySnapshot,
  type MetricKey,
} from "@/server/platform/production-health";

export interface BenchmarkRow {
  metric: MetricKey;
  label: string;
  unit: "pct" | "days" | "money";
  /** Higher = better for this metric? */
  higherIsBetter: boolean;
  /** Industry mean across published tenants. */
  industryMean: number;
  /** This tenant's value. Null when this tenant doesn't have data yet. */
  yourValue: number | null;
  /** Number of std-dev away from the mean. Null when stdev unavailable. */
  zScore: number | null;
  /** "ahead" / "behind" / "on-par" for the badge tone. */
  direction: "ahead" | "behind" | "on-par";
  /** Number of peer tenants contributing. */
  sampleSize: number;
}

const METRIC_META: Record<MetricKey, { label: string; unit: "pct" | "days" | "money"; higherIsBetter: boolean; configKey: string }> = {
  onTimeRatePct:       { label: "On-time delivery", unit: "pct",   higherIsBetter: true,  configKey: "publishOnTimeDeliveryRate" },
  avgCycleDays:        { label: "Avg cycle time",   unit: "days",  higherIsBetter: false, configKey: "publishAvgCycleDays" },
  avgOrderValue:       { label: "Avg order value",  unit: "money", higherIsBetter: true,  configKey: "publishAvgOrderValue" },
  estMarginPct:        { label: "Est. gross margin", unit: "pct",  higherIsBetter: true,  configKey: "publishEstGrossMarginPct" },
  lateRatePct:         { label: "Late rate",        unit: "pct",   higherIsBetter: false, configKey: "publishLateRate" },
  equipmentUptimePct:  { label: "Equipment uptime", unit: "pct",   higherIsBetter: true,  configKey: "publishEquipmentUptime" },
  wasteRatePct:        { label: "Material waste",   unit: "pct",   higherIsBetter: false, configKey: "publishWasteRate" },
  reworkRatePct:       { label: "Rework rate",      unit: "pct",   higherIsBetter: false, configKey: "publishReworkRate" },
};

export interface BenchmarkBundle {
  rows: BenchmarkRow[];
  /** True when the admin has published any metric at all. */
  anyPublished: boolean;
}

export async function loadTenantBenchmarks(tenantId: string): Promise<BenchmarkBundle> {
  const [config, snapshot] = await Promise.all([
    db.productionBenchmarkConfig.findUnique({ where: { id: "default" } }),
    loadIndustrySnapshot(90),
  ]);
  // No config row yet = nothing published.
  if (!config) return { rows: [], anyPublished: false };

  // Locate this tenant's row in the per-tenant samples.
  const own = snapshot.samples.find((s) => s.tenantId === tenantId);

  const out: BenchmarkRow[] = [];
  let anyPublished = false;

  for (const key of Object.keys(METRIC_META) as MetricKey[]) {
    const meta = METRIC_META[key];
    const flag = (config as Record<string, unknown>)[meta.configKey];
    if (flag !== true) continue;
    anyPublished = true;

    // Gather published-tenant samples (those with a non-null value for this metric).
    const samples = snapshot.samples.filter((s) => s[key] != null);
    if (samples.length < config.minSampleSize) continue;

    const mean = snapshot[key];
    const sd = snapshot.stdDev[key];
    if (mean == null) continue;

    const yourValue = own ? own[key] : null;
    const zScore = (yourValue == null || sd == null || sd === 0)
      ? null
      : (yourValue - mean) / sd;

    let direction: BenchmarkRow["direction"] = "on-par";
    if (zScore != null && Math.abs(zScore) >= 0.5) {
      const ahead = meta.higherIsBetter ? zScore > 0 : zScore < 0;
      direction = ahead ? "ahead" : "behind";
    }

    out.push({
      metric: key,
      label: meta.label,
      unit: meta.unit,
      higherIsBetter: meta.higherIsBetter,
      industryMean: Math.round(mean * 10) / 10,
      yourValue: yourValue == null ? null : Math.round(yourValue * 10) / 10,
      zScore: zScore == null ? null : Math.round(zScore * 100) / 100,
      direction,
      sampleSize: samples.length,
    });
  }

  return { rows: out, anyPublished };
}
