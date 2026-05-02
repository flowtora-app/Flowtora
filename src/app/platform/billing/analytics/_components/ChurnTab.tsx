import { LineChartCard, BarChartCard, CHART_PALETTE } from "@/components/ui/Charts";
import type { MonthlyRevenueRow, MrrMovementRow } from "@/server/platform/revenue-analytics";
import { Kpi, SectionHeader, DeferredNote, fmtMoney } from "./shared";

export function ChurnTab({
  movement, monthlyRevenue,
}: {
  movement: MrrMovementRow[];
  monthlyRevenue: MonthlyRevenueRow[];
}) {
  const last = movement[movement.length - 1];
  const totalChurnMrr = movement.reduce((a, r) => a + r.churnedMrr, 0);
  const last3LogoChurn = monthlyRevenue.slice(-3).reduce((a, r) => a + r.churned, 0);

  // Gross MRR Churn % per month: churnedMrr / starting MRR.
  // Walk MRR forward, dividing churn by the prior month's MRR.
  let priorMrr = 0;
  const grossSeries = movement.map((m) => {
    const startingMrr = priorMrr;
    priorMrr += m.netMrr;
    return {
      month: m.month,
      grossChurnPct: startingMrr > 0
        ? Math.round((m.churnedMrr / startingMrr) * 1000) / 10
        : 0,
      netChurnPct: startingMrr > 0
        ? Math.round(((m.churnedMrr - m.expansionMrr) / startingMrr) * 1000) / 10
        : 0,
    };
  });

  const logoSeries = monthlyRevenue.map((m) => ({
    month: m.month,
    churned: m.churned,
    new: m.newSignups,
  }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Logo churn · 3mo"
             value={String(last3LogoChurn)}
             tone={last3LogoChurn > 0 ? "warning" : "default"}
             sub="Tenants moved to canceled / suspended" />
        <Kpi label="Last month MRR churn"
             value={fmtMoney(last?.churnedMrr ?? 0)}
             tone={last && last.churnedMrr > 0 ? "danger" : "default"} />
        <Kpi label="Total MRR churned · 12mo"
             value={fmtMoney(totalChurnMrr)} />
        <Kpi label="Voluntary vs Involuntary"
             value="—"
             sub="Reason codes deferred" />
      </div>

      <div className="rounded-lg border p-4"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <SectionHeader
          title="Gross vs Net MRR Churn (%)"
          description="Gross = churnedMrr / starting MRR. Net subtracts expansion. Both clamped at 0 when MRR is zero."
        />
        <div className="mt-3">
          <LineChartCard
            data={grossSeries}
            xKey="month"
            series={[
              { dataKey: "grossChurnPct", name: "Gross churn %", color: CHART_PALETTE[4] },
              { dataKey: "netChurnPct",   name: "Net churn %",   color: CHART_PALETTE[3] },
            ]}
            height="md"
            valueFormat={(n) => `${n}%`}
            emptyLabel="Not enough history."
          />
        </div>
      </div>

      <div className="rounded-lg border p-4"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <SectionHeader title="Logo churn per month" />
        <div className="mt-3">
          <BarChartCard
            data={logoSeries}
            xKey="month"
            series={[
              { dataKey: "new",     name: "New tenants",     color: CHART_PALETTE[2] },
              { dataKey: "churned", name: "Churned tenants", color: CHART_PALETTE[4] },
            ]}
            height="md"
            stacked={false}
            valueFormat={(n) => n.toString()}
          />
        </div>
      </div>

      <DeferredNote>
        <strong>Voluntary vs Involuntary, By Plan, and cohort heatmap are deferred.</strong>
        We need a churn-reason field on the cancel action and historical plan-assignment
        snapshots to chart by plan over time. Today the rate is computed across the whole
        tenant population.
      </DeferredNote>
    </div>
  );
}
