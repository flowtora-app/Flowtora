"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Avatar } from "@/components/ui";
import type { HealthRow } from "@/server/platform/health-scoring";
import { TenantImpersonateButton } from "../../[id]/_components/TenantImpersonateButton";
import { ManualAdjustmentButton } from "./ManualAdjustmentButton";

// HealthTable — sortable cross-tenant list with score deltas, top
// risk factor, and per-row CSM "adjust" action.

type SortKey = "score" | "delta" | "name" | "mrr" | "activity";
const VALID: Record<SortKey, true> = { score: true, delta: true, name: true, mrr: true, activity: true };

export function HealthTable({
  rows,
  canAdjust,
  canImpersonate,
}: {
  rows: HealthRow[];
  canAdjust: boolean;
  canImpersonate: boolean;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const sortKey: SortKey = (VALID[(sp.get("sortBy") ?? "score") as SortKey]
    ? (sp.get("sortBy") as SortKey)
    : "score");
  const sortDir = sp.get("sortDir") === "asc" ? "asc" : "desc";

  const sorted = React.useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      let va: number | string;
      let vb: number | string;
      switch (sortKey) {
        case "name":
          va = a.tenantName.toLowerCase(); vb = b.tenantName.toLowerCase(); break;
        case "mrr":
          va = a.mrr; vb = b.mrr; break;
        case "delta": {
          const ad = a.prevWeekScore == null ? 0 : a.score - a.prevWeekScore;
          const bd = b.prevWeekScore == null ? 0 : b.score - b.prevWeekScore;
          va = ad; vb = bd; break;
        }
        case "activity":
          va = a.lastActivityAt?.getTime?.() ?? new Date(a.lastActivityAt ?? 0).getTime();
          vb = b.lastActivityAt?.getTime?.() ?? new Date(b.lastActivityAt ?? 0).getTime();
          break;
        case "score":
        default:
          va = a.score; vb = b.score; break;
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const setSort = (key: SortKey) => {
    const u = new URLSearchParams(sp.toString());
    if (sortKey === key) u.set("sortDir", sortDir === "asc" ? "desc" : "asc");
    else { u.set("sortBy", key); u.set("sortDir", "desc"); }
    router.replace(`/platform/tenants/health?${u.toString()}`);
  };

  return (
    <div className="overflow-x-auto rounded-md border" style={{ borderColor: "var(--border-subtle)" }}>
      <table className="w-full text-[12px]">
        <thead style={{ background: "var(--surface-2)" }}>
          <tr>
            <SortHeader label="Tenant" active={sortKey === "name"} dir={sortDir} onClick={() => setSort("name")} />
            <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Plan</th>
            <SortHeader label="MRR" active={sortKey === "mrr"} dir={sortDir} onClick={() => setSort("mrr")} className="text-right" />
            <SortHeader label="Score" active={sortKey === "score"} dir={sortDir} onClick={() => setSort("score")} className="text-right" />
            <SortHeader label="Δ vs last wk" active={sortKey === "delta"} dir={sortDir} onClick={() => setSort("delta")} className="text-right" />
            <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Top risk</th>
            <SortHeader label="Last activity" active={sortKey === "activity"} dir={sortDir} onClick={() => setSort("activity")} />
            <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>CSM</th>
            <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-3 py-8 text-center" style={{ color: "var(--text-faint)" }}>
                No tenants match the current filters.
              </td>
            </tr>
          ) : sorted.map((r) => (
            <Row
              key={r.tenantId}
              row={r}
              canAdjust={canAdjust}
              canImpersonate={canImpersonate}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SortHeader({
  label, active, dir, onClick, className = "",
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  className?: string;
}) {
  return (
    <th className={`px-3 py-2 text-left font-semibold ${className}`} style={{ color: "var(--text-muted)" }}>
      <button
        type="button"
        onClick={onClick}
        className="ts-focus inline-flex items-center gap-1 hover:underline"
      >
        {label}
        {active && <span aria-hidden>{dir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}

function Row({
  row,
  canAdjust,
  canImpersonate,
}: {
  row: HealthRow;
  canAdjust: boolean;
  canImpersonate: boolean;
}) {
  const delta = row.prevWeekScore == null ? null : row.score - row.prevWeekScore;
  const scoreColor =
    row.score >= 80 ? "var(--emerald-700)" :
    row.score >= 50 ? "var(--amber-700)" :
                      "var(--rose-700)";
  return (
    <tr style={{ borderTop: "1px solid var(--border-subtle)" }}>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <Avatar size="xs" name={row.tenantName} />
          <Link
            href={`/platform/tenants/${row.tenantId}`}
            className="font-semibold hover:underline"
            style={{ color: "var(--text-default)" }}
          >
            {row.tenantName}
          </Link>
        </div>
      </td>
      <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{row.plan}</td>
      <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
        {row.mrr === 0 ? "—" : `$${row.mrr.toLocaleString()}`}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: scoreColor }} />
          <span className="font-semibold" style={{ color: scoreColor }}>{row.score}</span>
          {row.adjustmentDelta !== 0 && (
            <span title={`Manual adj: ${row.adjustmentDelta > 0 ? "+" : ""}${row.adjustmentDelta}`}
                  className="text-[10px]" style={{ color: "var(--text-faint)" }}>
              ({row.rawScore}{row.adjustmentDelta > 0 ? "+" : ""}{row.adjustmentDelta})
            </span>
          )}
        </span>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {delta == null ? (
          <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>—</span>
        ) : (
          <span style={{ color: delta > 0 ? "var(--emerald-700)" : delta < 0 ? "var(--rose-700)" : "var(--text-muted)" }}>
            {delta > 0 ? "↑" : delta < 0 ? "↓" : "·"} {Math.abs(delta)}
          </span>
        )}
      </td>
      <td className="px-3 py-2" style={{ color: "var(--text-default)" }}>
        {row.topRisk ? (
          <span title={row.topRisk.description}>
            {row.topRisk.label}
          </span>
        ) : <span style={{ color: "var(--text-faint)" }}>—</span>}
      </td>
      <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
        {row.lastActivityAt ? relativeTime(new Date(row.lastActivityAt)) : "never"}
      </td>
      <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
        {row.csmName ?? row.csmEmail ?? <span style={{ color: "var(--text-faint)" }}>Unassigned</span>}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-1.5">
          {canAdjust && (
            <ManualAdjustmentButton
              tenantId={row.tenantId}
              tenantName={row.tenantName}
              currentScore={row.score}
              currentAdjustment={row.adjustmentDelta}
            />
          )}
          {canImpersonate && (
            <TenantImpersonateButton
              tenantId={row.tenantId}
              tenantName={row.tenantName}
              size="xs"
              variant="ghost"
              enabled={canImpersonate}
            />
          )}
        </div>
      </td>
    </tr>
  );
}

function relativeTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = 60_000, hour = 60 * min, day = 24 * hour;
  if (ms < min) return "just now";
  if (ms < hour) return `${Math.floor(ms / min)}m`;
  if (ms < day) return `${Math.floor(ms / hour)}h`;
  return `${Math.floor(ms / day)}d`;
}
