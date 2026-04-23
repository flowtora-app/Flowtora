import Link from "next/link";
import { DonutChart } from "@/components/charts/DonutChart";
import { SectionCard } from "@/components/platform/SectionCard";
import type { PlanMixRow } from "@/server/platform/overview-metrics";
import { fmtUsd } from "@/lib/platform-format";

type Props = {
  planMix: PlanMixRow[];
  totalMrr: number;
  totalActive: number;
};

export function PlanMixCard({ planMix, totalMrr, totalActive }: Props) {
  const hasAny = planMix.some((p) => p.count > 0);
  const slices = planMix
    .filter((p) => p.count > 0)
    .map((p) => ({ label: p.name, value: p.count, color: p.color }));

  return (
    <SectionCard
      title="Plan mix"
      subtitle={`${totalActive} paying tenants · ${fmtUsd(totalMrr)} MRR`}
    >
      {hasAny ? (
        <div className="flex flex-col gap-3">
          <DonutChart data={slices} height={180} />
          <ul className="space-y-1.5">
            {planMix.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/platform/tenants?plan=${p.slug.toUpperCase()}`}
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors hover:brightness-110"
                  style={{ background: "transparent" }}
                >
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: p.color }}
                  />
                  <span className="flex-1" style={{ color: "var(--text-default)" }}>
                    {p.name}
                  </span>
                  <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {p.count}
                  </span>
                  <span
                    className="w-12 text-right tabular-nums"
                    style={{ color: "var(--text-faint)" }}
                  >
                    {p.sharePct}%
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p
          className="rounded-lg px-4 py-10 text-center text-sm"
          style={{
            background: "var(--surface-0)",
            border: "1px dashed var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          No active subscriptions yet.
        </p>
      )}
    </SectionCard>
  );
}
