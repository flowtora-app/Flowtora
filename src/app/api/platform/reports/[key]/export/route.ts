// GET /api/platform/reports/[key]/export?format=csv|json|pdf
//
// Exports the data table for a single prebuilt report (the table
// shown under the chart on the detail page). Honours the same
// since/until query params as the detail view.
//
// PDF format renders the report (header + insights + table) via
// @react-pdf/renderer — pure JS, no headless Chromium needed, works
// on Vercel out of the box. Charts in PDF are intentionally text-
// only (insight callouts + table) since rendering Recharts SVG
// inside react-pdf needs a custom path; can be added in a later
// slice if there's demand.

import { requirePlatformStaff, logPlatformAudit } from "@/lib/platform";
import { findReportByKey } from "@/server/platform/reports/registry";
import { loadReport, type ReportFilters } from "@/server/platform/reports/loaders";
import { renderReportPdf } from "@/server/platform/reports/pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("reports.export")) {
    return new Response(JSON.stringify({ ok: false, error: "Your role can't export reports" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  const { key } = await params;
  const entry = findReportByKey(key);
  if (!entry) {
    return new Response(JSON.stringify({ ok: false, error: "Unknown report" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  const url = new URL(req.url);
  const sp = url.searchParams;
  const formatRaw = (sp.get("format") ?? "csv").toLowerCase();
  const format: "csv" | "json" | "pdf" =
    formatRaw === "json" ? "json" : formatRaw === "pdf" ? "pdf" : "csv";

  const filters: ReportFilters = {};
  const since = sp.get("since"); if (since) { const d = new Date(since); if (!Number.isNaN(d.getTime())) filters.since = d; }
  const until = sp.get("until"); if (until) { const d = new Date(until); if (!Number.isNaN(d.getTime())) filters.until = d; }

  const payload = await loadReport(entry.key, filters);
  const rows = payload.state === "PENDING" ? [] : payload.rows;

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.report_exported",
    entityType: "Report",
    metadata: { actor: ctx.email, key: entry.key, format, count: rows.length, filters: Object.fromEntries(sp.entries()) },
  });

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const baseFilename = `flowtora-${entry.key}-${ts}`;

  if (format === "pdf") {
    const buf = await renderReportPdf({
      report: { key: entry.key, name: entry.name, description: entry.description, icon: entry.icon, category: entry.category },
      payload,
    });
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${baseFilename}.pdf"`,
      },
    });
  }

  if (format === "json") {
    return new Response(JSON.stringify({
      reportKey: entry.key,
      reportName: entry.name,
      state: payload.state,
      note: payload.state !== "PENDING" ? payload.note : payload.note,
      rows,
    }, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${baseFilename}.json"`,
      },
    });
  }

  // CSV — derive column set from the union of row keys (consistent
  // with the detail-page data table).
  const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const csv = [
    columns.map(csvCell).join(","),
    ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(",")),
  ].join("\n");

  return new Response(csv || "(no rows)", {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${baseFilename}.csv"`,
    },
  });
}

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
