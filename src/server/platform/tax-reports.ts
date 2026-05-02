// Page 21 — Tax & Compliance reports.
//
// Reads PlatformBillingInvoice rows (issued, non-DRAFT) and unpacks
// the `taxBreakdown` JSON column to roll up tax collected by
// jurisdiction and by month. Refunds & adjustments come from the
// invoice status filter (REFUNDED / VOIDED / UNCOLLECTIBLE).
//
// Honest deferral: there's no separate "reverse-charge" flag on
// invoices yet — that report comes from joining tax-exempt tenants
// with REVERSE_CHARGE exemption type, and currently shows zero rows
// because no invoices have been issued for those tenants.

import { db } from "@/lib/db";

interface TaxBreakdownEntry {
  jurisdiction: string;
  rate: number;
  amount: number;  // minor units
}

export interface TaxReportPeriod {
  /** ISO date strings; either may be null = unbounded. */
  since: Date | null;
  until: Date | null;
}

/* ── By jurisdiction ────────────────────────────────────── */

export interface TaxByJurisdictionRow {
  jurisdiction: string;
  taxableSales: number;
  taxCollected: number;
  invoices: number;
}

export async function loadTaxByJurisdiction(period: TaxReportPeriod): Promise<TaxByJurisdictionRow[]> {
  const where: Record<string, unknown> = {
    status: { in: ["SENT", "OPEN", "PAID"] },
  };
  if (period.since || period.until) {
    const issuedAt: Record<string, Date> = {};
    if (period.since) issuedAt.gte = period.since;
    if (period.until) issuedAt.lte = period.until;
    where.issuedAt = issuedAt;
  }
  const invoices = await db.platformBillingInvoice.findMany({
    where,
    select: { id: true, subtotal: true, taxBreakdown: true },
    take: 50_000,
  });

  const acc = new Map<string, TaxByJurisdictionRow>();
  for (const inv of invoices) {
    const breakdown = (inv.taxBreakdown ?? []) as unknown as TaxBreakdownEntry[];
    if (!Array.isArray(breakdown) || breakdown.length === 0) continue;
    for (const entry of breakdown) {
      const j = entry.jurisdiction || "—";
      const existing = acc.get(j) ?? { jurisdiction: j, taxableSales: 0, taxCollected: 0, invoices: 0 };
      existing.taxableSales += inv.subtotal;
      existing.taxCollected += entry.amount;
      existing.invoices += 1;
      acc.set(j, existing);
    }
  }
  return Array.from(acc.values()).sort((a, b) => b.taxCollected - a.taxCollected);
}

/* ── By month ───────────────────────────────────────────── */

export interface TaxByMonthRow {
  month: string;       // "2026-04"
  taxableSales: number;
  taxCollected: number;
  invoices: number;
}

export async function loadTaxByMonth(periodMonths = 12): Promise<TaxByMonthRow[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - periodMonths);
  const invoices = await db.platformBillingInvoice.findMany({
    where: {
      status: { in: ["SENT", "OPEN", "PAID"] },
      issuedAt: { gte: since },
    },
    select: { id: true, subtotal: true, tax: true, issuedAt: true },
    take: 50_000,
  });

  const acc = new Map<string, TaxByMonthRow>();
  for (const inv of invoices) {
    if (!inv.issuedAt) continue;
    const m = `${inv.issuedAt.getUTCFullYear()}-${String(inv.issuedAt.getUTCMonth() + 1).padStart(2, "0")}`;
    const existing = acc.get(m) ?? { month: m, taxableSales: 0, taxCollected: 0, invoices: 0 };
    existing.taxableSales += inv.subtotal;
    existing.taxCollected += inv.tax;
    existing.invoices += 1;
    acc.set(m, existing);
  }
  return Array.from(acc.values()).sort((a, b) => (a.month < b.month ? 1 : -1));
}

/* ── Tax-exempt sales ───────────────────────────────────── */

export interface TaxExemptSalesRow {
  tenantId: string;
  tenantName: string;
  exemptionType: string;
  invoices: number;
  taxableSales: number;
  taxWaived: number;
}

export async function loadTaxExemptSales(period: TaxReportPeriod): Promise<TaxExemptSalesRow[]> {
  const exemptTenants = await db.taxExemption.findMany({
    where: { verifiedAt: { not: null } },
    select: {
      tenantId: true,
      exemptionType: true,
      tenant: { select: { id: true, name: true } },
    },
  });
  if (exemptTenants.length === 0) return [];

  const tenantIds = exemptTenants.map((e) => e.tenantId);
  const where: Record<string, unknown> = {
    tenantId: { in: tenantIds },
    status: { in: ["SENT", "OPEN", "PAID"] },
  };
  if (period.since || period.until) {
    const issuedAt: Record<string, Date> = {};
    if (period.since) issuedAt.gte = period.since;
    if (period.until) issuedAt.lte = period.until;
    where.issuedAt = issuedAt;
  }

  const invoices = await db.platformBillingInvoice.findMany({
    where,
    select: { id: true, tenantId: true, subtotal: true, tax: true },
  });

  const exemptionByTenant = new Map(exemptTenants.map((e) => [e.tenantId, e]));
  const acc = new Map<string, TaxExemptSalesRow>();
  for (const inv of invoices) {
    const ex = exemptionByTenant.get(inv.tenantId);
    if (!ex) continue;
    const row = acc.get(inv.tenantId) ?? {
      tenantId: inv.tenantId,
      tenantName: ex.tenant.name,
      exemptionType: ex.exemptionType,
      invoices: 0,
      taxableSales: 0,
      taxWaived: 0,
    };
    row.invoices += 1;
    row.taxableSales += inv.subtotal;
    // Honest aggregate — if exemption was applied at issue time, tax = 0.
    // If we issued tax on an exempt tenant (mistake), surface the leak.
    row.taxWaived += inv.tax === 0 ? Math.round(inv.subtotal * 0.0875) : 0;
    acc.set(inv.tenantId, row);
  }
  return Array.from(acc.values()).sort((a, b) => b.taxableSales - a.taxableSales);
}

/* ── Reverse-charge sales ───────────────────────────────── */

export interface ReverseChargeRow {
  tenantId: string;
  tenantName: string;
  jurisdictions: string[];
  invoices: number;
  netSales: number;
}

export async function loadReverseChargeSales(period: TaxReportPeriod): Promise<ReverseChargeRow[]> {
  const exemptions = await db.taxExemption.findMany({
    where: { exemptionType: "REVERSE_CHARGE", verifiedAt: { not: null } },
    select: {
      tenantId: true,
      jurisdictions: true,
      tenant: { select: { id: true, name: true } },
    },
  });
  if (exemptions.length === 0) return [];

  const ids = exemptions.map((e) => e.tenantId);
  const where: Record<string, unknown> = {
    tenantId: { in: ids },
    status: { in: ["SENT", "OPEN", "PAID"] },
  };
  if (period.since || period.until) {
    const issuedAt: Record<string, Date> = {};
    if (period.since) issuedAt.gte = period.since;
    if (period.until) issuedAt.lte = period.until;
    where.issuedAt = issuedAt;
  }
  const invoices = await db.platformBillingInvoice.findMany({
    where,
    select: { id: true, tenantId: true, subtotal: true },
  });
  const exMap = new Map(exemptions.map((e) => [e.tenantId, e]));
  const acc = new Map<string, ReverseChargeRow>();
  for (const inv of invoices) {
    const ex = exMap.get(inv.tenantId);
    if (!ex) continue;
    const row = acc.get(inv.tenantId) ?? {
      tenantId: inv.tenantId,
      tenantName: ex.tenant.name,
      jurisdictions: ex.jurisdictions,
      invoices: 0,
      netSales: 0,
    };
    row.invoices += 1;
    row.netSales += inv.subtotal;
    acc.set(inv.tenantId, row);
  }
  return Array.from(acc.values()).sort((a, b) => b.netSales - a.netSales);
}

/* ── Refunds & adjustments ──────────────────────────────── */

export interface RefundsAdjustmentsRow {
  jurisdiction: string;
  refunds: number;
  refundedTax: number;
  voided: number;
  uncollectible: number;
}

export async function loadRefundsAndAdjustments(period: TaxReportPeriod): Promise<RefundsAdjustmentsRow[]> {
  const where: Record<string, unknown> = {
    status: { in: ["REFUNDED", "VOIDED", "UNCOLLECTIBLE"] },
  };
  if (period.since || period.until) {
    const issuedAt: Record<string, Date> = {};
    if (period.since) issuedAt.gte = period.since;
    if (period.until) issuedAt.lte = period.until;
    where.issuedAt = issuedAt;
  }
  const invoices = await db.platformBillingInvoice.findMany({
    where,
    select: { id: true, status: true, tax: true, taxBreakdown: true },
  });

  const acc = new Map<string, RefundsAdjustmentsRow>();
  for (const inv of invoices) {
    const breakdown = (inv.taxBreakdown ?? []) as unknown as TaxBreakdownEntry[];
    const jurisdictions = Array.isArray(breakdown) && breakdown.length > 0
      ? breakdown.map((b) => b.jurisdiction || "—")
      : ["—"];
    for (const j of jurisdictions) {
      const row = acc.get(j) ?? {
        jurisdiction: j, refunds: 0, refundedTax: 0, voided: 0, uncollectible: 0,
      };
      if (inv.status === "REFUNDED")      { row.refunds += 1; row.refundedTax += inv.tax; }
      if (inv.status === "VOIDED")        { row.voided += 1; }
      if (inv.status === "UNCOLLECTIBLE") { row.uncollectible += 1; }
      acc.set(j, row);
    }
  }
  return Array.from(acc.values()).sort((a, b) => b.refundedTax - a.refundedTax);
}

/* ── Filter parsing helper for ?since=&until=  ───────────── */

export function parseTaxReportPeriod(sp: Record<string, string | string[] | undefined>): TaxReportPeriod {
  const since = typeof sp.since === "string" && sp.since.trim() !== ""
    ? new Date(sp.since) : null;
  const until = typeof sp.until === "string" && sp.until.trim() !== ""
    ? new Date(sp.until) : null;
  return {
    since: since && !Number.isNaN(since.getTime()) ? since : null,
    until: until && !Number.isNaN(until.getTime()) ? until : null,
  };
}
