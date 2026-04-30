import { Suspense, cache } from "react";
import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import { resolveRange, type ResolvedRange } from "@/lib/reports";
import {
  loadOverviewMetrics,
  loadAlerts,
  loadTriage,
  loadPlatformActivity,
  loadTopTenantsByMrr,
  loadRecentSignups,
  loadRecentCancellations,
  loadGeoDistribution,
  loadActiveUsers,
  loadNrr,
  type Alert,
  type PlatformActivityItem,
  type RecentSignupRow,
  type RecentCancellationRow,
  type TriageBundle,
  type TriageItem,
} from "@/server/platform/overview-metrics";
import { fmtUsd, fmtUsdCompact } from "@/lib/platform-format";

import {
  AreaChartCard,
  Avatar,
  Badge,
  BarChartCard,
  Banner,
  Breadcrumb,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  DonutChartCard,
  EmptyState,
  PageHeader,
  Skeleton,
  StatusPill,
} from "@/components/ui";

import { RangeSelector } from "@/components/platform/RangeSelector";
import { FreshnessBadge } from "@/components/platform/FreshnessBadge";
import { KpiCard } from "./_dashboard/KpiCard";
import { TopTenantsTable } from "./_dashboard/TopTenantsTable";
import { TenantWorldMap } from "./_dashboard/TenantWorldMap";

export const dynamic = "force-dynamic";

// React `cache` dedupes per-request — multiple sections share the
// same metrics bundle while staying inside their own Suspense boundary.
const getMetrics = cache(async (range: ResolvedRange) => loadOverviewMetrics(range));

type SearchParams = { range?: string; from?: string; to?: string };

// ──────────────────────────────────────────────────────────────────
// Page 1 — Dashboard (docs/flowtora-admin-spec.md §Page 1).
//
// Layout (12-col grid, gap 16px):
//   Row 1 — Welcome row (greeting + date + range)
//   Row 2 — KPI primary (6 cards, 2 cols each)
//   Row 3 — KPI secondary (4 cards, 3 cols each)
//   Row 4 — MRR/ARR area (8 cols) + Tenant growth bars (4 cols)
//   Row 5 — Plan-mix donut (4 cols) + Top 10 tenants (8 cols)
//   Row 6 — Tenants at risk (6 cols) + Activity feed (6 cols)
//   Row 7 — System health (4 cols) + Geographic placeholder (8 cols)
//   Row 8 — Recent signups (6 cols) + Recent cancellations (6 cols)
//
// Built from @/components/ui primitives — Card / PageHeader /
// AreaChartCard / DonutChartCard / Table / StatusPill / Badge / Banner.
// ──────────────────────────────────────────────────────────────────

export default async function PlatformDashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const range = resolveRange(sp);

  return (
    <div className="space-y-6">
      <Suspense fallback={<HeaderSkeleton />}>
        <Header rangeLabel={range.label} userEmail={ctx.email} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton height={64} />}>
        <AlertsRow />
      </Suspense>

      <Suspense fallback={<KpiPrimarySkeleton />}>
        <KpiPrimary range={range} />
      </Suspense>

      <Suspense fallback={<KpiSecondarySkeleton />}>
        <KpiSecondary range={range} />
      </Suspense>

      <Suspense fallback={<ChartsSkeleton />}>
        <ChartsRow range={range} />
      </Suspense>

      <Suspense fallback={<DonutTableSkeleton />}>
        <PlanMixAndTopTenants range={range} />
      </Suspense>

      <Suspense fallback={<TwoColSkeleton height={360} />}>
        <RiskAndActivity />
      </Suspense>

      <Suspense fallback={<TwoColSkeleton height={280} />}>
        <SystemHealthAndGeo range={range} />
      </Suspense>

      <Suspense fallback={<TwoColSkeleton height={360} />}>
        <SignupsAndCancellations />
      </Suspense>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Row 1 — Header / Welcome row
// ──────────────────────────────────────────────────────────────────

function Header({ rangeLabel, userEmail }: { rangeLabel: string; userEmail: string }) {
  const now = new Date();
  const greeting = greetingFor(now);
  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timeLabel = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const firstName = userEmail.split("@")[0]?.split(".")[0] ?? "there";

  return (
    <div>
      <Breadcrumb items={[{ label: "Platform", href: "/platform" }, { label: "Dashboard" }]} />
      <div className="mt-3">
        <PageHeader
          eyebrow={`${dateLabel} · ${timeLabel} · ${rangeLabel}`}
          title={`${greeting}, ${firstName}`}
          description="Mission control for Flowtora — revenue, growth, tenant health, and what needs your attention."
          actions={
            <>
              <RangeSelector range={resolveRange({})} />
              <FreshnessBadge computedAt={new Date()} />
            </>
          }
        />
      </div>
    </div>
  );
}

function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h < 5)  return "Up late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Hello";
}

// ──────────────────────────────────────────────────────────────────
// Alerts strip
// ──────────────────────────────────────────────────────────────────

async function AlertsRow() {
  const alerts = await loadAlerts();
  if (alerts.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
      {alerts.slice(0, 6).map((a) => (
        <AlertChip key={a.id} alert={a} />
      ))}
    </div>
  );
}

function AlertChip({ alert }: { alert: Alert }) {
  const variant = alert.severity === "critical" ? "error" : alert.severity === "warning" ? "warning" : "info";
  return (
    <Banner variant={variant} layout="inline" cta={{ label: "Open", href: alert.href }}>
      <span className="font-medium">{alert.label}</span>
      {alert.count > 0 && (
        <span className="ml-2 inline-flex items-center rounded-full bg-white/40 px-1.5 text-[10px] font-semibold tabular-nums">
          {alert.count}
        </span>
      )}
    </Banner>
  );
}

// ──────────────────────────────────────────────────────────────────
// Row 2 — KPI primary (MRR · ARR · Active · New · Churn · Revenue)
// ──────────────────────────────────────────────────────────────────

async function KpiPrimary({ range }: { range: ResolvedRange }) {
  const m = await getMetrics(range);
  const sparkRevenue = m.revenueSparkline14d.map((p) => p.value);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <KpiCard
        label="MRR"
        value={fmtUsd(m.mrr)}
        deltaPct={m.mrrDeltaPct}
        sub={`vs ${fmtUsdCompact(m.mrrPrior)} prior`}
        spark={sparkRevenue}
        href="/platform/billing/analytics"
        hint="Monthly Recurring Revenue · Sum of all active subscription monthly amounts"
      />
      <KpiCard
        label="ARR"
        value={fmtUsd(m.arr)}
        sub="MRR × 12"
        spark={sparkRevenue}
        sparkColor="var(--cyan-500)"
        href="/platform/billing/analytics"
      />
      <KpiCard
        label="Active tenants"
        value={m.activeTenants.toLocaleString()}
        sub={m.trialTenants > 0 ? `+${m.trialTenants} in trial` : `of ${m.totalTenants.toLocaleString()} total`}
        spark={m.sparkSignups14d}
        sparkColor="var(--emerald-500)"
        href="/platform/tenants?status=ACTIVE"
      />
      <KpiCard
        label="New tenants"
        value={m.newTenantsInRange.toLocaleString()}
        deltaPct={m.newTenantsDeltaPct}
        sub={range.label}
        spark={m.sparkSignups14d}
        sparkColor="var(--emerald-500)"
        href="/platform/tenants"
      />
      <KpiCard
        label="Churn rate (30d)"
        value={m.churnPct30d == null ? "—" : `${m.churnPct30d}%`}
        invertDelta
        sub={`${m.canceledTenants.toLocaleString()} cancelled lifetime`}
        tone={m.churnPct30d != null && m.churnPct30d > 5 ? "danger" : "default"}
        href="/platform/tenants?status=CANCELED"
        hint="Cancelled MRR / Starting MRR over the period"
      />
      <KpiCard
        label="Revenue"
        value={fmtUsd(m.paymentsInRange)}
        sub={range.label}
        spark={sparkRevenue}
        sparkColor="var(--brand-500)"
        href="/platform/billing/payments"
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Row 3 — KPI secondary (Tickets · Active users · Trial→Paid · NRR)
// ──────────────────────────────────────────────────────────────────

async function KpiSecondary({ range }: { range: ResolvedRange }) {
  const [m, triage, activeUsers, nrr] = await Promise.all([
    getMetrics(range),
    loadTriage(),
    loadActiveUsers(),
    loadNrr(),
  ]);
  const tickets = triage.support.length;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Open support tickets"
        value={tickets.toLocaleString()}
        sub={tickets > 0 ? `Top priority across ${triage.payments.length} also failing payment` : "Inbox empty"}
        tone={tickets > 5 ? "warning" : "default"}
        href="/platform/support"
      />
      <KpiCard
        label="Active users"
        value={activeUsers.dau.toLocaleString()}
        sub={`DAU · ${activeUsers.wau.toLocaleString()} WAU · ${activeUsers.mau.toLocaleString()} MAU`}
        spark={activeUsers.spark14d}
        sparkColor="var(--brand-500)"
        href="/platform/users"
        hint="Distinct users with login activity. DAU = today, WAU = last 7d, MAU = last 30d."
      />
      <KpiCard
        label="Trial → paid"
        value={m.trialToPaidPct30d == null ? "—" : `${m.trialToPaidPct30d}%`}
        sub="30d conversion"
        tone={m.trialToPaidPct30d != null && m.trialToPaidPct30d >= 30 ? "success" : "default"}
        href="/platform/tenants"
      />
      <KpiCard
        label="Net revenue retention"
        value={nrr.pct == null ? "—" : `${nrr.pct}%`}
        sub={nrr.cohortSize > 0
          ? `Cohort of ${nrr.cohortSize} from 30d ago`
          : "No cohort to measure yet"}
        tone={nrr.pct == null ? "default" : nrr.pct >= 100 ? "success" : nrr.pct >= 90 ? "warning" : "danger"}
        href="/platform/billing/analytics"
        hint="Approximate NRR — cohort MRR today ÷ same cohort 30 days ago × 100. >100% means net expansion."
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Row 4 — MRR/ARR area (8 cols) + Tenant growth bars (4 cols)
// ──────────────────────────────────────────────────────────────────

async function ChartsRow({ range }: { range: ResolvedRange }) {
  const m = await getMetrics(range);

  // Build tenant-growth series from signupsTrend (the trend already
  // emits per-bucket counts under "value"; we render it as a bar).
  const growthSeries = m.signupsTrend.map((p) => ({ ...p }));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
      <Card padding="md" className="h-full">
        <CardHeader
          title="Revenue trend"
          description={`MRR by plan over ${range.label.toLowerCase()}`}
          right={<Link href="/platform/billing/analytics" className="text-[12px] font-medium" style={{ color: "var(--accent-primary)" }}>Analytics →</Link>}
        />
        <CardBody>
          {m.revenueTrend.length > 0 ? (
            <AreaChartCard
              data={m.revenueTrend}
              xKey="label"
              series={m.planStackKeys.map((k) => ({ dataKey: k, name: k }))}
              stacked
              height="md"
              valueFormat={fmtUsdCompact}
            />
          ) : (
            <ChartEmpty label="No paid revenue in this range yet." />
          )}
        </CardBody>
      </Card>

      <Card padding="md" className="h-full">
        <CardHeader title="Tenant growth" description="New sign-ups by period" />
        <CardBody>
          {growthSeries.length > 0 ? (
            <BarChartCard
              data={growthSeries}
              xKey="label"
              series={[{ dataKey: "value", name: "New sign-ups", color: "var(--emerald-500)" }]}
              height="md"
              showLegend={false}
            />
          ) : (
            <ChartEmpty label="No signups yet in this range." />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Row 5 — Revenue by Plan donut + Top 10 tenants
// ──────────────────────────────────────────────────────────────────

async function PlanMixAndTopTenants({ range }: { range: ResolvedRange }) {
  const [m, top] = await Promise.all([getMetrics(range), loadTopTenantsByMrr(10)]);
  const donutData = m.planMix
    .filter((p) => p.mrr > 0)
    .map((p) => ({ name: p.name, value: p.mrr }));
  const colors = m.planMix.filter((p) => p.mrr > 0).map((p) => p.color);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr]">
      <Card padding="md" className="h-full">
        <CardHeader title="Revenue by plan" description={`MRR mix · ${fmtUsd(m.mrr)} total`} />
        <CardBody>
          {donutData.length > 0 ? (
            <DonutChartCard
              data={donutData}
              colors={colors}
              centerLabel={fmtUsdCompact(m.mrr)}
              height="md"
              valueFormat={fmtUsdCompact}
            />
          ) : (
            <ChartEmpty label="No paid plans active yet." />
          )}
        </CardBody>
      </Card>

      <Card padding="none" className="h-full overflow-hidden">
        <div className="px-4 pt-4 pb-3">
          <CardHeader
            title="Top tenants by MRR"
            description="Highest-value paying accounts"
            right={<Link href="/platform/tenants" className="text-[12px] font-medium" style={{ color: "var(--accent-primary)" }}>View all →</Link>}
          />
        </div>
        {top.length > 0 ? (
          <TopTenantsTable rows={top} />
        ) : (
          <div className="p-6">
            <EmptyState
              title="No tenants on a paid plan yet"
              description="Once tenants upgrade from trial, they'll show up here ranked by monthly recurring revenue."
            />
          </div>
        )}
      </Card>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Row 6 — Tenants at risk + Activity feed
// ──────────────────────────────────────────────────────────────────

async function RiskAndActivity() {
  const [triage, activity] = await Promise.all([loadTriage(), loadPlatformActivity(12)]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card padding="none" className="h-full overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <CardHeader
            title="Tenants at risk"
            description="Past-due, suspended, or trial about to expire"
            right={<Link href="/platform/tenants?status=PAST_DUE" className="text-[12px] font-medium" style={{ color: "var(--accent-primary)" }}>All at-risk →</Link>}
          />
        </div>
        <RiskList triage={triage} />
      </Card>

      <Card padding="none" className="h-full overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <CardHeader
            title="Recent activity"
            description="Last 12 platform events"
            right={<Link href="/platform/audit" className="text-[12px] font-medium" style={{ color: "var(--accent-primary)" }}>Open feed →</Link>}
          />
        </div>
        <ActivityList items={activity} />
      </Card>
    </div>
  );
}

function RiskList({ triage }: { triage: TriageBundle }) {
  // Combine the most-urgent risk buckets into a single list, prefixed
  // by category so the operator can see what's most pressing.
  const items: { item: TriageItem; tag: string }[] = [
    ...triage.unhealthy.slice(0, 4).map((i) => ({ item: i, tag: "Unhealthy" })),
    ...triage.payments.slice(0, 3).map((i) => ({ item: i, tag: "Failed pay" })),
    ...triage.trials.slice(0, 3).map((i) => ({ item: i, tag: "Trial ends" })),
  ];

  if (items.length === 0) {
    return (
      <div className="p-6">
        <EmptyState title="All quiet" description="No tenants flagged as at-risk right now." />
      </div>
    );
  }

  return (
    <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
      {items.map(({ item, tag }) => (
        <li key={item.id}>
          <Link
            href={item.href}
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--surface-2)]"
          >
            <Avatar size="xs" name={item.title} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[13px] font-medium" style={{ color: "var(--text-default)" }}>{item.title}</span>
                <Badge size="xs" color={item.tone === "danger" ? "error" : item.tone === "warning" ? "warning" : "neutral"}>
                  {tag}
                </Badge>
              </div>
              <div className="truncate text-[11px]" style={{ color: "var(--text-muted)" }}>{item.meta}</div>
            </div>
            <span style={{ color: "var(--text-faint)" }}>→</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ActivityList({ items }: { items: PlatformActivityItem[] }) {
  if (items.length === 0) {
    return (
      <div className="p-6">
        <EmptyState title="No recent activity" description="Events from the last 72 hours will show up here." />
      </div>
    );
  }
  return (
    <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
      {items.map((it) => {
        const dot = it.tone === "danger"  ? "var(--rose-500)"
                  : it.tone === "warning" ? "var(--amber-500)"
                  : it.tone === "success" ? "var(--emerald-500)"
                  : it.tone === "info"    ? "var(--brand-500)"
                  : "var(--slate-400)";
        const inner = (
          <div className="flex items-start gap-3 px-4 py-2.5">
            <span aria-hidden style={{ width: 8, height: 8, marginTop: 7, borderRadius: 4, background: dot }} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px]" style={{ color: "var(--text-default)" }}>{it.title}</div>
              <div className="truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
                {it.subtitle} · {formatRelative(it.occurredAt)}
              </div>
            </div>
          </div>
        );
        return (
          <li key={it.id}>
            {it.href ? (
              <Link href={it.href} className="block hover:bg-[var(--surface-2)]">{inner}</Link>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ──────────────────────────────────────────────────────────────────
// Row 7 — System health + Geographic placeholder
// ──────────────────────────────────────────────────────────────────

async function SystemHealthAndGeo({ range }: { range: ResolvedRange }) {
  const [m, geo] = await Promise.all([getMetrics(range), loadGeoDistribution()]);
  const stats: { label: string; value: string; tone: "success" | "warning" | "danger" | "neutral" }[] = [
    { label: "Payment success (30d)", value: `${m.paymentSuccessPct30d}%`, tone: m.paymentSuccessPct30d >= 95 ? "success" : m.paymentSuccessPct30d >= 90 ? "warning" : "danger" },
    { label: "Emails sent (24h)",     value: m.emailsOut24h.toLocaleString(), tone: "neutral" },
    { label: "Active impersonations",  value: m.activeImpersonations.toLocaleString(), tone: m.activeImpersonations > 0 ? "warning" : "success" },
    { label: "Pending data exports",   value: m.pendingExports.toLocaleString(), tone: m.dueExportsOld > 0 ? "warning" : "neutral" },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr]">
      <Card padding="md" className="h-full">
        <CardHeader title="System health" description="Last 30 days" />
        <CardBody>
          <ul className="flex flex-col gap-2">
            {stats.map((s) => (
              <li key={s.label} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[13px]" style={{ color: "var(--text-default)" }}>
                  <span aria-hidden style={{
                    width: 8, height: 8, borderRadius: 4,
                    background: s.tone === "success" ? "var(--emerald-500)"
                              : s.tone === "warning" ? "var(--amber-500)"
                              : s.tone === "danger"  ? "var(--rose-500)"
                              : "var(--slate-400)",
                  }} />
                  {s.label}
                </span>
                <span className="font-mono text-[13px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>
                  {s.value}
                </span>
              </li>
            ))}
          </ul>
        </CardBody>
        <CardFooter>
          <Link href="/platform/health" className="text-[12px] font-medium" style={{ color: "var(--accent-primary)" }}>
            System status →
          </Link>
        </CardFooter>
      </Card>

      <TenantWorldMap data={geo} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Row 8 — Recent signups + Recent cancellations
// ──────────────────────────────────────────────────────────────────

async function SignupsAndCancellations() {
  const [signups, cancellations] = await Promise.all([
    loadRecentSignups(8),
    loadRecentCancellations(8),
  ]);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card padding="none" className="h-full overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <CardHeader
            title="Recent signups"
            description="Newest tenants on Flowtora"
            right={<Link href="/platform/tenants" className="text-[12px] font-medium" style={{ color: "var(--accent-primary)" }}>Onboarding →</Link>}
          />
        </div>
        <SignupList rows={signups} />
      </Card>
      <Card padding="none" className="h-full overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <CardHeader
            title="Recent cancellations"
            description="Tenants who closed their account"
            right={<Link href="/platform/tenants?status=CANCELED" className="text-[12px] font-medium" style={{ color: "var(--accent-primary)" }}>Churn report →</Link>}
          />
        </div>
        <CancellationList rows={cancellations} />
      </Card>
    </div>
  );
}

function SignupList({ rows }: { rows: RecentSignupRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="p-6">
        <EmptyState title="No recent signups" description="When new tenants sign up, they'll show here." />
      </div>
    );
  }
  return (
    <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={`/platform/tenants/${r.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--surface-2)]">
            <Avatar size="xs" name={r.name} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[13px] font-medium" style={{ color: "var(--text-default)" }}>{r.name}</span>
                <Badge size="xs" color={r.status === "TRIAL" ? "info" : "success"}>
                  {r.status === "TRIAL" ? "Trial" : r.plan}
                </Badge>
              </div>
              <div className="truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
                {r.ownerEmail ?? "—"}{r.country ? ` · ${r.country}` : ""} · {formatRelative(r.createdAt)}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CancellationList({ rows }: { rows: RecentCancellationRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="p-6">
        <EmptyState title="No cancellations" description="Cancelled accounts will appear here once requests complete." />
      </div>
    );
  }
  return (
    <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={`/platform/tenants/${r.tenantId}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--surface-2)]">
            <Avatar size="xs" name={r.tenantName} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[13px] font-medium" style={{ color: "var(--text-default)" }}>{r.tenantName}</span>
                <StatusPill status="cancelled" size="sm" />
              </div>
              <div className="truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
                Was on {r.plan} · −{fmtUsd(r.mrrLost)} MRR · {formatRelative(r.cancelledAt)}{r.reason ? ` · "${r.reason}"` : ""}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ──────────────────────────────────────────────────────────────────
// Skeletons
// ──────────────────────────────────────────────────────────────────

function HeaderSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-3 w-48" />
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-4 w-96" />
    </div>
  );
}

function SectionSkeleton({ height }: { height: number }) {
  return (
    <Skeleton style={{ height }} className="w-full rounded-lg" />
  );
}

function KpiPrimarySkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <SectionSkeleton key={i} height={132} />
      ))}
    </div>
  );
}

function KpiSecondarySkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <SectionSkeleton key={i} height={132} />
      ))}
    </div>
  );
}

function ChartsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
      <SectionSkeleton height={360} />
      <SectionSkeleton height={360} />
    </div>
  );
}

function DonutTableSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr]">
      <SectionSkeleton height={320} />
      <SectionSkeleton height={320} />
    </div>
  );
}

function TwoColSkeleton({ height }: { height: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <SectionSkeleton height={height} />
      <SectionSkeleton height={height} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

function ChartEmpty({ label }: { label: string }) {
  return (
    <div
      className="flex h-[240px] items-center justify-center rounded-md text-[12px]"
      style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
    >
      {label}
    </div>
  );
}

function formatRelative(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = 60_000, hour = 60 * min, day = 24 * hour;
  if (ms < min)  return "just now";
  if (ms < hour) return `${Math.floor(ms / min)}m ago`;
  if (ms < day)  return `${Math.floor(ms / hour)}h ago`;
  if (ms < 30 * day) return `${Math.floor(ms / day)}d ago`;
  return d.toLocaleDateString();
}

