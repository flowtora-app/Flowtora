import { Suspense, cache } from "react";
import { requirePlatformStaff } from "@/lib/platform";
import { resolveRange, type ResolvedRange } from "@/lib/reports";
import {
  loadOverviewMetrics,
  loadAlerts,
  loadTriage,
  loadPlatformActivity,
} from "@/server/platform/overview-metrics";
import { fmtNumber, fmtUsd, fmtUsdCompact } from "@/lib/platform-format";

import { AlertRail } from "@/components/platform/AlertRail";
import { HeroRevenueCard } from "@/components/platform/HeroRevenueCard";
import { HealthCard } from "@/components/platform/HealthCard";
import { Kpi, KpiStrip } from "@/components/platform/KpiStrip";
import { RevenueTrendCard } from "@/components/platform/RevenueTrendCard";
import { PlanMixCard } from "@/components/platform/PlanMixCard";
import { GrowthFunnelCard } from "@/components/platform/GrowthFunnelCard";
import { ChurnReasonsCard } from "@/components/platform/ChurnReasonsCard";
import { TriageTabs } from "@/components/platform/TriageTabs";
import { PlatformActivityFeed } from "@/components/platform/PlatformActivityFeed";
import { OpsRow } from "@/components/platform/OpsRow";
import { PlatformQuickActions } from "@/components/platform/PlatformQuickActions";
import { RangeSelector } from "@/components/platform/RangeSelector";
import { FreshnessBadge } from "@/components/platform/FreshnessBadge";

export const dynamic = "force-dynamic";

// React `cache` dedupes per-request. Both the Glance and Orient
// sections need the same metrics, but they render in separate
// Suspense boundaries — caching means one query bundle, two renders.
const getMetrics = cache(async (range: ResolvedRange) => loadOverviewMetrics(range));

type SearchParams = { range?: string; from?: string; to?: string };

// ──────────────────────────────────────────────────────────────────
// Platform command-center overview.
//
// Layout follows a glance → orient → act progression:
//   Band 1 (glance, < 5s): alerts rail · MRR hero · health gauge · KPI strip · ops vitals
//   Band 2 (orient):       revenue trend + plan mix · growth funnel + churn reasons
//   Band 3 (act):          triage queues · recent activity · quick actions
// ──────────────────────────────────────────────────────────────────

export default async function PlatformOverviewPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePlatformStaff();
  const sp = await searchParams;
  const range = resolveRange(sp);

  return (
    <div className="space-y-6">
      <TopBar range={range} />

      <Suspense fallback={<SectionSkeleton height={60} />}>
        <AlertsSection />
      </Suspense>

      <Suspense fallback={<GlanceSkeleton />}>
        <GlanceSection range={range} />
      </Suspense>

      <Suspense fallback={<OrientSkeleton />}>
        <OrientSection range={range} />
      </Suspense>

      <Suspense fallback={<ActSkeleton />}>
        <ActSection />
      </Suspense>

      <PlatformQuickActions />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Top bar: title + range + freshness
// ──────────────────────────────────────────────────────────────────

function TopBar({ range }: { range: ReturnType<typeof resolveRange> }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1
          className="text-2xl font-semibold tracking-tight"
          style={{ color: "var(--text-default)" }}
        >
          Platform overview
        </h1>
        <p className="mt-0.5 text-sm" style={{ color: "var(--text-muted)" }}>
          Mission control for Flowtora — revenue, health, and what needs your attention.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <RangeSelector range={range} />
        <FreshnessBadge computedAt={new Date()} />
      </div>
    </header>
  );
}

// ──────────────────────────────────────────────────────────────────
// Sections
// ──────────────────────────────────────────────────────────────────

async function AlertsSection() {
  const alerts = await loadAlerts();
  return <AlertRail alerts={alerts} />;
}

async function GlanceSection({ range }: { range: ReturnType<typeof resolveRange> }) {
  const m = await getMetrics(range);

  return (
    <div className="space-y-4">
      {/* Hero row: MRR left, Health right */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <HeroRevenueCard
          mrr={m.mrr}
          arr={m.arr}
          mrrDeltaPct={m.mrrDeltaPct}
          mrrPrior={m.mrrPrior}
          spark={m.revenueSparkline14d}
        />
        <HealthCard score={m.healthScore} factors={m.healthFactors} />
      </div>

      {/* KPI strip */}
      <KpiStrip>
        <Kpi
          label="Active tenants"
          value={fmtNumber(m.activeTenants)}
          sub={m.trialTenants > 0 ? `+${m.trialTenants} in trial` : undefined}
          href="/platform/tenants?status=ACTIVE"
          spark={m.sparkSignups14d}
        />
        <Kpi
          label="New sign-ups"
          value={fmtNumber(m.newTenantsInRange)}
          deltaPct={m.newTenantsDeltaPct}
          deltaHint="vs. prior period"
          sub={range.label}
          href="/platform/tenants"
          spark={m.sparkSignups14d}
          sparkColor="var(--success)"
        />
        <Kpi
          label="Trial → paid"
          value={m.trialToPaidPct30d == null ? "—" : `${m.trialToPaidPct30d}%`}
          sub="30d conversion"
          tone={m.trialToPaidPct30d != null && m.trialToPaidPct30d >= 30 ? "success" : "default"}
        />
        <Kpi
          label="ARPU"
          value={fmtUsd(m.arpu)}
          sub={`${fmtUsdCompact(m.arr)} ARR`}
        />
        <Kpi
          label="Churn (30d)"
          value={m.churnPct30d == null ? "—" : `${m.churnPct30d}%`}
          deltaInvertGood
          sub={`${fmtNumber(m.canceledTenants)} lifetime`}
          tone={m.churnPct30d != null && m.churnPct30d > 5 ? "danger" : "default"}
        />
        <Kpi
          label="Past due"
          value={fmtNumber(m.pastDueTenants)}
          sub={m.suspendedTenants > 0 ? `+${m.suspendedTenants} suspended` : "none suspended"}
          href="/platform/tenants?status=PAST_DUE"
          tone={m.pastDueTenants > 0 ? "warning" : "default"}
        />
      </KpiStrip>

      {/* Ops vitals */}
      <OpsRow
        emailsOut24h={m.emailsOut24h}
        activeImpersonations={m.activeImpersonations}
        pendingExports={m.pendingExports}
        dueExportsOld={m.dueExportsOld}
        paymentSuccessPct30d={m.paymentSuccessPct30d}
        paymentsFailed30d={m.paymentsFailed30d}
      />
    </div>
  );
}

async function OrientSection({ range }: { range: ReturnType<typeof resolveRange> }) {
  const m = await getMetrics(range);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
      <RevenueTrendCard
        data={m.revenueTrend}
        stackKeys={m.planStackKeys}
        planMix={m.planMix}
        totalInRange={m.paymentsInRange}
        rangeLabel={range.label}
      />
      <PlanMixCard planMix={m.planMix} totalMrr={m.mrr} totalActive={m.activeTenants} />

      <GrowthFunnelCard
        data={m.conversionTrend}
        newTenantsInRange={m.newTenantsInRange}
        newTenantsDeltaPct={m.newTenantsDeltaPct}
        trialToPaidPct30d={m.trialToPaidPct30d}
        rangeLabel={range.label}
      />
      <ChurnReasonsCard
        reasons={m.churnReasons}
        churnPct30d={m.churnPct30d}
      />
    </div>
  );
}

async function ActSection() {
  const [triage, activity] = await Promise.all([
    loadTriage(),
    loadPlatformActivity(12),
  ]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
      <TriageTabs triage={triage} />
      <PlatformActivityFeed items={activity} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Skeletons
// ──────────────────────────────────────────────────────────────────

function SectionSkeleton({ height }: { height: number }) {
  return (
    <div
      className="animate-pulse rounded-2xl"
      style={{
        height,
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
      }}
    />
  );
}

function GlanceSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <SectionSkeleton height={160} />
        <SectionSkeleton height={160} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <SectionSkeleton key={i} height={120} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SectionSkeleton key={i} height={88} />
        ))}
      </div>
    </div>
  );
}

function OrientSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
      <SectionSkeleton height={320} />
      <SectionSkeleton height={320} />
      <SectionSkeleton height={320} />
      <SectionSkeleton height={320} />
    </div>
  );
}

function ActSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
      <SectionSkeleton height={440} />
      <SectionSkeleton height={440} />
    </div>
  );
}
