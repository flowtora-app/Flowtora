import Link from "next/link";
import { TrendChart } from "@/components/charts/TrendChart";
import { SectionCard } from "@/components/platform/SectionCard";
import type { TrendPoint, PlanMixRow } from "@/server/platform/overview-metrics";
import { fmtUsd } from "@/lib/platform-format";

type Props = {
  data: TrendPoint[];
  stackKeys: string[];
  planMix: PlanMixRow[];
  totalInRange: number;
  rangeLabel: string;
};

export function RevenueTrendCard({ data, stackKeys, planMix, totalInRange, rangeLabel }: Props) {
  const colorByName = new Map(planMix.map((p) => [p.name, p.color]));
  const series = stackKeys.map((key) => ({
    key,
    label: key,
    color: colorByName.get(key) ?? "var(--accent-primary)",
  }));

  const hasSignal = data.some((d) => stackKeys.some((k) => Number(d[k] ?? 0) > 0));

  return (
    <SectionCard
      title="Revenue by plan"
      subtitle={`${fmtUsd(totalInRange)} collected · ${rangeLabel}`}
      action={
        <Link
          href="/platform/revenue"
          className="text-xs"
          style={{ color: "var(--accent-primary)" }}
        >
          Open revenue →
        </Link>
      }
    >
      {hasSignal ? (
        <TrendChart
          data={data}
          series={series}
          height={240}
          valuePrefix="$"
          filled
          stacked
        />
      ) : (
        <div
          className="flex flex-col items-center justify-center rounded-lg text-center"
          style={{
            height: 240,
            background: "var(--surface-0)",
            border: "1px dashed var(--border-subtle)",
          }}
        >
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No payments collected in this range.
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--text-faint)" }}>
            Widen the range or check that the Payment webhook is firing.
          </p>
        </div>
      )}
    </SectionCard>
  );
}
