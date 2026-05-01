"use client";

import * as React from "react";
import Link from "next/link";
import { Avatar, Button, Drawer, useToast } from "@/components/ui";
import { sendOnboardingNudge } from "@/app/actions/onboarding-pipeline";
import type { PipelineRow } from "@/server/platform/onboarding-pipeline";
import { TenantImpersonateButton } from "../../[id]/_components/TenantImpersonateButton";

// StageDrawer — opens when a funnel stage bar is clicked. Lists the
// tenants currently sitting at that stage with days-in-stage + last-
// activity + a one-click nudge button per row.

export function StageDrawer({
  open,
  onClose,
  stageLabel,
  stageDescription,
  rows,
  canEdit,
  canImpersonate,
}: {
  open: boolean;
  onClose: () => void;
  stageLabel: string;
  stageDescription: string;
  rows: PipelineRow[];
  canEdit: boolean;
  canImpersonate: boolean;
}) {
  return (
    <Drawer
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      side="right"
      size="md"
      title={`${stageLabel} · ${rows.length}`}
      description={stageDescription}
    >
      {rows.length === 0 ? (
        <div className="py-12 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
          No tenants at this stage.
        </div>
      ) : (
        <ul className="flex flex-col divide-y" style={{ borderColor: "var(--border-subtle)" }}>
          {rows.map((r) => (
            <StageDrawerRow
              key={r.id}
              row={r}
              canEdit={canEdit}
              canImpersonate={canImpersonate}
            />
          ))}
        </ul>
      )}
    </Drawer>
  );
}

function StageDrawerRow({
  row,
  canEdit,
  canImpersonate,
}: {
  row: PipelineRow;
  canEdit: boolean;
  canImpersonate: boolean;
}) {
  const toast = useToast();
  const [pending, setPending] = React.useState(false);

  // Days-in-stage colour: yellow ≥ 7, red ≥ 14 (mirrors stuckLevel).
  const daysColor =
    row.stuckLevel === "red" ? "var(--rose-700)" :
    row.stuckLevel === "yellow" ? "var(--amber-700)" :
                                  "var(--text-muted)";

  const onNudge = async () => {
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("tenantId", row.id);
      const res = await sendOnboardingNudge(fd);
      if (res.ok) toast.success("Nudge sent");
      else toast.error(res.error ?? "Couldn't send nudge");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send nudge");
    } finally {
      setPending(false);
    }
  };

  const lastActivity = row.lastActivityAt ?? row.createdAt;
  const lastActivityRel = relativeTime(new Date(lastActivity));

  return (
    <li className="flex items-start gap-3 py-3">
      <Avatar size="sm" src={row.logoUrl ?? undefined} name={row.name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/platform/tenants/${row.id}`}
            className="truncate text-[13px] font-semibold hover:underline"
            style={{ color: "var(--text-default)" }}
          >
            {row.name}
          </Link>
          <span className="text-[10px] tabular-nums" style={{ color: daysColor }}>
            {row.daysInStage}d
          </span>
          {row.isMarkedStuck && (
            <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold"
                  style={{ background: "var(--rose-50)", color: "var(--rose-700)" }}>
              Marked stuck
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--text-faint)" }}>
          {row.ownerEmail ?? "no owner"} · last seen {lastActivityRel}
        </div>
        {row.lastOnboardingNudgeAt && (
          <div className="mt-0.5 text-[10px]" style={{ color: "var(--text-faint)" }}>
            Last nudge: {relativeTime(new Date(row.lastOnboardingNudgeAt))} ago
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {canEdit && row.ownerEmail && (
          <Button size="xs" variant="secondary" onClick={onNudge} disabled={pending}>
            {pending ? "Sending…" : "Send nudge"}
          </Button>
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
    </li>
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
