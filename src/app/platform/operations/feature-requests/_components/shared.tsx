// Shared bits for the Feature Requests admin (Page 36).

import * as React from "react";
import type {
  FeatureRequestStatus,
  EngineeringEffort,
} from "@prisma/client";

export const STATUS_LABEL: Record<FeatureRequestStatus, string> = {
  SUBMITTED:    "Submitted",
  BACKLOG:      "Backlog",
  UNDER_REVIEW: "Under review",
  PLANNED:      "Planned",
  IN_PROGRESS:  "In progress",
  BETA:         "Beta",
  SHIPPED:      "Shipped",
  WONT_DO:      "Won't do",
};

export const STATUS_TONE: Record<FeatureRequestStatus, { bg: string; fg: string; border?: string }> = {
  SUBMITTED:    { bg: "var(--accent-surface)",  fg: "var(--accent-primary)" },
  BACKLOG:      { bg: "var(--surface-2)",       fg: "var(--text-muted)"     },
  UNDER_REVIEW: { bg: "var(--warning-surface)", fg: "var(--warning-fg)"     },
  PLANNED:      { bg: "var(--accent-surface)",  fg: "var(--accent-primary)" },
  IN_PROGRESS:  { bg: "var(--warning-surface)", fg: "var(--warning-fg)"     },
  BETA:         { bg: "var(--success-surface)", fg: "var(--success-fg)"     },
  SHIPPED:      { bg: "var(--success-surface)", fg: "var(--success-fg)"     },
  WONT_DO:      { bg: "var(--surface-2)",       fg: "var(--text-faint)"     },
};

export const EFFORT_LABEL: Record<EngineeringEffort, string> = {
  XS: "XS", S: "S", M: "M", L: "L", XL: "XL",
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

export function StatusPill({ status }: { status: FeatureRequestStatus }) {
  const palette = STATUS_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: palette.bg, color: palette.fg }}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function EffortChip({ effort }: { effort: EngineeringEffort | null }) {
  if (!effort) return null;
  const tone =
    effort === "XS" ? "var(--success-fg)" :
    effort === "S"  ? "var(--success-fg)" :
    effort === "M"  ? "var(--accent-primary)" :
    effort === "L"  ? "var(--warning-fg)" :
                       "var(--danger-fg)";
  return (
    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
          style={{
            background: "var(--surface-2)",
            color: tone,
            border: `1px solid ${tone}`,
          }}>
      {EFFORT_LABEL[effort]}
    </span>
  );
}

export function IceChip({ score }: { score: number | null }) {
  if (score == null) {
    return (
      <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
        ICE —
      </span>
    );
  }
  const tone =
    score >= 80 ? "var(--success-fg)" :
    score >= 50 ? "var(--accent-primary)" :
    score >= 25 ? "var(--warning-fg)" :
                  "var(--text-muted)";
  return (
    <span className="text-[10px] font-semibold tabular-nums" style={{ color: tone }}>
      ICE {score}
    </span>
  );
}

export function FormError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <div className="rounded-md border px-3 py-2 text-[12px]"
         style={{ borderColor: "var(--rose-200)", background: "var(--rose-50, var(--surface-2))", color: "var(--danger-fg)" }}>
      {msg}
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

export function relativeFromNow(d: Date): string {
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
