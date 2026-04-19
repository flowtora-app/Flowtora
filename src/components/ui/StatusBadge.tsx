import * as React from "react";
import { Badge, type BadgeProps } from "./Badge";

// StatusBadge — unified status pill that maps entity status enums to
// semantic tones. Everywhere in the app we had scattered statusLabel /
// statusColor helpers using hardcoded hex; this component is the
// single replacement.
//
// Why a component and not just a tone-mapper function? Because callers
// consistently want: pill + label + dot + theme-aware coloring. Rolling
// it into one component means nobody has to remember to call both
// helpers and wire them through Badge by hand.
//
// The tone mappings encode the team's mental model: terminal success
// states are green, terminal failure states are red, in-flight states
// are blue/accent, and waiting states are warning/amber.

type Kind = "quote" | "order" | "invoice" | "lead" | "task" | "install" | "support";

type Tone = NonNullable<BadgeProps["tone"]>;

// Quote status → tone
const QUOTE_TONE: Record<string, Tone> = {
  DRAFT:    "neutral",
  SENT:     "info",
  VIEWED:   "accent",
  APPROVED: "success",
  DECLINED: "danger",
  EXPIRED:  "neutral",
};
const QUOTE_LABEL: Record<string, string> = {
  DRAFT: "Draft", SENT: "Sent", VIEWED: "Viewed",
  APPROVED: "Approved", DECLINED: "Declined", EXPIRED: "Expired",
};

// Order status → tone
const ORDER_TONE: Record<string, Tone> = {
  NEW:             "neutral",
  IN_PRODUCTION:   "info",
  READY:           "accent",
  OUT_FOR_INSTALL: "warning",
  COMPLETED:       "success",
  CANCELED:        "danger",
};
const ORDER_LABEL: Record<string, string> = {
  NEW: "New", IN_PRODUCTION: "In production", READY: "Ready",
  OUT_FOR_INSTALL: "Out for install", COMPLETED: "Completed", CANCELED: "Canceled",
};

// Invoice status → tone
const INVOICE_TONE: Record<string, Tone> = {
  DRAFT:       "neutral",
  SENT:        "info",
  PARTIAL:     "warning",
  PAID:        "success",
  OVERDUE:     "danger",
  VOID:        "neutral",
  WRITTEN_OFF: "neutral",
};
const INVOICE_LABEL: Record<string, string> = {
  DRAFT: "Draft", SENT: "Sent", PARTIAL: "Partial", PAID: "Paid",
  OVERDUE: "Overdue", VOID: "Void", WRITTEN_OFF: "Written off",
};

// Lead stage → tone (kanban uses stage, not status, but same idea)
const LEAD_TONE: Record<string, Tone> = {
  NEW:          "neutral",
  CONTACTED:    "info",
  QUALIFIED:    "accent",
  PROPOSAL:     "accent",
  WON:          "success",
  LOST:         "danger",
  DISQUALIFIED: "neutral",
};

// Task status → tone
const TASK_TONE: Record<string, Tone> = {
  OPEN:        "accent",
  IN_PROGRESS: "info",
  BLOCKED:     "warning",
  DONE:        "success",
  CANCELED:    "neutral",
};

// Install event status → tone
const INSTALL_TONE: Record<string, Tone> = {
  SCHEDULED:  "info",
  EN_ROUTE:   "accent",
  ON_SITE:    "warning",
  COMPLETED:  "success",
  CANCELED:   "danger",
  NO_SHOW:    "danger",
  RESCHEDULE: "warning",
};

// Support ticket status → tone
const SUPPORT_TONE: Record<string, Tone> = {
  OPEN:        "accent",
  IN_PROGRESS: "info",
  WAITING:     "warning",
  RESOLVED:    "success",
  CLOSED:      "neutral",
};

const KIND_TONES: Record<Kind, Record<string, Tone>> = {
  quote: QUOTE_TONE,
  order: ORDER_TONE,
  invoice: INVOICE_TONE,
  lead: LEAD_TONE,
  task: TASK_TONE,
  install: INSTALL_TONE,
  support: SUPPORT_TONE,
};

const KIND_LABELS: Record<Kind, Record<string, string> | null> = {
  quote: QUOTE_LABEL,
  order: ORDER_LABEL,
  invoice: INVOICE_LABEL,
  lead: null,
  task: null,
  install: null,
  support: null,
};

function humanize(s: string): string {
  return s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface StatusBadgeProps extends Omit<BadgeProps, "tone" | "children"> {
  kind: Kind;
  status: string;
  /** Override the default label (useful for "Overdue · 3d" style suffixes). */
  label?: React.ReactNode;
  /** Default true — shows the colored dot for at-a-glance scanning. */
  dot?: boolean;
}

export function StatusBadge({
  kind,
  status,
  label,
  dot = true,
  size = "sm",
  ...rest
}: StatusBadgeProps) {
  const tone = KIND_TONES[kind]?.[status] ?? "neutral";
  const mapped = KIND_LABELS[kind]?.[status];
  const resolvedLabel = label ?? mapped ?? humanize(status);
  return (
    <Badge tone={tone} size={size} dot={dot} {...rest}>
      {resolvedLabel}
    </Badge>
  );
}
