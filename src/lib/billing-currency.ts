// Phase 3 — currency support for platform billing.
//
// We deliberately curate a small list (~12 currencies covering all
// existing tenant geographies) instead of accepting any ISO 4217 code.
// Real reasons:
//   1. We need a symbol + decimals for formatting; ISO doesn't bundle
//      either (a JPY value of 100 means ¥100, but a USD value of 100
//      means $1.00 — getting decimals right is load-bearing).
//   2. Static FX rates for cross-currency analytics (revenue page) are
//      pegged to USD here. Per-tenant invoicing locks to the issued
//      currency at issuance — we don't try to recompute past invoices
//      when rates drift.
//   3. We hand the list to admins as a dropdown — letting them pick
//      ZWL would just be an exception waiting to happen.
//
// To add a currency: add a row + an FX rate. To remove a currency:
// don't remove it if any tenant or PlatformBillingInvoice still uses
// it. (Defer that cleanup to a real migration when it's needed.)

export type SupportedCurrency =
  | "USD" | "EUR" | "GBP" | "CAD" | "AUD" | "NZD"
  | "JPY" | "CHF" | "SEK" | "MXN" | "BRL" | "INR";

interface CurrencyMeta {
  code: SupportedCurrency;
  symbol: string;
  /** ISO 4217 minor-unit count (USD=2 → cents; JPY=0 → no subunit). */
  decimals: number;
  /** Human label for dropdowns. */
  label: string;
  /** Locale used by Intl.NumberFormat for the symbol + grouping. */
  locale: string;
  /**
   * Snapshot rate vs USD (1 USD = N units of this currency). Refreshed
   * by hand — stale data is fine for dashboards, never used for
   * customer-facing math. Rates as of 2026-Q1.
   */
  rateVsUsd: number;
}

const REGISTRY: Record<SupportedCurrency, CurrencyMeta> = {
  USD: { code: "USD", symbol: "$",   decimals: 2, label: "US Dollar",          locale: "en-US",  rateVsUsd: 1 },
  EUR: { code: "EUR", symbol: "€",   decimals: 2, label: "Euro",               locale: "de-DE",  rateVsUsd: 0.92 },
  GBP: { code: "GBP", symbol: "£",   decimals: 2, label: "British Pound",      locale: "en-GB",  rateVsUsd: 0.78 },
  CAD: { code: "CAD", symbol: "CA$", decimals: 2, label: "Canadian Dollar",    locale: "en-CA",  rateVsUsd: 1.36 },
  AUD: { code: "AUD", symbol: "A$",  decimals: 2, label: "Australian Dollar",  locale: "en-AU",  rateVsUsd: 1.52 },
  NZD: { code: "NZD", symbol: "NZ$", decimals: 2, label: "NZ Dollar",          locale: "en-NZ",  rateVsUsd: 1.65 },
  JPY: { code: "JPY", symbol: "¥",   decimals: 0, label: "Japanese Yen",       locale: "ja-JP",  rateVsUsd: 150 },
  CHF: { code: "CHF", symbol: "CHF", decimals: 2, label: "Swiss Franc",        locale: "de-CH",  rateVsUsd: 0.88 },
  SEK: { code: "SEK", symbol: "kr",  decimals: 2, label: "Swedish Krona",      locale: "sv-SE",  rateVsUsd: 10.5 },
  MXN: { code: "MXN", symbol: "MX$", decimals: 2, label: "Mexican Peso",       locale: "es-MX",  rateVsUsd: 17 },
  BRL: { code: "BRL", symbol: "R$",  decimals: 2, label: "Brazilian Real",     locale: "pt-BR",  rateVsUsd: 5.0 },
  INR: { code: "INR", symbol: "₹",   decimals: 2, label: "Indian Rupee",       locale: "en-IN",  rateVsUsd: 83 },
};

export const SUPPORTED_CURRENCIES: SupportedCurrency[] = Object.keys(REGISTRY) as SupportedCurrency[];

export function isSupportedCurrency(code: string | null | undefined): code is SupportedCurrency {
  return !!code && code in REGISTRY;
}

export function currencyMeta(code: string): CurrencyMeta {
  if (isSupportedCurrency(code)) return REGISTRY[code];
  // Fall back to USD when we encounter something unfamiliar — better
  // to render a value than to crash, and the audit log will surface
  // bad data via the `currency` mismatch.
  return REGISTRY.USD;
}

/**
 * Format a money amount given in MINOR units (cents for USD,
 * yen for JPY) using the currency's locale + decimal count.
 *
 *   formatMoney(2599, "USD") => "$25.99"
 *   formatMoney(2599, "JPY") => "¥2,599"
 */
export function formatMoney(minor: number, code: string): string {
  const meta = currencyMeta(code);
  const major = minor / Math.pow(10, meta.decimals);
  return new Intl.NumberFormat(meta.locale, {
    style: "currency",
    currency: meta.code,
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  }).format(major);
}

/** Symbol-only short form, useful in dense tables. */
export function currencySymbol(code: string): string {
  return currencyMeta(code).symbol;
}

/**
 * Convert a minor-unit amount from `from` currency into USD minor units
 * using the static rate table. Pure dashboard math; never use this for
 * billing the customer.
 */
export function convertToUsdMinor(minor: number, from: string): number {
  const meta = currencyMeta(from);
  if (meta.code === "USD") return minor;
  // amount in major units of `from`
  const major = minor / Math.pow(10, meta.decimals);
  // rateVsUsd: 1 USD = rateVsUsd units of `from`. So USD = major / rate.
  const usdMajor = major / meta.rateVsUsd;
  // Always emit USD as cents (decimals=2).
  return Math.round(usdMajor * 100);
}

/**
 * Apply a coupon to a subtotal expressed in minor units of `currency`.
 * Returns the discount amount in the same minor unit (positive number)
 * and the post-discount line total. Refuses to discount below zero.
 */
export function applyCouponDiscount(opts: {
  subtotalMinor: number;
  currency: string;
  couponDiscountType: "PERCENT" | "FIXED";
  couponAmount: number;
  couponCurrency: string | null;
}): { discountMinor: number; netMinor: number; mismatch: boolean } {
  if (opts.subtotalMinor <= 0) {
    return { discountMinor: 0, netMinor: opts.subtotalMinor, mismatch: false };
  }
  if (opts.couponDiscountType === "PERCENT") {
    const pct = Math.max(0, Math.min(100, opts.couponAmount));
    const discount = Math.floor((opts.subtotalMinor * pct) / 100);
    return {
      discountMinor: discount,
      netMinor: opts.subtotalMinor - discount,
      mismatch: false,
    };
  }
  // FIXED — coupon currency must match the invoice currency, otherwise
  // we'd be silently converting at an arbitrary rate. Surface as a flag
  // so the caller can refuse to apply.
  if (opts.couponCurrency && opts.couponCurrency !== opts.currency) {
    return { discountMinor: 0, netMinor: opts.subtotalMinor, mismatch: true };
  }
  const discount = Math.min(opts.subtotalMinor, Math.max(0, opts.couponAmount));
  return {
    discountMinor: discount,
    netMinor: opts.subtotalMinor - discount,
    mismatch: false,
  };
}
