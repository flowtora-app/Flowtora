import Link from "next/link";
import type { CatalogListRow } from "@/server/platform/catalog";
import { CATEGORY_LABEL, fmtMoney, StatusPill } from "./shared";

export function CatalogGrid({ rows }: { rows: CatalogListRow[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {rows.map((r) => (
        <Link
          key={r.id}
          href={`/platform/catalog/products/${r.id}`}
          className="ts-focus block overflow-hidden rounded-lg border transition-shadow hover:shadow-md"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
        >
          <div className="aspect-[4/3] overflow-hidden"
               style={{ background: "var(--surface-2)" }}>
            {r.primaryImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.primaryImageUrl}
                   alt={r.name}
                   className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[11px]"
                   style={{ color: "var(--text-faint)" }}>
                No image
              </div>
            )}
          </div>
          <div className="p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="truncate text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>
                {r.name}
              </h3>
              <StatusPill status={r.status} />
            </div>
            <div className="mt-1 flex flex-wrap gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
              <span>{CATEGORY_LABEL[r.category]}</span>
              {r.sku && <span className="font-mono">· {r.sku}</span>}
            </div>
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 text-[12px]">
              <span style={{ color: "var(--text-default)" }}>
                From <strong className="tabular-nums">{fmtMoney(r.priceFromMinor)}</strong>
              </span>
              <span style={{ color: "var(--text-muted)" }}>
                Lead {r.leadTimeDays}d
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px]"
                 style={{ color: "var(--text-muted)" }}>
              <span>
                {r.cloneCount > 0
                  ? <>Used by <strong style={{ color: "var(--text-default)" }}>{r.cloneCount}</strong> tenant{r.cloneCount === 1 ? "" : "s"}</>
                  : "No tenant adoption yet"}
              </span>
              <span>{r.updatedAt.toLocaleDateString()}</span>
            </div>
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
  );
}
