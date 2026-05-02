// Page 24 — Payouts data layer.
//
// Reads from the new PartnerPayout / PartnerPayoutMethod /
// PartnerCommissionLine tables, joined to the existing Affiliate +
// Referral graph.

import { db } from "@/lib/db";
import type {
  PartnerCommissionLineKind,
  PartnerPayoutMethodType,
  PartnerPayoutStatus,
} from "@prisma/client";

/* ── Schedule (upcoming + ready-to-pay) ────────────────── */

export interface ScheduleRow {
  affiliateId: string;
  affiliateName: string;
  affiliateCode: string;
  status: string;
  /** Net unpaid commission lines, summed across the latest period. */
  pendingTotal: number;
  /** Suggested period — most-recent period with unpaid lines. */
  pendingPeriod: string | null;
  /** Pending lines count (so the operator sees if there's anything to pay). */
  pendingLines: number;
  /** Has a primary payout method. */
  hasMethod: boolean;
  /** Already-scheduled payout for the latest period (if any). */
  alreadyScheduled: { id: string; status: string; scheduledAt: Date } | null;
}

export interface ScheduleData {
  upcomingByPartner: ScheduleRow[];
  totalPendingMinor: number;
  scheduledThisWeek: number;
  paidThisMonth: number;
}

export async function loadPayoutSchedule(): Promise<ScheduleData> {
  const [affiliates, lines, methods, recentPayouts] = await Promise.all([
    db.affiliate.findMany({
      orderBy: [{ status: "asc" }, { name: "asc" }],
      select: { id: true, name: true, code: true, status: true },
    }),
    db.partnerCommissionLine.findMany({
      where: { payoutId: null },
      select: { affiliateId: true, kind: true, amount: true, period: true },
    }),
    db.partnerPayoutMethod.findMany({
      where: { isPrimary: true },
      select: { affiliateId: true },
    }),
    db.partnerPayout.findMany({
      orderBy: { scheduledAt: "desc" },
      select: { id: true, affiliateId: true, period: true, status: true, scheduledAt: true, settledAt: true, amount: true },
    }),
  ]);

  const linesByPartner = new Map<string, { period: string; lines: { kind: PartnerCommissionLineKind; amount: number }[] }>();
  for (const l of lines) {
    const existing = linesByPartner.get(l.affiliateId);
    if (!existing) {
      linesByPartner.set(l.affiliateId, { period: l.period, lines: [{ kind: l.kind, amount: l.amount }] });
    } else {
      // Track latest period (lexical compare works for YYYY-MM / YYYY-Qx).
      if (l.period > existing.period) existing.period = l.period;
      existing.lines.push({ kind: l.kind, amount: l.amount });
    }
  }

  const methodsByPartner = new Set(methods.map((m) => m.affiliateId));

  const oneWeekFromNow = Date.now() + 7 * 86_400_000;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const scheduledThisWeek = recentPayouts.filter(
    (p) => p.status === "PENDING" && p.scheduledAt.getTime() <= oneWeekFromNow,
  ).length;
  const paidThisMonth = recentPayouts
    .filter((p) => p.status === "PAID" && p.settledAt && p.settledAt >= monthStart)
    .reduce((acc, p) => acc + p.amount, 0);

  let totalPendingMinor = 0;
  const upcomingByPartner: ScheduleRow[] = affiliates.map((a) => {
    const linesEntry = linesByPartner.get(a.id);
    const period = linesEntry?.period ?? null;
    const net = linesEntry
      ? linesEntry.lines.reduce((acc, l) => {
          if (l.kind === "DEDUCTION" || l.kind === "HOLD") return acc - l.amount;
          return acc + l.amount;
        }, 0)
      : 0;
    if (net > 0) totalPendingMinor += net;

    // Already-scheduled latest payout for this partner.
    const alreadyScheduled = recentPayouts.find(
      (p) => p.affiliateId === a.id
            && (p.status === "PENDING" || p.status === "IN_TRANSIT")
            && (period == null || p.period === period),
    ) ?? null;

    return {
      affiliateId: a.id,
      affiliateName: a.name,
      affiliateCode: a.code,
      status: a.status,
      pendingTotal: net,
      pendingPeriod: period,
      pendingLines: linesEntry?.lines.length ?? 0,
      hasMethod: methodsByPartner.has(a.id),
      alreadyScheduled: alreadyScheduled
        ? { id: alreadyScheduled.id, status: alreadyScheduled.status, scheduledAt: alreadyScheduled.scheduledAt }
        : null,
    };
  });

  return {
    upcomingByPartner: upcomingByPartner
      .filter((r) => r.pendingTotal > 0 || r.alreadyScheduled)
      .sort((a, b) => b.pendingTotal - a.pendingTotal),
    totalPendingMinor,
    scheduledThisWeek,
    paidThisMonth,
  };
}

/* ── Statements (per partner, line-itemized) ────────────── */

export interface StatementLine {
  id: string;
  kind: PartnerCommissionLineKind;
  description: string;
  period: string;
  earnedAt: Date;
  amount: number;
  paidIn: { payoutId: string; status: PartnerPayoutStatus } | null;
}

export interface PartnerStatement {
  affiliateId: string;
  affiliateName: string;
  affiliateCode: string;
  status: string;
  /** Sum across all line kinds (commissions positive, holds/deductions negative). */
  totalEarnedMinor: number;
  /** Already paid out (sum of PAID payouts). */
  paidOutMinor: number;
  /** Net balance to settle = earned - paid - pending payouts. */
  pendingPayoutMinor: number;
  /** Line-items to render. */
  lines: StatementLine[];
}

export async function loadPartnerStatements(): Promise<PartnerStatement[]> {
  const [affiliates, lines, payouts] = await Promise.all([
    db.affiliate.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true, status: true },
    }),
    db.partnerCommissionLine.findMany({
      orderBy: { earnedAt: "desc" },
      include: { payout: { select: { id: true, status: true } } },
    }),
    db.partnerPayout.findMany({
      select: { id: true, affiliateId: true, status: true, amount: true },
    }),
  ]);

  const byPartner = new Map<string, { earned: number; paid: number; pending: number; rows: StatementLine[] }>();
  for (const l of lines) {
    const cell = byPartner.get(l.affiliateId) ?? { earned: 0, paid: 0, pending: 0, rows: [] };
    const sign = l.kind === "DEDUCTION" || l.kind === "HOLD" ? -1 : 1;
    cell.earned += sign * l.amount;
    cell.rows.push({
      id: l.id,
      kind: l.kind,
      description: l.description,
      period: l.period,
      earnedAt: l.earnedAt,
      amount: l.amount,
      paidIn: l.payout ? { payoutId: l.payout.id, status: l.payout.status } : null,
    });
    byPartner.set(l.affiliateId, cell);
  }
  for (const p of payouts) {
    const cell = byPartner.get(p.affiliateId);
    if (!cell) continue;
    if (p.status === "PAID") cell.paid += p.amount;
    if (p.status === "PENDING" || p.status === "IN_TRANSIT") cell.pending += p.amount;
  }

  return affiliates.map((a) => {
    const cell = byPartner.get(a.id) ?? { earned: 0, paid: 0, pending: 0, rows: [] };
    return {
      affiliateId: a.id,
      affiliateName: a.name,
      affiliateCode: a.code,
      status: a.status,
      totalEarnedMinor: cell.earned,
      paidOutMinor: cell.paid,
      pendingPayoutMinor: cell.pending,
      lines: cell.rows,
    };
  });
}

/* ── Methods (per partner) ───────────────────────────────── */

export interface MethodRow {
  id: string;
  affiliateId: string;
  affiliateName: string;
  type: PartnerPayoutMethodType;
  label: string;
  accountSnippet: string | null;
  status: string | null;
  isPrimary: boolean;
  payoutCount: number;
}

export async function loadPayoutMethods(): Promise<MethodRow[]> {
  const methods = await db.partnerPayoutMethod.findMany({
    orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
    include: {
      affiliate: { select: { name: true, code: true } },
      _count: { select: { payouts: true } },
    },
  });
  return methods.map((m) => ({
    id: m.id,
    affiliateId: m.affiliateId,
    affiliateName: `${m.affiliate.name} (${m.affiliate.code})`,
    type: m.type,
    label: m.label,
    accountSnippet: m.accountSnippet,
    status: m.status,
    isPrimary: m.isPrimary,
    payoutCount: m._count.payouts,
  }));
}

/* ── History (paginated payouts) ────────────────────────── */

export interface HistoryRow {
  id: string;
  affiliateId: string;
  affiliateName: string;
  period: string;
  amount: number;
  currency: string;
  methodLabel: string | null;
  methodType: PartnerPayoutMethodType | null;
  status: PartnerPayoutStatus;
  scheduledAt: Date;
  dispatchedAt: Date | null;
  settledAt: Date | null;
  externalRef: string | null;
  failureReason: string | null;
}

export async function loadPayoutHistory(filters: {
  status?: PartnerPayoutStatus;
}): Promise<HistoryRow[]> {
  const payouts = await db.partnerPayout.findMany({
    where: filters.status ? { status: filters.status } : {},
    orderBy: [{ scheduledAt: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      affiliate: { select: { name: true, code: true } },
      method: { select: { type: true, label: true } },
    },
  });
  return payouts.map((p) => ({
    id: p.id,
    affiliateId: p.affiliateId,
    affiliateName: `${p.affiliate.name} (${p.affiliate.code})`,
    period: p.period,
    amount: p.amount,
    currency: p.currency,
    methodLabel: p.method?.label ?? null,
    methodType: p.method?.type ?? null,
    status: p.status,
    scheduledAt: p.scheduledAt,
    dispatchedAt: p.dispatchedAt,
    settledAt: p.settledAt,
    externalRef: p.externalRef,
    failureReason: p.failureReason,
  }));
}
