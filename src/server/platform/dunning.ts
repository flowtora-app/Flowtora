// Page 23 — Dunning data layer.
//
// Reads from PlatformInvoicePayment + DunningEvent + DunningSequence.
// Recovery is computed by pairing failed payments with subsequent
// succeeded ones on the same invoice (so recovery is real, not just a
// status-flip on the dunning event).

import { db } from "@/lib/db";

const DAY = 86_400_000;

/* ── KPIs ────────────────────────────────────────────────── */

export interface DunningKpis {
  failedThisPeriod: number;
  recoveredAmount: number;       // sum of recovered (paid) invoice totals tied to failed attempts
  recoveryRatePct: number | null;
  avgDaysToRecover: number | null;
  activeSequences: number;
}

export async function loadDunningKpis(periodDays = 30): Promise<DunningKpis> {
  const since = new Date(Date.now() - periodDays * DAY);

  const [failedPayments, allPayments, activeSequences] = await Promise.all([
    db.platformInvoicePayment.findMany({
      where: { status: "failed", attemptedAt: { gte: since } },
      select: { id: true, invoiceId: true, attemptedAt: true, amount: true },
      take: 50_000,
    }),
    db.platformInvoicePayment.findMany({
      where: { attemptedAt: { gte: since } },
      select: { id: true, invoiceId: true, attemptedAt: true, status: true, amount: true },
      take: 50_000,
    }),
    db.dunningSequence.count({ where: { active: true } }),
  ]);

  // For each failed payment, see if a later "succeeded" payment exists
  // on the same invoice. If so, count the recovery + days-to-recover.
  const succeededByInvoice = new Map<string, { attemptedAt: Date; amount: number }[]>();
  for (const p of allPayments) {
    if (p.status !== "succeeded") continue;
    const list = succeededByInvoice.get(p.invoiceId) ?? [];
    list.push({ attemptedAt: p.attemptedAt, amount: p.amount });
    succeededByInvoice.set(p.invoiceId, list);
  }

  let recoveredAmount = 0;
  const recoveredDays: number[] = [];
  let recoveredCount = 0;
  for (const f of failedPayments) {
    const successes = succeededByInvoice.get(f.invoiceId) ?? [];
    const recovery = successes.find((s) => s.attemptedAt > f.attemptedAt);
    if (!recovery) continue;
    recoveredCount += 1;
    recoveredAmount += recovery.amount;
    recoveredDays.push(Math.max(0, (recovery.attemptedAt.getTime() - f.attemptedAt.getTime()) / DAY));
  }

  return {
    failedThisPeriod: failedPayments.length,
    recoveredAmount,
    recoveryRatePct: failedPayments.length === 0
      ? null
      : Math.round((recoveredCount / failedPayments.length) * 1000) / 10,
    avgDaysToRecover: recoveredDays.length === 0
      ? null
      : Math.round(recoveredDays.reduce((a, n) => a + n, 0) / recoveredDays.length),
    activeSequences,
  };
}

/* ── Queue rows ──────────────────────────────────────────── */

export interface DunningQueueRow {
  id: string;
  status: "IN_PROGRESS" | "PAUSED" | "RECOVERED" | "SURRENDERED";
  paymentId: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceTotal: number;
  currency: string;
  tenantId: string;
  tenantName: string;
  failureCode: string | null;
  failureReason: string | null;
  lastRetryAt: Date | null;
  nextActionAt: Date | null;
  retriesAttempted: number;
  currentStage: number;
  stageLabel: string;
  sequenceName: string;
  lastOutcome: string | null;
  amountFailed: number;
}

export async function loadDunningQueue(filters: {
  status?: "IN_PROGRESS" | "PAUSED" | "RECOVERED" | "SURRENDERED";
}): Promise<DunningQueueRow[]> {
  const events = await db.dunningEvent.findMany({
    where: filters.status ? { status: filters.status } : {},
    orderBy: [{ status: "asc" }, { nextActionAt: "asc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      payment: {
        select: {
          id: true, amount: true, failureCode: true, failureReason: true,
          attemptedAt: true,
        },
      },
      invoice: {
        select: { id: true, number: true, total: true, currency: true },
      },
      tenant: { select: { id: true, name: true } },
      sequence: {
        select: {
          name: true,
          stages: {
            orderBy: { position: "asc" },
            select: { position: true, action: true, label: true },
          },
        },
      },
    },
  });

  return events.map((e) => {
    const stage = e.sequence.stages[e.currentStage];
    const stageLabel = stage
      ? (stage.label ?? `${stage.action} (stage ${stage.position})`)
      : "(no stages)";
    return {
      id: e.id,
      status: e.status,
      paymentId: e.paymentId,
      invoiceId: e.invoiceId,
      invoiceNumber: e.invoice.number,
      invoiceTotal: e.invoice.total,
      currency: e.invoice.currency,
      tenantId: e.tenantId,
      tenantName: e.tenant.name,
      failureCode: e.payment.failureCode,
      failureReason: e.payment.failureReason,
      lastRetryAt: e.lastActionAt,
      nextActionAt: e.nextActionAt,
      retriesAttempted: e.retriesAttempted,
      currentStage: e.currentStage,
      stageLabel,
      sequenceName: e.sequence.name,
      lastOutcome: e.lastOutcome,
      amountFailed: e.payment.amount,
    };
  });
}

/* ── Performance ─────────────────────────────────────────── */

export interface DunningPerformance {
  funnel: {
    failed: number;
    emailSent: number;
    emailOpened: number;     // honest deferral — placeholder
    paymentUpdated: number;  // honest deferral — placeholder
    recovered: number;
  };
  byFailureReason: { code: string; failed: number; recovered: number; recoveryRate: number | null }[];
}

export async function loadDunningPerformance(periodDays = 90): Promise<DunningPerformance> {
  const since = new Date(Date.now() - periodDays * DAY);

  const [failedPayments, allPayments, sentEvents] = await Promise.all([
    db.platformInvoicePayment.findMany({
      where: { status: "failed", attemptedAt: { gte: since } },
      select: { id: true, invoiceId: true, attemptedAt: true, failureCode: true },
      take: 50_000,
    }),
    db.platformInvoicePayment.findMany({
      where: { attemptedAt: { gte: since }, status: "succeeded" },
      select: { invoiceId: true, attemptedAt: true },
      take: 50_000,
    }),
    db.auditLog.count({
      where: {
        action: { in: ["platform.dunning_custom_email_sent", "platform.payment_portal_link_sent"] },
        createdAt: { gte: since },
      },
    }),
  ]);

  const succeededByInvoice = new Map<string, Date[]>();
  for (const p of allPayments) {
    const list = succeededByInvoice.get(p.invoiceId) ?? [];
    list.push(p.attemptedAt);
    succeededByInvoice.set(p.invoiceId, list);
  }

  // By failure reason
  const reasonAcc = new Map<string, { failed: number; recovered: number }>();
  let recovered = 0;
  for (const f of failedPayments) {
    const code = f.failureCode ?? "(none)";
    const row = reasonAcc.get(code) ?? { failed: 0, recovered: 0 };
    row.failed += 1;
    const successes = succeededByInvoice.get(f.invoiceId) ?? [];
    const recovery = successes.find((d) => d > f.attemptedAt);
    if (recovery) {
      row.recovered += 1;
      recovered += 1;
    }
    reasonAcc.set(code, row);
  }

  const byFailureReason = Array.from(reasonAcc.entries())
    .map(([code, r]) => ({
      code, failed: r.failed, recovered: r.recovered,
      recoveryRate: r.failed === 0 ? null : Math.round((r.recovered / r.failed) * 1000) / 10,
    }))
    .sort((a, b) => b.failed - a.failed);

  return {
    funnel: {
      failed: failedPayments.length,
      emailSent: sentEvents,
      emailOpened: 0, // deferred — no email-event tracking yet
      paymentUpdated: 0, // deferred — Stripe portal callback not wired
      recovered,
    },
    byFailureReason,
  };
}

/* ── Sequences (with stages) ─────────────────────────────── */

export interface SequenceRow {
  id: string;
  name: string;
  description: string | null;
  planSlug: string | null;
  smartRetries: boolean;
  active: boolean;
  eventCount: number;
  stages: {
    id: string;
    position: number;
    triggerDays: number;
    action: string;
    templateKind: string | null;
    label: string | null;
    notes: string | null;
  }[];
}

export async function loadDunningSequences(): Promise<SequenceRow[]> {
  const rows = await db.dunningSequence.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    include: {
      stages: { orderBy: { position: "asc" } },
      _count: { select: { events: true } },
    },
  });
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    planSlug: s.planSlug,
    smartRetries: s.smartRetries,
    active: s.active,
    eventCount: s._count.events,
    stages: s.stages.map((st) => ({
      id: st.id,
      position: st.position,
      triggerDays: st.triggerDays,
      action: st.action,
      templateKind: st.templateKind,
      label: st.label,
      notes: st.notes,
    })),
  }));
}
