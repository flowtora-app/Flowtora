// Shared bits for the Email Campaigns admin (Page 39).

import * as React from "react";
import type {
  EmailCampaignType,
  EmailCampaignStatus,
  EmailRecipientStatus,
} from "@prisma/client";

export const CAMPAIGN_TYPE_LABEL: Record<EmailCampaignType, string> = {
  ONE_OFF:   "One-off",
  RECURRING: "Recurring",
};

export const CAMPAIGN_STATUS_LABEL: Record<EmailCampaignStatus, string> = {
  DRAFT:     "Draft",
  SCHEDULED: "Scheduled",
  SENDING:   "Sending",
  SENT:      "Sent",
  PAUSED:    "Paused",
  ARCHIVED:  "Archived",
};

export const CAMPAIGN_STATUS_TONE: Record<EmailCampaignStatus, { bg: string; fg: string }> = {
  DRAFT:     { bg: "var(--surface-2)",       fg: "var(--text-muted)" },
  SCHEDULED: { bg: "var(--accent-surface)",  fg: "var(--accent-primary)" },
  SENDING:   { bg: "var(--warning-surface)", fg: "var(--warning-fg)" },
  SENT:      { bg: "var(--success-surface)", fg: "var(--success-fg)" },
  PAUSED:    { bg: "var(--surface-2)",       fg: "var(--warning-fg)" },
  ARCHIVED:  { bg: "var(--surface-2)",       fg: "var(--text-faint)" },
};

export const RECIPIENT_STATUS_LABEL: Record<EmailRecipientStatus, string> = {
  QUEUED:       "Queued",
  SENT:         "Sent",
  DELIVERED:    "Delivered",
  OPENED:       "Opened",
  CLICKED:      "Clicked",
  BOUNCED:      "Bounced",
  UNSUBSCRIBED: "Unsubscribed",
  COMPLAINED:   "Complained",
  FAILED:       "Failed",
};

export const RECIPIENT_STATUS_TONE: Record<EmailRecipientStatus, { bg: string; fg: string }> = {
  QUEUED:       { bg: "var(--surface-2)",       fg: "var(--text-muted)" },
  SENT:         { bg: "var(--accent-surface)",  fg: "var(--accent-primary)" },
  DELIVERED:    { bg: "var(--accent-surface)",  fg: "var(--accent-primary)" },
  OPENED:       { bg: "var(--success-surface)", fg: "var(--success-fg)" },
  CLICKED:      { bg: "var(--success-surface)", fg: "var(--success-fg)" },
  BOUNCED:      { bg: "var(--rose-50, var(--surface-2))", fg: "var(--danger-fg)" },
  UNSUBSCRIBED: { bg: "var(--surface-2)",       fg: "var(--warning-fg)" },
  COMPLAINED:   { bg: "var(--rose-50, var(--surface-2))", fg: "var(--danger-fg)" },
  FAILED:       { bg: "var(--rose-50, var(--surface-2))", fg: "var(--danger-fg)" },
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

export function StatusPill({ status }: { status: EmailCampaignStatus }) {
  const tone = CAMPAIGN_STATUS_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: tone.bg, color: tone.fg }}>
      {CAMPAIGN_STATUS_LABEL[status]}
    </span>
  );
}

export function RecipientPill({ status }: { status: EmailRecipientStatus }) {
  const tone = RECIPIENT_STATUS_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: tone.bg, color: tone.fg }}>
      {RECIPIENT_STATUS_LABEL[status]}
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
