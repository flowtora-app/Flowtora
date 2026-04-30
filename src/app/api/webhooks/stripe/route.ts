import { NextResponse } from "next/server";
import { stripe, PRICE_IDS } from "@/lib/stripe";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { sendNotification } from "@/lib/notifications";
import type { TokenValues } from "@/lib/notifications";
import { recordTenantCanceled } from "@/server/billing/subscription-events";
import type { Plan } from "@prisma/client";
import type Stripe from "stripe";

// Stripe sends raw body; we must verify the signature with the raw bytes.
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return NextResponse.json({ error: `Bad signature: ${(err as Error).message}` }, { status: 400 });
  }

  switch (event.type) {
    // Fires the moment Stripe Checkout finishes — seconds faster than
    // customer.subscription.created. The subscription is already
    // created (mode: "subscription") by the time this event fires, so
    // we expand it and run the same tenant-update path. Gives us
    // instant plan reflection when the user lands on /welcome →
    // /settings/billing without waiting for the sub.created webhook.
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription" || !session.subscription) break;

      const subId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription.id;
      const sub = await stripe.subscriptions.retrieve(subId);

      const tenantId =
        (session.metadata?.tenantId as string | undefined) ??
        (sub.metadata?.tenantId as string | undefined);
      const tenant = tenantId
        ? await db.tenant.findUnique({ where: { id: tenantId } })
        : await db.tenant.findFirst({
            where: { stripeCustomerId: session.customer as string },
          });

      if (tenant) {
        const status = mapStripeStatus(sub.status);
        const resolved = await resolvePlanFromSubscription(sub);
        await db.tenant.update({
          where: { id: tenant.id },
          data: {
            stripeSubscriptionId: sub.id,
            stripeCustomerId: (session.customer as string) ?? tenant.stripeCustomerId,
            status,
            ...(resolved?.plan ? { plan: resolved.plan } : {}),
            ...(resolved?.pricingPlanId
              ? { pricingPlanId: resolved.pricingPlanId }
              : {}),
          },
        });
        await logAudit({
          tenantId: tenant.id,
          action: "stripe.checkout.session.completed",
          metadata: {
            subId: sub.id,
            status,
            plan: resolved?.plan ?? null,
            pricingPlanId: resolved?.pricingPlanId ?? null,
            resolvedVia: resolved?.source ?? "unresolved",
          },
        });

        // Notify owners. On a fresh checkout we emit exactly one of
        // trial_started (if Stripe says the sub is still in trial) or
        // subscription_confirmation (the user paid immediately). We
        // intentionally skip this same path in customer.subscription.created
        // to avoid duplicate sends — checkout fires first and has the
        // cleaner session context (metadata, billing cycle, amount).
        const planName = await resolvePlanName(resolved);
        const cycle = inferBillingCycle(sub);
        const amount = formatAmount(
          sub.items?.data?.[0]?.price?.unit_amount ?? null,
          sub.items?.data?.[0]?.price?.currency ?? null,
        );
        const nextBillingDate = formatDate(periodEndOf(sub));
        const billingUrl = billingUrlFor(tenant.slug);

        if (sub.status === "trialing") {
          await sendBillingToOwners(tenant.id, "billing.trial_started", {
            plan_name: planName,
            trial_days: trialDaysFrom(sub),
            trial_ends_at: formatDate(sub.trial_end),
            workspace_url: `${process.env.APP_URL ?? "http://localhost:3000"}/t/${tenant.slug}/dashboard`,
          });
        } else {
          await sendBillingToOwners(tenant.id, "billing.subscription_confirmation", {
            plan_name: planName,
            billing_cycle: cycle,
            amount,
            next_billing_date: nextBillingDate,
            billing_url: billingUrl,
          });
        }
      }
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const tenant = await db.tenant.findFirst({
        where: { stripeCustomerId: sub.customer as string },
        select: {
          id: true,
          slug: true,
          plan: true,
          pricingPlanId: true,
          status: true,
        },
      });
      if (tenant) {
        const status = mapStripeStatus(sub.status);
        // Resolve the plan the customer is actually on. M6 swap: try
        // PricingPlan DB lookup first (matches on stripePriceMonthly /
        // stripePriceAnnual), then subscription metadata, then the
        // legacy PRICE_IDS env map. DB lookup gives us BOTH the new
        // pricingPlanId FK and the legacy Plan enum so we can dual-
        // write and eventually retire the enum.
        const resolved = await resolvePlanFromSubscription(sub);

        // Snapshot the tenant's previous plan identity BEFORE the
        // update so plan_changed emails can diff old vs new.
        const prevPricingPlanId = tenant.pricingPlanId;
        const prevPlanEnum = tenant.plan;
        const prevStatus = tenant.status;

        await db.tenant.update({
          where: { id: tenant.id },
          data: {
            stripeSubscriptionId: sub.id,
            status,
            ...(resolved?.plan ? { plan: resolved.plan } : {}),
            ...(resolved?.pricingPlanId
              ? { pricingPlanId: resolved.pricingPlanId }
              : {}),
          },
        });
        await logAudit({
          tenantId: tenant.id,
          action: `stripe.${event.type}`,
          metadata: {
            subId: sub.id,
            status,
            plan: resolved?.plan ?? null,
            pricingPlanId: resolved?.pricingPlanId ?? null,
            resolvedVia: resolved?.source ?? "unresolved",
          },
        });

        // Notify only on updates that materially change the plan.
        // subscription.created is handled via checkout.session.completed
        // (fires first, has cleaner context) so we skip sends here to
        // avoid duplicates. The one exception: a .updated event where
        // the resolved plan differs from what the tenant had before.
        if (event.type === "customer.subscription.updated") {
          const planChanged =
            resolved &&
            ((resolved.pricingPlanId && resolved.pricingPlanId !== prevPricingPlanId) ||
              (!resolved.pricingPlanId && resolved.plan && resolved.plan !== prevPlanEnum));
          if (planChanged) {
            const newName = await resolvePlanName(resolved);
            const prevName = await resolvePlanNameFromIds(prevPricingPlanId, prevPlanEnum);
            await sendBillingToOwners(tenant.id, "billing.plan_changed", {
              previous_plan_name: prevName,
              new_plan_name: newName,
              billing_cycle: inferBillingCycle(sub),
              changed_at: formatDate(new Date()),
              next_billing_date: formatDate(periodEndOf(sub)),
              billing_url: billingUrlFor(tenant.slug),
            });
          } else if (prevStatus === "TRIAL" && status === "ACTIVE") {
            // Trial-to-paid conversion (no plan change). Treat this as
            // the canonical "subscription confirmed" event since the
            // original trial_started fired but no paid-confirmation
            // has yet been sent.
            await sendBillingToOwners(tenant.id, "billing.subscription_confirmation", {
              plan_name: await resolvePlanName(resolved),
              billing_cycle: inferBillingCycle(sub),
              amount: formatAmount(
                sub.items?.data?.[0]?.price?.unit_amount ?? null,
                sub.items?.data?.[0]?.price?.currency ?? null,
              ),
              next_billing_date: formatDate(periodEndOf(sub)),
              billing_url: billingUrlFor(tenant.slug),
            });
          }
        }
      }
      break;
    }
    case "customer.subscription.trial_will_end": {
      const sub = event.data.object as Stripe.Subscription;
      const tenant = await db.tenant.findFirst({
        where: { stripeCustomerId: sub.customer as string },
        select: { id: true, slug: true },
      });
      if (tenant) {
        const resolved = await resolvePlanFromSubscription(sub);
        const trialEndsAt = sub.trial_end;
        const daysRemaining = trialEndsAt
          ? Math.max(
              1,
              Math.ceil((trialEndsAt * 1000 - Date.now()) / (24 * 60 * 60 * 1000)),
            )
          : 3;
        await sendBillingToOwners(tenant.id, "billing.trial_ending_soon", {
          plan_name: await resolvePlanName(resolved),
          days_remaining: daysRemaining,
          trial_ends_at: formatDate(trialEndsAt),
          billing_url: billingUrlFor(tenant.slug),
        });
      }
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const tenant = await db.tenant.findFirst({
        where: { stripeSubscriptionId: sub.id },
        select: { id: true, slug: true, plan: true, pricingPlanId: true, status: true },
      });
      if (tenant) {
        const wasPaying = tenant.status === "ACTIVE" || tenant.status === "PAST_DUE";
        await db.tenant.update({ where: { id: tenant.id }, data: { status: "CANCELED" } });
        await logAudit({ tenantId: tenant.id, action: "stripe.subscription.canceled" });
        if (wasPaying) {
          await recordTenantCanceled({
            tenantId: tenant.id,
            lastPlan: tenant.plan,
            source: "STRIPE",
            reason: "stripe.subscription.deleted",
            metadata: { stripeSubscriptionId: sub.id },
          });
        }
        await sendBillingToOwners(tenant.id, "billing.subscription_canceled", {
          plan_name: await resolvePlanNameFromIds(tenant.pricingPlanId, tenant.plan),
          canceled_at: formatDate(new Date()),
          billing_url: billingUrlFor(tenant.slug),
        });
      }
      break;
    }
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const tenant = await db.tenant.findFirst({
        where: { stripeCustomerId: invoice.customer as string },
        select: { id: true, slug: true, plan: true, pricingPlanId: true },
      });
      if (tenant) {
        // Skip the initial subscription-creation invoice — the checkout
        // handler already sent a subscription_confirmation. Only emit
        // payment_succeeded for recurring cycles.
        if (invoice.billing_reason === "subscription_create") break;
        await sendBillingToOwners(tenant.id, "billing.payment_succeeded", {
          plan_name: await resolvePlanNameFromIds(tenant.pricingPlanId, tenant.plan),
          amount: formatAmount(invoice.amount_paid ?? null, invoice.currency ?? null),
          invoice_number: invoice.number ?? "",
          next_billing_date: formatDate(invoice.period_end),
          invoice_url: invoice.hosted_invoice_url ?? "",
        });
      }
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const tenant = await db.tenant.findFirst({
        where: { stripeCustomerId: invoice.customer as string },
        select: { id: true, slug: true, plan: true, pricingPlanId: true },
      });
      if (tenant) {
        await db.tenant.update({ where: { id: tenant.id }, data: { status: "PAST_DUE" } });
        await sendBillingToOwners(tenant.id, "billing.payment_failed", {
          plan_name: await resolvePlanNameFromIds(tenant.pricingPlanId, tenant.plan),
          amount: formatAmount(
            invoice.amount_due ?? invoice.amount_remaining ?? null,
            invoice.currency ?? null,
          ),
          billing_url: billingUrlFor(tenant.slug),
        });
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}

// Derive tenant plan identifiers from a Stripe subscription. Returns
// BOTH the new pricingPlanId (DB FK to PricingPlan) and the legacy
// Plan enum, when we can infer them. Sources, in order:
//
//   1. PricingPlan DB lookup on the line-item priceId. The admin
//      Pricing tab writes stripePriceMonthly / stripePriceAnnual back
//      to the row on each sync, so a fresh checkout will already
//      match. This is the canonical source post-M6.
//
//   2. `subscription.metadata.plan` — we stamp this in
//      createCheckoutSession. Works for subs created before their
//      plan was M5-synced to Stripe, and covers the short window where
//      the Price row exists in Stripe but not yet written back.
//      Returns the legacy enum only; pricingPlanId stays null (the
//      slug isn't in metadata today).
//
//   3. Legacy PRICE_IDS env map — pre-M5 checkouts that were never
//      routed through a PricingPlan row. Returns the enum only;
//      pricingPlanId stays null.
//
// Returns null if nothing matches — caller leaves both fields
// untouched in that case. The legacy `plan` field is optional so we
// can stop writing it once the enum is retired without changing the
// call site.
async function resolvePlanFromSubscription(
  sub: Stripe.Subscription,
): Promise<
  | { plan: Plan | null; pricingPlanId: string | null; source: "db" | "metadata" | "env" }
  | null
> {
  const priceId = sub.items?.data?.[0]?.price?.id;

  // 0. Explicit pricingPlanId metadata stamped by createCheckoutSession.
  //    This is the most precise pointer — survives Stripe Price ID
  //    rotation and removes any ambiguity when multiple plans happen
  //    to share a price ID (shouldn't happen but defense in depth).
  const metaPricingPlanId = sub.metadata?.pricingPlanId;
  if (metaPricingPlanId) {
    const row = await db.pricingPlan.findUnique({
      where: { id: metaPricingPlanId },
      select: { id: true, slug: true },
    });
    if (row) {
      return {
        plan: mapSlugToLegacyEnum(row.slug),
        pricingPlanId: row.id,
        source: "db",
      };
    }
  }

  // 1. DB lookup by Stripe price ID. Matches on stripePriceMonthly /
  //    stripePriceAnnual — the canonical linkage after a Sync to Stripe.
  if (priceId) {
    const row = await db.pricingPlan.findFirst({
      where: {
        OR: [
          { stripePriceMonthly: priceId },
          { stripePriceAnnual: priceId },
        ],
      },
      select: { id: true, slug: true },
    });
    if (row) {
      return {
        plan: mapSlugToLegacyEnum(row.slug),
        pricingPlanId: row.id,
        source: "db",
      };
    }
  }

  // 2. Subscription metadata — legacy enum stamped by pre-M6 checkouts.
  const fromMeta = (sub.metadata?.plan ?? "").toUpperCase();
  if (fromMeta === "STARTER" || fromMeta === "GROWTH" || fromMeta === "PRO") {
    return {
      plan: fromMeta as Plan,
      pricingPlanId: null,
      source: "metadata",
    };
  }

  // 3. Legacy env table.
  if (priceId) {
    for (const [plan, prices] of Object.entries(PRICE_IDS) as [
      Plan,
      { monthly: string; annual: string },
    ][]) {
      if (priceId === prices.monthly || priceId === prices.annual) {
        return { plan, pricingPlanId: null, source: "env" };
      }
    }
  }

  return null;
}

// Map a PricingPlan.slug back to the legacy Plan enum for dual-write.
// Slugs that don't match a known enum value yield null so we just
// skip the legacy field — the new pricingPlanId FK still lands.
// Once the enum is fully retired this helper goes away.
function mapSlugToLegacyEnum(slug: string): Plan | null {
  switch (slug.toLowerCase()) {
    case "starter":
      return "STARTER";
    case "growth":
      return "GROWTH";
    case "pro":
      return "PRO";
    case "enterprise":
      return "ENTERPRISE";
    default:
      return null;
  }
}

// ── Notification helpers ──────────────────────────────────────────

// Fan out a billing notification to every ACTIVE OWNER of the tenant.
// Owners are the right default audience for billing events: they're
// the ones who can actually update payment methods or cancel. We send
// one email per owner so each gets their own copy with their own
// unsubscribe / reply context. Non-owner members aren't notified here.
// sendNotification returns a result rather than throwing, so a stripe
// webhook ack is never blocked by an email outage.
async function sendBillingToOwners(
  tenantId: string,
  kind: string,
  tokens: TokenValues,
): Promise<void> {
  try {
    const owners = await db.membership.findMany({
      where: { tenantId, status: "ACTIVE", role: "OWNER" },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    await Promise.all(
      owners
        .filter((m) => !!m.user.email)
        .map((m) =>
          sendNotification({
            kind,
            to: m.user.email!,
            tenantId,
            userId: m.user.id,
            tokens: {
              user_name: m.user.name ?? "",
              ...tokens,
            },
          }),
        ),
    );
  } catch (err) {
    console.error("[stripe-webhook] sendBillingToOwners failed", kind, err);
  }
}

// Turn a resolvePlanFromSubscription result into a human plan name.
// Prefers the PricingPlan row's display name (what admins edit in
// /platform/plans), falls back to the legacy enum title-cased, then
// an empty string. Callers treat the empty case as "unknown" and the
// template renders "" instead of the token — fine for a degraded send.
async function resolvePlanName(
  resolved: Awaited<ReturnType<typeof resolvePlanFromSubscription>>,
): Promise<string> {
  if (!resolved) return "";
  if (resolved.pricingPlanId) {
    const row = await db.pricingPlan.findUnique({
      where: { id: resolved.pricingPlanId },
      select: { name: true },
    });
    if (row?.name) return row.name;
  }
  return resolved.plan ? titleCase(resolved.plan) : "";
}

// Resolve plan name from a tenant's stored ids (used for events where
// we don't have a fresh Stripe subscription object, e.g. invoice.paid
// or invoice.payment_failed — we trust the tenant row).
async function resolvePlanNameFromIds(
  pricingPlanId: string | null,
  planEnum: Plan | null,
): Promise<string> {
  if (pricingPlanId) {
    const row = await db.pricingPlan.findUnique({
      where: { id: pricingPlanId },
      select: { name: true },
    });
    if (row?.name) return row.name;
  }
  return planEnum ? titleCase(planEnum) : "";
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// Stripe price.recurring.interval is "month" | "year" | etc. Map to
// the token grammar our templates already use ("monthly" | "annual").
function inferBillingCycle(sub: Stripe.Subscription): string {
  const interval = sub.items?.data?.[0]?.price?.recurring?.interval;
  if (interval === "year") return "annual";
  if (interval === "month") return "monthly";
  return interval ?? "";
}

// amount_paid / unit_amount come in the smallest currency unit (cents
// for USD). Format as "$49.00" for USD, otherwise "49.00 EUR" — the
// email template is cosmetic, not a financial-grade receipt.
function formatAmount(amount: number | null, currency: string | null): string {
  if (amount == null) return "";
  const value = (amount / 100).toFixed(2);
  const code = (currency ?? "usd").toUpperCase();
  if (code === "USD") return `$${value}`;
  if (code === "EUR") return `€${value}`;
  if (code === "GBP") return `£${value}`;
  return `${value} ${code}`;
}

// Format a unix-seconds timestamp OR a Date as "May 6, 2026". Empty
// string on null — the template just skips the token.
function formatDate(ts: number | Date | null | undefined): string {
  if (ts == null) return "";
  const d = typeof ts === "number" ? new Date(ts * 1000) : ts;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// Stripe's v2 Subscription type drops current_period_end off the root;
// it's now on the line item. This pulls it out safely.
function periodEndOf(sub: Stripe.Subscription): number | null {
  const item = sub.items?.data?.[0];
  const anyItem = item as unknown as { current_period_end?: number } | undefined;
  return anyItem?.current_period_end ?? null;
}

// Trial length in days. Uses trial_start → trial_end when both are
// present; falls back to 14 (our standard trial) otherwise. Returned
// as a number so the template renders "14" not "14 days".
function trialDaysFrom(sub: Stripe.Subscription): number {
  if (sub.trial_start && sub.trial_end) {
    const days = Math.round((sub.trial_end - sub.trial_start) / (24 * 60 * 60));
    if (days > 0) return days;
  }
  return 14;
}

function billingUrlFor(slug: string): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base}/t/${slug}/settings/billing`;
}

function mapStripeStatus(s: Stripe.Subscription.Status) {
  switch (s) {
    case "active":
    case "trialing":
      return "ACTIVE" as const;
    case "past_due":
    case "unpaid":
      return "PAST_DUE" as const;
    case "canceled":
    case "incomplete_expired":
      return "CANCELED" as const;
    default:
      return "TRIAL" as const;
  }
}
