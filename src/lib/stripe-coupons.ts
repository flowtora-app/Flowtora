import { stripe } from "@/lib/stripe";
import type { Coupon } from "@prisma/client";

// Phase 3 follow-up — Stripe coupon mirror.
//
// Local Coupon rows are the source of truth for the admin surface; we
// mirror them to Stripe so the discount actually applies on the
// recurring subscription cycle (Stripe Coupons attach to subscriptions
// via `discounts: [{ coupon }]`). Manual invoices already honor the
// discount through our own math, so this is the missing piece.
//
// Strategy:
//   - We use the local Coupon.code as the Stripe coupon ID so the two
//     IDs stay grep-able from the same string.
//   - PERCENT coupons: `percent_off` (1-100), `duration: "once"` so the
//     discount applies to a single invoice (matches our intent of
//     "next manual invoice"). A future slice could expose `forever` /
//     `repeating` durations.
//   - FIXED coupons: `amount_off` in minor units of `currency`. Stripe
//     locks coupons to one currency.
//   - validUntil → `redeem_by` (unix timestamp).
//   - maxRedemptions → `max_redemptions`.
//
// Failure handling: if Stripe is not configured or the API call fails,
// we don't block the local create — the coupon still exists locally
// and the operator can retry sync from the admin UI. We surface the
// outcome so the caller can audit it.

export type StripeSyncResult =
  | { ok: true; stripeCouponId: string }
  | { ok: false; reason: string };

interface CouponLike extends Pick<
  Coupon,
  "code" | "discountType" | "amount" | "currency" | "validUntil" | "maxRedemptions" | "description"
> {}

export async function pushCouponToStripe(c: CouponLike): Promise<StripeSyncResult> {
  if (!stripe) {
    return { ok: false, reason: "stripe_not_configured" };
  }

  // Stripe's coupon ID is what customers see at checkout — they're
  // not separately resettable, so we accept whatever code the admin
  // chose. Stripe rejects IDs longer than ~80 chars but our own RX
  // caps at 32, which is well within bounds.
  const id = c.code;

  // Stripe wants `redeem_by` as a unix timestamp (seconds, not ms).
  const redeemBy = c.validUntil ? Math.floor(c.validUntil.getTime() / 1000) : undefined;

  // Stripe accepts at most one of percent_off / amount_off per coupon.
  // PERCENT coupons don't carry a currency; FIXED coupons must.
  const base: Record<string, unknown> = {
    id,
    duration: "once",  // single-invoice discount; matches our manual-invoice intent
    name: c.description ?? c.code,
    ...(redeemBy ? { redeem_by: redeemBy } : {}),
    ...(c.maxRedemptions ? { max_redemptions: c.maxRedemptions } : {}),
  };
  if (c.discountType === "PERCENT") {
    base.percent_off = c.amount;
  } else {
    if (!c.currency) {
      return { ok: false, reason: "fixed_coupon_missing_currency" };
    }
    base.amount_off = c.amount;
    base.currency = c.currency.toLowerCase();
  }

  try {
    // Try to update an existing coupon first — if the admin is rerunning
    // sync after a local edit, we don't want a "coupon already exists"
    // error. Stripe's update endpoint only allows changing `name` and
    // metadata; everything else is immutable. So:
    //   - If retrieve succeeds → `update` (touches name only).
    //   - If retrieve 404s → `create`.
    try {
      await stripe.coupons.retrieve(id);
      await stripe.coupons.update(id, { name: base.name as string });
      return { ok: true, stripeCouponId: id };
    } catch (err) {
      const e = err as { statusCode?: number };
      if (e.statusCode !== 404) throw err;
      // Falls through to create below.
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const created = await stripe.coupons.create(base as any);
    return { ok: true, stripeCouponId: created.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: msg.slice(0, 200) };
  }
}

export async function deleteCouponFromStripe(stripeCouponId: string): Promise<StripeSyncResult> {
  if (!stripe) return { ok: false, reason: "stripe_not_configured" };
  try {
    await stripe.coupons.del(stripeCouponId);
    return { ok: true, stripeCouponId };
  } catch (err) {
    const e = err as { statusCode?: number; message?: string };
    // 404 from Stripe — coupon already gone, treat as success so retries
    // converge.
    if (e.statusCode === 404) return { ok: true, stripeCouponId };
    return { ok: false, reason: (e.message ?? String(err)).slice(0, 200) };
  }
}
