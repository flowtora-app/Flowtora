"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { TemplateListRow } from "@/server/platform/industry-templates";
import { KIND_LABEL, StatusPill } from "./shared";

const ROUTE = "/platform/catalog/templates";

export function TemplateGrid({
  rows, total, filteredTotal, page, pageSize,
}: {
  rows: TemplateListRow[];
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {rows.map((r) => (
          <Link
            key={r.id}
            href={`${ROUTE}/${r.id}`}
            className="ts-focus block overflow-hidden rounded-lg border transition-shadow hover:shadow-md"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
          >
            <div className="aspect-[4/3] overflow-hidden"
                 style={{ background: "var(--surface-2)" }}>
              {r.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.thumbnailUrl} alt={r.name}
                     className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[11px]"
                     style={{ color: "var(--text-faint)" }}>
                  No preview
                </div>
              )}
            </div>
            <div className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>
                    {r.name}
                  </h3>
                  <div className="font-mono text-[10px]" style={{ color: "var(--text-faint)" }}>
                    {r.slug}
                  </div>
                </div>
                <StatusPill status={r.status} />
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                <span>{KIND_LABEL[r.kind]}</span>
                <span>· {r.locale}</span>
                <span>· {r.versionCount} version{r.versionCount === 1 ? "" : "s"}</span>
              </div>
              {r.description && (
                <p className="mt-2 line-clamp-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                  {r.description}
                </p>
              )}
              {r.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {r.tags.slice(0, 4).map((t) => (
                    <span key={t}
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                          style={{ background: "var(--surface-2)", color: "var(--text-default)" }}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </Link>
        ))}
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
