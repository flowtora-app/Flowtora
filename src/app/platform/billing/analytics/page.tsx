// Page 22 — Revenue Analytics.
//
// 11 tabs from the spec. Real numbers come from the existing tenant +
// pricing-plan + invoice + refund graph. Things that genuinely need
// data we don't track yet (CAC, attribution-channel LTV, ARIMA/Prophet
// forecasts) are flagged inline as honest deferrals.

import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  Breadcrumb,
  Card,
  PageHeader,
} from "@/components/ui";
import {
  loadArpuByPlan,
  loadCohortRetention,
  loadForecast,
  loadLtvByPlan,
  loadMonthlyRevenue,
  loadMrrMovement,
  loadMrrSnapshot,
  loadPlanDistribution,
  loadQuickRatio,
} from "@/server/platform/revenue-analytics";
import { MrrMovementTab } from "./_components/MrrMovementTab";
import { ArrTrendTab } from "./_components/ArrTrendTab";
import { ChurnTab } from "./_components/ChurnTab";
import { RetentionTab } from "./_components/RetentionTab";
import { ArpuTab } from "./_components/ArpuTab";
import { LtvTab } from "./_components/LtvTab";
import { CacTab } from "./_components/CacTab";
import { QuickRatioTab } from "./_components/QuickRatioTab";
import { CohortTab } from "./_components/CohortTab";
import { PlanMigrationTab } from "./_components/PlanMigrationTab";
import { ForecastTab } from "./_components/ForecastTab";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
type TabKey =
  | "mrr" | "arr" | "churn" | "retention" | "arpu" | "ltv"
  | "cac" | "quick" | "cohort" | "migration" | "forecast";

const TAB_KEYS: TabKey[] = [
  "mrr", "arr", "churn", "retention", "arpu", "ltv",
  "cac", "quick", "cohort", "migration", "forecast",
];

const TAB_LABEL: Record<TabKey, string> = {
  mrr: "MRR Movement",
  arr: "ARR Trend",
  churn: "Churn",
  retention: "Retention",
  arpu: "ARPU / ARPA",
  ltv: "LTV",
  cac: "CAC & Payback",
  quick: "Quick Ratio",
  cohort: "Cohort Analysis",
  migration: "Plan Migration",
  forecast: "Forecasting",
};

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requirePlatformStaff();
  const sp = await searchParams;
  const tabRaw = typeof sp.tab === "string" ? sp.tab : "mrr";
  const tab: TabKey = (TAB_KEYS as readonly string[]).includes(tabRaw) ? (tabRaw as TabKey) : "mrr";

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Billing", href: "/platform/billing" },
          { label: "Revenue Analytics" },
        ]} />
        <div className="mt-3">
          <PageHeader
            title="Revenue Analytics"
            description="Deep SaaS revenue analytics. All numbers come from your real tenant, pricing-plan, and invoice tables — honest deferrals are flagged where data we don't track yet would be required."
          />
        </div>
      </div>

      <TabBar active={tab} />

      {tab === "mrr"       && (await renderMrrMovement())}
      {tab === "arr"       && (await renderArrTrend())}
      {tab === "churn"     && (await renderChurn())}
      {tab === "retention" && (await renderRetention())}
      {tab === "arpu"      && (await renderArpu())}
      {tab === "ltv"       && (await renderLtv())}
      {tab === "cac"       && <CacTab />}
      {tab === "quick"     && (await renderQuickRatio())}
      {tab === "cohort"    && (await renderCohort())}
      {tab === "migration" && (await renderMigration())}
      {tab === "forecast"  && (await renderForecast(sp))}
    </div>
  );
}

function TabBar({ active }: { active: TabKey }) {
  return (
    <div className="overflow-x-auto border-b" style={{ borderColor: "var(--border-subtle)" }}>
      <div className="flex min-w-max items-center gap-0">
        {TAB_KEYS.map((key) => {
          const isActive = key === active;
          return (
            <Link
              key={key}
              href={key === "mrr" ? "/platform/billing/analytics" : `/platform/billing/analytics?tab=${key}`}
              className="ts-focus relative px-3 py-2 text-[13px] font-medium whitespace-nowrap"
              style={{
                color: isActive ? "var(--text-default)" : "var(--text-muted)",
                borderBottom: isActive ? "2px solid var(--accent-primary)" : "2px solid transparent",
                marginBottom: "-1px",
              }}
            >
              {TAB_LABEL[key]}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ── Tab loaders ────────────────────────────────────────── */

async function renderMrrMovement() {
  const [snap, movement] = await Promise.all([
    loadMrrSnapshot(),
    loadMrrMovement(12),
  ]);
  return <MrrMovementTab snapshot={snap} movement={movement} />;
}

async function renderArrTrend() {
  const [snap, movement, monthly] = await Promise.all([
    loadMrrSnapshot(),
    loadMrrMovement(24),
    loadMonthlyRevenue(24),
  ]);
  return <ArrTrendTab snapshot={snap} movement={movement} monthlyRevenue={monthly} />;
}

async function renderChurn() {
  const [movement, monthly] = await Promise.all([
    loadMrrMovement(12),
    loadMonthlyRevenue(12),
  ]);
  return <ChurnTab movement={movement} monthlyRevenue={monthly} />;
}

async function renderRetention() {
  const cohorts = await loadCohortRetention(6);
  return <RetentionTab cohorts={cohorts} />;
}

async function renderArpu() {
  const arpu = await loadArpuByPlan();
  return <ArpuTab arpuByPlan={arpu} />;
}

async function renderLtv() {
  const ltv = await loadLtvByPlan();
  return <LtvTab ltvByPlan={ltv} />;
}

async function renderQuickRatio() {
  const rows = await loadQuickRatio(12);
  return <QuickRatioTab rows={rows} />;
}

async function renderCohort() {
  const cohorts = await loadCohortRetention(6);
  return <CohortTab cohorts={cohorts} />;
}

async function renderMigration() {
  const dist = await loadPlanDistribution();
  return <PlanMigrationTab distribution={dist} />;
}

async function renderForecast(sp: SP) {
  const churnDeltaRaw = typeof sp.churnDelta === "string" ? Number(sp.churnDelta) : 0;
  const churnDelta = Number.isFinite(churnDeltaRaw) ? Math.max(-0.5, Math.min(0.5, churnDeltaRaw)) : 0;
  const forecast = await loadForecast(12, churnDelta);
  return <ForecastTab forecast={forecast} churnDelta={churnDelta} />;
}

// Surface Card so the import isn't dropped — used by tabs through their own imports.
void Card;
