import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import {
  Avatar,
  Breadcrumb,
  Button,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  Tabs,
} from "@/components/ui";
import { loadSubscriptionDetail } from "@/server/platform/subscriptions";
import { ChangePlanCard } from "./_components/ChangePlanCard";
import { CouponCard } from "./_components/CouponCard";
import { CancelCard } from "./_components/CancelCard";
import { OneOffChargeCard } from "./_components/OneOffChargeCard";
import { PaymentPortalLinkButton } from "./_components/PaymentPortalLinkButton";

export const dynamic = "force-dynamic";

type SearchParams = { tab?: string };
const TABS = ["overview", "items", "discounts", "invoices", "usage", "activity", "settings"] as const;
type Tab = (typeof TABS)[number];

const STATUS_LABEL: Record<string, string> = {
  active: "Active", trialing: "Trialing", past_due: "Past due",
  canceled: "Canceled", paused: "Paused", incomplete: "Incomplete",
};

export default async function SubscriptionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requirePlatformStaff();
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "")
    ? (sp.tab as Tab) : "overview";

  const detail = await loadSubscriptionDetail(id);
  if (!detail) notFound();

  const canEdit = ctx.can("billing.plan_change");
  const canCoupon = ctx.can("billing.coupon");
  const canInvoice = ctx.can("billing.invoice");

  const tabHref = (id2: Tab) =>
    `/platform/billing/subscriptions/${id}${id2 === "overview" ? "" : `?tab=${id2}`}`;

  // Plan + coupon options for the action cards.
  const [plans, coupons] = await Promise.all([
    db.pricingPlan.findMany({
      where: { status: { not: "ARCHIVED" } },
      orderBy: { sortOrder: "asc" },
      select: { slug: true, name: true, priceMonthly: true, priceAnnual: true },
    }),
    db.coupon.findMany({
      where: { status: "ACTIVE" },
      orderBy: { code: "asc" },
      select: { id: true, code: true, discountType: true, amount: true, currency: true },
    }),
  ]);

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Billing" },
          { label: "Subscriptions", href: "/platform/billing/subscriptions" },
          { label: detail.tenantName },
        ]} />
        <div className="mt-3">
          <PageHeader
            title={
              <span className="flex items-center gap-2">
                <Avatar size="sm" name={detail.tenantName} src={detail.logoUrl ?? undefined} />
                <span>{detail.tenantName}</span>
                <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{
                        background: detail.status === "active" ? "var(--emerald-50)"
                                : detail.status === "past_due" ? "var(--rose-50)"
                                : detail.status === "trialing" ? "var(--amber-50)"
                                : detail.status === "paused" ? "var(--accent-surface)"
                                : "var(--surface-2)",
                        color: detail.status === "active" ? "var(--emerald-700)"
                            : detail.status === "past_due" ? "var(--rose-700)"
                            : detail.status === "trialing" ? "var(--amber-700)"
                            : detail.status === "paused" ? "var(--accent-primary)"
                            : "var(--text-muted)",
                      }}>
                  {STATUS_LABEL[detail.status]}
                </span>
              </span>
            }
            description={`${detail.planName} · ${detail.cycle.toLowerCase()} · ${detail.mrr === 0 ? "no MRR" : `$${detail.mrr}/mo`}`}
            actions={
              <>
                <Link href={`/platform/tenants/${detail.tenantId}`}>
                  <Button size="sm" variant="secondary">Open tenant</Button>
                </Link>
                <PaymentPortalLinkButton tenantId={detail.tenantId} />
              </>
            }
          />
        </div>
      </div>

      <Tabs
        variant="pill"
        activeHref={tabHref(tab)}
        items={(TABS as readonly Tab[]).map((id2) => ({
          label: id2 === "overview" ? "Overview"
              : id2 === "items" ? "Items"
              : id2 === "discounts" ? "Discounts & credits"
              : id2 === "invoices" ? "Invoices"
              : id2 === "usage" ? "Usage"
              : id2 === "activity" ? "Activity"
              : "Settings",
          href: tabHref(id2),
        }))}
      />

      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Card>
            <CardHeader title="Current state" />
            <CardBody>
              <dl className="grid grid-cols-[160px_1fr] gap-y-1.5 text-[12px]">
                <Row label="Plan" value={`${detail.planName} (${detail.plan})`} />
                <Row label="Cycle" value={detail.cycle.toLowerCase()} />
                <Row label="MRR" value={detail.mrr === 0 ? "—" : `$${detail.mrr.toLocaleString()} / mo`} />
                <Row label="Currency" value={detail.currency} />
                <Row label="Started" value={detail.startedAt.toLocaleString()} />
                {detail.trialEndsAt && (
                  <Row label="Trial ends" value={detail.trialEndsAt.toLocaleString()} />
                )}
                {detail.currentPeriodEnd && (
                  <Row label="Period ends" value={detail.currentPeriodEnd.toLocaleString()} />
                )}
                {detail.pausedUntil && (
                  <Row label="Paused until" value={detail.pausedUntil.toLocaleString()} />
                )}
                {detail.stripeSubscriptionId && (
                  <Row label="Stripe sub" value={
                    <span className="font-mono text-[10px]">{detail.stripeSubscriptionId}</span>
                  } />
                )}
                {detail.stripeCustomerId && (
                  <Row label="Stripe cust" value={
                    <a href={`https://dashboard.stripe.com/customers/${detail.stripeCustomerId}`}
                       target="_blank" rel="noopener noreferrer"
                       className="font-mono text-[10px] hover:underline"
                       style={{ color: "var(--accent-primary)" }}>
                      {detail.stripeCustomerId}
                    </a>
                  } />
                )}
                <Row label="Owner" value={detail.ownerEmail ?? "—"} />
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Scheduled changes" />
            <CardBody>
              <dl className="grid grid-cols-[160px_1fr] gap-y-1.5 text-[12px]">
                <Row label="Cancel at period end" value={detail.cancelAtPeriodEnd ? "yes" : "no"} />
                {detail.cancelScheduledFor && (
                  <Row label="Cancel scheduled for" value={detail.cancelScheduledFor.toLocaleString()} />
                )}
                {detail.cancelReason && (
                  <Row label="Cancel reason" value={detail.cancelReason} />
                )}
              </dl>
              {!detail.cancelAtPeriodEnd && !detail.cancelScheduledFor && (
                <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                  No cancellation scheduled.
                </p>
              )}
            </CardBody>
          </Card>

          {canEdit && (
            <ChangePlanCard
              tenantId={detail.tenantId}
              currentPlan={detail.tenantPlanCode}
              currentCycle={detail.cycle}
              plans={plans.map((p) => ({
                slug: p.slug.toUpperCase(),
                name: p.name,
                priceMonthly: Number(p.priceMonthly ?? 0),
                priceAnnual: Number(p.priceAnnual ?? 0),
              }))}
            />
          )}

          {canEdit && (
            <CancelCard
              tenantId={detail.tenantId}
              status={detail.status}
            />
          )}
        </div>
      )}

      {tab === "items" && (
        <Card>
          <CardHeader title="Line items" description="Plan + add-ons + metered components." />
          <CardBody>
            <dl className="grid grid-cols-[200px_1fr] gap-y-1.5 text-[12px]">
              <Row label={`${detail.planName} (${detail.cycle.toLowerCase()})`}
                   value={detail.mrr === 0 ? "—" : `$${detail.mrr}/mo`} />
              {detail.coupon && (
                <Row label={`Coupon · ${detail.coupon.code}`}
                     value={detail.coupon.discountType === "PERCENT"
                       ? `-${detail.coupon.amount}%`
                       : `-$${(detail.coupon.amount / 100).toFixed(2)}`} />
              )}
            </dl>
            <p className="mt-2 text-[11px]" style={{ color: "var(--text-faint)" }}>
              Add-on line items + metered usage are honestly deferred — neither is wired through to the
              billing pipeline yet. The numbers above are derived from the active plan + coupon.
            </p>
          </CardBody>
        </Card>
      )}

      {tab === "discounts" && canCoupon && (
        <CouponCard
          tenantId={detail.tenantId}
          currentCouponId={detail.coupon?.id ?? null}
          coupons={coupons.map((c) => ({
            id: c.id,
            label: c.discountType === "PERCENT"
              ? `${c.code} (${c.amount}% off)`
              : `${c.code} ($${(c.amount / 100).toFixed(2)} off ${c.currency ?? "USD"})`,
          }))}
        />
      )}

      {tab === "discounts" && !canCoupon && (
        <Card padding="md">
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Your role can&apos;t apply coupons.
          </p>
        </Card>
      )}

      {tab === "invoices" && (
        <Card>
          <CardHeader title="Invoices"
                      description="Last 12 platform-billing invoices for this tenant."
                      right={canInvoice
                        ? <OneOffChargeCard tenantId={detail.tenantId} currency={detail.currency} />
                        : null} />
          <CardBody>
            {detail.invoices.length === 0 ? (
              <div className="rounded-md border border-dashed py-8 text-center text-[12px]"
                   style={{ borderColor: "var(--border-subtle)", color: "var(--text-faint)" }}>
                No invoices yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead style={{ background: "var(--surface-2)" }}>
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Number</th>
                      <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Status</th>
                      <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Total</th>
                      <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Issued</th>
                      <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Due</th>
                      <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.invoices.map((inv) => (
                      <tr key={inv.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                        <td className="px-3 py-2 font-mono" style={{ color: "var(--text-default)" }}>{inv.number}</td>
                        <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{inv.status.toLowerCase()}</td>
                        <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                          {(inv.total / 100).toLocaleString(undefined, { style: "currency", currency: inv.currency })}
                        </td>
                        <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                          {inv.issuedAt?.toLocaleDateString() ?? "—"}
                        </td>
                        <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                          {inv.dueAt?.toLocaleDateString() ?? "—"}
                        </td>
                        <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                          {inv.paidAt?.toLocaleDateString() ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {tab === "usage" && (
        <Card padding="md">
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Metered usage tracking isn&apos;t wired through the billing pipeline yet — no usage rows to display.
            When metered components ship (e.g. quote-volume tier, storage), this tab renders the per-meter
            counter + month-to-date charge.
          </p>
        </Card>
      )}

      {tab === "activity" && (
        <Card>
          <CardHeader title="Subscription events"
                      description="MRR-movement timeline derived from SubscriptionEvent rows." />
          <CardBody>
            {detail.events.length === 0 ? (
              <div className="rounded-md border border-dashed py-8 text-center text-[12px]"
                   style={{ borderColor: "var(--border-subtle)", color: "var(--text-faint)" }}>
                No events yet.
              </div>
            ) : (
              <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                {detail.events.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-3 py-2 text-[12px]">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
                              style={{
                                background: e.mrrDelta >= 0 ? "var(--emerald-50)" : "var(--rose-50)",
                                color: e.mrrDelta >= 0 ? "var(--emerald-700)" : "var(--rose-700)",
                              }}>
                          {e.type.toLowerCase()}
                        </span>
                        <span style={{ color: "var(--text-default)" }}>
                          {e.fromPlan ?? "—"} → {e.toPlan ?? "—"}
                        </span>
                        <span className="ml-auto tabular-nums"
                              style={{ color: e.mrrDelta >= 0 ? "var(--emerald-700)" : "var(--rose-700)" }}>
                          {e.mrrDelta >= 0 ? "+" : ""}${e.mrrDelta.toFixed(0)} MRR
                        </span>
                      </div>
                      {e.reason && (
                        <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{e.reason}</div>
                      )}
                      <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                        {e.occurredAt.toLocaleString()} · {e.source.toLowerCase()}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      {tab === "settings" && (
        <Card>
          <CardHeader title="Settings"
                      description="Billing anchor + tax behaviour are inherited from the workspace settings." />
          <CardBody>
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              Cancellation policy + billing anchor day + tax behaviour live on the tenant's workspace
              settings page (and on the corresponding Stripe-side subscription). Surface them here when the
              workspace API exposes them; today we link out:
            </p>
            <p className="mt-2 text-[12px]">
              <Link href={`/platform/tenants/${detail.tenantId}#billing`}
                    className="hover:underline"
                    style={{ color: "var(--accent-primary)" }}>
                Open billing settings on tenant detail →
              </Link>
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt style={{ color: "var(--text-muted)" }}>{label}</dt>
      <dd style={{ color: "var(--text-default)" }}>{value}</dd>
    </>
  );
}
