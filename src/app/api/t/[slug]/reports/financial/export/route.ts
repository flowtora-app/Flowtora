import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { resolveRange, resolveBranch } from "@/lib/reports";
import { applyBranchScopeOn } from "@/lib/locations";
import { rowsToCsv, csvResponse } from "@/lib/csv";
import { outstandingBalance } from "@/lib/invoices";
import { OPEN_INVOICE_STATUSES } from "@/lib/invoices";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const ctx = await requirePermission(slug, "reports:financial").catch(() => null);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const sp  = Object.fromEntries(url.searchParams.entries());
  const range  = resolveRange(sp);
  const branch = await resolveBranch(ctx.tenant.id, ctx.branchScope, sp.branch);

  const invoicesWhere: Prisma.InvoiceWhereInput = applyBranchScopeOn(
    {
      tenantId:  ctx.tenant.id,
      createdAt: { gte: range.from, lte: range.to },
      status:    { not: "VOID" as const },
    } as Prisma.InvoiceWhereInput,
    "customer",
    branch.effectiveScope,
  );

  const paymentsWhere: Prisma.PaymentWhereInput = applyBranchScopeOn(
    {
      tenantId:    ctx.tenant.id,
      receivedAt:  { gte: range.from, lte: range.to },
      voidedAt:    null,
      failedAt:    null,
    } as Prisma.PaymentWhereInput,
    "invoice",
    branch.effectiveScope,
  );

  const [invoices, payments, openInvoices] = await Promise.all([
    db.invoice.findMany({
      where: invoicesWhere,
      select: {
        number: true, status: true, total: true, amountPaid: true,
        taxAmount: true, dueDate: true, createdAt: true,
        customer: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.payment.findMany({
      where: paymentsWhere,
      select: {
        amount: true, method: true, receivedAt: true,
        invoice: { select: { number: true, customer: { select: { name: true } } } },
      },
      orderBy: { receivedAt: "desc" },
    }),
    db.invoice.findMany({
      where: applyBranchScopeOn(
        { tenantId: ctx.tenant.id, status: { in: OPEN_INVOICE_STATUSES } } as Prisma.InvoiceWhereInput,
        "customer",
        branch.effectiveScope,
      ),
      select: {
        number: true, total: true, amountPaid: true,
        refundedAmount: true, writtenOffAmount: true, dueDate: true,
        customer: { select: { name: true } },
      },
    }),
  ]);

  const type = url.searchParams.get("type") ?? "invoices";

  if (type === "payments") {
    const rows = payments.map((p) => ({
      "Date":     p.receivedAt,
      "Customer": p.invoice.customer.name,
      "Invoice":  p.invoice.number,
      "Method":   p.method,
      "Amount":   Number(p.amount).toFixed(2),
    }));
    const csv = rowsToCsv(["Date", "Customer", "Invoice", "Method", "Amount"], rows);
    return csvResponse(`payments-${range.label.replace(/\s/g, "-")}.csv`, csv);
  }

  if (type === "ar") {
    const rows = openInvoices.map((inv) => ({
      "Invoice":  inv.number,
      "Customer": inv.customer.name,
      "Total":    Number(inv.total).toFixed(2),
      "Balance":  outstandingBalance(inv).toFixed(2),
      "Due date": inv.dueDate ? inv.dueDate.toISOString().split("T")[0] : "",
    }));
    const csv = rowsToCsv(["Invoice", "Customer", "Total", "Balance", "Due date"], rows);
    return csvResponse(`ar-aging-${new Date().toISOString().split("T")[0]}.csv`, csv);
  }

  // Default: invoices in range.
  const rows = invoices.map((inv) => ({
    "Invoice":   inv.number,
    "Customer":  inv.customer.name,
    "Status":    inv.status,
    "Total":     Number(inv.total).toFixed(2),
    "Paid":      Number(inv.amountPaid).toFixed(2),
    "Tax":       Number(inv.taxAmount).toFixed(2),
    "Date":      inv.createdAt,
    "Due date":  inv.dueDate ? inv.dueDate.toISOString().split("T")[0] : "",
  }));
  const csv = rowsToCsv(["Invoice", "Customer", "Status", "Total", "Paid", "Tax", "Date", "Due date"], rows);
  return csvResponse(`invoices-${range.label.replace(/\s/g, "-")}.csv`, csv);
}
