import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { RangePicker, Stat, Funnel, Bar } from "@/components/Reports";
import { resolveRange, resolveBranch, reportQueryString, pct, formatPct } from "@/lib/reports";
import { applyBranchScope } from "@/lib/locations";
import { PIPELINE_STAGES, stageColor } from "@/lib/crm";
import { formatMoney } from "@/lib/format";
import type { PipelineStage, Prisma } from "@prisma/client";

export default async function PipelineReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string; from?: string; to?: string; branch?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "reports:view");
  const range = resolveRange(sp);
  const branch = await resolveBranch(ctx.tenant.id, ctx.branchScope, sp.branch);

  // All pipeline metrics scope to customers whose `updatedAt` falls within the
  // range — that's our proxy for "activity in this period" since we don't have
  // a dedicated stage-change history table yet.
  const baseWhere = applyBranchScope({
    tenantId: ctx.tenant.id,
    updatedAt: { gte: range.from, lte: range.to },
  } as Prisma.CustomerWhereInput, branch.effectiveScope);

  const [byStage, lostBreakdown, sourceBreakdown, topByValue] = await Promise.all([
    db.customer.groupBy({
      by: ["stage"],
      where: baseWhere,
      _count: { _all: true },
      _sum: { estimatedValue: true },
    }),
    db.customer.findMany({
      where: { ...baseWhere, stage: "LOST" },
      select: { lostReason: true },
    }),
    db.customer.groupBy({
      by: ["source"],
      where: baseWhere,
      _count: { _all: true },
    }),
    db.customer.findMany({
      where: { ...baseWhere, stage: { in: ["NEW_LEAD", "CONTACTED", "QUOTED", "NEGOTIATING", "WON"] } },
      select: { id: true, name: true, stage: true, estimatedValue: true },
      orderBy: { estimatedValue: "desc" },
      take: 10,
    }),
  ]);

  // Normalize by stage (fill in zero rows for stages with no data).
  const stageMap = new Map<PipelineStage, { count: number; value: number }>();
  for (const s of PIPELINE_STAGES) stageMap.set(s.value, { count: 0, value: 0 });
  for (const row of byStage) {
    stageMap.set(row.stage, {
      count: row._count._all,
      value: Number(row._sum.estimatedValue ?? 0),
    });
  }

  const wonCount  = stageMap.get("WON")?.count ?? 0;
  const lostCount = stageMap.get("LOST")?.count ?? 0;
  const wonValue  = stageMap.get("WON")?.value ?? 0;
  const pipelineValue = PIPELINE_STAGES
    .filter((s) => s.value !== "WON" && s.value !== "LOST")
    .reduce((sum, s) => sum + (stageMap.get(s.value)?.value ?? 0), 0);

  const totalClosed = wonCount + lostCount;
  const winRate = pct(wonCount, totalClosed);

  // Group lost reasons.
  const lostReasonCounts = new Map<string, number>();
  for (const l of lostBreakdown) {
    const key = l.lostReason?.trim() || "Unspecified";
    lostReasonCounts.set(key, (lostReasonCounts.get(key) ?? 0) + 1);
  }
  const topLostReasons = Array.from(lostReasonCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const sourceRows = sourceBreakdown
    .map((row) => ({ label: row.source?.trim() || "Unspecified", count: row._count._all }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const funnelStages = [
    "NEW_LEAD",
    "CONTACTED",
    "QUOTED",
    "NEGOTIATING",
    "WON",
  ] as const;

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <Link href={`/t/${slug}/reports`} className="underline" style={{ color: "var(--muted)" }}>
          ← Reports
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Sales pipeline</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Customers with activity (updated) in {range.label}.
          </p>
        </div>
        <a
          href={`/api/t/${slug}/reports/pipeline/export?${reportQueryString(range, branch)}`}
          className="shrink-0 rounded-md px-3 py-1.5 text-xs font-medium"
          style={{ border: "1px solid var(--border)", color: "var(--text)" }}
        >
          Export CSV
        </a>
      </div>

      <RangePicker range={range} basePath={`/t/${slug}/reports/pipeline`} branch={branch} />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Won" value={String(wonCount)} sub={formatMoney(wonValue, ctx.tenant.currency)} />
        <Stat label="Lost" value={String(lostCount)} />
        <Stat label="Win rate" value={formatPct(winRate)} sub={`${totalClosed} closed`} />
        <Stat label="Open pipeline value" value={formatMoney(pipelineValue, ctx.tenant.currency)} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Stage funnel" description="Counts by stage (open + closed)" />
          <div className="px-5 py-4">
            <Funnel
              stages={funnelStages.map((v) => {
                const row = stageMap.get(v)!;
                const meta = ctx.tenant.currency
                  ? `${row.count} · ${formatMoney(row.value, ctx.tenant.currency)}`
                  : String(row.count);
                return {
                  label: PIPELINE_STAGES.find((s) => s.value === v)?.label ?? v,
                  value: row.count,
                  meta,
                  color: stageColor(v),
                };
              })}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Top lead sources" />
          <div className="space-y-2 px-5 py-4">
            {sourceRows.length === 0 && <div className="text-sm" style={{ color: "var(--muted)" }}>No data.</div>}
            {sourceRows.map((r) => (
              <Bar
                key={r.label}
                label={r.label}
                value={r.count}
                max={Math.max(1, ...sourceRows.map((x) => x.count))}
              />
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Lost reasons" description="Top categories of recent losses" />
          <div className="space-y-2 px-5 py-4">
            {topLostReasons.length === 0 && <div className="text-sm" style={{ color: "var(--muted)" }}>No losses in range.</div>}
            {topLostReasons.map((r) => (
              <Bar
                key={r.label}
                label={r.label}
                value={r.count}
                max={Math.max(1, ...topLostReasons.map((x) => x.count))}
                color="#c54a4a"
              />
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Top opportunities" description="Highest estimated-value customers in range" />
          <ul>
            {topByValue.length === 0 && (
              <li className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>No data.</li>
            )}
            {topByValue.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                <div className="flex items-center gap-3">
                  <Link href={`/t/${slug}/customers/${c.id}`} className="text-sm font-medium underline">
                    {c.name}
                  </Link>
                  <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: stageColor(c.stage), color: "white" }}>
                    {PIPELINE_STAGES.find((s) => s.value === c.stage)?.label ?? c.stage}
                  </span>
                </div>
                <div className="text-sm">
                  {formatMoney(Number(c.estimatedValue ?? 0), ctx.tenant.currency)}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
