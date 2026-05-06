// Page 45 — Third-Party Integrations Catalog (top-level).
//
// Layout:
//   - Header strip (title + actions)
//   - 4-card KPI strip
//   - Status tabs (All / Active / Beta / Coming Soon / Deprecated / Internal Only)
//   - 12-column grid: filter rail (left) + grid cards (right)

import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadCatalogKpis,
  loadCatalogList,
  CATEGORY_LABELS,
  AUTH_LABELS,
  REGION_LABELS,
  type CatalogListRow,
  type CatalogKpis,
  type CatalogListFilters,
} from "@/server/platform/integrations-catalog";
import { syncCatalogAvailability } from "@/app/actions/platform-integrations-catalog";
import type {
  IntegrationCatalogStatus,
  IntegrationCategory,
  IntegrationAuthType,
  IntegrationRegion,
} from "@prisma/client";
import { Kpi, StatusPill, CategoryBadge, AuthTypeBadge, RegionBadge, FormError, FormOk, Logo } from "./_shared";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;
const asArray = (v: string | string[] | undefined): string[] => {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  return v.split(",").filter(Boolean);
};

const STATUS_TABS: ("ALL" | IntegrationCatalogStatus)[] = ["ALL", "ACTIVE", "BETA", "COMING_SOON", "DEPRECATED", "INTERNAL_ONLY"];
const CATEGORIES_LIST: IntegrationCategory[] = [
  "ACCOUNTING", "PAYMENTS", "ECOMMERCE", "MARKETPLACES", "AUTOMATION", "COMMUNICATION",
  "EMAIL_MARKETING", "CRM", "TEAM_COLLAB", "PRODUCTIVITY", "SHIPPING", "CARRIERS",
  "DESIGN", "FILE_TRANSFER", "PRINT_INDUSTRY", "EQUIPMENT", "ANALYTICS", "TELEPHONY",
  "CALENDAR", "REVIEWS", "OTHER",
];
const AUTH_TYPES_LIST: IntegrationAuthType[] = ["OAUTH2", "API_KEY", "BASIC_AUTH", "SAML", "CUSTOM"];
const REGIONS_LIST: IntegrationRegion[] = ["US", "CA", "EU", "UK", "APAC", "GLOBAL"];

export default async function IntegrationCatalogPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canWrite = ctx.can("integrations.manage");
  const ok = asString(sp.ok);
  const error = asString(sp.error);

  const statusRaw = (asString(sp.status) ?? "ALL") as "ALL" | IntegrationCatalogStatus;
  const filters: CatalogListFilters = {
    q:           asString(sp.q),
    status:      statusRaw,
    categories:  asArray(sp.cat).filter((c) => (CATEGORIES_LIST as readonly string[]).includes(c)) as IntegrationCategory[],
    authType:    (asString(sp.auth) as IntegrationAuthType | undefined),
    region:      (asString(sp.region) as IntegrationRegion | undefined),
    plan:        asString(sp.plan),
    adoption:    asString(sp.adoption) as "high" | "medium" | "low" | undefined,
  };

  const [tenantCount, kpis, byStatus, plans] = await Promise.all([
    db.tenant.count({ where: { status: { in: ["ACTIVE", "TRIAL"] } } }),
    loadCatalogKpis(),
    db.integrationCatalog.groupBy({ by: ["status"], _count: { _all: true } }),
    db.integrationCatalog.findMany({ select: { availablePlans: true } }),
  ]);
  const list = await loadCatalogList(filters, tenantCount);

  const planSet = new Set<string>();
  for (const r of plans) for (const p of r.availablePlans) planSet.add(p);
  const planList = Array.from(planSet).sort();

  const statusCount = new Map<IntegrationCatalogStatus, number>();
  for (const r of byStatus) statusCount.set(r.status, r._count._all);

  return (
    <div className="space-y-5">
      <Header canWrite={canWrite} />
      {ok && <FormOk msg={ok} />}
      {error && <FormError msg={error} />}

      <KpiStrip kpis={kpis} />

      <StatusTabs active={statusRaw} statusCount={statusCount} />

      <div className="grid grid-cols-12 gap-5">
        <aside className="col-span-12 lg:col-span-3">
          <FilterRail filters={filters} planList={planList} />
        </aside>
        <main className="col-span-12 lg:col-span-9">
          {list.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {list.map((row) => (
                <Card key={row.id} row={row} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

/* ── Header ──────────────────────────────────────────── */

function Header({ canWrite }: { canWrite: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Integrations &amp; API</div>
        <h1 className="mt-1 text-[22px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
          Integrations Catalog
        </h1>
        <p className="mt-1 max-w-3xl text-[12px]" style={{ color: "var(--text-muted)" }}>
          Manage third-party services available to Flowtora tenants — catalog metadata, version
          history, adoption metrics, health, and field mappings.
        </p>
      </div>

      {canWrite && (
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/platform/integrations/new"
                className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                style={{ background: "var(--accent-primary)", color: "white" }}>
            + Add Integration
          </Link>
          <form action={syncCatalogAvailability}>
            <button type="submit"
                    className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                    style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
              Sync availability
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/* ── KPI strip ───────────────────────────────────────── */

function KpiStrip({ kpis }: { kpis: CatalogKpis }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
      <Kpi label="Total integrations"
           value={kpis.total.toLocaleString()}
           sub={`+${kpis.newSinceQuarter} added vs last quarter`} />
      <Kpi label="Active integrations"
           value={kpis.active.toLocaleString()}
           sub="Live in catalog"
           sparkline={kpis.syncSparkline} />
      <Kpi label="Most adopted"
           value={kpis.mostAdoptedName ?? "—"}
           sub={kpis.mostAdoptedPct == null ? "" : `${(kpis.mostAdoptedPct * 100).toFixed(0)}% of tenants connected`} />
      <Kpi label="Health score"
           value={kpis.avgUptimePct == null ? "—" : `${kpis.avgUptimePct.toFixed(1)}%`}
           sub="90-day avg uptime"
           tone={kpis.avgUptimePct == null ? "default" :
                 kpis.avgUptimePct >= 99 ? "good" :
                 kpis.avgUptimePct >= 95 ? "warning" : "danger"} />
    </div>
  );
}

/* ── Status tabs ────────────────────────────────────── */

function StatusTabs({ active, statusCount }: {
  active: "ALL" | IntegrationCatalogStatus;
  statusCount: Map<IntegrationCatalogStatus, number>;
}) {
  const labels: Record<typeof STATUS_TABS[number], string> = {
    ALL:           "All",
    ACTIVE:        "Active",
    BETA:          "Beta",
    COMING_SOON:   "Coming soon",
    DEPRECATED:    "Deprecated",
    INTERNAL_ONLY: "Internal only",
  };
  const total = Array.from(statusCount.values()).reduce((s, n) => s + n, 0);
  return (
    <nav className="flex flex-wrap items-center gap-1 border-b" style={{ borderColor: "var(--border-subtle)" }}>
      {STATUS_TABS.map((s) => {
        const isActive = s === active;
        const count = s === "ALL" ? total : statusCount.get(s as IntegrationCatalogStatus) ?? 0;
        return (
          <Link key={s} href={`?status=${s}`} scroll={false}
                className="ts-focus inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium"
                style={{
                  color: isActive ? "var(--text-default)" : "var(--text-muted)",
                  borderBottom: isActive ? "2px solid var(--accent-primary)" : "2px solid transparent",
                  marginBottom: "-1px",
                }}>
            {labels[s]}
            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
              {count}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

/* ── Filter rail ────────────────────────────────────── */

function FilterRail({ filters, planList }: { filters: CatalogListFilters; planList: string[] }) {
  return (
    <form className="rounded-lg border p-3 space-y-3"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
          method="get">
      <input type="hidden" name="status" value={typeof filters.status === "string" ? filters.status : "ALL"} />

      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Search
        </label>
        <input type="text" name="q" defaultValue={filters.q ?? ""}
               placeholder="QuickBooks, Stripe, Shopify…"
               className="ts-focus mt-1 w-full rounded-md border px-2 py-1 text-[12px]"
               style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
      </div>

      <FilterGroup label="Category">
        <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
          {CATEGORIES_LIST.map((c) => (
            <label key={c} className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-default)" }}>
              <input type="checkbox" name="cat" value={c}
                     defaultChecked={filters.categories?.includes(c) ?? false}
                     className="ts-focus h-3.5 w-3.5" />
              {CATEGORY_LABELS[c]}
            </label>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup label="Auth type">
        <select name="auth" defaultValue={filters.authType ?? ""}
                className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
          <option value="">Any</option>
          {AUTH_TYPES_LIST.map((t) => <option key={t} value={t}>{AUTH_LABELS[t]}</option>)}
        </select>
      </FilterGroup>

      <FilterGroup label="Pricing tier">
        <select name="plan" defaultValue={filters.plan ?? ""}
                className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
          <option value="">All plans</option>
          {planList.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </FilterGroup>

      <FilterGroup label="Region">
        <select name="region" defaultValue={filters.region ?? ""}
                className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
          <option value="">Any</option>
          {REGIONS_LIST.map((r) => <option key={r} value={r}>{REGION_LABELS[r]}</option>)}
        </select>
      </FilterGroup>

      <FilterGroup label="Adoption">
        <select name="adoption" defaultValue={filters.adoption ?? ""}
                className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
          <option value="">Any</option>
          <option value="high">High (&gt;50%)</option>
          <option value="medium">Medium (10–50%)</option>
          <option value="low">Low (&lt;10%)</option>
        </select>
      </FilterGroup>

      <div className="flex items-center gap-2">
        <button type="submit"
                className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium flex-1"
                style={{ background: "var(--accent-primary)", color: "white" }}>
          Apply
        </button>
        <Link href="/platform/integrations"
              className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
              style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
          Reset
        </Link>
      </div>
    </form>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      {children}
    </div>
  );
}

/* ── Card ────────────────────────────────────────────── */

function Card({ row }: { row: CatalogListRow }) {
  return (
    <Link href={`/platform/integrations/${row.slug}`}
          className="ts-focus rounded-lg border p-3 space-y-2 transition-colors hover:border-[var(--accent-primary)]"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="flex items-start gap-3">
        <Logo url={row.logoUrl} name={row.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>
              {row.name}
            </h3>
            <StatusPill status={row.status} />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            <CategoryBadge category={row.category} />
            <AuthTypeBadge type={row.authType} />
          </div>
          <p className="mt-1 line-clamp-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
            {row.shortDescription}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-2 text-[10px]"
           style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
        <span>
          <strong style={{ color: "var(--text-default)" }}>{row.connectedTenantCount.toLocaleString()}</strong> tenants
        </span>
        <span>·</span>
        <span>
          <strong style={{ color: "var(--text-default)" }}>{row.syncCount7d.toLocaleString()}</strong> syncs/7d
        </span>
        <span>·</span>
        <span style={{
          color: row.uptimePct90d == null ? "var(--text-muted)" :
                 row.uptimePct90d >= 99 ? "var(--success-fg)" :
                 row.uptimePct90d >= 95 ? "var(--warning-fg)" : "var(--danger-fg)",
        }}>
          {row.uptimePct90d == null ? "—" : `${row.uptimePct90d.toFixed(1)}%`}
        </span>
        {row.regions.length > 0 && (
          <div className="ml-auto flex gap-0.5">
            {row.regions.slice(0, 3).map((r) => <RegionBadge key={r} region={r} />)}
            {row.regions.length > 3 && (
              <span className="rounded-md px-1 text-[9px]" style={{ color: "var(--text-muted)" }}>
                +{row.regions.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

/* ── Empty state ─────────────────────────────────────── */

function EmptyState() {
  return (
    <div className="rounded-lg border p-8 text-center"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="text-[48px]" style={{ color: "var(--text-faint)" }}>🔌</div>
      <h3 className="mt-2 text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
        No integrations match your filters
      </h3>
      <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
        Try widening the category list or clearing the search box.
      </p>
      <Link href="/platform/integrations"
            className="ts-focus mt-3 inline-block rounded-md px-3 py-1.5 text-[12px] font-medium"
            style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
        Reset filters
      </Link>
    </div>
  );
}
