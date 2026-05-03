"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { AssetListRow } from "@/server/platform/design-assets";
import { LicensePill, StatusPill } from "./shared";

const ROUTE = "/platform/catalog/assets";

export function AssetGrid({
  rows, total, filteredTotal, page, pageSize,
}: {
  rows: AssetListRow[];
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
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {rows.map((r) => (
          <Link
            key={r.id}
            href={`${ROUTE}/${r.id}`}
            className="ts-focus block overflow-hidden rounded-lg border transition-shadow hover:shadow-md"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
          >
            <AssetThumb row={r} />
            <div className="p-2">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="truncate text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
                  {r.name}
                </h3>
                <StatusPill status={r.status} />
              </div>
              <div className="font-mono text-[10px]" style={{ color: "var(--text-faint)" }}>
                {r.slug}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <LicensePill license={r.license} />
                {r.format && (
                  <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                        style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                    {r.format}
                  </span>
                )}
                {r.allowedPlanSlugs.length > 0 && (
                  <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                        style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}
                        title={`Restricted to: ${r.allowedPlanSlugs.join(", ")}`}>
                    {r.allowedPlanSlugs.length} plan{r.allowedPlanSlugs.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
        <span>
          {filteredTotal === total
            ? `${total.toLocaleString()} asset${total === 1 ? "" : "s"}`
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

function AssetThumb({ row }: { row: AssetListRow }) {
  // Palette kind: render the colors as a bar; otherwise fall back to image / blank.
  if (row.kind === "PALETTE" && row.paletteColors.length > 0) {
    return (
      <div className="flex aspect-[4/3]">
        {row.paletteColors.slice(0, 6).map((c, i) => (
          <div key={i} style={{ flex: 1, background: c }} />
        ))}
      </div>
    );
  }
  return (
    <div className="aspect-[4/3] overflow-hidden"
         style={{ background: "var(--surface-2)" }}>
      {row.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={row.thumbnailUrl} alt={row.name}
             className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px]"
             style={{ color: "var(--text-faint)" }}>
          No preview
        </div>
      )}
    </div>
  );
}
