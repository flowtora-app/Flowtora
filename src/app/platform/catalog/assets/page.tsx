// Page 30 — Design Asset Library list.
// Seven kind tabs at /platform/catalog/assets?kind=...

import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  Breadcrumb,
  Card,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import {
  loadAssetKpis,
  loadAssetList,
  type AssetListFilters,
} from "@/server/platform/design-assets";
import type {
  DesignAssetKind,
  DesignAssetLicense,
  DesignAssetStatus,
} from "@prisma/client";
import { Kpi, KIND_LABEL } from "./_components/shared";
import { AssetFiltersBar } from "./_components/AssetFiltersBar";
import { AssetGrid } from "./_components/AssetGrid";
import { NewAssetButton } from "./_components/NewAssetButton";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const PAGE_SIZE = 60;

const KINDS: DesignAssetKind[] = [
  "FONT", "ICON", "MOCKUP", "PALETTE", "PATTERN", "PHOTO", "TEMPLATE",
];

const LICENSES: DesignAssetLicense[] = [
  "CC0", "CC_BY", "CC_BY_SA", "COMMERCIAL", "PROPRIETARY", "CUSTOM",
];

const STATUSES: DesignAssetStatus[] = ["ACTIVE", "ARCHIVED"];

const OK_LABELS: Record<string, string> = {
  saved: "Saved.",
  created: "Asset created.",
  duplicated: "Duplicated.",
  archived: "Archived.",
  reactivated: "Reactivated.",
};

function parseFilters(sp: SP, defaultKind: DesignAssetKind): AssetListFilters {
  const f: AssetListFilters = { kind: defaultKind };
  if (typeof sp.q === "string" && sp.q.trim()) f.q = sp.q.trim();
  if (typeof sp.license === "string" && (LICENSES as string[]).includes(sp.license)) {
    f.license = sp.license as DesignAssetLicense;
  }
  if (typeof sp.status === "string" && (STATUSES as string[]).includes(sp.status)) {
    f.status = sp.status as DesignAssetStatus;
  }
  if (typeof sp.tag === "string" && sp.tag) f.tag = sp.tag;
  return f;
}

export default async function DesignAssetsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canManage = ctx.can("plans.manage");

  const kindRaw = typeof sp.kind === "string" ? sp.kind : "FONT";
  const kind: DesignAssetKind = (KINDS as string[]).includes(kindRaw)
    ? (kindRaw as DesignAssetKind)
    : "FONT";

  const filters = parseFilters(sp, kind);
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : "1") || 1);
  const okMsg = typeof sp.ok === "string" ? OK_LABELS[sp.ok] ?? "Done." : null;
  const errMsg = typeof sp.error === "string" ? decodeURIComponent(sp.error) : null;

  const [{ rows, total, filteredTotal }, kpis] = await Promise.all([
    loadAssetList({ filters, page, pageSize: PAGE_SIZE }),
    loadAssetKpis(),
  ]);

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Catalog", href: "/platform/catalog/products" },
          { label: "Design Asset Library" },
        ]} />
        <div className="mt-3">
          <PageHeader
            title="Design Asset Library"
            description="Licensed stock assets — fonts, vectors, mockups, palettes, patterns, photos, templates — available to tenants on eligible plans."
            actions={canManage ? <NewAssetButton defaultKind={kind} /> : null}
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Total assets"   value={String(kpis.total)} />
        <Kpi label="Active"          value={String(kpis.activeCount)} tone="good" />
        <Kpi label="Archived"        value={String(kpis.archivedCount)}
             tone={kpis.archivedCount > 0 ? "warning" : "default"} />
        <Kpi label={`In ${KIND_LABEL[kind]}`} value={String(kpis.byKind[kind])}
             sub="Active tab count" />
      </div>

      <TabBar activeKind={kind} byKind={kpis.byKind} />

      <Card padding="md">
        <AssetFiltersBar
          activeKind={kind}
          licenses={LICENSES}
          statuses={STATUSES}
        />
      </Card>

      {rows.length === 0 ? (
        <Card padding="lg">
          <EmptyState
            title={total === 0 ? "No assets yet" : `No ${KIND_LABEL[kind]} assets match these filters`}
            description={total === 0
              ? "Click ‘+ New asset’ above to mint the first row."
              : "Adjust filters to widen the search, or switch tabs."}
          />
        </Card>
      ) : (
        <AssetGrid rows={rows} total={total} filteredTotal={filteredTotal}
                   page={page} pageSize={PAGE_SIZE} />
      )}
    </div>
  );
}

function TabBar({
  activeKind, byKind,
}: {
  activeKind: DesignAssetKind;
  byKind: Record<DesignAssetKind, number>;
}) {
  return (
    <div className="overflow-x-auto border-b" style={{ borderColor: "var(--border-subtle)" }}>
      <div className="flex min-w-max items-center gap-0">
        {KINDS.map((k) => {
          const isActive = k === activeKind;
          return (
            <Link
              key={k}
              href={`/platform/catalog/assets?kind=${k}`}
              className="ts-focus relative px-4 py-2 text-[13px] font-medium whitespace-nowrap"
              style={{
                color: isActive ? "var(--text-default)" : "var(--text-muted)",
                borderBottom: isActive ? "2px solid var(--accent-primary)" : "2px solid transparent",
                marginBottom: "-1px",
              }}
            >
              {KIND_LABEL[k]}
              <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums"
                    style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                {byKind[k]}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
