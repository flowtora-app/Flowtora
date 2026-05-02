// GET /api/platform/billing/export
//
// CSV export of the subscriptions list honoring filters.

import { logPlatformAudit, requirePlatformStaff } from "@/lib/platform";
import {
  loadSubscriptionsList,
  type SubscriptionStatus,
  type SubscriptionsFilters,
} from "@/server/platform/subscriptions";
import type { BillingCycle } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HARD_CAP = 10_000;
const PAGE_SIZE = 500;

const STATUSES = new Set<SubscriptionStatus>([
  "active", "trialing", "past_due", "canceled", "paused", "incomplete",
]);

function parseFilters(sp: URLSearchParams): SubscriptionsFilters {
  const f: SubscriptionsFilters = {};
  const q = sp.get("q"); if (q && q.trim()) f.q = q.trim();
  const status = sp.get("status");
  if (status && STATUSES.has(status as SubscriptionStatus)) f.status = status as SubscriptionStatus;
  const plan = sp.get("plan"); if (plan) f.plan = plan.toUpperCase();
  const cycle = sp.get("cycle");
  if (cycle === "MONTHLY" || cycle === "ANNUAL") f.cycle = cycle as BillingCycle;
  const currency = sp.get("currency"); if (currency) f.currency = currency.toUpperCase();
  const since = sp.get("since"); if (since) {
    const d = new Date(since); if (!Number.isNaN(d.getTime())) f.createdSince = d;
  }
  const until = sp.get("until"); if (until) {
    const d = new Date(until); if (!Number.isNaN(d.getTime())) f.createdUntil = d;
  }
  const trialDays = sp.get("trialDays");
  if (trialDays && !Number.isNaN(Number(trialDays))) f.trialExpiringWithinDays = Number(trialDays);
  if (sp.get("cancelScheduled") === "1") f.cancellationScheduled = true;
  else if (sp.get("cancelScheduled") === "0") f.cancellationScheduled = false;
  if (sp.get("discount") === "1") f.hasDiscount = true;
  else if (sp.get("discount") === "0") f.hasDiscount = false;
  const owner = sp.get("owner"); if (owner) f.ownerId = owner;
  return f;
}

export async function GET(req: Request) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("billing.read")) {
    return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
      status: 403, headers: { "Content-Type": "application/json" },
    });
  }
  const url = new URL(req.url);
  const filters = parseFilters(url.searchParams);

  const collected: Awaited<ReturnType<typeof loadSubscriptionsList>>["rows"] = [];
  let page = 1;
  while (collected.length < HARD_CAP) {
    const res = await loadSubscriptionsList({ filters, page, pageSize: PAGE_SIZE });
    if (res.rows.length === 0) break;
    collected.push(...res.rows);
    if (res.rows.length < PAGE_SIZE) break;
    page += 1;
  }
  const rows = collected.slice(0, HARD_CAP);

  const headers = [
    "tenant_id", "tenant_name", "tenant_slug",
    "stripe_subscription_id", "plan", "plan_name", "cycle", "status",
    "mrr", "currency", "started_at_iso", "current_period_end_iso",
    "trial_ends_at_iso", "cancel_at_period_end", "cancel_scheduled_for_iso",
    "paused_until_iso", "has_coupon", "owner_email",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      r.tenantId, csv(r.tenantName), r.tenantSlug,
      r.stripeSubscriptionId ?? "", r.plan, csv(r.planName), r.cycle, r.status,
      r.mrr, r.currency, r.startedAt.toISOString(),
      r.currentPeriodEnd?.toISOString() ?? "",
      r.trialEndsAt?.toISOString() ?? "",
      r.cancelAtPeriodEnd ? "1" : "0",
      r.cancelScheduledFor?.toISOString() ?? "",
      r.pausedUntil?.toISOString() ?? "",
      r.hasCoupon ? "1" : "0",
      csv(r.ownerEmail ?? ""),
    ].join(","));
  }

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.subscriptions_exported",
    entityType: "Tenant",
    metadata: { actor: ctx.email, count: rows.length, filters: Object.fromEntries(url.searchParams.entries()) },
  });

  return new Response(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="subscriptions-${stamp()}.csv"`,
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
