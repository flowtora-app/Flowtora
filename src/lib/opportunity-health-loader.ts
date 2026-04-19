// Phase 7 — batch loader for opportunity health.
//
// Computing a health score needs:
//   • customer row (stage, value, probability — usually already loaded)
//   • latest "touch" date (interaction OR task OR audit entry)
//   • whether an open quote exists and what status it's at
//   • overdue task count
//
// The kanban/list pages render 100+ customers at a time, so a naive
// "per-customer score()" would fan out 3 queries per row. This loader
// pulls all four signals in 4 total queries (one per dimension),
// aggregates by customerId, and exposes a map keyed on customer id
// that the view can hand to `computeOpportunityHealth()`.

import { db } from "@/lib/db";
import type { HealthInput } from "@/lib/opportunity-health";
import type { Customer, QuoteStatus } from "@prisma/client";

export type HealthBundle = Map<string, HealthInput>;

// Open quote statuses — SENT/VIEWED/APPROVED all count as "in flight."
// We store the "best" one per customer (APPROVED > VIEWED > SENT).
const OPEN_QUOTE_STATUSES: QuoteStatus[] = ["SENT", "VIEWED", "APPROVED"];
const QUOTE_RANK: Record<QuoteStatus, number> = {
  DRAFT: 0,
  SENT: 1,
  VIEWED: 2,
  APPROVED: 3,
  DECLINED: 0,
  EXPIRED: 0,
};

export async function loadHealthBundle(
  tenantId: string,
  customers: Pick<Customer, "id" | "stage" | "estimatedValue" | "closeProbability" | "updatedAt">[],
): Promise<HealthBundle> {
  if (customers.length === 0) return new Map();
  const ids = customers.map((c) => c.id);
  const now = new Date();

  const [latestInteractions, latestTasks, openQuotes, overdueTasks] =
    await Promise.all([
      // Most recent interaction per customer.
      db.interaction.groupBy({
        by: ["customerId"],
        where: { tenantId, customerId: { in: ids } },
        _max: { occurredAt: true },
      }),
      // Most recent task touch (creation or completion) per customer.
      db.task.groupBy({
        by: ["customerId"],
        where: { tenantId, customerId: { in: ids } },
        _max: { updatedAt: true },
      }),
      // One row per customer with the "best" open quote status.
      db.quote.findMany({
        where: { tenantId, customerId: { in: ids }, status: { in: OPEN_QUOTE_STATUSES } },
        select: { customerId: true, status: true },
      }),
      // Overdue task counts per customer.
      db.task.groupBy({
        by: ["customerId"],
        where: {
          tenantId,
          customerId: { in: ids },
          completedAt: null,
          dueDate: { lt: now, not: null },
        },
        _count: { _all: true },
      }),
    ]);

  const interactionMap = new Map<string, Date>();
  for (const row of latestInteractions) {
    if (row.customerId && row._max.occurredAt) {
      interactionMap.set(row.customerId, row._max.occurredAt);
    }
  }

  const taskMap = new Map<string, Date>();
  for (const row of latestTasks) {
    if (row.customerId && row._max.updatedAt) {
      taskMap.set(row.customerId, row._max.updatedAt);
    }
  }

  const openQuoteMap = new Map<string, QuoteStatus>();
  for (const q of openQuotes) {
    const current = openQuoteMap.get(q.customerId);
    if (!current || QUOTE_RANK[q.status] > QUOTE_RANK[current]) {
      openQuoteMap.set(q.customerId, q.status);
    }
  }

  const overdueMap = new Map<string, number>();
  for (const row of overdueTasks) {
    if (row.customerId) overdueMap.set(row.customerId, row._count._all);
  }

  const result: HealthBundle = new Map();
  for (const c of customers) {
    const interactionAt = interactionMap.get(c.id) ?? null;
    const taskAt = taskMap.get(c.id) ?? null;
    const updatedAt = c.updatedAt;
    // lastTouchAt = max of (interaction, task touch, customer updatedAt).
    // updatedAt catches cases where someone edited the customer record
    // directly (stage change, note edit) without logging an interaction.
    const lastTouchAt = maxDate([interactionAt, taskAt, updatedAt]);

    result.set(c.id, {
      stage: c.stage,
      estimatedValue: c.estimatedValue ? Number(c.estimatedValue) : null,
      closeProbability: c.closeProbability ?? null,
      lastTouchAt,
      openQuoteStatus: openQuoteMap.get(c.id) ?? null,
      overdueTaskCount: overdueMap.get(c.id) ?? 0,
      now,
    });
  }
  return result;
}

function maxDate(dates: (Date | null)[]): Date | null {
  let best: Date | null = null;
  for (const d of dates) {
    if (!d) continue;
    if (!best || d.getTime() > best.getTime()) best = d;
  }
  return best;
}
