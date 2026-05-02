import type { CohortRow } from "@/server/platform/revenue-analytics";
import { DeferredNote, Kpi, SectionHeader } from "./shared";

export function CohortTab({ cohorts }: { cohorts: CohortRow[] }) {
  const total = cohorts.reduce((a, c) => a + c.size, 0);
  const stillAlive = cohorts.reduce((a, c) => a + (c.retained[c.retained.length - 1] ?? c.size), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi label="Cohorts (6mo back)" value={String(cohorts.filter((c) => c.size > 0).length)} />
        <Kpi label="Tenants tracked" value={String(total)} />
        <Kpi label="Still alive"
             value={String(stillAlive)}
             tone={total > 0 && stillAlive / total > 0.85 ? "good" : "default"}
             sub={total === 0 ? "—" : `${Math.round((stillAlive / total) * 100)}%`} />
      </div>

      <div className="rounded-lg border p-4"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <SectionHeader
          title="Cohort summary"
          description="Same data as Retention, summarized by signup cohort with months-since-signup retention curve."
        />
        {cohorts.every((c) => c.size === 0) ? (
          <p className="mt-4 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
            No cohorts in the last 6 months.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            {cohorts.filter((c) => c.size > 0).map((c) => (
              <div key={c.cohort} className="rounded-md border p-3"
                   style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-[12px]" style={{ color: "var(--text-default)" }}>{c.cohort}</span>
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {c.size} tenant{c.size === 1 ? "" : "s"} · {c.retained.length} months tracked
                  </span>
                </div>
                <div className="mt-2 flex gap-1">
                  {c.retained.map((alive, i) => {
                    const pct = c.size === 0 ? 0 : alive / c.size;
                    return (
                      <div key={i}
                           title={`Month ${i}: ${alive}/${c.size} (${(pct * 100).toFixed(0)}%)`}
                           className="flex-1 rounded text-center text-[10px] tabular-nums"
                           style={{
                             background: `rgba(124, 58, 237, ${Math.max(0.05, pct)})`,
                             color: pct > 0.6 ? "white" : "var(--text-default)",
                             padding: "4px 0",
                           }}>
                        {(pct * 100).toFixed(0)}%
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <DeferredNote>
        <strong>Revenue contribution + feature adoption per cohort are deferred.</strong> The
        revenue side needs historical MRR-per-tenant snapshots; feature adoption needs an
        event log per feature. Both ship with the analytics-event pipeline.
      </DeferredNote>
    </div>
  );
}
