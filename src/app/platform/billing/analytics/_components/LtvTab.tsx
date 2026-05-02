import type { LtvByPlan } from "@/server/platform/revenue-analytics";
import { Kpi, SectionHeader, DeferredNote, fmtMoney, fmtPct } from "./shared";

export function LtvTab({ ltvByPlan }: { ltvByPlan: LtvByPlan[] }) {
  const avgLtv = ltvByPlan.length === 0
    ? 0
    : Math.round(ltvByPlan.reduce((a, p) => a + p.ltv, 0) / ltvByPlan.length);
  const avgChurn = ltvByPlan.length === 0
    ? 0
    : ltvByPlan.reduce((a, p) => a + p.estChurnRate, 0) / ltvByPlan.length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi label="Avg LTV across plans" value={fmtMoney(avgLtv)} />
        <Kpi label="Avg monthly churn" value={fmtPct(avgChurn)}
             tone={avgChurn < 0.05 ? "good" : avgChurn > 0.10 ? "danger" : "warning"} />
        <Kpi label="LTV : CAC" value="—" sub="CAC requires marketing spend integration" />
      </div>

      <div className="rounded-lg border p-4"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <SectionHeader
          title="LTV by plan"
          description="LTV ≈ ARPU / monthly churn rate. Churn is a global estimate (90-day rolling) — per-plan churn needs historical assignment."
        />
        {ltvByPlan.length === 0 ? (
          <p className="mt-4 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
            No active plans with paying tenants yet.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">Plan</th>
                  <th className="px-4 py-2 text-right font-medium">ARPU / mo</th>
                  <th className="px-4 py-2 text-right font-medium">Churn / mo</th>
                  <th className="px-4 py-2 text-right font-medium">LTV</th>
                </tr>
              </thead>
              <tbody>
                {ltvByPlan.map((p) => (
                  <tr key={p.planSlug} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td className="px-4 py-2" style={{ color: "var(--text-default)" }}>{p.planName}</td>
                    <td className="px-4 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                      {fmtMoney(p.arpu)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {fmtPct(p.estChurnRate)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                      {p.ltv === 0 ? "—" : fmtMoney(p.ltv)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DeferredNote>
        <strong>LTV by acquisition channel is deferred.</strong> We don&apos;t track signup attribution
        (organic / paid / referral / outbound) yet. When that lands as a tenant field, this tab
        adds a per-channel breakdown. The LTV : CAC ratio gauge waits on the same — see CAC &amp; Payback.
      </DeferredNote>
    </div>
  );
}
