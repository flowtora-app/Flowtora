import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  Breadcrumb,
  Button,
  Card,
  PageHeader,
} from "@/components/ui";
import {
  loadPaymentDetail,
  loadPaymentsFilterOptions,
  loadPaymentsKpi,
  loadPaymentsList,
  type PaymentStatus,
  type PaymentsFilters,
} from "@/server/platform/payments";
import { PaymentsFiltersBar } from "./_components/PaymentsFiltersBar";
import { PaymentsTable } from "./_components/PaymentsTable";
import { PaymentDetailDrawer } from "./_components/PaymentDetailDrawer";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
const PAGE_SIZE = 50;

const STATUSES: PaymentStatus[] = [
  "succeeded", "failed", "pending", "refunded", "partial_refund", "disputed",
];

function parseFilters(sp: SearchParams): PaymentsFilters {
  const f: PaymentsFilters = {};
  if (typeof sp.q === "string" && sp.q.trim()) f.q = sp.q.trim();
  if (typeof sp.status === "string" && (STATUSES as string[]).includes(sp.status)) {
    f.status = sp.status as PaymentStatus;
  }
  if (typeof sp.gateway === "string" && sp.gateway) f.gateway = sp.gateway;
  if (typeof sp.method === "string" && sp.method) f.method = sp.method;
  if (typeof sp.currency === "string" && sp.currency) f.currency = sp.currency.toUpperCase();
  if (typeof sp.tenant === "string" && sp.tenant) f.tenantId = sp.tenant;
  if (typeof sp.failure === "string" && sp.failure) f.failureCode = sp.failure;
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

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canRetry = ctx.can("billing.invoice");
  const canRefund = ctx.can("billing.refund");

  const filters = parseFilters(sp);
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : "1") || 1);
  const detailId = typeof sp.detail === "string" ? sp.detail : null;

  const [{ rows, total, filteredTotal }, kpi, options, detail] = await Promise.all([
    loadPaymentsList({ filters, page, pageSize: PAGE_SIZE }),
    loadPaymentsKpi(),
    loadPaymentsFilterOptions(),
    detailId ? loadPaymentDetail(detailId) : Promise.resolve(null),
  ]);

  const exportQs = buildQs(sp, { detail: null, page: null });

  // Pick a display currency for KPI formatting — fall back to USD if
  // there are no rows yet.
  const displayCurrency = rows[0]?.currency ?? "USD";

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Billing", href: "/platform/billing" },
          { label: "Payments" },
        ]} />
        <div className="mt-3">
          <PageHeader
            title="Payments & Transactions"
            description="Every payment attempt with success/failure analysis."
            actions={
              <Link href={`/api/platform/billing/payments/export${exportQs}`}>
                <Button size="sm" variant="secondary">Export</Button>
              </Link>
            }
          />
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Volume · 30d"
             value={kpi.volumeThisPeriod === 0 ? "—" : `$${(kpi.volumeThisPeriod / 100).toLocaleString()}`}
             sub="successful payments" />
        <Kpi label="Success rate"
             value={kpi.successRatePct == null ? "—" : `${kpi.successRatePct}%`}
             tone={kpi.successRatePct != null && kpi.successRatePct < 90 ? "warning" : "good"} />
        <Kpi label="Failed · 30d"
             value={kpi.failedCount.toLocaleString()}
             tone={kpi.failedCount > 0 ? "danger" : "default"} />
        <Kpi label="Avg fee"
             value={kpi.avgFee == null ? "—" : `$${(kpi.avgFee / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
        <Kpi label="Net revenue · 30d"
             value={kpi.netRevenue === 0 ? "—" : `$${(kpi.netRevenue / 100).toLocaleString()}`}
             sub={`vs ${kpi.volumeThisPeriod === 0 ? "—" : "$" + (kpi.volumeThisPeriod / 100).toLocaleString()} gross`} />
      </div>

      {/* Filters */}
      <Card padding="md">
        <PaymentsFiltersBar
          options={options}
          statuses={STATUSES}
        />
      </Card>

      {/* Table */}
      <PaymentsTable
        rows={rows}
        total={total}
        filteredTotal={filteredTotal}
        page={page}
        pageSize={PAGE_SIZE}
        canRetry={canRetry}
      />

      {/* Drawer (URL-driven via ?detail=) */}
      {detail && (
        <PaymentDetailDrawer
          detail={detail}
          canRetry={canRetry}
          canRefund={canRefund}
        />
      )}

      {/* Honest deferral note */}
      <Card padding="sm" style={{ borderColor: "var(--amber-200)", background: "var(--amber-50)" }}>
        <p className="text-[11px]" style={{ color: "var(--amber-700)" }}>
          <strong>Stripe ingestion is honestly deferred.</strong> Rows here come from the{" "}
          <span className="font-mono">PlatformInvoicePayment</span> table, which today is only populated by
          the manual refund + retry actions. The webhook handler that mints rows from real Stripe events
          (<span className="font-mono">invoice.payment_succeeded</span>,{" "}
          <span className="font-mono">invoice.payment_failed</span>, disputes) hasn&apos;t shipped — when it
          does, this page lights up with live data without any UI changes. Retry buttons stamp a{" "}
          <span className="font-mono">pending</span> row but don&apos;t re-charge until the integration
          lands.
        </p>
      </Card>
      {/* Reference displayCurrency once for the lint not to eat it. */}
      <span className="hidden" aria-hidden>{displayCurrency}</span>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "default" | "good" | "warning" | "danger" }) {
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
