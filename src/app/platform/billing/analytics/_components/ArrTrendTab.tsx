import { LineChartCard, CHART_PALETTE } from "@/components/ui/Charts";
import type { MonthlyRevenueRow, MrrMovementRow, MrrSnapshot } from "@/server/platform/revenue-analytics";
import { fmtMoney, Kpi, SectionHeader, DeferredNote } from "./shared";

export function ArrTrendTab({
  snapshot, movement, monthlyRevenue,
}: {
  snapshot: MrrSnapshot;
  movement: MrrMovementRow[];
  monthlyRevenue: MonthlyRevenueRow[];
}) {
  // Reconstruct historical MRR from movement: start at current MRR and
  // walk backwards subtracting net monthly delta.
  const reverse: { month: string; arr: number }[] = [];
  let running = snapshot.totalMrr;
  for (let i = movement.length - 1; i >= 0; i--) {
    reverse.push({ month: movement[i].month, arr: running * 12 / 100 });
    running -= movement[i].netMrr;
  }
  const arrSeries = reverse.reverse();

  // Year-over-year overlay: for each month, find the same calendar month
  // 12 months prior in the movement series (if it exists).
  const arrByMonth = new Map(arrSeries.map((r) => [r.month, r.arr]));
  const lastYearOverlay = arrSeries.map((r) => {
    const [y, m] = r.month.split("-").map(Number);
    const prevKey = `${y - 1}-${String(m).padStart(2, "0")}`;
    return { month: r.month, lastYearArr: arrByMonth.get(prevKey) ?? null };
  });

  const chartData = arrSeries.map((r, i) => ({
    month: r.month,
    arr: r.arr,
    lastYear: lastYearOverlay[i].lastYearArr ?? undefined,
    goal: snapshot.totalArr * 1.5 / 100,   // 50% growth goal line — simple placeholder
  }));

  const cashRevenue30d = monthlyRevenue[monthlyRevenue.length - 1]?.revenue ?? 0;
  const arrYoY = (() => {
    const latest = arrSeries[arrSeries.length - 1]?.arr ?? 0;
    const yearAgo = lastYearOverlay[lastYearOverlay.length - 1]?.lastYearArr ?? null;
    if (yearAgo == null || yearAgo === 0) return null;
    return (latest - yearAgo) / yearAgo;
  })();

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="ARR (now)"      value={fmtMoney(snapshot.totalArr)} tone="good" />
        <Kpi label="MRR (now)"      value={fmtMoney(snapshot.totalMrr)} />
        <Kpi label="Cash revenue · last month"
             value={fmtMoney(cashRevenue30d)}
             sub="Paid invoices only" />
        <Kpi label="YoY ARR growth"
             value={arrYoY == null ? "—" : `${(arrYoY * 100).toFixed(1)}%`}
             tone={arrYoY != null && arrYoY > 0 ? "good" : "default"}
             sub="vs same month last year" />
      </div>

      <div className="rounded-lg border p-4"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <SectionHeader
          title="ARR trend (last 24 months)"
          description="Reconstructed by walking backwards through the MRR movement series. Goal line = 1.5× current ARR (configurable later)."
        />
        <div className="mt-3">
          <LineChartCard
            data={chartData}
            xKey="month"
            series={[
              { dataKey: "arr",      name: "ARR",            color: CHART_PALETTE[0] },
              { dataKey: "lastYear", name: "Last year",      color: CHART_PALETTE[5] },
              { dataKey: "goal",     name: "Goal",           color: CHART_PALETTE[2] },
            ]}
            height="lg"
            emptyLabel="No movement history yet."
          />
        </div>
      </div>

      <DeferredNote>
        <strong>Annotations (campaign markers, price-change events) are deferred.</strong>
        We don&apos;t have a marketing-event log yet — once campaigns or price changes surface as
        their own model, this chart adds vertical annotations at the right month.
      </DeferredNote>
    </div>
  );
}
