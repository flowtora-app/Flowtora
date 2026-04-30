// GET /api/platform/reports/[key]/export?format=csv|json
//
// Exports the data table for a single prebuilt report (the table
// shown under the chart on the detail page). Honours the same
// since/until query params as the detail view.

import { requirePlatformStaff, logPlatformAudit } from "@/lib/platform";
import { findReportByKey } from "@/server/platform/reports/registry";
import { loadReport, type ReportFilters } from "@/server/platform/reports/loaders";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const ctx = await requirePlatformStaff();
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
  const format = (sp.get("format") ?? "csv").toLowerCase() === "json" ? "json" : "csv";

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
