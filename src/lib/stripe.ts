import Stripe from "stripe";

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-02-24.acacia" })
  : null;

export const PRICE_IDS = {
  STARTER: process.env.STRIPE_PRICE_STARTER ?? "",
  GROWTH: process.env.STRIPE_PRICE_GROWTH ?? "",
  PRO: process.env.STRIPE_PRICE_PRO ?? "",
} as const;
