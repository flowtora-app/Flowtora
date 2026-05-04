// Shared bits for the Knowledge Base admin.

import * as React from "react";
import type { KbArticleStatus, KbVisibility } from "@prisma/client";

export const STATUS_LABEL: Record<KbArticleStatus, string> = {
  DRAFT:     "Draft",
  REVIEW:    "In review",
  PUBLISHED: "Published",
  ARCHIVED:  "Archived",
};

export const STATUS_TONE: Record<KbArticleStatus, { bg: string; fg: string }> = {
  DRAFT:     { bg: "var(--surface-2)",       fg: "var(--text-muted)"     },
  REVIEW:    { bg: "var(--warning-surface)", fg: "var(--warning-fg)"     },
  PUBLISHED: { bg: "var(--success-surface)", fg: "var(--success-fg)"     },
  ARCHIVED:  { bg: "var(--surface-2)",       fg: "var(--text-faint)"     },
};

export const VISIBILITY_LABEL: Record<KbVisibility, string> = {
  PUBLIC:          "Public",
  INTERNAL:        "Internal",
  PLAN_RESTRICTED: "Plan-restricted",
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

export function StatusPill({ status }: { status: KbArticleStatus }) {
  const palette = STATUS_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: palette.bg, color: palette.fg }}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function DeferredNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border px-3 py-2 text-[11px]"
         style={{ borderColor: "var(--amber-200)", background: "var(--amber-50)", color: "var(--amber-700)" }}>
      {children}
    </div>
  );
}

export function relativeFromNow(d: Date): string {
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
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
  const map: Record<string, string> = {
    saved: "Article saved.",
    created: "Article created.",
    transitioned: "Status updated.",
    "category-created": "Category created.",
  };
  return (
    <div className="rounded-md border px-3 py-2 text-[12px]"
         style={{ borderColor: "var(--emerald-200)", background: "var(--emerald-50, var(--surface-2))", color: "var(--success-fg)" }}>
      {map[msg] ?? "Done."}
    </div>
  );
}
