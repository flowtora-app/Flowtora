import { updatePartnerPayoutStatus } from "@/app/actions/platform-payouts";
import type { HistoryRow } from "@/server/platform/payouts";
import type { PartnerPayoutMethodType, PartnerPayoutStatus } from "@prisma/client";
import { fmtMoneyDecimal } from "./shared";

const STATUS_PALETTE: Record<PartnerPayoutStatus, { bg: string; fg: string; label: string }> = {
  PENDING:    { bg: "var(--surface-2)",      fg: "var(--text-muted)",     label: "Pending" },
  IN_TRANSIT: { bg: "var(--accent-surface)", fg: "var(--accent-primary)", label: "In transit" },
  PAID:       { bg: "var(--success-surface)",fg: "var(--success-fg)",     label: "Paid" },
  FAILED:     { bg: "var(--danger-surface)", fg: "var(--danger-fg)",      label: "Failed" },
  CANCELED:   { bg: "var(--surface-2)",      fg: "var(--text-faint)",     label: "Canceled" },
};

const METHOD_LABEL: Record<PartnerPayoutMethodType, string> = {
  STRIPE_CONNECT: "Stripe Connect",
  ACH:            "ACH",
  PAYPAL:         "PayPal",
  WISE:           "Wise",
  WIRE:           "Wire transfer",
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "",            label: "All" },
  { value: "PENDING",     label: "Pending" },
  { value: "IN_TRANSIT",  label: "In transit" },
  { value: "PAID",        label: "Paid" },
  { value: "FAILED",      label: "Failed" },
  { value: "CANCELED",    label: "Canceled" },
];

export function HistoryTab({
  rows, statusFilter, canManage,
}: {
  rows: HistoryRow[];
  statusFilter: PartnerPayoutStatus | undefined;
  canManage: boolean;
}) {
  return (
    <div className="space-y-4">
      <FilterRow current={statusFilter} />

      <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
            Payouts ({rows.length})
          </h2>
        </div>
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
            No payouts on file with this filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">Partner</th>
                  <th className="px-4 py-2 font-medium">Period</th>
                  <th className="px-4 py-2 text-right font-medium">Amount</th>
                  <th className="px-4 py-2 font-medium">Method</th>
                  <th className="px-4 py-2 font-medium">Scheduled</th>
                  <th className="px-4 py-2 font-medium">Settled</th>
                  <th className="px-4 py-2 font-medium">Reference</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  {canManage && <th className="px-4 py-2 font-medium" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const palette = STATUS_PALETTE[r.status];
                  return (
                    <tr key={r.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                      <td className="px-4 py-2" style={{ color: "var(--text-default)" }}>{r.affiliateName}</td>
                      <td className="px-4 py-2 font-mono text-[12px]" style={{ color: "var(--text-default)" }}>
                        {r.period}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                        {fmtMoneyDecimal(r.amount)} {r.currency}
                      </td>
                      <td className="px-4 py-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                        {r.methodType ? METHOD_LABEL[r.methodType] : "—"}
                        {r.methodLabel && (
                          <div style={{ color: "var(--text-faint)" }}>{r.methodLabel}</div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                        {r.scheduledAt.toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                        {r.settledAt ? r.settledAt.toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-2 font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {r.externalRef ?? "—"}
                      </td>
                      <td className="px-4 py-2">
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                              style={{ background: palette.bg, color: palette.fg, border: `1px solid ${palette.fg}` }}
                              title={r.failureReason ?? undefined}>
                          {palette.label}
                        </span>
                      </td>
                      {canManage && (
                        <td className="px-4 py-2 text-right">
                          <UpdateStatusForm payoutId={r.id} currentStatus={r.status} />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function FilterRow({ current }: { current: PartnerPayoutStatus | undefined }) {
  return (
    <form className="flex flex-wrap items-end gap-2 rounded-lg border p-3"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <input type="hidden" name="tab" value="history" />
      <label className="block">
        <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Status
        </span>
        <select name="status" defaultValue={current ?? ""}
                className="ts-focus mt-1 rounded-md border px-3 py-2 text-[13px]"
                style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <button type="submit"
              className="ts-focus rounded-md border px-3 py-2 text-[13px] font-medium"
              style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)", background: "var(--surface-1)" }}>
        Filter
      </button>
    </form>
  );
}

function UpdateStatusForm({
  payoutId, currentStatus,
}: {
  payoutId: string;
  currentStatus: PartnerPayoutStatus;
}) {
  // Hide the action when payout is already terminal.
  if (currentStatus === "PAID" || currentStatus === "CANCELED") {
    return null;
  }
  return (
    <details className="text-right">
      <summary className="cursor-pointer text-[11px] font-medium"
               style={{ color: "var(--accent-primary)" }}>
        Update
      </summary>
      <form action={updatePartnerPayoutStatus} className="mt-2 flex flex-col gap-1">
        <input type="hidden" name="payoutId" value={payoutId} />
        <select name="status" defaultValue={currentStatus}
                className="ts-focus rounded-md border px-2 py-1 text-[11px]"
                style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
          <option value="PENDING">Pending</option>
          <option value="IN_TRANSIT">In transit</option>
          <option value="PAID">Paid</option>
          <option value="FAILED">Failed</option>
          <option value="CANCELED">Canceled</option>
        </select>
        <input type="text" name="externalRef" placeholder="Rail reference"
               className="ts-focus rounded-md border px-2 py-1 text-[11px]"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
        <input type="text" name="failureReason" placeholder="Failure reason (if failed)"
               className="ts-focus rounded-md border px-2 py-1 text-[11px]"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
        <button type="submit"
                className="ts-focus rounded-md border px-2 py-1 text-[11px] font-medium"
                style={{ borderColor: "var(--accent-primary)", color: "var(--accent-primary)", background: "var(--surface-1)" }}>
          Save
        </button>
      </form>
    </details>
  );
}
