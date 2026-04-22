"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { requirePermission } from "@/lib/tenant";
import { createCheckoutSession, createPortalSession } from "@/lib/billing";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import type { Plan, TenantStatus } from "@prisma/client";
import type { BillingCycle } from "@/lib/stripe";
import type Stripe from "stripe";

// startCheckout — form-driven action used by the in-app billing
// settings page. Reads `plan` from a hidden form input; cycle defaults
// to monthly because that page doesn't expose a cycle toggle yet.
export async function startCheckout(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "tenant:billing");
  const plan = String(formData.get("plan") ?? "") as Plan;
  if (plan !== "STARTER" && plan !== "GROWTH" && plan !== "PRO") {
    redirect(`/t/${slug}/settings/billing?error=invalid_plan`);
  }
  const cycle = (String(formData.get("cycle") ?? "monthly") as BillingCycle);
  const session = await auth();
  const url = await createCheckoutSession({
    tenant: ctx.tenant,
    ownerEmail: session?.user?.email ?? "",
    plan,
    cycle,
    returnUrl: `${process.env.APP_URL ?? "http://localhost:3000"}/t/${slug}/settings/billing`,
  });
  if (!url) redirect(`/t/${slug}/settings/billing?error=stripe_unconfigured`);
  redirect(url);
}

// startCheckoutDirect — programmatic variant used by the marketing →
// signup → Stripe handoff. The `checkout-direct` route calls this
// after reading plan+cycle from the URL. Keeps the form-less flow out
// of `startCheckout` so the in-app billing page can evolve
// independently.
//
// Unlike `startCheckout` (existing user upgrading), this flow lands
// the user on `/welcome?checkout=success&plan=…&cycle=…` afterward —
// a celebratory handoff into the onboarding wizard. Brand-new tenants
// haven't set up anything yet, so dumping them on /settings/billing
// would feel cold and miss the chance to funnel them into setup.
export async function startCheckoutDirect(
  slug: string,
  plan: Exclude<Plan, "ENTERPRISE">,
  cycle: BillingCycle,
) {
  const ctx = await requirePermission(slug, "tenant:billing");
  const session = await auth();
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const returnUrl = new URL(`/t/${slug}/welcome`, base);
  returnUrl.searchParams.set("plan", plan);
  returnUrl.searchParams.set("cycle", cycle);
  const url = await createCheckoutSession({
    tenant: ctx.tenant,
    ownerEmail: session?.user?.email ?? "",
    plan,
    cycle,
    returnUrl: returnUrl.toString(),
  });
  if (!url) {
    redirect(`/t/${slug}/settings/billing?error=stripe_unconfigured`);
  }
  redirect(url);
}

export async function openBillingPortal(slug: string) {
  const ctx = await requirePermission(slug, "tenant:billing");
  const url = await createPortalSession({
    tenant: ctx.tenant,
    returnUrl: `${process.env.APP_URL ?? "http://localhost:3000"}/t/${slug}/settings/billing`,
  });
  if (!url) redirect(`/t/${slug}/settings/billing?error=no_customer`);
  redirect(url);
}

// Cancel the tenant's subscription at the end of the current billing
// period. Keeps access through the paid-for window, then flips the
// tenant to CANCELED via the customer.subscription.deleted webhook.
//
// We explicitly DON'T use stripe.subscriptions.cancel() (immediate
// cancellation with proration) because that feels punitive — the user
// paid for the month, they should get the month. Users who need an
// immediate cancel can go through the Stripe Billing Portal.
export async function cancelSubscriptionAtPeriodEnd(slug: string) {
  const ctx = await requirePermission(slug, "tenant:billing");
  if (!stripe) {
    redirect(`/t/${slug}/settings/billing?error=stripe_unconfigured`);
  }
  if (!ctx.tenant.stripeSubscriptionId) {
    redirect(`/t/${slug}/settings/billing?error=no_subscription`);
  }
  try {
    await stripe.subscriptions.update(ctx.tenant.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "stripe.subscription.cancel_scheduled",
      metadata: { subId: ctx.tenant.stripeSubscriptionId },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    redirect(
      `/t/${slug}/settings/billing?error=${encodeURIComponent(msg)}`,
    );
  }
  revalidatePath(`/t/${slug}/settings/billing`);
  redirect(`/t/${slug}/settings/billing?notice=cancel_scheduled`);
}

// Undo a scheduled cancellation — sets cancel_at_period_end back to
// false. Only works before the period ends (once Stripe actually
// cancels, the subscription is gone and you re-subscribe via checkout).
export async function resumeSubscription(slug: string) {
  const ctx = await requirePermission(slug, "tenant:billing");
  if (!stripe) {
    redirect(`/t/${slug}/settings/billing?error=stripe_unconfigured`);
  }
  if (!ctx.tenant.stripeSubscriptionId) {
    redirect(`/t/${slug}/settings/billing?error=no_subscription`);
  }
  try {
    await stripe.subscriptions.update(ctx.tenant.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "stripe.subscription.cancel_resumed",
      metadata: { subId: ctx.tenant.stripeSubscriptionId },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    redirect(
      `/t/${slug}/settings/billing?error=${encodeURIComponent(msg)}`,
    );
  }
  revalidatePath(`/t/${slug}/settings/billing`);
  redirect(`/t/${slug}/settings/billing?notice=resumed`);
}

// Self-heal helper: pulls the live subscription from Stripe and
// reconciles the tenant row if drift is detected. Called from the
// subscription page render so stale DB never "sticks" — if a webhook
// was ever dropped, the next page load fixes it.
//
// Resolution order for "which subscription belongs to this tenant":
//   1. tenant.stripeSubscriptionId (set by webhook)
//   2. tenant.stripeCustomerId → list subscriptions → pick active one
//      (catches the case where a webhook was dropped entirely so we
//       never learned the sub ID, but the Stripe customer is on file)
//
// Errors are logged to stderr (visible in Vercel logs) but swallowed —
// rendering must not break if Stripe is unreachable.
export async function reconcileTenantFromStripe(slug: string) {
  const ctx = await requirePermission(slug, "tenant:billing");
  if (!stripe) return;
  if (!ctx.tenant.stripeCustomerId && !ctx.tenant.stripeSubscriptionId) return;

  try {
    // 1. Find the subscription to reconcile against.
    let sub: Stripe.Subscription | null = null;
    if (ctx.tenant.stripeSubscriptionId) {
      sub = await stripe.subscriptions
        .retrieve(ctx.tenant.stripeSubscriptionId, {
          expand: ["default_payment_method", "items.data.price"],
        })
        .catch((e) => {
          console.error(
            `[reconcile] retrieve failed for sub ${ctx.tenant.stripeSubscriptionId}:`,
            e,
          );
          return null;
        });
    }
    // 2. Fallback: look up by customer ID — the webhook may have never
    //    fired so we don't have the sub ID on file yet.
    if (!sub && ctx.tenant.stripeCustomerId) {
      const list = await stripe.subscriptions.list({
        customer: ctx.tenant.stripeCustomerId,
        status: "all",
        limit: 5,
        expand: ["data.default_payment_method", "data.items.data.price"],
      });
      // Prefer active > trialing > past_due > any. Skip canceled if we
      // have anything better.
      const ordering: Record<string, number> = {
        active: 0,
        trialing: 1,
        past_due: 2,
        unpaid: 3,
        incomplete: 4,
        canceled: 5,
        incomplete_expired: 6,
        paused: 7,
      };
      sub =
        [...list.data].sort(
          (a, b) => (ordering[a.status] ?? 99) - (ordering[b.status] ?? 99),
        )[0] ?? null;
    }

    if (!sub) return;

    const liveStatus = mapStripeStatusToTenantStatus(sub.status, ctx.tenant.status);

    // Resolve plan from Stripe price → PricingPlan.
    const priceId = sub.items?.data?.[0]?.price?.id ?? null;
    let pricingPlanId: string | null = ctx.tenant.pricingPlanId;
    let legacyPlan: Plan | null = null;

    // Prefer explicit metadata pointer (post-M6 checkouts stamp this).
    const metaPPI = sub.metadata?.pricingPlanId;
    if (metaPPI) {
      const row = await db.pricingPlan.findUnique({
        where: { id: metaPPI },
        select: { id: true, slug: true },
      });
      if (row) {
        pricingPlanId = row.id;
        legacyPlan = mapSlugToPlan(row.slug);
      }
    }
    // Next: match the Stripe price ID against stripePriceMonthly/Annual.
    if (!legacyPlan && priceId) {
      const row = await db.pricingPlan.findFirst({
        where: {
          OR: [{ stripePriceMonthly: priceId }, { stripePriceAnnual: priceId }],
        },
        select: { id: true, slug: true },
      });
      if (row) {
        pricingPlanId = row.id;
        legacyPlan = mapSlugToPlan(row.slug);
      }
    }
    // Next: legacy metadata.plan = "PRO" etc.
    if (!legacyPlan) {
      const metaPlan = (sub.metadata?.plan ?? "").toUpperCase();
      if (metaPlan === "STARTER" || metaPlan === "GROWTH" || metaPlan === "PRO") {
        legacyPlan = metaPlan as Plan;
      }
    }

    const driftDetected =
      ctx.tenant.status !== liveStatus ||
      ctx.tenant.stripeSubscriptionId !== sub.id ||
      ctx.tenant.pricingPlanId !== pricingPlanId ||
      (legacyPlan && ctx.tenant.plan !== legacyPlan);

    if (driftDetected) {
      await db.tenant.update({
        where: { id: ctx.tenant.id },
        data: {
          status: liveStatus,
          stripeSubscriptionId: sub.id,
          ...(pricingPlanId ? { pricingPlanId } : {}),
          ...(legacyPlan ? { plan: legacyPlan } : {}),
        },
      });
      console.log(
        `[reconcile] healed tenant ${ctx.tenant.slug}: plan=${legacyPlan} pricingPlanId=${pricingPlanId} status=${liveStatus} subId=${sub.id}`,
      );
    }
  } catch (err) {
    // Log but don't rethrow — settings page must still render.
    console.error(`[reconcile] unexpected failure for ${slug}:`, err);
  }
}

function mapSlugToPlan(slug: string): Plan | null {
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

// Map Stripe subscription.status → tenant.status enum. Falls through to
// the existing tenant status for unknown / transitional states so we
// never clobber with a guess.
function mapStripeStatusToTenantStatus(
  s: Stripe.Subscription.Status,
  fallback: TenantStatus,
): TenantStatus {
  switch (s) {
    case "active":
    case "trialing":
      return "ACTIVE";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "canceled":
    case "incomplete_expired":
      return "CANCELED";
    default:
      return fallback;
  }
}
