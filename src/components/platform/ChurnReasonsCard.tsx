import { SectionCard } from "@/components/platform/SectionCard";
import type { ChurnReasonRow } from "@/server/platform/overview-metrics";

type Props = {
  reasons: ChurnReasonRow[];
  churnPct30d: number | null;
};

export function ChurnReasonsCard({ reasons, churnPct30d }: Props) {
  const max = Math.max(1, ...reasons.map((r) => r.count));
  const total = reasons.reduce((acc, r) => acc + r.count, 0);

  return (
    <SectionCard
      title="Why did they leave?"
      subtitle={
        churnPct30d == null
          ? "No churn tracked yet"
          : `${churnPct30d}% churn (30d) · ${total} completed deletions in 180d`
      }
    >
      {reasons.length === 0 ? (
        <div
          className="rounded-lg px-4 py-10 text-center text-sm"
          style={{
            background: "var(--surface-0)",
            border: "1px dashed var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          No completed deletions in the last 180 days. 🎉
        </div>
      ) : (
        <ul className="space-y-2">
          {reasons.map((r, i) => {
            const pct = (r.count / max) * 100;
            return (
              <li key={`${r.reason}-${i}`} className="flex items-center gap-3">
                <span
                  className="w-32 truncate text-xs"
                  style={{ color: "var(--text-default)" }}
                  title={r.reason}
                >
                  {r.reason}
                </span>
                <div
                  className="relative h-2 flex-1 overflow-hidden rounded-full"
                  style={{ background: "var(--surface-2)" }}
                  aria-hidden
                >
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ width: `${pct}%`, background: "var(--danger)" }}
                  />
                </div>
                <span
                  className="w-6 text-right text-xs tabular-nums"
                  style={{ color: "var(--text-muted)" }}
                >
                  {r.count}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
