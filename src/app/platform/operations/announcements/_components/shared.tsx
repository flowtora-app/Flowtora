// Shared bits for the Announcements & Changelog admin.

import * as React from "react";
import type {
  AnnouncementType,
  AnnouncementPriority,
  AnnouncementStatus,
  AnnouncementAudience,
  AnnouncementChannel,
  AnnouncementFrequencyCap,
  ChangelogCategory,
} from "@prisma/client";

export const TYPE_LABEL: Record<AnnouncementType, string> = {
  RELEASE:     "Release",
  NEW_FEATURE: "New feature",
  MAINTENANCE: "Maintenance",
  INCIDENT:    "Incident",
  PRICING:     "Pricing",
  GENERAL:     "General",
};

export const TYPE_TONE: Record<AnnouncementType, { bg: string; fg: string }> = {
  RELEASE:     { bg: "var(--accent-surface)",  fg: "var(--accent-primary)" },
  NEW_FEATURE: { bg: "var(--accent-surface)",  fg: "var(--accent-primary)" },
  MAINTENANCE: { bg: "var(--warning-surface)", fg: "var(--warning-fg)"     },
  INCIDENT:    { bg: "var(--danger-surface, var(--surface-2))",  fg: "var(--danger-fg)" },
  PRICING:     { bg: "var(--warning-surface)", fg: "var(--warning-fg)"     },
  GENERAL:     { bg: "var(--surface-2)",       fg: "var(--text-muted)"     },
};

export const PRIORITY_LABEL: Record<AnnouncementPriority, string> = {
  INFO:      "Info",
  IMPORTANT: "Important",
  CRITICAL:  "Critical",
};

export const STATUS_LABEL: Record<AnnouncementStatus, string> = {
  DRAFT:     "Draft",
  SCHEDULED: "Scheduled",
  PUBLISHED: "Published",
  ARCHIVED:  "Archived",
};

export const STATUS_TONE: Record<AnnouncementStatus, { bg: string; fg: string }> = {
  DRAFT:     { bg: "var(--surface-2)",       fg: "var(--text-muted)"     },
  SCHEDULED: { bg: "var(--accent-surface)",  fg: "var(--accent-primary)" },
  PUBLISHED: { bg: "var(--success-surface)", fg: "var(--success-fg)"     },
  ARCHIVED:  { bg: "var(--surface-2)",       fg: "var(--text-faint)"     },
};

export const AUDIENCE_LABEL: Record<AnnouncementAudience, string> = {
  ALL:    "All tenants",
  PLAN:   "By plan",
  COHORT: "By cohort",
  TENANT: "Specific tenants",
};

export const CHANNEL_LABEL: Record<AnnouncementChannel, string> = {
  BANNER:    "In-app banner",
  MODAL:     "In-app modal",
  INBOX:     "In-app inbox",
  EMAIL:     "Email blast",
  CHANGELOG: "Changelog",
  PUSH:      "Push",
};

export const CHANNEL_ICON: Record<AnnouncementChannel, string> = {
  BANNER:    "▌",
  MODAL:     "◫",
  INBOX:     "✉",
  EMAIL:     "@",
  CHANGELOG: "≡",
  PUSH:      "🔔",
};

export const FREQUENCY_LABEL: Record<AnnouncementFrequencyCap, string> = {
  UNLIMITED: "Always show",
  ONCE:      "Once per user",
  DAILY:     "Once per user per day",
};

export const CHANGELOG_CATEGORY_LABEL: Record<ChangelogCategory, string> = {
  FEATURE:     "Feature",
  IMPROVEMENT: "Improvement",
  FIX:         "Fix",
  SECURITY:    "Security",
  DEPRECATION: "Deprecation",
};

export const CHANGELOG_CATEGORY_TONE: Record<ChangelogCategory, { bg: string; fg: string }> = {
  FEATURE:     { bg: "var(--accent-surface)",  fg: "var(--accent-primary)" },
  IMPROVEMENT: { bg: "var(--success-surface)", fg: "var(--success-fg)"     },
  FIX:         { bg: "var(--surface-2)",       fg: "var(--text-default)"   },
  SECURITY:    { bg: "var(--danger-surface, var(--surface-2))", fg: "var(--danger-fg)" },
  DEPRECATION: { bg: "var(--warning-surface)", fg: "var(--warning-fg)"     },
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

export function StatusPill({ status }: { status: AnnouncementStatus }) {
  const palette = STATUS_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: palette.bg, color: palette.fg }}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ChannelChip({ channel }: { channel: AnnouncementChannel }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
      style={{
        background: "var(--surface-2)",
        color: "var(--text-muted)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <span aria-hidden>{CHANNEL_ICON[channel]}</span>
      {CHANNEL_LABEL[channel]}
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
    saved: "Saved.",
    created: "Draft created.",
    transitioned: "Status updated.",
  };
  return (
    <div className="rounded-md border px-3 py-2 text-[12px]"
         style={{ borderColor: "var(--emerald-200)", background: "var(--emerald-50, var(--surface-2))", color: "var(--success-fg)" }}>
      {map[msg] ?? "Done."}
    </div>
  );
}

export function relativeFromNow(d: Date | null): string {
  if (!d) return "—";
  const ms = Date.now() - d.getTime();
  const future = ms < 0;
  const abs = Math.abs(ms);
  const mins = Math.round(abs / 60_000);
  const fmt = (label: string) => future ? `in ${label}` : `${label} ago`;
  if (mins < 1)  return future ? "soon" : "just now";
  if (mins < 60) return fmt(`${mins}m`);
  const hrs = Math.round(mins / 60);
  if (hrs < 24)  return fmt(`${hrs}h`);
  const days = Math.round(hrs / 24);
  if (days < 30) return fmt(`${days}d`);
  const months = Math.round(days / 30);
  return fmt(`${months}mo`);
}

export function formatDateTime(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
