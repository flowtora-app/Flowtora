// Page 28 — Pricing Formulas Library list.

import { requirePlatformStaff } from "@/lib/platform";
import {
  Breadcrumb,
  Card,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import {
  loadPricingFormulaFilterOptions,
  loadPricingFormulaKpis,
  loadPricingFormulaList,
  type PricingFormulaListFilters,
} from "@/server/platform/pricing-formulas";
import type {
  PricingFormulaCategory,
  PricingFormulaStatus,
} from "@prisma/client";
import { Kpi } from "./_components/shared";
import { PricingFiltersBar } from "./_components/PricingFiltersBar";
import { PricingTable } from "./_components/PricingTable";
import { NewFormulaButton } from "./_components/NewFormulaButton";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const PAGE_SIZE = 50;

const CATEGORIES: PricingFormulaCategory[] = [
  "SQ_FT", "PER_PIECE", "TIERED_QTY", "SETUP_RUN",
  "INSTALL_HOURLY", "BUNDLE", "CUSTOM",
];

const STATUSES: PricingFormulaStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];

const OK_LABELS: Record<string, string> = {
  saved: "Saved.",
  created: "Formula created.",
  duplicated: "Duplicated.",
  published: "Published.",
  archived: "Archived.",
};

function parseFilters(sp: SP): PricingFormulaListFilters {
  const f: PricingFormulaListFilters = {};
  if (typeof sp.q === "string" && sp.q.trim()) f.q = sp.q.trim();
  if (typeof sp.category === "string" && (CATEGORIES as string[]).includes(sp.category)) {
    f.category = sp.category as PricingFormulaCategory;
  }
  if (typeof sp.status === "string" && (STATUSES as string[]).includes(sp.status)) {
    f.status = sp.status as PricingFormulaStatus;
  }
  if (typeof sp.tag === "string" && sp.tag) f.tag = sp.tag;
  return f;
}

export default async function PricingFormulasPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canManage = ctx.can("plans.manage");

  const filters = parseFilters(sp);
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : "1") || 1);
  const okMsg = typeof sp.ok === "string" ? OK_LABELS[sp.ok] ?? "Done." : null;
  const errMsg = typeof sp.error === "string" ? decodeURIComponent(sp.error) : null;

  const [{ rows, total, filteredTotal }, kpis, options] = await Promise.all([
    loadPricingFormulaList({ filters, page, pageSize: PAGE_SIZE }),
    loadPricingFormulaKpis(),
    loadPricingFormulaFilterOptions(),
  ]);

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Catalog", href: "/platform/catalog/products" },
          { label: "Pricing Formulas" },
        ]} />
        <div className="mt-3">
          <PageHeader
            title="Pricing Formulas"
            description="Pre-built and custom pricing formula templates that tenants use or extend. Live tester pane validates the math against sample inputs."
            actions={canManage ? <NewFormulaButton /> : null}
          />
        </div>
      </div>

      {okMsg && (
        <div className="rounded-md border px-3 py-2 text-[12px]"
             style={{ background: "var(--success-surface)", color: "var(--success-fg)", borderColor: "var(--success-fg)" }}>
          {okMsg}
        </div>
      )}
      {errMsg && (
        <div className="rounded-md border px-3 py-2 text-[12px]"
             style={{ background: "var(--danger-surface)", color: "var(--danger-fg)", borderColor: "var(--danger-fg)" }}>
          {errMsg}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Kpi label="Total formulas" value={String(kpis.total)} />
        <Kpi label="Published"       value={String(kpis.publishedCount)} tone="good" />
        <Kpi label="Drafts"          value={String(kpis.draftCount)}
             tone={kpis.draftCount > 0 ? "warning" : "default"} />
        <Kpi label="Archived"        value={String(kpis.archivedCount)} />
        <Kpi label="Categories"      value={String(kpis.categoriesUsed)} />
        <Kpi label="Total versions"  value={String(kpis.totalVersions)} />
      </div>

      <Card padding="md">
        <PricingFiltersBar
          options={options}
          categories={CATEGORIES}
          statuses={STATUSES}
        />
      </Card>

      {rows.length === 0 ? (
        <Card padding="lg">
          <EmptyState
            title={total === 0 ? "No pricing formulas yet" : "No formulas match these filters"}
            description={total === 0
              ? "Click \u2018+ New formula\u2019 above to mint the first template."
              : "Adjust filters to widen the search."}
          />
        </Card>
      ) : (
        <PricingTable
          rows={rows}
          total={total}
          filteredTotal={filteredTotal}
          page={page}
          pageSize={PAGE_SIZE}
        />
      )}
    </div>
  );
}
