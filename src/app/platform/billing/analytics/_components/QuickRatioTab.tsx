"use client";

import { LineChartCard, CHART_PALETTE } from "@/components/ui/Charts";
import type { QuickRatioRow } from "@/server/platform/revenue-analytics";
import { Kpi, SectionHeader, DeferredNote, fmtMoney } from "./shared";

export function QuickRatioTab({ rows }: { rows: QuickRatioRow[] }) {
  const last = rows[rows.length - 1];
  const avgRatio = (() => {
    const valid = rows.filter((r) => r.quickRatio != null) as Array<QuickRatioRow & { quickRatio: number }>;
    if (valid.length === 0) return null;
    return valid.reduce((a, r) => a + r.quickRatio, 0) / valid.length;
  })();

  const chartData = rows.map((r) => ({
    month: r.month,
    quickRatio: r.quickRatio ?? null,
    growth: r.newPlusExpansion / 100,
    erosion: r.churnPlusContraction / 100,
  }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Quick Ratio (last month)"
             value={last?.quickRatio == null ? "—" : last.quickRatio.toFixed(2)}
             tone={last?.quickRatio != null && last.quickRatio >= 4 ? "good" : "default"}
             sub="(New + Expansion) / (Churn + Contraction)" />
        <Kpi label="Avg Quick Ratio · 12mo"
             value={avgRatio == null ? "—" : avgRatio.toFixed(2)} />
        <Kpi label="Magic Number" value="—" sub="Sales-led metric — needs sales spend" />
        <Kpi label="Burn Multiple" value="—" sub="Needs cash-burn data" />
      </div>

      <div className="rounded-lg border p-4"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <SectionHeader
          title="Quick Ratio trend"
          description="≥ 4 is best-in-class — every $1 of churn is offset by $4 of new + expansion. Below 1 means MRR is contracting."
        />
        <div className="mt-3">
          <LineChartCard
            data={chartData}
            xKey="month"
            series={[
              { dataKey: "quickRatio", name: "Quick Ratio", color: CHART_PALETTE[0] },
            ]}
            height="md"
            valueFormat={(n) => n.toFixed(2)}
            emptyLabel="Not enough movement to compute."
          />
        </div>
      </div>

      <div className="rounded-lg border p-4"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <SectionHeader title="Growth vs erosion ($)" />
        <div className="mt-3">
          <LineChartCard
            data={chartData}
            xKey="month"
            series={[
              { dataKey: "growth",  name: "New + Expansion",       color: CHART_PALETTE[2] },
              { dataKey: "erosion", name: "Churn + Contraction",   color: CHART_PALETTE[4] },
            ]}
            height="md"
            valueFormat={(n) => fmtMoney(n * 100)}
          />
        </div>
      </div>

      <DeferredNote>
        <strong>Magic Number and Burn Multiple are deferred.</strong> Magic Number needs quarterly sales
        spend; Burn Multiple needs net new ARR / net cash burn — both wait on the finance ledger
        we don&apos;t track yet.
      </DeferredNote>
    </div>
  );
}
