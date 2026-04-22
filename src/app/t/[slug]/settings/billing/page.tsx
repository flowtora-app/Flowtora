import { requirePermission } from "@/lib/tenant";
import {
  startCheckout,
  openBillingPortal,
  cancelSubscriptionAtPeriodEnd,
  resumeSubscription,
  reconcileTenantFromStripe,
} from "@/app/actions/billing";
import { Button } from "@/components/Field";
import { Card, CardHeader } from "@/components/Card";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { getPublishedPlans } from "@/lib/plans";
import type Stripe from "stripe";
import type { Plan } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────
// Subscription settings page.
//
// Post-M6 this page is DB-first with a live Stripe fetch for authoritative
// billing details (status, period end, payment method, invoices) plus a
// self-heal pass via `reconcileTenantFromStripe` that catches dropped
// webhooks on any page render.
//
// Source-of-truth priority for the "current plan" display:
//   1. tenant.pricingPlan.name  (from the FK set by the Stripe webhook)
//   2. live Stripe subscription item → matched to PricingPlan by price ID
//   3. tenant.plan legacy enum   (pre-M6 tenants that never got synced)
//
// Never hardcodes "Starter Trial" — the trial label now reads
// "<ActualPlan> Trial" when status === TRIAL, or falls to "Free trial" if
// no plan has been attached yet.
// ─────────────────────────────────────────────────────────────────────────

type LiveSubscription = {
  id: string;
  status: Stripe.Subscription.Status;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  trialEnd: Date | null;
  cycle: "monthly" | "annual" | null;
  priceAmountCents: number | null;
  priceCurrency: string | null;
  priceId: string | null;
  paymentMethod: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  } | null;
};

type InvoiceRow = {
  id: string;
  number: string | null;
  amountPaidCents: number;
  currency: string;
  status: Stripe.Invoice.Status | null;
  createdAt: Date;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
};

function fmtMoney(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Status → badge visual. Maps both the tenant.status enum and the raw
// Stripe subscription.status since we show whichever is more precise.
function statusBadge(
  key: string,
): { label: string; bg: string; fg: string; dot: string } {
  const K = key.toUpperCase();
  switch (K) {
    case "ACTIVE":
      return {
        label: "Active",
        bg: "var(--success-surface)",
        fg: "var(--success-fg)",
        dot: "var(--success-fg)",
      };
    case "TRIALING":
    case "TRIAL":
      return {
        label: "Trialing",
        bg: "var(--accent-surface)",
        fg: "var(--accent-primary)",
        dot: "var(--accent-primary)",
      };
    case "PAST_DUE":
      return {
        label: "Past due",
        bg: "var(--warning-surface)",
        fg: "var(--warning-fg)",
        dot: "var(--warning-fg)",
      };
    case "CANCELED":
      return {
        label: "Canceled",
        bg: "var(--danger-surface)",
        fg: "var(--danger-fg)",
        dot: "var(--danger-fg)",
      };
    case "INCOMPLETE":
    case "INCOMPLETE_EXPIRED":
      return {
        label: "Incomplete",
        bg: "var(--warning-surface)",
        fg: "var(--warning-fg)",
        dot: "var(--warning-fg)",
      };
    case "UNPAID":
      return {
        label: "Unpaid",
        bg: "var(--danger-surface)",
        fg: "var(--danger-fg)",
        dot: "var(--danger-fg)",
      };
    default:
      return {
        label: key,
        bg: "var(--surface-2)",
        fg: "var(--text-muted)",
        dot: "var(--text-muted)",
      };
  }
}

function StatusBadge({ status }: { status: string }) {
  const s = statusBadge(status);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ background: s.bg, color: s.fg }}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: s.dot }}
      />
      {s.label}
    </span>
  );
}

async function loadLiveSubscription(
  subscriptionId: string | null,
): Promise<LiveSubscription | null> {
  if (!stripe || !subscriptionId) return null;
  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["default_payment_method", "items.data.price"],
    });
    const item = sub.items?.data?.[0];
    const price = item?.price;
    const interval = price?.recurring?.interval;
    const cycle: LiveSubscription["cycle"] =
      interval === "year" ? "annual" : interval === "month" ? "monthly" : null;

    const pm = sub.default_payment_method;
    const card =
      pm && typeof pm !== "string" && pm.card
        ? {
            brand: pm.card.brand ?? "card",
            last4: pm.card.last4 ?? "••••",
            expMonth: pm.card.exp_month ?? 0,
            expYear: pm.card.exp_year ?? 0,
          }
        : null;

    return {
      id: sub.id,
      status: sub.status,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      currentPeriodEnd: sub.current_period_end
        ? new Date(sub.current_period_end * 1000)
        : null,
      trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
      cycle,
      priceAmountCents: price?.unit_amount ?? null,
      priceCurrency: price?.currency ?? null,
      priceId: price?.id ?? null,
      paymentMethod: card,
    };
  } catch {
    return null;
  }
}

async function loadInvoices(
  customerId: string | null,
): Promise<InvoiceRow[]> {
  if (!stripe || !customerId) return [];
  try {
    const res = await stripe.invoices.list({
      customer: customerId,
      limit: 12,
    });
    return res.data.map((inv) => ({
      id: inv.id,
      number: inv.number ?? null,
      amountPaidCents: inv.amount_paid ?? inv.amount_due ?? 0,
      currency: inv.currency ?? "usd",
      status: inv.status,
      createdAt: new Date((inv.created ?? 0) * 1000),
      hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
      invoicePdfUrl: inv.invoice_pdf ?? null,
    }));
  } catch {
    return [];
  }
}

export default async function BillingSettings({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    error?: string;
    checkout?: string;
    notice?: string;
  }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  // 1. RBAC — permission gate matches the settings-nav `perm: "tenant:billing"`.
  const { tenant } = await requirePermission(slug, "tenant:billing");

  // 2. Self-heal: pulls from Stripe and reconciles the tenant row in
  //    place if the webhook missed anything. Cheap no-op when DB already
  //    matches Stripe. Must run BEFORE the tenant re-read below.
  await reconcileTenantFromStripe(slug);

  // 3. Re-read tenant with pricingPlan relation + all published plans
  //    + live Stripe data. All in parallel — page renders after the
  //    slowest of them.
  const [freshTenant, publishedPlans, liveSub] = await Promise.all([
    db.tenant.findUnique({
      where: { id: tenant.id },
      include: { pricingPlan: true },
    }),
    getPublishedPlans(),
    loadLiveSubscription(tenant.stripeSubscriptionId),
  ]);
  const invoices = await loadInvoices(tenant.stripeCustomerId);
  const t = freshTenant ?? tenant;

  // ── Display-source resolution ──────────────────────────────────
  //
  // In order of preference:
  //   A. tenant.pricingPlan.name  — FK set by webhook, authoritative post-M6
  //   B. match by legacy enum slug against published plans — fills in
  //      pre-M6 tenants whose pricingPlanId was never populated
  //   C. title-cased legacy enum  — safety net so we never render empty
  //
  // We never hardcode "Starter" — this is derived every render.
  const planName: string = (() => {
    if (freshTenant?.pricingPlan?.name) return freshTenant.pricingPlan.name;
    const bySlug = publishedPlans.find(
      (p) => p.slug.toUpperCase() === (t.plan as string).toUpperCase(),
    );
    if (bySlug?.name) return bySlug.name;
    return titleCase(t.plan);
  })();

  // Cycle: prefer live Stripe (authoritative), then fall back to null.
  const cycle = liveSub?.cycle ?? null;

  // Effective status: live Stripe wins over tenant.status when available
  // (Stripe is source of truth for subscription state).
  const effectiveStatus: string = liveSub?.status
    ? liveSub.status.toUpperCase()
    : t.status;

  const trialDaysLeft = t.trialEndsAt
    ? Math.max(0, Math.ceil((t.trialEndsAt.getTime() - Date.now()) / 86_400_000))
    : null;

  const nextBillingDate =
    liveSub?.cancelAtPeriodEnd === false ? liveSub?.currentPeriodEnd ?? null : null;
  const cancelOnDate =
    liveSub?.cancelAtPeriodEnd === true ? liveSub?.currentPeriodEnd ?? null : null;

  const priceDisplay = (() => {
    if (liveSub?.priceAmountCents && liveSub.priceCurrency) {
      return `${fmtMoney(liveSub.priceAmountCents, liveSub.priceCurrency)} / ${
        liveSub.cycle === "annual" ? "year" : "month"
      }`;
    }
    // No live sub — use DB plan prices
    const dbPlan = freshTenant?.pricingPlan;
    if (dbPlan?.priceMonthly != null) {
      return `$${Number(dbPlan.priceMonthly)} / month`;
    }
    return null;
  })();

  const checkout = startCheckout.bind(null, slug);
  const portal = openBillingPortal.bind(null, slug);
  const cancelAction = cancelSubscriptionAtPeriodEnd.bind(null, slug);
  const resumeAction = resumeSubscription.bind(null, slug);

  const hasActiveSubscription =
    !!liveSub && ["active", "trialing", "past_due"].includes(liveSub.status);

  return (
    <div className="space-y-6">
      {/* Flash messages */}
      {sp.error === "stripe_unconfigured" && (
        <FlashBanner
          variant="danger"
          message="Stripe isn't configured. Add STRIPE_SECRET_KEY and run Sync to Stripe on your plans."
        />
      )}
      {sp.error === "no_subscription" && (
        <FlashBanner
          variant="danger"
          message="No active subscription found for this workspace."
        />
      )}
      {sp.error === "no_customer" && (
        <FlashBanner
          variant="danger"
          message="No Stripe customer on file. Start a subscription first."
        />
      )}
      {sp.error && !["stripe_unconfigured", "no_subscription", "no_customer", "invalid_plan"].includes(sp.error) && (
        <FlashBanner variant="danger" message={decodeURIComponent(sp.error)} />
      )}
      {sp.error === "invalid_plan" && (
        <FlashBanner variant="danger" message="That plan can't be purchased directly." />
      )}
      {sp.checkout === "success" && (
        <FlashBanner
          variant="success"
          message="Subscription updated. If the plan below looks wrong, refresh in a few seconds — Stripe is still catching up."
        />
      )}
      {sp.checkout === "canceled" && (
        <FlashBanner variant="info" message="Checkout canceled. No changes were made." />
      )}
      {sp.notice === "cancel_scheduled" && (
        <FlashBanner
          variant="info"
          message="Cancellation scheduled — you keep access until the end of your billing period."
        />
      )}
      {sp.notice === "resumed" && (
        <FlashBanner variant="success" message="Subscription resumed." />
      )}

      {/* ── Current subscription card ───────────────────────── */}
      <Card>
        <CardHeader title="Current subscription" />
        <div className="px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="text-xl font-semibold"
                  style={{ color: "var(--text-default)" }}
                >
                  {planName || "No plan"}
                </span>
                <StatusBadge status={effectiveStatus} />
                {liveSub?.cancelAtPeriodEnd && (
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{
                      background: "var(--warning-surface)",
                      color: "var(--warning-fg)",
                    }}
                  >
                    Canceling {fmtDate(cancelOnDate)}
                  </span>
                )}
                {cycle && (
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{
                      background: "var(--surface-2)",
                      color: "var(--text-muted)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    {cycle === "annual" ? "Annual billing" : "Monthly billing"}
                  </span>
                )}
              </div>
              {priceDisplay && (
                <div
                  className="mt-1 text-sm"
                  style={{ color: "var(--text-muted)" }}
                >
                  {priceDisplay}
                </div>
              )}

              {/* Next billing / trial / period-end detail row */}
              <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                {effectiveStatus === "TRIAL" && trialDaysLeft !== null && (
                  <DescItem
                    label="Trial ends"
                    value={`${fmtDate(t.trialEndsAt)} · ${trialDaysLeft} day${
                      trialDaysLeft === 1 ? "" : "s"
                    } left`}
                  />
                )}
                {nextBillingDate && (
                  <DescItem
                    label="Next billing date"
                    value={fmtDate(nextBillingDate)}
                  />
                )}
                {cancelOnDate && (
                  <DescItem label="Ends on" value={fmtDate(cancelOnDate)} />
                )}
                {liveSub && (
                  <DescItem label="Subscription ID" value={liveSub.id} mono />
                )}
              </dl>
            </div>

            <div className="flex flex-wrap items-start gap-2">
              {t.stripeCustomerId && (
                <form action={portal}>
                  <Button type="submit" variant="secondary">
                    Manage billing
                  </Button>
                </form>
              )}
              {hasActiveSubscription && !liveSub?.cancelAtPeriodEnd && (
                <form action={cancelAction}>
                  <Button type="submit" variant="danger">
                    Cancel subscription
                  </Button>
                </form>
              )}
              {liveSub?.cancelAtPeriodEnd && (
                <form action={resumeAction}>
                  <Button type="submit" variant="primary">
                    Resume subscription
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* ── Payment method ──────────────────────────────────── */}
      {liveSub?.paymentMethod && (
        <Card>
          <CardHeader
            title="Payment method"
            right={
              <form action={portal}>
                <Button type="submit" variant="secondary">
                  Update
                </Button>
              </form>
            }
          />
          <div className="px-5 py-5 flex items-center gap-4">
            <div
              className="flex h-10 w-14 items-center justify-center rounded-md text-xs font-semibold uppercase"
              style={{
                background: "var(--surface-2)",
                color: "var(--text-default)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              {liveSub.paymentMethod.brand}
            </div>
            <div className="text-sm">
              <div style={{ color: "var(--text-default)" }}>
                •••• •••• •••• {liveSub.paymentMethod.last4}
              </div>
              <div style={{ color: "var(--text-muted)" }}>
                Expires{" "}
                {String(liveSub.paymentMethod.expMonth).padStart(2, "0")}/
                {String(liveSub.paymentMethod.expYear).slice(-2)}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ── Change plan (only if tenant can purchase) ───────── */}
      {publishedPlans.length > 0 && (
        <Card>
          <CardHeader
            title={hasActiveSubscription ? "Change plan" : "Choose a plan"}
            description={
              hasActiveSubscription
                ? "Upgrade or downgrade anytime. Changes are prorated by Stripe."
                : "Pick a plan to activate your workspace."
            }
          />
          <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-3">
            {publishedPlans
              .filter((p) => p.showOnSignup)
              .map((p) => {
                const isCurrent =
                  (freshTenant?.pricingPlanId &&
                    freshTenant.pricingPlanId === p.id) ||
                  p.slug.toUpperCase() === (t.plan as string).toUpperCase();
                // A plan is self-serve checkoutable if it has a price set
                // and isn't flagged as contact-sales. Enterprise with a
                // price counts; Enterprise with isContactSales=true does
                // not (falls through to the "Contact sales" CTA).
                const canCheckout =
                  !p.isContactSales &&
                  (p.priceMonthly != null || p.priceAnnual != null);
                return (
                  <div
                    key={p.id}
                    className="relative flex flex-col rounded-lg p-4"
                    style={{
                      background: "var(--surface-1)",
                      border: `1px solid ${
                        p.highlight
                          ? "var(--accent-primary)"
                          : "var(--border-subtle)"
                      }`,
                    }}
                  >
                    {p.highlight && (
                      <span
                        className="absolute -top-2 left-4 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                        style={{
                          background: "var(--accent-primary)",
                          color: "var(--accent-fg)",
                        }}
                      >
                        Popular
                      </span>
                    )}
                    <div
                      className="text-sm font-semibold"
                      style={{ color: "var(--text-default)" }}
                    >
                      {p.name}
                    </div>
                    {p.subtitle && (
                      <p
                        className="mt-0.5 text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {p.subtitle}
                      </p>
                    )}
                    <div
                      className="mt-3 text-2xl font-semibold"
                      style={{ color: "var(--text-default)" }}
                    >
                      {p.priceMonthly != null
                        ? `$${p.priceMonthly}`
                        : "—"}
                      <span
                        className="ml-1 text-xs font-normal"
                        style={{ color: "var(--text-muted)" }}
                      >
                        /mo
                      </span>
                    </div>
                    {isCurrent ? (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled
                        className="mt-4 w-full opacity-60"
                      >
                        Current plan
                      </Button>
                    ) : canCheckout ? (
                      <form action={checkout} className="mt-4">
                        <input type="hidden" name="plan" value={p.slug.toUpperCase()} />
                        <input type="hidden" name="cycle" value="monthly" />
                        <Button
                          type="submit"
                          variant={p.highlight ? "primary" : "secondary"}
                          className="w-full"
                        >
                          {hasActiveSubscription ? "Switch" : "Choose"}
                        </Button>
                      </form>
                    ) : (
                      // Only remaining case: contact-sales plan with no
                      // self-serve price. Link to /contact instead of
                      // dead-ending with a disabled button.
                      <a
                        href={p.ctaHref ?? "/contact"}
                        className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-md text-sm font-medium transition-colors hover:brightness-110"
                        style={{
                          background: "var(--surface-2)",
                          color: "var(--text-default)",
                          border: "1px solid var(--border-default)",
                        }}
                      >
                        {p.ctaLabel ?? "Contact sales"}
                      </a>
                    )}
                  </div>
                );
              })}
          </div>
        </Card>
      )}

      {/* ── Billing history ─────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Billing history"
          description="Receipts are also emailed by Stripe after each payment."
          right={
            t.stripeCustomerId ? (
              <form action={portal}>
                <Button type="submit" variant="secondary">
                  Open portal
                </Button>
              </form>
            ) : undefined
          }
        />
        {invoices.length === 0 ? (
          <div
            className="px-5 py-8 text-center text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            {t.stripeCustomerId
              ? "No invoices yet. They'll show up here after your first billing cycle."
              : "No billing history yet — start a subscription to see invoices."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="text-left"
                  style={{
                    borderBottom: "1px solid var(--border-subtle)",
                    color: "var(--text-muted)",
                  }}
                >
                  <th className="px-5 py-2 font-medium">Date</th>
                  <th className="px-5 py-2 font-medium">Invoice</th>
                  <th className="px-5 py-2 font-medium">Amount</th>
                  <th className="px-5 py-2 font-medium">Status</th>
                  <th className="px-5 py-2 font-medium text-right">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    style={{ borderBottom: "1px solid var(--border-subtle)" }}
                  >
                    <td
                      className="px-5 py-3"
                      style={{ color: "var(--text-default)" }}
                    >
                      {fmtDate(inv.createdAt)}
                    </td>
                    <td
                      className="px-5 py-3 font-mono text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {inv.number ?? inv.id}
                    </td>
                    <td
                      className="px-5 py-3"
                      style={{ color: "var(--text-default)" }}
                    >
                      {fmtMoney(inv.amountPaidCents, inv.currency)}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={(inv.status ?? "").toUpperCase()} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      {inv.hostedInvoiceUrl && (
                        <a
                          href={inv.hostedInvoiceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                          style={{ color: "var(--accent-primary)" }}
                        >
                          View
                        </a>
                      )}
                      {inv.invoicePdfUrl && (
                        <>
                          <span className="mx-1" style={{ color: "var(--text-faint)" }}>
                            ·
                          </span>
                          <a
                            href={inv.invoicePdfUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="underline"
                            style={{ color: "var(--accent-primary)" }}
                          >
                            PDF
                          </a>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Small presentational helpers ─────────────────────────────

function DescItem({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt
        className="text-xs uppercase tracking-wide"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </dt>
      <dd
        className={`mt-0.5 ${mono ? "font-mono text-xs" : ""}`}
        style={{ color: "var(--text-default)" }}
      >
        {value}
      </dd>
    </div>
  );
}

function FlashBanner({
  variant,
  message,
}: {
  variant: "success" | "danger" | "info";
  message: string;
}) {
  const palette =
    variant === "success"
      ? { bg: "var(--success-surface)", fg: "var(--success-fg)" }
      : variant === "danger"
      ? { bg: "var(--danger-surface)", fg: "var(--danger-fg)" }
      : { bg: "var(--accent-surface)", fg: "var(--accent-primary)" };
  return (
    <div
      className="rounded-md px-4 py-3 text-sm"
      style={{ background: palette.bg, color: palette.fg }}
    >
      {message}
    </div>
  );
}

function titleCase(s: string | null | undefined): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// Silence unused-type warning — kept for docstring reference.
export type { Plan };
