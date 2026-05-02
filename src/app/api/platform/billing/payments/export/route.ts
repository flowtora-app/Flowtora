// GET /api/platform/billing/payments/export
//
// CSV export of payment attempts honoring filters.

import { logPlatformAudit, requirePlatformStaff } from "@/lib/platform";
import {
  loadPaymentsList,
  type PaymentStatus,
  type PaymentsFilters,
} from "@/server/platform/payments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HARD_CAP = 10_000;
const PAGE_SIZE = 500;

const STATUSES = new Set<PaymentStatus>([
  "succeeded", "failed", "pending", "refunded", "partial_refund", "disputed",
]);

function parseFilters(sp: URLSearchParams): PaymentsFilters {
  const f: PaymentsFilters = {};
  const q = sp.get("q"); if (q && q.trim()) f.q = q.trim();
  const status = sp.get("status");
  if (status && STATUSES.has(status as PaymentStatus)) f.status = status as PaymentStatus;
  const gateway = sp.get("gateway"); if (gateway) f.gateway = gateway;
  const method = sp.get("method"); if (method) f.method = method;
  const currency = sp.get("currency"); if (currency) f.currency = currency.toUpperCase();
  const tenant = sp.get("tenant"); if (tenant) f.tenantId = tenant;
  const failure = sp.get("failure"); if (failure) f.failureCode = failure;
  const since = sp.get("since"); if (since) {
    const d = new Date(since); if (!Number.isNaN(d.getTime())) f.since = d;
  }
  const until = sp.get("until"); if (until) {
    const d = new Date(until); if (!Number.isNaN(d.getTime())) f.until = d;
  }
  const min = sp.get("amountMin");
  if (min && !Number.isNaN(Number(min))) f.amountMin = Math.round(Number(min) * 100);
  const max = sp.get("amountMax");
  if (max && !Number.isNaN(Number(max))) f.amountMax = Math.round(Number(max) * 100);
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
  const filters = parseFilters(url.searchParams);

  const collected: Awaited<ReturnType<typeof loadPaymentsList>>["rows"] = [];
  let page = 1;
  while (collected.length < HARD_CAP) {
    const res = await loadPaymentsList({ filters, page, pageSize: PAGE_SIZE });
    if (res.rows.length === 0) break;
    collected.push(...res.rows);
    if (res.rows.length < PAGE_SIZE) break;
    page += 1;
  }
  const rows = collected.slice(0, HARD_CAP);

  const headers = [
    "payment_id", "attempted_at_iso", "status", "gateway", "gateway_payment_id",
    "method", "amount_minor", "fee_minor", "net_minor", "currency",
    "failure_code", "failure_reason",
    "invoice_id", "invoice_number", "tenant_id", "tenant_name",
    "refunded_at_iso",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      r.id, r.attemptedAt.toISOString(), r.status,
      r.gateway, r.gatewayPaymentId ?? "",
      csv(r.method ?? ""),
      r.amount, r.fee, r.net, r.currency,
      csv(r.failureCode ?? ""), csv(r.failureReason ?? ""),
      r.invoiceId, r.invoiceNumber,
      r.tenant.id, csv(r.tenant.name),
      r.refundedAt?.toISOString() ?? "",
    ].join(","));
  }

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.payments_exported",
    entityType: "PlatformInvoicePayment",
    metadata: { actor: ctx.email, count: rows.length, filters: Object.fromEntries(url.searchParams.entries()) },
  });

  return new Response(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payments-${stamp()}.csv"`,
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
