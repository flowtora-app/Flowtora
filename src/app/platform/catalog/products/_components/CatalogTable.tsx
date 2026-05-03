"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { CatalogListRow } from "@/server/platform/catalog";
import { CATEGORY_LABEL, fmtMoney, StatusPill } from "./shared";

const ROUTE = "/platform/catalog/products";

export function CatalogTable({
  rows, total, filteredTotal, page, pageSize,
}: {
  rows: CatalogListRow[];
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
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>SKU</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Name</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Category</th>
              <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Price from</th>
              <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Lead</th>
              <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Adoption</th>
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
                    {r.primaryImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.primaryImageUrl} alt={r.name} className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2 font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {r.sku ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <Link href={`${ROUTE}/${r.id}`}
                        className="font-medium hover:underline"
                        style={{ color: "var(--text-default)" }}>
                    {r.name}
                  </Link>
                  <div className="font-mono text-[10px]" style={{ color: "var(--text-faint)" }}>{r.slug}</div>
                </td>
                <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                  {CATEGORY_LABEL[r.category]}
                </td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                  {fmtMoney(r.priceFromMinor)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {r.leadTimeDays}d
                </td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                  {r.cloneCount}
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
            ? `${total.toLocaleString()} product${total === 1 ? "" : "s"}`
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
