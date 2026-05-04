// Page 31 — Job Queue Monitor.
//
// Read-only cross-tenant production visibility. Anonymized job refs
// by default; impersonation (Page 8) is the cross-tenant drill-down
// path when a job needs hands-on intervention.

import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  Breadcrumb,
  Card,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import {
  loadBottlenecks,
  loadCapacityGauge,
  loadJobQueueRows,
  loadOperationsFilterOptions,
  loadOperationsKpis,
  loadStatusDistribution,
  loadThroughputTrend,
  type OperationsFilters,
} from "@/server/platform/operations";
import type { OrderStatus } from "@prisma/client";
import { Kpi, STATUS_LABEL } from "./_components/shared";
import { OperationsFiltersBar } from "./_components/OperationsFiltersBar";
import { ThroughputChart } from "./_components/ThroughputChart";
import { StatusDonut } from "./_components/StatusDonut";
import { BottleneckChart } from "./_components/BottleneckChart";
import { JobQueueTable } from "./_components/JobQueueTable";
import { AutoRefresh } from "./_components/AutoRefresh";
import { CapacityGauge } from "./_components/CapacityGauge";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const PAGE_SIZE = 50;

const STATUSES: OrderStatus[] = [
  "NEW", "IN_PRODUCTION", "READY", "OUT_FOR_INSTALL", "COMPLETED", "CANCELED",
];

function parseFilters(sp: SP): OperationsFilters {
  const f: OperationsFilters = {};
  if (typeof sp.tenant === "string" && sp.tenant) f.tenantId = sp.tenant;
  if (typeof sp.status === "string" && (STATUSES as string[]).includes(sp.status)) {
    f.status = sp.status as OrderStatus;
  }
  if (typeof sp.region === "string" && sp.region) f.region = sp.region;
  if (typeof sp.plan === "string" && sp.plan) f.planSlug = sp.plan;
  if (typeof sp.since === "string" && sp.since) {
    const d = new Date(sp.since);
    if (!Number.isNaN(d.getTime())) f.since = d;
  }
  if (typeof sp.until === "string" && sp.until) {
    const d = new Date(sp.until);
    if (!Number.isNaN(d.getTime())) f.until = d;
  }
  return f;
}

export default async function JobQueueMonitorPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requirePlatformStaff();
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : "1") || 1);

  const [kpis, throughput, distribution, bottlenecks, queueResult, options, capacity] = await Promise.all([
    loadOperationsKpis(filters),
    loadThroughputTrend(filters, 30),
    loadStatusDistribution(filters),
    loadBottlenecks(filters),
    loadJobQueueRows({ filters, page, pageSize: PAGE_SIZE }),
    loadOperationsFilterOptions(),
    loadCapacityGauge(filters),
  ]);

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Operations" },
          { label: "Job Queue Monitor" },
        ]} />
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <PageHeader
            title="Job Queue Monitor"
            description="Cross-tenant production throughput. Anonymized refs by default — drill into a tenant via Impersonation when intervention is needed."
          />
          <AutoRefresh />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="In production"
             value={String(kpis.inProductionCount)}
             tone={kpis.inProductionCount > 0 ? "good" : "default"} />
        <Kpi label="Completed today"
             value={String(kpis.completedToday)}
             tone={kpis.completedToday > 0 ? "good" : "default"} />
        <Kpi label="Avg cycle"
             value={kpis.avgCycleDays == null ? "—" : `${kpis.avgCycleDays}d`}
             sub="createdAt → completedAt, last 200 closed" />
        <Kpi label="Late jobs"
             value={String(kpis.lateCount)}
             tone={kpis.lateCount > 0 ? "danger" : "default"}
             sub="Past dueDate, not closed" />
        <Kpi label="Open jobs"
             value={String(kpis.openCount)}
             sub="NEW + IN_PRODUCTION + READY + OUT_FOR_INSTALL" />
      </div>

      <Card padding="md">
        <OperationsFiltersBar
          options={options}
          statuses={STATUSES}
        />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card padding="md">
            <div className="mb-3">
              <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
                Throughput · last 30 days
              </h2>
              <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                Daily orders created vs. completed.
              </p>
            </div>
            <ThroughputChart points={throughput} />
          </Card>
        </div>
        <div>
          <Card padding="md">
            <div className="mb-3">
              <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
                Status distribution
              </h2>
              <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                All matching orders, by status.
              </p>
            </div>
            <StatusDonut slices={distribution} />
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card padding="md">
          <div className="mb-3">
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
              Bottlenecks · time in current status (open orders)
            </h2>
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              Average days each open order has been sitting in its current status.
              High dwell-time in any one status indicates the bottleneck.
            </p>
          </div>
          <BottleneckChart rows={bottlenecks} />
        </Card>

        <Card padding="md">
          <div className="mb-3">
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
              Capacity utilization · by job type
            </h2>
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              Active jobs vs. completed-in-30d, bucketed by Product kind.
              Bars at 80%+ flag categories with more in flight than the shop is closing.
            </p>
          </div>
          <CapacityGauge rows={capacity} />
        </Card>
      </div>

      {queueResult.rows.length === 0 ? (
        <Card padding="lg">
          <EmptyState
            title={queueResult.total === 0 ? "No orders yet" : "No orders match these filters"}
            description={queueResult.total === 0
              ? "Once tenants ship orders the live queue will populate here."
              : "Adjust filters above to widen the search."}
          />
        </Card>
      ) : (
        <JobQueueTable
          rows={queueResult.rows}
          total={queueResult.total}
          filteredTotal={queueResult.filteredTotal}
          page={page}
          pageSize={PAGE_SIZE}
        />
      )}

      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        Need to intervene on a specific job? Use{" "}
        <Link href="/platform/tenants/impersonation" className="underline">Impersonation</Link>{" "}
        — the tenant&apos;s detail view shows the un-redacted ref.
      </p>

      {/* Reference STATUS_LABEL once so the import doesn't get tree-shaken. */}
      <span className="hidden" aria-hidden>{STATUS_LABEL.NEW}</span>
    </div>
  );
}
