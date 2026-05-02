// GET /api/platform/billing/invoices/[id]/pdf
//
// Honest deferral: we don't render @react-pdf/renderer for invoices
// yet, so this endpoint returns a JSON dump of the invoice + bill-to
// + line items + payments + credit notes. The download contract is
// stable — when the renderer lands, swap the body for the rendered
// PDF and the row-menu / detail-page links keep working.

import { logPlatformAudit, requirePlatformStaff } from "@/lib/platform";
import { loadInvoiceDetail } from "@/server/platform/invoices";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("billing.read")) {
    return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
      status: 403, headers: { "Content-Type": "application/json" },
    });
  }
  void req;
  const { id } = await params;
  const detail = await loadInvoiceDetail(id);
  if (!detail) {
    return new Response(JSON.stringify({ ok: false, error: "Invoice not found" }), {
      status: 404, headers: { "Content-Type": "application/json" },
    });
  }

  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: detail.tenant.id,
    action: "platform.invoice_pdf_downloaded",
    entityType: "PlatformBillingInvoice",
    entityId: detail.id,
    metadata: { actor: ctx.email },
  });

  // JSON shim until the @react-pdf/renderer for invoices ships.
  return new Response(JSON.stringify(detail, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${detail.number}.json"`,
      "Cache-Control": "no-store",
      "X-Flowtora-Format-Note": "PDF renderer not yet wired; returning JSON.",
    },
  });
}
