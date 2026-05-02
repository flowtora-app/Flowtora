import { addPartnerCommissionLine } from "@/app/actions/platform-payouts";
import type { PartnerStatement } from "@/server/platform/payouts";
import { fmtMoneyDecimal, Kpi, DeferredNote } from "./shared";

const KIND_LABEL: Record<string, string> = {
  COMMISSION: "Commission earned",
  HOLD:       "Hold (subtracted)",
  DEDUCTION:  "Deduction (subtracted)",
  BONUS:      "Bonus",
};

export function StatementsTab({
  statements, canManage,
}: {
  statements: PartnerStatement[];
  canManage: boolean;
}) {
  const totalEarned = statements.reduce((acc, s) => acc + s.totalEarnedMinor, 0);
  const totalPaid   = statements.reduce((acc, s) => acc + s.paidOutMinor, 0);
  const totalUnpaid = totalEarned - totalPaid;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi label="Total earned"   value={fmtMoneyDecimal(totalEarned)} sub="Across all partners, all time" />
        <Kpi label="Already paid"   value={fmtMoneyDecimal(totalPaid)} tone="good" />
        <Kpi label="Outstanding"
             value={fmtMoneyDecimal(totalUnpaid)}
             tone={totalUnpaid > 0 ? "warning" : "default"}
             sub="Earned − paid (incl. pending payouts)" />
      </div>

      {statements.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-[13px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
          No partners on file yet. Add an Affiliate to start tracking commission.
        </div>
      ) : (
        statements.map((s) => (
          <PartnerStatementCard key={s.affiliateId} statement={s} canManage={canManage} />
        ))
      )}

      <DeferredNote>
        <strong>PDF statement export is deferred.</strong> Today the line-itemized view here is
        the source of truth — we surface the same numbers a PDF would carry. The PDF renderer
        ships with the broader invoice-PDF flow (same dependency the platform invoice page is
        waiting on).
      </DeferredNote>
    </div>
  );
}

function PartnerStatementCard({
  statement, canManage,
}: {
  statement: PartnerStatement;
  canManage: boolean;
}) {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
              {statement.affiliateName}
            </h3>
            <div className="font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>
              {statement.affiliateCode} · {statement.status}
            </div>
          </div>
          <div className="flex flex-wrap items-baseline gap-3 text-[12px]">
            <span style={{ color: "var(--text-muted)" }}>
              Earned <strong style={{ color: "var(--text-default)" }}>{fmtMoneyDecimal(statement.totalEarnedMinor)}</strong>
            </span>
            <span style={{ color: "var(--text-muted)" }}>
              Paid <strong style={{ color: "var(--success-fg)" }}>{fmtMoneyDecimal(statement.paidOutMinor)}</strong>
            </span>
            <span style={{ color: "var(--text-muted)" }}>
              Pending <strong style={{ color: "var(--accent-primary)" }}>{fmtMoneyDecimal(statement.pendingPayoutMinor)}</strong>
            </span>
          </div>
        </div>
      </div>

      {statement.lines.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
          No commission lines yet for this partner.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
              <tr className="text-left">
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Period</th>
                <th className="px-4 py-2 font-medium">Description</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
                <th className="px-4 py-2 font-medium">Paid in</th>
              </tr>
            </thead>
            <tbody>
              {statement.lines.map((l) => {
                const isNegative = l.kind === "HOLD" || l.kind === "DEDUCTION";
                return (
                  <tr key={l.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td className="px-4 py-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                      {l.earnedAt.toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2 font-mono text-[12px]" style={{ color: "var(--text-default)" }}>
                      {l.period}
                    </td>
                    <td className="px-4 py-2" style={{ color: "var(--text-default)" }}>{l.description}</td>
                    <td className="px-4 py-2 text-[12px]"
                        style={{ color: isNegative ? "var(--rose-700)" : "var(--success-fg)" }}>
                      {KIND_LABEL[l.kind] ?? l.kind}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums"
                        style={{ color: isNegative ? "var(--rose-700)" : "var(--text-default)" }}>
                      {isNegative ? "−" : ""}{fmtMoneyDecimal(l.amount)}
                    </td>
                    <td className="px-4 py-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                      {l.paidIn ? `Payout ${l.paidIn.payoutId.slice(0, 8)}… · ${l.paidIn.status}` : "Not yet"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canManage && (
        <details className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
          <summary className="cursor-pointer px-4 py-3 text-[12px] font-medium"
                   style={{ color: "var(--accent-primary)" }}>
            + Add adjustment line
          </summary>
          <form action={addPartnerCommissionLine} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
            <input type="hidden" name="affiliateId" value={statement.affiliateId} />
            <label className="block">
              <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Type *
              </span>
              <select name="kind" required defaultValue="COMMISSION"
                      className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
                      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
                <option value="COMMISSION">Commission</option>
                <option value="HOLD">Hold</option>
                <option value="DEDUCTION">Deduction</option>
                <option value="BONUS">Bonus</option>
              </select>
            </label>
            <Field label="Period *" name="period" required maxLength={20} placeholder="2026-04" />
            <Field label="Amount (cents) *" name="amount" type="number" required placeholder="1000" />
            <Field label="Description *" name="description" required maxLength={500} wide />
            <Field label="Notes" name="notes" maxLength={500} wide />
            <div className="md:col-span-3 flex items-end justify-end">
              <button type="submit"
                      className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium"
                      style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
                Add line
              </button>
            </div>
          </form>
        </details>
      )}
    </section>
  );
}

function Field({
  label, name, type = "text", required, placeholder, maxLength, wide,
}: {
  label: string; name: string; type?: string; required?: boolean;
  placeholder?: string; maxLength?: number; wide?: boolean;
}) {
  return (
    <label className={"block " + (wide ? "md:col-span-3" : "")}>
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <input type={type} name={name} required={required} placeholder={placeholder} maxLength={maxLength}
             className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
    </label>
  );
}
