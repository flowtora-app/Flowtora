// Page 42 — shared bits for the Affiliate Program admin.

import * as React from "react";
import type { AffiliateStatus, AffiliateApplicationStatus, AffiliateCreativeKind } from "@prisma/client";

export const STATUS_TONE: Record<AffiliateStatus, { bg: string; fg: string }> = {
  ACTIVE:   { bg: "var(--success-surface)", fg: "var(--success-fg)" },
  PAUSED:   { bg: "var(--warning-surface)", fg: "var(--warning-fg)" },
  ARCHIVED: { bg: "var(--surface-2)",       fg: "var(--text-faint)" },
};

export const APP_STATUS_TONE: Record<AffiliateApplicationStatus, { bg: string; fg: string }> = {
  PENDING:   { bg: "var(--warning-surface)", fg: "var(--warning-fg)" },
  APPROVED:  { bg: "var(--success-surface)", fg: "var(--success-fg)" },
  REJECTED:  { bg: "var(--surface-2)",       fg: "var(--text-faint)" },
  WITHDRAWN: { bg: "var(--surface-2)",       fg: "var(--text-faint)" },
};

export const CREATIVE_KIND_ICON: Record<AffiliateCreativeKind, string> = {
  BANNER:         "🖼",
  TEXT_LINK:      "🔗",
  EMAIL_TEMPLATE: "✉",
  SOCIAL_POST:    "📣",
  AD_CREATIVE:    "📰",
  VIDEO_SCRIPT:   "🎥",
};

export function StatusPill({ status }: { status: AffiliateStatus }) {
  const tone = STATUS_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: tone.bg, color: tone.fg }}>
      {status.toLowerCase()}
    </span>
  );
}

export function AppStatusPill({ status }: { status: AffiliateApplicationStatus }) {
  const tone = APP_STATUS_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: tone.bg, color: tone.fg }}>
      {status.toLowerCase()}
    </span>
  );
}

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

export function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
