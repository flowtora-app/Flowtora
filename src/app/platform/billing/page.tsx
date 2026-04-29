import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { Icon } from "@/components/shell/icons";

// /platform/billing — hub for the three Phase 3 surfaces (coupons,
// dunning, manual invoices). Three big tiles + at-a-glance counts so
// staff know which surface needs attention before they click in.

export const dynamic = "force-dynamic";

export default async function PlatformBillingHub() {
  await requirePlatformStaff();

  const [
    activeCoupons,
    expiringCoupons,
    inDunning,
    paused,
    suspended,
    draftInvoices,
    sentInvoices,
    overdueInvoices,
  ] = await Promise.all([
    db.coupon.count({ where: { status: "ACTIVE" } }),
    db.coupon.count({
      where: {
        status: "ACTIVE",
        validUntil: { not: null, lt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
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
      where: { status: "SENT", dueAt: { lt: new Date() } },
    }),
  ]);

  const tiles: Tile[] = [
    {
      href: "/platform/billing/coupons",
      icon: "Sparkles",
      title: "Coupons",
      description: "Mint promo codes, apply discounts to specific tenants, and track redemption.",
      stats: [
        { label: "Active",         value: String(activeCoupons) },
        { label: "Expiring 30d",   value: String(expiringCoupons), tone: expiringCoupons > 0 ? "warn" : "default" },
      ],
    },
    {
      href: "/platform/billing/dunning",
      icon: "Heartbeat",
      title: "Dunning",
      description: "Tenants past due — manual stage advance, pause, resolve, or auto-suspend.",
      stats: [
        { label: "In funnel",  value: String(inDunning) },
        { label: "Paused",     value: String(paused), tone: paused > 0 ? "warn" : "default" },
        { label: "Suspended",  value: String(suspended), tone: suspended > 0 ? "danger" : "default" },
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
      <div>
        <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          <Icon.Revenue size={14} />
          <span>Phase 3 · Billing</span>
        </div>
        <h1 className="mt-1 text-[26px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
          Billing operations
        </h1>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
          Coupons, dunning, and admin-issued invoices. Recurring subscription
          billing still flows through Stripe — see <Link href="/platform/revenue" className="underline">Revenue</Link> for analytics.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {tiles.map((t) => (
          <TileCard key={t.href} tile={t} />
        ))}
      </div>

      <Notes />
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
      <div className="font-semibold" style={{ color: "var(--text-default)" }}>Out of scope (follow-ups)</div>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        <li>Stripe coupon mirroring — coupons apply to manual invoices today; the Stripe subscription cycle ignores them.</li>
        <li>Automated dunning cron — stage advance is manual; an operator clicks through.</li>
        <li>Real-time FX — analytics conversion uses a static rate table updated by hand.</li>
        <li>PayPal / Square checkout, accounting sync (QuickBooks / Xero).</li>
      </ul>
    </section>
  );
}
