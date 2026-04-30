"use client";

import * as React from "react";
import Link from "next/link";
import { Avatar, Badge, StatusPill, Table, type ColumnDef, type SortDir } from "@/components/ui";
import type { TopTenantRow } from "@/server/platform/overview-metrics";

// TopTenantsTable — Page 1 §Row 5 right.
//
// Columns: Rank · Tenant (avatar+name) · Plan badge · MRR · Last
// activity · Health score · Status pill. Sortable; row-click opens
// tenant detail.

const STATUS_TO_PILL = {
  ACTIVE:    "active" as const,
  TRIAL:     "trialing" as const,
  PAST_DUE:  "past_due" as const,
  SUSPENDED: "suspended" as const,
  CANCELED:  "cancelled" as const,
  ARCHIVED:  "draft" as const,
};

export interface TopTenantsTableProps {
  rows: TopTenantRow[];
}

export function TopTenantsTable({ rows }: TopTenantsTableProps) {
  const [sort, setSort] = React.useState<{ key: string; dir: SortDir } | null>({ key: "mrr", dir: "desc" });

  const sorted = React.useMemo(() => {
    const ranked = rows.map((r, i) => ({ ...r, rank: i + 1 }));
    if (!sort) return ranked;
    const copy = [...ranked];
    copy.sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sort.key];
      const bv = (b as unknown as Record<string, unknown>)[sort.key];
      let cmp = 0;
      if (av instanceof Date && bv instanceof Date) cmp = av.getTime() - bv.getTime();
      else if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av ?? "").localeCompare(String(bv ?? ""));
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sort]);

  const columns = React.useMemo<ColumnDef<typeof sorted[number]>[]>(
    () => [
      { key: "rank", header: "#", cell: (r) => (
        <span className="font-mono text-[11px]" style={{ color: "var(--text-faint)" }}>
          {r.rank}
        </span>
      ), kind: "number", width: 40 },
      {
        key: "name",
        header: "Tenant",
        cell: (r) => (
          <Link href={`/platform/tenants/${r.id}`} className="flex min-w-0 items-center gap-2 hover:underline">
            <Avatar size="xs" name={r.name} />
            <div className="min-w-0">
              <div className="truncate font-medium" style={{ color: "var(--text-default)" }}>{r.name}</div>
              <div className="truncate font-mono text-[10px]" style={{ color: "var(--text-faint)" }}>{r.slug}</div>
            </div>
          </Link>
        ),
        sortable: true,
        sticky: "left",
        width: 220,
      },
      {
        key: "plan",
        header: "Plan",
        cell: (r) => <Badge size="xs" color={planColor(r.planSlug)}>{r.plan}</Badge>,
        sortable: true,
        width: 110,
      },
      {
        key: "mrr",
        header: "MRR",
        cell: (r) => "$" + r.mrr.toLocaleString(),
        kind: "money",
        sortable: true,
        width: 100,
      },
      {
        key: "lastActivityAt",
        header: "Last activity",
        cell: (r) => r.lastActivityAt ? formatRelative(r.lastActivityAt) : "—",
        sortable: true,
        width: 130,
      },
      {
        key: "healthScore",
        header: "Health",
        cell: (r) => <HealthBadge score={r.healthScore} />,
        kind: "number",
        sortable: true,
        width: 90,
      },
      {
        key: "status",
        header: "Status",
        cell: (r) => <StatusPill status={STATUS_TO_PILL[r.status] ?? "draft"} size="sm" />,
        sortable: true,
        width: 110,
      },
    ],
    [],
  );

  return (
    <Table
      rows={sorted}
      columns={columns}
      sort={sort}
      onSortChange={setSort}
      density="comfortable"
      empty={<div className="p-6 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>No tenants on a paid plan yet.</div>}
    />
  );
}

/* ── Helpers ───────────────────────────────────────────────── */

function planColor(slug: string): "neutral" | "brand" | "success" | "info" | "accent" {
  switch (slug.toLowerCase()) {
    case "enterprise": return "accent";
    case "pro":        return "brand";
    case "growth":     return "success";
    case "starter":    return "neutral";
    default:           return "info";
  }
}

function HealthBadge({ score }: { score: number }) {
  const color = score >= 80 ? "var(--emerald-700)" : score >= 50 ? "var(--amber-700)" : "var(--rose-700)";
  const bg    = score >= 80 ? "var(--emerald-50)"  : score >= 50 ? "var(--amber-50)"  : "var(--rose-50)";
  return (
    <span
      className="inline-flex h-6 w-10 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums"
      style={{ background: bg, color }}
    >
      {score}
    </span>
  );
}

function formatRelative(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = 60_000, hour = 60 * min, day = 24 * hour;
  if (ms < min)  return "just now";
  if (ms < hour) return `${Math.floor(ms / min)}m ago`;
  if (ms < day)  return `${Math.floor(ms / hour)}h ago`;
  if (ms < 30 * day) return `${Math.floor(ms / day)}d ago`;
  return d.toLocaleDateString();
}
