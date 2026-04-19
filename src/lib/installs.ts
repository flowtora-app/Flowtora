import type {
  InstallEventKind,
  InstallEventStatus,
  InstallIssueSeverity,
  InstallIssueStatus,
  InstallPhotoPhase,
  InstallSignerRole,
  PermitStatus,
} from "@prisma/client";

// ────────────────────────────────────────────────────────────
// Kinds
// ────────────────────────────────────────────────────────────

export const INSTALL_KINDS: { value: InstallEventKind; label: string; color: string }[] = [
  { value: "SURVEY",   label: "Site survey", color: "#6366f1" }, // indigo
  { value: "INSTALL",  label: "Install",     color: "#10b981" }, // green
  { value: "SERVICE",  label: "Service",     color: "#f59e0b" }, // amber
  // Phase 13 — final-mile fulfillment.
  { value: "DELIVERY", label: "Delivery",    color: "#0ea5e9" }, // sky
  { value: "PICKUP",   label: "Pickup",      color: "#a855f7" }, // violet
];

export function installKindLabel(k: InstallEventKind): string {
  return INSTALL_KINDS.find((x) => x.value === k)?.label ?? k;
}

export function installKindColor(k: InstallEventKind): string {
  return INSTALL_KINDS.find((x) => x.value === k)?.color ?? "#6b7280";
}

// ────────────────────────────────────────────────────────────
// Statuses
// ────────────────────────────────────────────────────────────

export const INSTALL_STATUSES: { value: InstallEventStatus; label: string; color: string }[] = [
  { value: "SCHEDULED",   label: "Scheduled",   color: "#6b7280" }, // gray
  { value: "CONFIRMED",   label: "Confirmed",   color: "#3b82f6" }, // blue
  { value: "IN_PROGRESS", label: "In progress", color: "#f59e0b" }, // amber
  { value: "COMPLETED",   label: "Completed",   color: "#10b981" }, // green
  { value: "CANCELED",    label: "Canceled",    color: "#9ca3af" }, // gray-light
  { value: "NO_SHOW",     label: "No-show",     color: "#ef4444" }, // red
];

export const OPEN_INSTALL_STATUSES: InstallEventStatus[] = ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"];

export function installStatusLabel(s: InstallEventStatus): string {
  return INSTALL_STATUSES.find((x) => x.value === s)?.label ?? s;
}

export function installStatusColor(s: InstallEventStatus): string {
  return INSTALL_STATUSES.find((x) => x.value === s)?.color ?? "#6b7280";
}

// Transition matrix — allowed next-states from each current state.
// Scheduling is more forgiving than production status, so most edges are open.
export const INSTALL_TRANSITIONS: Record<InstallEventStatus, InstallEventStatus[]> = {
  SCHEDULED:   ["CONFIRMED", "IN_PROGRESS", "CANCELED", "NO_SHOW"],
  CONFIRMED:   ["SCHEDULED", "IN_PROGRESS", "CANCELED", "NO_SHOW"],
  IN_PROGRESS: ["COMPLETED", "SCHEDULED", "CANCELED"],
  COMPLETED:   ["IN_PROGRESS"],
  CANCELED:    ["SCHEDULED"],
  NO_SHOW:     ["SCHEDULED"],
};

// ────────────────────────────────────────────────────────────
// Date helpers — calendar grid math
// ────────────────────────────────────────────────────────────

/** Midnight of the given date, in local time. */
export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** The Monday (00:00) on or before the given date. Week starts Monday. */
export function startOfWeekMonday(d: Date): Date {
  const x = startOfDay(d);
  // JS: 0=Sun, 1=Mon, ... 6=Sat. Convert to Monday-based offset.
  const offset = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - offset);
  return x;
}

export function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

/** 7 consecutive days starting at `start`. */
export function weekDays(start: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Same calendar day in local time? */
export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDayHeader(d: Date): { dow: string; date: string } {
  return {
    dow: DOW_SHORT[d.getDay()],
    date: `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`,
  };
}

export function formatTimeRange(start: Date, end: Date): string {
  const fmt = (d: Date) => {
    const h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? "pm" : "am";
    const hh = ((h + 11) % 12) + 1;
    return m === 0 ? `${hh}${ampm}` : `${hh}:${m.toString().padStart(2, "0")}${ampm}`;
  };
  return `${fmt(start)}–${fmt(end)}`;
}

/** Duration in minutes, min 0. */
export function durationMinutes(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

// Format a Date as `YYYY-MM-DDTHH:mm` suitable for a <input type="datetime-local"> defaultValue.
// Uses local time (not UTC) — the schedule is viewed in the tenant user's local browser timezone.
export function toLocalInputValue(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ────────────────────────────────────────────────────────────
// Phase 13 — field evidence metadata
// ────────────────────────────────────────────────────────────

export const PHOTO_PHASES: {
  value: InstallPhotoPhase;
  label: string;
  hint: string;
}[] = [
  { value: "BEFORE", label: "Before",   hint: "Site condition on arrival — wall, existing signage, clearance." },
  { value: "DURING", label: "In progress", hint: "Work-in-progress, unexpected conditions, rough fit." },
  { value: "AFTER",  label: "After",    hint: "Final installed result — customer-facing, one wide + one closeup." },
  { value: "ISSUE",  label: "Issue",    hint: "Attached to a reported problem — damage, missing part, site blocker." },
  { value: "SURVEY", label: "Survey",   hint: "Measurement references and site-survey evidence." },
];

export function photoPhaseLabel(p: InstallPhotoPhase): string {
  return PHOTO_PHASES.find((x) => x.value === p)?.label ?? p;
}

export const INSTALL_ISSUE_SEVERITIES: {
  value: InstallIssueSeverity;
  label: string;
  color: string;
  blocksByDefault: boolean;
}[] = [
  { value: "LOW",     label: "Low",     color: "#64748b", blocksByDefault: false }, // slate
  { value: "MEDIUM",  label: "Medium",  color: "#f59e0b", blocksByDefault: false }, // amber
  { value: "HIGH",    label: "High",    color: "#ef4444", blocksByDefault: false }, // red
  { value: "BLOCKER", label: "Blocker", color: "#b91c1c", blocksByDefault: true  }, // dark red
];

export function issueSeverityMeta(s: InstallIssueSeverity) {
  return INSTALL_ISSUE_SEVERITIES.find((x) => x.value === s)!;
}

export const INSTALL_ISSUE_STATUSES: { value: InstallIssueStatus; label: string; color: string }[] = [
  { value: "OPEN",         label: "Open",         color: "#ef4444" },
  { value: "ACKNOWLEDGED", label: "Acknowledged", color: "#f59e0b" },
  { value: "RESOLVED",     label: "Resolved",     color: "#10b981" },
];

export function issueStatusMeta(s: InstallIssueStatus) {
  return INSTALL_ISSUE_STATUSES.find((x) => x.value === s)!;
}

export const INSTALL_SIGNER_ROLES: { value: InstallSignerRole; label: string }[] = [
  { value: "CUSTOMER",  label: "Customer" },
  { value: "INSTALLER", label: "Installer" },
  { value: "WITNESS",   label: "Witness" },
];

export const PERMIT_STATUSES: { value: PermitStatus; label: string; color: string }[] = [
  { value: "NONE",     label: "Not required", color: "#64748b" },
  { value: "NEEDED",   label: "Needed",       color: "#f59e0b" },
  { value: "APPLIED",  label: "Applied",      color: "#3b82f6" },
  { value: "APPROVED", label: "Approved",     color: "#10b981" },
  { value: "REJECTED", label: "Rejected",     color: "#ef4444" },
  { value: "EXPIRED",  label: "Expired",      color: "#991b1b" },
];

export function permitStatusMeta(p: PermitStatus) {
  return PERMIT_STATUSES.find((x) => x.value === p)!;
}

// ────────────────────────────────────────────────────────────
// Phase 13 — readiness checks
// ────────────────────────────────────────────────────────────
//
// "Is this install actually ready to dispatch?" A dispatcher looking at the
// calendar has questions that the event row alone can't answer: did the
// deposit land, did production finish, was the site surveyed, does anyone
// have the address. Readiness collects those into a single object the UI
// can render as a row of pass/warn chips.
//
// We keep the checks generic over the input shape — the install detail page
// and the field page both call this with subtly different data. The input
// is whatever the caller has on hand; unknowns count as "not-applicable"
// rather than failing closed.

export type ReadinessLevel = "ok" | "warn" | "fail" | "skip";

export interface ReadinessCheck {
  id: string;
  label: string;
  level: ReadinessLevel;
  detail?: string;
  // Where the user should click to address this gap, if any.
  fixHref?: string;
}

export interface ReadinessInput {
  kind: InstallEventKind;
  status: InstallEventStatus;
  hasInstaller: boolean;
  crewCount: number;
  hasAddress: boolean;
  hasGps?: boolean;
  // Order/production context — each can be `null` to mean "not applicable".
  orderStatus?: string | null;
  productionCompleteRatio?: number | null; // 0..1, null = no stages
  // Evidence context — photos/signatures already captured (for past-due
  // events or status==COMPLETED, these matter more).
  photoCount?: number;
  beforePhotoCount?: number;
  afterPhotoCount?: number;
  signatureCount?: number;
  // Finance gates.
  orderHasDeposit?: boolean | null; // null = rule not enforced
  // Survey context (INSTALL kind).
  hasSurvey?: boolean | null;
  permitStatus?: PermitStatus | null;
  // Open issue counts (blockers are the important one).
  openBlockerCount?: number;
  openIssueCount?: number;
  // Evidence expectations — callers can waive them for small jobs.
  evidenceWaived?: boolean;
}

/**
 * Compute the readiness picture for an install event.
 *
 * Rules are deliberately conservative — we'd rather warn the dispatcher
 * than silently pass a half-ready event. Checks that aren't applicable
 * (e.g. "deposit paid" on a SURVEY) emit a `skip` so the UI can decide
 * whether to show them greyed out.
 */
export function computeReadiness(i: ReadinessInput): {
  checks: ReadinessCheck[];
  okCount: number;
  warnCount: number;
  failCount: number;
  overall: ReadinessLevel;
} {
  const checks: ReadinessCheck[] = [];
  const isFulfillment = i.kind === "INSTALL" || i.kind === "DELIVERY";
  const isSurvey      = i.kind === "SURVEY";
  const isDone        = i.status === "COMPLETED";

  // Assignment.
  checks.push({
    id: "assignment",
    label: "Crew assigned",
    level: i.hasInstaller || i.crewCount > 0 ? "ok" : "warn",
    detail: i.hasInstaller
      ? (i.crewCount > 0 ? `Lead + ${i.crewCount} crew` : "Lead installer only")
      : i.crewCount > 0 ? `${i.crewCount} crew, no lead` : "No one on this event",
  });

  // Address.
  checks.push({
    id: "address",
    label: "Site address",
    level: i.hasAddress ? "ok" : "fail",
    detail: i.hasAddress ? undefined : "No address — field crew can't navigate.",
  });

  // Optional GPS pin.
  if (i.hasGps != null) {
    checks.push({
      id: "gps",
      label: "GPS pin",
      level: i.hasGps ? "ok" : "skip",
      detail: i.hasGps ? undefined : "Optional — enables one-tap navigation.",
    });
  }

  // Deposit gate — only meaningful for INSTALL when rules are enforced.
  if (i.kind === "INSTALL" && i.orderHasDeposit != null) {
    checks.push({
      id: "deposit",
      label: "Deposit received",
      level: i.orderHasDeposit ? "ok" : "fail",
      detail: i.orderHasDeposit ? undefined : "Deposit rule not yet satisfied.",
    });
  }

  // Production progress on INSTALL.
  if (i.kind === "INSTALL" && i.productionCompleteRatio != null) {
    const r = i.productionCompleteRatio;
    checks.push({
      id: "production",
      label: "Production complete",
      level: r >= 1 ? "ok" : r > 0.8 ? "warn" : "fail",
      detail: r >= 1
        ? "All stages done."
        : `${Math.round(r * 100)}% of stages complete.`,
    });
  }

  // Survey + permit for INSTALL.
  if (i.kind === "INSTALL") {
    if (i.hasSurvey != null) {
      checks.push({
        id: "survey",
        label: "Site surveyed",
        level: i.hasSurvey ? "ok" : "warn",
        detail: i.hasSurvey ? undefined : "No survey on file — consider scheduling one.",
      });
    }
    if (i.permitStatus && i.permitStatus !== "NONE") {
      const p = permitStatusMeta(i.permitStatus);
      checks.push({
        id: "permit",
        label: "Permit",
        level: i.permitStatus === "APPROVED" ? "ok" :
               i.permitStatus === "REJECTED" || i.permitStatus === "EXPIRED" ? "fail" : "warn",
        detail: p.label,
      });
    }
  }

  // Open issues — BLOCKER-severity blocks everything.
  if ((i.openBlockerCount ?? 0) > 0) {
    checks.push({
      id: "blockers",
      label: "No blocking issues",
      level: "fail",
      detail: `${i.openBlockerCount} open blocker${i.openBlockerCount === 1 ? "" : "s"}`,
    });
  } else if ((i.openIssueCount ?? 0) > 0) {
    checks.push({
      id: "issues",
      label: "No open issues",
      level: "warn",
      detail: `${i.openIssueCount} open issue${i.openIssueCount === 1 ? "" : "s"}`,
    });
  }

  // Evidence — only evaluated in the completion-adjacent window: once the
  // event is IN_PROGRESS or later and evidence hasn't been waived. For
  // SURVEY we look for a saved survey instead of photos; for pickups we
  // only require a signature.
  const evidenceRelevant =
    !i.evidenceWaived &&
    (i.status === "IN_PROGRESS" || isDone);
  if (evidenceRelevant) {
    if (isFulfillment) {
      const hasBefore = (i.beforePhotoCount ?? 0) > 0;
      const hasAfter  = (i.afterPhotoCount ?? 0) > 0;
      checks.push({
        id: "photos",
        label: "Before/after photos",
        level: hasBefore && hasAfter ? "ok" : hasAfter ? "warn" : "fail",
        detail: hasBefore && hasAfter
          ? undefined
          : hasAfter ? "Missing a BEFORE photo."
          : hasBefore ? "Missing an AFTER photo."
          : "No photos captured.",
      });
      checks.push({
        id: "signature",
        label: "Customer signature",
        level: (i.signatureCount ?? 0) > 0 ? "ok" : "warn",
        detail: (i.signatureCount ?? 0) > 0 ? undefined : "No signature on file.",
      });
    } else if (i.kind === "PICKUP") {
      checks.push({
        id: "signature",
        label: "Receipt signature",
        level: (i.signatureCount ?? 0) > 0 ? "ok" : "warn",
        detail: (i.signatureCount ?? 0) > 0 ? undefined : "No receipt signature.",
      });
    } else if (isSurvey) {
      checks.push({
        id: "survey-filed",
        label: "Survey saved",
        level: i.hasSurvey ? "ok" : "fail",
        detail: i.hasSurvey ? undefined : "Survey not yet saved.",
      });
    }
  }

  const okCount   = checks.filter((c) => c.level === "ok").length;
  const warnCount = checks.filter((c) => c.level === "warn").length;
  const failCount = checks.filter((c) => c.level === "fail").length;
  const overall: ReadinessLevel =
    failCount > 0 ? "fail" : warnCount > 0 ? "warn" : "ok";

  return { checks, okCount, warnCount, failCount, overall };
}

/**
 * Build a "maps.google" style URL for one-tap navigation on phones.
 * Prefers GPS coords when present; falls back to the address string.
 */
export function mapsHref(opts: {
  gpsLat?: number | null;
  gpsLng?: number | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
}): string | null {
  if (opts.gpsLat != null && opts.gpsLng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${opts.gpsLat},${opts.gpsLng}`;
  }
  const parts = [opts.addressLine1, opts.addressLine2, opts.city, opts.region, opts.postalCode, opts.country]
    .map((p) => (p ?? "").trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(parts.join(", "))}`;
}

/** Compact single-line address for display. Returns "" if entirely blank. */
export function formatAddress(opts: {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
}): string {
  const line1Parts = [opts.addressLine1, opts.addressLine2].filter(Boolean).join(" ");
  const cityRegion = [opts.city, opts.region].filter(Boolean).join(", ");
  const tail       = [opts.postalCode, opts.country].filter(Boolean).join(" ");
  return [line1Parts, cityRegion, tail].filter(Boolean).join(" · ");
}
