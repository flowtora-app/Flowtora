// Refunds & Disputes data layer — Page 18.
//
// Three surfaces share this file because they live behind the same
// route + the loaders all join the same payment/invoice/tenant graph:
//   • PlatformPaymentRefund  — admin-issued refunds against payments
//   • PlatformDispute        — chargebacks raised by the gateway
//   • ChargebackEvidenceTemplate — reusable evidence drafts
//
// Honest deferral: PlatformPaymentRefund + PlatformDispute rows only
// land via the action layer + a future Stripe webhook ingestor. Until
// the webhook ships, refunds we mint stay in PENDING because there's
// no settlement signal to flip them, and disputes are zero unless
// admin-created (e.g. for testing).

import { db } from "@/lib/db";
import {
  Prisma,
  type PlatformDisputeStatus,
  type PlatformRefundReason,
  type PlatformRefundStatus,
} from "@prisma/client";

const DAY = 86_400_000;

/* ────────────────────────────────────────────────────────── */
/* Refunds — list + KPI                                       */
/* ────────────────────────────────────────────────────────── */

export interface RefundsFilters {
  q?: string;
  status?: PlatformRefundStatus;
  reason?: PlatformRefundReason;
  tenantId?: string;
  asCredit?: boolean;
  since?: Date;
  until?: Date;
  amountMin?: number; // minor units
  amountMax?: number;
}

export interface RefundRow {
  id: string;
  paymentId: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  reason: PlatformRefundReason;
  reasonNote: string | null;
  status: PlatformRefundStatus;
  asCredit: boolean;
  failureReason: string | null;
  initiatedAt: Date;
  completedAt: Date | null;
  initiatedBy: string;
  initiatedByName: string | null;
  tenant: { id: string; name: string; slug: string };
}

export interface RefundsListResult {
  rows: RefundRow[];
  total: number;
  filteredTotal: number;
}

export async function loadRefundsList(args: {
  filters: RefundsFilters;
  page: number;
  pageSize: number;
}): Promise<RefundsListResult> {
  const { filters, page, pageSize } = args;
  const where: Prisma.PlatformPaymentRefundWhereInput = {};

  if (filters.q) {
    const q = filters.q.trim();
    where.OR = [
      { id: q },
      { paymentId: q },
      { gatewayRefundId: q },
      { invoice: { number: { contains: q, mode: "insensitive" } } },
      { tenant: { name: { contains: q, mode: "insensitive" } } },
    ];
  }
  if (filters.status) where.status = filters.status;
  if (filters.reason) where.reason = filters.reason;
  if (filters.tenantId) where.tenantId = filters.tenantId;
  if (filters.asCredit != null) where.asCredit = filters.asCredit;
  if (filters.since || filters.until) {
    const initiatedAt: Prisma.DateTimeFilter = {};
    if (filters.since) initiatedAt.gte = filters.since;
    if (filters.until) initiatedAt.lte = filters.until;
    where.initiatedAt = initiatedAt;
  }
  if (filters.amountMin != null || filters.amountMax != null) {
    const amount: Prisma.IntFilter = {};
    if (filters.amountMin != null) amount.gte = filters.amountMin;
    if (filters.amountMax != null) amount.lte = filters.amountMax;
    where.amount = amount;
  }

  const [total, filteredTotal, rows] = await Promise.all([
    db.platformPaymentRefund.count(),
    db.platformPaymentRefund.count({ where }),
    db.platformPaymentRefund.findMany({
      where,
      orderBy: { initiatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        invoice: { select: { id: true, number: true, currency: true } },
        tenant: { select: { id: true, name: true, slug: true } },
      },
    }),
  ]);

  // Resolve initiator display names in one round-trip.
  const initiatorIds = Array.from(new Set(rows.map((r) => r.initiatedBy)));
  const initiators = initiatorIds.length === 0 ? [] : await db.user.findMany({
    where: { id: { in: initiatorIds } },
    select: { id: true, name: true, email: true },
  });
  const nameById = new Map(initiators.map((u) => [u.id, u.name ?? u.email ?? null]));

  return {
    rows: rows.map((r) => ({
      id: r.id,
      paymentId: r.paymentId,
      invoiceId: r.invoiceId,
      invoiceNumber: r.invoice.number,
      amount: r.amount,
      currency: r.invoice.currency,
      reason: r.reason,
      reasonNote: r.reasonNote,
      status: r.status,
      asCredit: r.asCredit,
      failureReason: r.failureReason,
      initiatedAt: r.initiatedAt,
      completedAt: r.completedAt,
      initiatedBy: r.initiatedBy,
      initiatedByName: nameById.get(r.initiatedBy) ?? null,
      tenant: r.tenant,
    })),
    total, filteredTotal,
  };
}

export interface RefundsKpi {
  countThisPeriod: number;
  amountThisPeriod: number;
  refundRatePct: number | null; // refunded$ / succeeded payment $ in window
  pending: number;
  failed: number;
}

export async function loadRefundsKpi(periodDays = 30): Promise<RefundsKpi> {
  const since = new Date(Date.now() - periodDays * DAY);
  const [refunds, succeededPayments] = await Promise.all([
    db.platformPaymentRefund.findMany({
      where: { initiatedAt: { gte: since } },
      select: { amount: true, status: true },
      take: 50_000,
    }),
    db.platformInvoicePayment.findMany({
      where: { attemptedAt: { gte: since }, status: "succeeded" },
      select: { amount: true },
      take: 50_000,
    }),
  ]);
  const succeededRefunds = refunds.filter((r) => r.status === "SUCCEEDED");
  const totalAmount = succeededRefunds.reduce((acc, r) => acc + r.amount, 0);
  const succeededPaymentTotal = succeededPayments.reduce((acc, p) => acc + p.amount, 0);
  return {
    countThisPeriod: succeededRefunds.length,
    amountThisPeriod: totalAmount,
    refundRatePct: succeededPaymentTotal === 0
      ? null
      : Math.round((totalAmount / succeededPaymentTotal) * 1000) / 10,
    pending: refunds.filter((r) => r.status === "PENDING").length,
    failed: refunds.filter((r) => r.status === "FAILED").length,
  };
}

/* ────────────────────────────────────────────────────────── */
/* Disputes — list + KPI + detail                             */
/* ────────────────────────────────────────────────────────── */

export interface DisputesFilters {
  q?: string;
  status?: PlatformDisputeStatus;
  tenantId?: string;
  evidenceDueWithinDays?: number; // 0/3/7
  amountMin?: number;
  amountMax?: number;
}

export interface DisputeRow {
  id: string;
  paymentId: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  reasonCode: string | null;
  reason: string;
  status: PlatformDisputeStatus;
  evidenceDueAt: Date | null;
  submittedEvidenceAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  tenant: { id: string; name: string; slug: string };
}

export interface DisputesListResult {
  rows: DisputeRow[];
  total: number;
  filteredTotal: number;
}

export async function loadDisputesList(args: {
  filters: DisputesFilters;
  page: number;
  pageSize: number;
}): Promise<DisputesListResult> {
  const { filters, page, pageSize } = args;
  const where: Prisma.PlatformDisputeWhereInput = {};

  if (filters.q) {
    const q = filters.q.trim();
    where.OR = [
      { id: q },
      { gatewayDisputeId: q },
      { invoice: { number: { contains: q, mode: "insensitive" } } },
      { tenant: { name: { contains: q, mode: "insensitive" } } },
    ];
  }
  if (filters.status) where.status = filters.status;
  if (filters.tenantId) where.tenantId = filters.tenantId;
  if (filters.evidenceDueWithinDays != null) {
    const cutoff = new Date(Date.now() + filters.evidenceDueWithinDays * DAY);
    where.evidenceDueAt = { lte: cutoff, gte: new Date() };
    where.status = where.status ?? "NEEDS_RESPONSE";
  }
  if (filters.amountMin != null || filters.amountMax != null) {
    const amount: Prisma.IntFilter = {};
    if (filters.amountMin != null) amount.gte = filters.amountMin;
    if (filters.amountMax != null) amount.lte = filters.amountMax;
    where.amount = amount;
  }

  const [total, filteredTotal, rows] = await Promise.all([
    db.platformDispute.count(),
    db.platformDispute.count({ where }),
    db.platformDispute.findMany({
      where,
      orderBy: [{ status: "asc" }, { evidenceDueAt: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        invoice: { select: { id: true, number: true, currency: true } },
        tenant: { select: { id: true, name: true, slug: true } },
      },
    }),
  ]);

  return {
    rows: rows.map((d) => ({
      id: d.id,
      paymentId: d.paymentId,
      invoiceId: d.invoiceId,
      invoiceNumber: d.invoice.number,
      amount: d.amount,
      currency: d.invoice.currency,
      reasonCode: d.reasonCode,
      reason: d.reason,
      status: d.status,
      evidenceDueAt: d.evidenceDueAt,
      submittedEvidenceAt: d.submittedEvidenceAt,
      resolvedAt: d.resolvedAt,
      createdAt: d.createdAt,
      tenant: d.tenant,
    })),
    total, filteredTotal,
  };
}

export interface DisputesKpi {
  openCount: number;
  wonCount: number;
  lostCount: number;
  winRatePct: number | null;
  amountAtRisk: number;
  evidenceDueSoon: number; // ≤7 days
}

export async function loadDisputesKpi(): Promise<DisputesKpi> {
  const soon = new Date(Date.now() + 7 * DAY);
  const [open, won, lost, atRiskRows, dueSoon] = await Promise.all([
    db.platformDispute.count({ where: { status: { in: ["NEEDS_RESPONSE", "UNDER_REVIEW"] } } }),
    db.platformDispute.count({ where: { status: "WON" } }),
    db.platformDispute.count({ where: { status: "LOST" } }),
    db.platformDispute.findMany({
      where: { status: { in: ["NEEDS_RESPONSE", "UNDER_REVIEW"] } },
      select: { amount: true },
      take: 10_000,
    }),
    db.platformDispute.count({
      where: {
        status: "NEEDS_RESPONSE",
        evidenceDueAt: { gte: new Date(), lte: soon },
      },
    }),
  ]);
  const decided = won + lost;
  return {
    openCount: open,
    wonCount: won,
    lostCount: lost,
    winRatePct: decided === 0 ? null : Math.round((won / decided) * 1000) / 10,
    amountAtRisk: atRiskRows.reduce((acc, r) => acc + r.amount, 0),
    evidenceDueSoon: dueSoon,
  };
}

export interface DisputeDetail extends DisputeRow {
  evidenceText: string | null;
  acceptedAt: Date | null;
  acceptedBy: string | null;
  contextSnapshot: Record<string, unknown> | null;
  /** Payment context (gateway, method, fee, etc.). */
  payment: {
    id: string;
    gateway: string;
    gatewayPaymentId: string | null;
    method: string | null;
    amount: number;
    fee: number;
    net: number;
    attemptedAt: Date;
    failureCode: string | null;
    failureReason: string | null;
  };
  /** Customer history to give context for the evidence packet. */
  customerHistory: {
    tenantStatus: string;
    tenantCreatedAt: Date;
    totalSucceededPayments: number;
    totalRevenueMinorUnits: number;
    pastDisputes: number;
    pastRefunds: number;
  };
  /** All other payment attempts on the same invoice. */
  invoiceAttempts: { id: string; status: string; amount: number; attemptedAt: Date }[];
}

export async function loadDisputeDetail(id: string): Promise<DisputeDetail | null> {
  const d = await db.platformDispute.findUnique({
    where: { id },
    include: {
      invoice: { select: { id: true, number: true, currency: true } },
      tenant: {
        select: {
          id: true, name: true, slug: true, status: true, createdAt: true,
        },
      },
      payment: {
        select: {
          id: true, gateway: true, gatewayPaymentId: true, method: true,
          amount: true, fee: true, net: true, attemptedAt: true,
          failureCode: true, failureReason: true,
          invoice: {
            select: {
              payments: {
                orderBy: { attemptedAt: "desc" },
                take: 25,
                select: { id: true, status: true, amount: true, attemptedAt: true },
              },
            },
          },
        },
      },
    },
  });
  if (!d) return null;

  // Aggregate customer history (one set of small queries, each scoped
  // to the tenant — fine for a detail page and avoids a fat preload).
  const [succeededAgg, pastDisputes, pastRefunds] = await Promise.all([
    db.platformInvoicePayment.aggregate({
      where: { status: "succeeded", invoice: { tenantId: d.tenantId } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.platformDispute.count({ where: { tenantId: d.tenantId, id: { not: d.id } } }),
    db.platformPaymentRefund.count({ where: { tenantId: d.tenantId } }),
  ]);

  return {
    id: d.id,
    paymentId: d.paymentId,
    invoiceId: d.invoiceId,
    invoiceNumber: d.invoice.number,
    amount: d.amount,
    currency: d.invoice.currency,
    reasonCode: d.reasonCode,
    reason: d.reason,
    status: d.status,
    evidenceDueAt: d.evidenceDueAt,
    submittedEvidenceAt: d.submittedEvidenceAt,
    resolvedAt: d.resolvedAt,
    createdAt: d.createdAt,
    tenant: { id: d.tenant.id, name: d.tenant.name, slug: d.tenant.slug },
    evidenceText: d.evidenceText,
    acceptedAt: d.acceptedAt,
    acceptedBy: d.acceptedBy,
    contextSnapshot: (d.contextSnapshot ?? null) as Record<string, unknown> | null,
    payment: {
      id: d.payment.id,
      gateway: d.payment.gateway,
      gatewayPaymentId: d.payment.gatewayPaymentId,
      method: d.payment.method,
      amount: d.payment.amount,
      fee: d.payment.fee,
      net: d.payment.net,
      attemptedAt: d.payment.attemptedAt,
      failureCode: d.payment.failureCode,
      failureReason: d.payment.failureReason,
    },
    customerHistory: {
      tenantStatus: d.tenant.status,
      tenantCreatedAt: d.tenant.createdAt,
      totalSucceededPayments: succeededAgg._count._all,
      totalRevenueMinorUnits: succeededAgg._sum.amount ?? 0,
      pastDisputes,
      pastRefunds,
    },
    invoiceAttempts: d.payment.invoice.payments,
  };
}

/* ────────────────────────────────────────────────────────── */
/* Refundable payments (composer dropdown)                    */
/* ────────────────────────────────────────────────────────── */

export interface RefundablePayment {
  id: string;
  invoiceNumber: string;
  tenantName: string;
  amount: number;
  currency: string;
  attemptedAt: Date;
  alreadyRefunded: number;
}

export async function loadRefundablePayments(limit = 200): Promise<RefundablePayment[]> {
  const rows = await db.platformInvoicePayment.findMany({
    where: { status: { in: ["succeeded", "partial_refund"] } },
    orderBy: { attemptedAt: "desc" },
    take: limit,
    include: {
      invoice: {
        select: {
          number: true, currency: true,
          tenant: { select: { name: true } },
        },
      },
      refunds: { select: { amount: true, status: true } },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    invoiceNumber: p.invoice.number,
    tenantName: p.invoice.tenant.name,
    amount: p.amount,
    currency: p.invoice.currency,
    attemptedAt: p.attemptedAt,
    alreadyRefunded: p.refunds
      .filter((r) => r.status === "SUCCEEDED" || r.status === "PENDING")
      .reduce((acc, r) => acc + r.amount, 0),
  }));
}

/* ────────────────────────────────────────────────────────── */
/* Evidence templates                                         */
/* ────────────────────────────────────────────────────────── */

export interface EvidenceTemplate {
  id: string;
  name: string;
  description: string | null;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  createdByName: string | null;
}

export async function loadEvidenceTemplates(): Promise<EvidenceTemplate[]> {
  const rows = await db.chargebackEvidenceTemplate.findMany({
    orderBy: { name: "asc" },
  });
  const ids = Array.from(new Set(rows.map((r) => r.createdBy)));
  const users = ids.length === 0 ? [] : await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, email: true },
  });
  const nameById = new Map(users.map((u) => [u.id, u.name ?? u.email ?? null]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    body: r.body,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    createdBy: r.createdBy,
    createdByName: nameById.get(r.createdBy) ?? null,
  }));
}

/* ────────────────────────────────────────────────────────── */
/* Filter dropdown options                                    */
/* ────────────────────────────────────────────────────────── */

export interface RefundsDisputesFilterOptions {
  tenants: { id: string; label: string }[];
}

export async function loadRefundsDisputesFilterOptions(): Promise<RefundsDisputesFilterOptions> {
  const tenants = await db.tenant.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
    take: 500,
  });
  return {
    tenants: tenants.map((t) => ({ id: t.id, label: `${t.name} (${t.slug})` })),
  };
}
