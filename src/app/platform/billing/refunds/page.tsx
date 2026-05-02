// Page 18 — Refunds & Disputes.
//
// 3 tabs sharing a route: Refunds (default), Disputes, Templates.
// Tab + filter state is URL-driven so deep links + bookmarks work.

import { requirePlatformStaff } from "@/lib/platform";
import {
  Breadcrumb,
  Card,
  EmptyState,
  PageHeader,
  Tabs,
} from "@/components/ui";
import {
  loadDisputesKpi,
  loadDisputesList,
  loadEvidenceTemplates,
  loadRefundablePayments,
  loadRefundsDisputesFilterOptions,
  loadRefundsKpi,
  loadRefundsList,
  type DisputesFilters,
  type RefundsFilters,
} from "@/server/platform/refunds-disputes";
import type { PlatformDisputeStatus, PlatformRefundReason, PlatformRefundStatus } from "@prisma/client";
import { RefundsFiltersBar } from "./_components/RefundsFiltersBar";
import { RefundsTable } from "./_components/RefundsTable";
import { DisputesFiltersBar } from "./_components/DisputesFiltersBar";
import { DisputesTable } from "./_components/DisputesTable";
import { TemplatesTab } from "./_components/TemplatesTab";
import { NewRefundButton } from "./_components/NewRefundButton";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
type TabKey = "refunds" | "disputes" | "templates";
const PAGE_SIZE = 50;

const REFUND_STATUSES: PlatformRefundStatus[] = ["PENDING", "SUCCEEDED", "FAILED"];
const REFUND_REASONS: PlatformRefundReason[] = [
  "CUSTOMER_REQUEST", "FRAUD", "DUPLICATE",
  "SUBSCRIPTION_MISTAKE", "SERVICE_ISSUE", "OTHER",
];
const DISPUTE_STATUSES: PlatformDisputeStatus[] = [
  "NEEDS_RESPONSE", "UNDER_REVIEW", "WON", "LOST",
];

function parseRefundFilters(sp: SearchParams): RefundsFilters {
  const f: RefundsFilters = {};
  if (typeof sp.q === "string" && sp.q.trim()) f.q = sp.q.trim();
  if (typeof sp.status === "string" && (REFUND_STATUSES as string[]).includes(sp.status)) {
    f.status = sp.status as PlatformRefundStatus;
  }
  if (typeof sp.reason === "string" && (REFUND_REASONS as string[]).includes(sp.reason)) {
    f.reason = sp.reason as PlatformRefundReason;
  }
  if (typeof sp.tenant === "string" && sp.tenant) f.tenantId = sp.tenant;
  if (typeof sp.credit === "string") {
    if (sp.credit === "1" || sp.credit === "true") f.asCredit = true;
    if (sp.credit === "0" || sp.credit === "false") f.asCredit = false;
  }
  if (typeof sp.since === "string" && sp.since) {
    const d = new Date(sp.since); if (!Number.isNaN(d.getTime())) f.since = d;
  }
  if (typeof sp.until === "string" && sp.until) {
    const d = new Date(sp.until); if (!Number.isNaN(d.getTime())) f.until = d;
  }
  if (typeof sp.amountMin === "string" && sp.amountMin) {
    const n = Number(sp.amountMin); if (!Number.isNaN(n)) f.amountMin = Math.round(n * 100);
  }
  if (typeof sp.amountMax === "string" && sp.amountMax) {
    const n = Number(sp.amountMax); if (!Number.isNaN(n)) f.amountMax = Math.round(n * 100);
  }
  return f;
}

function parseDisputeFilters(sp: SearchParams): DisputesFilters {
  const f: DisputesFilters = {};
  if (typeof sp.q === "string" && sp.q.trim()) f.q = sp.q.trim();
  if (typeof sp.status === "string" && (DISPUTE_STATUSES as string[]).includes(sp.status)) {
    f.status = sp.status as PlatformDisputeStatus;
  }
  if (typeof sp.tenant === "string" && sp.tenant) f.tenantId = sp.tenant;
  if (typeof sp.due === "string") {
    const n = Number(sp.due);
    if (!Number.isNaN(n) && [0, 3, 7].includes(n)) f.evidenceDueWithinDays = n;
  }
  if (typeof sp.amountMin === "string" && sp.amountMin) {
    const n = Number(sp.amountMin); if (!Number.isNaN(n)) f.amountMin = Math.round(n * 100);
  }
  if (typeof sp.amountMax === "string" && sp.amountMax) {
    const n = Number(sp.amountMax); if (!Number.isNaN(n)) f.amountMax = Math.round(n * 100);
  }
  return f;
}

export default async function RefundsAndDisputesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canManage = ctx.can("billing.refund");

  const tabRaw = typeof sp.tab === "string" ? sp.tab : "refunds";
  const tab: TabKey = (["refunds", "disputes", "templates"] as TabKey[]).includes(tabRaw as TabKey)
    ? (tabRaw as TabKey)
    : "refunds";

  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : "1") || 1);
  const filterOptions = await loadRefundsDisputesFilterOptions();

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Billing", href: "/platform/billing" },
          { label: "Refunds & Disputes" },
        ]} />
        <div className="mt-3">
          <PageHeader
            title="Refunds & Disputes"
            description="Process refunds, manage chargebacks, and curate the evidence library."
            actions={tab === "refunds" && canManage
              ? <NewRefundButton payments={await loadRefundablePayments()} />
              : null}
          />
        </div>
      </div>

      <Tabs
        variant="line"
        items={[
          { label: "Refunds", href: "/platform/billing/refunds?tab=refunds" },
          { label: "Disputes", href: "/platform/billing/refunds?tab=disputes" },
          { label: "Chargeback Evidence Library", href: "/platform/billing/refunds?tab=templates" },
        ]}
        activeHref={`/platform/billing/refunds?tab=${tab}`}
      />

      {tab === "refunds" && (
        <RefundsTabContent
          filters={parseRefundFilters(sp)}
          page={page}
          filterOptions={filterOptions}
          canManage={canManage}
        />
      )}
      {tab === "disputes" && (
        <DisputesTabContent
          filters={parseDisputeFilters(sp)}
          page={page}
          filterOptions={filterOptions}
        />
      )}
      {tab === "templates" && (
        <TemplatesTab
          templates={await loadEvidenceTemplates()}
          canManage={canManage}
        />
      )}

      <Card padding="sm" style={{ borderColor: "var(--amber-200)", background: "var(--amber-50)" }}>
        <p className="text-[11px]" style={{ color: "var(--amber-700)" }}>
          <strong>Stripe webhook ingestion is honestly deferred.</strong> Refunds you mint here stay{" "}
          <span className="font-mono">PENDING</span> until the webhook ingestor flips them to{" "}
          <span className="font-mono">SUCCEEDED</span>/<span className="font-mono">FAILED</span>. Disputes only
          appear once the gateway raises one (or once admin-created for testing). The evidence packet captures
          every snapshot the integration needs — when the webhook lands, this page lights up without any UI changes.
        </p>
      </Card>
    </div>
  );
}

/* ────────────────────────────────────────────────────────── */
/* Tab content                                                */
/* ────────────────────────────────────────────────────────── */

async function RefundsTabContent({
  filters, page, filterOptions, canManage,
}: {
  filters: RefundsFilters;
  page: number;
  filterOptions: { tenants: { id: string; label: string }[] };
  canManage: boolean;
}) {
  const [{ rows, total, filteredTotal }, kpi] = await Promise.all([
    loadRefundsList({ filters, page, pageSize: PAGE_SIZE }),
    loadRefundsKpi(),
  ]);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Refunds · 30d" value={kpi.countThisPeriod.toLocaleString()} />
        <Kpi
          label="Amount · 30d"
          value={kpi.amountThisPeriod === 0 ? "—" : `$${(kpi.amountThisPeriod / 100).toLocaleString()}`}
        />
        <Kpi
          label="Refund rate"
          value={kpi.refundRatePct == null ? "—" : `${kpi.refundRatePct}%`}
          tone={kpi.refundRatePct != null && kpi.refundRatePct > 5 ? "warning" : "default"}
          sub="vs succeeded $"
        />
        <Kpi label="Pending" value={kpi.pending.toLocaleString()}
             tone={kpi.pending > 0 ? "warning" : "default"} />
        <Kpi label="Failed" value={kpi.failed.toLocaleString()}
             tone={kpi.failed > 0 ? "danger" : "default"} />
      </div>

      <Card padding="md">
        <RefundsFiltersBar
          tenants={filterOptions.tenants}
          statuses={REFUND_STATUSES}
          reasons={REFUND_REASONS}
        />
      </Card>

      {rows.length === 0 ? (
        <Card padding="lg">
          <EmptyState
            title={total === 0 ? "No refunds yet" : "No refunds match the current filters"}
            description={total === 0
              ? "Refunds you issue here will appear in this list. Click \u2018+ New refund\u2019 above to start one."
              : "Adjust the filters or clear them to see more results."}
          />
        </Card>
      ) : (
        <RefundsTable
          rows={rows}
          total={total}
          filteredTotal={filteredTotal}
          page={page}
          pageSize={PAGE_SIZE}
          canManage={canManage}
        />
      )}
    </div>
  );
}

async function DisputesTabContent({
  filters, page, filterOptions,
}: {
  filters: DisputesFilters;
  page: number;
  filterOptions: { tenants: { id: string; label: string }[] };
}) {
  const [{ rows, total, filteredTotal }, kpi] = await Promise.all([
    loadDisputesList({ filters, page, pageSize: PAGE_SIZE }),
    loadDisputesKpi(),
  ]);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Open" value={kpi.openCount.toLocaleString()}
             tone={kpi.openCount > 0 ? "warning" : "default"} />
        <Kpi label="Won" value={kpi.wonCount.toLocaleString()}
             tone={kpi.wonCount > 0 ? "good" : "default"} />
        <Kpi label="Lost" value={kpi.lostCount.toLocaleString()}
             tone={kpi.lostCount > 0 ? "danger" : "default"} />
        <Kpi label="Win rate"
             value={kpi.winRatePct == null ? "—" : `${kpi.winRatePct}%`} />
        <Kpi label="$ at risk"
             value={kpi.amountAtRisk === 0 ? "—" : `$${(kpi.amountAtRisk / 100).toLocaleString()}`}
             tone={kpi.amountAtRisk > 0 ? "warning" : "default"} />
        <Kpi label="Due ≤ 7d"
             value={kpi.evidenceDueSoon.toLocaleString()}
             tone={kpi.evidenceDueSoon > 0 ? "danger" : "default"} />
      </div>

      <Card padding="md">
        <DisputesFiltersBar
          tenants={filterOptions.tenants}
          statuses={DISPUTE_STATUSES}
        />
      </Card>

      {rows.length === 0 ? (
        <Card padding="lg">
          <EmptyState
            title={total === 0 ? "No disputes yet" : "No disputes match the current filters"}
            description={total === 0
              ? "Chargebacks raised by the gateway will appear here once the webhook ingestor lands. Until then, this list reflects admin-created records only."
              : "Try widening the date or status filters."}
          />
        </Card>
      ) : (
        <DisputesTable
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

function Kpi({
  label, value, sub, tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "good" | "warning" | "danger";
}) {
  const palette =
    tone === "good"   ? { borderColor: "var(--emerald-200)" } :
    tone === "warning" ? { borderColor: "var(--amber-200)" } :
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
        {sub && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{sub}</div>}
      </div>
    </Card>
  );
}

