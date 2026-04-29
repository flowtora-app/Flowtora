import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { Icon } from "@/components/shell/icons";
import { fmtUsdCompact } from "@/lib/platform-format";

// /platform/billing — hub for the four billing surfaces:
// recurring revenue analytics, coupons, dunning funnel, and admin-
// issued (manual) invoices. Headline KPIs at the top, four tiles in
// a 2x2 grid below, deferred-work notes at the bottom.

export const dynamic = "force-dynamic";

export default async function PlatformBillingHub() {
  await requirePlatformStaff();

  const day = 86_400_000;
  const now = new Date();
  const last30Days = new Date(now.getTime() - 30 * day);
  const last30Days_60 = new Date(now.getTime() - 60 * day);

  const [
    activeCoupons,
    expiringCoupons,
    inDunning,
    paused,
    suspended,
    draftInvoices,
    sentInvoices,
    overdueInvoices,
    activeByPlan,
    allPlans,
    paymentsLast30,
    paymentsPrior30,
    activePlatformInvoiceTotal,
  ] = await Promise.all([
    db.coupon.count({ where: { status: "ACTIVE" } }),
    db.coupon.count({
      where: {
        status: "ACTIVE",
        validUntil: { not: null, lt: new Date(Date.now() + 30 * day) },
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
    db.tenant.groupBy({
      by: ["plan"],
      where: { status: "ACTIVE" },
      _count: { _all: true },
    }),
    db.pricingPlan.findMany({
      where: { status: { in: ["PUBLISHED", "HIDDEN"] } },
      select: { slug: true, priceMonthly: true },
    }),
    db.payment.aggregate({
      where: { voidedAt: null, failedAt: null, receivedAt: { gte: last30Days } },
      _sum: { amount: true },
    }),
    db.payment.aggregate({
      where: {
        voidedAt: null, failedAt: null,
        receivedAt: { gte: last30Days_60, lt: last30Days },
      },
      _sum: { amount: true },
    }),
    db.platformBillingInvoice.aggregate({
      where: { status: { in: ["SENT", "PAID"] } },
      _sum: { total: true },
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

  // ── Period-over-period ───────────────────────────────────────────
  const last30Total = Number(paymentsLast30._sum.amount ?? 0);
  const prior30Total = Number(paymentsPrior30._sum.amount ?? 0);
  const last30Delta = prior30Total > 0
    ? ((last30Total - prior30Total) / prior30Total) * 100
    : last30Total > 0 ? 100 : 0;

  const platformInvoiceTotal = activePlatformInvoiceTotal._sum.total ?? 0;

  const tiles: Tile[] = [
    {
      href: "/platform/revenue",
      icon: "Revenue",
      title: "Revenue analytics",
      description: "MRR, ARR, plan mix, period-over-period trends, top tenants, failed payments.",
      stats: [
        { label: "30-day", value: fmtUsdCompact(last30Total) },
        { label: "Δ vs prior", value: `${last30Delta >= 0 ? "+" : ""}${last30Delta.toFixed(0)}%`, tone: last30Delta < 0 ? "danger" : "default" },
      ],
    },
    {
      href: "/platform/billing/coupons",
      icon: "Sparkles",
      title: "Coupons",
      description: "Mint promo codes, apply discounts to tenants, mirror to Stripe for subscription discounts.",
      stats: [
        { label: "Active",       value: String(activeCoupons) },
        { label: "Expiring 30d", value: String(expiringCoupons), tone: expiringCoupons > 0 ? "warn" : "default" },
      ],
    },
    {
      href: "/platform/billing/dunning",
      icon: "Heartbeat",
      title: "Dunning",
      description: "Past-due tenants. Auto-advance via hourly cron + manual override; auto-suspend at the final stage.",
      stats: [
        { label: "In funnel", value: String(inDunning) },
        { label: "Paused",    value: String(paused),    tone: paused > 0 ? "warn" : "default" },
        { label: "Suspended", value: String(suspended), tone: suspended > 0 ? "danger" : "default" },
      ],
    },
    {
      href: "/platform/billing/invoices",
      icon: "FileText",
      title: "Manual invoices",
      description: "One-off invoices outside the Stripe subscription cycle (custom terms, setup fees).",
      stats: [
        { label: "Drafts",  value: String(draftInvoices) },
        { label: "Sent",    value: String(sentInvoices) },
        { label: "Overdue", value: String(overdueInvoices), tone: overdueInvoices > 0 ? "danger" : "default" },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <Header />

      {/* Headline KPI band — the bird's-eye view that lets ops staff
          decide which surface needs attention before they click in. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi
          label="MRR"
          value={fmtUsdCompact(mrr)}
          hint={`${activeSubs} active subscriptions`}
          tone="accent"
        />
        <Kpi
          label="ARR"
          value={fmtUsdCompact(arr)}
          hint="Run-rate (MRR × 12)"
        />
        <Kpi
          label="Billed (30d)"
          value={fmtUsdCompact(last30Total)}
          hint={`${last30Delta >= 0 ? "+" : ""}${last30Delta.toFixed(0)}% vs prior 30d`}
          tone={last30Delta < -10 ? "danger" : last30Delta < 0 ? "warn" : "default"}
        />
        <Kpi
          label="Manual invoices"
          value={fmtUsdCompact(platformInvoiceTotal / 100)}
          hint={`${sentInvoices} sent · ${draftInvoices} drafts`}
        />
        <Kpi
          label="Active coupons"
          value={String(activeCoupons)}
          hint={expiringCoupons > 0 ? `${expiringCoupons} expiring 30d` : "No expirations soon"}
          tone={expiringCoupons > 0 ? "warn" : "default"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {tiles.map((t) => (
          <TileCard key={t.href} tile={t} />
        ))}
      </div>

      <Notes />
    </div>
  );
}

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
      <Link
        href="/platform/audit?action=platform.coupon_,platform.invoice_,platform.dunning_,platform.tenant_currency_changed"
        className="ts-focus inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-medium"
        style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)", background: "var(--surface-1)" }}
      >
        <Icon.FileText size={14} /> Audit log
      </Link>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "accent" | "warn" | "danger";
}) {
  const color =
    tone === "danger" ? "var(--danger-fg)" :
    tone === "warn"   ? "var(--warning-fg)" :
    tone === "accent" ? "var(--accent-primary)" :
                        "var(--text-default)";
  const border =
    tone === "danger" ? "var(--danger-fg)" :
    tone === "warn"   ? "var(--warning-fg)" :
    tone === "accent" ? "var(--accent-primary)" :
                        "var(--border-subtle)";
  return (
    <div className="rounded-lg border px-4 py-3" style={{ background: "var(--surface-1)", borderColor: border }}>
      <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="mt-1 text-[22px] font-semibold leading-none" style={{ color }}>{value}</div>
      {hint && <div className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>{hint}</div>}
    </div>
  );
}

type Tile = {
  href: string;
  icon: keyof typeof Icon;
  title: string;
  description: string;
  stats: { label: string; value: string; tone?: "default" | "warn" | "danger" }[];
};

function TileCard({ tile }: { tile: Tile }) {
  const IconCmp = Icon[tile.icon];
  return (
    <Link
      href={tile.href}
      className="ts-focus block rounded-lg border p-5 transition-colors hover:bg-[var(--surface-2)]"
      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
    >
      <div className="flex items-center gap-2">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-md"
          style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}
        >
          <IconCmp size={16} />
        </span>
        <div className="text-[15px] font-semibold" style={{ color: "var(--text-default)" }}>
          {tile.title}
        </div>
      </div>
      <p className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
        {tile.description}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        {tile.stats.map((s) => (
          <div
            key={s.label}
            className="rounded-md border px-3 py-2"
            style={{
              background: "var(--surface-2)",
              borderColor:
                s.tone === "danger" ? "var(--danger-fg)" :
                s.tone === "warn"   ? "var(--warning-fg)" :
                "var(--border-subtle)",
            }}
          >
            <div className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              {s.label}
            </div>
            <div
              className="text-[18px] font-semibold leading-none"
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

function Notes() {
  return (
    <section className="rounded-lg border p-4 text-[12px]" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
      <div className="font-semibold" style={{ color: "var(--text-default)" }}>Wired up</div>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        <li>Stripe coupon mirroring — coupons sync to Stripe on create/reactivate; the subscription cycle picks them up automatically. ★ Stripe chip on the coupons row indicates synced rows.</li>
        <li>Automated dunning cron — runs hourly, advances stages on the 24h / 48h / 96h / 168h SLA. Operator can still pause/resume/resolve manually.</li>
        <li>Auto-suspend on dunning final stage — flips Tenant.status to SUSPENDED with a recorded reason; resolve lifts it.</li>
        <li>Multi-currency on tenants + invoices — 12 supported currencies, locked at issuance time.</li>
      </ul>
      <div className="mt-3 font-semibold" style={{ color: "var(--text-default)" }}>Still deferred</div>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        <li>Dunning email fan-out — stage advance audits a row but does not send a customer email yet (notification templates need to be registered for platform-side dunning).</li>
        <li>Real-time FX — analytics conversion uses a static rate table updated by hand.</li>
        <li>PayPal / Square checkout, accounting sync (QuickBooks / Xero).</li>
      </ul>
    </section>
  );
}
