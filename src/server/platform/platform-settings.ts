// Page 65 — Platform Settings data layer.

import { db } from "@/lib/db";
import type {
  SystemBannerVariant,
  FirstDayOfWeek,
  TimeFormat,
  MeasurementSystem,
} from "@prisma/client";

/* ── Static lists for selects ──────────────────────────── */

export const TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Toronto",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Athens",
  "Africa/Cairo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];

export const LANGUAGES = [
  { code: "en-US", label: "English (United States)" },
  { code: "en-GB", label: "English (United Kingdom)" },
  { code: "en-AU", label: "English (Australia)" },
  { code: "es-MX", label: "Spanish (Mexico)" },
  { code: "es-ES", label: "Spanish (Spain)" },
  { code: "fr-FR", label: "French (France)" },
  { code: "fr-CA", label: "French (Canada)" },
  { code: "de-DE", label: "German" },
  { code: "it-IT", label: "Italian" },
  { code: "pt-BR", label: "Portuguese (Brazil)" },
  { code: "pt-PT", label: "Portuguese (Portugal)" },
  { code: "nl-NL", label: "Dutch" },
  { code: "ja-JP", label: "Japanese" },
  { code: "zh-CN", label: "Chinese (Simplified)" },
  { code: "ko-KR", label: "Korean" },
  { code: "ar-SA", label: "Arabic" },
];

export const CURRENCIES = [
  "USD", "EUR", "GBP", "CAD", "AUD", "MXN", "BRL", "JPY", "CNY", "INR",
  "AED", "CHF", "SEK", "NOK", "DKK", "NZD", "ZAR", "SGD", "HKD",
];

export const DATE_FORMATS = ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD", "DD MMM YYYY"];

export const TIME_FORMAT_LABEL: Record<TimeFormat, string> = {
  TWELVE_HOUR:        "12-hour (1:30 PM)",
  TWENTY_FOUR_HOUR:   "24-hour (13:30)",
};

export const FIRST_DAY_LABEL: Record<FirstDayOfWeek, string> = {
  SUNDAY: "Sunday",
  MONDAY: "Monday",
};

export const MEASUREMENT_LABEL: Record<MeasurementSystem, string> = {
  IMPERIAL: "Imperial (in, ft, lb, °F)",
  METRIC:   "Metric (cm, m, kg, °C)",
};

export const BANNER_VARIANT_LABEL: Record<SystemBannerVariant, string> = {
  INFO:    "Info (blue)",
  SUCCESS: "Success (green)",
  WARNING: "Warning (amber)",
  DANGER:  "Danger (red)",
};

export const BANNER_VARIANT_TONE: Record<
  SystemBannerVariant,
  { bg: string; fg: string }
> = {
  INFO:    { bg: "var(--sky-100)",     fg: "var(--sky-700)" },
  SUCCESS: { bg: "var(--emerald-100)", fg: "var(--emerald-700)" },
  WARNING: { bg: "var(--amber-100)",   fg: "var(--amber-700)" },
  DANGER:  { bg: "var(--rose-100)",    fg: "var(--rose-700)" },
};

/* ── Business hours / holidays types ───────────────────── */

export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export const WEEKDAYS: { key: WeekdayKey; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

export interface BusinessHours {
  /** "HH:MM" 24-hour or empty/null = closed that day. */
  [key: string]: { open: string; close: string; closed?: boolean } | undefined;
}

export interface HolidayEntry {
  date: string; // "YYYY-MM-DD"
  name: string;
}

export function parseBusinessHours(raw: unknown): BusinessHours {
  if (!raw || typeof raw !== "object") return {};
  return raw as BusinessHours;
}

export function parseHolidays(raw: unknown): HolidayEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((h): h is HolidayEntry =>
    h && typeof h === "object" && typeof h.date === "string" && typeof h.name === "string",
  );
}

/* ── Feature defaults ──────────────────────────────────── */

export interface FeatureDefault {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
}

/** Built-in feature toggles. Stored as JSON map: { key: boolean } */
export const FEATURE_DEFAULT_CATALOG: Array<{ key: string; label: string; description: string; defaultOn: boolean }> = [
  { key: "advanced_reports",      label: "Advanced reports", description: "Custom report builder + scheduled exports.", defaultOn: true  },
  { key: "ai_quotes",             label: "AI quote suggestions", description: "AI-driven line-item suggestions on quotes.", defaultOn: false },
  { key: "realtime_collab",       label: "Real-time collaboration", description: "Multi-cursor quote editing.", defaultOn: false },
  { key: "vendor_portal",         label: "Vendor portal", description: "Self-service vendor lead-time + stock updates.", defaultOn: false },
  { key: "bulk_invoice_export",   label: "Bulk invoice export", description: "Export 1000+ invoices as a single CSV.", defaultOn: false },
  { key: "branded_emails",        label: "Per-tenant branded emails", description: "Custom logo + accent in transactional emails.", defaultOn: true  },
  { key: "two_factor_required",   label: "Force tenant 2FA", description: "Require all tenant users to enable 2FA.", defaultOn: false },
  { key: "sso",                   label: "SSO (SAML/OIDC)", description: "Enterprise SSO providers.", defaultOn: false },
];

export function parseFeatureDefaults(raw: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const f of FEATURE_DEFAULT_CATALOG) {
    out[f.key] = f.defaultOn;
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "boolean") out[k] = v;
    }
  }
  return out;
}

/* ── Loaders ───────────────────────────────────────────── */

export async function loadPlatformSettings() {
  let row = await db.platformSettings.findUnique({ where: { id: "default" } });
  if (!row) {
    // First-load: create defaults.
    row = await db.platformSettings.create({ data: { id: "default" } });
  }
  return row;
}

export async function loadSettingsChanges(limit = 30) {
  return db.platformSettingsChange.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/* ── Helpers ───────────────────────────────────────────── */

export function relativeFromNow(d: Date | null | undefined): string {
  if (!d) return "—";
  const ms = Date.now() - d.getTime();
  const future = ms < 0;
  const abs = Math.abs(ms);
  const mins = Math.round(abs / 60_000);
  const fmt = (s: string) => future ? `in ${s}` : `${s} ago`;
  if (mins < 1)  return future ? "soon" : "just now";
  if (mins < 60) return fmt(`${mins}m`);
  const hrs = Math.round(mins / 60);
  if (hrs < 24)  return fmt(`${hrs}h`);
  const days = Math.round(hrs / 24);
  if (days < 30) return fmt(`${days}d`);
  const months = Math.round(days / 30);
  return fmt(`${months}mo`);
}

export function shortDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 10);
}

export function shortDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 16).replace("T", " ");
}

/* ── Aggregate page loader ──────────────────────────────── */

export async function loadPlatformSettingsPage() {
  const [settings, changes] = await Promise.all([
    loadPlatformSettings(),
    loadSettingsChanges(50),
  ]);
  return { settings, changes };
}
