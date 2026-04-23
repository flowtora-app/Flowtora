import Link from "next/link";
import { Sparkline } from "@/components/charts/Sparkline";
import { DeltaPill } from "@/components/platform/DeltaPill";
import { fmtUsd } from "@/lib/platform-format";

// The $MRR hero card. Big tabular-numerals value, ARR subtitle,
// MoM delta pill, 14-day revenue sparkline behind the number.

type Props = {
  mrr: number;
  arr: number;
  mrrDeltaPct: number | null;
  mrrPrior: number;
  spark: { label: string; value: number }[];
};

export function HeroRevenueCard({ mrr, arr, mrrDeltaPct, mrrPrior, spark }: Props) {
  const hasSignal = spark.some((p) => p.value > 0);

  return (
    <Link
      href="/platform/revenue"
      aria-label="View revenue details"
      className="group relative block overflow-hidden rounded-2xl transition-colors hover:brightness-105"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      <div className="relative z-10 p-6">
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            Monthly recurring revenue
          </span>
          <DeltaPill
            value={mrrDeltaPct}
            hint={`vs. ${fmtUsd(mrrPrior)} ~30 days ago`}
          />
        </div>
        <div
          className="mt-2 font-semibold tracking-tight tabular-nums"
          style={{ fontSize: 44, lineHeight: 1.05, color: "var(--text-default)" }}
        >
          {fmtUsd(mrr)}
        </div>
        <div className="mt-1 flex items-center gap-4 text-xs" style={{ color: "var(--text-muted)" }}>
          <span>ARR {fmtUsd(arr)}</span>
          <span style={{ color: "var(--text-faint)" }}>→</span>
          <span className="opacity-0 transition-opacity group-hover:opacity-100" style={{ color: "var(--accent-primary)" }}>
            View revenue
          </span>
        </div>
      </div>

      {/* Ghost sparkline behind the number */}
      {hasSignal && (
        <div className="absolute inset-x-0 bottom-0 z-0 opacity-60" aria-hidden>
          <Sparkline
            data={spark}
            color="var(--accent-primary)"
            fill
            height={64}
            strokeWidth={1.25}
          />
        </div>
      )}
    </Link>
  );
}
