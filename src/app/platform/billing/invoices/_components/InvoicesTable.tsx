"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, useToast } from "@/components/ui";
import {
  bulkMarkInvoicesPaid,
  bulkSendInvoices,
  bulkVoidInvoices,
} from "@/app/actions/platform-invoices";
import type { InvoiceRow } from "@/server/platform/invoices";
import type { PlatformInvoiceStatus } from "@prisma/client";
import { InvoiceRowMenu } from "./InvoiceRowMenu";

const STATUS_PILL: Record<PlatformInvoiceStatus, { bg: string; fg: string; label: string }> = {
  DRAFT:         { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Draft" },
  SENT:          { bg: "var(--amber-50)",    fg: "var(--amber-700)",   label: "Sent" },
  OPEN:          { bg: "var(--amber-50)",    fg: "var(--amber-700)",   label: "Open" },
  PAID:          { bg: "var(--emerald-50)",  fg: "var(--emerald-700)", label: "Paid" },
  VOIDED:        { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Voided" },
  UNCOLLECTIBLE: { bg: "var(--rose-50)",     fg: "var(--rose-700)",    label: "Uncollectible" },
  REFUNDED:      { bg: "var(--accent-surface)", fg: "var(--accent-primary)", label: "Refunded" },
};

export function InvoicesTable({
  rows, total, filteredTotal, page, pageSize,
  canEdit, canRefund,
}: {
  rows: InvoiceRow[];
  total: number;
  filteredTotal: number;
  page: number;
  pageSize: number;
  canEdit: boolean;
  canRefund: boolean;
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
    router.replace(`/platform/billing/invoices?${u.toString()}`);
  };
  const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));

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

  const runBulk = async (
    action: (fd: FormData) => Promise<{ ok: boolean; count?: number; error?: string }>,
    msg: string,
  ) => {
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("invoiceIds", Array.from(selected).join(","));
      const res = await action(fd);
      if (res.ok) {
        toast.success(`${msg}: ${res.count ?? 0}`);
        setSelected(new Set());
        router.refresh();
      } else toast.error(res.error ?? "Couldn't run action");
    } finally { setPending(false); }
  };

  const exportSelected = () => {
    const u = new URLSearchParams(sp.toString());
    u.set("ids", Array.from(selected).join(","));
    window.location.href = `/api/platform/billing/invoices/export?${u.toString()}`;
  };

  if (rows.length === 0) {
    return (
      <Card padding="lg">
        <div className="text-center">
          <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>No invoices match</h3>
          <p className="mx-auto mt-1 max-w-md text-[12px]" style={{ color: "var(--text-muted)" }}>
            Adjust the filter bar.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {canEdit && selected.size > 0 && (
        <Card padding="sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px]" style={{ color: "var(--text-default)" }}>
              {selected.size} invoice{selected.size === 1 ? "" : "s"} selected
            </span>
            <Button size="sm" variant="secondary" onClick={() => runBulk(bulkSendInvoices, "Sent")} disabled={pending}>
              Send
            </Button>
            <Button size="sm" variant="secondary" onClick={() => runBulk(bulkMarkInvoicesPaid, "Marked paid")} disabled={pending}>
              Mark paid
            </Button>
            <Button size="sm" variant="secondary" onClick={() => runBulk(bulkVoidInvoices, "Voided")} disabled={pending}>
              Void
            </Button>
            <Button size="sm" variant="ghost" onClick={exportSelected} disabled={pending}>
              Export selected
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        </Card>
      )}

      <div className="overflow-x-auto rounded-md border" style={{ borderColor: "var(--border-subtle)" }}>
        <table className="w-full text-[12px]">
          <thead style={{ background: "var(--surface-2)" }}>
            <tr>
              {canEdit && (
                <th className="w-8 px-2 py-2">
                  <input type="checkbox" checked={allSelected}
                         ref={(el) => { if (el) el.indeterminate = someSelected; }}
                         onChange={toggleAll}
                         aria-label="Select all" />
                </th>
              )}
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Invoice #</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Tenant</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Status</th>
              <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Amount</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Issued</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Due</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Paid</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Source</th>
              <th className="w-12 px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                {canEdit && (
                  <td className="px-2 py-2">
                    <input type="checkbox" checked={selected.has(r.id)}
                           onChange={() => toggleOne(r.id)}
                           aria-label={`Select ${r.number}`} />
                  </td>
                )}
                <td className="px-3 py-2">
                  <Link href={`/platform/billing/invoices/${r.id}`}
                        className="font-mono font-semibold hover:underline"
                        style={{ color: "var(--text-default)" }}>
                    {r.number}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <Link href={`/platform/tenants/${r.tenant.id}`}
                        className="hover:underline"
                        style={{ color: "var(--text-default)" }}>
                    {r.tenant.name}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
                        style={{ background: STATUS_PILL[r.status].bg, color: STATUS_PILL[r.status].fg }}>
                    {STATUS_PILL[r.status].label}
                  </span>
                  {r.isOverdue && (
                    <span className="ml-1 inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ background: "var(--rose-50)", color: "var(--rose-700)" }}>
                      Overdue
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                  {(r.total / 100).toLocaleString(undefined, { style: "currency", currency: r.currency })}
                </td>
                <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {r.issuedAt ? r.issuedAt.toLocaleDateString() : "—"}
                </td>
                <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {r.dueAt ? r.dueAt.toLocaleDateString() : "—"}
                </td>
                <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {r.paidAt ? r.paidAt.toLocaleDateString() : "—"}
                </td>
                <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                  {r.source.toLowerCase()}
                </td>
                <td className="px-2 py-2 text-right">
                  <InvoiceRowMenu row={r} canEdit={canEdit} canRefund={canRefund} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
        <span>
          {filteredTotal === total
            ? `${total.toLocaleString()} invoice${total === 1 ? "" : "s"}`
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
