// Page 43 — SEO & Content (top-level).
//
// One route, six sections (tabs): Settings · Keywords · Backlinks ·
// Broken links · Content gaps · Page speed.
//
// Each tab pulls its own slice of data; the KPI strip on top is always
// loaded so admins see the program's health at a glance.

import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadSeoSettings,
  loadSeoKpis,
  loadKeywordRankings,
  loadBacklinks,
  loadBrokenLinks,
  loadContentGaps,
  loadPageSpeedSnapshots,
  intentLabel,
  intentTone,
  backlinkStatusTone,
  gapStatusTone,
  lcpTone,
  inpTone,
  clsTone,
  type SeoSettingsView,
  type SeoKpis,
  type KeywordRow,
  type BacklinkBreakdown,
  type BrokenLinkRow,
  type ContentGapRow,
  type PageSpeedRow,
} from "@/server/platform/seo";
import {
  saveSeoSettings,
  regenerateSitemap,
  saveKeyword,
  deleteKeyword,
  syncKeywords,
  resolveBrokenLink,
  ignoreBrokenLink,
  runBrokenLinkCrawl,
  updateContentGapStatus,
  createContentGap,
  runPageSpeedCrawl,
  syncBacklinks,
} from "@/app/actions/platform-seo";
import type { SeoIntent } from "@prisma/client";
import { Kpi, FormError, FormOk, Field, relativeFromNow, Sparkline } from "./_shared";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const TABS = ["settings", "keywords", "backlinks", "broken", "gaps", "speed"] as const;
type Tab = typeof TABS[number];

const INTENTS: SeoIntent[] = ["INFORMATIONAL", "NAVIGATIONAL", "COMMERCIAL", "TRANSACTIONAL"];

export default async function SeoPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canWrite = ctx.can("seo.manage");

  const tabRaw = asString(sp.tab) as Tab | undefined;
  const tab: Tab = tabRaw && (TABS as readonly string[]).includes(tabRaw) ? tabRaw : "keywords";
  const ok = asString(sp.ok);
  const error = asString(sp.error);

  const [settings, kpis, keywords, backlinks, broken, gaps, speed] = await Promise.all([
    loadSeoSettings(),
    loadSeoKpis(),
    loadKeywordRankings({ q: asString(sp.q), pageSize: 200 }),
    loadBacklinks(30),
    loadBrokenLinks(),
    loadContentGaps(),
    loadPageSpeedSnapshots(),
  ]);

  return (
    <div className="space-y-5">
      <Header />

      {ok && <FormOk msg={ok} />}
      {error && <FormError msg={error} />}

      <KpiStrip kpis={kpis} />

      <TabsBar
        active={tab}
        openBroken={broken.open.length}
        openGaps={gaps.filter((g) => g.status === "OPEN").length}
      />

      {tab === "settings" && (
        <SettingsTab settings={settings} canWrite={canWrite} />
      )}
      {tab === "keywords" && (
        <KeywordsTab rows={keywords.rows} q={asString(sp.q)} canWrite={canWrite} />
      )}
      {tab === "backlinks" && (
        <BacklinksTab breakdown={backlinks} canWrite={canWrite} />
      )}
      {tab === "broken" && (
        <BrokenLinksTab open={broken.open} resolved={broken.resolved} canWrite={canWrite} />
      )}
      {tab === "gaps" && (
        <ContentGapsTab gaps={gaps} canWrite={canWrite} />
      )}
      {tab === "speed" && (
        <PageSpeedTab speed={speed} canWrite={canWrite} />
      )}
    </div>
  );
}

/* ── Header ─────────────────────────────────────────────── */

function Header() {
  return (
    <div>
      <div className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Marketing</div>
      <h1 className="mt-1 text-[22px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
        SEO &amp; Content
      </h1>
      <p className="mt-1 max-w-3xl text-[12px]" style={{ color: "var(--text-muted)" }}>
        Site-wide settings, keyword rankings, backlink monitoring, broken-link checker,
        content-gap opportunities, and Core Web Vitals — one operating dashboard for the
        marketing site's discoverability.
      </p>
    </div>
  );
}

/* ── KPI strip ──────────────────────────────────────────── */

function KpiStrip({ kpis }: { kpis: SeoKpis }) {
  const momentum = kpis.rankingMomentum;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      <Kpi label="Tracked keywords"
           value={kpis.trackedKeywords.toLocaleString()}
           sub={`${kpis.top10Keywords} in top 10`} />
      <Kpi label="Ranking momentum"
           value={momentum > 0 ? `+${momentum}` : String(momentum)}
           sub="vs prev snapshot"
           tone={momentum > 0 ? "good" : momentum < 0 ? "danger" : "default"} />
      <Kpi label="Backlinks"
           value={kpis.totalBacklinks.toLocaleString()}
           sub={`+${kpis.newBacklinks30d}/-${kpis.lostBacklinks30d} (30d)`}
           tone={kpis.newBacklinks30d >= kpis.lostBacklinks30d ? "good" : "warning"} />
      <Kpi label="Broken links · open"
           value={kpis.openBrokenLinks.toLocaleString()}
           sub="Awaiting fix"
           tone={kpis.openBrokenLinks > 5 ? "warning" : kpis.openBrokenLinks > 0 ? "default" : "good"} />
      <Kpi label="Content gaps · open"
           value={kpis.contentGapsOpen.toLocaleString()}
           sub="Opportunities" />
      <Kpi label="Mobile perf"
           value={kpis.avgMobilePerfScore == null ? "—" : `${Math.round(kpis.avgMobilePerfScore)}`}
           sub="90d Lighthouse avg"
           tone={kpis.avgMobilePerfScore == null ? "default" :
                 kpis.avgMobilePerfScore >= 75 ? "good" :
                 kpis.avgMobilePerfScore >= 50 ? "warning" : "danger"} />
    </div>
  );
}

/* ── Tabs ───────────────────────────────────────────────── */

function TabsBar({ active, openBroken, openGaps }: { active: Tab; openBroken: number; openGaps: number }) {
  const items: Array<{ key: Tab; label: string; badge?: string; tone?: "warn" }> = [
    { key: "keywords",  label: "Keywords" },
    { key: "backlinks", label: "Backlinks" },
    { key: "broken",    label: "Broken links",  badge: openBroken > 0 ? String(openBroken) : undefined, tone: "warn" },
    { key: "gaps",      label: "Content gaps",  badge: openGaps > 0 ? String(openGaps) : undefined },
    { key: "speed",     label: "Page speed" },
    { key: "settings",  label: "Settings" },
  ];
  return (
    <nav className="flex flex-wrap items-center gap-1 border-b" style={{ borderColor: "var(--border-subtle)" }}>
      {items.map((i) => {
        const isActive = i.key === active;
        return (
          <Link
            key={i.key}
            href={`?tab=${i.key}`}
            scroll={false}
            className="ts-focus inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium"
            style={{
              color: isActive ? "var(--text-default)" : "var(--text-muted)",
              borderBottom: isActive ? "2px solid var(--accent-primary)" : "2px solid transparent",
              marginBottom: "-1px",
            }}>
            {i.label}
            {i.badge && (
              <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                    style={{
                      background: i.tone === "warn" ? "var(--warning-surface)" : "var(--surface-2)",
                      color:      i.tone === "warn" ? "var(--warning-fg)"     : "var(--text-muted)",
                    }}>
                {i.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/* ── Settings tab ───────────────────────────────────────── */

function SettingsTab({ settings, canWrite }: { settings: SeoSettingsView; canWrite: boolean }) {
  const hreflangsRaw = settings.hreflangs.map((h) => `${h.lang}|${h.url}`).join("\n");
  return (
    <div className="space-y-4">
      <form action={saveSeoSettings}
            className="rounded-lg border p-4 space-y-3"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <fieldset disabled={!canWrite} className="contents">
          <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
            Site-wide settings
          </h2>

          <Field label="Default canonical domain (e.g. https://flowtora.com)">
            <input type="url" name="defaultCanonicalDomain" defaultValue={settings.defaultCanonicalDomain ?? ""}
                   maxLength={200}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Meta title template ({{page}} / {{site}} placeholders)">
            <input type="text" name="metaTitleTemplate" defaultValue={settings.metaTitleTemplate}
                   maxLength={200}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Default meta description (used when a page doesn't override)">
            <textarea name="metaDescription" defaultValue={settings.metaDescription ?? ""}
                      rows={2} maxLength={500}
                      className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                      style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Default Open Graph image URL">
            <input type="url" name="ogImageUrl" defaultValue={settings.ogImageUrl ?? ""}
                   maxLength={500}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="hreflang alternates (one per line, format: lang|url)">
            <textarea name="hreflangsRaw" defaultValue={hreflangsRaw}
                      rows={3} maxLength={5000}
                      placeholder="en-us|https://flowtora.com/&#10;es-mx|https://flowtora.com/es/"
                      className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                      style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="robots.txt body">
            <textarea name="robotsTxt" defaultValue={settings.robotsTxt}
                      rows={6} maxLength={20_000}
                      className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                      style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
            <input type="checkbox" name="sitemapEnabled" defaultChecked={settings.sitemapEnabled}
                   className="ts-focus h-4 w-4" />
            sitemap.xml enabled (auto-generated from marketing routes + landing pages)
          </label>

          <div className="flex justify-end">
            <button type="submit"
                    className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                    style={{ background: "var(--accent-primary)", color: "white" }}>
              Save settings
            </button>
          </div>
        </fieldset>
      </form>

      <div className="rounded-lg border p-3 flex flex-wrap items-center gap-3"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <div className="text-[12px]" style={{ color: "var(--text-default)" }}>
          <strong>sitemap.xml</strong> — last generated{" "}
          <span style={{ color: "var(--text-muted)" }}>
            {settings.sitemapLastGeneratedAt
              ? `${relativeFromNow(settings.sitemapLastGeneratedAt)} (${settings.sitemapUrlCount.toLocaleString()} URLs)`
              : "never"}
          </span>
        </div>
        {canWrite && (
          <form action={regenerateSitemap} className="ml-auto">
            <button type="submit"
                    className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                    style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
              Regenerate now
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/* ── Keywords tab ───────────────────────────────────────── */

function KeywordsTab({ rows, q, canWrite }: { rows: KeywordRow[]; q?: string; canWrite: boolean }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form className="flex flex-1 flex-wrap items-center gap-2" method="get">
          <input type="hidden" name="tab" value="keywords" />
          <input type="text" name="q" defaultValue={q ?? ""}
                 placeholder="Search keywords…"
                 className="ts-focus min-w-[260px] flex-1 rounded-md border px-2.5 py-1.5 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          <button type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
            Filter
          </button>
        </form>
        {canWrite && (
          <form action={syncKeywords}>
            <button type="submit"
                    className="ts-focus rounded-md px-2.5 py-1.5 text-[12px] font-medium"
                    style={{ background: "var(--accent-surface)", color: "var(--accent-primary)", border: "1px solid var(--accent-primary)" }}
                    title="Pull fresh positions from SEMrush/Ahrefs">
              Sync now
            </button>
          </form>
        )}
      </div>

      {canWrite && (
        <details className="rounded-lg border p-3"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
            + Add tracked keyword
          </summary>
          <KeywordForm canWrite={canWrite} />
        </details>
      )}

      <div className="rounded-lg border overflow-x-auto"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        {rows.length === 0 ? (
          <p className="p-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
            No keywords tracked yet — add a keyword above or sync from SEMrush/Ahrefs.
          </p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Keyword</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Intent</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">Position</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">Δ</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">Volume</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">Difficulty</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">URL</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Last checked</th>
                {canWrite && <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((k) => {
                const tone = intentTone(k.intent);
                const deltaText = k.delta == null ? "—" : k.delta > 0 ? `+${k.delta}` : String(k.delta);
                const deltaColor = k.delta == null ? "var(--text-faint)" :
                                   k.delta > 0 ? "var(--success-fg)" :
                                   k.delta < 0 ? "var(--danger-fg)" : "var(--text-muted)";
                const positionColor = k.position == null ? "var(--text-faint)" :
                                       k.position <= 3 ? "var(--success-fg)" :
                                       k.position <= 10 ? "var(--text-default)" :
                                       k.position <= 30 ? "var(--warning-fg)" : "var(--text-muted)";
                return (
                  <tr key={k.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                    <td className="px-2 py-1.5">
                      <details>
                        <summary className="cursor-pointer font-medium" style={{ color: "var(--text-default)" }}>
                          {k.keyword}
                        </summary>
                        <div className="mt-2">
                          <KeywordForm canWrite={canWrite} initial={k} />
                          {canWrite && (
                            <form action={deleteKeyword} className="mt-2">
                              <input type="hidden" name="id" value={k.id} />
                              <button type="submit"
                                      className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                                      style={{ background: "var(--surface-1)", color: "var(--danger-fg)", border: "1px solid var(--rose-200)" }}>
                                Delete keyword
                              </button>
                            </form>
                          )}
                        </div>
                      </details>
                      {k.tags.length > 0 && (
                        <div className="mt-0.5 flex gap-1 flex-wrap">
                          {k.tags.map((t) => (
                            <span key={t} className="rounded-full px-1.5 py-0.5 text-[9px]"
                                  style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                            style={{ background: tone.bg, color: tone.fg }}>
                        {intentLabel(k.intent)}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold"
                        style={{ color: positionColor }}>
                      {k.position ?? "100+"}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: deltaColor }}>
                      {deltaText}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {k.searchVolume == null ? "—" : k.searchVolume.toLocaleString()}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums"
                        style={{ color: k.difficulty == null ? "var(--text-faint)" :
                                        k.difficulty >= 70 ? "var(--danger-fg)" :
                                        k.difficulty >= 40 ? "var(--warning-fg)" : "var(--text-muted)" }}>
                      {k.difficulty ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                      {k.url ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                      {relativeFromNow(k.lastCheckedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function KeywordForm({ canWrite, initial }: { canWrite: boolean; initial?: KeywordRow }) {
  return (
    <form action={saveKeyword} className="grid grid-cols-1 gap-2 md:grid-cols-2">
      <fieldset disabled={!canWrite} className="contents">
        {initial && <input type="hidden" name="id" value={initial.id} />}
        <Field label="Keyword">
          <input type="text" name="keyword" required maxLength={200} defaultValue={initial?.keyword ?? ""}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Intent">
          <select name="intent" defaultValue={initial?.intent ?? "INFORMATIONAL"}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
            {INTENTS.map((i) => <option key={i} value={i}>{intentLabel(i)}</option>)}
          </select>
        </Field>
        <Field label="Search volume (monthly)">
          <input type="number" name="searchVolume" min={0} max={10_000_000}
                 defaultValue={initial?.searchVolume ?? ""}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Difficulty (0-100)">
          <input type="number" name="difficulty" min={0} max={100}
                 defaultValue={initial?.difficulty ?? ""}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Current position (1-100)">
          <input type="number" name="position" min={0} max={200}
                 defaultValue={initial?.position ?? ""}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Country">
          <input type="text" name="country" maxLength={8}
                 defaultValue={initial?.country ?? "US"}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Target URL" full>
          <input type="text" name="url" maxLength={500}
                 defaultValue={initial?.url ?? ""}
                 placeholder="/pricing"
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Tags (comma-separated)" full>
          <input type="text" name="tagsRaw" maxLength={500}
                 defaultValue={(initial?.tags ?? []).join(", ")}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <div className="md:col-span-2 flex items-center justify-between">
          <label className="inline-flex items-center gap-2 text-[12px]"
                 style={{ color: "var(--text-default)" }}>
            <input type="checkbox" name="active" defaultChecked={initial == null ? true : true} className="ts-focus h-4 w-4" />
            Active — included in syncs
          </label>
          <button type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "white" }}>
            Save keyword
          </button>
        </div>
      </fieldset>
    </form>
  );
}

/* ── Backlinks tab ──────────────────────────────────────── */

function BacklinksTab({ breakdown, canWrite }: { breakdown: BacklinkBreakdown; canWrite: boolean }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          {breakdown.total.toLocaleString()} total · +{breakdown.newSinceDays} new · −{breakdown.lostSinceDays} lost (30d)
        </p>
        {canWrite && (
          <form action={syncBacklinks} className="ml-auto">
            <button type="submit"
                    className="ts-focus rounded-md px-2.5 py-1.5 text-[12px] font-medium"
                    style={{ background: "var(--accent-surface)", color: "var(--accent-primary)", border: "1px solid var(--accent-primary)" }}
                    title="Pull fresh referring-domains data from Ahrefs">
              Sync now
            </button>
          </form>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-lg border p-3"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <h3 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
            Top referring domains
          </h3>
          {breakdown.byDomain.length === 0 ? (
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No active backlinks yet.</p>
          ) : (
            <ul className="space-y-1">
              {breakdown.byDomain.slice(0, 10).map((d) => (
                <li key={d.domain} className="flex items-center justify-between text-[12px]">
                  <span style={{ color: "var(--text-default)" }}>{d.domain}</span>
                  <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {d.count} link{d.count === 1 ? "" : "s"}
                    {d.avgDA != null && ` · DA ${Math.round(d.avgDA)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border p-3"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <h3 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
            Anchor text distribution
          </h3>
          {breakdown.anchorDistribution.length === 0 ? (
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No anchor data captured.</p>
          ) : (
            <ul className="space-y-1">
              {breakdown.anchorDistribution.map((a) => {
                const max = breakdown.anchorDistribution[0]!.count;
                const pct = (a.count / max) * 100;
                return (
                  <li key={a.anchor} className="text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="truncate" style={{ color: "var(--text-default)" }} title={a.anchor}>
                        {a.anchor}
                      </span>
                      <span className="ml-2 tabular-nums" style={{ color: "var(--text-muted)" }}>
                        {a.count}
                      </span>
                    </div>
                    <div className="mt-0.5 h-1.5 w-full rounded-full"
                         style={{ background: "var(--surface-2)" }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--accent-primary)" }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-lg border overflow-x-auto"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        {breakdown.rows.length === 0 ? (
          <p className="p-3 text-[11px]" style={{ color: "var(--text-muted)" }}>No backlinks tracked.</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Source</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Target</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Anchor</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">DA</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Type</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Status</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">First seen</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.rows.slice(0, 100).map((b) => {
                const tone = backlinkStatusTone(b.status);
                return (
                  <tr key={b.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                    <td className="px-2 py-1.5">
                      <a href={b.sourceUrl} target="_blank" rel="noopener noreferrer"
                         className="ts-focus underline" style={{ color: "var(--text-default)" }}
                         title={b.sourceUrl}>
                        {b.sourceDomain}
                      </a>
                    </td>
                    <td className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>{b.targetUrl}</td>
                    <td className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-default)" }}>
                      {b.anchorText ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {b.domainAuthority ?? "—"}
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                            style={{
                              background: b.followType === "DOFOLLOW" ? "var(--accent-surface)" : "var(--surface-2)",
                              color:      b.followType === "DOFOLLOW" ? "var(--accent-primary)" : "var(--text-muted)",
                            }}>
                        {b.followType.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                            style={{ background: tone.bg, color: tone.fg }}>
                        {b.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                      {relativeFromNow(b.firstSeenAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ── Broken links tab ──────────────────────────────────── */

function BrokenLinksTab({ open, resolved, canWrite }: { open: BrokenLinkRow[]; resolved: BrokenLinkRow[]; canWrite: boolean }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          {open.length} open · {resolved.length} resolved/ignored
        </p>
        {canWrite && (
          <form action={runBrokenLinkCrawl} className="ml-auto">
            <button type="submit"
                    className="ts-focus rounded-md px-2.5 py-1.5 text-[12px] font-medium"
                    style={{ background: "var(--accent-surface)", color: "var(--accent-primary)", border: "1px solid var(--accent-primary)" }}>
              Run crawl now
            </button>
          </form>
        )}
      </div>

      <BrokenList title={`Open · ${open.length}`} rows={open} canWrite={canWrite} showActions empty="Nothing broken — every link 200's." />
      <BrokenList title={`Resolved &amp; ignored · ${resolved.length}`} rows={resolved} canWrite={false} showActions={false} empty="History will appear here." muted />
    </div>
  );
}

function BrokenList({
  title, rows, canWrite, showActions, empty, muted,
}: {
  title: string;
  rows: BrokenLinkRow[];
  canWrite: boolean;
  showActions: boolean;
  empty: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-lg border p-3"
         style={{ background: muted ? "var(--surface-2)" : "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h3 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}
          dangerouslySetInnerHTML={{ __html: title }} />
      {rows.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-md border p-3"
                style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)" }}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                      style={{
                        background: r.statusCode === 404 ? "var(--warning-surface)" : "var(--rose-50, var(--surface-2))",
                        color:      r.statusCode === 404 ? "var(--warning-fg)" : "var(--danger-fg)",
                      }}>
                  HTTP {r.statusCode}
                </span>
                {r.context && (
                  <span className="rounded-full px-1.5 py-0.5 text-[10px]"
                        style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                    {r.context}
                  </span>
                )}
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  detected {relativeFromNow(r.firstDetectedAt)}
                </span>
                <span className="ml-auto text-[11px]" style={{ color: "var(--text-muted)" }}>
                  rechecked {relativeFromNow(r.lastCheckedAt)}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-1 text-[12px]">
                <div>
                  <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>On page</span>
                  <div style={{ color: "var(--text-default)" }}>{r.pageUrl}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Broken link</span>
                  <div style={{ color: "var(--text-default)" }}>
                    <code className="rounded px-1 py-0.5 text-[11px]" style={{ background: "var(--surface-2)" }}>
                      {r.brokenUrl}
                    </code>
                    {r.anchorText && (
                      <span className="ml-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                        anchor: &ldquo;{r.anchorText}&rdquo;
                      </span>
                    )}
                  </div>
                </div>
                {r.fixSuggestion && (
                  <div className="rounded-md border-l-2 px-2 py-1 text-[11px]"
                       style={{ borderColor: "var(--accent-primary)", background: "var(--surface-2)", color: "var(--text-default)" }}>
                    <strong>Suggestion:</strong> {r.fixSuggestion}
                  </div>
                )}
                {r.resolutionNote && (
                  <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    Resolution note: {r.resolutionNote}
                  </div>
                )}
              </div>
              {showActions && canWrite && (
                <form action={resolveBrokenLink} className="mt-3 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="text" name="note" placeholder="Resolution note (optional)" maxLength={500}
                         className="ts-focus min-w-[200px] flex-1 rounded-md border px-2 py-1 text-[11px]"
                         style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
                  <button type="submit"
                          className="ts-focus rounded-md px-2.5 py-1 text-[11px] font-medium"
                          style={{ background: "var(--success-fg)", color: "white" }}>
                    Mark resolved
                  </button>
                  <button type="submit" formAction={ignoreBrokenLink}
                          className="ts-focus rounded-md px-2.5 py-1 text-[11px] font-medium"
                          style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border-default)" }}>
                    Ignore
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Content gaps tab ──────────────────────────────────── */

function ContentGapsTab({ gaps, canWrite }: { gaps: ContentGapRow[]; canWrite: boolean }) {
  const open = gaps.filter((g) => g.status === "OPEN");
  const inProgress = gaps.filter((g) => g.status === "IN_PROGRESS");
  const closed = gaps.filter((g) => g.status === "PUBLISHED" || g.status === "IGNORED");
  return (
    <div className="space-y-3">
      {canWrite && (
        <details className="rounded-lg border p-3"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
            + Add content gap
          </summary>
          <form action={createContentGap} className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
            <fieldset disabled={!canWrite} className="contents">
              <Field label="Keyword">
                <input type="text" name="keyword" required maxLength={200}
                       className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                       style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
              </Field>
              <Field label="Intent">
                <select name="intent" defaultValue="INFORMATIONAL"
                        className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                        style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
                  {INTENTS.map((i) => <option key={i} value={i}>{intentLabel(i)}</option>)}
                </select>
              </Field>
              <Field label="Search volume">
                <input type="number" name="searchVolume" min={0} max={10_000_000}
                       className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                       style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
              </Field>
              <Field label="Difficulty (0-100)">
                <input type="number" name="difficulty" min={0} max={100}
                       className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                       style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
              </Field>
              <Field label="Competitor URL">
                <input type="url" name="competitorUrl" maxLength={500}
                       className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                       style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
              </Field>
              <Field label="Competitor domain">
                <input type="text" name="competitorDomain" maxLength={200}
                       className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                       style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
              </Field>
              <Field label="Notes" full>
                <textarea name="notes" maxLength={1000} rows={2}
                          className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                          style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
              </Field>
              <div className="md:col-span-2 flex justify-end">
                <button type="submit"
                        className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                        style={{ background: "var(--accent-primary)", color: "white" }}>
                  Add gap
                </button>
              </div>
            </fieldset>
          </form>
        </details>
      )}

      <GapColumn title={`Open · ${open.length}`} rows={open} canWrite={canWrite} />
      <GapColumn title={`In progress · ${inProgress.length}`} rows={inProgress} canWrite={canWrite} />
      <GapColumn title={`Published &amp; ignored · ${closed.length}`} rows={closed} canWrite={canWrite} muted />
    </div>
  );
}

function GapColumn({ title, rows, canWrite, muted }: {
  title: string; rows: ContentGapRow[]; canWrite: boolean; muted?: boolean;
}) {
  return (
    <div className="rounded-lg border p-3"
         style={{ background: muted ? "var(--surface-2)" : "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h3 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}
          dangerouslySetInnerHTML={{ __html: title }} />
      {rows.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Nothing in this bucket.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((g) => {
            const tone = gapStatusTone(g.status);
            return (
              <li key={g.id} className="rounded-md border p-3"
                  style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)" }}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                        style={{ background: tone.bg, color: tone.fg }}>
                    {g.status.replace(/_/g, " ").toLowerCase()}
                  </span>
                  <span className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
                    {g.keyword}
                  </span>
                  {g.priorityScore > 0 && (
                    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}
                          title="Volume ÷ difficulty (higher = better opportunity)">
                      priority {g.priorityScore}
                    </span>
                  )}
                </div>
                <div className="mt-1 grid grid-cols-2 gap-2 text-[11px] md:grid-cols-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Volume</div>
                    <div style={{ color: "var(--text-default)" }}>{g.searchVolume?.toLocaleString() ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Difficulty</div>
                    <div style={{ color: "var(--text-default)" }}>{g.difficulty ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Intent</div>
                    <div style={{ color: "var(--text-default)" }}>{intentLabel(g.intent)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Our position</div>
                    <div style={{ color: "var(--text-default)" }}>{g.ourPosition ?? "Not ranking"}</div>
                  </div>
                </div>
                {g.competitorDomain && (
                  <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    Competitor: {" "}
                    {g.competitorUrl ? (
                      <a href={g.competitorUrl} target="_blank" rel="noopener noreferrer" className="underline"
                         style={{ color: "var(--accent-primary)" }}>{g.competitorDomain}</a>
                    ) : g.competitorDomain}
                  </p>
                )}
                {g.notes && (
                  <p className="mt-1 text-[11px]" style={{ color: "var(--text-default)" }}>{g.notes}</p>
                )}
                {canWrite && (
                  <form action={updateContentGapStatus} className="mt-2 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={g.id} />
                    <select name="status" defaultValue={g.status}
                            className="ts-focus rounded-md border px-2 py-1 text-[11px]"
                            style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
                      <option value="OPEN">Open</option>
                      <option value="IN_PROGRESS">In progress</option>
                      <option value="PUBLISHED">Published</option>
                      <option value="IGNORED">Ignored</option>
                    </select>
                    <input type="text" name="notes" placeholder="Note" maxLength={1000}
                           defaultValue={g.notes ?? ""}
                           className="ts-focus min-w-[200px] flex-1 rounded-md border px-2 py-1 text-[11px]"
                           style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
                    <button type="submit"
                            className="ts-focus rounded-md px-2.5 py-1 text-[11px] font-medium"
                            style={{ background: "var(--accent-primary)", color: "white" }}>
                      Update
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ── Page speed tab ────────────────────────────────────── */

function PageSpeedTab({ speed, canWrite }: {
  speed: { mobile: PageSpeedRow[]; desktop: PageSpeedRow[] };
  canWrite: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Latest Core Web Vitals snapshot per URL · {speed.mobile.length + speed.desktop.length} URLs measured
        </p>
        {canWrite && (
          <form action={runPageSpeedCrawl} className="ml-auto">
            <button type="submit"
                    className="ts-focus rounded-md px-2.5 py-1.5 text-[12px] font-medium"
                    style={{ background: "var(--accent-surface)", color: "var(--accent-primary)", border: "1px solid var(--accent-primary)" }}
                    title="Run a fresh Lighthouse-equivalent crawl across known URLs">
              Run crawl now
            </button>
          </form>
        )}
      </div>

      <SpeedTable title="Mobile · Lighthouse" rows={speed.mobile} />
      <SpeedTable title="Desktop · Lighthouse" rows={speed.desktop} />
    </div>
  );
}

function SpeedTable({ title, rows }: { title: string; rows: PageSpeedRow[] }) {
  return (
    <div className="rounded-lg border overflow-x-auto"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h3 className="px-3 pt-3 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="p-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
          No measurements yet — run the crawl to capture initial snapshots.
        </p>
      ) : (
        <table className="mt-2 w-full text-[12px]">
          <thead>
            <tr style={{ color: "var(--text-muted)" }}>
              <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">URL</th>
              <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">Score</th>
              <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Trend</th>
              <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">LCP (s)</th>
              <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">INP (ms)</th>
              <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">CLS</th>
              <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">TTFB (ms)</th>
              <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Measured</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const lcpToneVal = lcpTone(r.lcp);
              const inpToneVal = inpTone(r.inp);
              const clsToneVal = clsTone(r.cls);
              return (
                <tr key={`${r.device}:${r.url}`} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <td className="px-2 py-1.5" style={{ color: "var(--text-default)" }}>{r.url}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold"
                      style={{ color: r.performanceScore == null ? "var(--text-faint)" :
                                      r.performanceScore >= 75 ? "var(--success-fg)" :
                                      r.performanceScore >= 50 ? "var(--warning-fg)" : "var(--danger-fg)" }}>
                    {r.performanceScore ?? "—"}
                  </td>
                  <td className="px-2 py-1.5">
                    <Sparkline values={r.trend} max={100} />
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums"
                      style={{ color: toneToColor(lcpToneVal) }}>
                    {r.lcp == null ? "—" : r.lcp.toFixed(2)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums"
                      style={{ color: toneToColor(inpToneVal) }}>
                    {r.inp == null ? "—" : Math.round(r.inp)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums"
                      style={{ color: toneToColor(clsToneVal) }}>
                    {r.cls == null ? "—" : r.cls.toFixed(2)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {r.ttfb == null ? "—" : Math.round(r.ttfb)}
                  </td>
                  <td className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {relativeFromNow(r.measuredAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function toneToColor(t: "good" | "warning" | "danger" | "default"): string {
  switch (t) {
    case "good":    return "var(--success-fg)";
    case "warning": return "var(--warning-fg)";
    case "danger":  return "var(--danger-fg)";
    default:        return "var(--text-muted)";
  }
}
