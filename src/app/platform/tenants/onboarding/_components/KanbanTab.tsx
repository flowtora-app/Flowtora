"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, useToast } from "@/components/ui";
import {
  markTenantStuck,
  overrideTenantStage,
  sendOnboardingNudge,
} from "@/app/actions/onboarding-pipeline";
import {
  type PipelineRow,
  type StageDef,
  type StageId,
} from "@/server/platform/onboarding-pipeline";
import { TenantImpersonateButton } from "../../[id]/_components/TenantImpersonateButton";

// KanbanTab — 10 stage columns × tenant cards.
//
// • Drag-and-drop sets the manual stage override (no automated stage
//   advancement on the server side; the override wins until cleared).
// • Per-card "⋯" menu: Email · Mark stuck / Unmark · Override stage…
//   (with submenu) · Open detail · Impersonate.
// • WIP-limit colours: column header turns amber when the live count
//   exceeds the configured limit, red at +50%.

export function KanbanTab({
  rows,
  stages,
  wipLimits,
  canEdit,
  canImpersonate,
}: {
  rows: PipelineRow[];
  stages: StageDef[];
  wipLimits: Partial<Record<StageId, number>>;
  canEdit: boolean;
  canImpersonate: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [dropTarget, setDropTarget] = React.useState<StageId | null>(null);
  const [pending, setPending] = React.useState(false);

  const grouped = React.useMemo(() => {
    const map = new Map<StageId, PipelineRow[]>();
    for (const s of stages) map.set(s.id, []);
    for (const r of rows) map.get(r.stage.id)?.push(r);
    return map;
  }, [rows, stages]);

  const onDrop = async (tenantId: string, nextStage: StageId) => {
    setDropTarget(null);
    setDraggingId(null);
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("tenantId", tenantId);
      fd.set("stage", nextStage);
      const res = await overrideTenantStage(fd);
      if (res.ok) {
        toast.success("Stage updated");
        router.refresh();
      } else {
        toast.error(res.error ?? "Couldn't update stage");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update stage");
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className="overflow-x-auto pb-2"
      style={{ scrollSnapType: "x proximity" }}
    >
      <div className="flex min-w-max gap-3" style={{ minHeight: 200 }}>
        {stages.map((stage) => {
          const inStage = grouped.get(stage.id) ?? [];
          const wip = wipLimits[stage.id];
          const overWip = wip != null && inStage.length > wip;
          const overWipHard = wip != null && inStage.length > wip * 1.5;
          const headerColor = overWipHard ? "var(--rose-700)" : overWip ? "var(--amber-700)" : "var(--text-default)";
          const headerBg = overWipHard ? "var(--rose-50)" : overWip ? "var(--amber-50)" : "var(--surface-1)";
          const isDropTarget = dropTarget === stage.id;
          return (
            <div
              key={stage.id}
              className="flex w-72 shrink-0 flex-col rounded-md border"
              style={{
                borderColor: isDropTarget ? "var(--accent-primary)" : "var(--border-subtle)",
                background: "var(--surface-2)",
                scrollSnapAlign: "start",
              }}
              onDragOver={(e) => {
                if (!canEdit) return;
                e.preventDefault();
                if (dropTarget !== stage.id) setDropTarget(stage.id);
              }}
              onDragLeave={() => { if (dropTarget === stage.id) setDropTarget(null); }}
              onDrop={(e) => {
                if (!canEdit) return;
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                if (id) void onDrop(id, stage.id);
              }}
            >
              <div
                className="flex items-center justify-between rounded-t-md px-3 py-2"
                style={{ background: headerBg, color: headerColor, borderBottom: "1px solid var(--border-subtle)" }}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-[14px]">{stage.icon}</span>
                  <span className="truncate text-[12px] font-semibold">
                    {stage.label}
                  </span>
                </div>
                <span className="ml-2 shrink-0 text-[11px] tabular-nums">
                  {inStage.length}{wip != null ? ` / ${wip}` : ""}
                </span>
              </div>
              <div className="flex flex-col gap-2 p-2">
                {inStage.length === 0 && (
                  <div className="rounded-md border border-dashed py-6 text-center text-[11px]"
                       style={{ borderColor: "var(--border-subtle)", color: "var(--text-faint)" }}>
                    No tenants
                  </div>
                )}
                {inStage.map((row) => (
                  <KanbanCard
                    key={row.id}
                    row={row}
                    stages={stages}
                    canEdit={canEdit}
                    canImpersonate={canImpersonate}
                    isDragging={draggingId === row.id}
                    onDragStart={() => setDraggingId(row.id)}
                    onDragEnd={() => setDraggingId(null)}
                    pending={pending}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Card ────────────────────────────────────────────────── */

function KanbanCard({
  row,
  stages,
  canEdit,
  canImpersonate,
  isDragging,
  onDragStart,
  onDragEnd,
  pending,
}: {
  row: PipelineRow;
  stages: StageDef[];
  canEdit: boolean;
  canImpersonate: boolean;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  pending: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [submenu, setSubmenu] = React.useState<"override" | null>(null);
  const [busy, setBusy] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setSubmenu(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const daysColor =
    row.stuckLevel === "red" ? "var(--rose-700)" :
    row.stuckLevel === "yellow" ? "var(--amber-700)" :
                                  "var(--text-muted)";

  const onNudge = async () => {
    setMenuOpen(false);
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
    setMenuOpen(false);
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

  const onOverride = async (stageId: string) => {
    setMenuOpen(false);
    setSubmenu(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("tenantId", row.id);
      fd.set("stage", stageId);
      const res = await overrideTenantStage(fd);
      if (res.ok) {
        toast.success(stageId === "" ? "Override cleared" : "Stage overridden");
        router.refresh();
      } else toast.error(res.error ?? "Couldn't override");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't override");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      ref={ref}
      draggable={canEdit && !pending && !busy}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", row.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className="ts-focus relative rounded-md border bg-[var(--surface-1)] p-2 shadow-sm transition-opacity"
      style={{
        borderColor: row.isMarkedStuck ? "var(--rose-300)" : "var(--border-subtle)",
        opacity: isDragging ? 0.4 : 1,
        cursor: canEdit ? "grab" : "default",
      }}
    >
      <div className="flex items-start gap-2">
        <Avatar size="xs" src={row.logoUrl ?? undefined} name={row.name} />
        <div className="min-w-0 flex-1">
          <Link
            href={`/platform/tenants/${row.id}`}
            className="block truncate text-[12px] font-semibold hover:underline"
            style={{ color: "var(--text-default)" }}
          >
            {row.name}
          </Link>
          <div className="truncate text-[10px]" style={{ color: "var(--text-faint)" }}>
            {row.ownerEmail ?? "no owner"}
          </div>
        </div>
        <button
          type="button"
          aria-label={`Actions for ${row.name}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); setSubmenu(null); }}
          className="ts-focus inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[12px] hover:bg-[var(--surface-2)]"
          style={{ color: "var(--text-muted)" }}
        >
          ⋯
        </button>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px]">
        <span style={{ color: daysColor }}>
          {row.daysInStage}d in stage
        </span>
        {row.isMarkedStuck && (
          <span className="inline-flex items-center rounded-full px-1.5 font-semibold"
                style={{ background: "var(--rose-50)", color: "var(--rose-700)" }}>
            Stuck
          </span>
        )}
      </div>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-1 top-9 z-30 w-48 overflow-hidden rounded-md border shadow-lg"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-default)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {submenu === "override" ? (
            <>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase"
                   style={{ color: "var(--text-faint)", borderBottom: "1px solid var(--border-subtle)" }}>
                Override stage
              </div>
              {stages.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="menuitem"
                  onClick={() => onOverride(s.id)}
                  className="ts-focus flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] hover:bg-[var(--surface-2)]"
                  style={{ color: "var(--text-default)" }}
                >
                  <span className="text-[12px]">{s.icon}</span>
                  <span className="truncate">{s.label}</span>
                </button>
              ))}
              {row.onboardingStageOverride && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => onOverride("")}
                  className="ts-focus flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] hover:bg-[var(--surface-2)]"
                  style={{ color: "var(--text-muted)", borderTop: "1px solid var(--border-subtle)" }}
                >
                  ↺ Clear override
                </button>
              )}
            </>
          ) : (
            <>
              <Link
                href={`/platform/tenants/${row.id}`}
                role="menuitem"
                className="ts-focus block px-3 py-2 text-[12px] hover:bg-[var(--surface-2)]"
                style={{ color: "var(--text-default)" }}
              >
                Open detail
              </Link>
              {canImpersonate && (
                <div className="px-3 py-1.5">
                  <TenantImpersonateButton
                    tenantId={row.id}
                    tenantName={row.name}
                    size="xs"
                    variant="ghost"
                    enabled={canImpersonate}
                  />
                </div>
              )}
              {row.ownerEmail && (
                <a
                  href={`mailto:${row.ownerEmail}`}
                  role="menuitem"
                  className="ts-focus block px-3 py-2 text-[12px] hover:bg-[var(--surface-2)]"
                  style={{ color: "var(--text-default)" }}
                >
                  Send email
                </a>
              )}
              {canEdit && row.ownerEmail && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={onNudge}
                  disabled={busy}
                  className="ts-focus block w-full px-3 py-2 text-left text-[12px] hover:bg-[var(--surface-2)]"
                  style={{ color: "var(--text-default)" }}
                >
                  Send onboarding nudge
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={onMarkStuck}
                  disabled={busy}
                  className="ts-focus block w-full px-3 py-2 text-left text-[12px] hover:bg-[var(--surface-2)]"
                  style={{ color: "var(--text-default)" }}
                >
                  {row.isMarkedStuck ? "Unmark stuck" : "Mark stuck"}
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setSubmenu("override")}
                  className="ts-focus block w-full px-3 py-2 text-left text-[12px] hover:bg-[var(--surface-2)]"
                  style={{ color: "var(--text-default)" }}
                >
                  Override stage…
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
