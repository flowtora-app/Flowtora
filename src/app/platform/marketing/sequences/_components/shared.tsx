// Shared bits for the Lifecycle / Drip Sequences admin (Page 40).

import * as React from "react";
import type {
  SequenceStatus,
  SequenceStepKind,
  SequenceTriggerType,
  SequenceEnrollmentStatus,
} from "@prisma/client";

export const STATUS_LABEL: Record<SequenceStatus, string> = {
  DRAFT:    "Draft",
  ACTIVE:   "Active",
  PAUSED:   "Paused",
  ARCHIVED: "Archived",
};

export const STATUS_TONE: Record<SequenceStatus, { bg: string; fg: string }> = {
  DRAFT:    { bg: "var(--surface-2)",       fg: "var(--text-muted)" },
  ACTIVE:   { bg: "var(--success-surface)", fg: "var(--success-fg)" },
  PAUSED:   { bg: "var(--warning-surface)", fg: "var(--warning-fg)" },
  ARCHIVED: { bg: "var(--surface-2)",       fg: "var(--text-faint)" },
};

export const ENROLLMENT_TONE: Record<SequenceEnrollmentStatus, { bg: string; fg: string }> = {
  ACTIVE:    { bg: "var(--accent-surface)",  fg: "var(--accent-primary)" },
  COMPLETED: { bg: "var(--success-surface)", fg: "var(--success-fg)" },
  EXITED:    { bg: "var(--surface-2)",       fg: "var(--text-faint)" },
};

export const STEP_KIND_TONE: Record<SequenceStepKind, { bg: string; fg: string; icon: string }> = {
  SEND_EMAIL:    { bg: "var(--accent-surface)",  fg: "var(--accent-primary)", icon: "✉" },
  SEND_SMS:      { bg: "var(--surface-2)",       fg: "var(--text-default)",   icon: "💬" },
  SEND_IN_APP:   { bg: "var(--surface-2)",       fg: "var(--text-default)",   icon: "🔔" },
  NOTIFY_CSM:    { bg: "var(--warning-surface)", fg: "var(--warning-fg)",     icon: "🆘" },
  ADD_TAG:       { bg: "var(--success-surface)", fg: "var(--success-fg)",     icon: "🏷" },
  REMOVE_TAG:    { bg: "var(--surface-2)",       fg: "var(--text-faint)",     icon: "✗" },
  MOVE_TO_PLAN:  { bg: "var(--accent-surface)",  fg: "var(--accent-primary)", icon: "↗" },
  APPLY_COUPON:  { bg: "var(--accent-surface)",  fg: "var(--accent-primary)", icon: "💸" },
  WEBHOOK_OUT:   { bg: "var(--surface-2)",       fg: "var(--text-default)",   icon: "↗" },
  BRANCH:        { bg: "var(--warning-surface)", fg: "var(--warning-fg)",     icon: "?" },
  WAIT:          { bg: "var(--surface-2)",       fg: "var(--text-muted)",     icon: "⏳" },
  SPLIT:         { bg: "var(--accent-surface)",  fg: "var(--accent-primary)", icon: "⇆" },
};

export function Kpi({
  label, value, sub, tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "good" | "warning" | "danger";
}) {
  const palette =
    tone === "good"    ? { borderColor: "var(--emerald-200)" } :
    tone === "warning" ? { borderColor: "var(--amber-200)" } :
    tone === "danger"  ? { borderColor: "var(--rose-200)" } :
                          undefined;
  return (
    <div className="rounded-lg border px-4 py-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", ...(palette ?? {}) }}>
      <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="mt-1 text-[22px] font-semibold leading-none tabular-nums"
           style={{ color: "var(--text-default)" }}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}

export function StatusPill({ status }: { status: SequenceStatus }) {
  const tone = STATUS_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: tone.bg, color: tone.fg }}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function EnrollmentPill({ status }: { status: SequenceEnrollmentStatus }) {
  const tone = ENROLLMENT_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: tone.bg, color: tone.fg }}>
      {status.toLowerCase()}
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

export function relativeFromNow(d: Date | null): string {
  if (!d) return "—";
  const ms = Date.now() - d.getTime();
  const future = ms < 0;
  const abs = Math.abs(ms);
  const mins = Math.round(abs / 60_000);
  const fmt = (s: string) => future ? `in ${s}` : `${s} ago`;
  if (mins < 1)  return future ? "soon" : "just now";
  if (mins < 60) return fmt(`${mins}m`);
  const hrs = Math.round(mins / 60);
  if (hrs < 24)  return fmt(`${hrs}h`);
  const days = Math.round(hrs / 24);
  if (days < 30) return fmt(`${days}d`);
  const months = Math.round(days / 30);
  return fmt(`${months}mo`);
}

export function triggerSummary(triggerType: SequenceTriggerType, config: Record<string, unknown>): string {
  switch (triggerType) {
    case "SIGNUP":            return "On signup";
    case "PLAN_STARTED":      return "On plan started";
    case "PLAN_CHANGED":      return "On plan changed";
    case "FAILED_PAYMENT":    return "On failed payment";
    case "TRIAL_ENDING":      return `Trial ending in ${config.daysBefore ?? "N"} days`;
    case "DAYS_INACTIVE":     return `${config.days ?? "N"} days inactive`;
    case "FEATURE_FIRST_USE": return `First use of ${config.featureKey ?? "?"}`;
    case "CUSTOM_EVENT":      return `Custom event "${config.eventName ?? "?"}"`;
    case "TAG_ADDED":         return `Tag "${config.tag ?? "?"}" added`;
    case "WEBHOOK":           return `Webhook → /api/seq/trigger/${(config.secret as string ?? "?").slice(0, 6)}…`;
  }
}
