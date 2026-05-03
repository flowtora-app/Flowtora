"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { JobQueueRow } from "@/server/platform/operations";
import { StatusPill } from "./shared";

const ROUTE = "/platform/operations/jobs";

export function JobQueueTable({
  rows, total, filteredTotal, page, pageSize,
}: {
  rows: JobQueueRow[];
  total: number;
  filteredTotal: number;
  page: number;
  pageSize: number;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const goToPage = (n: number) => {
    const u = new URLSearchParams(sp.toString());
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
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Job ref</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Tenant</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Plan</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Region</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Status</th>
              <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Days in status</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Created</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Due</th>
              <th className="w-24 px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <td className="px-3 py-2">
                  <span className="font-mono text-[11px] font-semibold" style={{ color: "var(--text-default)" }}>
                    {r.redactedRef}
                  </span>
                  {r.priority !== "NORMAL" && (
                    <span className="ml-2 rounded-full px-1.5 text-[9px] font-semibold uppercase tracking-wide"
                          style={{
                            background: r.priority === "RUSH" ? "var(--rose-50)" : "var(--amber-50)",
                            color: r.priority === "RUSH" ? "var(--rose-700)" : "var(--amber-700)",
                          }}>
                      {r.priority}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Link href={`/platform/tenants/${r.tenantId}`}
                        className="hover:underline" style={{ color: "var(--text-default)" }}>
                    {r.tenantName}
                  </Link>
                </td>
                <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                  {r.planSlug ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
                </td>
                <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                  {r.region ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
                </td>
                <td className="px-3 py-2"><StatusPill status={r.status} /></td>
                <td className="px-3 py-2 text-right tabular-nums"
                    style={{ color: r.daysInStatus > 7 ? "var(--rose-700)" : "var(--text-default)" }}>
                  {r.daysInStatus.toFixed(1)}d
                </td>
                <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {r.createdAt.toLocaleDateString()}
                </td>
                <td className="px-3 py-2 tabular-nums"
                    style={{ color: r.isLate ? "var(--rose-700)" : "var(--text-muted)" }}
                    title={r.isLate ? "Past due — not closed" : undefined}>
                  {r.dueDate ? r.dueDate.toLocaleDateString() : "—"}
                  {r.isLate && (
                    <span className="ml-1 text-[9px] font-semibold uppercase">LATE</span>
                  )}
                </td>
                <td className="px-2 py-2 text-right">
                  <Link href={`/platform/tenants/impersonation?tenantId=${r.tenantId}`}
                        className="text-[10px] hover:underline"
                        style={{ color: "var(--accent-primary)" }}
                        title="Open impersonation flow for this tenant">
                    Open ↗
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
        <span>
          {filteredTotal === total
            ? `${total.toLocaleString()} order${total === 1 ? "" : "s"}`
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
