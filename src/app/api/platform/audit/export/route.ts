// GET /api/platform/audit/export?format=csv|json|ndjson
//
// Streams the filtered audit log honoring the same URL params the
// page uses. Capped at 50k rows to keep memory bounded; for larger
// exports the spec calls for an async-queue + signed-URL flow that's
// honestly deferred today.

import { logPlatformAudit, requirePlatformStaff } from "@/lib/platform";
import {
  loadAuditList,
  type AuditFilters,
} from "@/server/platform/audit-log";
import type { AuditSeverity, AuditSource } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HARD_CAP = 50_000;
const PAGE_SIZE = 1_000;

const SEVERITIES = new Set<AuditSeverity>(["INFO", "WARNING", "CRITICAL"]);
const SOURCES = new Set<AuditSource>(["WEB", "API", "CLI", "SYSTEM"]);

function parseFilters(sp: URLSearchParams): AuditFilters {
  const f: AuditFilters = {};
  const q = sp.get("q"); if (q && q.trim()) f.q = q.trim();
  const actor = sp.get("actor"); if (actor) f.actorId = actor;
  const tenant = sp.get("tenant"); if (tenant) f.tenantId = tenant;
  const entity = sp.get("entity"); if (entity) f.entityType = entity;
  const action = sp.get("action"); if (action) f.action = action;
  const severity = sp.get("severity");
  if (severity && SEVERITIES.has(severity as AuditSeverity)) f.severity = severity as AuditSeverity;
  const source = sp.get("source");
  if (source && SOURCES.has(source as AuditSource)) f.source = source as AuditSource;
  const ip = sp.get("ip"); if (ip) f.ip = ip.trim();
  const since = sp.get("since"); if (since) {
    const d = new Date(since); if (!Number.isNaN(d.getTime())) f.since = d;
  }
  const until = sp.get("until"); if (until) {
    const d = new Date(until); if (!Number.isNaN(d.getTime())) f.until = d;
  }
  if (sp.get("success") === "1") f.success = true;
  else if (sp.get("success") === "0") f.success = false;
  const preset = sp.get("preset");
  if (preset && ["sensitive", "failures", "mine", "super_admin_week"].includes(preset)) {
    f.preset = preset as AuditFilters["preset"];
  }
  return f;
}

export async function GET(req: Request) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("audit.read")) {
    return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
      status: 403, headers: { "Content-Type": "application/json" },
    });
  }
  const url = new URL(req.url);
  const format = (url.searchParams.get("format") ?? "csv").toLowerCase();
  const filters = parseFilters(url.searchParams);

  const collected: Awaited<ReturnType<typeof loadAuditList>>["rows"] = [];
  let page = 1;
  while (collected.length < HARD_CAP) {
    const res = await loadAuditList(filters, page, PAGE_SIZE, ctx.userId);
    if (res.rows.length === 0) break;
    collected.push(...res.rows);
    if (res.rows.length < PAGE_SIZE) break;
    page += 1;
  }
  const rows = collected.slice(0, HARD_CAP);

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.audit_exported",
    entityType: "AuditLog",
    metadata: { actor: ctx.email, count: rows.length, format, filters: Object.fromEntries(url.searchParams.entries()) },
    severity: "WARNING",
  });

  if (format === "json") {
    return new Response(JSON.stringify(rows, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-${stamp()}.json"`,
        "Cache-Control": "no-store",
      },
    });
  }
  if (format === "ndjson") {
    const body = rows.map((r) => JSON.stringify(r)).join("\n");
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-${stamp()}.ndjson"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // Default CSV.
  const headers = [
    "id", "created_at_iso", "action", "entity_type", "entity_id",
    "severity", "success", "source",
    "actor_id", "actor_email", "actor_role",
    "tenant_id", "tenant_slug",
    "ip", "correlation_id", "hash", "prev_hash",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      r.id, r.createdAt.toISOString(),
      csv(r.action),
      csv(r.entityType ?? ""),
      csv(r.entityId ?? ""),
      r.severity, r.success ? "1" : "0", r.source,
      r.actor?.id ?? "", csv(r.actor?.email ?? ""), r.actor?.platformRole ?? "",
      r.tenant?.id ?? "", r.tenant ? csv((r.tenant as { slug?: string }).slug ?? "") : "",
      csv(r.ipAddress ?? ""),
      csv(r.correlationId ?? ""),
      csv(r.hash ?? ""), csv(r.prevHash ?? ""),
    ].join(","));
  }

  return new Response(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-${stamp()}.csv"`,
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
