"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

export type QuoteListRowData = {
  id: string;
  number: string;
  customerName: string;
  statusLabel: string;
  statusColor: string;
  total: string;
  ageLabel: string | null;
  ageColor: string | null;
  expiresLabel: string | null;
  expiringSoon: boolean;
  superseded: boolean;
};

interface QuoteListRowProps {
  row: QuoteListRowData;
  selected: boolean;
}

export function QuoteListRow({ row, selected }: QuoteListRowProps) {
  const router = useRouter();
  const sp = useSearchParams();

  const onActivate = React.useCallback(() => {
    const params = new URLSearchParams(sp.toString());
    params.set("selected", row.id);
    router.push(`?${params.toString()}`, { scroll: false });
  }, [router, sp, row.id]);

  return (
    <button
      type="button"
      onClick={onActivate}
      data-entity-id={row.id}
      className="block w-full text-left transition-colors outline-none"
      style={{
        background: selected ? "var(--accent-surface)" : "transparent",
        borderBottom: "1px solid var(--border-subtle)",
        borderLeft: selected
          ? "3px solid var(--accent-primary)"
          : "3px solid transparent",
        padding: "10px 16px 10px 13px",
        opacity: row.superseded ? 0.6 : 1,
      }}
      aria-pressed={selected}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="text-sm font-semibold"
            style={{ color: selected ? "var(--accent-primary)" : "var(--text-default)" }}
          >
            {row.number}
          </span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
            style={{ background: row.statusColor, color: "white" }}
          >
            {row.statusLabel}
          </span>
          {row.superseded && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
              title="Replaced by a newer revision"
            >
              superseded
            </span>
          )}
        </div>
        <span
          className="shrink-0 text-sm font-semibold tabular-nums"
          style={{ color: "var(--text-default)" }}
        >
          {row.total}
        </span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs" style={{ color: "var(--text-muted)" }}>
          {row.customerName}
        </span>
        <span className="shrink-0 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
          {row.ageLabel && (
            <span style={{ color: row.ageColor ?? "var(--text-muted)" }}>
              {row.ageLabel}
            </span>
          )}
          {row.ageLabel && row.expiresLabel && " · "}
          {row.expiresLabel && (
            <span
              style={{ color: row.expiringSoon ? "var(--danger-fg)" : "var(--text-muted)" }}
              title={row.expiringSoon ? "Expires soon" : "Expires"}
            >
              {row.expiringSoon ? "⌛ " : ""}
              exp {row.expiresLabel}
            </span>
          )}
        </span>
      </div>
    </button>
  );
}
