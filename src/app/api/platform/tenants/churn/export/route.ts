// GET /api/platform/tenants/churn/export
//
// CSV export — At-Risk rows by default, Churned rows when ?tab=churned.
// Honors the same filters the page uses.

import { logPlatformAudit, requirePlatformStaff } from "@/lib/platform";
import {
  ARCHIVE_REASON_LABEL,
  loadAtRiskRows,
  loadChurnedRows,
  type AtRiskFilters,
  type ChurnedFilters,
  type RiskWindowDays,
} from "@/server/platform/churn";
import type { ArchiveReasonCode } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REASON_CODES = new Set<ArchiveReasonCode>([
  "NOT_A_FIT", "TOO_EXPENSIVE", "MISSING_FEATURES", "SWITCHED_TO_COMPETITOR",
  "BUSINESS_CLOSED", "TEMPORARY_PAUSE", "TECHNICAL_ISSUES", "POOR_SUPPORT",
  "DIFFICULT_TO_USE", "ADMIN_DECISION", "OTHER",
]);

function parseAtRisk(sp: URLSearchParams): AtRiskFilters {
  const f: AtRiskFilters = {};
  const w = Number(sp.get("window") ?? "");
  if ([30, 60, 90, 180].includes(w)) f.window = w as RiskWindowDays;
  const min = Number(sp.get("min") ?? "");
  if (!Number.isNaN(min)) f.scoreMin = Math.max(0, Math.min(100, min));
  const max = Number(sp.get("max") ?? "");
  if (!Number.isNaN(max)) f.scoreMax = Math.max(0, Math.min(100, max));
  const plan = sp.get("plan"); if (plan) f.plan = plan;
  const csm = sp.get("csm"); if (csm) f.csmId = csm;
  const reason = sp.get("reason"); if (reason) f.reasonKey = reason;
  if (sp.get("includeSuppressed") === "1") f.includeSuppressed = true;
  return f;
}

function parseChurned(sp: URLSearchParams): ChurnedFilters {
  const f: ChurnedFilters = {};
  const code = sp.get("code");
  if (code && REASON_CODES.has(code as ArchiveReasonCode)) f.reasonCode = code as ArchiveReasonCode;
  const plan = sp.get("plan"); if (plan) f.plan = plan;
  const since = sp.get("since"); if (since) {
    const d = new Date(since); if (!Number.isNaN(d.getTime())) f.since = d;
  }
  const until = sp.get("until"); if (until) {
    const d = new Date(until); if (!Number.isNaN(d.getTime())) f.until = d;
  }
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
  const tab = url.searchParams.get("tab") ?? "at-risk";
  let body: string;
  let filename: string;
  let count = 0;

  if (tab === "churned") {
    const { rows } = await loadChurnedRows(parseChurned(url.searchParams));
    count = rows.length;
    const headers = [
      "tenant_id", "tenant_name", "slug", "plan", "mrr_lost",
      "reason_code", "reason_label", "competitor_name",
      "cancelled_at_iso", "archive_reason", "won_back_at_iso",
      "owner_email", "is_voluntary",
    ];
    const lines = [headers.join(",")];
    for (const r of rows) {
      lines.push([
        r.id, csv(r.name), r.slug, r.plan, r.mrrLost,
        r.reasonCode ?? "", csv(r.reasonCode ? ARCHIVE_REASON_LABEL[r.reasonCode] : ""),
        csv(r.competitorName ?? ""),
        r.cancelledAt?.toISOString() ?? "",
        csv(r.archiveReason ?? ""),
        r.wonBackAt?.toISOString() ?? "",
        csv(r.ownerEmail ?? ""),
        r.isVoluntary ? "1" : "0",
      ].join(","));
    }
    body = lines.join("\n");
    filename = `churned-${stamp()}.csv`;
  } else {
    const { rows } = await loadAtRiskRows(parseAtRisk(url.searchParams));
    count = rows.length;
    const headers = [
      "tenant_id", "tenant_name", "slug", "plan", "status", "mrr",
      "score", "risk_score", "predicted_days",
      "top_reasons", "owner_email", "csm_email",
      "last_activity_at_iso", "suppressed_until_iso",
    ];
    const lines = [headers.join(",")];
    for (const r of rows) {
      lines.push([
        r.tenantId, csv(r.tenantName), r.slug, r.plan, r.status, r.mrr,
        r.score, r.riskScore, r.predictedDays,
        csv(r.topReasons.map((c) => c.label).join(" · ")),
        csv(r.ownerEmail ?? ""), csv(r.csmEmail ?? ""),
        r.lastActivityAt?.toISOString() ?? "",
        r.suppressedUntil?.toISOString() ?? "",
      ].join(","));
    }
    body = lines.join("\n");
    filename = `at-risk-${stamp()}.csv`;
  }

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.churn_exported",
    entityType: "Tenant",
    metadata: { actor: ctx.email, tab, count, filters: Object.fromEntries(url.searchParams.entries()) },
  });

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
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
