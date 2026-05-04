// Page 32 — Production Health.
//
// Industry-wide production benchmarks computed across the tenant Order
// graph. Surfaces means + std-dev + anomaly detection + per-tenant
// distribution, plus a "publish to tenant dashboards" toggle gated
// behind a minimum sample size for privacy.

import { requirePlatformStaff } from "@/lib/platform";
import {
  Breadcrumb,
  Card,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import {
  detectAnomalies,
  loadBenchmarkConfig,
  loadIndustrySnapshot,
} from "@/server/platform/production-health";
import { Kpi, DeferredNote } from "./_components/shared";
import { DistributionTable } from "./_components/DistributionTable";
import { AnomalyList } from "./_components/AnomalyList";
import { BenchmarkPublishCard } from "./_components/BenchmarkPublishCard";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

const OK_LABELS: Record<string, string> = {
  saved: "Benchmark config saved.",
};

export default async function ProductionHealthPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canManage = ctx.can("plans.manage");

  const okMsg = typeof sp.ok === "string" ? OK_LABELS[sp.ok] ?? "Done." : null;
  const errMsg = typeof sp.error === "string" ? decodeURIComponent(sp.error) : null;

  const [snapshot, config] = await Promise.all([
    loadIndustrySnapshot(90),
    loadBenchmarkConfig(),
  ]);
  const anomalies = detectAnomalies(snapshot, 2);

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Operations" },
          { label: "Production Health" },
        ]} />
        <div className="mt-3">
          <PageHeader
            title="Production Health"
            description={`Industry-wide benchmarks across ${snapshot.tenantCount} tenant${snapshot.tenantCount === 1 ? "" : "s"} over the last ${snapshot.windowDays} days. Anonymized aggregates only — drill into a tenant via Impersonation when needed.`}
          />
        </div>
      </div>

      {okMsg && (
        <div className="rounded-md border px-3 py-2 text-[12px]"
             style={{ background: "var(--success-surface)", color: "var(--success-fg)", borderColor: "var(--success-fg)" }}>
          {okMsg}
        </div>
      )}
      {errMsg && (
        <div className="rounded-md border px-3 py-2 text-[12px]"
             style={{ background: "var(--danger-surface)", color: "var(--danger-fg)", borderColor: "var(--danger-fg)" }}>
          {errMsg}
        </div>
      )}

      {snapshot.tenantCount === 0 ? (
        <Card padding="lg">
          <EmptyState
            title="No production samples yet"
            description="Once tenants ship orders, this page aggregates the metrics across the platform."
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <Kpi label="On-time delivery"
                 value={snapshot.onTimeRatePct == null ? "—" : `${snapshot.onTimeRatePct.toFixed(1)}%`}
                 sub={snapshot.stdDev.onTimeRatePct == null
                   ? "no std dev"
                   : `σ ${snapshot.stdDev.onTimeRatePct.toFixed(1)}%`}
                 tone={snapshot.onTimeRatePct != null && snapshot.onTimeRatePct >= 90 ? "good" : "default"} />
            <Kpi label="Avg cycle time"
                 value={snapshot.avgCycleDays == null ? "—" : `${snapshot.avgCycleDays.toFixed(1)}d`}
                 sub={snapshot.stdDev.avgCycleDays == null
                   ? "no std dev"
                   : `σ ${snapshot.stdDev.avgCycleDays.toFixed(1)}d`} />
            <Kpi label="Avg order value"
                 value={snapshot.avgOrderValue == null
                   ? "—"
                   : `$${snapshot.avgOrderValue.toLocaleString()}`}
                 sub={snapshot.stdDev.avgOrderValue == null
                   ? "no std dev"
                   : `σ $${Math.round(snapshot.stdDev.avgOrderValue).toLocaleString()}`} />
            <Kpi label="Est. gross margin"
                 value={snapshot.estMarginPct == null ? "—" : `${snapshot.estMarginPct.toFixed(1)}%`}
                 sub={snapshot.stdDev.estMarginPct == null
                   ? "no std dev"
                   : `σ ${snapshot.stdDev.estMarginPct.toFixed(1)}%`}
                 tone={snapshot.estMarginPct != null && snapshot.estMarginPct >= 50 ? "good" : "default"} />
            <Kpi label="Late rate (open)"
                 value={snapshot.lateRatePct == null ? "—" : `${snapshot.lateRatePct.toFixed(1)}%`}
                 tone={snapshot.lateRatePct != null && snapshot.lateRatePct > 10 ? "warning" : "default"} />
          </div>

          <DeferredNote>
            <strong>Equipment uptime, material waste rate, and rework rate are deferred.</strong>
            Computing those needs an equipment-job mapping (Page 27 schema captured but not
            tenant-wired), measured material consumption rather than the configured waste %, and
            a rework event log we don&apos;t track yet. We surface the metrics we can compute
            honestly above and flag the gaps here.
          </DeferredNote>

          <BenchmarkPublishCard config={config} canManage={canManage} />

          {anomalies.length > 0 && (
            <Card padding="md">
              <div className="mb-3">
                <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
                  Anomaly detection · 2σ outliers
                </h2>
                <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                  Tenants whose metrics fall ≥ 2 standard deviations from the industry mean.
                  Favorable outliers (e.g. higher on-time, lower late rate) marked with ✓; the
                  rest are candidates for support outreach.
                </p>
              </div>
              <AnomalyList rows={anomalies} />
            </Card>
          )}

          <Card padding="md">
            <div className="mb-3">
              <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
                Per-tenant distribution
              </h2>
              <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                Each row is one tenant&apos;s sample over the rolling 90-day window. Tenants
                with fewer than {config.minSampleSize} completed orders (privacy floor) are
                kept in the table but flagged as low-sample.
              </p>
            </div>
            <DistributionTable
              samples={snapshot.samples}
              minSampleSize={config.minSampleSize}
            />
          </Card>
        </>
      )}
    </div>
  );
}
