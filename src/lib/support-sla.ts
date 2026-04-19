// Phase 20 Slice C — support ticket SLA helpers.
//
// SLA targets are wall-clock deadlines: when a ticket opens (or the customer
// posts a reply that kicks it back to the platform queue) we stamp `dueBy`
// at now() + the priority's target window. A staff reply clears the clock
// until the customer next replies.

import type { SupportTicketPriority, SupportTicketStatus } from "@prisma/client";

// Response targets, in hours, keyed by priority. Business-day math would
// complicate this without much benefit at our scale — if a ticket opens at
// 6pm on Friday we'd rather the queue flag it red on Monday morning than
// silently give us 72 extra hours.
const TARGET_HOURS: Record<SupportTicketPriority, number> = {
  URGENT: 4,
  HIGH:   24,
  NORMAL: 72,
  LOW:    24 * 7,
};

export function slaTargetHours(priority: SupportTicketPriority): number {
  return TARGET_HOURS[priority];
}

export function computeDueBy(
  priority: SupportTicketPriority,
  from: Date = new Date(),
): Date {
  return new Date(from.getTime() + TARGET_HOURS[priority] * 3600 * 1000);
}

// Ticket states where the SLA clock is irrelevant — resolved/closed tickets
// don't page anyone, and WAITING_CUSTOMER means the ball is in their court.
const INACTIVE_STATUSES: SupportTicketStatus[] = ["RESOLVED", "CLOSED", "WAITING_CUSTOMER"];

export function isSlaActive(status: SupportTicketStatus): boolean {
  return !INACTIVE_STATUSES.includes(status);
}

export type SlaChip = {
  label: string;
  tone: "ok" | "warn" | "danger" | "muted";
};

// Produce a user-facing chip describing the SLA state. We choose thresholds
// to give platform staff a useful "warm" band — anything inside 25% of the
// remaining target is yellow so they see it before it goes red.
export function slaChip(args: {
  dueBy: Date | null;
  status: SupportTicketStatus;
  firstStaffReplyAt: Date | null;
  now?: Date;
}): SlaChip | null {
  const now = args.now ?? new Date();

  // Once the platform team has responded at least once and the ticket is
  // resting in WAITING_CUSTOMER / RESOLVED / CLOSED, stop showing a chip —
  // there's nothing to pace against.
  if (!isSlaActive(args.status)) {
    if (args.firstStaffReplyAt) {
      return { label: "responded", tone: "muted" };
    }
    return null;
  }

  if (!args.dueBy) return null;

  const msLeft = args.dueBy.getTime() - now.getTime();
  if (msLeft <= 0) {
    return { label: `overdue ${formatDuration(-msLeft)}`, tone: "danger" };
  }

  // Inside the last 25% of the window? Warn. Otherwise OK.
  // We don't know the original target here, but "< 2 hours left" is a safe
  // practical warn threshold that works for every priority.
  if (msLeft < 2 * 3600 * 1000) {
    return { label: `due in ${formatDuration(msLeft)}`, tone: "warn" };
  }
  return { label: `due in ${formatDuration(msLeft)}`, tone: "ok" };
}

// Compact "2h", "1d 4h", "15m" formatting. Keeps the queue chip small.
export function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  if (hours < 24) {
    const mins = totalMin % 60;
    return mins ? `${hours}h ${mins}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest ? `${days}d ${rest}h` : `${days}d`;
}

export function slaChipStyle(tone: SlaChip["tone"]): { color: string; border: string } {
  switch (tone) {
    case "ok":     return { color: "#7dd688", border: "#2a5a32" };
    case "warn":   return { color: "#ffc98b", border: "#5b4920" };
    case "danger": return { color: "#ff8b8b", border: "#5b2024" };
    case "muted":  return { color: "var(--muted)", border: "var(--border)" };
  }
}
