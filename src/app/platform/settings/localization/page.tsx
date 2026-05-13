// Page 67 — Localization.
//
// Seven tabs: Languages · Currencies & FX · Regional Formats · Translation
// Editor · String Stats · Glossary · Settings.

import * as React from "react";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadLocalizationPage, loadTranslationKeys, loadKeyDetail, loadLocaleDetail,
  LOCALE_STATUS_TONE, CURRENCY_STATUS_TONE, FX_SOURCE_LABEL,
  TRANSLATION_STATUS_TONE, TRANSLATION_MODULE_LABEL, PAPER_SIZE_LABEL,
  localeProgressPct, relativeFromNow, extractVariables, missingVariables,
} from "@/server/platform/localization";
import {
  saveLocale, deleteLocale,
  saveCurrency, deleteCurrency,
  saveTranslationKey, deleteTranslationKey, saveTranslation,
  saveGlossaryEntry, deleteGlossaryEntry,
  saveLocalizationSettings,
} from "@/app/actions/platform-localization";
import type {
  LocaleStatus,
  FxSource,
  CurrencyStatus,
  TranslationStatus,
  TranslationModule,
  PaperSize,
} from "@prisma/client";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const TABS = ["languages", "currencies", "formats", "editor", "stats", "glossary", "settings"] as const;
type Tab = typeof TABS[number];
const TAB_LABEL: Record<Tab, string> = {
  languages: "Languages",
  currencies: "Currencies & FX",
  formats: "Regional Formats",
  editor: "Translation Editor",
  stats: "String Stats",
  glossary: "Glossary",
  settings: "Settings",
};

const LOCALE_STATUSES: LocaleStatus[] = ["ENABLED", "BETA", "HIDDEN"];
const FX_SOURCES: FxSource[] = ["ECB", "OPEN_EXCHANGE_RATES", "FIXER", "MANUAL"];
const CURR_STATUSES: CurrencyStatus[] = ["ACTIVE", "INACTIVE"];
const TRANS_STATUSES: TranslationStatus[] = ["TRANSLATED", "PENDING", "OUTDATED", "NEEDS_REVIEW"];
const MODULES: TranslationModule[] = ["ADMIN", "TENANT_APP", "EMAIL", "SMS", "MARKETING"];
const PAPER_SIZES: PaperSize[] = ["LETTER", "A4"];

export default async function LocalizationPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("localization.read")) {
    return (
      <main className="mx-auto max-w-2xl py-12 text-center">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          You don&apos;t have permission to view Localization.
        </p>
      </main>
    );
  }
  const canManage    = ctx.can("localization.manage");
  const canTranslate = ctx.can("localization.translate");
  const sp = await searchParams;
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const tabRaw = asString(sp.tab) as Tab | undefined;
  const tab: Tab = tabRaw && (TABS as readonly string[]).includes(tabRaw) ? tabRaw : "languages";

  const data = await loadLocalizationPage();
  const { kpis, locales, currencies, glossary, settings } = data;

  // Editor tab state
  const editorModuleFilter = asString(sp.module) as TranslationModule | undefined;
  const editorSearch       = asString(sp.search) ?? "";
  const editorKeyId        = asString(sp.keyId);
  const keys = tab === "editor"
    ? await loadTranslationKeys({ module: editorModuleFilter, search: editorSearch, limit: 150 })
    : [];
  const selectedKey = editorKeyId ? await loadKeyDetail(editorKeyId) : null;

  // Languages tab — optional selected locale (for stats card)
  const selectedLocaleCode = asString(sp.locale);
  const selectedLocale = selectedLocaleCode ? await loadLocaleDetail(selectedLocaleCode) : null;

  return (
    <main className="mx-auto w-full max-w-[1620px] px-6 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--text-default)" }}>Localization</h1>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Languages, currencies, regional formats, and translation workflow.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FormOk msg={ok} />
          <FormError msg={error} />
        </div>
      </header>

      <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Locales" value={`${kpis.enabledLocales}/${kpis.totalLocales}`}
             sub={`${kpis.rtlLocales} RTL`} />
        <Kpi label="Currencies" value={`${kpis.activeCurrencies}/${kpis.totalCurrencies}`} sub="active / total" />
        <Kpi label="Translation keys" value={kpis.totalKeys.toLocaleString()}
             sub={`${kpis.pendingTranslations} pending`}
             tone={kpis.pendingTranslations > 100 ? "warning" : "default"} />
        <Kpi label="Outdated" value={String(kpis.outdatedTranslations)}
             sub={kpis.outdatedTranslations > 0 ? "source changed since last save" : "all up to date"}
             tone={kpis.outdatedTranslations > 0 ? "warning" : "good"} />
      </section>

      <nav className="mb-5 flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        {TABS.map((t) => (
          <a key={t} href={`?tab=${t}`}
             className="-mb-px rounded-t-md px-3 py-2 text-[12px] font-medium transition"
             style={{
               borderBottom: tab === t ? "2px solid var(--accent-default)" : "2px solid transparent",
               color: tab === t ? "var(--text-default)" : "var(--text-muted)",
             }}>
            {TAB_LABEL[t]}
          </a>
        ))}
      </nav>

      {tab === "languages" && (
        <LanguagesTab locales={locales} selected={selectedLocale} canManage={canManage} />
      )}
      {tab === "currencies" && (
        <CurrenciesTab currencies={currencies} canManage={canManage} />
      )}
      {tab === "formats" && (
        <RegionalFormatsTab locales={locales} canManage={canManage} />
      )}
      {tab === "editor" && (
        <TranslationEditorTab
          keys={keys} selectedKey={selectedKey} locales={locales}
          search={editorSearch} moduleFilter={editorModuleFilter}
          canManage={canManage} canTranslate={canTranslate}
        />
      )}
      {tab === "stats" && (
        <StatsTab locales={locales} />
      )}
      {tab === "glossary" && (
        <GlossaryTab rows={glossary} canManage={canManage} />
      )}
      {tab === "settings" && (
        <SettingsTab settings={settings} canManage={canManage} />
      )}
    </main>
  );
}

/* ── Languages tab ─────────────────────────────────────── */

function LanguagesTab({
  locales, selected, canManage,
}: {
  locales: Awaited<ReturnType<typeof loadLocalizationPage>>["locales"];
  selected: Awaited<ReturnType<typeof loadLocaleDetail>>;
  canManage: boolean;
}) {
  return (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
      <div className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Languages</h3>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {locales.length} locales · click a row to see stats.
          </p>
        </header>
        <div className="overflow-x-auto p-3">
          {locales.length === 0 ? <Empty>No locales yet.</Empty> : (
            <table className="w-full">
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  <Th>Language</Th><Th>Locale</Th><Th>Status</Th><Th>% translated</Th>
                  <Th>Source</Th><Th>Owner</Th><Th>RTL</Th>
                  {canManage && <Th right>Delete</Th>}
                </tr>
              </thead>
              <tbody>
                {locales.map((l) => {
                  const pct = localeProgressPct(l);
                  return (
                    <tr key={l.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                      <Td>
                        <a href={`?tab=languages&locale=${encodeURIComponent(l.code)}`}
                           className="text-[12px] font-medium underline" style={{ color: "var(--text-default)" }}>
                          {l.language}
                        </a>
                        {l.region && <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{l.region}</div>}
                      </Td>
                      <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{l.code}</code></Td>
                      <Td><Pill tone={LOCALE_STATUS_TONE[l.status]} label={LOCALE_STATUS_TONE[l.status].label} /></Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                            <div className="h-full rounded-full"
                                 style={{
                                   width: `${pct}%`,
                                   background: pct >= 90 ? "var(--emerald-500)" : pct >= 50 ? "var(--amber-500)" : "var(--rose-500)",
                                 }} />
                          </div>
                          <span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{pct}%</span>
                        </div>
                        <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                          {l.translatedCount}/{l.totalKeys} · {l.pendingCount} pending · {l.outdatedCount} outdated
                        </div>
                      </Td>
                      <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{l.source ?? "—"}</span></Td>
                      <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{l.ownerEmail ?? "—"}</span></Td>
                      <Td>{l.rtl
                        ? <Pill tone={{ bg: "var(--violet-100)", fg: "var(--violet-700)" }} label="RTL" />
                        : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>}</Td>
                      {canManage && (
                        <Td right>
                          <form action={deleteLocale}>
                            <input type="hidden" name="id" value={l.id} />
                            <button type="submit" className="text-[11px] font-medium underline" style={{ color: "var(--text-muted)" }}>
                              Delete
                            </button>
                          </form>
                        </Td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {canManage && (
          <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
            <details>
              <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
                + Add language
              </summary>
              <LocaleForm canManage={canManage} />
            </details>
          </div>
        )}
      </div>

      {/* Side: selected locale detail */}
      <aside className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>
            {selected ? `${selected.language} (${selected.code})` : "Pick a locale"}
          </h3>
        </header>
        {selected ? (
          <div className="space-y-3 p-4 text-[11px]">
            <div>
              <span style={{ color: "var(--text-muted)" }}>Status: </span>
              <Pill tone={LOCALE_STATUS_TONE[selected.status]} label={LOCALE_STATUS_TONE[selected.status].label} />
            </div>
            <div>
              <span style={{ color: "var(--text-muted)" }}>Progress: </span>
              <strong style={{ color: "var(--text-default)" }}>{localeProgressPct(selected)}%</strong>
              <span style={{ color: "var(--text-muted)" }}> ({selected.translatedCount}/{selected.totalKeys})</span>
            </div>
            <div>
              <span style={{ color: "var(--text-muted)" }}>Pending: </span>
              <strong style={{ color: "var(--text-default)" }}>{selected.pendingCount}</strong>
              <span style={{ color: "var(--text-muted)" }}> · Outdated: </span>
              <strong style={{ color: "var(--text-default)" }}>{selected.outdatedCount}</strong>
              <span style={{ color: "var(--text-muted)" }}> · Review: </span>
              <strong style={{ color: "var(--text-default)" }}>{selected.reviewCount}</strong>
            </div>
            {selected.statsTrend.length > 0 && (
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  30-day trend
                </div>
                <Sparkline series={selected.statsTrend.map((s) => ({
                  day: s.day.toISOString().slice(0, 10),
                  translated: s.translatedCount,
                  total: s.totalKeys,
                }))} />
              </div>
            )}
            {canManage && (
              <details className="border-t pt-3" style={{ borderColor: "var(--border-subtle)" }}>
                <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
                  Edit locale
                </summary>
                <LocaleForm canManage={canManage} locale={selected} />
              </details>
            )}
          </div>
        ) : (
          <Empty>Click a language row to see its progress + trend.</Empty>
        )}
      </aside>
    </section>
  );
}

function LocaleForm({
  canManage, locale,
}: {
  canManage: boolean;
  locale?: NonNullable<Awaited<ReturnType<typeof loadLocaleDetail>>>;
}) {
  if (!canManage) return null;
  return (
    <form action={saveLocale} className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3">
      <Input name="code"     label="Locale code (BCP 47)" defaultValue={locale?.code ?? ""} />
      <Input name="language" label="Language name"        defaultValue={locale?.language ?? ""} />
      <Input name="region"   label="Region"               defaultValue={locale?.region ?? ""} />
      <Select name="status" label="Status" defaultValue={locale?.status ?? "BETA"}
              options={LOCALE_STATUSES.map((s) => ({ value: s, label: LOCALE_STATUS_TONE[s].label }))} />
      <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
        <input type="checkbox" name="rtl" defaultChecked={locale?.rtl ?? false} /> Right-to-left
      </label>
      <Input name="source"     label="Source" defaultValue={locale?.source ?? ""} />
      <Input name="ownerEmail" type="email" label="Owner email" defaultValue={locale?.ownerEmail ?? ""} />
      <Input name="dateFormat" label="Date format" defaultValue={locale?.dateFormat ?? ""} />
      <Input name="timeFormat" label="Time format" defaultValue={locale?.timeFormat ?? ""} />
      <Input name="decimalSeparator" label="Decimal sep" defaultValue={locale?.decimalSeparator ?? "."} />
      <Input name="thousandSeparator" label="Thousand sep" defaultValue={locale?.thousandSeparator ?? ","} />
      <Select name="paperSize" label="Paper size" defaultValue={locale?.paperSize ?? "LETTER"}
              options={PAPER_SIZES.map((p) => ({ value: p, label: PAPER_SIZE_LABEL[p] }))} />
      <Input name="phoneFormat" label="Phone format" defaultValue={locale?.phoneFormat ?? ""} />
      <label className="md:col-span-3 block">
        <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Address format</span>
        <textarea name="addressFormat" rows={2} defaultValue={locale?.addressFormat ?? ""}
                  className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
      </label>
      <label className="md:col-span-3 block">
        <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Notes</span>
        <textarea name="notes" rows={2} defaultValue={locale?.notes ?? ""}
                  className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
      </label>
      <div className="md:col-span-3 flex justify-end">
        <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
          {locale ? "Save locale" : "Add locale"}
        </button>
      </div>
    </form>
  );
}

/* ── Currencies tab ───────────────────────────────────── */

function CurrenciesTab({
  currencies, canManage,
}: {
  currencies: Awaited<ReturnType<typeof loadLocalizationPage>>["currencies"];
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Currencies &amp; FX</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {currencies.length} currencies · FX rates against USD.
        </p>
      </header>
      <div className="overflow-x-auto p-3">
        {currencies.length === 0 ? <Empty>No currencies yet.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Code</Th><Th>Name</Th><Th>Symbol</Th><Th>Decimals</Th>
                <Th>FX rate</Th><Th>Source</Th><Th>Updated</Th><Th>Status</Th>
                {canManage && <Th right>Delete</Th>}
              </tr>
            </thead>
            <tbody>
              {currencies.map((c) => (
                <tr key={c.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td><code className="text-[12px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>{c.code}</code></Td>
                  <Td><span className="text-[12px]" style={{ color: "var(--text-default)" }}>{c.name}</span></Td>
                  <Td><span className="text-[12px] tabular-nums" style={{ color: "var(--text-default)" }}>{c.symbol}</span></Td>
                  <Td><Num n={c.decimals} /></Td>
                  <Td>
                    <span className="text-[12px] tabular-nums" style={{ color: "var(--text-default)" }}>
                      {c.manualOverride != null ? `${c.manualOverride.toFixed(4)}*` : c.fxRate.toFixed(4)}
                    </span>
                    {c.marginPct > 0 && <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>+{c.marginPct}% margin</div>}
                  </Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{FX_SOURCE_LABEL[c.fxSource]}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(c.fxLastUpdatedAt)}</span></Td>
                  <Td><Pill tone={CURRENCY_STATUS_TONE[c.status]} label={CURRENCY_STATUS_TONE[c.status].label} /></Td>
                  {canManage && (
                    <Td right>
                      <form action={deleteCurrency}>
                        <input type="hidden" name="id" value={c.id} />
                        <button type="submit" className="text-[11px] font-medium underline" style={{ color: "var(--text-muted)" }}>Delete</button>
                      </form>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {canManage && (
        <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <details>
            <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
              + Save currency
            </summary>
            <form action={saveCurrency} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
              <Input name="code"     label="ISO 4217 code" defaultValue="" />
              <Input name="name"     label="Name"          defaultValue="" />
              <Input name="symbol"   label="Symbol"        defaultValue="" />
              <Input name="decimals" type="number" label="Decimals" defaultValue="2" />
              <Input name="fxRate"   label="FX rate (vs USD)" defaultValue="1.0" />
              <Select name="fxSource" label="FX source" defaultValue="ECB"
                      options={FX_SOURCES.map((s) => ({ value: s, label: FX_SOURCE_LABEL[s] }))} />
              <Input name="manualOverride" label="Manual override (optional)" defaultValue="" />
              <Input name="marginPct" label="Margin %" defaultValue="0" />
              <Select name="status" label="Status" defaultValue="ACTIVE"
                      options={CURR_STATUSES.map((s) => ({ value: s, label: CURRENCY_STATUS_TONE[s].label }))} />
              <label className="md:col-span-4 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Notes</span>
                <input name="notes" defaultValue=""
                       className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                       style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <div className="md:col-span-4 flex justify-end">
                <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Save currency
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}

/* ── Regional Formats tab ─────────────────────────────── */

function RegionalFormatsTab({
  locales, canManage,
}: {
  locales: Awaited<ReturnType<typeof loadLocalizationPage>>["locales"];
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Regional formats</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Per-locale formatting — edit a locale on the Languages tab to change these.
        </p>
      </header>
      <div className="overflow-x-auto p-3">
        {locales.length === 0 ? <Empty>No locales yet.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Locale</Th><Th>Date</Th><Th>Time</Th>
                <Th>Decimal · thousand</Th><Th>Paper</Th>
                <Th>Phone</Th><Th>Address</Th>
              </tr>
            </thead>
            <tbody>
              {locales.map((l) => (
                <tr key={l.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td>
                    <code className="text-[11px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>{l.code}</code>
                    <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{l.language}</div>
                  </Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{l.dateFormat ?? "—"}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{l.timeFormat ?? "—"}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{l.decimalSeparator} · {l.thousandSeparator}</span></Td>
                  <Td><Pill tone={{ bg: "var(--surface-2)", fg: "var(--text-default)" }} label={PAPER_SIZE_LABEL[l.paperSize]} /></Td>
                  <Td><code className="text-[10px]" style={{ color: "var(--text-muted)" }}>{l.phoneFormat ?? "—"}</code></Td>
                  <Td>
                    <code className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {l.addressFormat ? (l.addressFormat.length > 30 ? l.addressFormat.slice(0, 30) + "…" : l.addressFormat) : "—"}
                    </code>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

/* ── Translation Editor tab ───────────────────────────── */

function TranslationEditorTab({
  keys, selectedKey, locales, search, moduleFilter, canManage, canTranslate,
}: {
  keys: Awaited<ReturnType<typeof loadTranslationKeys>>;
  selectedKey: Awaited<ReturnType<typeof loadKeyDetail>>;
  locales: Awaited<ReturnType<typeof loadLocalizationPage>>["locales"];
  search: string;
  moduleFilter?: TranslationModule;
  canManage: boolean;
  canTranslate: boolean;
}) {
  return (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-[420px_1fr]">
      {/* Keys list */}
      <aside className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <form className="border-b p-3" style={{ borderColor: "var(--border-subtle)" }}>
          <input type="hidden" name="tab" value="editor" />
          <input name="search" placeholder="Search key or source…" defaultValue={search}
                 className="mb-2 w-full rounded-md border px-2 py-1.5 text-[12px]"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
          <div className="flex items-center gap-2">
            <select name="module" defaultValue={moduleFilter ?? ""}
                    className="rounded-md border px-2 py-1 text-[11px]"
                    style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
              <option value="">All modules</option>
              {MODULES.map((m) => <option key={m} value={m}>{TRANSLATION_MODULE_LABEL[m]}</option>)}
            </select>
            <button type="submit"
                    className="ml-auto rounded-md px-2 py-1 text-[11px] font-medium"
                    style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
              Filter
            </button>
          </div>
        </form>
        <ul className="max-h-[680px] overflow-y-auto">
          {keys.length === 0 ? (
            <li className="p-5 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>No keys match.</li>
          ) : keys.map((k) => {
            const active = selectedKey?.id === k.id;
            return (
              <li key={k.id}>
                <a href={`?tab=editor&keyId=${encodeURIComponent(k.id)}`}
                   className="block border-b px-3 py-2 transition hover:bg-[var(--surface-2)]"
                   style={{
                     borderColor: "var(--border-subtle)",
                     background: active ? "var(--accent-surface)" : "transparent",
                   }}>
                  <div className="flex items-center justify-between gap-2">
                    <code className="truncate text-[11px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>{k.key}</code>
                    <Pill tone={{ bg: "var(--surface-2)", fg: "var(--text-default)" }} label={TRANSLATION_MODULE_LABEL[k.module]} />
                  </div>
                  <div className="truncate text-[11px]" style={{ color: "var(--text-muted)" }}>{k.sourceText}</div>
                  {k.variables.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {k.variables.map((v) => (
                        <code key={v} className="rounded px-1 py-0.5 text-[10px]"
                              style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>{v}</code>
                      ))}
                    </div>
                  )}
                </a>
              </li>
            );
          })}
        </ul>
        {canManage && (
          <div className="border-t p-3" style={{ borderColor: "var(--border-subtle)" }}>
            <details>
              <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
                + New key
              </summary>
              <KeyForm canManage={canManage} />
            </details>
          </div>
        )}
      </aside>

      {/* Editor pane */}
      <div>
        {selectedKey
          ? <KeyEditor keyRow={selectedKey} locales={locales} canManage={canManage} canTranslate={canTranslate} />
          : <EmptyDetail count={keys.length} />}
      </div>
    </section>
  );
}

function EmptyDetail({ count }: { count: number }) {
  return (
    <section className="rounded-xl border p-8 text-center"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>Pick a translation key</h3>
      <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
        {count === 0 ? "No keys match the current filters." : "Select a key on the left to translate per locale."}
      </p>
    </section>
  );
}

function KeyForm({
  canManage, keyRow,
}: {
  canManage: boolean;
  keyRow?: NonNullable<Awaited<ReturnType<typeof loadKeyDetail>>>;
}) {
  if (!canManage) return null;
  return (
    <form action={saveTranslationKey} className="mt-2 space-y-2">
      <Input name="key"        label="Key" defaultValue={keyRow?.key ?? ""} />
      <Select name="module" label="Module" defaultValue={keyRow?.module ?? "ADMIN"}
              options={MODULES.map((m) => ({ value: m, label: TRANSLATION_MODULE_LABEL[m] }))} />
      <label className="block">
        <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Source text (English)</span>
        <textarea name="sourceText" rows={3} defaultValue={keyRow?.sourceText ?? ""}
                  className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
      </label>
      <Input name="context" label="Context (hint to translators)" defaultValue={keyRow?.context ?? ""} />
      <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
        <input type="checkbox" name="hasPlurals" defaultChecked={keyRow?.hasPlurals ?? false} /> Has plurals (ICU)
      </label>
      <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
        <input type="checkbox" name="doNotTranslate" defaultChecked={keyRow?.doNotTranslate ?? false} /> Do not translate
      </label>
      <div className="flex justify-end">
        <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
          {keyRow ? "Save key" : "Add key"}
        </button>
      </div>
    </form>
  );
}

function KeyEditor({
  keyRow, locales, canManage, canTranslate,
}: {
  keyRow: NonNullable<Awaited<ReturnType<typeof loadKeyDetail>>>;
  locales: Awaited<ReturnType<typeof loadLocalizationPage>>["locales"];
  canManage: boolean;
  canTranslate: boolean;
}) {
  const translationByLocale = new Map(keyRow.translations.map((t) => [t.localeId, t]));
  return (
    <article className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="flex flex-wrap items-start gap-3 border-b px-5 py-4" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <code className="text-[13px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>{keyRow.key}</code>
            <Pill tone={{ bg: "var(--surface-2)", fg: "var(--text-default)" }} label={TRANSLATION_MODULE_LABEL[keyRow.module]} />
            {keyRow.hasPlurals && <Pill tone={{ bg: "var(--violet-100)", fg: "var(--violet-700)" }} label="Plurals" />}
            {keyRow.doNotTranslate && <Pill tone={{ bg: "var(--surface-2)", fg: "var(--text-muted)" }} label="Do not translate" />}
          </div>
          {keyRow.context && <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>Context: {keyRow.context}</p>}
          <div className="mt-2 rounded-md border p-3"
               style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
            <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Source · en-US</div>
            <div className="text-[12px]">{keyRow.sourceText}</div>
            {keyRow.variables.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {keyRow.variables.map((v) => (
                  <code key={v} className="rounded px-1 py-0.5 text-[10px]"
                        style={{ background: "var(--surface-1)", color: "var(--text-muted)" }}>{v}</code>
                ))}
              </div>
            )}
          </div>
        </div>
        {canManage && (
          <form action={deleteTranslationKey}>
            <input type="hidden" name="id" value={keyRow.id} />
            <button type="submit" className="text-[11px] underline" style={{ color: "var(--rose-700)" }}>Delete key</button>
          </form>
        )}
      </header>

      <section className="space-y-3 p-5">
        {locales.filter((l) => l.code !== "en-US").map((l) => {
          const t = translationByLocale.get(l.id);
          const text = t?.text ?? "";
          const missing = text ? missingVariables(keyRow.sourceText, text) : [];
          return (
            <div key={l.id} className="rounded-lg border p-3"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <code className="text-[11px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>{l.code}</code>
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{l.language}</span>
                  {l.rtl && <Pill tone={{ bg: "var(--violet-100)", fg: "var(--violet-700)" }} label="RTL" />}
                </div>
                <div className="flex items-center gap-2">
                  {t && <Pill tone={TRANSLATION_STATUS_TONE[t.status]} label={TRANSLATION_STATUS_TONE[t.status].label} />}
                  {missing.length > 0 && (
                    <Pill tone={{ bg: "var(--rose-100)", fg: "var(--rose-700)" }} label={`Missing: ${missing.join(", ")}`} />
                  )}
                </div>
              </div>
              {canTranslate ? (
                <form action={saveTranslation} className="space-y-2">
                  <input type="hidden" name="keyId" value={keyRow.id} />
                  <input type="hidden" name="localeId" value={l.id} />
                  <textarea name="text" rows={2} defaultValue={text}
                            dir={l.rtl ? "rtl" : undefined}
                            className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
                  <div className="flex flex-wrap items-center gap-2">
                    <select name="status" defaultValue={t?.status ?? "TRANSLATED"}
                            className="rounded-md border px-2 py-1 text-[11px]"
                            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
                      {TRANS_STATUSES.map((s) => <option key={s} value={s}>{TRANSLATION_STATUS_TONE[s].label}</option>)}
                    </select>
                    <input name="comments" placeholder="Translator note (optional)"
                           defaultValue={t?.comments ?? ""}
                           className="min-w-0 flex-1 rounded-md border px-2 py-1 text-[11px]"
                           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
                    {t?.aiSuggestion && (
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        AI: <em>{t.aiSuggestion.slice(0, 60)}{t.aiSuggestion.length > 60 ? "…" : ""}</em>
                      </span>
                    )}
                    <button type="submit"
                            className="ml-auto rounded-md px-2 py-1 text-[11px] font-medium"
                            style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                      Save
                    </button>
                  </div>
                  {t && t.translatorEmail && (
                    <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      Last edit by {t.translatorEmail} · {relativeFromNow(t.updatedAt)}
                    </div>
                  )}
                </form>
              ) : (
                <div className="text-[12px]" style={{ color: "var(--text-default)" }}>
                  {text || <em style={{ color: "var(--text-muted)" }}>— not translated —</em>}
                </div>
              )}
            </div>
          );
        })}
      </section>
    </article>
  );
}

/* ── Stats tab ────────────────────────────────────────── */

function StatsTab({
  locales,
}: {
  locales: Awaited<ReturnType<typeof loadLocalizationPage>>["locales"];
}) {
  return (
    <section className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>String stats</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Per-locale coverage and breakdown.</p>
      </header>
      <div className="overflow-x-auto p-3">
        {locales.length === 0 ? <Empty>No locales yet.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Locale</Th><Th>Total</Th><Th>Translated</Th><Th>Pending</Th>
                <Th>Outdated</Th><Th>Review</Th><Th>%</Th>
              </tr>
            </thead>
            <tbody>
              {locales.map((l) => {
                const pct = localeProgressPct(l);
                return (
                  <tr key={l.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                    <Td>
                      <code className="text-[12px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>{l.code}</code>
                      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{l.language}</div>
                    </Td>
                    <Td><Num n={l.totalKeys} /></Td>
                    <Td><Num n={l.translatedCount} /></Td>
                    <Td><span className="text-[12px] tabular-nums" style={{ color: l.pendingCount > 0 ? "var(--amber-700)" : "var(--text-muted)" }}>{l.pendingCount}</span></Td>
                    <Td><span className="text-[12px] tabular-nums" style={{ color: l.outdatedCount > 0 ? "var(--rose-700)" : "var(--text-muted)" }}>{l.outdatedCount}</span></Td>
                    <Td><Num n={l.reviewCount} /></Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                          <div className="h-full rounded-full"
                               style={{
                                 width: `${pct}%`,
                                 background: pct >= 90 ? "var(--emerald-500)" : pct >= 50 ? "var(--amber-500)" : "var(--rose-500)",
                               }} />
                        </div>
                        <span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{pct}%</span>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

/* ── Glossary tab ─────────────────────────────────────── */

function GlossaryTab({
  rows, canManage,
}: {
  rows: Awaited<ReturnType<typeof loadLocalizationPage>>["glossary"];
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Glossary</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {rows.length} terms · canonical translations + do-not-translate flags.
        </p>
      </header>
      <div className="overflow-x-auto p-3">
        {rows.length === 0 ? <Empty>No glossary terms yet.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Term</Th><Th>Translations</Th><Th>Gender</Th><Th>Notes</Th>
                {canManage && <Th right>Delete</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => {
                const trs = g.translationsJson && typeof g.translationsJson === "object" && !Array.isArray(g.translationsJson)
                  ? Object.entries(g.translationsJson as Record<string, unknown>).filter(([, v]) => typeof v === "string") as [string, string][]
                  : [];
                return (
                  <tr key={g.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                    <Td>
                      <div className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>{g.term}</div>
                      {g.doNotTranslate && <Pill tone={{ bg: "var(--rose-100)", fg: "var(--rose-700)" }} label="Do not translate" />}
                    </Td>
                    <Td>
                      {trs.length === 0
                        ? <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>
                        : (
                          <ul className="space-y-0.5 text-[11px]">
                            {trs.map(([code, v]) => (
                              <li key={code} style={{ color: "var(--text-default)" }}>
                                <code className="tabular-nums">{code}</code>: {v}
                              </li>
                            ))}
                          </ul>
                        )}
                    </Td>
                    <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{g.gender ?? "—"}</span></Td>
                    <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{g.notes ?? "—"}</span></Td>
                    {canManage && (
                      <Td right>
                        <form action={deleteGlossaryEntry}>
                          <input type="hidden" name="id" value={g.id} />
                          <button type="submit" className="text-[11px] font-medium underline" style={{ color: "var(--text-muted)" }}>Delete</button>
                        </form>
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {canManage && (
        <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <details>
            <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
              + Save glossary entry
            </summary>
            <form action={saveGlossaryEntry} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              <Input name="term"   label="Term"   defaultValue="" />
              <Input name="gender" label="Gender" defaultValue="" />
              <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                <input type="checkbox" name="doNotTranslate" /> Do not translate
              </label>
              <label className="md:col-span-3 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
                  Translations JSON {`({ "es-MX": "...", "fr-FR": "..." })`}
                </span>
                <textarea name="translationsJson" rows={3} defaultValue=""
                          className="w-full rounded-md border px-2 py-1.5 font-mono text-[11px]"
                          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <label className="md:col-span-3 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
                  Plural forms JSON ({`{ "en-US": { "one": "x", "other": "ys" } }`})
                </span>
                <textarea name="pluralFormsJson" rows={3} defaultValue=""
                          className="w-full rounded-md border px-2 py-1.5 font-mono text-[11px]"
                          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <label className="md:col-span-3 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Notes</span>
                <input name="notes" defaultValue=""
                       className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                       style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <div className="md:col-span-3 flex justify-end">
                <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Save entry
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}

/* ── Settings tab ─────────────────────────────────────── */

function SettingsTab({
  settings, canManage,
}: {
  settings: Awaited<ReturnType<typeof loadLocalizationPage>>["settings"];
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Program settings</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>ICU MessageFormat, fallback chain, FX auto-update, pseudo-localization.</p>
      </header>
      <form action={saveLocalizationSettings} className="grid grid-cols-2 gap-3 p-4 md:grid-cols-3">
        <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
          <input type="checkbox" name="icuFormatEnabled" defaultChecked={settings.icuFormatEnabled} />
          ICU MessageFormat support
        </label>
        <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
          <input type="checkbox" name="pseudoLocalizationEnabled" defaultChecked={settings.pseudoLocalizationEnabled} />
          Pseudo-localization (test)
        </label>
        <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
          <input type="checkbox" name="fxAutoUpdateEnabled" defaultChecked={settings.fxAutoUpdateEnabled} />
          Auto-update FX rates
        </label>
        <Input name="fallbackChain" label="Fallback chain (comma-separated)"
               defaultValue={settings.fallbackChain.join(", ")} />
        <Input name="fxAutoUpdateCron" label="FX cron" defaultValue={settings.fxAutoUpdateCron} />
        <Select name="fxDefaultSource" label="Default FX source" defaultValue={settings.fxDefaultSource}
                options={FX_SOURCES.map((s) => ({ value: s, label: FX_SOURCE_LABEL[s] }))} />
        <Input name="fxDefaultMarginPct" type="number" label="Default FX margin %"
               defaultValue={String(settings.fxDefaultMarginPct)} />
        <label className="md:col-span-3 block">
          <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Notes</span>
          <textarea name="notes" rows={3} defaultValue={settings.notes ?? ""}
                    className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                    style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
        </label>
        {canManage && (
          <div className="md:col-span-3 flex justify-end">
            <button type="submit"
                    className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                    style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
              Save settings
            </button>
          </div>
        )}
      </form>
    </section>
  );
}

/* ── Sparkline (pure SVG) ─────────────────────────────── */

function Sparkline({ series }: { series: Array<{ day: string; translated: number; total: number }> }) {
  if (series.length === 0) return null;
  const W = 280, H = 60, PAD = 4;
  const maxTotal = Math.max(...series.map((s) => s.total), 1);
  const step = series.length > 1 ? (W - 2 * PAD) / (series.length - 1) : 0;
  const pointsTotal = series.map((s, i) => {
    const x = PAD + i * step;
    const y = H - PAD - ((s.total / maxTotal) * (H - 2 * PAD));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const pointsTranslated = series.map((s, i) => {
    const x = PAD + i * step;
    const y = H - PAD - ((s.translated / maxTotal) * (H - 2 * PAD));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
      <polyline points={pointsTotal} fill="none" stroke="var(--surface-2)" strokeWidth={1.5} />
      <polyline points={pointsTranslated} fill="none" stroke="var(--emerald-500)" strokeWidth={1.5} />
    </svg>
  );
}

/* ── Reusable UI primitives ────────────────────────────── */

function Kpi({
  label, value, sub, tone = "default",
}: {
  label: string; value: string; sub?: string;
  tone?: "default" | "good" | "warning" | "danger";
}) {
  const palette = tone === "good"    ? { fg: "var(--emerald-700)", chip: "var(--emerald-100)" }
                : tone === "warning" ? { fg: "var(--amber-700)",   chip: "var(--amber-100)" }
                : tone === "danger"  ? { fg: "var(--rose-700)",    chip: "var(--rose-100)" }
                :                      { fg: "var(--text-default)", chip: "var(--surface-2)" };
  return (
    <div className="rounded-xl border p-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px]"
              style={{ background: palette.chip }} />
      </div>
      <div className="mt-1 text-[20px] font-semibold tabular-nums" style={{ color: palette.fg }}>{value}</div>
      {sub && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}

function Pill({ tone, label }: { tone: { bg: string; fg: string }; label: string }) {
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ background: tone.bg, color: tone.fg }}>{label}</span>
  );
}

function Num({ n }: { n: number }) {
  return <span className="text-[12px] tabular-nums" style={{ color: "var(--text-default)" }}>{n.toLocaleString()}</span>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed p-4 text-center text-[12px]"
         style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
      {children}
    </div>
  );
}

function Th({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide"
        style={{ textAlign: right ? "right" : "left", color: "var(--text-muted)" }}>
      {children}
    </th>
  );
}

function Td({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <td className="px-2 py-1.5"
        style={{ textAlign: right ? "right" : "left", verticalAlign: "top" }}>
      {children}
    </td>
  );
}

function Input({
  name, label, defaultValue, type = "text",
}: {
  name: string; label: string; defaultValue?: string;
  type?: "text" | "number" | "email" | "url";
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{label}</span>
      <input name={name} type={type} defaultValue={defaultValue}
             className="w-full rounded-md border px-2 py-1.5 text-[12px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
    </label>
  );
}

function Select({
  name, label, options, defaultValue,
}: {
  name: string; label: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{label}</span>
      <select name={name} defaultValue={defaultValue}
              className="w-full rounded-md border px-2 py-1.5 text-[12px]"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function FormError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <span className="inline-flex items-center rounded-md px-2 py-1 text-[11px]"
          style={{ background: "var(--rose-100)", color: "var(--rose-700)" }}>{msg}</span>
  );
}

function FormOk({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <span className="inline-flex items-center rounded-md px-2 py-1 text-[11px]"
          style={{ background: "var(--emerald-100)", color: "var(--emerald-700)" }}>{msg}</span>
  );
}
