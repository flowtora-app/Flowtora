// GET /api/platform/activity/export?format=csv|json|ndjson
//
// Streams the current filtered activity feed as a downloadable file.
// Hard-capped at 100k rows per the spec; anything beyond should use a
// scheduled email export with a long-lived link (a separate slice).

import { requirePlatformStaff, logPlatformAudit } from "@/lib/platform";
import {
  loadActivityPage,
  parseActivityFilters,
} from "@/server/platform/activity-feed";

export const dynamic = "force-dynamic";

const MAX_ROWS = 100_000;
const PAGE_SIZE = 500;

export async function GET(req: Request) {
  const ctx = await requirePlatformStaff();
  const url = new URL(req.url);
  const sp = url.searchParams;
  const filters = parseActivityFilters(sp);
  const formatRaw = (sp.get("format") ?? "csv").toLowerCase();
  const format: "csv" | "json" | "ndjson" =
    formatRaw === "json" ? "json" : formatRaw === "ndjson" ? "ndjson" : "csv";

  // Walk pages of 500 until we hit MAX_ROWS or run out.
  const collected: Awaited<ReturnType<typeof loadActivityPage>> = [];
  let cursor: Date | undefined = undefined;
  while (collected.length < MAX_ROWS) {
    const rows = await loadActivityPage({
      filters,
      take: PAGE_SIZE,
      before: cursor,
    });
    if (rows.length === 0) break;
    collected.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    cursor = rows[rows.length - 1]!.createdAt;
  }
  const rows = collected.slice(0, MAX_ROWS);

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.activity_exported",
    entityType: "AuditLog",
    metadata: { actor: ctx.email, format, count: rows.length, filters: Object.fromEntries(sp.entries()) },
  });

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  if (format === "csv") {
    const csv = [
      [
        "id", "createdAt", "action", "actionLabel", "severity", "source",
        "tenantId", "tenantName", "tenantSlug", "tenantCountry",
        "userId", "userEmail", "userName", "userRole",
        "entityType", "entityId", "ipAddress", "userAgent",
      ].join(","),
      ...rows.map((r) => [
        csvCell(r.id),
        csvCell(r.createdAtIso),
        csvCell(r.action),
        csvCell(r.actionLabel),
        csvCell(r.severity),
        csvCell(r.source),
        csvCell(r.tenantId ?? ""),
        csvCell(r.tenant?.name ?? ""),
        csvCell(r.tenant?.slug ?? ""),
        csvCell(r.tenant?.country ?? ""),
        csvCell(r.userId ?? ""),
        csvCell(r.actor?.email ?? ""),
        csvCell(r.actor?.name ?? ""),
        csvCell(r.actor?.platformRole ?? ""),
        csvCell(r.entityType ?? ""),
        csvCell(r.entityId ?? ""),
        csvCell(r.ipAddress ?? ""),
        csvCell(r.userAgent ?? ""),
      ].join(",")),
    ].join("\n");
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="flowtora-activity-${ts}.csv"`,
      },
    });
  }

  if (format === "ndjson") {
    const ndjson = rows.map((r) => JSON.stringify(r)).join("\n");
    return new Response(ndjson, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Content-Disposition": `attachment; filename="flowtora-activity-${ts}.ndjson"`,
      },
    });
  }

  // Default: pretty JSON array
  return new Response(JSON.stringify({ count: rows.length, exportedAt: new Date().toISOString(), rows }, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="flowtora-activity-${ts}.json"`,
    },
  });
}

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
