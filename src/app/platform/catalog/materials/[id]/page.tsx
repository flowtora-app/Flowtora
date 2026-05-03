// Page 26 — Master Material editor.
// Spec's 8 tabs consolidated into 5 logical groups:
//   1. Specs       — name, dimensions, color, finish, durability, fire, etc.
//   2. Cost        — cost defaults, markup, waste, MOQ
//   3. Suppliers   — multi-supplier table with primary/backup
//   4. Swatches    — color variants for color-bearing materials
//   5. Compatibility — equipment + product matches + datasheet

import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformStaff } from "@/lib/platform";
import { Breadcrumb, PageHeader } from "@/components/ui";
import { loadMaterialDetail } from "@/server/platform/materials";
import {
  archiveMasterMaterial,
  reactivateMasterMaterial,
} from "@/app/actions/platform-materials";
import { CATEGORY_LABEL, fmtMoneyDecimal4, StatusPill } from "../_components/shared";
import { SpecsTab } from "./_components/SpecsTab";
import { CostTab } from "./_components/CostTab";
import { SuppliersTab } from "./_components/SuppliersTab";
import { SwatchesTab } from "./_components/SwatchesTab";
import { CompatibilityTab } from "./_components/CompatibilityTab";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
type TabKey = "specs" | "cost" | "suppliers" | "swatches" | "compatibility";

const TAB_KEYS: TabKey[] = ["specs", "cost", "suppliers", "swatches", "compatibility"];

const TAB_LABEL: Record<TabKey, string> = {
  specs: "Specs",
  cost: "Cost & pricing",
  suppliers: "Suppliers",
  swatches: "Color swatches",
  compatibility: "Compatibility & datasheet",
};

const OK_LABELS: Record<string, string> = {
  saved: "Saved.",
  created: "Material created.",
  discontinued: "Marked discontinued.",
  reactivated: "Reactivated.",
  supplier_saved: "Supplier saved.",
  supplier_deleted: "Supplier removed.",
  swatch_saved: "Swatch saved.",
  swatch_deleted: "Swatch removed.",
};

export default async function MaterialEditorPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requirePlatformStaff();
  const canManage = ctx.can("plans.manage");

  const detail = await loadMaterialDetail(id);
  if (!detail) notFound();

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
          { label: "Material Library", href: "/platform/catalog/materials" },
          { label: detail.name },
        ]} />
        <div className="mt-3">
          <PageHeader
            title={detail.name}
            description={
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {detail.slug}{detail.sku ? ` · ${detail.sku}` : ""}
                </span>
                <StatusPill status={detail.status} />
                <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                  {CATEGORY_LABEL[detail.category]}
                  {detail.subcategory ? ` · ${detail.subcategory}` : ""} ·{" "}
                  {fmtMoneyDecimal4(detail.defaultCost)} per {detail.defaultUnit}
                </span>
              </span>
            }
            actions={canManage
              ? <ActionRow id={detail.id} status={detail.status} />
              : null}
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

      <TabBar materialId={detail.id} active={tab} />

      {tab === "specs"         && <SpecsTab detail={detail} canManage={canManage} />}
      {tab === "cost"          && <CostTab detail={detail} canManage={canManage} />}
      {tab === "suppliers"     && <SuppliersTab detail={detail} canManage={canManage} />}
      {tab === "swatches"      && <SwatchesTab detail={detail} canManage={canManage} />}
      {tab === "compatibility" && <CompatibilityTab detail={detail} canManage={canManage} />}
    </div>
  );
}

function TabBar({ materialId, active }: { materialId: string; active: TabKey }) {
  return (
    <div className="overflow-x-auto border-b" style={{ borderColor: "var(--border-subtle)" }}>
      <div className="flex min-w-max items-center gap-0">
        {TAB_KEYS.map((key) => {
          const isActive = key === active;
          return (
            <Link
              key={key}
              href={key === "specs"
                ? `/platform/catalog/materials/${materialId}`
                : `/platform/catalog/materials/${materialId}?tab=${key}`}
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
        <form action={archiveMasterMaterial.bind(null, id)}>
          <button type="submit"
                  className="ts-focus rounded-md border px-3 py-1.5 text-[12px] font-medium"
                  style={{ borderColor: "var(--border-subtle)", color: "var(--danger-fg)", background: "var(--surface-1)" }}>
            Discontinue
          </button>
        </form>
      ) : (
        <form action={reactivateMasterMaterial.bind(null, id)}>
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
