import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  Breadcrumb,
  Button,
  Card,
  PageHeader,
} from "@/components/ui";
import {
  loadFilterOptions,
  loadSubscriptionsKpi,
  loadSubscriptionsList,
  type SubscriptionsFilters,
  type SubscriptionStatus,
} from "@/server/platform/subscriptions";
import type { BillingCycle } from "@prisma/client";
import { SubscriptionsFiltersBar } from "./_components/SubscriptionsFiltersBar";
import { SubscriptionsTable } from "./_components/SubscriptionsTable";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
const PAGE_SIZE = 50;

const STATUSES: SubscriptionStatus[] = ["active", "trialing", "past_due", "canceled", "paused", "incomplete"];

function parseFilters(sp: SearchParams): SubscriptionsFilters {
  const f: SubscriptionsFilters = {};
  if (typeof sp.q === "string" && sp.q.trim()) f.q = sp.q.trim();
  if (typeof sp.status === "string" && (STATUSES as string[]).includes(sp.status)) {
    f.status = sp.status as SubscriptionStatus;
  }
  if (typeof sp.plan === "string" && sp.plan) f.plan = sp.plan.toUpperCase();
  if (typeof sp.cycle === "string" && (sp.cycle === "MONTHLY" || sp.cycle === "ANNUAL")) {
    f.cycle = sp.cycle as BillingCycle;
  }
  if (typeof sp.currency === "string" && sp.currency) f.currency = sp.currency.toUpperCase();
  if (typeof sp.since === "string" && sp.since) {
    const d = new Date(sp.since); if (!Number.isNaN(d.getTime())) f.createdSince = d;
  }
  if (typeof sp.until === "string" && sp.until) {
    const d = new Date(sp.until); if (!Number.isNaN(d.getTime())) f.createdUntil = d;
  }
  if (typeof sp.trialDays === "string" && sp.trialDays) {
    const n = Number(sp.trialDays); if (!Number.isNaN(n)) f.trialExpiringWithinDays = n;
  }
  if (sp.cancelScheduled === "1") f.cancellationScheduled = true;
  else if (sp.cancelScheduled === "0") f.cancellationScheduled = false;
  if (sp.discount === "1") f.hasDiscount = true;
  else if (sp.discount === "0") f.hasDiscount = false;
  if (typeof sp.owner === "string" && sp.owner) f.ownerId = sp.owner;
  return f;
}

function buildQs(sp: SearchParams, override: Record<string, string | null> = {}): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k in override) continue;
    if (typeof v === "string") u.set(k, v);
    else if (Array.isArray(v)) for (const x of v) u.append(k, x);
  }
  for (const [k, v] of Object.entries(override)) {
    if (v != null && v !== "") u.set(k, v);
  }
  const q = u.toString();
  return q ? `?${q}` : "";
}

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canEdit = ctx.can("billing.plan_change");
  const canCoupon = ctx.can("billing.coupon");

  const filters = parseFilters(sp);
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : "1") || 1);

  const [{ rows, total, filteredTotal }, kpi, options] = await Promise.all([
    loadSubscriptionsList({ filters, page, pageSize: PAGE_SIZE }),
    loadSubscriptionsKpi(),
    loadFilterOptions(),
  ]);

  const exportQs = buildQs(sp, { page: null });

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Billing" },
          { label: "Subscriptions" },
        ]} />
        <div className="mt-3">
          <PageHeader
            title="Subscriptions"
            description="Single source of truth for every subscription on the platform."
            actions={
              <Link href={`/api/platform/billing/export${exportQs}`}>
                <Button size="sm" variant="secondary">Export</Button>
              </Link>
            }
          />
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Kpi label="Active"        value={kpi.active.toString()} />
        <Kpi label="Trialing"      value={kpi.trialing.toString()} />
        <Kpi label="Past due"      value={kpi.pastDue.toString()}
             tone={kpi.pastDue > 0 ? "warning" : "default"} />
        <Kpi label="MRR"           value={kpi.mrr === 0 ? "—" : `$${kpi.mrr.toLocaleString()}`} />
        <Kpi label="Avg age"       value={kpi.avgAgeDays == null ? "—" : `${kpi.avgAgeDays}d`} />
        <Kpi label="New · 30d"     value={kpi.newThisPeriod.toString()} />
      </div>

      {/* Filters */}
      <Card padding="md">
        <SubscriptionsFiltersBar
          options={options}
          statuses={STATUSES}
        />
      </Card>

      {/* Table */}
      <SubscriptionsTable
        rows={rows}
        total={total}
        filteredTotal={filteredTotal}
        page={page}
        pageSize={PAGE_SIZE}
        canEdit={canEdit}
        canCoupon={canCoupon}
      />
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "default" | "warning" | "danger" }) {
  const palette =
    tone === "warning" ? { borderColor: "var(--amber-200)" } :
    tone === "danger"  ? { borderColor: "var(--rose-200)" } :
                          undefined;
  return (
    <Card padding="md" className="h-full" style={palette}>
      <div className="flex h-full flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
        <div className="text-[24px] font-semibold leading-none tabular-nums" style={{ color: "var(--text-default)" }}>
          {value}
        </div>
      </div>
    </Card>
  );
}
