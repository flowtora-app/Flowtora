// Page 27 — Equipment Templates list.

import { requirePlatformStaff } from "@/lib/platform";
import {
  Breadcrumb,
  Card,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import {
  loadEquipmentFilterOptions,
  loadEquipmentKpis,
  loadEquipmentList,
  type EquipmentListFilters,
} from "@/server/platform/equipment";
import type {
  MasterEquipmentCategory,
  MasterEquipmentStatus,
} from "@prisma/client";
import { Kpi } from "./_components/shared";
import { EquipmentFiltersBar } from "./_components/EquipmentFiltersBar";
import { EquipmentTable } from "./_components/EquipmentTable";
import { NewEquipmentButton } from "./_components/NewEquipmentButton";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const PAGE_SIZE = 50;

const CATEGORIES: MasterEquipmentCategory[] = [
  "PRINTER", "CUTTER", "PRESS", "EMBROIDERY", "CNC",
  "LASER", "HEAT_PRESS", "LAMINATION", "WORKSTATION", "FINISHING",
];

const STATUSES: MasterEquipmentStatus[] = ["ACTIVE", "DISCONTINUED"];

const OK_LABELS: Record<string, string> = {
  saved: "Saved.",
  created: "Equipment created.",
  discontinued: "Marked discontinued.",
  reactivated: "Reactivated.",
  compat_added: "Material compatibility added.",
  compat_removed: "Material compatibility removed.",
  task_saved: "Maintenance task saved.",
  task_deleted: "Maintenance task removed.",
};

function parseFilters(sp: SP): EquipmentListFilters {
  const f: EquipmentListFilters = {};
  if (typeof sp.q === "string" && sp.q.trim()) f.q = sp.q.trim();
  if (typeof sp.category === "string" && (CATEGORIES as string[]).includes(sp.category)) {
    f.category = sp.category as MasterEquipmentCategory;
  }
  if (typeof sp.brand === "string" && sp.brand) f.brand = sp.brand;
  if (typeof sp.status === "string" && (STATUSES as string[]).includes(sp.status)) {
    f.status = sp.status as MasterEquipmentStatus;
  }
  return f;
}

export default async function EquipmentListPage({
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
    loadEquipmentList({ filters, page, pageSize: PAGE_SIZE }),
    loadEquipmentKpis(),
    loadEquipmentFilterOptions(),
  ]);

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Catalog", href: "/platform/catalog/products" },
          { label: "Equipment Templates" },
        ]} />
        <div className="mt-3">
          <PageHeader
            title="Equipment Templates"
            description="Pre-built equipment templates with productivity defaults — Roland, HP, Mimaki, Graphtec, and more. Tenants clone these into their workspaces."
            actions={canManage ? <NewEquipmentButton /> : null}
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
        <Kpi label="Total templates"   value={String(kpis.total)} />
        <Kpi label="Active"             value={String(kpis.activeCount)} tone="good" />
        <Kpi label="Discontinued"       value={String(kpis.discontinuedCount)}
             tone={kpis.discontinuedCount > 0 ? "warning" : "default"} />
        <Kpi label="Categories"         value={String(kpis.categoriesUsed)} />
        <Kpi label="Brands"             value={String(kpis.brands)} />
      </div>

      <Card padding="md">
        <EquipmentFiltersBar
          options={options}
          categories={CATEGORIES}
          statuses={STATUSES}
        />
      </Card>

      {rows.length === 0 ? (
        <Card padding="lg">
          <EmptyState
            title={total === 0 ? "No equipment templates yet" : "No equipment matches these filters"}
            description={total === 0
              ? "Click \u2018+ New equipment\u2019 above to mint the first template."
              : "Adjust filters to widen the search."}
          />
        </Card>
      ) : (
        <EquipmentTable
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
