"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Avatar, useToast } from "@/components/ui";
import {
  markTenantStuck,
  sendOnboardingNudge,
} from "@/app/actions/onboarding-pipeline";
import type { PipelineRow } from "@/server/platform/onboarding-pipeline";
import { TenantImpersonateButton } from "../../[id]/_components/TenantImpersonateButton";

// ListTab — flat sortable table for ops who'd rather scan rows than
// a kanban. Sort is URL-driven via ?sortBy / ?sortDir so deep-linking
// keeps state. Per-row actions: nudge / mark stuck / impersonate.

type SortKey = "name" | "stage" | "days" | "activity" | "health";

const SORT_VALID: Record<SortKey, true> = {
  name: true, stage: true, days: true, activity: true, health: true,
};

export function ListTab({
  rows,
  canEdit,
  canImpersonate,
}: {
  rows: PipelineRow[];
  canEdit: boolean;
  canImpersonate: boolean;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const sortByRaw = sp.get("sortBy") ?? "days";
  const sortKey: SortKey = (SORT_VALID[sortByRaw as SortKey] ? sortByRaw : "days") as SortKey;
  const sortDir = sp.get("sortDir") === "asc" ? "asc" : "desc";

  const sorted = React.useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      let va: string | number;
      let vb: string | number;
      switch (sortKey) {
        case "name":     va = a.name.toLowerCase(); vb = b.name.toLowerCase(); break;
        case "stage":    va = a.stage.order; vb = b.stage.order; break;
        case "days":     va = a.daysInStage; vb = b.daysInStage; break;
        case "activity": va = (a.lastActivityAt ?? a.createdAt).getTime?.() ?? new Date(a.lastActivityAt ?? a.createdAt).getTime();
                         vb = (b.lastActivityAt ?? b.createdAt).getTime?.() ?? new Date(b.lastActivityAt ?? b.createdAt).getTime();
                         break;
        case "health":   va = a.daysInStage; vb = b.daysInStage; break;
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1  : -1;
      return 0;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const setSort = (key: SortKey) => {
    const u = new URLSearchParams(sp.toString());
    if (sortKey === key) {
      u.set("sortDir", sortDir === "asc" ? "desc" : "asc");
    } else {
      u.set("sortBy", key);
      u.set("sortDir", "desc");
    }
    router.replace(`/platform/tenants/onboarding?${u.toString()}`);
  };

  return (
    <div className="overflow-x-auto rounded-md border" style={{ borderColor: "var(--border-subtle)" }}>
      <table className="w-full text-[12px]">
        <thead style={{ background: "var(--surface-2)" }}>
          <tr>
            <SortHeader label="Tenant"     active={sortKey === "name"}     dir={sortDir} onClick={() => setSort("name")} />
            <SortHeader label="Stage"      active={sortKey === "stage"}    dir={sortDir} onClick={() => setSort("stage")} />
            <SortHeader label="Days"       active={sortKey === "days"}     dir={sortDir} onClick={() => setSort("days")} className="text-right" />
            <SortHeader label="Last activity" active={sortKey === "activity"} dir={sortDir} onClick={() => setSort("activity")} />
            <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Owner</th>
            <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Stuck</th>
            <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-3 py-8 text-center" style={{ color: "var(--text-faint)" }}>
                No tenants match the current filters.
              </td>
            </tr>
          ) : sorted.map((r) => (
            <ListRow
              key={r.id}
              row={r}
              canEdit={canEdit}
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

function ListRow({
  row,
  canEdit,
  canImpersonate,
}: {
  row: PipelineRow;
  canEdit: boolean;
  canImpersonate: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  const onNudge = async () => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("tenantId", row.id);
      const res = await sendOnboardingNudge(fd);
      if (res.ok) toast.success("Nudge sent");
      else toast.error(res.error ?? "Couldn't send nudge");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send nudge");
    } finally {
      setBusy(false);
    }
  };

  const onMarkStuck = async () => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("tenantId", row.id);
      fd.set("stuck", row.isMarkedStuck ? "off" : "on");
      const res = await markTenantStuck(fd);
      if (res.ok) {
        toast.success(row.isMarkedStuck ? "Stuck flag cleared" : "Marked stuck");
        router.refresh();
      } else toast.error(res.error ?? "Couldn't update");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update");
    } finally {
      setBusy(false);
    }
  };

  const daysColor =
    row.stuckLevel === "red" ? "var(--rose-700)" :
    row.stuckLevel === "yellow" ? "var(--amber-700)" :
                                  "var(--text-muted)";

  const lastActivity = new Date(row.lastActivityAt ?? row.createdAt);

  return (
    <tr style={{ borderTop: "1px solid var(--border-subtle)" }}>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <Avatar size="xs" src={row.logoUrl ?? undefined} name={row.name} />
          <Link
            href={`/platform/tenants/${row.id}`}
            className="font-semibold hover:underline"
            style={{ color: "var(--text-default)" }}
          >
            {row.name}
          </Link>
        </div>
      </td>
      <td className="px-3 py-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="text-[14px]">{row.stage.icon}</span>
          <span style={{ color: "var(--text-default)" }}>{row.stage.label}</span>
          {row.onboardingStageOverride && (
            <span title="Manual override active"
                  className="inline-flex items-center rounded-full px-1.5 text-[10px]"
                  style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
              override
            </span>
          )}
        </span>
      </td>
      <td className="px-3 py-2 text-right tabular-nums" style={{ color: daysColor }}>
        {row.daysInStage}d
      </td>
      <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
        {relativeTime(lastActivity)}
      </td>
      <td className="px-3 py-2 truncate" style={{ color: "var(--text-muted)" }}>
        {row.ownerEmail ?? "—"}
      </td>
      <td className="px-3 py-2">
        {row.isMarkedStuck ? (
          <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold"
                style={{ background: "var(--rose-50)", color: "var(--rose-700)" }}>
            Marked
          </span>
        ) : row.stuckLevel === "red" ? (
          <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold"
                style={{ background: "var(--rose-50)", color: "var(--rose-700)" }}>
            Critical
          </span>
        ) : row.stuckLevel === "yellow" ? (
          <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold"
                style={{ background: "var(--amber-50)", color: "var(--amber-700)" }}>
            Slow
          </span>
        ) : (
          <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>—</span>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-1.5">
          {canEdit && row.ownerEmail && (
            <button
              type="button"
              onClick={onNudge}
              disabled={busy}
              className="ts-focus inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-medium hover:bg-[var(--surface-2)] disabled:opacity-50"
              style={{ borderColor: "var(--border-default)", color: "var(--text-default)" }}
            >
              Nudge
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={onMarkStuck}
              disabled={busy}
              className="ts-focus inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-medium hover:bg-[var(--surface-2)] disabled:opacity-50"
              style={{ borderColor: "var(--border-default)", color: "var(--text-default)" }}
            >
              {row.isMarkedStuck ? "Unmark" : "Mark stuck"}
            </button>
          )}
          {canImpersonate && (
            <TenantImpersonateButton
              tenantId={row.id}
              tenantName={row.name}
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
