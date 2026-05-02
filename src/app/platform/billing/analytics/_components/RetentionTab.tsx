import type { CohortRow } from "@/server/platform/revenue-analytics";
import { DeferredNote, Kpi, SectionHeader } from "./shared";

export function RetentionTab({ cohorts }: { cohorts: CohortRow[] }) {
  // Compute net revenue retention proxy: % of original cohort still alive.
  const latest = cohorts.find((c) => c.size > 0 && c.retained.length >= 1);
  const nrr = (() => {
    if (!latest || latest.size === 0) return null;
    const lastRetained = latest.retained[latest.retained.length - 1] ?? latest.size;
    return Math.round((lastRetained / latest.size) * 1000) / 10;
  })();

  const grossRetention = (() => {
    const totalSize = cohorts.reduce((a, c) => a + c.size, 0);
    const totalAlive = cohorts.reduce((a, c) => a + (c.retained[c.retained.length - 1] ?? c.size), 0);
    return totalSize === 0 ? null : Math.round((totalAlive / totalSize) * 1000) / 10;
  })();

  // Build retention matrix
  const maxMonths = Math.max(0, ...cohorts.map((c) => c.retained.length));
  const matrix = cohorts.map((c) => ({
    cohort: c.cohort,
    size: c.size,
    cells: Array.from({ length: maxMonths }, (_, i) => {
      const alive = c.retained[i];
      if (alive == null || c.size === 0) return null;
      return { alive, pct: alive / c.size };
    }),
  }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi label="Net Revenue Retention"
             value={nrr == null ? "—" : `${nrr}%`}
             tone={nrr != null && nrr >= 110 ? "good" : nrr != null && nrr < 90 ? "warning" : "default"}
             sub="Target ≥ 110% (best-in-class)" />
        <Kpi label="Gross Retention"
             value={grossRetention == null ? "—" : `${grossRetention}%`}
             tone={grossRetention != null && grossRetention >= 90 ? "good" : "default"}
             sub="Across all cohorts" />
        <Kpi label="Cohorts tracked"
             value={String(cohorts.filter((c) => c.size > 0).length)} />
      </div>

      <div className="rounded-lg border p-4"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <SectionHeader
          title="Cohort retention heatmap"
          description="Rows = signup month. Columns = months since signup. Cell = % of cohort still alive."
        />
        {cohorts.every((c) => c.size === 0) ? (
          <p className="mt-4 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
            No cohorts in the last 6 months yet — data appears here once tenants sign up.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left font-medium" style={{ color: "var(--text-muted)" }}>
                    Cohort
                  </th>
                  <th className="px-2 py-1 text-right font-medium" style={{ color: "var(--text-muted)" }}>
                    Size
                  </th>
                  {Array.from({ length: maxMonths }, (_, i) => (
                    <th key={i} className="px-2 py-1 text-center font-medium"
                        style={{ color: "var(--text-muted)" }}>
                      M{i}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.map((m) => (
                  <tr key={m.cohort}>
                    <td className="px-2 py-1 font-mono" style={{ color: "var(--text-default)" }}>{m.cohort}</td>
                    <td className="px-2 py-1 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>{m.size}</td>
                    {m.cells.map((c, i) => (
                      <td key={i} className="px-2 py-1 text-center tabular-nums"
                          style={{
                            background: c == null ? "transparent" : intensityColor(c.pct),
                            color: c == null ? "var(--text-faint)" : c.pct > 0.6 ? "white" : "var(--text-default)",
                            border: "1px solid var(--border-subtle)",
                            minWidth: 48,
                          }}>
                        {c == null ? "—" : `${(c.pct * 100).toFixed(0)}%`}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DeferredNote>
        <strong>NRR with expansion is approximate.</strong> True NRR weights MRR (not tenant counts).
        Without historical-MRR-per-cohort, today&apos;s number is logo-based retention. Drill-down per
        cohort cell ships when the event log lands.
      </DeferredNote>
    </div>
  );
}

function intensityColor(pct: number): string {
  // Blue-to-white scale: 1.0 → solid accent, 0.0 → near-white
  const alpha = Math.min(1, Math.max(0.05, pct));
  return `rgba(124, 58, 237, ${alpha})`; // brand-600
}
