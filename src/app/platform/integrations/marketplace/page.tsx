// Page 48 — Marketplace (top-level).
//
// 9 tabs: All Apps · Pending Review · Published · Suspended · Featured ·
//         Categories · Reviews · Revenue Share · Submission Settings.

import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadMarketplaceKpis,
  loadAppList,
  loadCategories,
  loadReviewModerationQueue,
  loadPayouts,
  loadMarketplaceSettings,
  loadSubmissionsKanban,
  STAGE_LABELS,
  PRICING_LABELS,
  TIER_LABELS,
  type MarketplaceKpis,
  type AppRow,
  type AppFilters,
  type CategoryRow,
  type ReviewModerationRow,
  type PayoutRow,
} from "@/server/platform/marketplace";
import {
  saveMarketplaceSettings,
  saveCategory,
  deleteCategory,
  hideReview,
  publishReview,
  banReviewer,
  markPayoutPaid,
  transitionSubmission,
} from "@/app/actions/platform-marketplace";
import type {
  MarketplaceAppStatus,
  MarketplacePricingModel,
  MarketplaceRiskLevel,
  MarketplaceReviewStatus,
  MarketplaceSubmissionStage,
  MarketplaceRevenueShareTier,
} from "@prisma/client";
import {
  Kpi, StatusPill, RiskPill, ReviewStatusPill, StagePill, Stars,
  FormError, FormOk, Field, relativeFromNow, dollars, pricingLabel, tierLabel, Logo,
} from "./_shared";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;
const asNum = (v: string | string[] | undefined): number | undefined => {
  const s = asString(v);
  if (!s) return undefined;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : undefined;
};

const TABS = ["all", "pending", "published", "suspended", "featured", "categories", "reviews", "revenue", "settings"] as const;
type Tab = typeof TABS[number];

const STATUSES: MarketplaceAppStatus[] = ["DRAFT", "IN_REVIEW", "APPROVED", "REJECTED", "SUSPENDED"];
const PRICING: MarketplacePricingModel[] = ["FREE", "ONE_TIME", "SUBSCRIPTION", "USAGE"];
const RISK: MarketplaceRiskLevel[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export default async function MarketplaceListPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canWrite = ctx.can("marketplace.manage");
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const tabRaw = asString(sp.tab) as Tab | undefined;
  const tab: Tab = tabRaw && (TABS as readonly string[]).includes(tabRaw) ? tabRaw : "all";

  const [kpis, categories, kanban, settings] = await Promise.all([
    loadMarketplaceKpis(),
    loadCategories(),
    loadSubmissionsKanban(),
    loadMarketplaceSettings(),
  ]);

  return (
    <div className="space-y-5">
      <Header />
      {ok && <FormOk msg={ok} />}
      {error && <FormError msg={error} />}

      <KpiBar kpis={kpis} />

      <TabsBar active={tab} kpis={kpis} />

      {tab === "all" && (
        <AllAppsTab
          filters={{
            q:           asString(sp.q),
            status:      asString(sp.status) as MarketplaceAppStatus | "ALL" | undefined,
            categoryId:  asString(sp.cat),
            pricingModel: asString(sp.pricing) as MarketplacePricingModel | undefined,
            paid:        asString(sp.paid) === "1" ? true : asString(sp.paid) === "0" ? false : undefined,
            riskLevel:   asString(sp.risk) as MarketplaceRiskLevel | undefined,
            featured:    asString(sp.featured) === "1" ? true : asString(sp.featured) === "0" ? false : undefined,
            submittedFrom: asString(sp.from) ? new Date(asString(sp.from)!) : undefined,
            submittedTo:   asString(sp.to)   ? new Date(asString(sp.to)!) : undefined,
          }}
          categories={categories}
        />
      )}
      {tab === "pending" && (
        <PendingReviewTab kanban={kanban} canWrite={canWrite} />
      )}
      {tab === "published" && (
        <SimpleListTab status="APPROVED" categories={categories} q={asString(sp.q)} />
      )}
      {tab === "suspended" && (
        <SimpleListTab status="SUSPENDED" categories={categories} q={asString(sp.q)} />
      )}
      {tab === "featured" && (
        <FeaturedTab />
      )}
      {tab === "categories" && (
        <CategoriesTab categories={categories} canWrite={canWrite} />
      )}
      {tab === "reviews" && (
        <ReviewsTab
          status={asString(sp.reviewStatus) as MarketplaceReviewStatus | "ALL" | undefined}
          canWrite={canWrite}
        />
      )}
      {tab === "revenue" && (
        <RevenueShareTab canWrite={canWrite} />
      )}
      {tab === "settings" && (
        <SettingsTab settings={settings} canWrite={canWrite} />
      )}
    </div>
  );
}

/* ── Header ───────────────────────────────────── */

function Header() {
  return (
    <div>
      <nav className="text-[11px]" aria-label="Breadcrumbs">
        <Link href="/platform/integrations" className="ts-focus underline" style={{ color: "var(--text-muted)" }}>
          Integrations Catalog
        </Link>
        <span className="mx-1.5" style={{ color: "var(--text-faint)" }}>/</span>
        <span style={{ color: "var(--text-default)" }}>Marketplace</span>
      </nav>
      <h1 className="mt-1 text-[22px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
        Marketplace
      </h1>
      <p className="mt-1 max-w-3xl text-[12px]" style={{ color: "var(--text-muted)" }}>
        Third-party apps that tenants can install into their Flowtora workspaces.
        Review submissions, moderate reviews, manage revenue share, and configure submission gates.
      </p>
    </div>
  );
}

/* ── KPI bar ──────────────────────────────────── */

function KpiBar({ kpis }: { kpis: MarketplaceKpis }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      <Kpi label="Apps · approved" value={kpis.approvedApps.toLocaleString()}
           sub={`${kpis.totalApps} total · ${kpis.suspendedApps} suspended`} />
      <Kpi label="Pending review" value={kpis.pendingApps.toLocaleString()}
           tone={kpis.pendingApps > 0 ? "warning" : "good"} />
      <Kpi label="Active installs" value={kpis.totalInstalls.toLocaleString()}
           sub={`+${kpis.installs30d} this month`} />
      <Kpi label="MRR contribution" value={dollars(kpis.mrrContributionCents)} />
      <Kpi label="Avg rating"
           value={kpis.averageRating == null ? "—" : kpis.averageRating.toFixed(2)}
           sub={kpis.averageRating == null ? "" : "out of 5"} />
      <Kpi label="Pending payouts" value={dollars(kpis.pendingPayoutsCents)}
           tone={kpis.pendingPayoutsCents > 100_000 ? "warning" : "default"}
           sub={`${kpis.flaggedReviews} flagged reviews`} />
    </div>
  );
}

/* ── Tabs bar ─────────────────────────────────── */

function TabsBar({ active, kpis }: { active: Tab; kpis: MarketplaceKpis }) {
  const items: Array<{ key: Tab; label: string; badge?: string; tone?: "warn" }> = [
    { key: "all",         label: "All Apps" },
    { key: "pending",     label: "Pending Review", badge: kpis.pendingApps > 0 ? String(kpis.pendingApps) : undefined, tone: "warn" },
    { key: "published",   label: "Published" },
    { key: "suspended",   label: "Suspended", badge: kpis.suspendedApps > 0 ? String(kpis.suspendedApps) : undefined, tone: "warn" },
    { key: "featured",    label: "Featured" },
    { key: "categories",  label: "Categories" },
    { key: "reviews",     label: "Reviews", badge: kpis.flaggedReviews > 0 ? String(kpis.flaggedReviews) : undefined, tone: "warn" },
    { key: "revenue",     label: "Revenue Share" },
    { key: "settings",    label: "Submission Settings" },
  ];
  return (
    <nav className="flex flex-wrap items-center gap-1 border-b" style={{ borderColor: "var(--border-subtle)" }}>
      {items.map((i) => {
        const isActive = i.key === active;
        return (
          <Link key={i.key} href={`?tab=${i.key}`} scroll={false}
                className="ts-focus inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium"
                style={{
                  color: isActive ? "var(--text-default)" : "var(--text-muted)",
                  borderBottom: isActive ? "2px solid var(--accent-primary)" : "2px solid transparent",
                  marginBottom: "-1px",
                }}>
            {i.label}
            {i.badge && (
              <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                    style={{
                      background: i.tone === "warn" ? "var(--warning-surface)" : "var(--surface-2)",
                      color:      i.tone === "warn" ? "var(--warning-fg)"     : "var(--text-muted)",
                    }}>
                {i.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/* ── All Apps tab ──────────────────────────────── */

async function AllAppsTab({
  filters, categories,
}: { filters: AppFilters; categories: CategoryRow[] }) {
  const list = await loadAppList(filters);
  return (
    <div className="space-y-3">
      <FilterRow filters={filters} categories={categories} />
      <AppTable rows={list} />
    </div>
  );
}

function FilterRow({ filters, categories }: { filters: AppFilters; categories: CategoryRow[] }) {
  return (
    <form className="rounded-lg border p-3"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
          method="get">
      <input type="hidden" name="tab" value="all" />
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3 lg:grid-cols-4">
        <Field label="Search">
          <input type="text" name="q" defaultValue={filters.q ?? ""}
                 placeholder="Name, developer, tagline"
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={typeof filters.status === "string" ? filters.status : "ALL"}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
            <option value="ALL">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.toLowerCase().replace(/_/g, " ")}</option>)}
          </select>
        </Field>
        <Field label="Category">
          <select name="cat" defaultValue={filters.categoryId ?? ""}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Pricing model">
          <select name="pricing" defaultValue={filters.pricingModel ?? ""}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
            <option value="">Any</option>
            {PRICING.map((p) => <option key={p} value={p}>{PRICING_LABELS[p]}</option>)}
          </select>
        </Field>
        <Field label="Free / Paid">
          <select name="paid" defaultValue={filters.paid === true ? "1" : filters.paid === false ? "0" : ""}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
            <option value="">Both</option>
            <option value="0">Free</option>
            <option value="1">Paid</option>
          </select>
        </Field>
        <Field label="Risk score">
          <select name="risk" defaultValue={filters.riskLevel ?? ""}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
            <option value="">Any</option>
            {RISK.map((r) => <option key={r} value={r}>{r.toLowerCase()}</option>)}
          </select>
        </Field>
        <Field label="Submitted from">
          <input type="date" name="from"
                 defaultValue={filters.submittedFrom ? filters.submittedFrom.toISOString().slice(0, 10) : ""}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Submitted to">
          <input type="date" name="to"
                 defaultValue={filters.submittedTo ? filters.submittedTo.toISOString().slice(0, 10) : ""}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button type="submit"
                className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                style={{ background: "var(--accent-primary)", color: "white" }}>
          Apply
        </button>
        <Link href="/platform/integrations/marketplace?tab=all"
              className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
              style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
          Reset
        </Link>
      </div>
    </form>
  );
}

function AppTable({ rows }: { rows: AppRow[] }) {
  return (
    <div className="rounded-lg border overflow-x-auto"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      {rows.length === 0 ? (
        <p className="p-3 text-[11px]" style={{ color: "var(--text-muted)" }}>No apps match.</p>
      ) : (
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ color: "var(--text-muted)" }}>
              <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">App</th>
              <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Developer</th>
              <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Category</th>
              <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Version</th>
              <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Status</th>
              <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Pricing</th>
              <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">Installs</th>
              <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Rating</th>
              <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">MRR</th>
              <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Risk</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                <td className="px-2 py-1.5">
                  <Link href={`/platform/integrations/marketplace/${a.slug}`}
                        className="ts-focus inline-flex items-center gap-2 underline"
                        style={{ color: "var(--text-default)" }}>
                    <Logo url={a.iconUrl} name={a.name} size={28} />
                    <span className="truncate font-medium">{a.name}</span>
                    {a.featured && (
                      <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                            style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}>
                        featured
                      </span>
                    )}
                  </Link>
                </td>
                <td className="px-2 py-1.5" style={{ color: "var(--text-muted)" }}>{a.developerName}</td>
                <td className="px-2 py-1.5" style={{ color: "var(--text-muted)" }}>{a.categoryName}</td>
                <td className="px-2 py-1.5 font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {a.currentVersion ?? "—"}
                </td>
                <td className="px-2 py-1.5"><StatusPill status={a.status} /></td>
                <td className="px-2 py-1.5" style={{ color: "var(--text-muted)" }}>{pricingLabel(a.pricingModel)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                  {a.installCount.toLocaleString()}
                </td>
                <td className="px-2 py-1.5">
                  <Stars rating={a.ratingAverage} count={a.ratingCount} />
                </td>
                <td className="px-2 py-1.5 text-right font-semibold tabular-nums"
                    style={{ color: a.mrrContributionCents > 0 ? "var(--success-fg)" : "var(--text-faint)" }}>
                  {a.mrrContributionCents > 0 ? dollars(a.mrrContributionCents) : "—"}
                </td>
                <td className="px-2 py-1.5">
                  <RiskPill level={a.riskLevel} />
                  <span className="ml-1 text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {a.riskScore}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ── Simple list tabs (Published / Suspended) ─── */

async function SimpleListTab({
  status, categories, q,
}: { status: MarketplaceAppStatus; categories: CategoryRow[]; q?: string }) {
  void categories;
  const rows = await loadAppList({ status, q });
  return (
    <div className="space-y-3">
      <form className="flex items-center gap-2" method="get">
        <input type="hidden" name="tab" value={status === "APPROVED" ? "published" : "suspended"} />
        <input type="text" name="q" defaultValue={q ?? ""}
               placeholder={`Search ${status.toLowerCase()} apps`}
               className="ts-focus min-w-[260px] flex-1 rounded-md border px-2.5 py-1.5 text-[12px]"
               style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        <button type="submit"
                className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
          Filter
        </button>
      </form>
      <AppTable rows={rows} />
    </div>
  );
}

/* ── Featured tab ──────────────────────────── */

async function FeaturedTab() {
  const rows = await loadAppList({ featured: true });
  return (
    <div className="space-y-3">
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        Apps marked as featured surface in tenants' Discover view. Toggle on the app detail page.
      </p>
      <AppTable rows={rows} />
    </div>
  );
}

/* ── Pending Review (kanban) ──────────────────── */

const KANBAN_STAGES: MarketplaceSubmissionStage[] = [
  "SUBMITTED", "AUTOMATED_CHECKS", "SECURITY_REVIEW", "LISTING_REVIEW", "APPROVED", "REJECTED",
];

function PendingReviewTab({
  kanban, canWrite,
}: {
  kanban: Awaited<ReturnType<typeof loadSubmissionsKanban>>;
  canWrite: boolean;
}) {
  return (
    <div className="space-y-3">
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        Submissions kanban. Each card is an open submission; transitions on the app detail page
        (Submission tab) advance the stage.
      </p>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3 lg:grid-cols-6">
        {KANBAN_STAGES.map((stage) => {
          const items = kanban[stage];
          return (
            <div key={stage} className="rounded-lg border p-2 space-y-1.5"
                 style={{
                   background: stage === "APPROVED" ? "var(--success-surface)" :
                               stage === "REJECTED" ? "var(--rose-50, var(--surface-2))" : "var(--surface-1)",
                   borderColor: "var(--border-subtle)",
                   minHeight: 120,
                 }}>
              <h3 className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide"
                  style={{ color: "var(--text-muted)" }}>
                <span>{STAGE_LABELS[stage]}</span>
                <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                      style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                  {items.length}
                </span>
              </h3>
              {items.length === 0 ? (
                <p className="text-[10px]" style={{ color: "var(--text-faint)" }}>—</p>
              ) : (
                <ul className="space-y-1">
                  {items.map((c) => (
                    <li key={c.id} className="rounded-md border p-1.5 text-[11px] space-y-0.5"
                        style={{
                          borderColor: c.overdue ? "var(--rose-200)" : "var(--border-subtle)",
                          background: "var(--surface-1)",
                        }}>
                      <Link href={`/platform/integrations/marketplace/${c.appSlug}?tab=submissions`}
                            className="ts-focus block truncate font-medium"
                            style={{ color: "var(--text-default)" }}>
                        {c.appName}
                      </Link>
                      <div className="text-[10px]" style={{ color: c.overdue ? "var(--danger-fg)" : "var(--text-muted)" }}>
                        {c.overdue ? "OVERDUE · " : ""}
                        {c.assigneeName ? `${c.assigneeName} · ` : ""}
                        {relativeFromNow(c.enteredAt)}
                      </div>
                      {canWrite && stage !== "APPROVED" && stage !== "REJECTED" && (
                        <form action={transitionSubmission} className="flex gap-0.5">
                          <input type="hidden" name="id" value={c.appId} />
                          <select name="toStage"
                                  defaultValue=""
                                  className="ts-focus flex-1 rounded-md border px-1 py-0.5 text-[10px]"
                                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
                            <option value="" disabled>Advance →</option>
                            {KANBAN_STAGES.filter((s) => s !== stage).map((s) => (
                              <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                            ))}
                          </select>
                          <button type="submit"
                                  className="ts-focus rounded-md px-1.5 py-0.5 text-[10px]"
                                  style={{ background: "var(--accent-primary)", color: "white" }}>
                            Go
                          </button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Categories ───────────────────────────────── */

function CategoriesTab({ categories, canWrite }: { categories: CategoryRow[]; canWrite: boolean }) {
  return (
    <div className="space-y-3">
      {canWrite && (
        <details className="rounded-lg border p-3"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
            + Add category
          </summary>
          <CategoryForm />
        </details>
      )}
      <div className="rounded-lg border overflow-x-auto"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        {categories.length === 0 ? (
          <p className="p-3 text-[11px]" style={{ color: "var(--text-muted)" }}>No categories yet.</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Name</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Slug</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Description</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">Apps</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">Featured order</th>
                {canWrite && <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <td className="px-2 py-1.5 font-medium" style={{ color: "var(--text-default)" }}>{c.name}</td>
                  <td className="px-2 py-1.5 font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>{c.slug}</td>
                  <td className="px-2 py-1.5" style={{ color: "var(--text-muted)" }}>{c.description ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                    {c.appCount}
                  </td>
                  <td className="px-2 py-1.5 text-right" style={{ color: "var(--text-muted)" }}>
                    {c.featuredOrder ?? "—"}
                  </td>
                  {canWrite && (
                    <td className="px-2 py-1.5">
                      <div className="flex justify-end gap-1">
                        <details>
                          <summary className="cursor-pointer rounded-md px-2 py-1 text-[10px] font-medium"
                                   style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
                            Edit
                          </summary>
                          <div className="mt-1">
                            <CategoryForm initial={c} />
                          </div>
                        </details>
                        <form action={deleteCategory}>
                          <input type="hidden" name="id" value={c.id} />
                          <button type="submit"
                                  className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                                  style={{ background: "var(--rose-50, var(--surface-2))", color: "var(--danger-fg)", border: "1px solid var(--rose-200)" }}>
                            Delete
                          </button>
                        </form>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function CategoryForm({ initial }: { initial?: CategoryRow }) {
  return (
    <form action={saveCategory} className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <Field label="Name">
        <input type="text" name="name" required maxLength={80} defaultValue={initial?.name ?? ""}
               className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
               style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
      </Field>
      <Field label="Slug">
        <input type="text" name="slug" required maxLength={80} pattern="[a-z0-9-]+" defaultValue={initial?.slug ?? ""}
               className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
               style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
      </Field>
      <Field label="Description" full>
        <input type="text" name="description" maxLength={500} defaultValue={initial?.description ?? ""}
               className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
               style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
      </Field>
      <Field label="Icon key">
        <input type="text" name="iconKey" maxLength={40} defaultValue=""
               className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
               style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
      </Field>
      <Field label="Featured order (blank = not featured)">
        <input type="number" name="featuredOrder" min={0} max={99}
               defaultValue={initial?.featuredOrder ?? ""}
               className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
               style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
      </Field>
      <div className="md:col-span-2 flex justify-end">
        <button type="submit"
                className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                style={{ background: "var(--accent-primary)", color: "white" }}>
          Save category
        </button>
      </div>
    </form>
  );
}

/* ── Reviews moderation ──────────────────────── */

const REVIEW_STATUSES_LIST: MarketplaceReviewStatus[] = ["PUBLISHED", "HIDDEN", "FLAGGED", "REMOVED"];

async function ReviewsTab({
  status, canWrite,
}: { status?: MarketplaceReviewStatus | "ALL"; canWrite: boolean }) {
  const rows = await loadReviewModerationQueue({ status });
  return (
    <div className="space-y-3">
      <form className="flex items-center gap-2" method="get">
        <input type="hidden" name="tab" value="reviews" />
        <select name="reviewStatus" defaultValue={typeof status === "string" ? status : "ALL"}
                className="ts-focus rounded-md border px-2 py-1.5 text-[12px]"
                style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
          <option value="ALL">All statuses</option>
          {REVIEW_STATUSES_LIST.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
        </select>
        <button type="submit"
                className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
          Filter
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No reviews match.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => <ReviewCard key={r.id} r={r} canWrite={canWrite} />)}
        </ul>
      )}
    </div>
  );
}

function ReviewCard({ r, canWrite }: { r: ReviewModerationRow; canWrite: boolean }) {
  return (
    <li className="rounded-lg border p-3 space-y-1"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/platform/integrations/marketplace/${r.appSlug}?tab=reviews`}
              className="ts-focus underline font-medium"
              style={{ color: "var(--text-default)" }}>
          {r.appName}
        </Link>
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>by {r.authorName}</span>
        <Stars rating={r.rating} />
        <ReviewStatusPill status={r.status} />
        <span className="ml-auto text-[10px]" style={{ color: "var(--text-muted)" }}>
          {relativeFromNow(r.createdAt)}
        </span>
      </div>
      {r.title && <div className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>{r.title}</div>}
      <p className="text-[12px]" style={{ color: "var(--text-default)" }}>{r.body}</p>
      {r.flaggedReason && (
        <p className="rounded-md border-l-2 px-2 py-1 text-[11px]"
           style={{ borderColor: "var(--rose-200)", background: "var(--rose-50, var(--surface-2))", color: "var(--danger-fg)" }}>
          ⚠ {r.flaggedReason}
        </p>
      )}
      {r.reply && (
        <div className="rounded-md border-l-2 px-2 py-1 text-[11px]"
             style={{ borderColor: "var(--accent-primary)", background: "var(--accent-surface)", color: "var(--text-default)" }}>
          Developer reply: {r.reply}
        </div>
      )}
      {canWrite && (
        <div className="flex flex-wrap gap-1">
          {r.status === "PUBLISHED" && (
            <form action={hideReview}>
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="appSlug" value={r.appSlug} />
              <input type="hidden" name="reason" value="Hidden via moderation queue" />
              <button type="submit"
                      className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                      style={{ background: "var(--warning-surface)", color: "var(--warning-fg)", border: "1px solid var(--amber-200)" }}>
                Hide
              </button>
            </form>
          )}
          {r.status !== "PUBLISHED" && (
            <form action={publishReview}>
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="appSlug" value={r.appSlug} />
              <button type="submit"
                      className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                      style={{ background: "var(--success-surface)", color: "var(--success-fg)", border: "1px solid var(--emerald-200)" }}>
                Publish
              </button>
            </form>
          )}
          <form action={banReviewer}>
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="appSlug" value={r.appSlug} />
            <button type="submit"
                    className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                    style={{ background: "var(--rose-50, var(--surface-2))", color: "var(--danger-fg)", border: "1px solid var(--rose-200)" }}>
              Ban reviewer
            </button>
          </form>
        </div>
      )}
    </li>
  );
}

/* ── Revenue Share tab ─────────────────────── */

async function RevenueShareTab({ canWrite }: { canWrite: boolean }) {
  const data = await loadPayouts();
  // Group payouts by period for the summary.
  const byPeriod = new Map<string, { gross: number; flowtora: number; developer: number; rows: number }>();
  for (const r of data.rows) {
    const cur = byPeriod.get(r.period) ?? { gross: 0, flowtora: 0, developer: 0, rows: 0 };
    cur.gross    += r.grossCents;
    cur.flowtora += r.flowtoraCutCents;
    cur.developer += r.developerCutCents;
    cur.rows++;
    byPeriod.set(r.period, cur);
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Kpi label="Developer cut · owed" value={dollars(data.totalDeveloperOwed)}
             tone={data.totalDeveloperOwed > 100_000 ? "warning" : "default"} />
        <Kpi label="Flowtora cut · all-time" value={dollars(data.totalFlowtoraEarned)} tone="good" />
        <Kpi label="Statements" value={data.rows.length.toLocaleString()} />
      </div>

      <div className="rounded-lg border p-3"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <h3 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>By period</h3>
        {byPeriod.size === 0 ? (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No statements yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {Array.from(byPeriod.entries()).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12).map(([period, agg]) => (
              <li key={period} className="flex items-center justify-between rounded-md border px-2 py-1.5 text-[12px]"
                  style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)" }}>
                <span className="font-mono" style={{ color: "var(--text-default)" }}>{period}</span>
                <span style={{ color: "var(--text-muted)" }}>
                  {agg.rows} apps · gross {dollars(agg.gross)} · platform {dollars(agg.flowtora)} · devs {dollars(agg.developer)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <PayoutTable rows={data.rows} canWrite={canWrite} />
    </div>
  );
}

function PayoutTable({ rows, canWrite }: { rows: PayoutRow[]; canWrite: boolean }) {
  return (
    <div className="rounded-lg border overflow-x-auto"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      {rows.length === 0 ? (
        <p className="p-3 text-[11px]" style={{ color: "var(--text-muted)" }}>No payouts yet.</p>
      ) : (
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ color: "var(--text-muted)" }}>
              <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Period</th>
              <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">App</th>
              <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Developer</th>
              <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Tier</th>
              <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">Installs</th>
              <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">Gross</th>
              <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">Platform cut</th>
              <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">Developer cut</th>
              <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Status</th>
              {canWrite && <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                <td className="px-2 py-1.5 font-mono" style={{ color: "var(--text-default)" }}>{r.period}</td>
                <td className="px-2 py-1.5">
                  <Link href={`/platform/integrations/marketplace/${r.appSlug}?tab=revenue`}
                        className="ts-focus underline" style={{ color: "var(--text-default)" }}>
                    {r.appName}
                  </Link>
                </td>
                <td className="px-2 py-1.5" style={{ color: "var(--text-muted)" }}>{r.developerName}</td>
                <td className="px-2 py-1.5" style={{ color: "var(--text-muted)" }}>{tierLabel(r.revenueShareTier)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: "var(--text-default)" }}>{r.installs}</td>
                <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: "var(--text-default)" }}>{dollars(r.grossCents)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: "var(--accent-primary)" }}>
                  {dollars(r.flowtoraCutCents)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: "var(--success-fg)" }}>
                  {dollars(r.developerCutCents)}
                </td>
                <td className="px-2 py-1.5">
                  {r.paid ? (
                    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ background: "var(--success-surface)", color: "var(--success-fg)" }}>
                      paid {relativeFromNow(r.paidAt)}
                    </span>
                  ) : (
                    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ background: "var(--warning-surface)", color: "var(--warning-fg)" }}>
                      pending
                    </span>
                  )}
                </td>
                {canWrite && (
                  <td className="px-2 py-1.5">
                    <div className="flex justify-end">
                      {!r.paid && (
                        <form action={markPayoutPaid}>
                          <input type="hidden" name="id" value={r.id} />
                          <button type="submit"
                                  className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                                  style={{ background: "var(--success-fg)", color: "white" }}>
                            Mark paid
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ── Settings tab ──────────────────────────── */

const TIERS: MarketplaceRevenueShareTier[] = ["STANDARD", "PREFERRED", "PARTNER"];

function SettingsTab({
  settings, canWrite,
}: {
  settings: Awaited<ReturnType<typeof loadMarketplaceSettings>>;
  canWrite: boolean;
}) {
  return (
    <form action={saveMarketplaceSettings}
          className="rounded-lg border p-4 space-y-3"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <fieldset disabled={!canWrite} className="contents">
        <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
          Submission settings
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
            <input type="checkbox" name="acceptingSubmissions" defaultChecked={settings.acceptingSubmissions} className="ts-focus h-4 w-4" />
            Accepting new submissions
          </label>
          <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
            <input type="checkbox" name="autoChecksEnabled" defaultChecked={settings.autoChecksEnabled} className="ts-focus h-4 w-4" />
            Run automated checks (CSP / sandbox / scope)
          </label>
          <Field label="Default revenue share tier">
            <select name="defaultRevenueShareTier" defaultValue={settings.defaultRevenueShareTier}
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
              {TIERS.map((t) => <option key={t} value={t}>{TIER_LABELS[t]}</option>)}
            </select>
          </Field>
          <Field label="Listing review SLA (hours)">
            <input type="number" name="reviewSlaHours" defaultValue={settings.reviewSlaHours} min={1} max={720}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Security review SLA (hours)">
            <input type="number" name="securityReviewSlaHours" defaultValue={settings.securityReviewSlaHours} min={1} max={720}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Min screenshots required">
            <input type="number" name="minScreenshots" defaultValue={settings.minScreenshots} min={0} max={20}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
            <input type="checkbox" name="requireSoc2" defaultChecked={settings.requireSoc2} className="ts-focus h-4 w-4" />
            Require SOC 2 attestation
          </label>
          <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
            <input type="checkbox" name="requireScreenshots" defaultChecked={settings.requireScreenshots} className="ts-focus h-4 w-4" />
            Require screenshots
          </label>
          <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
            <input type="checkbox" name="requirePrivacyUrl" defaultChecked={settings.requirePrivacyUrl} className="ts-focus h-4 w-4" />
            Require Privacy Policy URL
          </label>
          <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
            <input type="checkbox" name="requireSupportUrl" defaultChecked={settings.requireSupportUrl} className="ts-focus h-4 w-4" />
            Require Support URL
          </label>
        </div>
        <div className="flex items-center justify-between pt-1">
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Last edited {settings.updatedAt.toLocaleString()}
          </p>
          <button type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "white" }}>
            Save settings
          </button>
        </div>
      </fieldset>
    </form>
  );
}
