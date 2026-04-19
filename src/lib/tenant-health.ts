// Phase 1 — Core SaaS Foundation — tenant health scoring.
//
// Purpose: every surface that lists tenants (platform dashboard, tenants
// table, detail page) needs a single "how is this shop doing" read. Rather
// than sprinkle bespoke aggregations across each page, we centralise the
// rules here and hand back a shape every caller can render.
//
// A tenant's health combines:
//   • status         (TRIAL / ACTIVE / PAST_DUE / SUSPENDED / CANCELED / ARCHIVED)
//   • last activity  (denormalized via lastActivityAt)
//   • trial clock    (trialEndsAt vs now, if TRIAL)
//   • billing clock  (status PAST_DUE forces attention regardless of usage)
//
// Output:
//   level:  "healthy" | "attention" | "at-risk" | "critical" | "dormant"
//   signals: human-readable bullet points the detail page can render
//   daysInactive, daysUntilTrialEnd, isPaying — raw scalars for chips
//
// The rules are deliberately conservative — false negatives (not flagging
// a tenant that's about to churn) are worse than false positives, because
// platform staff can always ignore a yellow dot, whereas a missed red
// tenant is a renewal we forfeited.

import type { Tenant, TenantStatus, TenantEnvironment } from "@prisma/client";

export type HealthLevel = "healthy" | "attention" | "at-risk" | "critical" | "dormant";

export type TenantHealth = {
  level: HealthLevel;
  label: string;           // short label for badge, e.g. "Trial ends in 2d"
  signals: string[];       // longer bullets for tooltips / detail panels
  daysInactive: number;    // floor, from lastActivityAt or createdAt
  daysUntilTrialEnd: number | null; // null if not TRIAL or no trialEndsAt
  isPaying: boolean;       // ACTIVE status and LIVE environment
};

// Subset of Tenant fields we actually read — lets callers pass a narrowed
// `select` result instead of a full Tenant row.
export type TenantHealthInput = Pick<
  Tenant,
  | "status"
  | "environment"
  | "trialEndsAt"
  | "lastActivityAt"
  | "createdAt"
  | "stripeSubscriptionId"
>;

const DAY_MS = 1000 * 60 * 60 * 24;

export function computeTenantHealth(t: TenantHealthInput, now = new Date()): TenantHealth {
  const signals: string[] = [];
  const lastActivity = t.lastActivityAt ?? t.createdAt;
  const daysInactive = Math.max(0, Math.floor((now.getTime() - lastActivity.getTime()) / DAY_MS));

  const daysUntilTrialEnd =
    t.status === "TRIAL" && t.trialEndsAt
      ? Math.ceil((t.trialEndsAt.getTime() - now.getTime()) / DAY_MS)
      : null;

  const isPaying = t.status === "ACTIVE" && t.environment === "LIVE";

  // ── Decide level in strict priority order. Each branch returns — no
  // cascading signals, so a SUSPENDED tenant doesn't also report "trial
  // ending".
  if (t.status === "SUSPENDED") {
    signals.push("Workspace is suspended — owner cannot sign in.");
    return { level: "critical", label: "Suspended", signals, daysInactive, daysUntilTrialEnd, isPaying };
  }
  if (t.status === "CANCELED") {
    signals.push("Subscription canceled — access remains until billing period ends.");
    return { level: "critical", label: "Canceled", signals, daysInactive, daysUntilTrialEnd, isPaying };
  }
  if (t.status === "ARCHIVED") {
    signals.push("Tenant archived — data retained for the restore window.");
    return { level: "dormant", label: "Archived", signals, daysInactive, daysUntilTrialEnd, isPaying };
  }
  if (t.status === "PAST_DUE") {
    signals.push("Billing past due — subscription will be suspended if not resolved.");
    return { level: "at-risk", label: "Past due", signals, daysInactive, daysUntilTrialEnd, isPaying };
  }

  if (t.status === "TRIAL") {
    if (daysUntilTrialEnd != null) {
      if (daysUntilTrialEnd <= 0) {
        signals.push("Trial has ended — tenant has not converted to paid.");
        return { level: "critical", label: "Trial expired", signals, daysInactive, daysUntilTrialEnd, isPaying };
      }
      if (daysUntilTrialEnd <= 3) {
        signals.push(`Trial ends in ${daysUntilTrialEnd}d — outreach window.`);
        return { level: "at-risk", label: `Trial ends in ${daysUntilTrialEnd}d`, signals, daysInactive, daysUntilTrialEnd, isPaying };
      }
      if (daysUntilTrialEnd <= 7) {
        signals.push(`Trial ends in ${daysUntilTrialEnd}d.`);
        return { level: "attention", label: `Trial ends in ${daysUntilTrialEnd}d`, signals, daysInactive, daysUntilTrialEnd, isPaying };
      }
      signals.push(`Trial — ${daysUntilTrialEnd}d remaining.`);
    } else {
      signals.push("Trial with no end date set — treat as evaluation.");
    }
    // Fall through to activity check, still TRIAL.
  }

  // Active customer (or trial with comfortable runway) — activity becomes
  // the dominant signal.
  if (daysInactive >= 60) {
    signals.push(`No activity in ${daysInactive} days — likely dormant.`);
    return { level: "dormant", label: `Dormant ${daysInactive}d`, signals, daysInactive, daysUntilTrialEnd, isPaying };
  }
  if (daysInactive >= 30) {
    signals.push(`No activity in ${daysInactive} days — check in.`);
    return { level: "at-risk", label: `Quiet ${daysInactive}d`, signals, daysInactive, daysUntilTrialEnd, isPaying };
  }
  if (daysInactive >= 14) {
    signals.push(`No activity in ${daysInactive} days.`);
    return { level: "attention", label: `Quiet ${daysInactive}d`, signals, daysInactive, daysUntilTrialEnd, isPaying };
  }

  if (t.status === "TRIAL") {
    return { level: "attention", label: "On trial", signals, daysInactive, daysUntilTrialEnd, isPaying };
  }

  signals.push("Active and on time.");
  return { level: "healthy", label: "Healthy", signals, daysInactive, daysUntilTrialEnd, isPaying };
}

/** Tailwind/CSS token map for rendering a health dot or chip. */
export function healthColor(level: HealthLevel): { bg: string; fg: string } {
  switch (level) {
    case "healthy":   return { bg: "var(--success-surface)", fg: "var(--success-fg)" };
    case "attention": return { bg: "var(--accent-surface)",  fg: "var(--accent-primary)" };
    case "at-risk":   return { bg: "var(--warning-surface)", fg: "var(--warning-fg)" };
    case "critical":  return { bg: "var(--danger-surface)",  fg: "var(--danger-fg)" };
    case "dormant":   return { bg: "var(--surface-2)",       fg: "var(--text-muted)" };
  }
}

/** Chip/ribbon color map for the environment badge. */
export function environmentColor(env: TenantEnvironment): { bg: string; fg: string; label: string } {
  switch (env) {
    case "LIVE": return { bg: "var(--success-surface)", fg: "var(--success-fg)",    label: "Live" };
    case "DEMO": return { bg: "var(--accent-surface)",  fg: "var(--accent-primary)", label: "Demo" };
    case "TEST": return { bg: "var(--warning-surface)", fg: "var(--warning-fg)",    label: "Test" };
  }
}

/** Tenant statuses to exclude from routine platform list views. */
export function isTenantArchivedStatus(status: TenantStatus): boolean {
  return status === "ARCHIVED";
}
