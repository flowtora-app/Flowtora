import { DeferredNote, Kpi } from "./shared";

export function PerformanceTab({
  funnel, byFailureReason,
}: {
  funnel: {
    failed: number;
    emailSent: number;
    emailOpened: number;
    paymentUpdated: number;
    recovered: number;
  };
  byFailureReason: { code: string; failed: number; recovered: number; recoveryRate: number | null }[];
}) {
  const stages = [
    { label: "Failed",            value: funnel.failed,         deferred: false },
    { label: "Email sent",        value: funnel.emailSent,      deferred: false },
    { label: "Email opened",      value: funnel.emailOpened,    deferred: true },
    { label: "Payment updated",   value: funnel.paymentUpdated, deferred: true },
    { label: "Recovered",         value: funnel.recovered,      deferred: false },
  ];

  const max = Math.max(1, ...stages.map((s) => s.value));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Failed · 90d"       value={String(funnel.failed)} />
        <Kpi label="Recovered · 90d"
             value={String(funnel.recovered)}
             tone={funnel.recovered > 0 ? "good" : "default"} />
        <Kpi label="Conversion (failed → recovered)"
             value={funnel.failed === 0 ? "—" : `${Math.round((funnel.recovered / funnel.failed) * 1000) / 10}%`}
             tone={funnel.failed > 0 && funnel.recovered / funnel.failed >= 0.5 ? "good" : "default"} />
        <Kpi label="Email actions"
             value={String(funnel.emailSent)}
             sub="Custom emails + portal links sent" />
      </div>

      <section className="rounded-lg border p-4"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          Recovery funnel
        </h2>
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Failed → email sent → email opened → payment updated → recovered. Stages flagged with
          a hint require email-event tracking we haven&apos;t wired yet.
        </p>
        <div className="mt-4 space-y-3">
          {stages.map((s) => {
            const pct = (s.value / max) * 100;
            return (
              <div key={s.label}>
                <div className="mb-1 flex items-baseline justify-between text-[12px]">
                  <span style={{ color: "var(--text-default)" }}>
                    {s.label}{s.deferred ? " · deferred" : ""}
                  </span>
                  <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {s.value}
                  </span>
                </div>
                <div className="h-2 w-full rounded" style={{ background: "var(--surface-2)" }}>
                  <div className="h-2 rounded transition-all"
                       style={{
                         width: `${pct}%`,
                         background: s.deferred
                           ? "linear-gradient(90deg, var(--amber-200), var(--amber-300))"
                           : "var(--accent-primary)",
                       }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
            Recovery rate by failure reason
          </h2>
        </div>
        {byFailureReason.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
            No failed payments in the last 90 days.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">Failure code</th>
                  <th className="px-4 py-2 text-right font-medium">Failed</th>
                  <th className="px-4 py-2 text-right font-medium">Recovered</th>
                  <th className="px-4 py-2 text-right font-medium">Recovery rate</th>
                </tr>
              </thead>
              <tbody>
                {byFailureReason.map((r) => (
                  <tr key={r.code} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td className="px-4 py-2 font-mono text-[12px]" style={{ color: "var(--text-default)" }}>
                      {r.code}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                      {r.failed}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                      {r.recovered}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums"
                        style={{ color: r.recoveryRate != null && r.recoveryRate >= 50 ? "var(--success-fg)" : "var(--text-default)" }}>
                      {r.recoveryRate == null ? "—" : `${r.recoveryRate}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <DeferredNote>
        <strong>Email-open and payment-update tracking are deferred.</strong> Open rates need a
        Resend webhook + a per-message tracking record. Payment-update detection ships when the
        Stripe portal callback is wired. <strong>A/B testing</strong> needs a treatment-vs-control
        attribution layer — same dependency.
      </DeferredNote>
    </div>
  );
}
