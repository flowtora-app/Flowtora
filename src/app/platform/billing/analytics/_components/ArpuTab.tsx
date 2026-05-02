import type { ArpuByPlan } from "@/server/platform/revenue-analytics";
import { Kpi, SectionHeader, fmtMoney } from "./shared";

export function ArpuTab({ arpuByPlan }: { arpuByPlan: ArpuByPlan[] }) {
  const totalRevenue = arpuByPlan.reduce((a, p) => a + p.monthlyRevenue, 0);
  const totalActive  = arpuByPlan.reduce((a, p) => a + p.activeTenants, 0);
  const overallArpu  = totalActive === 0 ? 0 : Math.round(totalRevenue / totalActive);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="ARPU (overall)"
             value={fmtMoney(overallArpu)}
             sub="Total MRR / active tenants" />
        <Kpi label="ARPA (overall)"
             value={fmtMoney(overallArpu)}
             sub="Same as ARPU here — one user per tenant today" />
        <Kpi label="Active tenants"   value={String(totalActive)} />
        <Kpi label="MRR"              value={fmtMoney(totalRevenue)} />
      </div>

      <div className="rounded-lg border p-4"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <SectionHeader
          title="ARPU by plan"
          description="Each plan's monthly revenue divided by its active-tenant count."
        />
        {arpuByPlan.length === 0 ? (
          <p className="mt-4 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
            No active paying tenants yet.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">Plan</th>
                  <th className="px-4 py-2 text-right font-medium">Active tenants</th>
                  <th className="px-4 py-2 text-right font-medium">Monthly revenue</th>
                  <th className="px-4 py-2 text-right font-medium">ARPU</th>
                </tr>
              </thead>
              <tbody>
                {arpuByPlan.map((p) => (
                  <tr key={p.planSlug} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td className="px-4 py-2" style={{ color: "var(--text-default)" }}>{p.planName}</td>
                    <td className="px-4 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                      {p.activeTenants}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                      {fmtMoney(p.monthlyRevenue)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                      {fmtMoney(p.arpu)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
