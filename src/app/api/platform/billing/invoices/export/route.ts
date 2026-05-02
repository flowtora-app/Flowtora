// GET /api/platform/billing/invoices/export
//
// CSV export of the invoices list honoring filters. When the
// ?ids=<csv> param is present (from the bulk-export-selected button),
// the rows are restricted to those ids and the rest of the filters
// are ignored.

import { logPlatformAudit, requirePlatformStaff } from "@/lib/platform";
import {
  loadInvoicesList,
  type InvoicesFilters,
} from "@/server/platform/invoices";
import { db } from "@/lib/db";
import type {
  PlatformInvoiceSource,
  PlatformInvoiceStatus,
} from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HARD_CAP = 10_000;
const PAGE_SIZE = 500;

const STATUSES = new Set<PlatformInvoiceStatus>([
  "DRAFT", "SENT", "OPEN", "PAID", "VOIDED", "UNCOLLECTIBLE", "REFUNDED",
]);
const SOURCES = new Set<PlatformInvoiceSource>(["SUBSCRIPTION", "MANUAL"]);

function parseFilters(sp: URLSearchParams): InvoicesFilters {
  const f: InvoicesFilters = {};
  const q = sp.get("q"); if (q && q.trim()) f.q = q.trim();
  const status = sp.get("status");
  if (status && STATUSES.has(status as PlatformInvoiceStatus)) f.status = status as PlatformInvoiceStatus;
  const tenant = sp.get("tenant"); if (tenant) f.tenantId = tenant;
  const plan = sp.get("plan"); if (plan) f.plan = plan.toUpperCase();
  const currency = sp.get("currency"); if (currency) f.currency = currency.toUpperCase();
  const source = sp.get("source");
  if (source && SOURCES.has(source as PlatformInvoiceSource)) f.source = source as PlatformInvoiceSource;
  const since = sp.get("issuedSince"); if (since) {
    const d = new Date(since); if (!Number.isNaN(d.getTime())) f.issuedSince = d;
  }
  const until = sp.get("issuedUntil"); if (until) {
    const d = new Date(until); if (!Number.isNaN(d.getTime())) f.issuedUntil = d;
  }
  return f;
}

export async function GET(req: Request) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("billing.read")) {
    return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
      status: 403, headers: { "Content-Type": "application/json" },
    });
  }
  const url = new URL(req.url);
  const idsParam = url.searchParams.get("ids");
  let collected: Awaited<ReturnType<typeof loadInvoicesList>>["rows"];

  if (idsParam) {
    const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
    const rows = await db.platformBillingInvoice.findMany({
      where: { id: { in: ids } },
      orderBy: { createdAt: "desc" },
      include: {
        tenant: { select: { id: true, name: true, slug: true, plan: true } },
        createdBy: { select: { email: true } },
      },
    });
    const now = new Date();
    collected = rows.map((r) => ({
      id: r.id, number: r.number, status: r.status,
      isOverdue: (r.status === "SENT" || r.status === "OPEN") && !!r.dueAt && r.dueAt < now,
      source: r.source,
      total: r.total, amountPaid: r.amountPaid, currency: r.currency,
      issuedAt: r.issuedAt, dueAt: r.dueAt, paidAt: r.paidAt, voidedAt: r.voidedAt,
      hasTax: r.tax > 0, hasDiscount: r.discount > 0,
      tenant: r.tenant, createdByEmail: r.createdBy.email,
    }));
  } else {
    const filters = parseFilters(url.searchParams);
    const acc: Awaited<ReturnType<typeof loadInvoicesList>>["rows"] = [];
    let page = 1;
    while (acc.length < HARD_CAP) {
      const res = await loadInvoicesList({ filters, page, pageSize: PAGE_SIZE });
      if (res.rows.length === 0) break;
      acc.push(...res.rows);
      if (res.rows.length < PAGE_SIZE) break;
      page += 1;
    }
    collected = acc.slice(0, HARD_CAP);
  }

  const headers = [
    "invoice_id", "number", "tenant_id", "tenant_name", "tenant_slug", "plan",
    "status", "source", "total_minor", "amount_paid_minor", "currency",
    "issued_at_iso", "due_at_iso", "paid_at_iso", "voided_at_iso",
    "has_tax", "has_discount", "is_overdue", "created_by_email",
  ];
  const lines = [headers.join(",")];
  for (const r of collected) {
    lines.push([
      r.id, r.number,
      r.tenant.id, csv(r.tenant.name), r.tenant.slug, r.tenant.plan,
      r.status, r.source,
      r.total, r.amountPaid, r.currency,
      r.issuedAt?.toISOString() ?? "",
      r.dueAt?.toISOString() ?? "",
      r.paidAt?.toISOString() ?? "",
      r.voidedAt?.toISOString() ?? "",
      r.hasTax ? "1" : "0",
      r.hasDiscount ? "1" : "0",
      r.isOverdue ? "1" : "0",
      csv(r.createdByEmail),
    ].join(","));
  }

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.invoices_exported",
    entityType: "PlatformBillingInvoice",
    metadata: { actor: ctx.email, count: collected.length, filters: Object.fromEntries(url.searchParams.entries()) },
  });

  return new Response(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="invoices-${stamp()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function csv(s: string): string {
  if (!s) return "";
  const needsQuotes = /[",\n\r]/.test(s);
  const escaped = s.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function stamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
