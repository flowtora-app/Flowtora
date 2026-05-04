// Page 34 — Knowledge Base / Help Center editor (list view).
//
// Three-column layout: categories rail, article list (filterable),
// and KPIs above. The article editor lives at [id]/page.tsx.

import { requirePlatformStaff } from "@/lib/platform";
import {
  loadCategoryTree,
  loadKbArticleList,
  loadKbFilterOptions,
  loadKbKpis,
  type CategoryTreeNode,
  type KbArticleListFilters,
} from "@/server/platform/knowledge-base";
import type { KbArticleStatus, KbVisibility } from "@prisma/client";
import { Kpi, FormError, FormOk } from "./_components/shared";
import { DraggableCategoriesRail } from "./_components/DraggableCategoriesRail";
import { ArticleListPane } from "./_components/ArticleListPane";
import Link from "next/link";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

const STATUSES: KbArticleStatus[] = ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"];
const VISIBILITIES: KbVisibility[] = ["PUBLIC", "INTERNAL", "PLAN_RESTRICTED"];

type SP = Record<string, string | string[] | undefined>;

function asString(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export default async function KbListPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;

  const q          = asString(sp.q);
  const status     = asString(sp.status);
  const visibility = asString(sp.visibility);
  const author     = asString(sp.author);
  const locale     = asString(sp.locale);
  const category   = asString(sp.category) ?? null;
  const page       = Math.max(1, parseInt(asString(sp.page) ?? "1", 10) || 1);
  const error      = asString(sp.error);
  const ok         = asString(sp.ok);

  const filters: KbArticleListFilters = {};
  if (q) filters.q = q;
  if (status && (STATUSES as string[]).includes(status))           filters.status     = status as KbArticleStatus;
  if (visibility && (VISIBILITIES as string[]).includes(visibility)) filters.visibility = visibility as KbVisibility;
  if (author) filters.authorId = author;
  if (locale) filters.locale = locale;
  if (category) filters.categoryId = category; // "_uncategorized_" is a sentinel handled by the loader

  const [kpis, tree, filterOpts, list] = await Promise.all([
    loadKbKpis(),
    loadCategoryTree(),
    loadKbFilterOptions(),
    loadKbArticleList({ filters, page, pageSize: PAGE_SIZE }),
  ]);

  const totalPages = Math.max(1, Math.ceil(list.filteredTotal / PAGE_SIZE));

  const buildHref = (overrides: Record<string, string | undefined>): string => {
    const u = new URLSearchParams();
    if (q)          u.set("q", q);
    if (status)     u.set("status", status);
    if (visibility) u.set("visibility", visibility);
    if (author)     u.set("author", author);
    if (locale)     u.set("locale", locale);
    if (category)   u.set("category", category);
    if (page > 1)   u.set("page", String(page));
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined || v === "") u.delete(k);
      else u.set(k, v);
    }
    const qs = u.toString();
    return qs ? `/platform/operations/knowledge-base?${qs}` : "/platform/operations/knowledge-base";
  };

  const hasFiltersApplied = !!(q || status || visibility || author || locale);
  const categoriesFlat = flattenForSelect(tree);
  const canWrite = ctx.can("support.macro_manage");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
            Operations
          </div>
          <h1
            className="mt-1 text-[22px] font-semibold leading-tight"
            style={{ color: "var(--text-default)" }}
          >
            Knowledge base
          </h1>
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
            Author the public help center.{" "}
            <b style={{ color: "var(--text-default)" }}>{kpis.published.toLocaleString()}</b> live ·{" "}
            <b style={{ color: "var(--text-default)" }}>{kpis.draft.toLocaleString()}</b> in draft ·{" "}
            <b style={{ color: "var(--text-default)" }}>{kpis.review.toLocaleString()}</b> in review.
          </p>
        </div>
      </div>

      <FormOk msg={ok} />
      <FormError msg={error} />

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Kpi
          label="Articles"
          value={kpis.totalArticles.toLocaleString()}
          sub={`${kpis.archived.toLocaleString()} archived`}
        />
        <Kpi
          label="Published"
          value={kpis.published.toLocaleString()}
          tone={kpis.published > 0 ? "good" : "default"}
        />
        <Kpi
          label="Total views"
          value={kpis.views30d.toLocaleString()}
          sub="Lifetime"
        />
        <Kpi
          label="Helpful · 30d"
          value={kpis.helpfulnessPct == null
            ? "—"
            : `${Math.round(kpis.helpfulnessPct * 100)}%`}
          sub={kpis.helpfulnessSampleSize === 0
            ? "No votes yet"
            : `${kpis.helpfulnessSampleSize.toLocaleString()} votes`}
          tone={
            kpis.helpfulnessPct == null  ? "default" :
            kpis.helpfulnessPct >= 0.8   ? "good"    :
            kpis.helpfulnessPct >= 0.5   ? "warning" :
                                           "danger"
          }
        />
        <Kpi
          label="Zero-result rate · 30d"
          value={kpis.zeroResultRatePct == null
            ? "—"
            : `${Math.round(kpis.zeroResultRatePct * 100)}%`}
          sub={kpis.zeroResultSampleSize === 0
            ? "No searches"
            : `${kpis.zeroResultSampleSize.toLocaleString()} searches`}
          tone={
            kpis.zeroResultRatePct == null ? "default" :
            kpis.zeroResultRatePct <= 0.1  ? "good"    :
            kpis.zeroResultRatePct <= 0.3  ? "warning" :
                                             "danger"
          }
        />
      </div>

      <div className="flex items-center justify-end">
        <Link
          href="/platform/operations/knowledge-base/search-analytics"
          className="ts-focus rounded-md px-3 py-1.5 text-[11px] font-medium"
          style={{
            background: "var(--surface-1)",
            color: "var(--text-default)",
            border: "1px solid var(--border-default)",
          }}
        >
          📈 Search analytics
        </Link>
      </div>

      {/* 3-column layout (categories | list) */}
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <DraggableCategoriesRail
          initial={tree}
          activeCategoryId={category}
          buildHref={buildHref}
          canWrite={canWrite}
        />
        <ArticleListPane
          rows={list.rows}
          page={page}
          totalPages={totalPages}
          filteredTotal={list.filteredTotal}
          filters={{
            q, status: status as KbArticleStatus | undefined,
            visibility: visibility as KbVisibility | undefined,
            authorId: author, locale,
          }}
          options={filterOpts}
          categoriesFlat={categoriesFlat}
          buildHref={buildHref}
          resetHref={category
            ? `/platform/operations/knowledge-base?category=${category}`
            : "/platform/operations/knowledge-base"}
          hasFiltersApplied={hasFiltersApplied}
          canWrite={canWrite}
        />
      </div>
    </div>
  );
}

function flattenForSelect(tree: CategoryTreeNode[]): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const walk = (nodes: CategoryTreeNode[], prefix: string) => {
    for (const n of nodes) {
      out.push({ id: n.id, label: `${prefix}${n.name}` });
      walk(n.children, prefix + "— ");
    }
  };
  walk(tree, "");
  return out;
}
