// Page 26 — Material Library list.

import { requirePlatformStaff } from "@/lib/platform";
import {
  Breadcrumb,
  Card,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import {
  loadMaterialFilterOptions,
  loadMaterialKpis,
  loadMaterialList,
  type MaterialListFilters,
} from "@/server/platform/materials";
import type {
  MasterMaterialCategory,
  MasterMaterialFinish,
  MasterMaterialStatus,
  MasterMaterialUsage,
} from "@prisma/client";
import { Kpi } from "./_components/shared";
import { MaterialFiltersBar } from "./_components/MaterialFiltersBar";
import { MaterialTable } from "./_components/MaterialTable";
import { NewMaterialButton } from "./_components/NewMaterialButton";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const PAGE_SIZE = 50;

const CATEGORIES: MasterMaterialCategory[] = [
  "VINYL", "SUBSTRATES", "INKS", "THREADS", "BLANKS",
  "HARDWARE", "TOOLS", "FINISHING", "ADHESIVES",
];

const FINISHES: MasterMaterialFinish[] = [
  "MATTE", "GLOSS", "SATIN", "TEXTURED", "REFLECTIVE", "FROSTED", "CLEAR",
];

const USAGES: MasterMaterialUsage[] = ["INDOOR", "OUTDOOR", "BOTH"];
const STATUSES: MasterMaterialStatus[] = ["ACTIVE", "DISCONTINUED"];

const OK_LABELS: Record<string, string> = {
  saved: "Saved.",
  created: "Material created.",
  discontinued: "Marked discontinued.",
  reactivated: "Reactivated.",
  supplier_saved: "Supplier saved.",
  supplier_deleted: "Supplier removed.",
  swatch_saved: "Color swatch saved.",
  swatch_deleted: "Color swatch removed.",
};

function parseFilters(sp: SP): MaterialListFilters {
  const f: MaterialListFilters = {};
  if (typeof sp.q === "string" && sp.q.trim()) f.q = sp.q.trim();
  if (typeof sp.category === "string" && (CATEGORIES as string[]).includes(sp.category)) {
    f.category = sp.category as MasterMaterialCategory;
  }
  if (typeof sp.subcategory === "string" && sp.subcategory) f.subcategory = sp.subcategory;
  if (typeof sp.usage === "string" && (USAGES as string[]).includes(sp.usage)) {
    f.usage = sp.usage as MasterMaterialUsage;
  }
  if (typeof sp.finish === "string" && (FINISHES as string[]).includes(sp.finish)) {
    f.finish = sp.finish as MasterMaterialFinish;
  }
  if (typeof sp.durability === "string" && sp.durability) {
    const n = Number(sp.durability);
    if (!Number.isNaN(n)) f.durabilityYears = n;
  }
  if (typeof sp.status === "string" && (STATUSES as string[]).includes(sp.status)) {
    f.status = sp.status as MasterMaterialStatus;
  }
  if (typeof sp.tag === "string" && sp.tag) f.tag = sp.tag;
  return f;
}

export default async function MaterialLibraryPage({
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
    loadMaterialList({ filters, page, pageSize: PAGE_SIZE }),
    loadMaterialKpis(),
    loadMaterialFilterOptions(),
  ]);

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Catalog", href: "/platform/catalog/products" },
          { label: "Material Library" },
        ]} />
        <div className="mt-3">
          <PageHeader
            title="Material Library"
            description="Master list of materials sign + print shops can adopt — physical specs, cost defaults, and supplier links."
            actions={canManage ? <NewMaterialButton /> : null}
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
        <Kpi label="Total materials"   value={String(kpis.total)} />
        <Kpi label="Active"             value={String(kpis.activeCount)} tone="good" />
        <Kpi label="Discontinued"       value={String(kpis.discontinuedCount)}
             tone={kpis.discontinuedCount > 0 ? "warning" : "default"} />
        <Kpi label="Categories"         value={String(kpis.categoriesUsed)} />
        <Kpi label="Outdated supplier prices"
             value={String(kpis.outdatedSupplierPrices)}
             tone={kpis.outdatedSupplierPrices > 0 ? "warning" : "default"}
             sub="Last update >90d ago" />
      </div>

      <Card padding="md">
        <MaterialFiltersBar
          options={options}
          categories={CATEGORIES}
          finishes={FINISHES}
          usages={USAGES}
          statuses={STATUSES}
        />
      </Card>

      {rows.length === 0 ? (
        <Card padding="lg">
          <EmptyState
            title={total === 0 ? "No materials yet" : "No materials match these filters"}
            description={total === 0
              ? "Click \u2018+ New material\u2019 above to mint the first row."
              : "Adjust filters to widen the search."}
          />
        </Card>
      ) : (
        <MaterialTable
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
