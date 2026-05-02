import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  Breadcrumb,
  Button,
  Card,
  PageHeader,
} from "@/components/ui";
import {
  loadInvoicesFilterOptions,
  loadInvoicesKpi,
  loadInvoicesList,
  type InvoicesFilters,
} from "@/server/platform/invoices";
import type {
  PlatformInvoiceSource,
  PlatformInvoiceStatus,
} from "@prisma/client";
import { InvoicesFiltersBar } from "./_components/InvoicesFiltersBar";
import { InvoicesTable } from "./_components/InvoicesTable";
import { NewInvoiceButton } from "./_components/NewInvoiceButton";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
const PAGE_SIZE = 50;

const STATUSES: PlatformInvoiceStatus[] = [
  "DRAFT", "SENT", "OPEN", "PAID", "VOIDED", "UNCOLLECTIBLE", "REFUNDED",
];
const SOURCES: PlatformInvoiceSource[] = ["SUBSCRIPTION", "MANUAL"];

function parseFilters(sp: SearchParams): InvoicesFilters {
  const f: InvoicesFilters = {};
  if (typeof sp.q === "string" && sp.q.trim()) f.q = sp.q.trim();
  if (typeof sp.status === "string" && (STATUSES as string[]).includes(sp.status)) {
    f.status = sp.status as PlatformInvoiceStatus;
  }
  if (typeof sp.tenant === "string" && sp.tenant) f.tenantId = sp.tenant;
  if (typeof sp.plan === "string" && sp.plan) f.plan = sp.plan.toUpperCase();
  if (typeof sp.currency === "string" && sp.currency) f.currency = sp.currency.toUpperCase();
  if (typeof sp.source === "string" && (SOURCES as string[]).includes(sp.source)) {
    f.source = sp.source as PlatformInvoiceSource;
  }
  if (typeof sp.issuedSince === "string" && sp.issuedSince) {
    const d = new Date(sp.issuedSince); if (!Number.isNaN(d.getTime())) f.issuedSince = d;
  }
  if (typeof sp.issuedUntil === "string" && sp.issuedUntil) {
    const d = new Date(sp.issuedUntil); if (!Number.isNaN(d.getTime())) f.issuedUntil = d;
  }
  if (typeof sp.dueSince === "string" && sp.dueSince) {
    const d = new Date(sp.dueSince); if (!Number.isNaN(d.getTime())) f.dueSince = d;
  }
  if (typeof sp.dueUntil === "string" && sp.dueUntil) {
    const d = new Date(sp.dueUntil); if (!Number.isNaN(d.getTime())) f.dueUntil = d;
  }
  if (typeof sp.paidSince === "string" && sp.paidSince) {
    const d = new Date(sp.paidSince); if (!Number.isNaN(d.getTime())) f.paidSince = d;
  }
  if (typeof sp.paidUntil === "string" && sp.paidUntil) {
    const d = new Date(sp.paidUntil); if (!Number.isNaN(d.getTime())) f.paidUntil = d;
  }
  if (typeof sp.amountMin === "string" && sp.amountMin) {
    const n = Number(sp.amountMin); if (!Number.isNaN(n)) f.amountMin = Math.round(n * 100);
  }
  if (typeof sp.amountMax === "string" && sp.amountMax) {
    const n = Number(sp.amountMax); if (!Number.isNaN(n)) f.amountMax = Math.round(n * 100);
  }
  if (sp.hasTax === "1") f.hasTax = true;
  else if (sp.hasTax === "0") f.hasTax = false;
  if (sp.hasDiscount === "1") f.hasDiscount = true;
  else if (sp.hasDiscount === "0") f.hasDiscount = false;
  return f;
}

function buildQs(sp: SearchParams, override: Record<string, string | null> = {}): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k in override) continue;
    if (typeof v === "string") u.set(k, v);
    else if (Array.isArray(v)) for (const x of v) u.append(k, x);
  }
  for (const [k, v] of Object.entries(override)) {
    if (v != null && v !== "") u.set(k, v);
  }
  const q = u.toString();
  return q ? `?${q}` : "";
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canEdit = ctx.can("billing.invoice");
  const canRefund = ctx.can("billing.refund");

  const filters = parseFilters(sp);
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : "1") || 1);

  const [{ rows, total, filteredTotal }, kpi, options] = await Promise.all([
    loadInvoicesList({ filters, page, pageSize: PAGE_SIZE }),
    loadInvoicesKpi(),
    loadInvoicesFilterOptions(),
  ]);

  const exportQs = buildQs(sp, { page: null });

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Billing", href: "/platform/billing" },
          { label: "Invoices" },
        ]} />
        <div className="mt-3">
          <PageHeader
            title="Invoices"
            description="Every invoice across all tenants — subscription + manual."
            actions={
              <>
                <Link href={`/api/platform/billing/invoices/export${exportQs}`}>
                  <Button size="sm" variant="secondary">Export</Button>
                </Link>
                {canEdit && <NewInvoiceButton />}
              </>
            }
          />
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Kpi label="Total · 30d" value={kpi.totalThisPeriod === 0 ? "—" : `$${(kpi.totalThisPeriod / 100).toLocaleString()}`} />
        <Kpi label="Paid"        value={kpi.paid.toLocaleString()} tone="good" />
        <Kpi label="Open"        value={kpi.open.toLocaleString()} />
        <Kpi label="Past due"    value={kpi.pastDue.toLocaleString()} tone={kpi.pastDue > 0 ? "danger" : "default"} />
        <Kpi label="Voided"      value={kpi.voided.toLocaleString()} />
        <Kpi label="Avg DSO"     value={kpi.avgDsoDays == null ? "—" : `${kpi.avgDsoDays}d`} />
      </div>

      {/* Filters */}
      <Card padding="md">
        <InvoicesFiltersBar
          options={options}
          statuses={STATUSES}
          sources={SOURCES}
        />
      </Card>

      {/* Table */}
      <InvoicesTable
        rows={rows}
        total={total}
        filteredTotal={filteredTotal}
        page={page}
        pageSize={PAGE_SIZE}
        canEdit={canEdit}
        canRefund={canRefund}
      />
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "default" | "good" | "danger" }) {
  const palette =
    tone === "good"   ? { borderColor: "var(--emerald-200)" } :
    tone === "danger" ? { borderColor: "var(--rose-200)" } :
                         undefined;
  return (
    <Card padding="md" className="h-full" style={palette}>
      <div className="flex h-full flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
        <div className="text-[24px] font-semibold leading-none tabular-nums" style={{ color: "var(--text-default)" }}>
          {value}
        </div>
      </div>
    </Card>
  );
}
