import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Button } from "@/components/Field";
import { Card } from "@/components/Card";
import { stageColor, stageLabel, PIPELINE_STAGES } from "@/lib/crm";
import { formatMoney } from "@/lib/format";
import { memberLookup } from "@/lib/members";
import { applyBranchScope, listActiveLocations } from "@/lib/locations";
import { EmptyState } from "@/components/ui/EmptyState";
import { loadHealthBundle } from "@/lib/opportunity-health-loader";
import { computeOpportunityHealth, type HealthTier } from "@/lib/opportunity-health";
import { loadTenantTags } from "@/lib/customer-tags";
import { CustomersTable, type CustomersTableRow } from "@/components/crm/CustomersTable";
import { PipelineBoard, type PipelineCard } from "@/components/customers/PipelineBoard";
import { SavedViewPicker } from "@/components/ui/SavedViewPicker";
import { listSavedViews } from "@/app/actions/saved-views";
import type { Prisma } from "@prisma/client";

// Phase 3 (transformation) — the customers list now supports two views:
//   • `view=table`    (default) — the DataTable surface used since v1
//   • `view=pipeline`         — a drag-drop kanban grouped by stage
//
// The board is intentionally light on filters: stage filtering is
// meaningless (cards are already grouped by stage), so the board hides
// that form control. Everything else (search, status, health, branch,
// tag) still applies.

type CustomersView = "table" | "pipeline";

function parseView(raw: string | undefined): CustomersView {
  return raw === "pipeline" ? "pipeline" : "table";
}

export default async function CustomersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; stage?: string; status?: string; branch?: string; health?: string; tag?: string; view?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const view = parseView(sp.view);
  const ctx = await requirePermission(slug, "customers:view");
  const { tenant } = ctx;

  let where: Prisma.CustomerWhereInput = { tenantId: tenant.id };
  if (sp.stage) where.stage = sp.stage as never;
  if (sp.status) where.status = sp.status as never;
  if (sp.q) {
    where.OR = [
      { name: { contains: sp.q, mode: "insensitive" } },
      { email: { contains: sp.q, mode: "insensitive" } },
      { phone: { contains: sp.q } },
    ];
  }
  // Phase 15 — first apply the member's permanent branch scope, then layer
  // the optional ?branch=... narrowing filter on top (only if the chosen
  // branch is inside what the member is already allowed to see).
  where = applyBranchScope(where, ctx.branchScope);
  const branches = await listActiveLocations(tenant.id);
  const branchChoices =
    ctx.branchScope === null ? branches : branches.filter((b) => ctx.branchScope!.includes(b.id));
  if (sp.branch && branchChoices.some((b) => b.id === sp.branch)) {
    where.locationId = sp.branch;
  }

  // Phase 7 — tag filter. We store tags lowercased; the query uses
  // `has` against the normalised value so links from the chip row
  // below always hit. Empty tag filter is ignored.
  const tagFilter = (sp.tag ?? "").trim().toLowerCase();
  if (tagFilter) {
    where.tags = { has: tagFilter };
  }

  const [customersRaw, members, tagCatalogue, savedViews] = await Promise.all([
    db.customer.findMany({ where, orderBy: { updatedAt: "desc" }, take: 200 }),
    memberLookup(tenant.id),
    loadTenantTags(tenant.id),
    listSavedViews(slug, "customers"),
  ]);
  // Top 6 most-used tags shown as quick filter chips.
  const topTags = tagCatalogue.slice(0, 6);

  // Phase 7 — attach opportunity health to each row so the list can
  // show a badge and filter by tier/at-risk without extra round trips.
  const healthBundle = await loadHealthBundle(tenant.id, customersRaw);
  const healthReports = new Map<string, ReturnType<typeof computeOpportunityHealth>>();
  for (const c of customersRaw) {
    const input = healthBundle.get(c.id);
    if (input) healthReports.set(c.id, computeOpportunityHealth(input));
  }

  // Health is a computed field — not indexable — so filtering runs in
  // memory after the DB query. Acceptable at the page cap of 200 rows.
  const HEALTH_FILTERS: Record<string, (tier: HealthTier, atRisk: boolean) => boolean> = {
    "at-risk": (_t, atRisk) => atRisk,
    hot:       (t) => t === "hot",
    warm:      (t) => t === "warm",
    cool:      (t) => t === "cool",
    stale:     (t) => t === "stale",
  };
  const healthFilter = sp.health && HEALTH_FILTERS[sp.health];
  const customers = healthFilter
    ? customersRaw.filter((c) => {
        const r = healthReports.get(c.id);
        if (!r) return false;
        return healthFilter(r.tier, r.atRisk);
      })
    : customersRaw;

  // Phase 4 Slice E — distinguish "empty because filtered" from "empty
  // because brand new". A filter-empty result needs a Clear button; a
  // truly-empty account needs teaching copy + a nudge toward sample data.
  const hasFilters = !!(sp.q || sp.stage || sp.status || sp.branch || sp.health || sp.tag);
  const isFirstRun = customers.length === 0 && !hasFilters;
  const canManage = ctx.can("customers:create");
  const atRiskCount = Array.from(healthReports.values()).filter((r) => r.atRisk).length;

  const fieldStyle = {
    background: "var(--surface-2)",
    border: "1px solid var(--border-subtle)",
    color: "var(--text-default)",
    fontSize: 12.5,
    fontWeight: 500,
    padding: "6px 10px",
    height: 34,
    borderRadius: 8,
  } as const;

  return (
    <div>
      {/* Page header — same premium card pattern as Dashboard + Quotes. */}
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{
          padding: "18px 22px",
          background:
            "radial-gradient(880px circle at -10% -50%, var(--accent-surface), transparent 55%), " +
            "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
          border: "1px solid var(--border-subtle)",
          boxShadow:
            "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
            "0 1px 2px 0 rgba(0,0,0,0.18)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1
                className="font-semibold"
                style={{
                  color: "var(--text-default)",
                  fontSize: 24,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.15,
                }}
              >
                Customers
              </h1>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  color: "var(--accent-primary)",
                  background: "var(--accent-surface)",
                  border:
                    "1px solid color-mix(in oklab, var(--accent-primary) 22%, transparent)",
                  padding: "3px 8px",
                  borderRadius: 999,
                  fontFeatureSettings: "'tnum' 1",
                  lineHeight: 1,
                }}
              >
                {customers.length}
              </span>
              {atRiskCount > 0 && !sp.health && (
                <Link
                  href={`/t/${slug}/customers?health=at-risk`}
                  className="ts-focus inline-flex items-center gap-1.5"
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    color: "var(--danger-fg, var(--rose-500))",
                    background:
                      "color-mix(in oklab, var(--rose-500) 14%, transparent)",
                    border:
                      "1px solid color-mix(in oklab, var(--rose-500) 30%, transparent)",
                    padding: "3px 8px",
                    borderRadius: 999,
                    lineHeight: 1,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 999,
                      background: "var(--danger-fg, var(--rose-500))",
                      boxShadow:
                        "0 0 0 2px color-mix(in oklab, var(--rose-500) 25%, transparent)",
                    }}
                  />
                  {atRiskCount} at risk →
                </Link>
              )}
            </div>
            <p
              className="mt-1.5"
              style={{
                color: "var(--text-muted)",
                fontSize: 12.5,
                lineHeight: 1.45,
              }}
            >
              {customers.length === 1 ? "1 record" : `${customers.length} records`} in scope · the heart of every quote, order, and invoice.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle — table vs. pipeline kanban. */}
            <ViewToggle slug={slug} sp={sp} view={view} />
            <SavedViewPicker
              slug={slug}
              entityKind="customers"
              views={savedViews}
              canShare={ctx.role === "OWNER" || ctx.role === "ADMIN"}
            />
            {canManage && (
              <Link
                href={`/t/${slug}/customers/new`}
                className="ts-focus inline-flex items-center gap-1.5 rounded-lg font-semibold transition-transform"
                style={{
                  height: 32,
                  padding: "0 14px",
                  background:
                    "linear-gradient(180deg, color-mix(in oklab, var(--accent-primary) 96%, white 4%) 0%, var(--accent-primary) 100%)",
                  color: "var(--accent-fg)",
                  border:
                    "1px solid color-mix(in oklab, var(--accent-primary) 80%, black 20%)",
                  boxShadow:
                    "0 1px 0 0 rgba(255,255,255,0.15) inset, " +
                    "0 1px 2px 0 rgba(0,0,0,0.35)",
                  fontSize: 12.5,
                  letterSpacing: "-0.005em",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                New customer
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Filter form — premium pill input + refined selects. */}
      <form className="mt-5 flex flex-wrap items-center gap-2" method="get">
        {sp.tag && <input type="hidden" name="tag" value={sp.tag} />}
        <div
          className="flex flex-1 min-w-[260px]"
          style={{
            position: "relative",
            alignItems: "center",
            gap: 8,
            height: 34,
            padding: "0 10px",
            borderRadius: 8,
            background: "color-mix(in oklab, var(--surface-2) 75%, transparent)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--text-faint)", flexShrink: 0 }}>
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Search name, email, phone…"
            style={{
              flex: 1,
              minWidth: 0,
              background: "transparent",
              border: 0,
              outline: "none",
              color: "var(--text-default)",
              fontSize: 12.5,
              fontWeight: 500,
              letterSpacing: "-0.005em",
            }}
          />
        </div>
        <select name="stage" defaultValue={sp.stage ?? ""} className="ts-focus outline-none" style={fieldStyle}>
          <option value="">All stages</option>
          {PIPELINE_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select name="status" defaultValue={sp.status ?? ""} className="ts-focus outline-none" style={fieldStyle}>
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <select name="health" defaultValue={sp.health ?? ""} className="ts-focus outline-none" style={fieldStyle}>
          <option value="">All health</option>
          <option value="at-risk">At risk</option>
          <option value="hot">Hot</option>
          <option value="warm">Warm</option>
          <option value="cool">Cool</option>
          <option value="stale">Stale</option>
        </select>
        {branchChoices.length > 1 && (
          <select name="branch" defaultValue={sp.branch ?? ""} className="ts-focus outline-none" style={fieldStyle}>
            <option value="">All branches</option>
            {branchChoices.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        <button
          type="submit"
          className="ts-focus inline-flex items-center gap-1.5 rounded-lg transition-colors hover:bg-[var(--surface-3)]"
          style={{
            height: 34,
            padding: "0 14px",
            background: "var(--surface-2)",
            color: "var(--text-default)",
            border: "1px solid var(--border-subtle)",
            fontSize: 12.5,
            fontWeight: 600,
            letterSpacing: "-0.005em",
          }}
        >
          Filter
        </button>
      </form>

      {/* Tag quick-filter chips — premium tinted pills. */}
      {(topTags.length > 0 || sp.tag) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span
            style={{
              color: "var(--text-faint)",
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Tags
          </span>
          {sp.tag ? (
            <span
              className="inline-flex items-center gap-1.5"
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                color: "var(--accent-fg)",
                background:
                  "linear-gradient(180deg, color-mix(in oklab, var(--accent-primary) 96%, white 4%) 0%, var(--accent-primary) 100%)",
                border:
                  "1px solid color-mix(in oklab, var(--accent-primary) 80%, black 20%)",
                padding: "3px 10px 3px 10px",
                borderRadius: 999,
                lineHeight: 1.2,
              }}
            >
              {sp.tag}
              <Link
                href={buildListHref(slug, sp, { tag: undefined })}
                aria-label="Clear tag filter"
                className="-mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full"
                style={{ color: "var(--accent-fg)", opacity: 0.9 }}
              >
                ×
              </Link>
            </span>
          ) : (
            topTags.map((t) => (
              <Link
                key={t.tag}
                href={buildListHref(slug, sp, { tag: t.tag })}
                className="ts-focus inline-flex items-center gap-1.5 transition-colors hover:bg-[var(--accent-surface-strong)]"
                style={{
                  fontSize: 11.5,
                  fontWeight: 500,
                  color: "var(--accent-primary)",
                  background: "var(--accent-surface)",
                  border:
                    "1px solid color-mix(in oklab, var(--accent-primary) 22%, transparent)",
                  padding: "3px 10px",
                  borderRadius: 999,
                  lineHeight: 1.2,
                }}
              >
                {t.tag}
                <span
                  style={{
                    color: "var(--accent-primary)",
                    opacity: 0.7,
                    fontFeatureSettings: "'tnum' 1",
                    fontSize: 10.5,
                  }}
                >
                  {t.count}
                </span>
              </Link>
            ))
          )}
        </div>
      )}

      {isFirstRun ? (
        <Card className="mt-4">
          <EmptyState
            icon={<span aria-hidden>👥</span>}
            title="Your customer book is empty"
            description={
              <>
                Customers are the center of Flowtora — every quote, order, and
                invoice hangs off one. Add a walk-in, a lead from your CRM, or
                a referral and watch the pipeline start to fill out.
              </>
            }
            action={
              canManage && (
                <Link
                  href={`/t/${slug}/customers/new`}
                  className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-semibold transition-colors hover:brightness-110"
                  style={{
                    background: "var(--accent-primary)",
                    color: "var(--accent-fg)",
                  }}
                >
                  Add your first customer
                </Link>
              )
            }
            secondary={
              canManage && !tenant.sampleDataLoadedAt ? (
                <Link
                  href={`/t/${slug}/settings/sample-data`}
                  className="text-xs underline"
                  style={{ color: "var(--text-muted)" }}
                >
                  Or load a demo shop to explore
                </Link>
              ) : undefined
            }
          />
        </Card>
      ) : view === "pipeline" ? (
        <div className="mt-4">
          <PipelineBoard
            slug={slug}
            stages={PIPELINE_STAGES.map((s) => ({ value: s.value, label: s.label, color: s.color }))}
            cards={customers.map<PipelineCard>((c) => {
              const report = healthReports.get(c.id);
              return {
                id: c.id,
                name: c.name,
                stage: c.stage,
                value: formatMoney(c.estimatedValue?.toString() ?? null, tenant.currency),
                ownerName: c.ownerId ? members.get(c.ownerId)?.name ?? null : null,
                tags: c.tags,
                health: report
                  ? {
                      tier: report.tier as HealthTier,
                      score: report.score,
                      atRisk: report.atRisk,
                    }
                  : null,
              };
            })}
          />
        </div>
      ) : (
        <div className="mt-4">
          <CustomersTable
            slug={slug}
            canEdit={canManage}
            rows={customers.map<CustomersTableRow>((c) => {
              const report = healthReports.get(c.id);
              return {
                id: c.id,
                name: c.name,
                kind: c.kind,
                status: c.status,
                stage: c.stage,
                stageLabel: stageLabel(c.stage),
                stageColor: stageColor(c.stage),
                ownerId: c.ownerId,
                ownerName: c.ownerId ? members.get(c.ownerId)?.name ?? null : null,
                value: formatMoney(c.estimatedValue?.toString() ?? null, tenant.currency),
                email: c.email ?? null,
                phone: c.phone ?? null,
                tags: c.tags,
                health: report
                  ? {
                      tier: report.tier as HealthTier,
                      score: report.score,
                      atRisk: report.atRisk,
                    }
                  : null,
              };
            })}
            empty={
              <div
                className="m-3 rounded-lg p-5 text-center"
                style={{
                  background:
                    "color-mix(in oklab, var(--surface-2) 40%, transparent)",
                  border: "1px dashed var(--border-subtle)",
                  color: "var(--text-muted)",
                  fontSize: 12.5,
                }}
              >
                No customers match these filters.{" "}
                <Link
                  href={`/t/${slug}/customers`}
                  className="underline"
                  style={{ color: "var(--accent-primary)" }}
                >
                  Clear filters
                </Link>
              </div>
            }
          />
        </div>
      )}
    </div>
  );
}

// Build a list-page href that preserves the active filter state but
// swaps/clears specific params. Used by the tag chip row.
function buildListHref(
  slug: string,
  sp: { q?: string; stage?: string; status?: string; branch?: string; health?: string; tag?: string; view?: string },
  overrides: Partial<{ q: string; stage: string; status: string; branch: string; health: string; tag: string | undefined; view: string | undefined }>,
): string {
  const merged: Record<string, string | undefined> = { ...sp, ...overrides };
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === null || value === "") continue;
    qs.set(key, String(value));
  }
  const query = qs.toString();
  return `/t/${slug}/customers${query ? `?${query}` : ""}`;
}

// View toggle — two pills in a shared pill-group, each preserving
// filters via buildListHref. The default (table) clears the `view`
// param so the URL stays short; pipeline explicitly writes it.
function ViewToggle({
  slug,
  sp,
  view,
}: {
  slug: string;
  sp: { q?: string; stage?: string; status?: string; branch?: string; health?: string; tag?: string; view?: string };
  view: CustomersView;
}) {
  const tableHref    = buildListHref(slug, sp, { view: undefined });
  const pipelineHref = buildListHref(slug, sp, { view: "pipeline" });
  const pillStyle = (active: boolean) => ({
    display: "inline-flex" as const,
    alignItems: "center" as const,
    gap: 6,
    height: 28,
    padding: "0 10px",
    borderRadius: 6,
    fontSize: 11.5,
    fontWeight: active ? 700 : 500,
    letterSpacing: "-0.005em",
    color: active ? "var(--text-default)" : "var(--text-muted)",
    background: active ? "var(--surface-1)" : "transparent",
    boxShadow: active
      ? "0 1px 2px 0 rgba(0,0,0,0.25), inset 0 0 0 1px var(--border-subtle)"
      : "none",
    transition: "background-color 120ms ease, color 120ms ease",
  });
  return (
    <div
      className="inline-flex items-center p-0.5"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 8,
      }}
      role="tablist"
      aria-label="Customers view"
    >
      <Link
        href={tableHref}
        role="tab"
        aria-selected={view === "table"}
        className="ts-focus"
        style={pillStyle(view === "table")}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M9 3v18" />
        </svg>
        Table
      </Link>
      <Link
        href={pipelineHref}
        role="tab"
        aria-selected={view === "pipeline"}
        className="ts-focus"
        style={pillStyle(view === "pipeline")}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="6" height="18" rx="1" />
          <rect x="11" y="3" width="6" height="12" rx="1" />
          <rect x="19" y="3" width="2" height="9" rx="1" />
        </svg>
        Pipeline
      </Link>
    </div>
  );
}
