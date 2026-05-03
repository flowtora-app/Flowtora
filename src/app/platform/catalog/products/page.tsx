// Page 25 — Master Product Catalog list.
//
// Grid + table view at /platform/catalog/products. URL-driven filters
// (?q=, ?category=, ?status=, ?adoption=, ?industry=, ?tag=, ?view=).
// Real numbers from the new MasterProduct table joined to clone count.

import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  Breadcrumb,
  Card,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import {
  loadCatalogFilterOptions,
  loadCatalogKpis,
  loadCatalogList,
  type CatalogListFilters,
} from "@/server/platform/catalog";
import type { MasterProductCategory, MasterProductStatus } from "@prisma/client";
import { CatalogFiltersBar } from "./_components/CatalogFiltersBar";
import { CatalogGrid } from "./_components/CatalogGrid";
import { CatalogTable } from "./_components/CatalogTable";
import { fmtMoney, Kpi } from "./_components/shared";
import { NewProductButton } from "./_components/NewProductButton";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const PAGE_SIZE = 30;

const CATEGORIES: MasterProductCategory[] = [
  "BANNERS","YARD_SIGNS","VEHICLE_WRAPS","WINDOW_GRAPHICS","WALL_DECALS",
  "TRADE_SHOW_DISPLAYS","A_FRAMES","CHANNEL_LETTERS","ADA_SIGNS",
  "APPAREL_SCREEN_PRINT","APPAREL_DTG","APPAREL_DTF","APPAREL_EMBROIDERY",
  "CAPS","HOODIES","BUSINESS_CARDS","BROCHURES","POSTERS","STICKERS",
  "LABELS","MAGNETS","PROMO_PRODUCTS","TRADE_PRINT","WIDE_FORMAT",
  "ARCHITECTURAL","WAYFINDING","CUSTOM",
];

const STATUSES: MasterProductStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];

function parseFilters(sp: SP): CatalogListFilters {
  const f: CatalogListFilters = {};
  if (typeof sp.q === "string" && sp.q.trim()) f.q = sp.q.trim();
  if (typeof sp.category === "string" && (CATEGORIES as string[]).includes(sp.category)) {
    f.category = sp.category as MasterProductCategory;
  }
  if (typeof sp.status === "string" && (STATUSES as string[]).includes(sp.status)) {
    f.status = sp.status as MasterProductStatus;
  }
  if (typeof sp.industry === "string" && sp.industry) f.industryVertical = sp.industry;
  if (typeof sp.adoption === "string" && (["low","mid","high"]).includes(sp.adoption)) {
    f.adoption = sp.adoption as "low" | "mid" | "high";
  }
  if (typeof sp.tag === "string" && sp.tag) f.tag = sp.tag;
  return f;
}

export default async function CatalogProductsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canManage = ctx.can("plans.manage");

  const filters = parseFilters(sp);
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : "1") || 1);
  const view = typeof sp.view === "string" && sp.view === "table" ? "table" : "grid";
  const okMsg = typeof sp.ok === "string" ? OK_LABELS[sp.ok] ?? "Done." : null;
  const errMsg = typeof sp.error === "string" ? decodeURIComponent(sp.error) : null;

  const [{ rows, total, filteredTotal }, kpis, options] = await Promise.all([
    loadCatalogList({ filters, page, pageSize: PAGE_SIZE }),
    loadCatalogKpis(),
    loadCatalogFilterOptions(),
  ]);

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Catalog", href: "/platform/catalog/products" },
          { label: "Master Product Catalog" },
        ]} />
        <div className="mt-3">
          <PageHeader
            title="Master Product Catalog"
            description="Curated library of sign + print product templates that tenants can clone into their own catalogs as starting points."
            actions={canManage ? <NewProductButton /> : null}
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
        <Kpi label="Total products"     value={String(kpis.totalProducts)} />
        <Kpi label="Published"          value={String(kpis.publishedCount)} tone={kpis.publishedCount > 0 ? "good" : "default"} />
        <Kpi label="Drafts"             value={String(kpis.draftCount)} tone={kpis.draftCount > 0 ? "warning" : "default"} />
        <Kpi label="Categories"         value={String(kpis.categories)} />
        <Kpi label="Avg adoption"
             value={kpis.avgAdoption == null ? "—" : `${kpis.avgAdoption}`}
             sub="Cloned tenant products per master" />
      </div>

      <Card padding="md">
        <CatalogFiltersBar
          options={options}
          categories={CATEGORIES}
          statuses={STATUSES}
        />
      </Card>

      <ViewSwitcher view={view} sp={sp} />

      {rows.length === 0 ? (
        <Card padding="lg">
          <EmptyState
            title={total === 0 ? "No master products yet" : "No products match these filters"}
            description={total === 0
              ? "Click \u2018+ New product\u2019 above to mint your first template."
              : "Adjust filters above to widen the search."}
          />
        </Card>
      ) : view === "grid" ? (
        <CatalogGrid rows={rows} />
      ) : (
        <CatalogTable rows={rows} total={total} filteredTotal={filteredTotal}
                      page={page} pageSize={PAGE_SIZE} />
      )}

      {/* Reference fmtMoney so the tree-shaker keeps it for child components. */}
      <span className="hidden" aria-hidden>{fmtMoney(0)}</span>
    </div>
  );
}

const OK_LABELS: Record<string, string> = {
  saved: "Saved.",
  created: "Product created.",
  duplicated: "Duplicated.",
  published: "Published.",
  archived: "Archived.",
  pushed: "Pushed update to all cloned tenants.",
  attribute_saved: "Attribute saved.",
  attribute_deleted: "Attribute deleted.",
  material_saved: "Material saved.",
  material_deleted: "Material deleted.",
  image_saved: "Image saved.",
  image_deleted: "Image deleted.",
};

function ViewSwitcher({ view, sp }: { view: "grid" | "table"; sp: SP }) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "view" || k === "page") continue;
    if (typeof v === "string") u.set(k, v);
  }
  const grid = u.toString();
  u.set("view", "table");
  const table = u.toString();

  return (
    <div className="flex items-center justify-end gap-2">
      <Link
        href={grid ? `?${grid}` : "?"}
        className="ts-focus rounded-md border px-3 py-1.5 text-[12px] font-medium"
        style={{
          borderColor: view === "grid" ? "var(--accent-primary)" : "var(--border-subtle)",
          color: view === "grid" ? "var(--accent-primary)" : "var(--text-default)",
          background: "var(--surface-1)",
        }}
      >
        Grid
      </Link>
      <Link
        href={`?${table}`}
        className="ts-focus rounded-md border px-3 py-1.5 text-[12px] font-medium"
        style={{
          borderColor: view === "table" ? "var(--accent-primary)" : "var(--border-subtle)",
          color: view === "table" ? "var(--accent-primary)" : "var(--text-default)",
          background: "var(--surface-1)",
        }}
      >
        Table
      </Link>
    </div>
  );
}
