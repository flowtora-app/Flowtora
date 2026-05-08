// Page 54 — Incident shared bits.

import * as React from "react";
import {
  SEVERITY_TONE, STATUS_TONE, NOTIFICATION_TONE, COMM_STATUS_TONE,
  ACTION_ITEM_TONE, COMPONENT_STATUS_TONE, MAINT_STATE_TONE,
  RUNBOOK_STATUS_TONE, COMM_CHANNEL_LABEL, TIMELINE_KIND_LABEL,
  DETECTED_BY_LABEL,
} from "@/server/platform/incidents";
import type {
  IncidentSeverity, IncidentStatus, AffectedNotificationStatus,
  IncidentCommStatus, ActionItemStatus, StatusPageComponentStatus,
  StatusPageMaintenanceState, RunbookStatus, IncidentCommChannel,
  IncidentTimelineKind, IncidentDetectedBy,
} from "@prisma/client";

export function Kpi({
  label, value, sub, tone,
}: { label: string; value: string; sub?: string; tone?: "default" | "good" | "warning" | "danger" }) {
  const palette =
    tone === "good"    ? { borderColor: "var(--emerald-200)" } :
    tone === "warning" ? { borderColor: "var(--amber-200)" } :
    tone === "danger"  ? { borderColor: "var(--rose-200)" } :
                          undefined;
  return (
    <div className="rounded-lg border px-4 py-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", ...(palette ?? {}) }}>
      <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="mt-1 text-[20px] font-semibold leading-none tabular-nums"
           style={{ color: "var(--text-default)" }}>{value}</div>
      {sub && <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}

export function SeverityPill({ severity }: { severity: IncidentSeverity }) {
  const t = SEVERITY_TONE[severity];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
          style={{ background: t.bg, color: t.fg }}>
      {t.label}
    </span>
  );
}

export function StatusPill({ status }: { status: IncidentStatus }) {
  const t = STATUS_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: t.bg, color: t.fg }}>
      {t.label}
    </span>
  );
}

export function NotificationPill({ status }: { status: AffectedNotificationStatus }) {
  const t = NOTIFICATION_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: t.bg, color: t.fg }}>
      {t.label}
    </span>
  );
}

export function CommStatusPill({ status }: { status: IncidentCommStatus }) {
  const t = COMM_STATUS_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: t.bg, color: t.fg }}>
      {t.label}
    </span>
  );
}

export function ActionItemPill({ status }: { status: ActionItemStatus }) {
  const t = ACTION_ITEM_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: t.bg, color: t.fg }}>
      {t.label}
    </span>
  );
}

export function ComponentStatusPill({ status }: { status: StatusPageComponentStatus }) {
  const t = COMPONENT_STATUS_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: t.bg, color: t.fg }}>
      {t.label}
    </span>
  );
}

export function MaintStatePill({ state }: { state: StatusPageMaintenanceState }) {
  const t = MAINT_STATE_TONE[state];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: t.bg, color: t.fg }}>
      {t.label}
    </span>
  );
}

export function RunbookStatusPill({ status }: { status: RunbookStatus }) {
  const t = RUNBOOK_STATUS_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: t.bg, color: t.fg }}>
      {t.label}
    </span>
  );
}

export function ChannelChip({ ch }: { ch: IncidentCommChannel }) {
  return (
    <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium"
          style={{ background: "var(--surface-2)", color: "var(--text-default)" }}>
      {COMM_CHANNEL_LABEL[ch]}
    </span>
  );
}

export function TimelineKindIcon({ kind }: { kind: IncidentTimelineKind }) {
  // Simple emoji-ish dot mapping.
  const dot =
    kind === "STATUS_CHANGE"  ? "●" :
    kind === "COMMS_SENT"     ? "✉" :
    kind === "MITIGATION"     ? "▲" :
    kind === "ROLE_ASSIGNED"  ? "◆" :
    kind === "DEPLOY"         ? "↑" :
    kind === "FLAG_TOGGLE"    ? "⚐" :
    kind === "PAGE_FIRED"     ? "!" :
    kind === "ALERT"          ? "!" :
    kind === "HANDOFF"        ? "↻" :
    kind === "RESOLUTION"     ? "✓" :
                                "•";
  return <span className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>{dot}</span>;
}

export function DetectedByChip({ d }: { d: IncidentDetectedBy }) {
  return (
    <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium"
          style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
      {DETECTED_BY_LABEL[d]}
    </span>
  );
}

export function FormError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <div className="rounded-md border px-3 py-2 text-[12px]"
         style={{ borderColor: "var(--rose-200)", background: "var(--rose-50, var(--surface-2))", color: "var(--danger-fg)" }}>
      {decodeURIComponent(msg)}
    </div>
  );
}
export function FormOk({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <div className="rounded-md border px-3 py-2 text-[12px]"
         style={{ borderColor: "var(--emerald-200)", background: "var(--emerald-50, var(--surface-2))", color: "var(--success-fg)" }}>
      {decodeURIComponent(msg.replace(/-/g, " "))}
    </div>
  );
}
