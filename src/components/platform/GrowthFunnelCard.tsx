import { ComposedTrend } from "@/components/charts/ComposedTrend";
import { SectionCard } from "@/components/platform/SectionCard";
import { DeltaPill } from "@/components/platform/DeltaPill";
import type { TrendPoint } from "@/server/platform/overview-metrics";

type Props = {
  data: TrendPoint[];
  newTenantsInRange: number;
  newTenantsDeltaPct: number | null;
  trialToPaidPct30d: number | null;
  rangeLabel: string;
};

export function GrowthFunnelCard({
  data,
  newTenantsInRange,
  newTenantsDeltaPct,
  trialToPaidPct30d,
  rangeLabel,
}: Props) {
  const hasSignal = data.some((d) => Number(d["New sign-ups"] ?? 0) > 0);

  return (
    <SectionCard
      title="Growth + funnel"
      subtitle={`${newTenantsInRange} new sign-ups · ${rangeLabel}`}
      action={
        <div className="flex items-center gap-3">
          <div className="text-right text-xs">
            <div style={{ color: "var(--text-muted)" }}>Trial → paid (30d)</div>
            <div className="tabular-nums" style={{ color: "var(--text-default)" }}>
              {trialToPaidPct30d == null ? "—" : `${trialToPaidPct30d}%`}
            </div>
          </div>
          <DeltaPill value={newTenantsDeltaPct} hint="new sign-ups vs. prior period" />
        </div>
      }
    >
      {hasSignal ? (
        <ComposedTrend
          data={data}
          barKey="New sign-ups"
          barLabel="New sign-ups"
          barColor="var(--accent-primary)"
          lineKey="Conversion %"
          lineLabel="Conversion %"
          lineColor="var(--success)"
          lineSuffix="%"
          height={240}
        />
      ) : (
        <div
          className="flex items-center justify-center rounded-lg"
          style={{
            height: 240,
            background: "var(--surface-0)",
            border: "1px dashed var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          <p className="text-sm">No sign-ups in this range.</p>
        </div>
      )}
    </SectionCard>
  );
}
