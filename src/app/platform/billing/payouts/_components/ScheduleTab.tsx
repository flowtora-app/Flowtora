import Link from "next/link";
import { triggerPartnerPayout } from "@/app/actions/platform-payouts";
import type { ScheduleData } from "@/server/platform/payouts";
import { Kpi, fmtMoney, DeferredNote } from "./shared";

export function ScheduleTab({
  data, canManage,
}: {
  data: ScheduleData;
  canManage: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Pending payout balance"
             value={fmtMoney(data.totalPendingMinor)}
             tone={data.totalPendingMinor > 0 ? "warning" : "default"}
             sub="Unpaid commission lines, net of holds + deductions" />
        <Kpi label="Scheduled · 7d"
             value={String(data.scheduledThisWeek)}
             sub="Pending payouts dispatching this week" />
        <Kpi label="Paid this month"
             value={fmtMoney(data.paidThisMonth)}
             tone={data.paidThisMonth > 0 ? "good" : "default"} />
        <Kpi label="Partners with balance"
             value={String(data.upcomingByPartner.length)} />
      </div>

      <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
            Upcoming payouts ({data.upcomingByPartner.length})
          </h2>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Per-partner breakdown of unpaid commission lines for the latest period. Trigger
            sends a manual payout that bundles the lines into one PartnerPayout row.
          </p>
        </div>
        {data.upcomingByPartner.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
            No partners have unpaid commission. New commission lines accrue automatically when
            attributed payments come through.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">Partner</th>
                  <th className="px-4 py-2 font-medium">Period</th>
                  <th className="px-4 py-2 text-right font-medium">Lines</th>
                  <th className="px-4 py-2 text-right font-medium">Net pending</th>
                  <th className="px-4 py-2 font-medium">Method</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  {canManage && <th className="px-4 py-2 font-medium" />}
                </tr>
              </thead>
              <tbody>
                {data.upcomingByPartner.map((r) => (
                  <tr key={r.affiliateId} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td className="px-4 py-2">
                      <span className="font-medium" style={{ color: "var(--text-default)" }}>{r.affiliateName}</span>
                      <div className="font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>{r.affiliateCode}</div>
                    </td>
                    <td className="px-4 py-2 font-mono text-[12px]" style={{ color: "var(--text-default)" }}>
                      {r.pendingPeriod ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {r.pendingLines}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                      {fmtMoney(r.pendingTotal)}
                    </td>
                    <td className="px-4 py-2 text-[12px]"
                        style={{ color: r.hasMethod ? "var(--success-fg)" : "var(--rose-700)" }}>
                      {r.hasMethod ? "Configured" : "No method"}
                    </td>
                    <td className="px-4 py-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                      {r.alreadyScheduled
                        ? <>{r.alreadyScheduled.status} · scheduled {r.alreadyScheduled.scheduledAt.toLocaleDateString()}</>
                        : "—"}
                    </td>
                    {canManage && (
                      <td className="px-4 py-2 text-right">
                        {!r.alreadyScheduled && r.hasMethod && r.pendingTotal > 0 && r.pendingPeriod ? (
                          <form action={triggerPartnerPayout}>
                            <input type="hidden" name="affiliateId" value={r.affiliateId} />
                            <input type="hidden" name="period" value={r.pendingPeriod} />
                            <button type="submit"
                                    className="ts-focus rounded-md border px-2.5 py-1 text-[11px] font-medium"
                                    style={{ borderColor: "var(--accent-primary)", color: "var(--accent-primary)", background: "var(--surface-1)" }}>
                              Trigger payout
                            </button>
                          </form>
                        ) : !r.hasMethod ? (
                          <Link href="/platform/billing/payouts?tab=methods"
                                className="ts-focus text-[11px] underline"
                                style={{ color: "var(--text-muted)" }}>
                            Configure →
                          </Link>
                        ) : (
                          <span style={{ color: "var(--text-faint)" }}>—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <DeferredNote>
        <strong>Auto-payout cron is deferred.</strong> A scheduled job that sweeps unpaid
        commission lines into payouts on a fixed cadence (e.g. monthly on the 1st) ships when the
        rail SDKs land — keeping it manual for now means surprise payouts can&apos;t go out
        before the operator has reviewed the partner&apos;s statement.
      </DeferredNote>
    </div>
  );
}
