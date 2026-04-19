import type { BlockerReason, OrderPriority, OrderStatus } from "@prisma/client";

export const ORDER_STATUSES: { value: OrderStatus; label: string; color: string }[] = [
  { value: "NEW",             label: "New",             color: "#6b7280" },
  { value: "IN_PRODUCTION",   label: "In production",   color: "#3b82f6" },
  { value: "READY",           label: "Ready",           color: "#8b5cf6" },
  { value: "OUT_FOR_INSTALL", label: "Out for install", color: "#f59e0b" },
  { value: "COMPLETED",       label: "Completed",       color: "#10b981" },
  { value: "CANCELED",        label: "Canceled",        color: "#ef4444" },
];

export function statusLabel(s: OrderStatus): string {
  return ORDER_STATUSES.find((x) => x.value === s)?.label ?? s;
}
export function statusColor(s: OrderStatus): string {
  return ORDER_STATUSES.find((x) => x.value === s)?.color ?? "#6b7280";
}

// Statuses that count as "active" production work — used on dashboard.
export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  "NEW",
  "IN_PRODUCTION",
  "READY",
  "OUT_FOR_INSTALL",
];

// Permitted transitions. READY can go back to IN_PRODUCTION if something fails QC.
// Any non-terminal status can be canceled.
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW:             ["IN_PRODUCTION", "CANCELED"],
  IN_PRODUCTION:   ["READY", "CANCELED"],
  READY:           ["OUT_FOR_INSTALL", "COMPLETED", "IN_PRODUCTION", "CANCELED"],
  OUT_FOR_INSTALL: ["COMPLETED", "READY", "CANCELED"],
  COMPLETED:       [],
  CANCELED:        ["NEW"],
};

// Phase 10 — priority meta. RUSH uses the same red as CANCELED so the
// shop floor immediately sees it; HIGH is amber; NORMAL is neutral and
// intentionally muted (the default shouldn't pull the eye).
export const ORDER_PRIORITIES: { value: OrderPriority; label: string; color: string }[] = [
  { value: "NORMAL", label: "Normal", color: "#6b7280" },
  { value: "HIGH",   label: "High",   color: "#f59e0b" },
  { value: "RUSH",   label: "Rush",   color: "#ef4444" },
];

export function priorityLabel(p: OrderPriority): string {
  return ORDER_PRIORITIES.find((x) => x.value === p)?.label ?? p;
}
export function priorityColor(p: OrderPriority): string {
  return ORDER_PRIORITIES.find((x) => x.value === p)?.color ?? "#6b7280";
}

// Phase 10 — blocker reason meta. Matches the BLOCKER_LABEL in approvals.ts
// (the gate uses lowercase for mid-sentence rendering; the UI uses these
// Title-Case labels for chips and dropdowns).
export const BLOCKER_REASONS: { value: BlockerReason; label: string }[] = [
  { value: "AWAITING_CUSTOMER",  label: "Awaiting customer"  },
  { value: "AWAITING_APPROVAL",  label: "Awaiting approval"  },
  { value: "AWAITING_MATERIALS", label: "Awaiting materials" },
  { value: "AWAITING_PROOF",     label: "Awaiting proof"     },
  { value: "AWAITING_PAYMENT",   label: "Awaiting payment"   },
  { value: "CUSTOM",             label: "Custom"             },
];

export function blockerReasonLabel(r: BlockerReason): string {
  return BLOCKER_REASONS.find((x) => x.value === r)?.label ?? r;
}
