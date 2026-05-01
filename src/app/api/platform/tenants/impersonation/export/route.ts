// GET /api/platform/tenants/impersonation/export
//
// CSV export of impersonation history honoring URL filters. The
// Active tab pulls from the same dataset (active = endedAt IS NULL),
// so the export ignores the tab=active hint and always returns the
// filtered set.

import { logPlatformAudit, requirePlatformStaff } from "@/lib/platform";
import {
  IMPERSONATION_CATEGORY_LABEL,
  IMPERSONATION_END_REASON_LABEL,
  loadHistory,
  type HistoryFilters,
} from "@/server/platform/impersonation";
import type { ImpersonationEndReason } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const END_REASONS: ImpersonationEndReason[] = ["COMPLETED", "FORCE_ENDED", "EXPIRED", "IDLE_TIMEOUT"];

function parseFilters(sp: URLSearchParams): HistoryFilters {
  const f: HistoryFilters = {};
  const admin = sp.get("admin"); if (admin) f.adminId = admin;
  const tenant = sp.get("tenant"); if (tenant) f.tenantId = tenant;
  const since = sp.get("since"); if (since) {
    const d = new Date(since); if (!Number.isNaN(d.getTime())) f.since = d;
  }
  const until = sp.get("until"); if (until) {
    const d = new Date(until); if (!Number.isNaN(d.getTime())) f.until = d;
  }
  const minDur = sp.get("minDur"); if (minDur && !Number.isNaN(Number(minDur))) f.minDurationMin = Number(minDur);
  const maxDur = sp.get("maxDur"); if (maxDur && !Number.isNaN(Number(maxDur))) f.maxDurationMin = Number(maxDur);
  if (sp.get("hasActions") === "1") f.hasActions = true;
  else if (sp.get("hasActions") === "0") f.hasActions = false;
  const er = sp.get("ended");
  if (er && END_REASONS.includes(er as ImpersonationEndReason)) f.endedReason = er as ImpersonationEndReason;
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
  // Pull up to 5k rows for the export — beyond that the spreadsheet
  // is the wrong tool anyway.
  const { rows } = await loadHistory(filters, 1, 5_000);

  const headers = [
    "session_id", "admin_id", "admin_name", "admin_email",
    "tenant_id", "tenant_name", "tenant_slug",
    "started_at_iso", "ended_at_iso", "duration_min",
    "category_code", "category_label", "reason",
    "actions_count", "ip", "ended_reason", "ended_label",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      r.id,
      r.admin.id, csv(r.admin.name ?? ""), csv(r.admin.email),
      r.tenant.id, csv(r.tenant.name), r.tenant.slug,
      r.startedAt.toISOString(),
      r.endedAt?.toISOString() ?? "",
      r.durationMin ?? "",
      r.categoryCode, csv(IMPERSONATION_CATEGORY_LABEL[r.categoryCode]),
      csv(r.reason ?? ""),
      r.actionsCount,
      csv(r.ip ?? ""),
      r.endedReason ?? "",
      csv(r.endedReason ? IMPERSONATION_END_REASON_LABEL[r.endedReason] : ""),
    ].join(","));
  }

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.impersonation_exported",
    entityType: "ImpersonationSession",
    metadata: { actor: ctx.email, count: rows.length, filters: Object.fromEntries(url.searchParams.entries()) },
  });

  return new Response(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="impersonation-${stamp()}.csv"`,
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
