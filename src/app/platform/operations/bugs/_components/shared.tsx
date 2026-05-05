// Shared bits for the Bug Reports admin (Page 37).

import * as React from "react";
import type {
  BugSeverity,
  BugStatus,
  BugEnvironment,
  BugFrequency,
  SupportTicketModule,
} from "@prisma/client";

export const SEVERITY_LABEL: Record<BugSeverity, string> = {
  SEV1: "SEV1", SEV2: "SEV2", SEV3: "SEV3", SEV4: "SEV4",
};

export const SEVERITY_TONE: Record<BugSeverity, { bg: string; fg: string; border?: string }> = {
  SEV1: { bg: "var(--rose-50, var(--surface-2))",  fg: "var(--danger-fg)",  border: "var(--rose-200)" },
  SEV2: { bg: "var(--warning-surface)",            fg: "var(--warning-fg)" },
  SEV3: { bg: "var(--accent-surface)",             fg: "var(--accent-primary)" },
  SEV4: { bg: "var(--surface-2)",                  fg: "var(--text-muted)" },
};

export const SEVERITY_DESC: Record<BugSeverity, string> = {
  SEV1: "Outage / data loss",
  SEV2: "Major feature broken — no clean workaround",
  SEV3: "Limited / cosmetic with workaround",
  SEV4: "Polish / typo",
};

export const STATUS_LABEL: Record<BugStatus, string> = {
  NEW:         "New",
  TRIAGED:     "Triaged",
  IN_PROGRESS: "In progress",
  IN_REVIEW:   "In review",
  RESOLVED:    "Resolved",
  RELEASED:    "Released",
  WONT_FIX:    "Won't fix",
  DUPLICATE:   "Duplicate",
};

export const STATUS_TONE: Record<BugStatus, { bg: string; fg: string }> = {
  NEW:         { bg: "var(--accent-surface)",  fg: "var(--accent-primary)" },
  TRIAGED:     { bg: "var(--warning-surface)", fg: "var(--warning-fg)" },
  IN_PROGRESS: { bg: "var(--warning-surface)", fg: "var(--warning-fg)" },
  IN_REVIEW:   { bg: "var(--accent-surface)",  fg: "var(--accent-primary)" },
  RESOLVED:    { bg: "var(--success-surface)", fg: "var(--success-fg)" },
  RELEASED:    { bg: "var(--success-surface)", fg: "var(--success-fg)" },
  WONT_FIX:    { bg: "var(--surface-2)",       fg: "var(--text-faint)" },
  DUPLICATE:   { bg: "var(--surface-2)",       fg: "var(--text-faint)" },
};

export const ENV_LABEL: Record<BugEnvironment, string> = {
  PRODUCTION: "Production",
  STAGING:    "Staging",
  SANDBOX:    "Sandbox",
};

export const FREQ_LABEL: Record<BugFrequency, string> = {
  ALWAYS:    "Always",
  OFTEN:     "Often",
  SOMETIMES: "Sometimes",
  RARE:      "Rare",
};

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

export function SeverityPill({ severity }: { severity: BugSeverity }) {
  const tone = SEVERITY_TONE[severity];
  return (
    <span
      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{
        background: tone.bg,
        color: tone.fg,
        border: tone.border ? `1px solid ${tone.border}` : undefined,
      }}
      title={SEVERITY_DESC[severity]}
    >
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

export function StatusPill({ status }: { status: BugStatus }) {
  const tone = STATUS_TONE[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: tone.bg, color: tone.fg }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function EnvBadge({ env }: { env: BugEnvironment }) {
  const tone =
    env === "PRODUCTION" ? { bg: "var(--rose-50, var(--surface-2))", fg: "var(--danger-fg)" } :
    env === "STAGING"    ? { bg: "var(--warning-surface)",           fg: "var(--warning-fg)" } :
                            { bg: "var(--surface-2)",                fg: "var(--text-muted)" };
  return (
    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
          style={{ background: tone.bg, color: tone.fg }}>
      {ENV_LABEL[env]}
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
