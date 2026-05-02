import { DonutChartCard } from "@/components/ui/Charts";
import type { PlanDistribution } from "@/server/platform/revenue-analytics";
import { Kpi, SectionHeader, DeferredNote, fmtMoney } from "./shared";

export function PlanMigrationTab({ distribution }: { distribution: PlanDistribution }) {
  const totalMrr = distribution.bySlug.reduce((a, p) => a + p.mrr, 0);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi label="Active tenants" value={String(distribution.total)} />
        <Kpi label="Plans in use"   value={String(distribution.bySlug.length)} />
        <Kpi label="MRR" value={fmtMoney(totalMrr)} />
      </div>

      <div className="rounded-lg border p-4"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <SectionHeader
          title="Current plan distribution"
          description="A Sankey diagram requires historical plan-assignment snapshots — for now we render the current snapshot as a donut."
        />
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-[1fr_2fr]">
          <DonutChartCard
            data={distribution.bySlug.map((p) => ({ name: p.name, value: p.count }))}
            height="md"
          />
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">Plan</th>
                  <th className="px-4 py-2 text-right font-medium">Tenants</th>
                  <th className="px-4 py-2 text-right font-medium">MRR</th>
                  <th className="px-4 py-2 text-right font-medium">Share</th>
                </tr>
              </thead>
              <tbody>
                {distribution.bySlug.map((p) => (
                  <tr key={p.slug} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td className="px-4 py-2" style={{ color: "var(--text-default)" }}>{p.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                      {p.count}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                      {fmtMoney(p.mrr)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {distribution.total === 0 ? "—" : `${Math.round((p.count / distribution.total) * 100)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <DeferredNote>
        <strong>Sankey flow A → B is deferred.</strong> We don&apos;t track plan-change events yet —
        when an admin runs <span className="font-mono">tenant.changePlan</span>, we&apos;d need a row
        on a <span className="font-mono">PlanMigration</span> table to render the flow chart and
        drill into tenants that moved between two plans.
      </DeferredNote>
    </div>
  );
}
