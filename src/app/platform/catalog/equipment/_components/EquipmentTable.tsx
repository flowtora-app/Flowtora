"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { EquipmentListRow } from "@/server/platform/equipment";
import { CATEGORY_LABEL, StatusPill } from "./shared";

const ROUTE = "/platform/catalog/equipment";

export function EquipmentTable({
  rows, total, filteredTotal, page, pageSize,
}: {
  rows: EquipmentListRow[];
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
              <th className="w-12 px-2 py-2"></th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Brand</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Model</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Category</th>
              <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Rated speed</th>
              <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Materials</th>
              <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Maint. tasks</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Status</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Updated</th>
              <th className="w-20 px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <td className="px-2 py-2">
                  <div className="h-10 w-10 overflow-hidden rounded"
                       style={{ background: "var(--surface-2)" }}>
                    {r.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.imageUrl} alt={`${r.brand} ${r.model}`} className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2 font-medium" style={{ color: "var(--text-default)" }}>
                  {r.brand}
                </td>
                <td className="px-3 py-2">
                  <Link href={`${ROUTE}/${r.id}`}
                        className="font-medium hover:underline"
                        style={{ color: "var(--text-default)" }}>
                    {r.displayName ?? r.model}
                  </Link>
                  <div className="font-mono text-[10px]" style={{ color: "var(--text-faint)" }}>{r.slug}</div>
                </td>
                <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                  {CATEGORY_LABEL[r.category]}
                </td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                  {r.ratedSpeed != null
                    ? <>
                        {r.ratedSpeed}
                        {r.speedUnit && (
                          <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                            {r.speedUnit}
                          </div>
                        )}
                      </>
                    : <span style={{ color: "var(--text-faint)" }}>—</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                  {r.materialCount}
                </td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {r.taskCount}
                </td>
                <td className="px-3 py-2"><StatusPill status={r.status} /></td>
                <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {r.updatedAt.toLocaleDateString()}
                </td>
                <td className="px-2 py-2 text-right">
                  <Link href={`${ROUTE}/${r.id}`}
                        className="text-[10px] hover:underline"
                        style={{ color: "var(--accent-primary)" }}>
                    Edit →
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
            ? `${total.toLocaleString()} template${total === 1 ? "" : "s"}`
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
