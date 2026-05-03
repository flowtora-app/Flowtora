// Page 25 — Master Product editor.
//
// Consolidated tabs (the spec's 14-tab editor reorganized into 8
// coherent groups):
//   1. Details      — name, slug, copy, tags, SEO
//   2. Attributes   — dynamic schema builder (NUMBER / SELECT / etc.)
//   3. Pricing & Production — formula, lead time, equipment, waste
//   4. Materials    — bill-of-materials defaults
//   5. Images       — gallery + hero + mockups
//   6. Compliance   — certifications + regulatory notes
//   7. Adoption     — tenant clones + push update
//   8. Versions     — published version history
//   + per-section audit appears via /platform/access/audit?entity=MasterProduct&id=...

import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import {
  Breadcrumb,
  Card,
  PageHeader,
} from "@/components/ui";
import { loadCatalogDetail } from "@/server/platform/catalog";
import {
  archiveMasterProduct,
  duplicateMasterProduct,
  publishMasterProduct,
  pushMasterProductUpdate,
} from "@/app/actions/platform-catalog";
import { DetailsTab } from "./_components/DetailsTab";
import { AttributesTab } from "./_components/AttributesTab";
import { PricingProductionTab } from "./_components/PricingProductionTab";
import { MaterialsTab } from "./_components/MaterialsTab";
import { ImagesTab } from "./_components/ImagesTab";
import { ComplianceTab } from "./_components/ComplianceTab";
import { AdoptionTab } from "./_components/AdoptionTab";
import { VersionsTab } from "./_components/VersionsTab";
import { fmtMoney, StatusPill } from "../_components/shared";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
type TabKey =
  | "details" | "attributes" | "pricing"
  | "materials" | "images" | "compliance"
  | "adoption" | "versions";

const TAB_KEYS: TabKey[] = [
  "details", "attributes", "pricing", "materials",
  "images", "compliance", "adoption", "versions",
];

const TAB_LABEL: Record<TabKey, string> = {
  details: "Details",
  attributes: "Attributes",
  pricing: "Pricing & production",
  materials: "Materials",
  images: "Images & mockups",
  compliance: "Compliance",
  adoption: "Adoption",
  versions: "Versions",
};

const OK_LABELS: Record<string, string> = {
  saved: "Saved.",
  created: "Product created.",
  duplicated: "Duplicated.",
  published: "Published.",
  archived: "Archived.",
  pushed: "Update pushed to all cloned tenant products.",
  attribute_saved: "Attribute saved.",
  attribute_deleted: "Attribute deleted.",
  material_saved: "Material saved.",
  material_deleted: "Material deleted.",
  image_saved: "Image saved.",
  image_deleted: "Image deleted.",
};

export default async function MasterProductEditorPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requirePlatformStaff();
  const canManage = ctx.can("plans.manage");

  const detail = await loadCatalogDetail(id);
  if (!detail) notFound();

  const tabRaw = typeof sp.tab === "string" ? sp.tab : "details";
  const tab: TabKey = (TAB_KEYS as readonly string[]).includes(tabRaw) ? (tabRaw as TabKey) : "details";

  const okMsg = typeof sp.ok === "string" ? OK_LABELS[sp.ok] ?? "Done." : null;
  const errMsg = typeof sp.error === "string" ? decodeURIComponent(sp.error) : null;

  // Resolve "published by" emails for the versions tab.
  const userIds = Array.from(new Set(
    detail.versions.map((v) => v.publishedByUserId).filter((x): x is string => !!x),
  ));
  const users = userIds.length === 0 ? [] : await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true },
  });
  const userById = new Map(users.map((u) => [u.id, u.name ?? u.email ?? null]));

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Catalog", href: "/platform/catalog/products" },
          { label: "Master Product Catalog", href: "/platform/catalog/products" },
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
                  From {fmtMoney(detail.priceFromMinor)} · Lead {detail.leadTimeDays}d ·{" "}
                  {detail.cloneCount} clone{detail.cloneCount === 1 ? "" : "s"}
                </span>
              </span>
            }
            actions={canManage ? <ActionRow productId={detail.id} status={detail.status} /> : null}
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

      <TabBar productId={detail.id} active={tab} />

      {tab === "details"     && <DetailsTab detail={detail} canManage={canManage} />}
      {tab === "attributes"  && <AttributesTab detail={detail} canManage={canManage} />}
      {tab === "pricing"     && <PricingProductionTab detail={detail} canManage={canManage} />}
      {tab === "materials"   && <MaterialsTab detail={detail} canManage={canManage} />}
      {tab === "images"      && <ImagesTab detail={detail} canManage={canManage} />}
      {tab === "compliance"  && <ComplianceTab detail={detail} canManage={canManage} />}
      {tab === "adoption"    && <AdoptionTab detail={detail} canManage={canManage} />}
      {tab === "versions"    && (
        <VersionsTab versions={detail.versions.map((v) => ({
          ...v, publishedByName: v.publishedByUserId ? userById.get(v.publishedByUserId) ?? null : null,
        }))} />
      )}

      {/* Reference Card so tree-shake keeps it for tabs. */}
      <span className="hidden" aria-hidden>{Card.name}</span>
    </div>
  );
}

function TabBar({ productId, active }: { productId: string; active: TabKey }) {
  return (
    <div className="overflow-x-auto border-b" style={{ borderColor: "var(--border-subtle)" }}>
      <div className="flex min-w-max items-center gap-0">
        {TAB_KEYS.map((key) => {
          const isActive = key === active;
          return (
            <Link
              key={key}
              href={key === "details"
                ? `/platform/catalog/products/${productId}`
                : `/platform/catalog/products/${productId}?tab=${key}`}
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

function ActionRow({ productId, status }: { productId: string; status: "DRAFT" | "PUBLISHED" | "ARCHIVED" }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status !== "PUBLISHED" && (
        <form action={publishMasterProduct.bind(null, productId)}>
          <button type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
            Publish
          </button>
        </form>
      )}
      {status === "PUBLISHED" && (
        <form action={pushMasterProductUpdate.bind(null, productId)}>
          <button type="submit"
                  className="ts-focus rounded-md border px-3 py-1.5 text-[12px] font-medium"
                  style={{ borderColor: "var(--accent-primary)", color: "var(--accent-primary)", background: "var(--surface-1)" }}>
            Push update to clones
          </button>
        </form>
      )}
      <form action={duplicateMasterProduct.bind(null, productId)}>
        <button type="submit"
                className="ts-focus rounded-md border px-3 py-1.5 text-[12px] font-medium"
                style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)", background: "var(--surface-1)" }}>
          Duplicate
        </button>
      </form>
      {status !== "ARCHIVED" && (
        <form action={archiveMasterProduct.bind(null, productId)}>
          <button type="submit"
                  className="ts-focus rounded-md border px-3 py-1.5 text-[12px] font-medium"
                  style={{ borderColor: "var(--border-subtle)", color: "var(--danger-fg)", background: "var(--surface-1)" }}>
            Archive
          </button>
        </form>
      )}
    </div>
  );
}
