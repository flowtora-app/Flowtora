"use server";

// M5 — Stripe sync for PricingPlan.
//
// Idempotent one-shot push: given a plan row, ensure there's a Stripe
// Product + monthly Price + (optional) annual Price that matches the
// admin-configured values, and write the resulting IDs back to the
// PricingPlan row. Runs server-side from the Pricing tab's "Sync to
// Stripe" button.
//
// Design notes:
//   • Price objects in Stripe are IMMUTABLE. We can't "change" the
//     amount on an existing Price — we always create a new one and
//     update the PricingPlan to point at it. The old Price is
//     archived (active: false) so in-flight subscriptions keep working
//     but new checkouts pick up the new Price.
//   • Product is mutable; we update name + metadata in-place.
//   • Contact-sales plans skip the Price step entirely — they get a
//     Product so Stripe metadata / coupons can attach, but no Prices.
//   • Stripe env missing? Abort cleanly with a helpful error — the
//     admin may be working in a branch without live credentials.
//
// The M6 webhook migration will lean on these IDs to resolve a
// Stripe price → PricingPlan without the legacy PRICE_IDS env map.

import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { requirePlatformAdmin, logPlatformAudit } from "@/lib/platform";
import { PRICING_CACHE_TAGS } from "@/lib/plans";

function flushPricingCaches() {
  revalidateTag(PRICING_CACHE_TAGS.published);
  revalidateTag(PRICING_CACHE_TAGS.all);
  revalidatePath("/");
  revalidatePath("/pricing");
  revalidatePath("/platform/plans");
}

// Dollars-and-cents string (e.g. "79.50" or "79") → integer cents.
// Relies on upstream Zod validation to guarantee the shape — if the
// string is malformed we throw, not silently round.
function toCents(amount: string | number | null): number | null {
  if (amount == null) return null;
  const s = String(amount).trim();
  if (!s) return null;
  const match = s.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error(`Malformed price string "${s}"`);
  const dollars = Number(match[1]);
  const centsPart = match[2] ? match[2].padEnd(2, "0") : "00";
  return dollars * 100 + Number(centsPart);
}

export async function syncPlanToStripe(planId: string) {
  const ctx = await requirePlatformAdmin();

  if (!stripe) {
    redirect(
      `/platform/plans/${planId}?tab=pricing&error=${encodeURIComponent(
        "Stripe SDK not initialized (STRIPE_SECRET_KEY missing).",
      )}`,
    );
  }

  const plan = await db.pricingPlan.findUnique({
    where: { id: planId },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      currency: true,
      priceMonthly: true,
      priceAnnual: true,
      isContactSales: true,
      stripeProductId: true,
      stripePriceMonthly: true,
      stripePriceAnnual: true,
    },
  });
  if (!plan) {
    redirect(`/platform/plans?error=${encodeURIComponent("Plan not found")}`);
  }

  // Cache what changed so we can log + message the admin precisely.
  const changes: Array<string> = [];

  try {
    // ── Product ─────────────────────────────────────────────────
    // Create if we don't have an ID yet; otherwise update in place.
    // Metadata carries the PricingPlan.slug so the webhook can
    // round-trip back to our row via Product metadata lookup if
    // Stripe Price ID matching ever falls short.
    let productId = plan.stripeProductId;
    if (!productId) {
      const created = await stripe.products.create({
        name: plan.name,
        description: plan.description ?? undefined,
        metadata: { planSlug: plan.slug, planId: plan.id },
      });
      productId = created.id;
      changes.push(`product:created(${created.id})`);
    } else {
      await stripe.products.update(productId, {
        name: plan.name,
        description: plan.description ?? undefined,
        metadata: { planSlug: plan.slug, planId: plan.id },
      });
      changes.push(`product:updated(${productId})`);
    }

    // ── Prices ──────────────────────────────────────────────────
    // Contact-sales plans skip price creation entirely. If the plan
    // was previously priced and is now contact-sales, archive any
    // existing Price rows so they stop being checkoutable.
    const currency = (plan.currency || "USD").toLowerCase();
    let newMonthlyId: string | null = plan.stripePriceMonthly;
    let newAnnualId: string | null = plan.stripePriceAnnual;

    if (plan.isContactSales) {
      if (plan.stripePriceMonthly) {
        await stripe.prices.update(plan.stripePriceMonthly, { active: false });
        changes.push(`price:archived(${plan.stripePriceMonthly})`);
        newMonthlyId = null;
      }
      if (plan.stripePriceAnnual) {
        await stripe.prices.update(plan.stripePriceAnnual, { active: false });
        changes.push(`price:archived(${plan.stripePriceAnnual})`);
        newAnnualId = null;
      }
    } else {
      // Monthly Price — replace if amount differs, reuse otherwise.
      if (plan.priceMonthly != null) {
        const targetCents = toCents(plan.priceMonthly.toString());
        const existing = plan.stripePriceMonthly
          ? await stripe.prices.retrieve(plan.stripePriceMonthly).catch(() => null)
          : null;
        const matches =
          existing &&
          existing.active &&
          existing.currency === currency &&
          existing.recurring?.interval === "month" &&
          existing.unit_amount === targetCents;

        if (!matches) {
          if (existing && existing.active) {
            await stripe.prices.update(existing.id, { active: false });
            changes.push(`price:archived(${existing.id})`);
          }
          const created = await stripe.prices.create({
            product: productId,
            currency,
            unit_amount: targetCents ?? 0,
            recurring: { interval: "month" },
            metadata: { planSlug: plan.slug, cycle: "monthly" },
          });
          newMonthlyId = created.id;
          changes.push(`price:created(monthly:${created.id})`);
        }
      } else if (plan.stripePriceMonthly) {
        // Price cleared in admin — archive the Stripe Price.
        await stripe.prices.update(plan.stripePriceMonthly, { active: false });
        changes.push(`price:archived(${plan.stripePriceMonthly})`);
        newMonthlyId = null;
      }

      // Annual Price — same dance. Distinct block so they stay
      // readable; the duplication is the price of clarity.
      if (plan.priceAnnual != null) {
        const targetCents = toCents(plan.priceAnnual.toString());
        const existing = plan.stripePriceAnnual
          ? await stripe.prices.retrieve(plan.stripePriceAnnual).catch(() => null)
          : null;
        const matches =
          existing &&
          existing.active &&
          existing.currency === currency &&
          existing.recurring?.interval === "year" &&
          existing.unit_amount === targetCents;

        if (!matches) {
          if (existing && existing.active) {
            await stripe.prices.update(existing.id, { active: false });
            changes.push(`price:archived(${existing.id})`);
          }
          const created = await stripe.prices.create({
            product: productId,
            currency,
            unit_amount: targetCents ?? 0,
            recurring: { interval: "year" },
            metadata: { planSlug: plan.slug, cycle: "annual" },
          });
          newAnnualId = created.id;
          changes.push(`price:created(annual:${created.id})`);
        }
      } else if (plan.stripePriceAnnual) {
        await stripe.prices.update(plan.stripePriceAnnual, { active: false });
        changes.push(`price:archived(${plan.stripePriceAnnual})`);
        newAnnualId = null;
      }
    }

    // ── Write back ──────────────────────────────────────────────
    await db.pricingPlan.update({
      where: { id: planId },
      data: {
        stripeProductId: productId,
        stripePriceMonthly: newMonthlyId,
        stripePriceAnnual: newAnnualId,
        stripeSyncedAt: new Date(),
      },
    });
  } catch (err) {
    // Stripe-specific errors are useful to surface verbatim (they're
    // admin-only); unknown errors get a generic label.
    const msg = err instanceof Error ? err.message : "Unknown error";
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.plan_stripe_sync_failed",
      entityType: "PricingPlan",
      entityId: planId,
      metadata: { error: msg, changes, actor: ctx.email },
    });
    redirect(
      `/platform/plans/${planId}?tab=pricing&error=${encodeURIComponent(
        `Stripe sync failed: ${msg}`,
      )}`,
    );
  }

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.plan_stripe_synced",
    entityType: "PricingPlan",
    entityId: planId,
    metadata: { slug: plan.slug, changes, actor: ctx.email },
  });

  flushPricingCaches();
  redirect(`/platform/plans/${planId}?tab=pricing&ok=stripe-synced`);
}
