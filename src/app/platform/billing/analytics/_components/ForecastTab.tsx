import Link from "next/link";
import { LineChartCard, CHART_PALETTE } from "@/components/ui/Charts";
import type { ForecastRow } from "@/server/platform/revenue-analytics";
import { Kpi, SectionHeader, DeferredNote, fmtMoney } from "./shared";

export function ForecastTab({
  forecast, churnDelta,
}: {
  forecast: ForecastRow[];
  churnDelta: number;
}) {
  const last = forecast[forecast.length - 1];
  const first = forecast.find((r) => !r.isHistorical);
  const projected12m = last?.mrr ?? 0;
  const startMrr = first?.mrr ?? 0;
  const change = startMrr === 0 ? 0 : (projected12m - startMrr) / startMrr;

  const chartData = forecast.map((r) => ({
    month: r.month,
    historical: r.isHistorical ? r.mrr / 100 : null,
    projected: r.isHistorical ? null : r.mrr / 100,
  }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Projected MRR (12mo)" value={fmtMoney(projected12m)} tone="good" />
        <Kpi label="Projected ARR" value={fmtMoney(projected12m * 12)} />
        <Kpi label="Implied growth"
             value={`${(change * 100).toFixed(1)}%`}
             tone={change > 0 ? "good" : change < 0 ? "danger" : "default"} />
        <Kpi label="Scenario churn delta"
             value={`${(churnDelta * 100).toFixed(0)}%`}
             sub="positive = more churn, negative = less churn" />
      </div>

      <div className="rounded-lg border p-4"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <SectionHeader
          title="12-month MRR forecast"
          description="Linear extrapolation from the last 6 months of net MRR movement. Adjust the scenario slider below to see the projection shift."
        />
        <div className="mt-3">
          <LineChartCard
            data={chartData}
            xKey="month"
            series={[
              { dataKey: "historical", name: "Historical", color: CHART_PALETTE[0] },
              { dataKey: "projected",  name: "Projected",  color: CHART_PALETTE[2] },
            ]}
            height="lg"
          />
        </div>

        <ScenarioForm churnDelta={churnDelta} />
      </div>

      <DeferredNote>
        <strong>ARIMA / Prophet forecasting is deferred.</strong> Today&apos;s projection is a simple
        linear extrapolation of the last 6 months of net MRR. Once we surface a forecast service
        (with confidence-interval bands), the model selector and CI ribbon will replace this
        flat line. The scenario slider already wires <span className="font-mono">?churnDelta=</span>
        from the URL so links can deep-link a what-if view.
      </DeferredNote>
    </div>
  );
}

function ScenarioForm({ churnDelta }: { churnDelta: number }) {
  return (
    <form className="mt-4 flex flex-wrap items-end gap-3 border-t pt-4"
          style={{ borderColor: "var(--border-subtle)" }}>
      <input type="hidden" name="tab" value="forecast" />
      <label className="block">
        <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Churn delta
        </span>
        <span className="block text-[10px]" style={{ color: "var(--text-muted)" }}>
          Range -0.5 .. 0.5 (e.g. -0.2 = "if churn drops 20%")
        </span>
        <input type="number" name="churnDelta" defaultValue={churnDelta}
               step={0.05} min={-0.5} max={0.5}
               className="ts-focus mt-1 rounded-md border px-3 py-2 text-[13px]"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
      </label>
      <button type="submit"
              className="ts-focus rounded-md border px-3 py-2 text-[13px] font-medium"
              style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)", background: "var(--surface-1)" }}>
        Apply scenario
      </button>
      <Link href="/platform/billing/analytics?tab=forecast"
            className="ts-focus rounded-md px-3 py-2 text-[12px]"
            style={{ color: "var(--text-muted)" }}>
        Reset
      </Link>
    </form>
  );
}
