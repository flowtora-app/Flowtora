"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, useToast } from "@/components/ui";
import { cancelPendingRefund } from "@/app/actions/platform-refunds";
import type { RefundRow } from "@/server/platform/refunds-disputes";
import type { PlatformRefundReason, PlatformRefundStatus } from "@prisma/client";

const STATUS_PILL: Record<PlatformRefundStatus, { bg: string; fg: string }> = {
  PENDING:   { bg: "var(--amber-50)",    fg: "var(--amber-700)" },
  SUCCEEDED: { bg: "var(--emerald-50)",  fg: "var(--emerald-700)" },
  FAILED:    { bg: "var(--rose-50)",     fg: "var(--rose-700)" },
};

const REASON_LABEL: Record<PlatformRefundReason, string> = {
  CUSTOMER_REQUEST: "Customer request",
  FRAUD: "Fraud",
  DUPLICATE: "Duplicate",
  SUBSCRIPTION_MISTAKE: "Sub. mistake",
  SERVICE_ISSUE: "Service issue",
  OTHER: "Other",
};

const ROUTE = "/platform/billing/refunds";

export function RefundsTable({
  rows, total, filteredTotal, page, pageSize, canManage,
}: {
  rows: RefundRow[];
  total: number;
  filteredTotal: number;
  page: number;
  pageSize: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const goToPage = (n: number) => {
    const u = new URLSearchParams(sp.toString());
    u.set("tab", "refunds");
    u.set("page", String(n));
    router.replace(`${ROUTE}?${u.toString()}`);
  };
  const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));

  const onCancel = async (id: string) => {
    if (!window.confirm("Cancel this pending refund? It will be marked failed.")) return;
    setBusyId(id);
    try {
      const fd = new FormData();
      fd.set("refundId", id);
      const res = await cancelPendingRefund(fd);
      if (res.ok) { toast.success("Refund cancelled"); router.refresh(); }
      else toast.error(res.error ?? "Couldn't cancel");
    } finally { setBusyId(null); }
  };

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border" style={{ borderColor: "var(--border-subtle)" }}>
        <table className="w-full text-[12px]">
          <thead style={{ background: "var(--surface-2)" }}>
            <tr>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Created</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Tenant</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Invoice</th>
              <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Amount</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Reason</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Type</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Status</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Initiator</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Payment</th>
              <th className="w-24 px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pill = STATUS_PILL[r.status];
              return (
                <tr key={r.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {r.initiatedAt.toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/platform/tenants/${r.tenant.id}`}
                          className="hover:underline"
                          style={{ color: "var(--text-default)" }}>
                      {r.tenant.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/platform/billing/invoices/${r.invoiceId}`}
                          className="font-mono hover:underline"
                          style={{ color: "var(--accent-primary)" }}>
                      {r.invoiceNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                    {(r.amount / 100).toLocaleString(undefined, { style: "currency", currency: r.currency })}
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--text-default)" }}
                      title={r.reasonNote ?? undefined}>
                    {REASON_LABEL[r.reason]}
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                    {r.asCredit ? "Credit" : "Gateway"}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ background: pill.bg, color: pill.fg }}
                          title={r.failureReason ?? undefined}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                    {r.initiatedByName ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {r.paymentId.slice(0, 10)}…
                  </td>
                  <td className="px-2 py-2 text-right">
                    {canManage && r.status === "PENDING" && (
                      <Button size="sm" variant="ghost"
                              disabled={busyId === r.id}
                              onClick={() => onCancel(r.id)}>
                        Cancel
                      </Button>
                    )}
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
            ? `${total.toLocaleString()} refund${total === 1 ? "" : "s"}`
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
