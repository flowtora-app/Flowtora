// Page 21 — Tax reports CSV export.
//
// /api/platform/billing/tax/export?report=<jurisdiction|month|exempt|reverse|refunds>&since=&until=
// Pulls the same loaders as the Reports tab and formats a CSV.

import { NextResponse } from "next/server";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadRefundsAndAdjustments,
  loadReverseChargeSales,
  loadTaxByJurisdiction,
  loadTaxByMonth,
  loadTaxExemptSales,
  parseTaxReportPeriod,
} from "@/server/platform/tax-reports";

export const dynamic = "force-dynamic";

function csvEscape(v: string | number): string {
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowsToCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const r of rows) lines.push(r.map(csvEscape).join(","));
  return lines.join("\n");
}

export async function GET(req: Request) {
  await requirePlatformStaff();
  const url = new URL(req.url);
  const report = url.searchParams.get("report") ?? "jurisdiction";
  const sp: Record<string, string | undefined> = {};
  for (const [k, v] of url.searchParams.entries()) sp[k] = v;
  const period = parseTaxReportPeriod(sp);

  let csv = "";
  let filename = "tax-report.csv";

  if (report === "jurisdiction") {
    const rows = await loadTaxByJurisdiction(period);
    csv = rowsToCsv(
      ["jurisdiction", "invoices", "taxable_sales_cents", "tax_collected_cents"],
      rows.map((r) => [r.jurisdiction, r.invoices, r.taxableSales, r.taxCollected]),
    );
    filename = "tax-by-jurisdiction.csv";
  } else if (report === "month") {
    const rows = await loadTaxByMonth();
    csv = rowsToCsv(
      ["month", "invoices", "taxable_sales_cents", "tax_collected_cents"],
      rows.map((r) => [r.month, r.invoices, r.taxableSales, r.taxCollected]),
    );
    filename = "tax-by-month.csv";
  } else if (report === "exempt") {
    const rows = await loadTaxExemptSales(period);
    csv = rowsToCsv(
      ["tenant", "exemption_type", "invoices", "taxable_sales_cents", "tax_waived_cents"],
      rows.map((r) => [r.tenantName, r.exemptionType, r.invoices, r.taxableSales, r.taxWaived]),
    );
    filename = "tax-exempt-sales.csv";
  } else if (report === "reverse") {
    const rows = await loadReverseChargeSales(period);
    csv = rowsToCsv(
      ["tenant", "jurisdictions", "invoices", "net_sales_cents"],
      rows.map((r) => [r.tenantName, r.jurisdictions.join(";"), r.invoices, r.netSales]),
    );
    filename = "tax-reverse-charge-sales.csv";
  } else if (report === "refunds") {
    const rows = await loadRefundsAndAdjustments(period);
    csv = rowsToCsv(
      ["jurisdiction", "refunds", "refunded_tax_cents", "voided", "uncollectible"],
      rows.map((r) => [r.jurisdiction, r.refunds, r.refundedTax, r.voided, r.uncollectible]),
    );
    filename = "tax-refunds-adjustments.csv";
  } else {
    return NextResponse.json({ error: "Unknown report" }, { status: 400 });
  }

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
