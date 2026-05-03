// Page 27 — Equipment editor.
// Spec's tabs consolidated into 5: Specs, Productivity, Costs,
// Materials compatibility, Maintenance schedule.

import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { Breadcrumb, PageHeader } from "@/components/ui";
import { loadEquipmentDetail } from "@/server/platform/equipment";
import {
  discontinueMasterEquipment,
  reactivateMasterEquipment,
} from "@/app/actions/platform-equipment";
import { CATEGORY_LABEL, StatusPill } from "../_components/shared";
import { SpecsTab } from "./_components/SpecsTab";
import { ProductivityTab } from "./_components/ProductivityTab";
import { CostsTab } from "./_components/CostsTab";
import { MaterialsTab } from "./_components/MaterialsTab";
import { MaintenanceTab } from "./_components/MaintenanceTab";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
type TabKey = "specs" | "productivity" | "costs" | "materials" | "maintenance";

const TAB_KEYS: TabKey[] = ["specs", "productivity", "costs", "materials", "maintenance"];
const TAB_LABEL: Record<TabKey, string> = {
  specs: "Specs",
  productivity: "Productivity",
  costs: "Costs",
  materials: "Materials compat",
  maintenance: "Maintenance",
};

const OK_LABELS: Record<string, string> = {
  saved: "Saved.",
  discontinued: "Marked discontinued.",
  reactivated: "Reactivated.",
  compat_added: "Compatibility added.",
  compat_removed: "Compatibility removed.",
  task_saved: "Maintenance task saved.",
  task_deleted: "Maintenance task removed.",
};

export default async function EquipmentEditorPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requirePlatformStaff();
  const canManage = ctx.can("plans.manage");

  const detail = await loadEquipmentDetail(id);
  if (!detail) notFound();

  // Materials list for the picker on the Materials tab.
  const allMaterials = await db.masterMaterial.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: { id: true, name: true, category: true, slug: true },
  });

  const tabRaw = typeof sp.tab === "string" ? sp.tab : "specs";
  const tab: TabKey = (TAB_KEYS as readonly string[]).includes(tabRaw) ? (tabRaw as TabKey) : "specs";
  const okMsg = typeof sp.ok === "string" ? OK_LABELS[sp.ok] ?? "Done." : null;
  const errMsg = typeof sp.error === "string" ? decodeURIComponent(sp.error) : null;

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Catalog", href: "/platform/catalog/products" },
          { label: "Equipment Templates", href: "/platform/catalog/equipment" },
          { label: detail.displayName ?? `${detail.brand} ${detail.model}` },
        ]} />
        <div className="mt-3">
          <PageHeader
            title={detail.displayName ?? `${detail.brand} ${detail.model}`}
            description={
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {detail.slug}
                </span>
                <StatusPill status={detail.status} />
                <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                  {CATEGORY_LABEL[detail.category]} · {detail.brand} {detail.model}
                </span>
              </span>
            }
            actions={canManage ? <ActionRow id={detail.id} status={detail.status} /> : null}
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

      <TabBar equipmentId={detail.id} active={tab} />

      {tab === "specs"        && <SpecsTab detail={detail} canManage={canManage} />}
      {tab === "productivity" && <ProductivityTab detail={detail} canManage={canManage} />}
      {tab === "costs"        && <CostsTab detail={detail} canManage={canManage} />}
      {tab === "materials"    && <MaterialsTab detail={detail} allMaterials={allMaterials} canManage={canManage} />}
      {tab === "maintenance"  && <MaintenanceTab detail={detail} canManage={canManage} />}
    </div>
  );
}

function TabBar({ equipmentId, active }: { equipmentId: string; active: TabKey }) {
  return (
    <div className="overflow-x-auto border-b" style={{ borderColor: "var(--border-subtle)" }}>
      <div className="flex min-w-max items-center gap-0">
        {TAB_KEYS.map((key) => {
          const isActive = key === active;
          return (
            <Link
              key={key}
              href={key === "specs"
                ? `/platform/catalog/equipment/${equipmentId}`
                : `/platform/catalog/equipment/${equipmentId}?tab=${key}`}
              className="ts-focus relative px-3 py-2 text-[13px] font-medium whitespace-nowrap"
              style={{
                color: isActive ? "var(--text-default)" : "var(--text-muted)",
                borderBottom: isActive ? "2px solid var(--accent-primary)" : "2px solid transparent",
                marginBottom: "-1px",
              }}
            >
              {TAB_LABEL[key]}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function ActionRow({ id, status }: { id: string; status: "ACTIVE" | "DISCONTINUED" }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "ACTIVE" ? (
        <form action={discontinueMasterEquipment.bind(null, id)}>
          <button type="submit"
                  className="ts-focus rounded-md border px-3 py-1.5 text-[12px] font-medium"
                  style={{ borderColor: "var(--border-subtle)", color: "var(--danger-fg)", background: "var(--surface-1)" }}>
            Discontinue
          </button>
        </form>
      ) : (
        <form action={reactivateMasterEquipment.bind(null, id)}>
          <button type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
            Reactivate
          </button>
        </form>
      )}
    </div>
  );
}
