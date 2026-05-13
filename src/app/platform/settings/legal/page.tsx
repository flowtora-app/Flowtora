// Page 71 — Legal Documents.
//
// Six tabs: Documents · Versions · Acceptance · Locales · Re-acceptance ·
// Settings. Versioned editor with approval pipeline (Draft → Legal review →
// Counsel sign-off → Published) and tenant acceptance tracking.

import * as React from "react";
import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadLegalPage, loadDocumentDetail, loadAcceptances,
  KIND_LABEL, KIND_ORDER, STATUS_TONE, METHOD_LABEL, relativeFromNow,
} from "@/server/platform/legal-docs";
import {
  saveDocument, saveDraftVersion, submitForLegalReview, approveLegalReview,
  signOffAndPublish, rejectReview, saveLocaleTranslation,
  createReacceptance, closeReacceptance, saveLegalSettings,
} from "@/app/actions/platform-legal-docs";
import type { LegalDocumentKind, LegalDocumentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const TABS = ["documents", "versions", "acceptance", "locales", "reaccept", "settings"] as const;
type Tab = typeof TABS[number];
const TAB_LABEL: Record<Tab, string> = {
  documents:  "Documents",
  versions:   "Versions",
  acceptance: "Acceptance Tracking",
  locales:    "Locales",
  reaccept:   "Mandatory Re-acceptance",
  settings:   "Settings",
};

const KINDS: LegalDocumentKind[] = KIND_ORDER;
const STATUSES: LegalDocumentStatus[] = ["DRAFT", "LEGAL_REVIEW", "COUNSEL_SIGN_OFF", "PUBLISHED", "ARCHIVED"];

export default async function LegalDocsPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("legal.read")) {
    return (
      <main className="mx-auto max-w-2xl py-12 text-center">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          You don&apos;t have permission to view Legal Documents.
        </p>
      </main>
    );
  }
  const canWrite   = ctx.can("legal.write");
  const canPublish = ctx.can("legal.publish");
  const canReadAccept = ctx.can("legal.acceptance.read");
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab as string)
    ? (sp.tab as Tab) : "documents";
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const selectedSlug = asString(sp.slug);

  const data = await loadLegalPage();
  const { kpis, documents, reaccepts, settings } = data;
  const selected = selectedSlug ? await loadDocumentDetail(selectedSlug) : null;
  const recentAccepts = canReadAccept ? await loadAcceptances({ limit: 50 }) : [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-default)" }}>
          Legal Documents
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Versioned editor for ToS, Privacy Policy, DPA, SLA, and other
          tenant-facing legal documents. Tracks who accepted what version,
          when, and how.
        </p>
      </header>

      {ok && <Banner tone="success">{decodeURIComponent(ok)}</Banner>}
      {error && <Banner tone="danger">{decodeURIComponent(error)}</Banner>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <MiniKpi label="Documents"        value={kpis.totalDocs.toString()} />
        <MiniKpi label="Published"        value={kpis.publishedCount.toString()} tone="success" />
        <MiniKpi label="Drafts"           value={kpis.draftCount.toString()}     tone={kpis.draftCount > 0 ? "warning" : "default"} />
        <MiniKpi label="In review"        value={kpis.reviewCount.toString()}    tone={kpis.reviewCount > 0 ? "warning" : "default"} />
        <MiniKpi label="Acceptances 30d"  value={kpis.acceptances30d.toString()} />
        <MiniKpi label="Re-accepts open"  value={kpis.reacceptsPending.toString()} tone={kpis.reacceptsPending > 0 ? "warning" : "default"} />
        <MiniKpi label="Stale locales"    value={kpis.staleLocales.toString()}     tone={kpis.staleLocales > 0 ? "warning" : "default"} />
      </div>

      <nav className="flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/platform/settings/legal?tab=${t}${selectedSlug ? `&slug=${selectedSlug}` : ""}#${t}`}
            className="rounded-t-md px-3 py-2 text-xs font-medium"
            style={{
              background: tab === t ? "var(--accent-primary)" : "transparent",
              color: tab === t ? "var(--accent-fg)" : "var(--text-muted)",
              border: "1px solid var(--border-subtle)",
              borderBottom: tab === t ? "1px solid var(--accent-primary)" : "1px solid transparent",
            }}
          >
            {TAB_LABEL[t]}
          </Link>
        ))}
      </nav>

      {/* Tab: Documents */}
      {tab === "documents" && (
        <section id="documents" className="space-y-4">
          <div className="overflow-x-auto rounded-xl"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}>
            <table className="w-full text-sm">
              <thead style={{ background: "var(--surface-2)" }}>
                <tr>
                  <Th>Document</Th><Th>Slug</Th><Th>Current version</Th><Th>Published</Th>
                  <Th>Accepted</Th><Th>Pending re-accept</Th><Th>Owner</Th><Th></Th>
                </tr>
              </thead>
              <tbody>
                {documents.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                      No legal documents yet. Use the form below to register the first one.
                    </td>
                  </tr>
                )}
                {documents.map((d) => (
                  <tr key={d.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td className="px-3 py-2 align-top">
                      <Link
                        href={`/platform/settings/legal?tab=versions&slug=${d.slug}#versions`}
                        className="font-medium hover:underline"
                        style={{ color: "var(--text-default)" }}
                      >
                        {KIND_LABEL[d.kind]}
                      </Link>
                      {d.description && (
                        <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{d.description}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top font-mono text-xs">{d.slug}</td>
                    <td className="px-3 py-2 align-top text-xs">v{d.currentVersion}</td>
                    <td className="px-3 py-2 align-top text-xs">{relativeFromNow(d.publishedAt)}</td>
                    <td className="px-3 py-2 align-top text-xs tabular-nums">{d.acceptanceCount.toLocaleString()}</td>
                    <td className="px-3 py-2 align-top text-xs tabular-nums" style={{ color: d.pendingReacceptCount > 0 ? "var(--amber-700)" : "var(--text-muted)" }}>
                      {d.pendingReacceptCount}
                    </td>
                    <td className="px-3 py-2 align-top text-xs">{d.ownerEmail ?? "—"}</td>
                    <td className="px-3 py-2 align-top">
                      <Link href={`/platform/settings/legal?tab=versions&slug=${d.slug}#versions`}
                        className="text-xs" style={{ color: "var(--accent-primary)" }}>
                        Versions →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canWrite && (
            <Card title="Register / edit document">
              <form action={saveDocument} className="space-y-3 px-5 py-5">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Kind" required>
                    <select name="kind" defaultValue={selected?.kind ?? ""} required
                      className="w-full rounded-md px-3 py-2 text-sm outline-none"
                      style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}>
                      <option value="">— pick one —</option>
                      {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                    </select>
                  </Field>
                  <FormField label="Slug" name="slug" required defaultValue={selected?.slug ?? ""} maxLength={120} placeholder="terms-of-service" />
                </div>
                <FormField label="Title" name="title" required defaultValue={selected?.title ?? ""} maxLength={200} />
                <FormField label="Description" name="description" defaultValue={selected?.description ?? ""} maxLength={2000} />
                <FormField label="Owner email" name="ownerEmail" type="email" defaultValue={selected?.ownerEmail ?? ""} maxLength={200} />
                <div className="flex justify-end">
                  <button type="submit" className="rounded-md px-3 py-2 text-xs font-medium"
                    style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
                    Save document
                  </button>
                </div>
              </form>
            </Card>
          )}
        </section>
      )}

      {/* Tab: Versions */}
      {tab === "versions" && (
        <section id="versions" className="space-y-4">
          {!selected ? (
            <Card title="Pick a document">
              <p className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
                Select a document from the <Link href="/platform/settings/legal?tab=documents" className="underline">Documents</Link> tab to see its version history.
              </p>
            </Card>
          ) : (
            <>
              <Card title={`${KIND_LABEL[selected.kind]} — version history`}
                description={`Current: v${selected.currentVersion}. Each row is a snapshot.`}>
                {selected.versions.length === 0 ? (
                  <p className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
                    No versions yet. Save a draft below to start.
                  </p>
                ) : (
                  <ol>
                    {selected.versions.map((v) => {
                      const tone = STATUS_TONE[v.status];
                      return (
                        <li key={v.id} className="grid grid-cols-1 gap-3 px-5 py-3 text-sm md:grid-cols-[80px_1fr_180px_auto]"
                          style={{ borderTop: "1px solid var(--border-subtle)" }}>
                          <div className="font-mono text-xs">v{v.version}</div>
                          <div>
                            <div className="font-medium" style={{ color: "var(--text-default)" }}>
                              {v.changeSummary || "(no change summary)"}
                            </div>
                            <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                              {v.publishedAt ? `Published ${relativeFromNow(v.publishedAt)}` : `Last edited ${relativeFromNow(v.updatedAt)}`}
                              {v.signedOffByEmail && ` · signed off by ${v.signedOffByEmail}`}
                            </div>
                          </div>
                          <span className="rounded-full px-2 py-0.5 text-center text-[10px] font-medium uppercase tracking-wider"
                            style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.fg}` }}
                            title={tone.description}>
                            {tone.label}
                          </span>
                          <div className="flex gap-1.5">
                            {canWrite && v.status === "DRAFT" && (
                              <form action={submitForLegalReview}>
                                <input type="hidden" name="id" value={v.id} />
                                <button type="submit" className="text-xs" style={{ color: "var(--accent-primary)" }}>
                                  Submit
                                </button>
                              </form>
                            )}
                            {canWrite && v.status === "LEGAL_REVIEW" && (
                              <form action={approveLegalReview}>
                                <input type="hidden" name="id" value={v.id} />
                                <button type="submit" className="text-xs" style={{ color: "var(--violet-700)" }}>
                                  Mark reviewed
                                </button>
                              </form>
                            )}
                            {canPublish && v.status === "COUNSEL_SIGN_OFF" && (
                              <form action={signOffAndPublish}>
                                <input type="hidden" name="id" value={v.id} />
                                <button type="submit" className="text-xs" style={{ color: "var(--emerald-700)" }}>
                                  Sign + publish
                                </button>
                              </form>
                            )}
                            {canWrite && (v.status === "LEGAL_REVIEW" || v.status === "COUNSEL_SIGN_OFF") && (
                              <form action={rejectReview}>
                                <input type="hidden" name="id" value={v.id} />
                                <input type="hidden" name="note" value="Returned for edits" />
                                <button type="submit" className="text-xs" style={{ color: "var(--danger-fg)" }}>
                                  Reject
                                </button>
                              </form>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </Card>

              {canWrite && (
                <Card title="Save new draft version" description="Markdown editor — supports {{platform_name}}, {{effective_date}}, {{company_name}}, {{jurisdiction}} placeholders.">
                  <form action={saveDraftVersion} className="space-y-3 px-5 py-5">
                    <input type="hidden" name="documentId" value={selected.id} />
                    <FormField label="Change summary" name="changeSummary" maxLength={2000} placeholder='e.g. "Add data-residency clause for EU customers"' />
                    <label className="block">
                      <span className="mb-1 block text-sm">Body (markdown)</span>
                      <textarea
                        name="body"
                        rows={20}
                        defaultValue={selected.versions[0]?.body ?? ""}
                        required
                        maxLength={200_000}
                        className="w-full rounded-md px-3 py-2 font-mono text-xs outline-none"
                        style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
                      />
                    </label>
                    <div className="flex justify-end">
                      <button type="submit" className="rounded-md px-3 py-2 text-xs font-medium"
                        style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
                        Save as new draft
                      </button>
                    </div>
                  </form>
                </Card>
              )}
            </>
          )}
        </section>
      )}

      {/* Tab: Acceptance */}
      {tab === "acceptance" && (
        <section id="acceptance" className="space-y-4">
          {!canReadAccept ? (
            <Card title="Access required">
              <p className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
                You need <code>legal.acceptance.read</code> to view the acceptance trail.
              </p>
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-xl"
              style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}>
              <table className="w-full text-sm">
                <thead style={{ background: "var(--surface-2)" }}>
                  <tr>
                    <Th>Accepted</Th><Th>User</Th><Th>Tenant</Th>
                    <Th>Document</Th><Th>Version</Th><Th>Method</Th>
                    <Th>IP</Th><Th>UA</Th>
                  </tr>
                </thead>
                <tbody>
                  {recentAccepts.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                        No acceptances recorded yet.
                      </td>
                    </tr>
                  )}
                  {recentAccepts.map((a) => (
                    <tr key={a.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                      <td className="px-3 py-2 align-top text-xs">{relativeFromNow(a.acceptedAt)}</td>
                      <td className="px-3 py-2 align-top text-xs">{a.userEmail ?? "(api)"}</td>
                      <td className="px-3 py-2 align-top text-xs" style={{ color: "var(--text-muted)" }}>{a.tenantId ?? "—"}</td>
                      <td className="px-3 py-2 align-top text-xs">{a.documentId.slice(0, 8)}…</td>
                      <td className="px-3 py-2 align-top text-xs">v{a.version}</td>
                      <td className="px-3 py-2 align-top text-xs">{METHOD_LABEL[a.method]}</td>
                      <td className="px-3 py-2 align-top font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>{a.ipAddress ?? "—"}</td>
                      <td className="px-3 py-2 align-top text-[10px]" style={{ color: "var(--text-faint)" }}>
                        {a.userAgent ? a.userAgent.slice(0, 60) + (a.userAgent.length > 60 ? "…" : "") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Tab: Locales */}
      {tab === "locales" && (
        <section id="locales" className="space-y-4">
          {!selected ? (
            <Card title="Pick a document">
              <p className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
                Open a document from the Documents tab to manage its locales.
              </p>
            </Card>
          ) : (
            <>
              <Card title={`${KIND_LABEL[selected.kind]} — locales`}
                description="Per-locale translations. completenessPct shows how much of the source is translated.">
                {selected.locales.length === 0 ? (
                  <p className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
                    No localized versions yet. Use the form below to add one.
                  </p>
                ) : (
                  <ul>
                    {selected.locales.map((l) => (
                      <li key={l.id} className="grid grid-cols-1 gap-3 px-5 py-3 text-sm md:grid-cols-[80px_1fr_120px_120px]"
                        style={{ borderTop: "1px solid var(--border-subtle)" }}>
                        <span className="font-mono">{l.locale}</span>
                        <span className="truncate" style={{ color: "var(--text-muted)" }}>{l.translatorNote ?? "—"}</span>
                        <span className="text-xs">Synced from v{l.syncedFromVersion}</span>
                        <span className="text-xs" style={{ color: l.completenessPct < 95 ? "var(--amber-700)" : "var(--emerald-700)" }}>
                          {l.completenessPct}% complete
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              {canWrite && (
                <Card title="Add / update locale translation">
                  <form action={saveLocaleTranslation} className="space-y-3 px-5 py-5">
                    <input type="hidden" name="documentId" value={selected.id} />
                    <div className="grid gap-3 md:grid-cols-4">
                      <FormField label="Locale (BCP 47)" name="locale" required maxLength={20} placeholder="es-MX" />
                      <FormField label="Synced from version" name="syncedFromVersion" type="number" defaultValue={selected.currentVersion.toString()} required />
                      <FormField label="Completeness %" name="completenessPct" type="number" defaultValue="100" required />
                      <FormField label="Source" name="source" maxLength={60} placeholder="In-house / Smartling / …" />
                    </div>
                    <label className="block">
                      <span className="mb-1 block text-sm">Translated body (markdown)</span>
                      <textarea name="body" rows={12} required maxLength={200_000}
                        className="w-full rounded-md px-3 py-2 font-mono text-xs outline-none"
                        style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }} />
                    </label>
                    <FormField label="Translator note" name="translatorNote" maxLength={2000} />
                    <div className="flex justify-end">
                      <button type="submit" className="rounded-md px-3 py-2 text-xs font-medium"
                        style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
                        Save translation
                      </button>
                    </div>
                  </form>
                </Card>
              )}
            </>
          )}
        </section>
      )}

      {/* Tab: Mandatory re-acceptance */}
      {tab === "reaccept" && (
        <section id="reaccept" className="space-y-4">
          <Card title="Active re-acceptance campaigns" description="Trigger users to accept the latest version of a document before they can keep using the app.">
            {reaccepts.length === 0 ? (
              <p className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
                No active re-acceptance campaigns.
              </p>
            ) : (
              <ul>
                {reaccepts.map((r) => (
                  <li key={r.id} className="grid grid-cols-1 gap-3 px-5 py-3 text-sm md:grid-cols-[1fr_140px_140px_auto]"
                    style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <div>
                      <div className="font-medium">{r.bannerCopy.slice(0, 100)}{r.bannerCopy.length > 100 ? "…" : ""}</div>
                      <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                        Requires v{r.requiredVersion} · grace {r.gracePeriodDays}d{r.enforceBlock ? " · blocks app" : ""}
                      </div>
                    </div>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {r.tenantPlanScope.length > 0 ? `Plans: ${r.tenantPlanScope.join(", ")}` : "All tenants"}
                    </span>
                    <span className="text-xs">{relativeFromNow(r.activatedAt)}</span>
                    {canPublish && (
                      <form action={closeReacceptance}>
                        <input type="hidden" name="id" value={r.id} />
                        <button type="submit" className="text-xs" style={{ color: "var(--danger-fg)" }}>Close campaign</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {canPublish && selected && (
            <Card title="Activate re-acceptance for the selected document">
              <form action={createReacceptance} className="space-y-3 px-5 py-5">
                <input type="hidden" name="documentId" value={selected.id} />
                <div className="grid gap-3 md:grid-cols-3">
                  <FormField label="Required version" name="requiredVersion" type="number" defaultValue={selected.currentVersion.toString()} required />
                  <FormField label="Grace period (days)" name="gracePeriodDays" type="number" defaultValue="7" required />
                  <label className="flex items-end gap-2 text-sm">
                    <input type="checkbox" name="enforceBlock" className="h-4 w-4" />
                    <span>Block app after grace expires</span>
                  </label>
                </div>
                <FormField label="Tenant plan scope (comma-separated, blank = all)" name="tenantPlanScope" maxLength={200} placeholder="STARTER, GROWTH" />
                <label className="block">
                  <span className="mb-1 block text-sm">Banner copy</span>
                  <textarea name="bannerCopy" rows={4} required maxLength={2000}
                    className="w-full rounded-md px-3 py-2 text-sm outline-none"
                    style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
                    defaultValue={`We've updated our ${KIND_LABEL[selected.kind]}. Please review and accept by {{deadline}} to keep using ${"{{platform_name}}"}.`} />
                </label>
                <div className="flex justify-end">
                  <button type="submit" className="rounded-md px-3 py-2 text-xs font-medium"
                    style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
                    Activate campaign
                  </button>
                </div>
              </form>
            </Card>
          )}
        </section>
      )}

      {/* Tab: Settings */}
      {tab === "settings" && (
        <section id="settings" className="space-y-4">
          <Card title="Jurisdiction, governing law, and effective dates">
            <form action={saveLegalSettings} className="space-y-4 px-5 py-5">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Default jurisdiction" name="defaultJurisdiction" required defaultValue={settings.defaultJurisdiction} maxLength={120} />
                <FormField label="Governing law" name="governingLaw" required defaultValue={settings.governingLaw} maxLength={120} />
                <FormField label="Arbitration provider" name="arbitrationProvider" defaultValue={settings.arbitrationProvider ?? ""} maxLength={120} placeholder="AAA / JAMS / ICDR" />
                <FormField label="Venue" name="venue" defaultValue={settings.venue ?? ""} maxLength={200} placeholder="San Francisco County, California" />
                <FormField label="Effective date offset (days)" name="effectiveDateOffsetDays" type="number" required defaultValue={settings.effectiveDateOffsetDays.toString()} hint="When publishing, default 'effective' date this many days into the future." />
              </div>
              <label className="block">
                <span className="mb-1 block text-sm">Cookie banner copy</span>
                <textarea name="cookieBannerCopy" rows={4} defaultValue={settings.cookieBannerCopy ?? ""} maxLength={4000}
                  className="w-full rounded-md px-3 py-2 text-sm outline-none"
                  style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }} />
              </label>
              <FormField label="Notes" name="notes" defaultValue={settings.notes ?? ""} maxLength={2000} />
              <div className="flex justify-end">
                <button type="submit" className="rounded-md px-3 py-2 text-xs font-medium"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
                  Save settings
                </button>
              </div>
            </form>
          </Card>
        </section>
      )}
    </div>
  );
}

/* ── UI helpers ───────────────────────────────────────────── */

function Card({ title, description, children }: { title?: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl"
      style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}>
      {title && (
        <header className="px-5 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{description}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

function MiniKpi({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "success" | "warning" | "danger" }) {
  const palette =
    tone === "success" ? { bg: "var(--emerald-100)", fg: "var(--emerald-700)" } :
    tone === "warning" ? { bg: "var(--amber-100)",   fg: "var(--amber-700)"   } :
    tone === "danger"  ? { bg: "var(--rose-100)",    fg: "var(--rose-700)"    } :
                          { bg: "var(--surface-1)",   fg: "var(--text-default)" };
  return (
    <div className="rounded-md px-3 py-2.5"
      style={{ background: palette.bg, border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums" style={{ color: palette.fg }}>{value}</div>
    </div>
  );
}

function Th({ children, className = "", ...rest }: React.ThHTMLAttributes<HTMLTableCellElement> & { className?: string }) {
  return (
    <th className={`px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide ${className}`}
      style={{ color: "var(--text-muted)" }} {...rest}>
      {children}
    </th>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm">{label}{required && <span style={{ color: "var(--danger-fg)" }}> *</span>}</span>
      {children}
    </label>
  );
}

function FormField({ label, name, type = "text", defaultValue, required, placeholder, maxLength, hint }: { label: string; name: string; type?: string; defaultValue?: string; required?: boolean; placeholder?: string; maxLength?: number; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm">{label}{required && <span style={{ color: "var(--danger-fg)" }}> *</span>}</span>
      <input type={type} name={name} defaultValue={defaultValue} required={required} placeholder={placeholder} maxLength={maxLength}
        className="w-full rounded-md px-3 py-2 text-sm outline-none"
        style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }} />
      {hint && <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>{hint}</span>}
    </label>
  );
}

function Banner({ tone, children }: { tone: "success" | "danger"; children: React.ReactNode }) {
  const palette = tone === "success"
    ? { bg: "var(--emerald-100)", fg: "var(--emerald-700)", border: "var(--emerald-300)" }
    : { bg: "var(--rose-100)", fg: "var(--rose-700)", border: "var(--rose-300)" };
  return (
    <div className="rounded-md px-4 py-3 text-sm"
      style={{ background: palette.bg, color: palette.fg, border: `1px solid ${palette.border}` }}>
      {children}
    </div>
  );
}
