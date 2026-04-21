import Stripe from "stripe";

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-02-24.acacia" })
  : null;

// Price IDs are keyed by plan × billing cycle. Monthly IDs have been
// in production since initial launch; annual IDs were added when the
// marketing site started surfacing "save 20%" annual pricing (see
// /pricing). Both fields fall back to the empty string when the env
// var is missing so billing helpers can detect "annual not configured
// yet" and gracefully fall back to monthly.
export const PRICE_IDS = {
  STARTER: {
    monthly: process.env.STRIPE_PRICE_STARTER ?? "",
    annual: process.env.STRIPE_PRICE_STARTER_ANNUAL ?? "",
  },
  GROWTH: {
    monthly: process.env.STRIPE_PRICE_GROWTH ?? "",
    annual: process.env.STRIPE_PRICE_GROWTH_ANNUAL ?? "",
  },
  PRO: {
    monthly: process.env.STRIPE_PRICE_PRO ?? "",
    annual: process.env.STRIPE_PRICE_PRO_ANNUAL ?? "",
  },
} as const;

export type BillingCycle = "monthly" | "annual";
