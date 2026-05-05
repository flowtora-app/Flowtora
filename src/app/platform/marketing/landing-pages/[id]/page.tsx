// Page 38 — Landing page editor.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadLandingPageDetail,
  loadLandingPageAnalytics,
  loadDomains,
} from "@/server/platform/landing-pages";
import {
  saveLandingPage,
  transitionLandingPage,
  rollbackLandingPage,
  upsertLandingPageVariant,
  deleteLandingPageVariant,
  declareAbWinner,
} from "@/app/actions/platform-landing-pages";
import type { LandingPageStatus, LandingPageMetric } from "@prisma/client";
import {
  FormError,
  FormOk,
  STATUS_LABEL,
  STATUS_TONE,
  StatusPill,
  relativeFromNow,
} from "../_components/shared";
import {
  LpEditorTabsBar,
  isLpEditorTab,
  type LpEditorTab,
} from "../_components/EditorTabs";
import { BlockBuilder } from "../_components/BlockBuilder";

export const dynamic = "force-dynamic";

const STATUSES: LandingPageStatus[] = ["DRAFT", "SCHEDULED", "LIVE", "ARCHIVED"];
const METRICS: LandingPageMetric[] = ["SIGNUP", "CLICK", "SCROLL_DEPTH", "TIME_ON_PAGE", "CONVERSION"];

const dtLocal = (d: Date | null) => d ? d.toISOString().slice(0, 16) : "";

export default async function LandingPageEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requirePlatformStaff();
  const canWrite = ctx.can("announcement.write");

  const tab: LpEditorTab = isLpEditorTab(sp.tab) ? sp.tab : "builder";

  const [page, analytics, domains] = await Promise.all([
    loadLandingPageDetail(id),
    tab === "analytics" ? loadLandingPageAnalytics(id, 30) : Promise.resolve(null),
    loadDomains(),
  ]);
  if (!page) notFound();

  const hrefFor = (t: LpEditorTab) =>
    `/platform/marketing/landing-pages/${page.id}${t === "builder" ? "" : `?tab=${t}`}`;

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        <Link href="/platform/marketing/landing-pages" className="underline" style={{ color: "var(--text-muted)" }}>
          Landing pages
        </Link>
        <span className="mx-1.5">/</span>
        <span style={{ color: "var(--text-default)" }}>{page.title}</span>
      </div>

      <FormOk msg={sp.ok} />
      <FormError msg={sp.error} />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusPill status={page.status} />
            <span className="font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>
              {page.path}
            </span>
            {page.customDomain && (
              <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                    style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                🔗 {page.customDomain.hostname}
              </span>
            )}
            {page.variants.length > 0 && (
              <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                    style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}>
                A/B · {page.variants.length}
              </span>
            )}
          </div>
          <h1 className="mt-1.5 text-[22px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
            {page.title}
          </h1>
          <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
            {page.authorName ? `By ${page.authorName} · ` : ""}
            updated {relativeFromNow(page.updatedAt)}
            {page.publishedAt && ` · published ${relativeFromNow(page.publishedAt)}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/lp${page.path}`}
            target="_blank"
            rel="noopener"
            className="ts-focus rounded-md px-3 py-1.5 text-[11px] font-medium"
            style={{ background: "var(--surface-1)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}
          >
            🔍 Preview
          </Link>
          {canWrite && page.status !== "LIVE" && (
            <PublishForm id={page.id} kind="LIVE" label="Publish" />
          )}
          {canWrite && page.status !== "ARCHIVED" && (
            <PublishForm id={page.id} kind="ARCHIVED" label="Archive" />
          )}
          {canWrite && page.status === "LIVE" && (
            <PublishForm id={page.id} kind="DRAFT" label="Unpublish" />
          )}
        </div>
      </div>

      <LpEditorTabsBar active={tab} hrefFor={hrefFor} />

      <div
        className="rounded-lg border p-4"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
      >
        {tab === "builder"   && <BuilderTab page={page} canWrite={canWrite} domains={domains} />}
        {tab === "code"      && <CodeTab page={page} canWrite={canWrite} domains={domains} />}
        {tab === "seo"       && <SeoTab page={page} canWrite={canWrite} domains={domains} />}
        {tab === "ab"        && <AbTab page={page} canWrite={canWrite} />}
        {tab === "analytics" && <AnalyticsTab page={page} analytics={analytics} />}
        {tab === "versions"  && <VersionsTab page={page} canWrite={canWrite} />}
      </div>
    </div>
  );
}

function PublishForm({ id, kind, label }: { id: string; kind: LandingPageStatus; label: string }) {
  return (
    <form action={transitionLandingPage}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="to" value={kind} />
      <button
        type="submit"
        className="ts-focus rounded-md px-3 py-1.5 text-[11px] font-semibold"
        style={{
          background: kind === "LIVE" ? "var(--accent-primary)" : "var(--surface-1)",
          color: kind === "LIVE" ? "var(--accent-fg)" : STATUS_TONE[kind].fg,
          border: kind === "LIVE" ? undefined : `1px solid ${STATUS_TONE[kind].fg}`,
        }}
      >
        {label}
      </button>
    </form>
  );
}

/* ── Builder tab ──────────────────────────────────────── */

function BuilderTab({
  page, canWrite, domains,
}: {
  page: NonNullable<Awaited<ReturnType<typeof loadLandingPageDetail>>>;
  canWrite: boolean;
  domains: { id: string; hostname: string; status: string }[];
}) {
  return (
    <SaveForm page={page} canWrite={canWrite} domains={domains}>
      <BlockBuilder
        initial={page.blocks}
        hiddenInputName="blocksJson"
        customCss={page.customCss}
      />
    </SaveForm>
  );
}

/* ── Code mode tab ────────────────────────────────────── */

function CodeTab({
  page, canWrite, domains,
}: {
  page: NonNullable<Awaited<ReturnType<typeof loadLandingPageDetail>>>;
  canWrite: boolean;
  domains: { id: string; hostname: string; status: string }[];
}) {
  return (
    <SaveForm page={page} canWrite={canWrite} domains={domains}>
      <input type="hidden" name="blocksJson" value={JSON.stringify(page.blocks)} />
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        Code mode replaces the block render entirely. Use it for one-off pages that don&apos;t fit the
        block library — the block list is preserved so you can switch back.
      </p>
      <Field label="Custom HTML" help="Replaces the rendered blocks when set.">
        <textarea name="customHtml" defaultValue={page.customHtml ?? ""} rows={14}
                  disabled={!canWrite}
                  className="ts-focus w-full rounded-md px-3 py-2 font-mono text-[11px] outline-none"
                  style={{ ...inputStyle(), lineHeight: 1.5 }} />
      </Field>
      <Field label="Custom CSS" help="Injected into both the public render and the builder preview.">
        <textarea name="customCss" defaultValue={page.customCss ?? ""} rows={8}
                  disabled={!canWrite}
                  className="ts-focus w-full rounded-md px-3 py-2 font-mono text-[11px] outline-none"
                  style={{ ...inputStyle(), lineHeight: 1.5 }} />
      </Field>
      <Field label="Custom JS" help="Runs after the page renders. Use sparingly.">
        <textarea name="customJs" defaultValue={page.customJs ?? ""} rows={6}
                  disabled={!canWrite}
                  className="ts-focus w-full rounded-md px-3 py-2 font-mono text-[11px] outline-none"
                  style={{ ...inputStyle(), lineHeight: 1.5 }} />
      </Field>
    </SaveForm>
  );
}

/* ── SEO tab ──────────────────────────────────────────── */

function SeoTab({
  page, canWrite, domains,
}: {
  page: NonNullable<Awaited<ReturnType<typeof loadLandingPageDetail>>>;
  canWrite: boolean;
  domains: { id: string; hostname: string; status: string }[];
}) {
  return (
    <SaveForm page={page} canWrite={canWrite} domains={domains}>
      <input type="hidden" name="blocksJson" value={JSON.stringify(page.blocks)} />
      <input type="hidden" name="customHtml" value={page.customHtml ?? ""} />
      <input type="hidden" name="customCss"  value={page.customCss  ?? ""} />
      <input type="hidden" name="customJs"   value={page.customJs   ?? ""} />
      <input type="hidden" name="formSchemaJson" value={JSON.stringify(page.formSchema)} />
      <Field label="Meta title">
        <input name="metaTitle" defaultValue={page.metaTitle ?? ""} maxLength={200} disabled={!canWrite}
               className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
               style={inputStyle()} />
      </Field>
      <Field label="Meta description">
        <textarea name="metaDescription" defaultValue={page.metaDescription ?? ""} maxLength={400}
                  rows={3} disabled={!canWrite}
                  className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
                  style={inputStyle()} />
      </Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Canonical URL">
          <input name="canonicalUrl" defaultValue={page.canonicalUrl ?? ""} disabled={!canWrite}
                 className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
                 style={inputStyle()} />
        </Field>
        <Field label="OG image URL">
          <input name="ogImageUrl" defaultValue={page.ogImageUrl ?? ""} disabled={!canWrite}
                 className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
                 style={inputStyle()} />
        </Field>
      </div>
      <Field label="Schema.org JSON-LD" help="Pasted as-is into the &lt;head&gt; on the public render.">
        <textarea name="schemaJsonLd" defaultValue={page.schemaJsonLd ?? ""}
                  rows={6} disabled={!canWrite}
                  className="ts-focus w-full rounded-md px-3 py-2 font-mono text-[11px] outline-none"
                  style={{ ...inputStyle(), lineHeight: 1.5 }} />
      </Field>
      {page.ogImageUrl && (
        <div className="overflow-hidden rounded-md border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", maxWidth: 600, aspectRatio: "1.91 / 1" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={page.ogImageUrl} alt="OG preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      )}
    </SaveForm>
  );
}

/* ── A/B test tab ─────────────────────────────────────── */

function AbTab({
  page, canWrite,
}: {
  page: NonNullable<Awaited<ReturnType<typeof loadLandingPageDetail>>>;
  canWrite: boolean;
}) {
  const totalWeight = page.variants.reduce((s, v) => s + v.trafficPct, 0);
  const winner = page.abTestWinnerLabel;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        Variants split traffic by weight. The runtime hashes (pageId + sessionId) so each visitor sees a
        consistent variant. Weights total <b style={{ color: totalWeight > 100 ? "var(--danger-fg)" : "var(--text-default)" }}>{totalWeight}%</b>{" "}
        — remainder ({Math.max(0, 100 - totalWeight)}%) reads the parent page.
      </p>

      {page.variants.length > 0 && (
        <div className="grid gap-2 rounded-md border p-3"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Performance
          </div>
          <ul className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {page.variants.map((v) => {
              const cr = v.visitCount === 0 ? null : (v.conversionCount / v.visitCount) * 100;
              const isWinner = winner === v.label;
              return (
                <li
                  key={v.id}
                  className="rounded-md border p-2"
                  style={{
                    background: "var(--surface-1)",
                    borderColor: isWinner ? "var(--success-fg)" : "var(--border-subtle)",
                  }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
                      {v.label}
                    </span>
                    {isWinner && (
                      <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                            style={{ background: "var(--success-surface)", color: "var(--success-fg)" }}>
                        Winner
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {v.trafficPct}% traffic · {v.visitCount.toLocaleString()} visits ·{" "}
                    {v.conversionCount.toLocaleString()} converted
                  </div>
                  <div className="mt-0.5 text-[14px] font-semibold tabular-nums"
                       style={{ color: cr == null ? "var(--text-faint)" : cr >= 5 ? "var(--success-fg)" : "var(--text-default)" }}>
                    {cr == null ? "—" : `${cr.toFixed(2)}%`}
                  </div>
                  {canWrite && !isWinner && (
                    <form action={declareAbWinner} className="mt-2">
                      <input type="hidden" name="pageId" value={page.id} />
                      <input type="hidden" name="label"  value={v.label} />
                      <button type="submit"
                              className="ts-focus rounded-md px-2 py-1 text-[10px] font-semibold"
                              style={{
                                background: "var(--success-surface)",
                                color: "var(--success-fg)",
                                border: "1px solid var(--emerald-200, var(--border-default))",
                              }}>
                        Declare winner
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="rounded-md border p-3"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          Test config
        </div>
        <Field label="Primary metric">
          <select form="lp-config-form" name="abTestPrimaryMetric"
                  defaultValue={page.abTestPrimaryMetric ?? ""}
                  disabled={!canWrite}
                  className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
                  style={inputStyle()}>
            <option value="">— None —</option>
            {METRICS.map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}
          </select>
        </Field>
      </div>

      {/* Existing variant edit/delete forms */}
      {page.variants.map((v) => (
        <VariantForm key={v.id} pageId={page.id} variant={v} canWrite={canWrite} />
      ))}

      {canWrite && (
        <VariantForm pageId={page.id} canWrite={canWrite} />
      )}
    </div>
  );
}

function VariantForm({
  pageId, variant, canWrite,
}: {
  pageId: string;
  variant?: { id: string; label: string; blocks: unknown[]; customHtml: string | null; trafficPct: number };
  canWrite: boolean;
}) {
  const isNew = !variant;
  return (
    <details
      open={!variant}
      className="rounded-md border p-3"
      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
    >
      <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
        {isNew ? "+ Add variant" : `Edit variant: ${variant!.label}`}
      </summary>
      <form action={upsertLandingPageVariant} className="mt-3 grid gap-2">
        {variant && <input type="hidden" name="variantId" value={variant.id} />}
        <input type="hidden" name="pageId" value={pageId} />
        <div className="grid gap-2 md:grid-cols-2">
          <Field label="Label">
            <input name="label" required maxLength={40}
                   defaultValue={variant?.label ?? ""}
                   placeholder="A / B / control"
                   disabled={!canWrite}
                   className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
                   style={inputStyle()} />
          </Field>
          <Field label="Traffic %">
            <input type="number" name="trafficPct" min={0} max={100}
                   defaultValue={variant?.trafficPct ?? 50}
                   disabled={!canWrite}
                   className="ts-focus rounded-md px-2 py-1.5 text-[12px] tabular-nums outline-none"
                   style={inputStyle()} />
          </Field>
        </div>
        <Field label="Blocks JSON" help="Paste exported block JSON or edit directly. Empty = inherit parent blocks.">
          <textarea name="blocksJson" defaultValue={JSON.stringify(variant?.blocks ?? [], null, 2)}
                    rows={6} disabled={!canWrite}
                    className="ts-focus rounded-md px-2 py-1.5 font-mono text-[11px] outline-none"
                    style={{ ...inputStyle(), lineHeight: 1.5 }} />
        </Field>
        <Field label="Custom HTML override">
          <textarea name="customHtml" defaultValue={variant?.customHtml ?? ""}
                    rows={4} disabled={!canWrite}
                    className="ts-focus rounded-md px-2 py-1.5 font-mono text-[11px] outline-none"
                    style={{ ...inputStyle(), lineHeight: 1.5 }} />
        </Field>
        {canWrite && (
          <div className="flex items-center justify-end gap-2">
            <button type="submit"
                    className="ts-focus rounded-md px-3 py-1.5 text-[11px] font-semibold"
                    style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
              {isNew ? "Add variant" : "Save"}
            </button>
          </div>
        )}
      </form>
      {variant && canWrite && (
        <form action={deleteLandingPageVariant} className="mt-2">
          <input type="hidden" name="pageId"   value={pageId} />
          <input type="hidden" name="variantId" value={variant.id} />
          <button type="submit" className="text-[10px] underline" style={{ color: "var(--danger-fg)" }}>
            Delete variant
          </button>
        </form>
      )}
    </details>
  );
}

/* ── Analytics tab ────────────────────────────────────── */

function AnalyticsTab({
  page, analytics,
}: {
  page: NonNullable<Awaited<ReturnType<typeof loadLandingPageDetail>>>;
  analytics: Awaited<ReturnType<typeof loadLandingPageAnalytics>> | null;
}) {
  if (!analytics) return null;
  const maxBar = Math.max(1, ...analytics.daily.map((d) => d.sessions));
  const maxFun = Math.max(1, ...analytics.funnel.map((f) => f.count));
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border p-3" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <h3 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
          Daily sessions · last 30 days (orange = converted)
        </h3>
        <div className="flex h-24 items-end gap-[2px]">
          {analytics.daily.map((d) => {
            const sessHeight = (d.sessions / maxBar) * 100;
            const convHeight = (d.conversions / maxBar) * 100;
            return (
              <div key={d.date} className="flex flex-1 flex-col-reverse"
                   title={`${d.date}: ${d.sessions} sessions · ${d.conversions} converted`}>
                <div className="rounded-t-sm" style={{ background: "var(--accent-primary)", height: `${Math.max(1, sessHeight - convHeight)}%` }} />
                <div style={{ background: "var(--warning-fg)", height: `${convHeight}%` }} />
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card title="Sources">
          {analytics.sources.length === 0 ? (
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No traffic recorded.</p>
          ) : (
            <ul className="flex flex-col gap-0.5 text-[11px]">
              {analytics.sources.map((s) => (
                <li key={s.source} className="flex items-baseline justify-between">
                  <span className="truncate" style={{ color: "var(--text-default)" }}>{s.source}</span>
                  <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>{s.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Devices">
          {analytics.devices.length === 0 ? (
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No traffic recorded.</p>
          ) : (
            <ul className="flex flex-col gap-0.5 text-[11px]">
              {analytics.devices.map((d) => (
                <li key={d.device} className="flex items-baseline justify-between">
                  <span style={{ color: "var(--text-default)" }}>{d.device}</span>
                  <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>{d.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Behavior">
          <dl className="grid gap-1 text-[11px]">
            <div className="flex justify-between">
              <dt style={{ color: "var(--text-muted)" }}>Bounce rate</dt>
              <dd className="tabular-nums" style={{ color: "var(--text-default)" }}>
                {analytics.bounceRatePct == null ? "—" : `${analytics.bounceRatePct.toFixed(1)}%`}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt style={{ color: "var(--text-muted)" }}>Avg scroll depth</dt>
              <dd className="tabular-nums" style={{ color: "var(--text-default)" }}>
                {analytics.avgScrollDepth == null ? "—" : `${analytics.avgScrollDepth.toFixed(0)}%`}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt style={{ color: "var(--text-muted)" }}>Avg time on page</dt>
              <dd className="tabular-nums" style={{ color: "var(--text-default)" }}>
                {analytics.avgTimeOnPageSec == null ? "—" : `${Math.round(analytics.avgTimeOnPageSec)}s`}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card title="Funnel">
        <ul className="flex flex-col gap-1.5">
          {analytics.funnel.map((f) => (
            <li key={f.label} className="grid grid-cols-[160px_minmax(0,1fr)_60px] items-center gap-2 text-[11px]">
              <span style={{ color: "var(--text-default)" }}>{f.label}</span>
              <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                <div style={{ width: `${(f.count / maxFun) * 100}%`, background: "var(--accent-primary)", height: "100%" }} />
              </div>
              <span className="tabular-nums text-right" style={{ color: "var(--text-default)" }}>
                {f.count.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <p className="text-[10px]" style={{ color: "var(--text-faint)" }}>
        Public preview: <Link href={`/lp${page.path}`} target="_blank" rel="noopener" className="underline">/lp{page.path}</Link>
      </p>
    </div>
  );
}

/* ── Versions tab ─────────────────────────────────────── */

function VersionsTab({
  page, canWrite,
}: {
  page: NonNullable<Awaited<ReturnType<typeof loadLandingPageDetail>>>;
  canWrite: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        Every save snapshots the page. Click Rollback on any revision to restore it (a fresh snapshot
        of the current state is taken first, so rollback is reversible).
      </p>
      {page.revisions.length === 0 ? (
        <div className="rounded-md border p-6 text-center text-[12px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
          No saved revisions yet.
        </div>
      ) : (
        <ul className="overflow-hidden rounded-md"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}>
          {page.revisions.map((r, idx) => (
            <li key={r.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
                style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}>
              <div className="min-w-0">
                <div className="text-[12px]" style={{ color: "var(--text-default)" }}>
                  {r.note ?? <span style={{ color: "var(--text-faint)" }}>(no note)</span>}
                </div>
                <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {relativeFromNow(r.createdAt)} · by {r.savedByName ?? "system"}
                </div>
              </div>
              {canWrite && (
                <form action={rollbackLandingPage}>
                  <input type="hidden" name="id"         value={page.id} />
                  <input type="hidden" name="revisionId" value={r.id} />
                  <button type="submit" className="ts-focus rounded-md px-2 py-1 text-[11px] font-semibold"
                          style={{
                            background: "var(--surface-1)",
                            color: "var(--warning-fg)",
                            border: "1px solid var(--amber-200, var(--border-default))",
                          }}>
                    Rollback
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

/* ── Save form wrapper (shared by Builder/Code/SEO tabs) ─ */

function SaveForm({
  page, canWrite, domains, children,
}: {
  page: NonNullable<Awaited<ReturnType<typeof loadLandingPageDetail>>>;
  canWrite: boolean;
  domains: { id: string; hostname: string; status: string }[];
  children: React.ReactNode;
}) {
  return (
    <form id="lp-config-form" action={saveLandingPage} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={page.id} />
      {/* Persist non-current-tab fields so we don't drop them. */}
      <input type="hidden" name="metaTitle"       value={page.metaTitle ?? ""} />
      <input type="hidden" name="metaDescription" value={page.metaDescription ?? ""} />
      <input type="hidden" name="ogImageUrl"      value={page.ogImageUrl ?? ""} />
      <input type="hidden" name="schemaJsonLd"    value={page.schemaJsonLd ?? ""} />
      <input type="hidden" name="canonicalUrl"    value={page.canonicalUrl ?? ""} />
      <input type="hidden" name="formSchemaJson"  value={JSON.stringify(page.formSchema)} />
      <input type="hidden" name="abTestPrimaryMetric" value={page.abTestPrimaryMetric ?? ""} />

      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Path">
          <input name="path" required defaultValue={page.path} maxLength={120} disabled={!canWrite}
                 className="ts-focus rounded-md px-2 py-1.5 font-mono text-[12px] outline-none"
                 style={inputStyle()} />
        </Field>
        <Field label="Title">
          <input name="title" required defaultValue={page.title} maxLength={200} disabled={!canWrite}
                 className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
                 style={inputStyle()} />
        </Field>
        <Field label="Custom domain">
          <select name="customDomainId" defaultValue={page.customDomain?.id ?? ""} disabled={!canWrite}
                  className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
                  style={inputStyle()}>
            <option value="">— flowtora.com only —</option>
            {domains.map((d) => (
              <option key={d.id} value={d.id} disabled={d.status !== "VERIFIED"}>
                {d.hostname} {d.status !== "VERIFIED" ? `(${d.status.toLowerCase()})` : ""}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Description (admin-side, not rendered)">
        <input name="description" defaultValue={page.description ?? ""} maxLength={400} disabled={!canWrite}
               className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
               style={inputStyle()} />
      </Field>

      {children}

      <Field label="Revision note" help="Optional — captured in the version history.">
        <input name="revisionNote" maxLength={280} disabled={!canWrite}
               placeholder="What changed?"
               className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
               style={inputStyle()} />
      </Field>

      {canWrite && (
        <div className="flex items-center justify-between gap-2">
          {page.status === "DRAFT" ? (
            <ScheduleControl pageId={page.id} publishAt={page.publishAt} />
          ) : <span />}
          <button type="submit"
                  className="ts-focus rounded-md px-4 py-2 text-[12px] font-semibold"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
            Save changes
          </button>
        </div>
      )}
    </form>
  );
}

function ScheduleControl({ pageId, publishAt }: { pageId: string; publishAt: Date | null }) {
  return (
    <form action={transitionLandingPage} className="flex items-center gap-2">
      <input type="hidden" name="id" value={pageId} />
      <input type="hidden" name="to" value="SCHEDULED" />
      <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        Schedule for
      </span>
      <input type="datetime-local" name="publishAt" defaultValue={dtLocal(publishAt)}
             className="ts-focus rounded-md px-2 py-1 text-[11px] outline-none"
             style={inputStyle()} />
      <button type="submit"
              className="ts-focus rounded-md px-2 py-1 text-[11px] font-medium"
              style={{
                background: "var(--warning-surface)",
                color: "var(--warning-fg)",
                border: "1px solid var(--amber-200, var(--border-default))",
              }}>
        Schedule
      </button>
    </form>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border p-3"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  label, help, children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      {children}
      {help && <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>{help}</span>}
    </label>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    background: "var(--surface-1)",
    border: "1px solid var(--border-default)",
    color: "var(--text-default)",
  };
}
