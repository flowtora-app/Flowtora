import Link from "next/link";
import {
  pauseDunningEvent,
  retryDunningPayment,
  sendDunningCustomEmail,
  skipDunningStage,
  surrenderDunningEvent,
} from "@/app/actions/platform-dunning";
import type { DunningQueueRow } from "@/server/platform/dunning";
import { fmtMoney } from "./shared";

const STATUS_PALETTE: Record<DunningQueueRow["status"], { bg: string; fg: string; label: string }> = {
  IN_PROGRESS: { bg: "var(--accent-surface)", fg: "var(--accent-primary)", label: "In progress" },
  PAUSED:      { bg: "var(--warning-surface)",fg: "var(--warning-fg)",     label: "Paused" },
  RECOVERED:   { bg: "var(--success-surface)",fg: "var(--success-fg)",     label: "Recovered" },
  SURRENDERED: { bg: "var(--surface-2)",      fg: "var(--text-faint)",     label: "Surrendered" },
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "",            label: "All open" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "PAUSED",      label: "Paused" },
  { value: "RECOVERED",   label: "Recovered" },
  { value: "SURRENDERED", label: "Surrendered" },
];

export function QueueTab({
  rows, statusFilter, canManage,
}: {
  rows: DunningQueueRow[];
  statusFilter: DunningQueueRow["status"] | undefined;
  canManage: boolean;
}) {
  return (
    <div className="space-y-4">
      <FilterRow current={statusFilter} />

      <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
            Queue ({rows.length})
          </h2>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            One row per failed payment in a sequence. Click a tenant to drill in.
          </p>
        </div>
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
            No queue entries match this filter. Failed payments enter the queue once a sequence
            picks them up — see Sequences for setup, or wait for the next failed Stripe charge.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">Tenant</th>
                  <th className="px-4 py-2 font-medium">Invoice</th>
                  <th className="px-4 py-2 text-right font-medium">Amount failed</th>
                  <th className="px-4 py-2 font-medium">Failure code</th>
                  <th className="px-4 py-2 font-medium">Last retry</th>
                  <th className="px-4 py-2 font-medium">Next retry</th>
                  <th className="px-4 py-2 font-medium">Stage</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  {canManage && <th className="px-4 py-2 font-medium" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const palette = STATUS_PALETTE[r.status];
                  return (
                    <tr key={r.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                      <td className="px-4 py-2">
                        <Link href={`/platform/tenants/${r.tenantId}`}
                              className="hover:underline" style={{ color: "var(--text-default)" }}>
                          {r.tenantName}
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        <Link href={`/platform/billing/invoices/${r.invoiceId}`}
                              className="font-mono hover:underline"
                              style={{ color: "var(--accent-primary)" }}>
                          {r.invoiceNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                        {(r.amountFailed / 100).toLocaleString(undefined, { style: "currency", currency: r.currency })}
                      </td>
                      <td className="px-4 py-2 font-mono text-[11px]" style={{ color: "var(--rose-700)" }}
                          title={r.failureReason ?? undefined}>
                        {r.failureCode ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
                      </td>
                      <td className="px-4 py-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                        {r.lastRetryAt ? r.lastRetryAt.toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                        {r.nextActionAt ? r.nextActionAt.toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-2 text-[12px]">
                        <div style={{ color: "var(--text-default)" }}>{r.stageLabel}</div>
                        <div style={{ color: "var(--text-muted)" }}>{r.sequenceName}</div>
                      </td>
                      <td className="px-4 py-2">
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                              style={{ background: palette.bg, color: palette.fg, border: `1px solid ${palette.fg}` }}>
                          {palette.label}
                        </span>
                      </td>
                      {canManage && r.status !== "RECOVERED" && r.status !== "SURRENDERED" && (
                        <td className="px-4 py-2">
                          <ActionRow eventId={r.id} paused={r.status === "PAUSED"} />
                        </td>
                      )}
                      {canManage && (r.status === "RECOVERED" || r.status === "SURRENDERED") && (
                        <td className="px-4 py-2 text-right text-[11px]" style={{ color: "var(--text-faint)" }}>
                          {r.lastOutcome ?? "—"}
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

      {canManage && rows.some((r) => r.status === "IN_PROGRESS" || r.status === "PAUSED") && (
        <CustomEmailPanel rows={rows.filter((r) => r.status !== "RECOVERED" && r.status !== "SURRENDERED")} />
      )}
    </div>
  );
}

function FilterRow({ current }: { current: DunningQueueRow["status"] | undefined }) {
  return (
    <form className="flex flex-wrap items-end gap-2 rounded-lg border p-3"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <input type="hidden" name="tab" value="queue" />
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

function ActionRow({ eventId, paused }: { eventId: string; paused: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <form action={retryDunningPayment.bind(null, eventId)}>
        <button type="submit"
                className="ts-focus rounded-md border px-2 py-1 text-[11px] font-medium"
                style={{ borderColor: "var(--accent-primary)", color: "var(--accent-primary)", background: "var(--surface-1)" }}>
          Retry now
        </button>
      </form>
      <form action={skipDunningStage.bind(null, eventId)}>
        <button type="submit"
                className="ts-focus rounded-md border px-2 py-1 text-[11px] font-medium"
                style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)", background: "var(--surface-1)" }}>
          Skip
        </button>
      </form>
      <form action={pauseDunningEvent.bind(null, eventId)}>
        <button type="submit"
                className="ts-focus rounded-md border px-2 py-1 text-[11px] font-medium"
                style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)", background: "var(--surface-1)" }}>
          {paused ? "Resume" : "Pause"}
        </button>
      </form>
      <form action={surrenderDunningEvent.bind(null, eventId)}>
        <button type="submit"
                className="ts-focus rounded-md border px-2 py-1 text-[11px] font-medium"
                style={{ borderColor: "var(--border-subtle)", color: "var(--danger-fg)", background: "var(--surface-1)" }}>
          Surrender
        </button>
      </form>
    </div>
  );
}

function CustomEmailPanel({ rows }: { rows: DunningQueueRow[] }) {
  return (
    <details className="rounded-lg border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <summary className="cursor-pointer border-b px-4 py-3 text-[13px] font-medium"
               style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
        Send custom email to a queue entry
      </summary>
      <form action={sendDunningCustomEmail} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
        <label className="block md:col-span-3">
          <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Queue entry *
          </span>
          <select name="eventId" required
                  className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
            <option value="">— Pick entry —</option>
            {rows.map((r) => (
              <option key={r.id} value={r.id}>
                {r.tenantName} · {r.invoiceNumber} · {fmtMoney(r.amountFailed)}
              </option>
            ))}
          </select>
        </label>
        <label className="block md:col-span-3">
          <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Subject *
          </span>
          <input type="text" name="subject" required maxLength={200}
                 className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
        </label>
        <label className="block md:col-span-3">
          <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Body *
          </span>
          <textarea name="body" required rows={4} maxLength={5000}
                    className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
                    style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
        </label>
        <div className="md:col-span-3 flex items-end justify-end">
          <button type="submit"
                  className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
            Send
          </button>
        </div>
      </form>
    </details>
  );
}
