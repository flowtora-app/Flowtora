import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  Banner,
  Breadcrumb,
  Button,
  Card,
  PageHeader,
  Tabs,
} from "@/components/ui";
import {
  STAGES,
  applyFilters,
  computeFunnelTotals,
  computeKpis,
  loadFunnelSettings,
  loadPipelineRows,
  type PipelineFilters,
  type StageId,
} from "@/server/platform/onboarding-pipeline";
import type { BusinessType, TenantSource } from "@prisma/client";
import { FunnelTab } from "./_components/FunnelTab";
import { KanbanTab } from "./_components/KanbanTab";
import { ListTab } from "./_components/ListTab";
import { OnboardingFiltersBar } from "./_components/OnboardingFiltersBar";
import { EditFunnelButton } from "./_components/EditFunnelButton";
import { SendNudgeCampaignButton } from "./_components/SendNudgeCampaignButton";

export const dynamic = "force-dynamic";

// Page 5 — Onboarding Pipeline.
//
// One server component shell + three client tabs. Filters/sorting are
// URL-driven so deep links work, and Kanban + List receive the already-
// filtered rows so they render immediately without re-fetching.

type SearchParams = Record<string, string | string[] | undefined>;

const VALID_TABS = new Set(["funnel", "kanban", "list"]);

const TENANT_SOURCES: TenantSource[] = ["ORGANIC", "REFERRAL", "PAID", "PARTNER", "OTHER"];
const BUSINESS_TYPES: BusinessType[] = [
  "SIGN_SHOP", "PRINT_SHOP", "HYBRID", "APPAREL_SCREEN_PRINT", "EMBROIDERY",
  "PROMO_PRODUCTS", "TRADE_PRINTER", "WIDE_FORMAT_ONLY", "MULTI_DISCIPLINE", "OTHER",
];

function parseFilters(sp: SearchParams): PipelineFilters {
  const f: PipelineFilters = {};
  if (typeof sp.plan === "string" && sp.plan) f.plan = sp.plan;
  if (typeof sp.source === "string" && (TENANT_SOURCES as string[]).includes(sp.source)) {
    f.source = sp.source as TenantSource;
  }
  if (typeof sp.country === "string" && sp.country) f.country = sp.country.toUpperCase();
  if (typeof sp.industry === "string" && (BUSINESS_TYPES as string[]).includes(sp.industry)) {
    f.industry = sp.industry as BusinessType;
  }
  if (typeof sp.since === "string" && sp.since) {
    const d = new Date(sp.since);
    if (!Number.isNaN(d.getTime())) f.createdSince = d;
  }
  if (typeof sp.until === "string" && sp.until) {
    const d = new Date(sp.until);
    if (!Number.isNaN(d.getTime())) f.createdUntil = d;
  }
  if (sp.stuck === "1" || sp.stuck === "true") f.stuckOnly = true;
  if (typeof sp.stage === "string" && STAGES.some((s) => s.id === sp.stage)) {
    f.stage = sp.stage as StageId;
  }
  return f;
}

function buildQs(sp: SearchParams, override: Record<string, string | null>): string {
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

export default async function OnboardingPipelinePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;

  // The "tenant.tag" perm covers nudges, mark-stuck, override-stage —
  // any non-read action on this page. Lacking it = read-only mode.
  const canEdit = ctx.can("tenant.tag");
  const canImpersonate = ctx.can("tenant.impersonate");

  const filters = parseFilters(sp);
  const tab = (typeof sp.tab === "string" && VALID_TABS.has(sp.tab) ? sp.tab : "funnel") as
    | "funnel" | "kanban" | "list";

  // Always pull every row, then narrow client-side via applyFilters.
  // The Onboarding pipeline is bounded (active+trial tenants only) so
  // we don't need DB-side pagination — recomputing in JS is < 50ms.
  const [rows, settings] = await Promise.all([
    loadPipelineRows(),
    loadFunnelSettings(),
  ]);
  const filtered = applyFilters(rows, filters);

  const kpis = computeKpis(rows);
  const funnelTotals = computeFunnelTotals(filtered);

  // Distinct option pools for filter dropdowns (drawn from the
  // unfiltered set so toggling a filter doesn't shrink the menu).
  const planOptions = Array.from(new Set(rows.map((r) => r.plan))).sort();
  const countryOptions = Array.from(
    new Set(rows.map((r) => r.country).filter((c): c is string => !!c))
  ).map((c) => c.toUpperCase()).sort();
  const sourceOptions = TENANT_SOURCES;
  const industryOptions = BUSINESS_TYPES;

  // Stuck-tenant alert banner — show if any are over the soft threshold.
  const stuckRows = rows.filter((r) => r.isStuck);
  const stuckOverSoft = stuckRows.length;

  // Tabs
  const tabHrefFor = (id: "funnel" | "kanban" | "list") => `/platform/tenants/onboarding${buildQs(sp, { tab: id === "funnel" ? null : id })}`;
  const baseTabs = [
    { id: "funnel" as const, label: "Funnel",  count: funnelTotals[0]?.count },
    { id: "kanban" as const, label: "Kanban",  count: filtered.length },
    { id: "list"   as const, label: "List",    count: filtered.length },
  ];

  // Pull the stuck tenant ids for one-click bulk-enroll.
  const stuckIds = stuckRows.map((r) => r.id);

  // Export URL preserves current filters.
  const exportQs = buildQs(sp, { tab: null });

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Tenants", href: "/platform/tenants" },
          { label: "Onboarding" },
        ]} />
        <div className="mt-3">
          <PageHeader
            title="Onboarding Pipeline"
            description="Track signups from creation to activation."
            actions={
              <>
                {canEdit && stuckIds.length > 0 && (
                  <SendNudgeCampaignButton
                    stuckTenantIds={stuckIds}
                    stuckCount={stuckIds.length}
                  />
                )}
                <Link href={`/api/platform/tenants/onboarding/export${exportQs}`}>
                  <Button size="sm" variant="secondary">Export funnel</Button>
                </Link>
                {canEdit && (
                  <EditFunnelButton settings={settings} stages={STAGES} />
                )}
              </>
            }
          />
        </div>
      </div>

      {/* Stuck tenants banner — only when there are any */}
      {stuckOverSoft > 0 && (
        <Banner
          variant="warning"
          layout="full"
          title={`${stuckOverSoft} tenant${stuckOverSoft === 1 ? "" : "s"} stuck >${settings.stuckThresholdDays} days`}
          cta={canEdit ? {
            label: "View stuck only",
            href: `/platform/tenants/onboarding${buildQs(sp, { stuck: "1" })}`,
          } : undefined}
        >
          {`Tenants past the ${settings.stuckThresholdDays}-day threshold need a hand. ` +
           `Use "Send nudge campaign" to enrol every stuck tenant in the drip.`}
        </Banner>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Trials this month"     value={kpis.trialsThisMonth.toLocaleString()} />
        <KpiCard label="Conversions (mo)"      value={kpis.conversionsThisMonth.toLocaleString()} />
        <KpiCard label="Conversion rate"       value={kpis.conversionRatePct == null ? "—" : `${kpis.conversionRatePct}%`}
                 sub={kpis.conversionRatePct == null ? "no new signups yet" : "signed-up → active"} />
        <KpiCard label="Avg days to activation" value={kpis.avgDaysToActivation == null ? "—" : `${kpis.avgDaysToActivation}d`}
                 sub={kpis.avgDaysToActivation == null ? "no activations yet" : undefined} />
        <KpiCard label="Stuck tenants"
                 value={kpis.stuckCount.toLocaleString()}
                 tone={kpis.stuckCount > 0 ? "warning" : "default"}
                 sub={kpis.stuckCount > 0 ? `>${settings.stuckThresholdDays}d in stage` : "all moving"} />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          variant="pill"
          activeHref={tabHrefFor(tab)}
          items={baseTabs.map((t) => ({
            label: t.label,
            href: tabHrefFor(t.id),
            badge: t.count,
          }))}
        />
      </div>

      {/* Filters */}
      <Card padding="md">
        <OnboardingFiltersBar
          planOptions={planOptions}
          countryOptions={countryOptions}
          sourceOptions={sourceOptions}
          industryOptions={industryOptions}
        />
      </Card>

      {/* Tab body */}
      {tab === "funnel" && (
        <FunnelTab
          totals={funnelTotals}
          rows={filtered}
          canEdit={canEdit}
          canImpersonate={canImpersonate}
        />
      )}
      {tab === "kanban" && (
        <KanbanTab
          rows={filtered}
          stages={STAGES}
          wipLimits={settings.wipLimits}
          canEdit={canEdit}
          canImpersonate={canImpersonate}
        />
      )}
      {tab === "list" && (
        <ListTab
          rows={filtered}
          canEdit={canEdit}
          canImpersonate={canImpersonate}
        />
      )}
    </div>
  );
}

/* ── KPI card (no chart, no client deps) ─────────────────── */

function KpiCard({
  label, value, sub, tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "warning" | "danger";
}) {
  const palette =
    tone === "warning" ? { borderColor: "var(--amber-200)" } :
    tone === "danger"  ? { borderColor: "var(--rose-200)" } :
                          undefined;
  return (
    <Card padding="md" className="h-full" style={palette}>
      <div className="flex h-full flex-col justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
        <div>
          <div className="text-[24px] font-semibold leading-none tabular-nums" style={{ color: "var(--text-default)" }}>{value}</div>
          {sub && <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>{sub}</div>}
        </div>
      </div>
    </Card>
  );
}
