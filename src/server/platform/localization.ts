// Page 67 — Localization data layer.

import { db } from "@/lib/db";
import type {
  LocaleStatus,
  FxSource,
  CurrencyStatus,
  TranslationStatus,
  TranslationModule,
  PaperSize,
} from "@prisma/client";

const DAY = 86_400_000;

/* ── Labels & tone palettes ────────────────────────────── */

export const LOCALE_STATUS_TONE: Record<
  LocaleStatus,
  { bg: string; fg: string; label: string }
> = {
  ENABLED: { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Enabled" },
  BETA:    { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Beta" },
  HIDDEN:  { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Hidden" },
};

export const CURRENCY_STATUS_TONE: Record<
  CurrencyStatus,
  { bg: string; fg: string; label: string }
> = {
  ACTIVE:   { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Active" },
  INACTIVE: { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Inactive" },
};

export const FX_SOURCE_LABEL: Record<FxSource, string> = {
  ECB:                 "European Central Bank",
  OPEN_EXCHANGE_RATES: "Open Exchange Rates",
  FIXER:               "Fixer.io",
  MANUAL:              "Manual override",
};

export const TRANSLATION_STATUS_TONE: Record<
  TranslationStatus,
  { bg: string; fg: string; label: string }
> = {
  TRANSLATED:    { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Translated" },
  PENDING:       { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Pending" },
  OUTDATED:      { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Outdated" },
  NEEDS_REVIEW:  { bg: "var(--violet-100)",  fg: "var(--violet-700)",  label: "Needs review" },
};

export const TRANSLATION_MODULE_LABEL: Record<TranslationModule, string> = {
  ADMIN:      "Admin",
  TENANT_APP: "Tenant App",
  EMAIL:      "Email",
  SMS:        "SMS",
  MARKETING:  "Marketing",
};

export const PAPER_SIZE_LABEL: Record<PaperSize, string> = {
  LETTER: "Letter (US)",
  A4:     "A4",
};

/* ── Loaders ──────────────────────────────────────────── */

export async function loadLocales() {
  return db.platformLocale.findMany({
    orderBy: [{ status: "asc" }, { code: "asc" }],
  });
}

export async function loadLocaleDetail(code: string) {
  return db.platformLocale.findUnique({
    where: { code },
    include: {
      statsTrend: {
        where: { day: { gte: new Date(Date.now() - 30 * DAY) } },
        orderBy: { day: "asc" },
      },
    },
  });
}

export async function loadCurrencies() {
  return db.platformCurrency.findMany({
    orderBy: [{ status: "asc" }, { code: "asc" }],
  });
}

export async function loadTranslationKeys(args: {
  module?: TranslationModule;
  search?: string;
  limit?: number;
}) {
  const where: Record<string, unknown> = {};
  if (args.module) where.module = args.module;
  if (args.search) {
    where.OR = [
      { key:        { contains: args.search, mode: "insensitive" } },
      { sourceText: { contains: args.search, mode: "insensitive" } },
    ];
  }
  return db.translationKey.findMany({
    where,
    orderBy: [{ module: "asc" }, { key: "asc" }],
    take: Math.min(args.limit ?? 100, 500),
  });
}

export async function loadKeyDetail(keyId: string) {
  return db.translationKey.findUnique({
    where: { id: keyId },
    include: {
      translations: {
        include: { locale: { select: { code: true, language: true, region: true, rtl: true } } },
      },
    },
  });
}

export async function loadGlossary() {
  return db.glossaryEntry.findMany({ orderBy: { term: "asc" } });
}

export async function loadLocalizationSettings() {
  let row = await db.localizationSettings.findUnique({ where: { id: "default" } });
  if (!row) row = await db.localizationSettings.create({ data: { id: "default" } });
  return row;
}

/* ── KPIs ─────────────────────────────────────────────── */

export interface LocalizationKpis {
  totalLocales: number;
  enabledLocales: number;
  rtlLocales: number;
  totalCurrencies: number;
  activeCurrencies: number;
  totalKeys: number;
  pendingTranslations: number;
  outdatedTranslations: number;
}

export async function loadLocalizationKpis(): Promise<LocalizationKpis> {
  const [locales, currencies, keys, pending, outdated] = await Promise.all([
    db.platformLocale.findMany({ select: { status: true, rtl: true } }),
    db.platformCurrency.findMany({ select: { status: true } }),
    db.translationKey.count(),
    db.translation.count({ where: { status: "PENDING" } }),
    db.translation.count({ where: { status: "OUTDATED" } }),
  ]);
  return {
    totalLocales:    locales.length,
    enabledLocales:  locales.filter((l) => l.status === "ENABLED").length,
    rtlLocales:      locales.filter((l) => l.rtl).length,
    totalCurrencies: currencies.length,
    activeCurrencies: currencies.filter((c) => c.status === "ACTIVE").length,
    totalKeys:       keys,
    pendingTranslations:  pending,
    outdatedTranslations: outdated,
  };
}

/* ── Helpers ──────────────────────────────────────────── */

export function localeProgressPct(locale: {
  totalKeys: number; translatedCount: number;
}): number {
  if (locale.totalKeys === 0) return 0;
  return Math.round((locale.translatedCount / locale.totalKeys) * 100);
}

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

/* ── Variable validation ──────────────────────────────── */

/** Extract `{var}` and `{var, plural, …}` placeholders from a string. */
export function extractVariables(text: string): string[] {
  const matches = text.match(/\{[a-zA-Z_][a-zA-Z0-9_]*(,\s*[^}]+)?\}/g) ?? [];
  return Array.from(new Set(matches.map((m) => m.split(",")[0]!.trim().replace(/[{}]/g, "")))).map((n) => `{${n}}`);
}

export function missingVariables(source: string, target: string): string[] {
  const src = extractVariables(source);
  const tgt = new Set(extractVariables(target));
  return src.filter((v) => !tgt.has(v));
}

/* ── Aggregate page loader ────────────────────────────── */

export async function loadLocalizationPage() {
  const [kpis, locales, currencies, glossary, settings] = await Promise.all([
    loadLocalizationKpis(),
    loadLocales(),
    loadCurrencies(),
    loadGlossary(),
    loadLocalizationSettings(),
  ]);
  return { kpis, locales, currencies, glossary, settings };
}
