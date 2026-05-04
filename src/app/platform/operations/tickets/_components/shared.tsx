// Shared bits for the Support Tickets command center.

import * as React from "react";
import type {
  SupportTicketStatus,
  SupportTicketPriority,
  SupportTicketCategory,
  SupportTicketModule,
  SupportTicketChannel,
} from "@prisma/client";

export const STATUS_LABEL: Record<SupportTicketStatus, string> = {
  OPEN:             "Open",
  IN_PROGRESS:      "In progress",
  WAITING_CUSTOMER: "Waiting customer",
  RESOLVED:         "Resolved",
  CLOSED:           "Closed",
};

export const STATUS_TONE: Record<SupportTicketStatus, { bg: string; fg: string }> = {
  OPEN:             { bg: "var(--accent-surface)",  fg: "var(--accent-primary)" },
  IN_PROGRESS:      { bg: "var(--warning-surface)", fg: "var(--warning-fg)"     },
  WAITING_CUSTOMER: { bg: "var(--surface-2)",       fg: "var(--text-muted)"     },
  RESOLVED:         { bg: "var(--success-surface)", fg: "var(--success-fg)"     },
  CLOSED:           { bg: "var(--surface-2)",       fg: "var(--text-faint)"     },
};

export const PRIORITY_LABEL: Record<SupportTicketPriority, string> = {
  URGENT: "Urgent",
  HIGH:   "High",
  NORMAL: "Normal",
  LOW:    "Low",
};

export const PRIORITY_TONE: Record<SupportTicketPriority, { dot: string; text: string }> = {
  URGENT: { dot: "var(--danger-fg)",      text: "var(--danger-fg)"    },
  HIGH:   { dot: "var(--warning-fg)",     text: "var(--warning-fg)"   },
  NORMAL: { dot: "var(--accent-primary)", text: "var(--text-default)" },
  LOW:    { dot: "var(--border-default)", text: "var(--text-muted)"   },
};

export const CATEGORY_LABEL: Record<SupportTicketCategory, string> = {
  BILLING:         "Billing",
  BUG:             "Bug",
  FEATURE_REQUEST: "Feature",
  QUESTION:        "Question",
  OTHER:           "Other",
};

export const CHANNEL_LABEL: Record<SupportTicketChannel, string> = {
  EMAIL:  "Email",
  CHAT:   "Chat",
  IN_APP: "In-app",
  PHONE:  "Phone",
  FORUM:  "Forum",
};

export const CHANNEL_ICON: Record<SupportTicketChannel, string> = {
  EMAIL:  "@",
  CHAT:   "💬",
  IN_APP: "◫",
  PHONE:  "☎",
  FORUM:  "❡",
};

export function FormError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <div
      className="rounded-md border px-3 py-2 text-[12px]"
      style={{
        borderColor: "var(--rose-200)",
        background: "var(--rose-50, var(--surface-2))",
        color: "var(--danger-fg)",
      }}
    >
      {msg}
    </div>
  );
}

export function FormOk({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <div
      className="rounded-md border px-3 py-2 text-[12px]"
      style={{
        borderColor: "var(--emerald-200)",
        background: "var(--emerald-50, var(--surface-2))",
        color: "var(--success-fg)",
      }}
    >
      {msg}
    </div>
  );
}

export const MODULE_LABEL: Record<SupportTicketModule, string> = {
  BILLING:      "Billing",
  AUTH:         "Auth",
  PROOFS:       "Proofs",
  ORDERS:       "Orders",
  INVOICES:     "Invoices",
  QUOTES:       "Quotes",
  PRODUCTS:     "Products",
  REPORTS:      "Reports",
  INTEGRATIONS: "Integrations",
  PORTAL:       "Portal",
  EMAIL:        "Email",
  ADMIN:        "Admin",
  OTHER:        "Other",
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

export function StatusPill({ status }: { status: SupportTicketStatus }) {
  const palette = STATUS_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: palette.bg, color: palette.fg }}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityChip({ priority }: { priority: SupportTicketPriority }) {
  const palette = PRIORITY_TONE[priority];
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide"
          style={{ color: palette.text }}>
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: palette.dot }} />
      {PRIORITY_LABEL[priority]}
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

/** Format milliseconds as "12m", "3h", "2d". Returns "—" for null. */
export function formatDurationShort(ms: number | null): string {
  if (ms == null) return "—";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = mins / 60;
  if (hrs < 24) return `${hrs.toFixed(hrs < 10 ? 1 : 0)}h`;
  const days = hrs / 24;
  return `${days.toFixed(days < 10 ? 1 : 0)}d`;
}

/** Relative-time string (vs now). */
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
