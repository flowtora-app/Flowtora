// Loader for the NotificationBrand singleton.
//
// Reads the single `singleton = true` row from the DB and caches it in
// memory for 30 seconds. If the row doesn't exist (fresh install, or
// someone deleted it from psql), we fall through to a hardcoded
// default that exactly matches the current shipped email look — this
// is the same safety-net philosophy as the template code-defaults:
// delete every DB row and emails still go out with the correct brand.

import { db } from "@/lib/db";

export interface BrandSnapshot {
  productName: string;
  tagline: string;
  logoUrl: string | null;
  accentColor: string;
  buttonRadiusPx: number;
  supportEmail: string | null;
  footerHtml: string | null;
  fromName: string | null;
  replyTo: string | null;
}

// Compile-time fallback — mirrors the current hardcoded values in
// brandedEmailLayout() / footer lines. Keep these in sync when
// branding copy changes in code.
export const DEFAULT_BRAND: BrandSnapshot = {
  productName: "Flowtora",
  tagline: "A calm ops platform for sign & print shops.",
  logoUrl: null,
  accentColor: "#4f8cff",
  buttonRadiusPx: 10,
  supportEmail: null,
  footerHtml: null,
  fromName: null,
  replyTo: null,
};

// Short in-process cache. Brand reads happen on every email send,
// and the row is admin-edited at most a few times per month —
// re-hitting Postgres every send is wasteful.
let cache: { at: number; brand: BrandSnapshot } | null = null;
const CACHE_TTL_MS = 30 * 1000;

export function invalidateBrandCache() {
  cache = null;
}

export async function loadBrand(): Promise<BrandSnapshot> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.brand;

  try {
    const row = await db.notificationBrand.findUnique({
      where: { singleton: true },
    });
    const brand: BrandSnapshot = row
      ? {
          productName: row.productName,
          tagline: row.tagline,
          logoUrl: row.logoUrl,
          accentColor: row.accentColor,
          buttonRadiusPx: row.buttonRadiusPx,
          supportEmail: row.supportEmail,
          footerHtml: row.footerHtml,
          fromName: row.fromName,
          replyTo: row.replyTo,
        }
      : DEFAULT_BRAND;
    cache = { at: Date.now(), brand };
    return brand;
  } catch {
    // DB read failed — never block an outbound email on a brand
    // lookup. Return the compile-time default and skip caching so
    // the next call retries.
    return DEFAULT_BRAND;
  }
}

// Hex-color sanitizer for accent color. The admin UI will validate
// on save, but defense-in-depth — if the DB somehow holds
// "red; background:" we still emit a valid CSS value.
export function safeHex(input: string, fallback = "#4f8cff"): string {
  const trimmed = input.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) return trimmed;
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  return fallback;
}
