// GET /api/platform/tenants/health/export
//
// Streams a CSV of every tenant + computed score + per-factor sub-
// scores under the active model. Honors the same URL filters the
// page uses so an admin can filter to "score < 50, plan=Pro" then
// click Export.

import { logPlatformAudit, requirePlatformStaff } from "@/lib/platform";
import {
  HEALTH_FACTORS,
  applyFilters,
  loadHealthRows,
  type HealthFilters,
} from "@/server/platform/health-scoring";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseFilters(sp: URLSearchParams): HealthFilters {
  const f: HealthFilters = {};
  const q = sp.get("q"); if (q && q.trim()) f.q = q.trim();
  const plan = sp.get("plan"); if (plan) f.plan = plan;
  const csm = sp.get("csm"); if (csm) f.csmId = csm;
  const min = sp.get("min"); if (min && !Number.isNaN(Number(min))) f.scoreMin = Math.max(0, Math.min(100, Number(min)));
  const max = sp.get("max"); if (max && !Number.isNaN(Number(max))) f.scoreMax = Math.max(0, Math.min(100, Number(max)));
  const trend = sp.get("trend");
  if (trend === "up" || trend === "down" || trend === "flat") f.trend = trend;
  return f;
}

export async function GET(req: Request) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("tenant.read")) {
    return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
      status: 403, headers: { "Content-Type": "application/json" },
    });
  }
  const url = new URL(req.url);
  const filters = parseFilters(url.searchParams);
  const { rows, active } = await loadHealthRows();
  const filtered = applyFilters(rows, filters);

  const factorKeys = HEALTH_FACTORS.map((f) => f.key);
  const headers = [
    "tenant_id", "tenant_name", "slug", "plan", "status", "mrr",
    "csm_name", "csm_email", "owner_email",
    "last_activity_at_iso",
    "score", "raw_score", "adjustment_delta", "prev_week_score",
    "top_risk_factor", "shadow_score",
    ...factorKeys.map((k) => `factor_${k}`),
  ];
  const lines = [headers.join(",")];
  for (const r of filtered) {
    const cells: (string | number)[] = [
      r.tenantId, csvCell(r.tenantName), r.slug, r.plan, r.status, r.mrr,
      csvCell(r.csmName ?? ""), csvCell(r.csmEmail ?? ""), csvCell(r.ownerEmail ?? ""),
      r.lastActivityAt?.toISOString() ?? "",
      r.score, r.rawScore, r.adjustmentDelta, r.prevWeekScore ?? "",
      r.topRisk?.key ?? "",
      r.shadowScore ?? "",
      ...factorKeys.map((k) => r.subscores[k] ?? ""),
    ];
    lines.push(cells.join(","));
  }

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.health_scores_exported",
    entityType: "TenantHealthSnapshot",
    metadata: {
      actor: ctx.email,
      count: filtered.length,
      modelVersion: active.version,
      filters: Object.fromEntries(url.searchParams.entries()),
    },
  });

  const body = lines.join("\n");
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tenant-health-v${active.version}-${stamp()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function csvCell(s: string): string {
  if (!s) return "";
  const needsQuotes = /[",\n\r]/.test(s);
  const escaped = s.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function stamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
