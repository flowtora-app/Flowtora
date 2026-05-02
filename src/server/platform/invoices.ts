// Invoices data layer — Page 16 of the admin spec.
//
// Two distinct universes share the same row: SUBSCRIPTION (auto-issued
// by the dunning / renewal pipeline) and MANUAL (admin-issued via
// /platform/billing/invoices). The list filter ships both by default;
// the source column distinguishes them.

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type {
  PlatformInvoiceSource,
  PlatformInvoiceStatus,
} from "@prisma/client";

const DAY = 86_400_000;

/* ────────────────────────────────────────────────────────── */
/* Filters + list                                             */
/* ────────────────────────────────────────────────────────── */

export interface InvoicesFilters {
  q?: string;
  status?: PlatformInvoiceStatus;
  tenantId?: string;
  plan?: string;
  currency?: string;
  source?: PlatformInvoiceSource;
  issuedSince?: Date;
  issuedUntil?: Date;
  dueSince?: Date;
  dueUntil?: Date;
  paidSince?: Date;
  paidUntil?: Date;
  amountMin?: number;
  amountMax?: number;
  hasTax?: boolean;
  hasDiscount?: boolean;
}

export interface InvoiceRow {
  id: string;
  number: string;
  status: PlatformInvoiceStatus;
  isOverdue: boolean;
  source: PlatformInvoiceSource;
  total: number;
  amountPaid: number;
  currency: string;
  issuedAt: Date | null;
  dueAt: Date | null;
  paidAt: Date | null;
  voidedAt: Date | null;
  hasTax: boolean;
  hasDiscount: boolean;
  tenant: { id: string; name: string; slug: string; plan: string };
  createdByEmail: string;
}

export async function loadInvoicesList(args: {
  filters: InvoicesFilters;
  page: number;
  pageSize: number;
}): Promise<{ rows: InvoiceRow[]; total: number; filteredTotal: number }> {
  const { filters, page, pageSize } = args;
  const where: Prisma.PlatformBillingInvoiceWhereInput = {};

  if (filters.q) {
    const q = filters.q.trim();
    where.OR = [
      { id: q },
      { number: { contains: q, mode: "insensitive" } },
      { tenant: { name: { contains: q, mode: "insensitive" } } },
      { tenant: { slug: { contains: q, mode: "insensitive" } } },
    ];
  }
  if (filters.status) where.status = filters.status;
  if (filters.tenantId) where.tenantId = filters.tenantId;
  if (filters.currency) where.currency = filters.currency;
  if (filters.source) where.source = filters.source;
  if (filters.plan) {
    where.tenant = { ...(where.tenant as object ?? {}), plan: filters.plan as Prisma.TenantWhereInput["plan"] };
  }
  if (filters.issuedSince || filters.issuedUntil) {
    const issuedAt: Prisma.DateTimeNullableFilter = {};
    if (filters.issuedSince) issuedAt.gte = filters.issuedSince;
    if (filters.issuedUntil) issuedAt.lte = filters.issuedUntil;
    where.issuedAt = issuedAt;
  }
  if (filters.dueSince || filters.dueUntil) {
    const dueAt: Prisma.DateTimeNullableFilter = {};
    if (filters.dueSince) dueAt.gte = filters.dueSince;
    if (filters.dueUntil) dueAt.lte = filters.dueUntil;
    where.dueAt = dueAt;
  }
  if (filters.paidSince || filters.paidUntil) {
    const paidAt: Prisma.DateTimeNullableFilter = {};
    if (filters.paidSince) paidAt.gte = filters.paidSince;
    if (filters.paidUntil) paidAt.lte = filters.paidUntil;
    where.paidAt = paidAt;
  }
  if (filters.amountMin != null || filters.amountMax != null) {
    const total: Prisma.IntFilter = {};
    if (filters.amountMin != null) total.gte = filters.amountMin;
    if (filters.amountMax != null) total.lte = filters.amountMax;
    where.total = total;
  }
  if (filters.hasTax === true) where.tax = { gt: 0 };
  if (filters.hasTax === false) where.tax = 0;
  if (filters.hasDiscount === true) where.discount = { gt: 0 };
  if (filters.hasDiscount === false) where.discount = 0;

  const [total, filteredTotal, rows] = await Promise.all([
    db.platformBillingInvoice.count(),
    db.platformBillingInvoice.count({ where }),
    db.platformBillingInvoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        tenant: { select: { id: true, name: true, slug: true, plan: true } },
        createdBy: { select: { email: true } },
      },
    }),
  ]);

  const now = new Date();
  const mapped: InvoiceRow[] = rows.map((r) => {
    const isOverdue = (r.status === "SENT" || r.status === "OPEN")
      && !!r.dueAt && r.dueAt < now;
    return {
      id: r.id, number: r.number, status: r.status,
      isOverdue,
      source: r.source,
      total: r.total, amountPaid: r.amountPaid, currency: r.currency,
      issuedAt: r.issuedAt, dueAt: r.dueAt, paidAt: r.paidAt, voidedAt: r.voidedAt,
      hasTax: r.tax > 0, hasDiscount: r.discount > 0,
      tenant: r.tenant,
      createdByEmail: r.createdBy.email,
    };
  });
  return { rows: mapped, total, filteredTotal };
}

/* ────────────────────────────────────────────────────────── */
/* KPIs                                                        */
/* ────────────────────────────────────────────────────────── */

export interface InvoicesKpi {
  totalThisPeriod: number;
  paid: number;
  open: number;
  pastDue: number;
  voided: number;
  avgDsoDays: number | null;
}

export async function loadInvoicesKpi(periodDays = 30): Promise<InvoicesKpi> {
  const periodStart = new Date(Date.now() - periodDays * DAY);
  const now = new Date();
  const [thisPeriod, paid, open, pastDue, voided, paidRows] = await Promise.all([
    db.platformBillingInvoice.aggregate({
      where: { issuedAt: { gte: periodStart } },
      _sum: { total: true },
    }),
    db.platformBillingInvoice.count({ where: { status: "PAID" } }),
    db.platformBillingInvoice.count({
      where: { status: { in: ["SENT", "OPEN"] }, OR: [{ dueAt: null }, { dueAt: { gte: now } }] },
    }),
    db.platformBillingInvoice.count({
      where: { status: { in: ["SENT", "OPEN"] }, dueAt: { lt: now } },
    }),
    db.platformBillingInvoice.count({
      where: { status: { in: ["VOIDED", "UNCOLLECTIBLE"] } },
    }),
    db.platformBillingInvoice.findMany({
      where: { status: "PAID", paidAt: { gte: periodStart }, issuedAt: { not: null } },
      select: { issuedAt: true, paidAt: true },
      take: 5_000,
    }),
  ]);
  let dsoSum = 0;
  let dsoN = 0;
  for (const r of paidRows) {
    if (!r.issuedAt || !r.paidAt) continue;
    const days = (r.paidAt.getTime() - r.issuedAt.getTime()) / DAY;
    if (days >= 0) { dsoSum += days; dsoN += 1; }
  }
  return {
    totalThisPeriod: thisPeriod._sum.total ?? 0,
    paid, open, pastDue, voided,
    avgDsoDays: dsoN === 0 ? null : Math.round(dsoSum / dsoN),
  };
}

/* ────────────────────────────────────────────────────────── */
/* Detail loader                                              */
/* ────────────────────────────────────────────────────────── */

export interface TaxLine {
  jurisdiction: string;
  rate: number;
  amount: number;
}

export interface InvoiceDetail extends InvoiceRow {
  subtotal: number;
  discount: number;
  tax: number;
  notes: string | null;
  internalNotes: string | null;
  termsText: string | null;
  voidReason: string | null;
  taxBreakdown: TaxLine[];
  items: {
    id: string;
    description: string;
    quantity: number;
    unitAmount: number;
    lineTotal: number;
    position: number;
  }[];
  payments: {
    id: string;
    gateway: string;
    gatewayPaymentId: string | null;
    status: string;
    method: string | null;
    amount: number;
    fee: number;
    net: number;
    failureCode: string | null;
    failureReason: string | null;
    attemptedAt: Date;
    refundedAt: Date | null;
  }[];
  creditNotes: {
    id: string;
    number: string;
    amount: number;
    reason: string;
    notes: string | null;
    issuedAt: Date;
    issuedBy: string;
  }[];
  billTo: {
    name: string;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    country: string | null;
    taxId: string | null;
  };
  /** Audit timeline for this invoice id. */
  auditEvents: {
    id: string;
    action: string;
    createdAt: Date;
    actorEmail: string | null;
  }[];
}

export async function loadInvoiceDetail(id: string): Promise<InvoiceDetail | null> {
  const r = await db.platformBillingInvoice.findUnique({
    where: { id },
    include: {
      tenant: {
        select: {
          id: true, name: true, slug: true, plan: true,
          taxId: true, addressLine1: true, addressLine2: true,
          city: true, region: true, postalCode: true, country: true,
        },
      },
      createdBy: { select: { email: true } },
      items: { orderBy: { position: "asc" } },
      payments: { orderBy: { attemptedAt: "desc" }, take: 50 },
      creditNotes: { orderBy: { issuedAt: "desc" }, take: 20 },
    },
  });
  if (!r) return null;

  const audit = await db.auditLog.findMany({
    where: { entityType: "PlatformBillingInvoice", entityId: r.id },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: { id: true, action: true, createdAt: true, userId: true },
  });
  const userIds = Array.from(new Set(audit.map((a) => a.userId).filter((x): x is string => !!x)));
  const users = userIds.length === 0 ? [] : await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u.email]));

  const now = new Date();
  const isOverdue = (r.status === "SENT" || r.status === "OPEN")
    && !!r.dueAt && r.dueAt < now;
  return {
    id: r.id, number: r.number, status: r.status,
    isOverdue,
    source: r.source,
    total: r.total, amountPaid: r.amountPaid, currency: r.currency,
    issuedAt: r.issuedAt, dueAt: r.dueAt, paidAt: r.paidAt, voidedAt: r.voidedAt,
    hasTax: r.tax > 0, hasDiscount: r.discount > 0,
    tenant: { id: r.tenant.id, name: r.tenant.name, slug: r.tenant.slug, plan: r.tenant.plan },
    createdByEmail: r.createdBy.email,
    subtotal: r.subtotal, discount: r.discount, tax: r.tax,
    notes: r.notes, internalNotes: r.internalNotes, termsText: r.termsText,
    voidReason: r.voidReason,
    taxBreakdown: (r.taxBreakdown ?? []) as unknown as TaxLine[],
    items: r.items.map((it) => ({
      id: it.id, description: it.description,
      quantity: it.quantity, unitAmount: it.unitAmount,
      lineTotal: it.lineTotal, position: it.position,
    })),
    payments: r.payments.map((p) => ({
      id: p.id, gateway: p.gateway, gatewayPaymentId: p.gatewayPaymentId,
      status: p.status, method: p.method,
      amount: p.amount, fee: p.fee, net: p.net,
      failureCode: p.failureCode, failureReason: p.failureReason,
      attemptedAt: p.attemptedAt, refundedAt: p.refundedAt,
    })),
    creditNotes: r.creditNotes.map((c) => ({
      id: c.id, number: c.number, amount: c.amount,
      reason: c.reason, notes: c.notes,
      issuedAt: c.issuedAt, issuedBy: c.issuedBy,
    })),
    billTo: {
      name: r.tenant.name,
      addressLine1: r.tenant.addressLine1, addressLine2: r.tenant.addressLine2,
      city: r.tenant.city, region: r.tenant.region,
      postalCode: r.tenant.postalCode, country: r.tenant.country,
      taxId: r.tenant.taxId,
    },
    auditEvents: audit.map((a) => ({
      id: a.id, action: a.action, createdAt: a.createdAt,
      actorEmail: a.userId ? userMap.get(a.userId) ?? null : null,
    })),
  };
}

/* ────────────────────────────────────────────────────────── */
/* Filter dropdown options                                     */
/* ────────────────────────────────────────────────────────── */

export interface InvoicesFilterOptions {
  tenants: { id: string; label: string }[];
  plans: { slug: string; name: string }[];
  currencies: string[];
}

export async function loadInvoicesFilterOptions(): Promise<InvoicesFilterOptions> {
  const [tenants, plans, currencyDistinct] = await Promise.all([
    db.tenant.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
      take: 500,
    }),
    db.pricingPlan.findMany({
      where: { status: { not: "ARCHIVED" } },
      orderBy: { sortOrder: "asc" },
      select: { slug: true, name: true },
    }),
    db.platformBillingInvoice.findMany({
      select: { currency: true },
      distinct: ["currency"],
      take: 50,
    }),
  ]);
  return {
    tenants: tenants.map((t) => ({ id: t.id, label: `${t.name} (${t.slug})` })),
    plans: plans.map((p) => ({ slug: p.slug.toUpperCase(), name: p.name })),
    currencies: currencyDistinct.map((c) => c.currency).sort(),
  };
}
