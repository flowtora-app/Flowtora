import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { Icon } from "@/components/shell/icons";
import { fmtUsdCompact } from "@/lib/platform-format";
import { formatMoney } from "@/lib/billing-currency";
import { Sparkline } from "@/components/charts/Sparkline";

// /platform/billing — financial command center.
//
// Layout (top to bottom):
//   1. Header
//   2. Insight strip — auto-generated callouts driven by real data
//   3. MRR hero card — big number, 30d sparkline, period delta,
//      active subs callout, click-through to /platform/revenue
//   4. Financial vitals — ARR, Billed-30d, Failed-30d, Payment success
//   5. Operations row — Coupons / Dunning / Manual invoices tiles
//      with live counts
//   6. Activity panels — recent payments + recent manual invoices
//   7. Status notes — what's wired vs. still deferred

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

export default async function PlatformBillingHub() {
  await requirePlatformStaff();

  const now = new Date();
  const last30Start = new Date(now.getTime() - 30 * DAY);
  const last60Start = new Date(now.getTime() - 60 * DAY);

  const [
    activeByPlan,
    allPlans,
    paymentsLast30,
    paymentsPrior30,
    failedLast30,
    failedTotal30,
    activeCoupons,
    expiringCoupons,
    inDunning,
    pausedDunning,
    suspendedDunning,
    draftInvoices,
    sentInvoices,
    overdueInvoices,
    paidInvoices,
    overdueAR,
    recentPayments,
    recentManualInvoices,
  ] = await Promise.all([
    db.tenant.groupBy({
      by: ["plan"],
      where: { status: "ACTIVE" },
      _count: { _all: true },
    }),
    db.pricingPlan.findMany({
      where: { status: { in: ["PUBLISHED", "HIDDEN"] } },
      select: { slug: true, priceMonthly: true },
    }),
    db.payment.findMany({
      where: { voidedAt: null, failedAt: null, receivedAt: { gte: last30Start } },
      select: { receivedAt: true, amount: true },
    }),
    db.payment.aggregate({
      where: {
        voidedAt: null, failedAt: null,
        receivedAt: { gte: last60Start, lt: last30Start },
      },
      _sum: { amount: true },
    }),
    // Failed payment count in the last 30d
    db.payment.count({
      where: { failedAt: { gte: last30Start } },
    }),
    // All payments started in the last 30d (for success-rate denominator)
    db.payment.count({
      where: {
        OR: [
          { receivedAt: { gte: last30Start }, voidedAt: null },
          { failedAt:   { gte: last30Start } },
        ],
      },
    }),
    db.coupon.count({ where: { status: "ACTIVE" } }),
    db.coupon.count({
      where: {
        status: "ACTIVE",
        validUntil: { not: null, lt: new Date(now.getTime() + 30 * DAY) },
      },
    }),
    db.tenant.count({
      where: { dunningStage: { notIn: ["NONE", "RESOLVED"] }, dunningPausedAt: null },
    }),
    db.tenant.count({ where: { dunningPausedAt: { not: null } } }),
    db.tenant.count({ where: { dunningStage: "SUSPEND" } }),
    db.platformBillingInvoice.count({ where: { status: "DRAFT" } }),
    db.platformBillingInvoice.count({ where: { status: "SENT" } }),
    db.platformBillingInvoice.count({
      where: { status: "SENT", dueAt: { lt: now } },
    }),
    db.platformBillingInvoice.count({ where: { status: "PAID" } }),
    // AR open total (aggregate across SENT invoices in tenant default currency).
    db.platformBillingInvoice.aggregate({
      where: { status: "SENT" },
      _sum: { total: true, amountPaid: true },
    }),
    // Recent payments — last 5 successful payments across all tenants.
    // Customer name comes through the invoice → customer relation since
    // Payment has no direct customer FK.
    db.payment.findMany({
      where: { voidedAt: null, failedAt: null },
      orderBy: { receivedAt: "desc" },
      take: 5,
      select: {
        id: true, amount: true, receivedAt: true, method: true,
        tenant:  { select: { id: true, name: true, slug: true, currency: true } },
        invoice: { select: { customer: { select: { name: true } } } },
      },
    }),
    // Recent manual invoices — last 5 created
    db.platformBillingInvoice.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true, number: true, status: true, total: true, currency: true,
        createdAt: true, issuedAt: true, dueAt: true,
        tenant: { select: { id: true, name: true } },
      },
    }),
  ]);

  // ── MRR / ARR ──────────────────────────────────────────────────────
  const priceByEnum = new Map<string, number>();
  for (const p of allPlans) priceByEnum.set(p.slug.toUpperCase(), Number(p.priceMonthly ?? 0));
  let mrr = 0;
  let activeSubs = 0;
  for (const row of activeByPlan) {
    mrr += (priceByEnum.get(row.plan) ?? 0) * row._count._all;
    activeSubs += row._count._all;
  }
  const arr = mrr * 12;

  // ── Period-over-period billed-30d ────────────────────────────────
  const last30Total = paymentsLast30.reduce((sum, p) => sum + Number(p.amount), 0);
  const prior30Total = Number(paymentsPrior30._sum.amount ?? 0);
  const billedDeltaPct = prior30Total > 0
    ? ((last30Total - prior30Total) / prior30Total) * 100
    : last30Total > 0 ? 100 : 0;

  // ── 30d daily sparkline ──────────────────────────────────────────
  const sparkline: number[] = new Array(30).fill(0);
  const startMs = last30Start.getTime();
  for (const p of paymentsLast30) {
    const idx = Math.floor((p.receivedAt.getTime() - startMs) / DAY);
    if (idx >= 0 && idx < 30) sparkline[idx]! += Number(p.amount);
  }

  // ── Payment success rate (30d) ───────────────────────────────────
  const paymentsTotal30 = failedTotal30;
  const paymentSuccessPct = paymentsTotal30 > 0
    ? Math.round(((paymentsTotal30 - failedLast30) / paymentsTotal30) * 1000) / 10
    : null;

  // ── AR open (manual invoices, USD-equivalent) ─────────────────────
  const arOutstanding =
    Number(overdueAR._sum.total ?? 0) - Number(overdueAR._sum.amountPaid ?? 0);

  // ── Insights ──────────────────────────────────────────────────────
  const insights: { tone: "danger" | "warning" | "info"; text: string; href?: string }[] = [];
  if (suspendedDunning > 0) {
    insights.push({
      tone: "danger",
      text: `${suspendedDunning} tenant${suspendedDunning === 1 ? "" : "s"} auto-suspended at dunning final stage`,
      href: "/platform/billing/dunning",
    });
  }
  if (failedLast30 > 0 && paymentSuccessPct !== null && paymentSuccessPct < 95) {
    insights.push({
      tone: "danger",
      text: `${failedLast30} failed payments in the last 30 days (${paymentSuccessPct}% success rate)`,
      href: "/platform/billing/dunning",
    });
  }
  if (overdueInvoices > 0) {
    insights.push({
      tone: "warning",
      text: `${overdueInvoices} manual invoice${overdueInvoices === 1 ? " is" : "s are"} past due`,
      href: "/platform/billing/invoices?status=SENT",
    });
  }
  if (expiringCoupons > 0) {
    insights.push({
      tone: "info",
      text: `${expiringCoupons} coupon${expiringCoupons === 1 ? "" : "s"} expir${expiringCoupons === 1 ? "es" : "e"} in the next 30 days`,
      href: "/platform/billing/coupons",
    });
  }
  if (billedDeltaPct < -10) {
    insights.push({
      tone: "warning",
      text: `Billed revenue is down ${Math.abs(billedDeltaPct).toFixed(0)}% vs the prior 30 days`,
      href: "/platform/revenue",
    });
  }

  return (
    <div className="space-y-6">
      <Header />

      {insights.length > 0 && <InsightStrip items={insights} />}

      {/* ── Hero MRR card ─────────────────────────────────────────── */}
      <MrrHero
        mrr={mrr}
        arr={arr}
        activeSubs={activeSubs}
        billedLast30={last30Total}
        billedDeltaPct={billedDeltaPct}
        sparkline={sparkline}
      />

      {/* ── Financial vitals ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Vital
          label="Billed (30d)"
          value={fmtUsdCompact(last30Total)}
          hint={`${billedDeltaPct >= 0 ? "+" : ""}${billedDeltaPct.toFixed(0)}% vs prior 30d`}
          tone={billedDeltaPct < -10 ? "danger" : billedDeltaPct < 0 ? "warn" : billedDeltaPct > 10 ? "success" : "default"}
        />
        <Vital
          label="Payment success"
          value={paymentSuccessPct === null ? "—" : `${paymentSuccessPct}%`}
          hint={paymentsTotal30 === 0 ? "No payments yet (30d)" : `${paymentsTotal30} attempts`}
          tone={paymentSuccessPct !== null && paymentSuccessPct < 95 ? "warn" : paymentSuccessPct !== null && paymentSuccessPct >= 99 ? "success" : "default"}
        />
        <Vital
          label="Failed payments"
          value={String(failedLast30)}
          hint={failedLast30 === 0 ? "No failures (30d)" : "Last 30 days"}
          tone={failedLast30 > 0 ? "danger" : "success"}
        />
        <Vital
          label="A/R open"
          value={fmtUsdCompact(arOutstanding / 100)}
          hint={`${sentInvoices} sent · ${overdueInvoices} overdue`}
          tone={overdueInvoices > 0 ? "warn" : "default"}
        />
      </div>

      {/* ── Operations row ────────────────────────────────────────── */}
      <div>
        <SectionHeader title="Operations" />
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
          <OpsTile
            href="/platform/billing/coupons"
            icon="Sparkles"
            title="Coupons"
            description="Mint promo codes, apply to tenants, mirror to Stripe."
            stats={[
              { label: "Active", value: String(activeCoupons) },
              { label: "Expiring 30d", value: String(expiringCoupons), tone: expiringCoupons > 0 ? "warn" : "default" },
            ]}
          />
          <OpsTile
            href="/platform/billing/dunning"
            icon="Heartbeat"
            title="Dunning"
            description="Past-due tenants. Hourly cron auto-advances stages on the 24h / 48h / 96h / 168h SLA."
            stats={[
              { label: "Funnel", value: String(inDunning) },
              { label: "Paused", value: String(pausedDunning), tone: pausedDunning > 0 ? "warn" : "default" },
              { label: "Suspended", value: String(suspendedDunning), tone: suspendedDunning > 0 ? "danger" : "default" },
            ]}
          />
          <OpsTile
            href="/platform/billing/invoices"
            icon="FileText"
            title="Manual invoices"
            description="One-off invoices outside the Stripe subscription cycle."
            stats={[
              { label: "Drafts", value: String(draftInvoices) },
              { label: "Sent", value: String(sentInvoices) },
              { label: "Paid", value: String(paidInvoices) },
              { label: "Overdue", value: String(overdueInvoices), tone: overdueInvoices > 0 ? "danger" : "default" },
            ]}
          />
        </div>
      </div>

      {/* ── Activity panels ───────────────────────────────────────── */}
      <div>
        <SectionHeader title="Recent activity" />
        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <RecentPayments rows={recentPayments} />
          <RecentInvoices rows={recentManualInvoices} />
        </div>
      </div>

      <Notes />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

function Header() {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          <Icon.Revenue size={14} />
          <span>Phase 3 · Billing &amp; Revenue</span>
        </div>
        <h1 className="mt-1 text-[26px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
          Billing &amp; Revenue
        </h1>
        <p className="mt-1 max-w-3xl text-[13px]" style={{ color: "var(--text-muted)" }}>
          Recurring subscription revenue, coupon catalog, past-due dunning,
          and admin-issued one-off invoices. Stripe handles the
          subscription cycle; everything else lives here.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href="/platform/revenue"
          className="ts-focus inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium"
          style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}
        >
          <Icon.Reports size={14} /> Full revenue analytics
        </Link>
        <Link
          href="/platform/audit?action=platform.coupon_,platform.invoice_,platform.dunning_,platform.tenant_currency_changed"
          className="ts-focus inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-medium"
          style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)", background: "var(--surface-1)" }}
        >
          <Icon.FileText size={14} /> Audit log
        </Link>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

function InsightStrip({
  items,
}: {
  items: { tone: "danger" | "warning" | "info"; text: string; href?: string }[];
}) {
  return (
    <section
      className="rounded-lg border p-3"
      style={{
        background: "var(--surface-1)",
        borderColor: items.some((i) => i.tone === "danger") ? "var(--danger-fg)" : "var(--warning-fg)",
      }}
    >
      <ul className="flex flex-col gap-1 text-[12px]">
        {items.map((it, i) => {
          const fg =
            it.tone === "danger"  ? "var(--danger-fg)" :
            it.tone === "warning" ? "var(--warning-fg)" :
                                    "var(--accent-primary)";
          const dot =
            it.tone === "danger"  ? "●" :
            it.tone === "warning" ? "▲" :
                                    "◆";
          const className = it.href
            ? "ts-focus flex items-center gap-2 hover:underline"
            : "flex items-center gap-2";
          return (
            <li key={i}>
              {it.href ? (
                <Link href={it.href} className={className} style={{ color: fg }}>
                  <span aria-hidden>{dot}</span>
                  <span>{it.text}</span>
                  <span aria-hidden className="ml-auto opacity-60">→</span>
                </Link>
              ) : (
                <div className={className} style={{ color: fg }}>
                  <span aria-hidden>{dot}</span>
                  <span>{it.text}</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────── */

function MrrHero({
  mrr,
  arr,
  activeSubs,
  billedLast30,
  billedDeltaPct,
  sparkline,
}: {
  mrr: number;
  arr: number;
  activeSubs: number;
  billedLast30: number;
  billedDeltaPct: number;
  sparkline: number[];
}) {
  const deltaTone =
    billedDeltaPct < -10 ? "var(--danger-fg)"  :
    billedDeltaPct <  0  ? "var(--warning-fg)" :
    billedDeltaPct > 10  ? "var(--success-fg)" :
                           "var(--text-muted)";
  return (
    <Link
      href="/platform/revenue"
      className="ts-focus block rounded-2xl border p-6 transition-shadow hover:shadow-md"
      style={{
        background: "var(--surface-1)",
        borderColor: "var(--border-subtle)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        {/* Left column: MRR + ARR + active subs */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            <span>Monthly recurring revenue</span>
            <span className="opacity-50">·</span>
            <span>Click for full analytics</span>
          </div>
          <div className="flex items-baseline gap-3">
            <div className="text-[44px] font-semibold tracking-tight leading-none" style={{ color: "var(--text-default)" }}>
              {fmtUsdCompact(mrr)}
            </div>
            <div className="text-[14px]" style={{ color: "var(--text-muted)" }}>
              {fmtUsdCompact(arr)} ARR · {activeSubs} active subscription{activeSubs === 1 ? "" : "s"}
            </div>
          </div>
          <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            <span style={{ color: "var(--text-default)" }}>{fmtUsdCompact(billedLast30)}</span>
            {" billed in the last 30 days · "}
            <span style={{ color: deltaTone, fontWeight: 600 }}>
              {billedDeltaPct >= 0 ? "+" : ""}{billedDeltaPct.toFixed(1)}%
            </span>
            {" vs prior 30d"}
          </div>
        </div>

        {/* Right column: sparkline */}
        <div className="flex flex-col">
          <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            30-day daily revenue
          </div>
          <div className="mt-2 flex-1">
            <Sparkline
              data={sparkline}
              color="var(--accent-primary)"
              height={64}
              strokeWidth={2}
              aria-label="30-day daily payment volume"
            />
          </div>
        </div>
      </div>
    </Link>
  );
}

/* ────────────────────────────────────────────────────────────── */

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
      {title}
    </h2>
  );
}

function Vital({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warn" | "danger" | "success";
}) {
  const color =
    tone === "danger"  ? "var(--danger-fg)" :
    tone === "warn"    ? "var(--warning-fg)" :
    tone === "success" ? "var(--success-fg)" :
                         "var(--text-default)";
  const border =
    tone === "danger"  ? "var(--danger-fg)" :
    tone === "warn"    ? "var(--warning-fg)" :
                         "var(--border-subtle)";
  return (
    <div
      className="rounded-lg border px-4 py-3"
      style={{ background: "var(--surface-1)", borderColor: border }}
    >
      <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="mt-1 text-[24px] font-semibold tabular-nums leading-none" style={{ color }}>
        {value}
      </div>
      {hint && <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>{hint}</div>}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

function OpsTile({
  href,
  icon,
  title,
  description,
  stats,
}: {
  href: string;
  icon: keyof typeof Icon;
  title: string;
  description: string;
  stats: { label: string; value: string; tone?: "default" | "warn" | "danger" }[];
}) {
  const IconCmp = Icon[icon];
  return (
    <Link
      href={href}
      className="ts-focus block rounded-xl border p-5 transition-colors hover:bg-[var(--surface-2)]"
      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
    >
      <div className="flex items-center gap-2">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-md"
          style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}
        >
          <IconCmp size={16} />
        </span>
        <div className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          {title}
        </div>
        <span className="ml-auto text-[12px]" style={{ color: "var(--text-muted)" }}>→</span>
      </div>
      <p className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
        {description}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-md px-2.5 py-1.5"
            style={{
              background:
                s.tone === "danger" ? "var(--danger-surface)" :
                s.tone === "warn"   ? "var(--warning-surface)" :
                "var(--surface-2)",
            }}
          >
            <div className="text-[9px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              {s.label}
            </div>
            <div
              className="text-[15px] font-semibold tabular-nums leading-none"
              style={{
                color:
                  s.tone === "danger" ? "var(--danger-fg)" :
                  s.tone === "warn"   ? "var(--warning-fg)" :
                  "var(--text-default)",
              }}
            >
              {s.value}
            </div>
          </div>
        ))}
      </div>
    </Link>
  );
}

/* ────────────────────────────────────────────────────────────── */

function RecentPayments({
  rows,
}: {
  rows: {
    id: string;
    amount: number | { toString: () => string };
    receivedAt: Date | null;
    method: string;
    tenant:  { id: string; name: string; slug: string; currency: string };
    invoice: { customer: { name: string } | null } | null;
  }[];
}) {
  return (
    <section className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>
          Recent payments
        </h3>
        <Link
          href="/platform/revenue"
          className="ts-focus text-[11px] underline"
          style={{ color: "var(--text-muted)" }}
        >
          See all →
        </Link>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
          No payments yet.
        </div>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
          {rows.map((p) => (
            <li key={p.id} className="px-4 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <Link
                  href={`/platform/tenants/${p.tenant.id}`}
                  className="ts-focus min-w-0 flex-1 truncate text-[13px] font-medium hover:underline"
                  style={{ color: "var(--text-default)" }}
                >
                  {p.tenant.name}
                </Link>
                <span className="text-[13px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>
                  {formatMoney(Math.round(Number(p.amount) * 100), p.tenant.currency)}
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
                <span className="truncate">
                  {p.invoice?.customer?.name ? `${p.invoice.customer.name} · ` : ""}{p.method.replace(/_/g, " ").toLowerCase()}
                </span>
                <span>{p.receivedAt ? formatRelative(p.receivedAt) : "—"}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentInvoices({
  rows,
}: {
  rows: {
    id: string;
    number: string;
    status: string;
    total: number;
    currency: string;
    createdAt: Date;
    issuedAt: Date | null;
    dueAt: Date | null;
    tenant: { id: string; name: string };
  }[];
}) {
  return (
    <section className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>
          Recent manual invoices
        </h3>
        <Link
          href="/platform/billing/invoices"
          className="ts-focus text-[11px] underline"
          style={{ color: "var(--text-muted)" }}
        >
          See all →
        </Link>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
          No manual invoices yet.
        </div>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
          {rows.map((inv) => {
            const overdue = inv.status === "SENT" && inv.dueAt && inv.dueAt < new Date();
            const statusPalette =
              overdue                  ? { bg: "var(--danger-surface)", fg: "var(--danger-fg)",      label: "OVERDUE" } :
              inv.status === "PAID"    ? { bg: "var(--success-surface)", fg: "var(--success-fg)",    label: "PAID" } :
              inv.status === "SENT"    ? { bg: "var(--accent-surface)", fg: "var(--accent-primary)", label: "SENT" } :
              inv.status === "VOIDED"  ? { bg: "var(--surface-2)",      fg: "var(--text-muted)",     label: "VOIDED" } :
                                         { bg: "var(--surface-2)",      fg: "var(--text-muted)",     label: inv.status };
            return (
              <li key={inv.id} className="px-4 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="font-mono text-[12px]" style={{ color: "var(--text-muted)" }}>
                      {inv.number}
                    </span>
                    <Link
                      href={`/platform/tenants/${inv.tenant.id}`}
                      className="ts-focus min-w-0 truncate text-[13px] font-medium hover:underline"
                      style={{ color: "var(--text-default)" }}
                    >
                      {inv.tenant.name}
                    </Link>
                  </div>
                  <span className="text-[13px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>
                    {formatMoney(inv.total, inv.currency)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  <span
                    className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                    style={{ background: statusPalette.bg, color: statusPalette.fg }}
                  >
                    {statusPalette.label}
                  </span>
                  <span>
                    {inv.status === "PAID" && inv.issuedAt ? `paid · issued ${formatRelative(inv.issuedAt)}` :
                     inv.status === "SENT" && inv.issuedAt ? `sent ${formatRelative(inv.issuedAt)}` :
                     `created ${formatRelative(inv.createdAt)}`}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ────────────────────────────────────────────────────────────── */

function Notes() {
  return (
    <section className="rounded-lg border p-4 text-[11px]" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="font-semibold uppercase tracking-wide" style={{ color: "var(--text-default)" }}>Wired up</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Stripe coupon mirroring — sync to Stripe on create/reactivate.</li>
            <li>Hourly dunning cron — 24h / 48h / 96h / 168h SLA.</li>
            <li>Auto-suspend at dunning final stage.</li>
            <li>Multi-currency on tenants + invoices (12 currencies).</li>
          </ul>
        </div>
        <div>
          <div className="font-semibold uppercase tracking-wide" style={{ color: "var(--text-default)" }}>Still deferred</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Dunning email fan-out per stage (notification templates).</li>
            <li>Real-time FX (currently a static rate table).</li>
            <li>PayPal / Square checkout.</li>
            <li>Accounting sync (QuickBooks / Xero).</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────── */

function formatRelative(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = 60_000, hour = 60 * min, day = 24 * hour;
  if (ms < min)        return "just now";
  if (ms < hour)       return `${Math.floor(ms / min)}m ago`;
  if (ms < day)        return `${Math.floor(ms / hour)}h ago`;
  if (ms < 30 * day)   return `${Math.floor(ms / day)}d ago`;
  return d.toLocaleDateString();
}
