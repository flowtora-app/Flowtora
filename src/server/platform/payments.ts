// Payments & Transactions data layer — Page 17.
//
// Reads PlatformInvoicePayment rows joined to PlatformBillingInvoice
// + Tenant. The model is final but no webhook handler ingests Stripe
// data yet — the page surfaces empty state honestly until the
// integration lands.

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

const DAY = 86_400_000;

/* ────────────────────────────────────────────────────────── */
/* Filters + list                                             */
/* ────────────────────────────────────────────────────────── */

export type PaymentStatus =
  | "succeeded" | "failed" | "pending" | "refunded" | "partial_refund" | "disputed";

export interface PaymentsFilters {
  q?: string;
  status?: PaymentStatus;
  gateway?: string;
  method?: string;
  currency?: string;
  tenantId?: string;
  since?: Date;
  until?: Date;
  amountMin?: number; // minor units
  amountMax?: number;
  failureCode?: string;
}

export interface PaymentRow {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  gateway: string;
  gatewayPaymentId: string | null;
  method: string | null;
  amount: number;
  fee: number;
  net: number;
  currency: string;
  failureCode: string | null;
  failureReason: string | null;
  attemptedAt: Date;
  refundedAt: Date | null;
  tenant: { id: string; name: string; slug: string };
}

export interface PaymentsListResult {
  rows: PaymentRow[];
  total: number;
  filteredTotal: number;
}

export async function loadPaymentsList(args: {
  filters: PaymentsFilters;
  page: number;
  pageSize: number;
}): Promise<PaymentsListResult> {
  const { filters, page, pageSize } = args;
  const where: Prisma.PlatformInvoicePaymentWhereInput = {};

  if (filters.q) {
    const q = filters.q.trim();
    where.OR = [
      { id: q },
      { gatewayPaymentId: q },
      { invoice: { number: { contains: q, mode: "insensitive" } } },
      { invoice: { tenant: { name: { contains: q, mode: "insensitive" } } } },
    ];
  }
  if (filters.status) where.status = filters.status;
  if (filters.gateway) where.gateway = filters.gateway;
  if (filters.method) where.method = { contains: filters.method, mode: "insensitive" };
  if (filters.failureCode) where.failureCode = filters.failureCode;
  if (filters.tenantId) where.invoice = { tenantId: filters.tenantId };
  if (filters.currency) {
    where.invoice = { ...((where.invoice ?? {}) as object), currency: filters.currency };
  }
  if (filters.since || filters.until) {
    const attemptedAt: Prisma.DateTimeFilter = {};
    if (filters.since) attemptedAt.gte = filters.since;
    if (filters.until) attemptedAt.lte = filters.until;
    where.attemptedAt = attemptedAt;
  }
  if (filters.amountMin != null || filters.amountMax != null) {
    const amount: Prisma.IntFilter = {};
    if (filters.amountMin != null) amount.gte = filters.amountMin;
    if (filters.amountMax != null) amount.lte = filters.amountMax;
    where.amount = amount;
  }

  const [total, filteredTotal, rows] = await Promise.all([
    db.platformInvoicePayment.count(),
    db.platformInvoicePayment.count({ where }),
    db.platformInvoicePayment.findMany({
      where,
      orderBy: { attemptedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        invoice: {
          select: {
            id: true, number: true, currency: true,
            tenant: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    }),
  ]);

  return {
    rows: rows.map((p) => ({
      id: p.id,
      invoiceId: p.invoice.id, invoiceNumber: p.invoice.number,
      status: p.status, gateway: p.gateway, gatewayPaymentId: p.gatewayPaymentId,
      method: p.method,
      amount: p.amount, fee: p.fee, net: p.net,
      currency: p.invoice.currency,
      failureCode: p.failureCode, failureReason: p.failureReason,
      attemptedAt: p.attemptedAt, refundedAt: p.refundedAt,
      tenant: p.invoice.tenant,
    })),
    total, filteredTotal,
  };
}

/* ────────────────────────────────────────────────────────── */
/* KPIs                                                        */
/* ────────────────────────────────────────────────────────── */

export interface PaymentsKpi {
  volumeThisPeriod: number;       // sum of succeeded payment amounts
  successRatePct: number | null;  // succeeded / total attempts in period
  failedCount: number;
  avgFee: number | null;
  netRevenue: number;             // sum of net for succeeded
}

export async function loadPaymentsKpi(periodDays = 30): Promise<PaymentsKpi> {
  const periodStart = new Date(Date.now() - periodDays * DAY);
  const rows = await db.platformInvoicePayment.findMany({
    where: { attemptedAt: { gte: periodStart } },
    select: { status: true, amount: true, fee: true, net: true },
    take: 50_000,
  });
  const succeeded = rows.filter((r) => r.status === "succeeded");
  const failed = rows.filter((r) => r.status === "failed").length;
  const volume = succeeded.reduce((acc, r) => acc + r.amount, 0);
  const net = succeeded.reduce((acc, r) => acc + r.net, 0);
  const feeSum = succeeded.reduce((acc, r) => acc + r.fee, 0);
  return {
    volumeThisPeriod: volume,
    successRatePct: rows.length === 0 ? null : Math.round((succeeded.length / rows.length) * 1000) / 10,
    failedCount: failed,
    avgFee: succeeded.length === 0 ? null : Math.round(feeSum / succeeded.length),
    netRevenue: net,
  };
}

/* ────────────────────────────────────────────────────────── */
/* Detail loader (drawer)                                      */
/* ────────────────────────────────────────────────────────── */

export interface PaymentDetail extends PaymentRow {
  rawResponse: string | null;
  riskMetadata: Record<string, unknown> | null;
  invoiceTotal: number;
  invoiceStatus: string;
  /** Other payment attempts on the same invoice (for context). */
  relatedAttempts: {
    id: string;
    status: string;
    amount: number;
    attemptedAt: Date;
  }[];
}

export async function loadPaymentDetail(id: string): Promise<PaymentDetail | null> {
  const p = await db.platformInvoicePayment.findUnique({
    where: { id },
    include: {
      invoice: {
        select: {
          id: true, number: true, total: true, currency: true, status: true,
          tenant: { select: { id: true, name: true, slug: true } },
          payments: {
            where: { id: { not: id } },
            orderBy: { attemptedAt: "desc" },
            take: 20,
            select: { id: true, status: true, amount: true, attemptedAt: true },
          },
        },
      },
    },
  });
  if (!p) return null;
  return {
    id: p.id,
    invoiceId: p.invoice.id, invoiceNumber: p.invoice.number,
    status: p.status, gateway: p.gateway, gatewayPaymentId: p.gatewayPaymentId,
    method: p.method,
    amount: p.amount, fee: p.fee, net: p.net,
    currency: p.invoice.currency,
    failureCode: p.failureCode, failureReason: p.failureReason,
    attemptedAt: p.attemptedAt, refundedAt: p.refundedAt,
    tenant: p.invoice.tenant,
    rawResponse: p.rawResponse,
    riskMetadata: (p.riskMetadata ?? null) as Record<string, unknown> | null,
    invoiceTotal: p.invoice.total,
    invoiceStatus: p.invoice.status,
    relatedAttempts: p.invoice.payments,
  };
}

/* ────────────────────────────────────────────────────────── */
/* Filter dropdown options                                     */
/* ────────────────────────────────────────────────────────── */

export interface PaymentsFilterOptions {
  tenants: { id: string; label: string }[];
  gateways: string[];
  methods: string[];
  currencies: string[];
  failureCodes: string[];
}

export async function loadPaymentsFilterOptions(): Promise<PaymentsFilterOptions> {
  const since = new Date(Date.now() - 365 * DAY);
  const [tenants, distincts, currencies] = await Promise.all([
    db.tenant.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
      take: 500,
    }),
    db.platformInvoicePayment.findMany({
      where: { attemptedAt: { gte: since } },
      select: { gateway: true, method: true, failureCode: true },
      take: 5_000,
    }),
    db.platformBillingInvoice.findMany({
      select: { currency: true },
      distinct: ["currency"],
      take: 50,
    }),
  ]);
  const gateways = Array.from(new Set(distincts.map((d) => d.gateway))).sort();
  const methods = Array.from(new Set(distincts.map((d) => d.method).filter((x): x is string => !!x))).sort();
  const failureCodes = Array.from(new Set(distincts.map((d) => d.failureCode).filter((x): x is string => !!x))).sort();
  return {
    tenants: tenants.map((t) => ({ id: t.id, label: `${t.name} (${t.slug})` })),
    gateways, methods, failureCodes,
    currencies: currencies.map((c) => c.currency).sort(),
  };
}
