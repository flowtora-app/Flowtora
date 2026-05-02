import { AreaChartCard, BarChartCard, CHART_PALETTE, LineChartCard } from "@/components/ui/Charts";
import type { MrrMovementRow, MrrSnapshot } from "@/server/platform/revenue-analytics";
import { DeferredNote, fmtMoney, Kpi, SectionHeader } from "./shared";

export function MrrMovementTab({
  snapshot, movement,
}: {
  snapshot: MrrSnapshot;
  movement: MrrMovementRow[];
}) {
  const last = movement[movement.length - 1];
  const last3 = movement.slice(-3);
  const new3 = last3.reduce((a, r) => a + r.newMrr, 0);
  const exp3 = last3.reduce((a, r) => a + r.expansionMrr, 0);
  const con3 = last3.reduce((a, r) => a + r.contractionMrr, 0);
  const ch3  = last3.reduce((a, r) => a + r.churnedMrr, 0);

  // Recharts data — flatten cents to dollars and make churn/contraction
  // negative so the stacked bar visualises correctly.
  const chartData = movement.map((r) => ({
    month: r.month,
    new: r.newMrr / 100,
    expansion: r.expansionMrr / 100,
    contraction: -r.contractionMrr / 100,
    churned: -r.churnedMrr / 100,
    net: r.netMrr / 100,
  }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Net new MRR · 3mo"
             value={fmtMoney(last ? last.netMrr : 0)}
             sub={`${last?.month ?? ""}`}
             tone={last && last.netMrr >= 0 ? "good" : "danger"} />
        <Kpi label="New · 3mo"        value={fmtMoney(new3)} tone="good" />
        <Kpi label="Expansion · 3mo"  value={fmtMoney(exp3)} />
        <Kpi label="Contraction · 3mo" value={fmtMoney(-con3)} tone={con3 > 0 ? "warning" : "default"} />
        <Kpi label="Churned · 3mo"    value={fmtMoney(-ch3)} tone={ch3 > 0 ? "danger" : "default"} />
        <Kpi label="Reactivated · 3mo" value="$0" sub="event log not tracked" />
      </div>

      <div className="rounded-lg border p-4"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <SectionHeader
          title="MRR movement (last 12 months)"
          description="Stacked bars = New / Expansion (positive) and Contraction / Churned (negative). Line overlay = net MRR."
        />
        <div className="mt-3">
          <BarChartCard
            data={chartData}
            xKey="month"
            stacked
            series={[
              { dataKey: "new",         name: "New",         color: CHART_PALETTE[2] },
              { dataKey: "expansion",   name: "Expansion",   color: CHART_PALETTE[1] },
              { dataKey: "contraction", name: "Contraction", color: CHART_PALETTE[3] },
              { dataKey: "churned",     name: "Churned",     color: CHART_PALETTE[4] },
            ]}
            height="md"
          />
        </div>
        <div className="mt-2">
          <LineChartCard
            data={chartData}
            xKey="month"
            series={[
              { dataKey: "net", name: "Net MRR (overlay)", color: CHART_PALETTE[0] },
            ]}
            height="sm"
          />
        </div>
      </div>

      <div className="rounded-lg border p-4"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <SectionHeader
          title="MRR by plan (current snapshot)"
          description="Active tenants × monthly price, grouped by plan. Trial + past-due tenants are excluded."
        />
        <div className="mt-3">
          <AreaChartCard
            data={[{
              snapshot: "Now",
              ...Object.fromEntries(snapshot.byPlan.map((p) => [p.planName, p.mrr / 100])),
            }]}
            xKey="snapshot"
            series={snapshot.byPlan.map((p, i) => ({
              dataKey: p.planName,
              color: CHART_PALETTE[i % CHART_PALETTE.length],
            }))}
            stacked
            height="sm"
            emptyLabel="No active tenants on a paid plan yet."
          />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
          {snapshot.byPlan.map((p) => (
            <div key={p.planSlug} className="rounded-md border p-3"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
              <div className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
                {p.planName}
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-[18px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>
                  {fmtMoney(p.mrr)}
                </span>
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {p.tenants} tenant{p.tenants === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <DeferredNote>
        <strong>Approximate movement.</strong> Without a dedicated subscription-event log, expansion is
        approximated from invoices that exceed the plan&apos;s headline price, and contraction comes from
        successful refunds. New / churned MRR are derived from <span className="font-mono">tenant.createdAt</span> +{" "}
        <span className="font-mono">tenant.status</span>. Reactivated MRR is always zero — we don&apos;t
        log status changes yet. Drill-down to subscriptions per segment ships when the event log lands.
      </DeferredNote>
    </div>
  );
}
