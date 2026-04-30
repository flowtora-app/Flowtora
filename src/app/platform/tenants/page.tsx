import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import {
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  Tabs,
} from "@/components/ui";
import {
  loadTenantsKpi,
  loadTenantsList,
  parseTenantsFilters,
  type SortKey,
  type SortDir,
  type TenantsFilters,
} from "@/server/platform/tenants-list";
import { TenantsTable } from "./_components/TenantsTable";
import { TenantsFilterBar } from "./_components/TenantsFilterBar";
import { TenantsSavedViews } from "./_components/TenantsSavedViews";
import { NewTenantsPill } from "./_components/NewTenantsPill";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;
const VALID_SORT: Record<string, true> = {
  name: true, slug: true, plan: true, status: true,
  mrr: true, users: true, jobs: true, health: true,
  created: true, activity: true, owner: true,
};
const DEFAULT_VISIBLE: Record<string, boolean> = {
  // Default columns from the spec table.
  name: true, plan: true, status: true, mrr: true, users: true,
  jobs: true, health: true, created: true, activity: true,
  owner: true, country: true, tags: true, csm: true,
  // Optional columns hidden by default — toggle reveals them.
  trialEnds: false, domain: false, sso: false, mfa: false,
  storage: false, industry: false, source: false,
};

type SearchParams = Record<string, string | string[] | undefined>;

export default async function PlatformTenantsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;

  // Permission gates we'll forward to the table client.
  const canImpersonate = ctx.can("tenant.impersonate");
  const canPlanChange  = ctx.can("billing.plan_change");
  const canHardDelete  = ctx.can("tenant.delete");
  const canSuspend     = ctx.can("tenant.suspend");
  const canTag         = ctx.can("tenant.tag");
  const canCoupon      = ctx.can("billing.coupon");
  const canBulkWrite   = ctx.can("staff.assign_role"); // CSM assignment uses staff.* perm

  const filters = parseTenantsFilters(sp);
  const sortKeyRaw = typeof sp.sort === "string" ? sp.sort : "activity";
  const sortKey: SortKey = (VALID_SORT[sortKeyRaw] ? sortKeyRaw : "activity") as SortKey;
  const sortDir: SortDir = sp.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : "1") || 1);
  const density: "comfortable" | "compact" =
    typeof sp.density === "string" && sp.density === "compact" ? "compact" : "comfortable";

  // Fan out the data + saved-view + option queries in parallel.
  const [kpi, list, savedViews, staffOptions, distinctTags, distinctCountries] = await Promise.all([
    loadTenantsKpi(),
    loadTenantsList({
      filters, sortKey, sortDir, page, pageSize: PAGE_SIZE, currentUserId: ctx.userId,
    }),
    db.platformSavedView.findMany({
      where: {
        kind: "tenants",
        OR: [{ userId: ctx.userId }, { isShared: true }],
      },
      orderBy: [{ isShared: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
      take: 50,
      select: {
        id: true, name: true, filters: true, isShared: true, userId: true,
        user: { select: { name: true, email: true } },
      },
    }),
    db.user.findMany({
      where: { OR: [{ platformRole: { not: null } }, { customPlatformRoleId: { not: null } }] },
      orderBy: { email: "asc" },
      select: { id: true, name: true, email: true },
      take: 200,
    }),
    db.tenant.findMany({
      where: { adminTags: { isEmpty: false } },
      select: { adminTags: true },
      take: 500,
    }),
    db.tenant.findMany({
      where: { country: { not: null } },
      select: { country: true },
      distinct: ["country"],
      take: 200,
    }),
  ]);

  const tagOptions = Array.from(new Set(distinctTags.flatMap((t) => t.adminTags))).sort();
  const countryOptions = (await import("@/lib/country-codes")).normalizeCountry; // type ref only
  void countryOptions;

  // Convert distinct country strings to (iso2, name) records via the
  // normaliser. Keep entries we can normalise; drop unrecognised so
  // the dropdown stays clean.
  const { normalizeCountry } = await import("@/lib/country-codes");
  const countrySet = new Map<string, { iso2: string; name: string }>();
  for (const t of distinctCountries) {
    const n = normalizeCountry(t.country);
    if (n) countrySet.set(n.iso2, { iso2: n.iso2, name: n.name });
  }
  const countryList = Array.from(countrySet.values()).sort((a, b) => a.name.localeCompare(b.name));

  const filterQs = (() => {
    // Reuse the URL we got. Strip page so navigation across pages
    // resets cleanly.
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (k === "page") continue;
      if (typeof v === "string") u.set(k, v);
      else if (Array.isArray(v)) for (const x of v) u.append(k, x);
    }
    return u.toString();
  })();

  // Tabs — preset scopes plus saved views.
  const scope = (typeof sp.scope === "string" ? sp.scope : null) ?? "all";
  const baseTabs = [
    { id: "all",        label: "All",                 count: kpi.total },
    { id: "active",     label: "Active",              count: kpi.activeCount },
    { id: "trial",      label: "Trial",               count: kpi.trialCount },
    { id: "at-risk",    label: "At-Risk",             count: undefined },
    { id: "past-due",   label: "Past Due",            count: kpi.pastDueCount },
    { id: "cancelled",  label: "Cancelled",           count: undefined },
    { id: "enterprise", label: "Enterprise",          count: undefined },
    { id: "my-csm",     label: "My CSM book",         count: undefined },
    { id: "recent",     label: "Recently created",    count: undefined },
  ];
  const tabHrefFor = (id: string) => {
    const u = new URLSearchParams();
    if (id !== "all") u.set("scope", id);
    return `/platform/tenants${u.toString() ? `?${u.toString()}` : ""}`;
  };
  const activeHref = tabHrefFor(scope);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <Breadcrumb items={[{ label: "Platform", href: "/platform" }, { label: "Tenants" }]} />
        <div className="mt-3">
          <PageHeader
            title="Tenants"
            description="All sign & print shop accounts on Flowtora."
            actions={
              <>
                {ctx.can("staff.invite") && (
                  <Link href="/platform/tenants/new">
                    <Button size="sm">+ New tenant</Button>
                  </Link>
                )}
                {ctx.can("staff.invite") && (
                  <Link href="/platform/tenants/import">
                    <Button size="sm" variant="secondary">Import CSV</Button>
                  </Link>
                )}
                <Link href={`/api/platform/tenants/export?${filterQs}&format=csv`}>
                  <Button size="sm" variant="secondary">Export CSV</Button>
                </Link>
                <Link href={`/api/platform/tenants/export?${filterQs}&format=xlsx`}>
                  <Button size="sm" variant="ghost">Export XLSX</Button>
                </Link>
                <Link href={`/api/platform/tenants/export?${filterQs}&format=json`}>
                  <Button size="sm" variant="ghost">Export JSON</Button>
                </Link>
              </>
            }
          />
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total tenants"
                 value={kpi.total.toLocaleString()}
                 deltaPct={kpi.totalDeltaPct}
                 sub={kpi.totalDeltaPct == null ? "no prior baseline" : "vs. prior 30 days"}
                 spark={kpi.spark14d}
                 sparkColor="var(--brand-500)" />
        <KpiCard label="Active"
                 value={kpi.activeCount.toLocaleString()}
                 sub={`${kpi.activeSharePct}% of total`}
                 sparkColor="var(--emerald-500)" />
        <KpiCard label="Trialing"
                 value={kpi.trialCount.toLocaleString()}
                 sub={kpi.trialMedianDaysRemaining == null ? "no active trials" : `Median ${kpi.trialMedianDaysRemaining}d remaining`}
                 sparkColor="var(--brand-400)" />
        <KpiCard label="Past due"
                 value={kpi.pastDueCount.toLocaleString()}
                 sub={kpi.pastDueDollarsAtRisk > 0 ? `$${Math.round(kpi.pastDueDollarsAtRisk).toLocaleString()} at risk` : "no $ at risk"}
                 sparkColor="var(--rose-500)"
                 tone={kpi.pastDueCount > 0 ? "warning" : "default"} />
      </div>

      {/* Tabs + saved views + live "X new tenants" pill */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1">
          <Tabs
            variant="pill"
            activeHref={activeHref}
            items={baseTabs.map((t) => ({
              label: t.label,
              href: tabHrefFor(t.id),
              badge: t.count,
            }))}
          />
        </div>
        <NewTenantsPill initialMostRecentIso={list.rows[0]?.createdAt?.toISOString() ?? new Date().toISOString()} />
        <TenantsSavedViews views={savedViews.map((v) => ({
          id: v.id,
          name: v.name,
          filters: v.filters,
          isShared: v.isShared,
          ownedByMe: v.userId === ctx.userId,
          ownerName: v.user?.name ?? v.user?.email ?? null,
        }))} />
      </div>

      {/* Filter bar */}
      <Card padding="md">
        <TenantsFilterBar
          countryOptions={countryList}
          staffOptions={staffOptions.map((u) => ({ id: u.id, label: u.name && u.name.trim() !== "" ? `${u.name} (${u.email})` : u.email }))}
          tagOptions={tagOptions}
          density={density}
        />
      </Card>

      {/* Table */}
      {list.rows.length === 0 && filterQs === "" ? (
        <Card padding="lg">
          <div className="text-center">
            <h3 className="text-[16px] font-semibold" style={{ color: "var(--text-default)" }}>No tenants yet</h3>
            <p className="mx-auto mt-1 max-w-md text-[13px]" style={{ color: "var(--text-muted)" }}>
              Add your first sign or print shop manually, or wait for signups.
            </p>
          </div>
        </Card>
      ) : (
        <TenantsTable
          rows={list.rows}
          total={list.total}
          filteredTotal={list.filteredTotal}
          page={page}
          pageSize={PAGE_SIZE}
          sortKey={sortKey}
          sortDir={sortDir}
          filterQs={filterQs}
          visibleColumns={DEFAULT_VISIBLE}
          density={density}
          canBulkWrite={canBulkWrite}
          canImpersonate={canImpersonate}
          canPlanChange={canPlanChange}
          canHardDelete={canHardDelete}
          canSuspend={canSuspend}
          canTag={canTag}
          canCoupon={canCoupon}
        />
      )}
    </div>
  );
  void filters;
}

/* ── KPI card (server-renderable, no client deps) ───────── */

function KpiCard({
  label, value, deltaPct, sub, spark, sparkColor, tone,
}: {
  label: string;
  value: string;
  deltaPct?: number | null;
  sub?: string;
  spark?: readonly number[];
  sparkColor?: string;
  tone?: "default" | "warning" | "danger";
}) {
  const palette =
    tone === "warning" ? { border: "var(--amber-200)" } :
    tone === "danger"  ? { border: "var(--rose-200)" } :
                          { border: undefined };
  return (
    <Card padding="md" className="h-full" style={palette.border ? { borderColor: palette.border } : undefined}>
      <div className="flex h-full flex-col justify-between gap-2">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            {label}
          </span>
          {deltaPct != null && <DeltaPill pct={deltaPct} />}
        </div>
        <div>
          <div className="text-[24px] font-semibold leading-none tabular-nums" style={{ color: "var(--text-default)" }}>{value}</div>
          {sub && <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>{sub}</div>}
        </div>
        {spark && spark.length > 1 && <Sparkline values={spark} color={sparkColor ?? "var(--brand-600)"} />}
      </div>
    </Card>
  );
}

function DeltaPill({ pct }: { pct: number }) {
  const palette = pct > 0 ? { bg: "var(--emerald-50)", fg: "var(--emerald-700)" }
                : pct < 0 ? { bg: "var(--rose-50)",    fg: "var(--rose-700)" }
                          : { bg: "var(--surface-2)",  fg: "var(--text-muted)" };
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
          style={{ background: palette.bg, color: palette.fg }}>
      {pct > 0 ? "↑" : pct < 0 ? "↓" : "·"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function Sparkline({ values, color }: { values: readonly number[]; color: string }) {
  const w = 100, h = 28, padY = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const stepX = w / (values.length - 1);
  const points = values.map((v, i) => `${i * stepX},${h - padY - ((v - min) / range) * (h - padY * 2)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block w-full" style={{ height: 28 }} aria-hidden>
      <polygon points={`0,${h} ${points} ${w},${h}`} fill={color} fillOpacity={0.12} />
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
