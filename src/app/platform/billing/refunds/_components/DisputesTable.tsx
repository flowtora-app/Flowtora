"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { DisputeRow } from "@/server/platform/refunds-disputes";
import type { PlatformDisputeStatus } from "@prisma/client";

const STATUS_PILL: Record<PlatformDisputeStatus, { bg: string; fg: string; label: string }> = {
  NEEDS_RESPONSE: { bg: "var(--rose-50)",     fg: "var(--rose-700)",    label: "Needs response" },
  UNDER_REVIEW:   { bg: "var(--amber-50)",    fg: "var(--amber-700)",   label: "Under review" },
  WON:            { bg: "var(--emerald-50)",  fg: "var(--emerald-700)", label: "Won" },
  LOST:           { bg: "var(--rose-50)",     fg: "var(--rose-700)",    label: "Lost" },
};

const ROUTE = "/platform/billing/refunds";
const DAY = 86_400_000;

function daysUntil(date: Date | null): { label: string; tone: "danger" | "warning" | "default" } {
  if (!date) return { label: "—", tone: "default" };
  const diff = date.getTime() - Date.now();
  if (diff < 0) return { label: "Overdue", tone: "danger" };
  const days = Math.ceil(diff / DAY);
  return { label: `${days}d left`, tone: days <= 3 ? "danger" : days <= 7 ? "warning" : "default" };
}

export function DisputesTable({
  rows, total, filteredTotal, page, pageSize,
}: {
  rows: DisputeRow[];
  total: number;
  filteredTotal: number;
  page: number;
  pageSize: number;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const goToPage = (n: number) => {
    const u = new URLSearchParams(sp.toString());
    u.set("tab", "disputes");
    u.set("page", String(n));
    router.replace(`${ROUTE}?${u.toString()}`);
  };
  const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));

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
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Status</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Evidence due</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Days left</th>
              <th className="w-16 px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pill = STATUS_PILL[r.status];
              const due = daysUntil(r.evidenceDueAt);
              const dueColor =
                due.tone === "danger" ? "var(--rose-700)" :
                due.tone === "warning" ? "var(--amber-700)" :
                                          "var(--text-muted)";
              return (
                <tr key={r.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {r.createdAt.toLocaleDateString()}
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
                      title={r.reasonCode ?? undefined}>
                    {r.reason}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ background: pill.bg, color: pill.fg }}>
                      {pill.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {r.evidenceDueAt
                      ? r.evidenceDueAt.toLocaleDateString()
                      : <span style={{ color: "var(--text-faint)" }}>—</span>}
                  </td>
                  <td className="px-3 py-2 tabular-nums" style={{ color: dueColor }}>
                    {due.label}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <Link href={`/platform/billing/refunds/disputes/${r.id}`}
                          className="text-[10px] hover:underline"
                          style={{ color: "var(--accent-primary)" }}>
                      Open
                    </Link>
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
            ? `${total.toLocaleString()} dispute${total === 1 ? "" : "s"}`
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
