"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { MaterialListRow } from "@/server/platform/materials";
import { CATEGORY_LABEL, fmtMoneyDecimal4, StatusPill, USAGE_LABEL } from "./shared";

const ROUTE = "/platform/catalog/materials";

export function MaterialTable({
  rows, total, filteredTotal, page, pageSize,
}: {
  rows: MaterialListRow[];
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
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Category / Sub</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Usage</th>
              <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Durability</th>
              <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>W × L</th>
              <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Cost / unit</th>
              <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Markup</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Suppliers</th>
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
                      <img src={r.imageUrl} alt={r.name} className="h-full w-full object-cover" />
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
                  <div style={{ color: "var(--text-default)" }}>{CATEGORY_LABEL[r.category]}</div>
                  {r.subcategory && <div className="text-[10px]">{r.subcategory}</div>}
                </td>
                <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                  {USAGE_LABEL[r.usage]}
                </td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {r.durabilityYears != null ? `${r.durabilityYears}y` : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {r.widthIn != null
                    ? `${r.widthIn}\"${r.rollLengthFt != null ? ` × ${r.rollLengthFt}'` : ""}`
                    : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                  {fmtMoneyDecimal4(r.defaultCost)}
                  <div className="text-[9px]" style={{ color: "var(--text-muted)" }}>per {r.defaultUnit}</div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {r.defaultMarkupPct.toFixed(0)}%
                </td>
                <td className="px-3 py-2" style={{ color: "var(--text-default)" }}>
                  <div className="flex items-center gap-1">
                    {r.primarySupplier ? (
                      <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                            style={{ background: "var(--surface-2)", color: "var(--text-default)" }}>
                        ★ {r.primarySupplier}
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-faint)" }}>—</span>
                    )}
                    {r.supplierCount > 1 && (
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        +{r.supplierCount - 1}
                      </span>
                    )}
                    {r.hasOutdatedSupplier && (
                      <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase"
                            style={{ background: "var(--amber-50)", color: "var(--amber-700)", border: "1px solid var(--amber-200)" }}
                            title="At least one supplier price last updated > 90 days ago">
                        stale
                      </span>
                    )}
                  </div>
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
            ? `${total.toLocaleString()} material${total === 1 ? "" : "s"}`
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
