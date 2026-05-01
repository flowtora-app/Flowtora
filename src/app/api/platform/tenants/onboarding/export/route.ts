// GET /api/platform/tenants/onboarding/export
//
// CSV export of the onboarding pipeline — every tenant + computed
// stage + counters. Honors the same URL filters as the page so an
// admin can filter to "stuck only + paid plan" then click "Export
// funnel" and get exactly that slice.

import { logPlatformAudit, requirePlatformStaff } from "@/lib/platform";
import {
  applyFilters,
  loadPipelineRows,
  type PipelineFilters,
  type StageId,
} from "@/server/platform/onboarding-pipeline";
import type { BusinessType, TenantSource } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TENANT_SOURCES = new Set<TenantSource>(["ORGANIC", "REFERRAL", "PAID", "PARTNER", "OTHER"]);
const BUSINESS_TYPES = new Set<BusinessType>([
  "SIGN_SHOP", "PRINT_SHOP", "HYBRID", "APPAREL_SCREEN_PRINT", "EMBROIDERY",
  "PROMO_PRODUCTS", "TRADE_PRINTER", "WIDE_FORMAT_ONLY", "MULTI_DISCIPLINE", "OTHER",
]);
const STAGE_IDS = new Set<StageId>([
  "signed_up", "email_verified", "workspace_created", "first_invite_sent",
  "first_catalog_item", "first_customer_added", "first_quote_created",
  "first_job_created", "first_payment_received", "activated",
]);

function parseFilters(sp: URLSearchParams): PipelineFilters {
  const f: PipelineFilters = {};
  const plan = sp.get("plan"); if (plan) f.plan = plan;
  const source = sp.get("source");
  if (source && TENANT_SOURCES.has(source as TenantSource)) f.source = source as TenantSource;
  const country = sp.get("country"); if (country) f.country = country.toUpperCase();
  const industry = sp.get("industry");
  if (industry && BUSINESS_TYPES.has(industry as BusinessType)) f.industry = industry as BusinessType;
  const since = sp.get("since");
  if (since) { const d = new Date(since); if (!Number.isNaN(d.getTime())) f.createdSince = d; }
  const until = sp.get("until");
  if (until) { const d = new Date(until); if (!Number.isNaN(d.getTime())) f.createdUntil = d; }
  if (sp.get("stuck") === "1" || sp.get("stuck") === "true") f.stuckOnly = true;
  const stage = sp.get("stage");
  if (stage && STAGE_IDS.has(stage as StageId)) f.stage = stage as StageId;
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
  const rows = applyFilters(await loadPipelineRows(), filters);

  const headers = [
    "tenant_id", "tenant_name", "slug", "plan", "status",
    "stage_order", "stage_id", "stage_label",
    "days_in_stage", "stuck_level", "is_marked_stuck",
    "owner_email", "country", "industry", "signup_source",
    "created_at_iso", "trial_ends_at_iso", "last_activity_at_iso",
    "invites", "products", "customers", "quotes", "orders", "payments", "paying_customers",
    "stage_overridden", "nudge_enrolled_at_iso", "last_nudge_at_iso",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    const cells: (string | number)[] = [
      r.id, csvCell(r.name), r.slug, r.plan, r.status,
      r.stage.order, r.stage.id, csvCell(r.stage.label),
      r.daysInStage, r.stuckLevel, r.isMarkedStuck ? "1" : "0",
      csvCell(r.ownerEmail ?? ""), r.country ?? "", r.industry ?? "", r.signupSource,
      r.createdAt.toISOString(),
      r.trialEndsAt?.toISOString() ?? "",
      r.lastActivityAt?.toISOString() ?? "",
      r.inviteCount, r.productCount, r.customerCount,
      r.quoteCount, r.orderCount, r.paymentCount, r.payingCustomerCount,
      r.onboardingStageOverride ? "1" : "0",
      r.onboardingNudgeEnrolledAt?.toISOString() ?? "",
      r.lastOnboardingNudgeAt?.toISOString() ?? "",
    ];
    lines.push(cells.join(","));
  }

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.onboarding_funnel_exported",
    entityType: "Tenant",
    metadata: {
      actor: ctx.email,
      count: rows.length,
      filters: Object.fromEntries(url.searchParams.entries()),
    },
  });

  const body = lines.join("\n");
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="onboarding-funnel-${todayStamp()}.csv"`,
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

function todayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
