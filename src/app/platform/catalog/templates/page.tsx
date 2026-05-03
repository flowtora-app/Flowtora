// Page 29 — Industry Templates list.
// Six kind tabs at /platform/catalog/templates?kind=... with cards-by-kind view.

import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  Breadcrumb,
  Card,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import {
  loadTemplateKpis,
  loadTemplateList,
  type TemplateListFilters,
} from "@/server/platform/industry-templates";
import type {
  IndustryTemplateKind,
  IndustryTemplateStatus,
} from "@prisma/client";
import { Kpi, KIND_LABEL } from "./_components/shared";
import { TemplateFiltersBar } from "./_components/TemplateFiltersBar";
import { TemplateGrid } from "./_components/TemplateGrid";
import { NewTemplateButton } from "./_components/NewTemplateButton";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const PAGE_SIZE = 60;

const KINDS: IndustryTemplateKind[] = [
  "STOREFRONT", "QUOTE_PDF", "WORK_ORDER",
  "INVOICE", "PROOF_EMAIL", "CUSTOMER_EMAIL",
];

const STATUSES: IndustryTemplateStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];

const OK_LABELS: Record<string, string> = {
  saved: "Saved.",
  created: "Template created.",
  duplicated: "Duplicated.",
  published: "Published.",
  archived: "Archived.",
};

function parseFilters(sp: SP, defaultKind: IndustryTemplateKind): TemplateListFilters {
  const f: TemplateListFilters = { kind: defaultKind };
  if (typeof sp.q === "string" && sp.q.trim()) f.q = sp.q.trim();
  if (typeof sp.status === "string" && (STATUSES as string[]).includes(sp.status)) {
    f.status = sp.status as IndustryTemplateStatus;
  }
  if (typeof sp.locale === "string" && sp.locale) f.locale = sp.locale;
  if (typeof sp.tag === "string" && sp.tag) f.tag = sp.tag;
  return f;
}

export default async function IndustryTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canManage = ctx.can("plans.manage");

  const kindRaw = typeof sp.kind === "string" ? sp.kind : "STOREFRONT";
  const kind: IndustryTemplateKind = (KINDS as string[]).includes(kindRaw)
    ? (kindRaw as IndustryTemplateKind)
    : "STOREFRONT";

  const filters = parseFilters(sp, kind);
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : "1") || 1);
  const okMsg = typeof sp.ok === "string" ? OK_LABELS[sp.ok] ?? "Done." : null;
  const errMsg = typeof sp.error === "string" ? decodeURIComponent(sp.error) : null;

  const [{ rows, total, filteredTotal }, kpis] = await Promise.all([
    loadTemplateList({ filters, page, pageSize: PAGE_SIZE }),
    loadTemplateKpis(),
  ]);

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Catalog", href: "/platform/catalog/products" },
          { label: "Industry Templates" },
        ]} />
        <div className="mt-3">
          <PageHeader
            title="Industry Templates"
            description="Document templates tenants adopt — storefront pages, quote PDFs, work orders, invoices, and email templates. Variables fill at render time."
            actions={canManage ? <NewTemplateButton defaultKind={kind} /> : null}
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
        <Kpi label="Total templates" value={String(kpis.total)} />
        <Kpi label="Published"       value={String(kpis.publishedCount)} tone="good" />
        <Kpi label="Drafts"          value={String(kpis.draftCount)}
             tone={kpis.draftCount > 0 ? "warning" : "default"} />
        <Kpi label="Archived"        value={String(kpis.archivedCount)} />
        <Kpi label={`In ${KIND_LABEL[kind]}`} value={String(kpis.byKind[kind])}
             sub="Active tab count" />
      </div>

      <TabBar activeKind={kind} byKind={kpis.byKind} />

      <Card padding="md">
        <TemplateFiltersBar
          activeKind={kind}
          statuses={STATUSES}
        />
      </Card>

      {rows.length === 0 ? (
        <Card padding="lg">
          <EmptyState
            title={total === 0 ? "No templates yet" : `No ${KIND_LABEL[kind]} templates match these filters`}
            description={total === 0
              ? "Click ‘+ New template’ above to mint the first row."
              : "Adjust filters to widen the search, or switch tabs."}
          />
        </Card>
      ) : (
        <TemplateGrid rows={rows} total={total} filteredTotal={filteredTotal}
                      page={page} pageSize={PAGE_SIZE} />
      )}
    </div>
  );
}

function TabBar({
  activeKind, byKind,
}: {
  activeKind: IndustryTemplateKind;
  byKind: Record<IndustryTemplateKind, number>;
}) {
  return (
    <div className="overflow-x-auto border-b" style={{ borderColor: "var(--border-subtle)" }}>
      <div className="flex min-w-max items-center gap-0">
        {KINDS.map((k) => {
          const isActive = k === activeKind;
          return (
            <Link
              key={k}
              href={`/platform/catalog/templates?kind=${k}`}
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
