import Link from "next/link";
import { Sparkline } from "@/components/charts/Sparkline";
import { DeltaPill } from "@/components/platform/DeltaPill";

// Horizontal strip of KPI cards. Each card:
//   - upper-case label
//   - big tabular value
//   - optional delta pill
//   - optional 14-day sparkline footer
//   - optional drill-through href (whole card becomes a link)

export type KpiProps = {
  label: string;
  value: string;
  href?: string;
  deltaPct?: number | null;
  deltaHint?: string;
  deltaInvertGood?: boolean;
  spark?: number[];
  sparkColor?: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
  sub?: string;
};

const TONE_COLOR: Record<NonNullable<KpiProps["tone"]>, string> = {
  default: "var(--text-default)",
  success: "var(--success-fg)",
  warning: "var(--warning-fg)",
  danger:  "var(--danger-fg)",
  info:    "var(--info-fg)",
};

export function Kpi({
  label,
  value,
  href,
  deltaPct,
  deltaHint,
  deltaInvertGood,
  spark,
  sparkColor,
  tone = "default",
  sub,
}: KpiProps) {
  const inner = (
    <div
      className="flex h-full flex-col rounded-xl p-4 transition-colors"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.02)",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          {label}
        </span>
        {deltaPct !== undefined && (
          <DeltaPill value={deltaPct ?? null} invertGood={deltaInvertGood} hint={deltaHint} />
        )}
      </div>
      <div
        className="mt-1.5 text-[26px] font-semibold leading-none tracking-tight tabular-nums"
        style={{ color: TONE_COLOR[tone] }}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-1 text-xs" style={{ color: "var(--text-faint)" }}>
          {sub}
        </div>
      )}
      {spark && spark.length > 0 && (
        <div className="-mx-1 mt-auto pt-3">
          <Sparkline
            data={spark}
            color={sparkColor ?? "var(--accent-primary)"}
            fill
            height={28}
            strokeWidth={1.25}
            aria-label={`${label} 14-day trend`}
          />
        </div>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function KpiStrip({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {children}
    </div>
  );
}
