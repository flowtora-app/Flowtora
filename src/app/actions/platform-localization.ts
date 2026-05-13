"use server";

// Page 67 — Localization actions.

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import { extractVariables, missingVariables } from "@/server/platform/localization";
import type {
  LocaleStatus,
  FxSource,
  CurrencyStatus,
  TranslationStatus,
  TranslationModule,
  PaperSize,
} from "@prisma/client";

const ROUTE = "/platform/settings/localization";
const PERM_MANAGE    = "localization.manage"    as const;
const PERM_TRANSLATE = "localization.translate" as const;

const LOCALE_STATUSES = ["ENABLED", "BETA", "HIDDEN"] as const;
const FX_SOURCES      = ["ECB", "OPEN_EXCHANGE_RATES", "FIXER", "MANUAL"] as const;
const CURR_STATUSES   = ["ACTIVE", "INACTIVE"] as const;
const TRANS_STATUSES  = ["TRANSLATED", "PENDING", "OUTDATED", "NEEDS_REVIEW"] as const;
const MODULES         = ["ADMIN", "TENANT_APP", "EMAIL", "SMS", "MARKETING"] as const;
const PAPER_SIZES     = ["LETTER", "A4"] as const;

function hashSource(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

async function recomputeLocaleStats(localeId: string) {
  const grouped = await db.translation.groupBy({
    by: ["status"],
    where: { localeId },
    _count: { _all: true },
  });
  const counts = { TRANSLATED: 0, PENDING: 0, OUTDATED: 0, NEEDS_REVIEW: 0 } as Record<TranslationStatus, number>;
  for (const g of grouped) counts[g.status] = g._count._all;
  const totalKeys = await db.translationKey.count();
  await db.platformLocale.update({
    where: { id: localeId },
    data: {
      totalKeys,
      translatedCount: counts.TRANSLATED,
      pendingCount:    counts.PENDING,
      outdatedCount:   counts.OUTDATED,
      reviewCount:     counts.NEEDS_REVIEW,
    },
  });
}

/* ── Locale CRUD ──────────────────────────────────────── */

const localeSchema = z.object({
  id:               z.string().optional(),
  code:             z.string().min(2).max(20).regex(/^[a-z]{2}(-[A-Z]{2,3})?$/, "BCP 47 like en-US"),
  language:         z.string().min(1).max(80),
  region:           z.string().max(80).optional(),
  status:           z.enum(LOCALE_STATUSES),
  rtl:              z.union([z.literal("on"), z.literal("")]).optional(),
  source:           z.string().max(60).optional(),
  ownerEmail:       z.string().email().or(z.literal("")).optional(),
  dateFormat:       z.string().max(40).optional(),
  timeFormat:       z.string().max(40).optional(),
  decimalSeparator: z.string().max(2).optional(),
  thousandSeparator: z.string().max(2).optional(),
  paperSize:        z.enum(PAPER_SIZES),
  phoneFormat:      z.string().max(80).optional(),
  addressFormat:    z.string().max(400).optional(),
  notes:            z.string().max(1000).optional(),
});

export async function saveLocale(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = localeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid");
    redirect(`${ROUTE}?tab=languages&error=${msg}#languages`);
  }
  const d = parsed.data;
  const data = {
    language: d.language, region: d.region || null,
    status: d.status as LocaleStatus,
    rtl: d.rtl === "on",
    source: d.source || null,
    ownerEmail: d.ownerEmail || null,
    dateFormat: d.dateFormat || null,
    timeFormat: d.timeFormat || null,
    decimalSeparator: d.decimalSeparator || ".",
    thousandSeparator: d.thousandSeparator || ",",
    paperSize: d.paperSize as PaperSize,
    phoneFormat: d.phoneFormat || null,
    addressFormat: d.addressFormat || null,
    notes: d.notes || null,
  };
  const existing = await db.platformLocale.findUnique({ where: { code: d.code } });
  const row = await db.platformLocale.upsert({
    where: { code: d.code },
    create: { code: d.code, ...data },
    update: data,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.localization.locale_saved",
    entityType: "PlatformLocale", entityId: row.id,
    metadata: { actor: ctx.email, code: d.code, created: !existing },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=languages&locale=${row.code}&ok=locale-saved#languages`);
}

const idSchema = z.object({ id: z.string().min(1) });

export async function deleteLocale(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=languages&error=Invalid#languages`);
  const row = await db.platformLocale.findUnique({ where: { id: parsed.data.id } });
  if (row?.code === "en-US") {
    redirect(`${ROUTE}?tab=languages&error=${encodeURIComponent("Cannot delete the source locale")}#languages`);
  }
  await db.platformLocale.delete({ where: { id: parsed.data.id } });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.localization.locale_deleted",
    entityType: "PlatformLocale", entityId: parsed.data.id,
    metadata: { actor: ctx.email, code: row?.code },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=languages&ok=locale-deleted#languages`);
}

/* ── Currency CRUD ────────────────────────────────────── */

const currencySchema = z.object({
  id:           z.string().optional(),
  code:         z.string().length(3).regex(/^[A-Z]{3}$/, "ISO 4217 (3 uppercase letters)"),
  name:         z.string().min(1).max(120),
  symbol:       z.string().min(1).max(8),
  decimals:     z.coerce.number().int().min(0).max(8),
  fxRate:       z.coerce.number().min(0).max(1000000),
  fxSource:     z.enum(FX_SOURCES),
  manualOverride: z.string().optional(),
  marginPct:    z.coerce.number().min(0).max(100),
  status:       z.enum(CURR_STATUSES),
  notes:        z.string().max(500).optional(),
});

export async function saveCurrency(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = currencySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid");
    redirect(`${ROUTE}?tab=currencies&error=${msg}#currencies`);
  }
  const d = parsed.data;
  const manual = d.manualOverride && d.manualOverride.trim()
    ? Math.max(0, parseFloat(d.manualOverride) || 0) : null;
  const data = {
    name: d.name, symbol: d.symbol, decimals: d.decimals,
    fxRate: d.fxRate,
    fxSource: d.fxSource as FxSource,
    fxLastUpdatedAt: new Date(),
    manualOverride: manual,
    marginPct: d.marginPct,
    status: d.status as CurrencyStatus,
    notes: d.notes || null,
  };
  const existing = await db.platformCurrency.findUnique({ where: { code: d.code } });
  const row = await db.platformCurrency.upsert({
    where: { code: d.code },
    create: { code: d.code, ...data },
    update: data,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.localization.currency_saved",
    entityType: "PlatformCurrency", entityId: row.id,
    metadata: { actor: ctx.email, code: d.code, rate: d.fxRate, created: !existing },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=currencies&ok=currency-saved#currencies`);
}

export async function deleteCurrency(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=currencies&error=Invalid#currencies`);
  await db.platformCurrency.delete({ where: { id: parsed.data.id } });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.localization.currency_deleted",
    entityType: "PlatformCurrency", entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=currencies&ok=currency-deleted#currencies`);
}

/* ── Translation Key + Translation save ──────────────── */

const keySchema = z.object({
  id:         z.string().optional(),
  key:        z.string().min(1).max(200).regex(/^[a-z0-9_.-]+$/i, "Use letters, digits, ., -, _"),
  sourceText: z.string().min(1).max(2000),
  module:     z.enum(MODULES),
  context:    z.string().max(500).optional(),
  hasPlurals: z.union([z.literal("on"), z.literal("")]).optional(),
  doNotTranslate: z.union([z.literal("on"), z.literal("")]).optional(),
});

export async function saveTranslationKey(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = keySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid");
    redirect(`${ROUTE}?tab=editor&error=${msg}#editor`);
  }
  const d = parsed.data;
  const variables = extractVariables(d.sourceText);
  const data = {
    sourceText: d.sourceText,
    module: d.module as TranslationModule,
    context: d.context || null,
    hasPlurals: d.hasPlurals === "on",
    hasVariables: variables.length > 0,
    variables,
    doNotTranslate: d.doNotTranslate === "on",
  };
  const existing = await db.translationKey.findUnique({ where: { key: d.key } });
  const row = await db.translationKey.upsert({
    where: { key: d.key },
    create: { key: d.key, ...data },
    update: data,
  });
  // If sourceText changed, mark dependent translations OUTDATED.
  if (existing && existing.sourceText !== d.sourceText) {
    await db.translation.updateMany({
      where: { keyId: row.id, status: "TRANSLATED" },
      data: { status: "OUTDATED" },
    });
  }
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.localization.key_saved",
    entityType: "TranslationKey", entityId: row.id,
    metadata: { actor: ctx.email, key: d.key },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=editor&keyId=${row.id}&ok=key-saved#editor`);
}

export async function deleteTranslationKey(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=editor&error=Invalid#editor`);
  await db.translationKey.delete({ where: { id: parsed.data.id } });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.localization.key_deleted",
    entityType: "TranslationKey", entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=editor&ok=key-deleted#editor`);
}

const translationSchema = z.object({
  keyId:     z.string().min(1),
  localeId:  z.string().min(1),
  text:      z.string().max(4000).optional(),
  status:    z.enum(TRANS_STATUSES).optional(),
  comments:  z.string().max(1000).optional(),
});

export async function saveTranslation(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_TRANSLATE);
  const parsed = translationSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid");
    redirect(`${ROUTE}?tab=editor&error=${msg}#editor`);
  }
  const d = parsed.data;
  const key = await db.translationKey.findUnique({ where: { id: d.keyId } });
  if (!key) redirect(`${ROUTE}?tab=editor&error=Key%20not%20found#editor`);
  // Variable validation
  const text = d.text ?? "";
  if (text.length > 0) {
    const missing = missingVariables(key.sourceText, text);
    if (missing.length > 0) {
      const msg = encodeURIComponent(`Missing variables: ${missing.join(", ")}`);
      redirect(`${ROUTE}?tab=editor&keyId=${d.keyId}&error=${msg}#editor`);
    }
  }
  // Determine status: TRANSLATED if text given and sourceHash matches, else PENDING.
  const finalStatus: TranslationStatus = d.status
    ?? (text.length > 0 ? "TRANSLATED" : "PENDING");
  const row = await db.translation.upsert({
    where: { keyId_localeId: { keyId: d.keyId, localeId: d.localeId } },
    create: {
      keyId: d.keyId, localeId: d.localeId,
      text: text || null,
      status: finalStatus,
      sourceHash: hashSource(key.sourceText),
      translatorEmail: ctx.email ?? null,
      comments: d.comments || null,
    },
    update: {
      text: text || null,
      status: finalStatus,
      sourceHash: hashSource(key.sourceText),
      translatorEmail: ctx.email ?? null,
      comments: d.comments || null,
    },
  });
  await recomputeLocaleStats(d.localeId);
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.localization.translation_saved",
    entityType: "Translation", entityId: row.id,
    metadata: { actor: ctx.email, key: key.key, locale: d.localeId, status: finalStatus },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=editor&keyId=${d.keyId}&ok=translation-saved#editor`);
}

/* ── Glossary ─────────────────────────────────────────── */

const glossarySchema = z.object({
  id:               z.string().optional(),
  term:             z.string().min(1).max(120),
  translationsJson: z.string().max(4000).optional(),
  doNotTranslate:   z.union([z.literal("on"), z.literal("")]).optional(),
  gender:           z.string().max(40).optional(),
  pluralFormsJson:  z.string().max(2000).optional(),
  notes:            z.string().max(1000).optional(),
});

export async function saveGlossaryEntry(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = glossarySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid");
    redirect(`${ROUTE}?tab=glossary&error=${msg}#glossary`);
  }
  const d = parsed.data;
  let translations: unknown = null;
  if (d.translationsJson && d.translationsJson.trim()) {
    try { translations = JSON.parse(d.translationsJson); }
    catch { redirect(`${ROUTE}?tab=glossary&error=${encodeURIComponent("Invalid translations JSON")}#glossary`); }
  }
  let pluralForms: unknown = null;
  if (d.pluralFormsJson && d.pluralFormsJson.trim()) {
    try { pluralForms = JSON.parse(d.pluralFormsJson); }
    catch { redirect(`${ROUTE}?tab=glossary&error=${encodeURIComponent("Invalid plural forms JSON")}#glossary`); }
  }
  const data = {
    translationsJson: translations as never,
    doNotTranslate: d.doNotTranslate === "on",
    gender: d.gender || null,
    pluralFormsJson: pluralForms as never,
    notes: d.notes || null,
  };
  await db.glossaryEntry.upsert({
    where: { term: d.term },
    create: { term: d.term, ...data },
    update: data,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.localization.glossary_saved",
    entityType: "GlossaryEntry", entityId: d.term,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=glossary&ok=glossary-saved#glossary`);
}

export async function deleteGlossaryEntry(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=glossary&error=Invalid#glossary`);
  await db.glossaryEntry.delete({ where: { id: parsed.data.id } });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.localization.glossary_deleted",
    entityType: "GlossaryEntry", entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=glossary&ok=glossary-deleted#glossary`);
}

/* ── Settings ──────────────────────────────────────────── */

const settingsSchema = z.object({
  icuFormatEnabled:          z.union([z.literal("on"), z.literal("")]).optional(),
  fallbackChain:             z.string().max(500),
  pseudoLocalizationEnabled: z.union([z.literal("on"), z.literal("")]).optional(),
  fxAutoUpdateEnabled:       z.union([z.literal("on"), z.literal("")]).optional(),
  fxAutoUpdateCron:          z.string().min(1).max(60),
  fxDefaultSource:           z.enum(FX_SOURCES),
  fxDefaultMarginPct:        z.coerce.number().min(0).max(100),
  notes:                     z.string().max(2000).optional(),
});

export async function saveLocalizationSettings(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid");
    redirect(`${ROUTE}?tab=settings&error=${msg}#settings`);
  }
  const d = parsed.data;
  const chain = d.fallbackChain.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean).slice(0, 10);
  const data = {
    icuFormatEnabled: d.icuFormatEnabled === "on",
    fallbackChain: chain,
    pseudoLocalizationEnabled: d.pseudoLocalizationEnabled === "on",
    fxAutoUpdateEnabled: d.fxAutoUpdateEnabled === "on",
    fxAutoUpdateCron: d.fxAutoUpdateCron,
    fxDefaultSource: d.fxDefaultSource as FxSource,
    fxDefaultMarginPct: d.fxDefaultMarginPct,
    notes: d.notes || null,
    updatedById: ctx.userId,
  };
  await db.localizationSettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...data },
    update: data,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.localization.settings_saved",
    entityType: "LocalizationSettings", entityId: "default",
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=settings&ok=settings-saved#settings`);
}
