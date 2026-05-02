"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, useToast } from "@/components/ui";
import {
  bulkRetryPayments,
} from "@/app/actions/platform-payments";
import type { PaymentRow } from "@/server/platform/payments";

const STATUS_PILL: Record<string, { bg: string; fg: string }> = {
  succeeded:      { bg: "var(--emerald-50)",  fg: "var(--emerald-700)" },
  failed:         { bg: "var(--rose-50)",     fg: "var(--rose-700)" },
  pending:        { bg: "var(--amber-50)",    fg: "var(--amber-700)" },
  refunded:       { bg: "var(--accent-surface)", fg: "var(--accent-primary)" },
  partial_refund: { bg: "var(--accent-surface)", fg: "var(--accent-primary)" },
  disputed:       { bg: "var(--rose-50)",     fg: "var(--rose-700)" },
};

export function PaymentsTable({
  rows, total, filteredTotal, page, pageSize,
  canRetry,
}: {
  rows: PaymentRow[];
  total: number;
  filteredTotal: number;
  page: number;
  pageSize: number;
  canRetry: boolean;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [pending, setPending] = React.useState(false);
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = selected.size > 0 && !allSelected;

  const goToPage = (n: number) => {
    const u = new URLSearchParams(sp.toString());
    u.set("page", String(n));
    router.replace(`/platform/billing/payments?${u.toString()}`);
  };
  const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));

  const openDetail = (id: string) => {
    const u = new URLSearchParams(sp.toString());
    u.set("detail", id);
    router.replace(`/platform/billing/payments?${u.toString()}`);
  };

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const onBulkRetry = async () => {
    const failedIds = rows.filter((r) => r.status === "failed" && selected.has(r.id)).map((r) => r.id);
    if (failedIds.length === 0) {
      toast.error("Selection has no failed payments to retry");
      return;
    }
    if (!window.confirm(`Retry ${failedIds.length} failed payment${failedIds.length === 1 ? "" : "s"}?`)) return;
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("paymentIds", failedIds.join(","));
      const res = await bulkRetryPayments(fd);
      if (res.ok) {
        toast.success(`Queued ${res.count} retr${res.count === 1 ? "y" : "ies"}`);
        setSelected(new Set());
        router.refresh();
      } else toast.error(res.error ?? "Couldn't retry");
    } finally { setPending(false); }
  };

  if (rows.length === 0) {
    return (
      <Card padding="lg">
        <div className="text-center">
          <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>No payments yet</h3>
          <p className="mx-auto mt-1 max-w-md text-[12px]" style={{ color: "var(--text-muted)" }}>
            Either no rows match the filter, or the Stripe webhook handler hasn&apos;t shipped yet — see the
            note below.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {canRetry && selected.size > 0 && (
        <Card padding="sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px]" style={{ color: "var(--text-default)" }}>
              {selected.size} selected
            </span>
            <Button size="sm" variant="secondary" onClick={onBulkRetry} disabled={pending}>
              Retry failed
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        </Card>
      )}

      <div className="overflow-x-auto rounded-md border" style={{ borderColor: "var(--border-subtle)" }}>
        <table className="w-full text-[12px]">
          <thead style={{ background: "var(--surface-2)" }}>
            <tr>
              {canRetry && (
                <th className="w-8 px-2 py-2">
                  <input type="checkbox" checked={allSelected}
                         ref={(el) => { if (el) el.indeterminate = someSelected; }}
                         onChange={toggleAll}
                         aria-label="Select all" />
                </th>
              )}
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Created</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Tenant</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Method</th>
              <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Amount</th>
              <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Fee</th>
              <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Net</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Status</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Gateway ID</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Invoice</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Failure</th>
              <th className="w-12 px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pill = STATUS_PILL[r.status] ?? STATUS_PILL.pending;
              return (
                <tr key={r.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  {canRetry && (
                    <td className="px-2 py-2">
                      <input type="checkbox" checked={selected.has(r.id)}
                             onChange={() => toggleOne(r.id)}
                             aria-label={`Select payment ${r.id}`} />
                    </td>
                  )}
                  <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {r.attemptedAt.toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/platform/tenants/${r.tenant.id}`}
                          className="hover:underline"
                          style={{ color: "var(--text-default)" }}>
                      {r.tenant.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                    {r.method ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                    {(r.amount / 100).toLocaleString(undefined, { style: "currency", currency: r.currency })}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {r.fee === 0 ? "—" : (r.fee / 100).toLocaleString(undefined, { style: "currency", currency: r.currency })}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                    {r.net === 0 ? "—" : (r.net / 100).toLocaleString(undefined, { style: "currency", currency: r.currency })}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ background: pill!.bg, color: pill!.fg }}>
                      {r.status.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {r.gatewayPaymentId ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/platform/billing/invoices/${r.invoiceId}`}
                          className="font-mono hover:underline"
                          style={{ color: "var(--accent-primary)" }}>
                      {r.invoiceNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2 max-w-[200px] truncate" style={{ color: "var(--rose-700)" }}
                      title={r.failureReason ?? undefined}>
                    {r.failureCode
                      ? <span className="font-mono">{r.failureCode}</span>
                      : <span style={{ color: "var(--text-faint)" }}>—</span>}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button type="button"
                            onClick={() => openDetail(r.id)}
                            className="text-[10px] hover:underline"
                            style={{ color: "var(--accent-primary)" }}>
                      Inspect
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
        <span>
          {filteredTotal === total
            ? `${total.toLocaleString()} payment${total === 1 ? "" : "s"}`
            : `${filteredTotal.toLocaleString()} of ${total.toLocaleString()}`}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button type="button" disabled={page <= 1}
                    onClick={() => goToPage(page - 1)}
                    className="ts-focus inline-flex h-7 items-center rounded-md border px-2 text-[12px] font-medium hover:bg-[var(--surface-2)] disabled:opacity-50"
                    style={{ borderColor: "var(--border-default)", color: "var(--text-default)" }}>
              ← Prev
            </button>
            <span className="px-2">{page} / {totalPages}</span>
            <button type="button" disabled={page >= totalPages}
                    onClick={() => goToPage(page + 1)}
                    className="ts-focus inline-flex h-7 items-center rounded-md border px-2 text-[12px] font-medium hover:bg-[var(--surface-2)] disabled:opacity-50"
                    style={{ borderColor: "var(--border-default)", color: "var(--text-default)" }}>
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
