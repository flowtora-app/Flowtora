import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { Card, CardHeader } from "@/components/Card";
import {
  getRegistration,
  loadBrand,
  renderTemplate,
} from "@/lib/notifications";
import type { TemplateContent, TokenSchema, TokenValues } from "@/lib/notifications/types";
import {
  saveTemplate,
  publishTemplate,
  unpublishTemplate,
  resetTemplateToDefault,
  initializeTemplateFromDefault,
  testSendTemplate,
} from "@/app/actions/notifications-admin";
import {
  saveTemplateMetadata,
  submitForReview,
  approveTemplate,
  rejectTemplate,
  promoteToLive,
  saveVariant,
  deleteVariant,
  provisionLocale,
} from "@/app/actions/platform-notifications-catalog";
import {
  APPROVAL_TONE,
  TRIGGER_LABEL,
  TRIGGER_ORDER,
  formatRate,
  formatThousands,
  relativeFromNow,
} from "@/server/platform/notifications-catalog";
import type {
  NotificationApprovalState,
} from "@prisma/client";

// /platform/notifications/[kind] — template editor.
//
// Left column: editable form (subject, headline, body, CTA, footer,
// enabled toggle). Saves go to live fields; publishing snapshots a
// NotificationTemplateVersion and flips status=PUBLISHED so the
// dispatcher starts serving DB content.
//
// Right column: an iframe-preview of the rendered email with sample
// tokens from the registry, a test-send form, and a tokens-available
// reference. The preview is srcDoc'd — the HTML is computed on this
// request so every save is visually verifiable on reload without a
// separate preview route.

export const dynamic = "force-dynamic";

type SP = { ok?: string; error?: string };

export default async function NotificationEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<SP>;
}) {
  const { kind: rawKind } = await params;
  const kind = decodeURIComponent(rawKind);
  const sp = await searchParams;

  const ctx = await requirePlatformStaff();
  const reg = getRegistration(kind);
  if (!reg) notFound();

  const row = await db.notificationTemplate.findUnique({
    where: { kind_channel_locale: { kind, channel: "EMAIL", locale: "en" } },
  });

  const versions = row
    ? await db.notificationTemplateVersion.findMany({
        where: { templateId: row.id },
        orderBy: { version: "desc" },
        take: 10,
      })
    : [];

  // Page 68 — variants, review timeline, locale tabs, 30d metrics.
  const variants = row
    ? await db.notificationTemplateVariant.findMany({
        where: { templateId: row.id },
        orderBy: { label: "asc" },
      })
    : [];
  const reviews = row
    ? await db.notificationTemplateReview.findMany({
        where: { templateId: row.id },
        orderBy: { createdAt: "desc" },
        take: 25,
      })
    : [];
  const localeRows = await db.notificationTemplate.findMany({
    where: { kind, channel: "EMAIL" },
    orderBy: { locale: "asc" },
    select: {
      id: true, locale: true, status: true, approvalState: true,
      subject: true, updatedAt: true,
    },
  });
  const metricRows = row
    ? await db.notificationTemplateMetric.findMany({
        where: { templateId: row.id, day: { gte: new Date(Date.now() - 30 * 86_400_000) } },
        orderBy: { day: "asc" },
      })
    : [];
  const totals = metricRows.reduce(
    (acc, m) => ({
      sent:    acc.sent    + m.sent,
      opened:  acc.opened  + m.opened,
      clicked: acc.clicked + m.clicked,
      bounced: acc.bounced + m.bounced,
    }),
    { sent: 0, opened: 0, clicked: 0, bounced: 0 },
  );
  const approvalState: NotificationApprovalState = row?.approvalState ?? "DRAFT";

  // Effective content for the form + preview. DB row wins; otherwise
  // the compile-time default. An admin staring at "Content" should
  // always see what the next test-send or live dispatch would use.
  const defaultContent = reg.defaultContent.EMAIL;
  const content: TemplateContent = row
    ? {
        subject: row.subject,
        preheader: row.preheader,
        headline: row.headline,
        subheading: row.subheading,
        body: row.body,
        ctaLabel: row.ctaLabel,
        ctaUrlToken: row.ctaUrlToken,
        footerNote: row.footerNote,
      }
    : (defaultContent as TemplateContent);

  const status: "DEFAULT" | "DRAFT" | "PUBLISHED" | "DISABLED" = row
    ? row.status
    : "DEFAULT";
  const enabled = row?.enabled ?? true;
  const canWrite = ctx.canWrite;

  const brand = await loadBrand();
  const sampleTokens = buildSampleTokens(reg.tokens, brand);
  const rendered = renderTemplate({ content, tokens: sampleTokens, brand });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/platform/notifications"
            className="text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            ← Notifications
          </Link>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold">
            {reg.label}
            <StatusPill status={status} />
            {reg.isCritical && <CriticalBadge />}
            {!enabled && !reg.isCritical && <DisabledBadge />}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            <span className="font-mono text-xs">{reg.kind}</span>
            {" · "}
            {reg.description}
          </p>
        </div>

        {canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            {!row && (
              <form action={initializeTemplateFromDefault.bind(null, reg.kind)}>
                <button
                  type="submit"
                  className="rounded-md px-3 py-2 text-xs font-medium"
                  style={{
                    background: "var(--accent-primary)",
                    color: "var(--accent-fg)",
                  }}
                >
                  Copy default to draft
                </button>
              </form>
            )}
            {row && status === "PUBLISHED" && (
              <form action={unpublishTemplate.bind(null, reg.kind)}>
                <button
                  type="submit"
                  className="rounded-md px-3 py-2 text-xs font-medium"
                  style={{
                    background: "var(--surface-2)",
                    color: "var(--text-default)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  Unpublish
                </button>
              </form>
            )}
            {row && (
              <form action={resetTemplateToDefault.bind(null, reg.kind)}>
                <button
                  type="submit"
                  className="rounded-md px-3 py-2 text-xs font-medium"
                  style={{
                    background: "var(--danger-surface)",
                    color: "var(--danger-fg)",
                    border: "1px solid var(--danger-border)",
                  }}
                >
                  Reset to default
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {sp.ok && <Banner tone="ok">{sp.ok}</Banner>}
      {sp.error && <Banner tone="error">{sp.error}</Banner>}

      {reg.isCritical && (
        <div
          className="rounded-md px-4 py-3 text-xs"
          style={{
            background: "var(--accent-surface)",
            color: "var(--accent-primary)",
            border: "1px solid var(--accent-primary)",
          }}
        >
          <strong>Critical kind.</strong> Copy is editable, but the on/off toggle is locked — disabling an auth
          or security email would break account recovery. If you need to suppress this, remove the call site
          from code.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        {/* ── Left: editor ────────────────────────────────────────── */}
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Content"
              description="Subject, headline, body, and call-to-action. Use {{token_name}} to interpolate values — the list on the right shows every token this kind provides."
            />
            <form
              action={saveTemplate.bind(null, reg.kind)}
              className="space-y-5 px-5 py-5"
            >
              <FormField
                label="Subject"
                name="subject"
                defaultValue={content.subject}
                required
                maxLength={180}
                hint="Appears in the inbox. Short and specific performs best."
                disabled={!canWrite}
              />
              <FormField
                label="Preheader"
                name="preheader"
                defaultValue={content.preheader ?? ""}
                maxLength={200}
                hint="Hidden preview text shown by most clients next to the subject. Keep under ~90 chars for mobile."
                disabled={!canWrite}
              />
              <FormField
                label="Headline"
                name="headline"
                defaultValue={content.headline}
                required
                maxLength={160}
                hint="Largest text inside the email body. The 'one-liner' the user sees after opening."
                disabled={!canWrite}
              />
              <FormField
                label="Subheading"
                name="subheading"
                defaultValue={content.subheading ?? ""}
                maxLength={240}
                hint="Optional. Reinforces the headline with context."
                disabled={!canWrite}
              />
              <TextArea
                label="Body"
                name="body"
                defaultValue={content.body}
                rows={8}
                required
                maxLength={8000}
                hint="Markdown-lite: blank lines make paragraphs, **bold**, *italic*, `code`, [text](https://…). HTML is escaped."
                disabled={!canWrite}
              />
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  label="Button label"
                  name="ctaLabel"
                  defaultValue={content.ctaLabel ?? ""}
                  maxLength={60}
                  hint={'Leave blank to omit the CTA button.'}
                  disabled={!canWrite}
                />
                <FormField
                  label="Button URL / token"
                  name="ctaUrlToken"
                  defaultValue={content.ctaUrlToken ?? ""}
                  maxLength={200}
                  hint={'e.g. {{verify_url}} or https://example.com/…'}
                  disabled={!canWrite}
                />
              </div>
              <TextArea
                label="Footer note"
                name="footerNote"
                defaultValue={content.footerNote ?? ""}
                rows={3}
                maxLength={2000}
                hint="Optional fine-print below the body — e.g. 'If you didn't request this, ignore this email.'"
                disabled={!canWrite}
              />

              <div
                className="flex items-center justify-between gap-4 pt-4"
                style={{ borderTop: "1px solid var(--border-subtle)" }}
              >
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={enabled}
                    disabled={!canWrite || reg.isCritical}
                    className="h-4 w-4"
                  />
                  <span style={{ color: "var(--text-default)" }}>
                    Enabled
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {reg.isCritical
                      ? "(locked — critical kind)"
                      : "Uncheck to suppress this kind globally."}
                  </span>
                </label>

                {canWrite && (
                  <button
                    type="submit"
                    className="rounded-md px-4 py-2 text-sm font-medium"
                    style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
                  >
                    Save changes
                  </button>
                )}
              </div>
            </form>
          </Card>

          {row && canWrite && (
            <Card>
              <CardHeader
                title="Publish"
                description="Push the current draft live. Previous versions are archived in the history below so you can read what changed between releases."
              />
              <div className="flex items-center justify-between gap-4 px-5 py-5">
                <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                  {status === "PUBLISHED"
                    ? `Published ${row.publishedAt ? formatRel(row.publishedAt) : "recently"} — saving new edits requires republishing.`
                    : status === "DRAFT"
                    ? "This template is currently using the built-in default. Publish to switch live dispatches to the DB copy."
                    : "Disabled — publishing will re-enable."}
                </div>
                <form action={publishTemplate.bind(null, reg.kind)}>
                  <button
                    type="submit"
                    className="rounded-md px-4 py-2 text-sm font-medium"
                    style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
                  >
                    {status === "PUBLISHED" ? "Publish new version" : "Publish"}
                  </button>
                </form>
              </div>
            </Card>
          )}

          {versions.length > 0 && (
            <Card>
              <CardHeader title="Version history" description="Snapshots created each time this template was published." />
              <div>
                {versions.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between px-5 py-3 text-sm"
                    style={{ borderTop: "1px solid var(--border-subtle)" }}
                  >
                    <div>
                      <div style={{ color: "var(--text-default)" }}>
                        <span className="font-mono text-xs">v{v.version}</span>
                        {" · "}
                        <span>{v.subject}</span>
                      </div>
                      <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                        {formatRel(v.publishedAt)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* ── Right: preview + test send + tokens ─────────────────── */}
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Preview"
              description="Rendered with the sample token values on the right and the current brand."
            />
            <div className="p-5">
              <iframe
                title="Email preview"
                srcDoc={rendered.html}
                sandbox=""
                style={{
                  width: "100%",
                  height: 520,
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 8,
                  background: "#ffffff",
                }}
              />
              <div className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
                <span style={{ color: "var(--text-default)" }}>Subject:</span> {rendered.subject}
              </div>
            </div>
          </Card>

          {canWrite && (
            <Card>
              <CardHeader
                title="Test send"
                description="Fires the current (unpublished) content through the email provider with the sample token values. Subject is prefixed [TEST]."
              />
              <form action={testSendTemplate.bind(null, reg.kind)} className="space-y-3 px-5 py-5">
                <FormField
                  label="Recipient"
                  name="to"
                  type="email"
                  defaultValue={ctx.email}
                  required
                  hint="Usually your own address. Goes through Resend, so expect a normal inbox delivery."
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="rounded-md px-3 py-2 text-xs font-medium"
                    style={{
                      background: "var(--surface-2)",
                      color: "var(--text-default)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    Send test
                  </button>
                </div>
              </form>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Tokens available"
              description="Use inside any field as {{name}}. URL tokens can also be written as {{url:name}} to force URL-safe escaping."
            />
            <div>
              {Object.entries(reg.tokens).map(([name, spec]) => (
                <div
                  key={name}
                  className="px-5 py-3 text-sm"
                  style={{ borderTop: "1px solid var(--border-subtle)" }}
                >
                  <div className="flex items-center gap-2">
                    <code
                      className="rounded px-1.5 py-0.5 font-mono text-[11px]"
                      style={{
                        background: "var(--surface-0)",
                        border: "1px solid var(--border-subtle)",
                        color: "var(--text-default)",
                      }}
                    >
                      {`{{${name}}}`}
                    </code>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {spec.type}
                      {spec.required ? " · required" : ""}
                    </span>
                  </div>
                  {spec.description && (
                    <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                      {spec.description}
                    </div>
                  )}
                  <div className="mt-1 text-xs font-mono" style={{ color: "var(--text-faint)" }}>
                    sample: {spec.sample || "—"}
                  </div>
                </div>
              ))}
              <div
                className="px-5 py-3 text-xs"
                style={{
                  borderTop: "1px solid var(--border-subtle)",
                  color: "var(--text-muted)",
                }}
              >
                <strong style={{ color: "var(--text-default)" }}>Global tokens</strong> (always available):
                {" "}
                <code className="font-mono text-[11px]">{`{{product_name}}`}</code>
                {" · "}
                <code className="font-mono text-[11px]">{`{{support_email}}`}</code>
                {" · "}
                <code className="font-mono text-[11px]">{`{{current_year}}`}</code>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* ── Page 68 — Approval workflow / variants / metadata / locales / reviews ── */}
      {row && (
        <div className="space-y-6">
          {/* Approval workflow */}
          <Card>
            <CardHeader
              title="Approval workflow"
              description="Draft → In review → Approved → Live. Reviewer sign-off is required before high-volume templates can go live."
            />
            <div className="space-y-4 px-5 py-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                  Current state
                </span>
                <ApprovalPill state={approvalState} />
                {row.submittedForReviewAt && (
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Submitted {relativeFromNow(row.submittedForReviewAt)}
                  </span>
                )}
                {row.reviewedAt && (
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Reviewed {relativeFromNow(row.reviewedAt)} by {row.reviewerEmail ?? "—"}
                  </span>
                )}
              </div>

              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {APPROVAL_TONE[approvalState].description}
              </p>

              <div className="flex flex-wrap items-end gap-3 pt-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                {canWrite && approvalState === "DRAFT" && (
                  <form action={submitForReview} className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="templateId" value={row.id} />
                    <FormField
                      label="Submission note"
                      name="note"
                      placeholder="Summarize what changed"
                      maxLength={2000}
                    />
                    <button
                      type="submit"
                      className="rounded-md px-3 py-2 text-xs font-medium"
                      style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
                    >
                      Submit for review
                    </button>
                  </form>
                )}
                {ctx.can("notifications.review") && approvalState === "IN_REVIEW" && (
                  <>
                    <form action={approveTemplate} className="flex flex-wrap items-end gap-3">
                      <input type="hidden" name="templateId" value={row.id} />
                      <FormField label="Approval note" name="note" placeholder="Optional" maxLength={2000} />
                      <button
                        type="submit"
                        className="rounded-md px-3 py-2 text-xs font-medium"
                        style={{ background: "var(--success-fg)", color: "var(--accent-fg)" }}
                      >
                        Approve
                      </button>
                    </form>
                    <form action={rejectTemplate} className="flex flex-wrap items-end gap-3">
                      <input type="hidden" name="templateId" value={row.id} />
                      <FormField label="Rejection reason" name="note" placeholder="Required" maxLength={2000} required />
                      <button
                        type="submit"
                        className="rounded-md px-3 py-2 text-xs font-medium"
                        style={{ background: "var(--danger-surface)", color: "var(--danger-fg)", border: "1px solid var(--danger-fg)" }}
                      >
                        Reject — send back to draft
                      </button>
                    </form>
                  </>
                )}
                {ctx.can("notifications.review") && approvalState === "APPROVED" && (
                  <form action={promoteToLive} className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="templateId" value={row.id} />
                    <FormField label="Release note" name="note" placeholder="What this rollout fixes" maxLength={2000} />
                    <button
                      type="submit"
                      className="rounded-md px-3 py-2 text-xs font-medium"
                      style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
                    >
                      Promote to live
                    </button>
                  </form>
                )}
                {approvalState === "LIVE" && (
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Currently live — save changes to start a new draft cycle.
                  </span>
                )}
              </div>
            </div>
          </Card>

          {/* Metadata */}
          {canWrite && (
            <Card>
              <CardHeader
                title="Metadata"
                description="Trigger taxonomy, owner, tags, and per-template envelope overrides. Reply-To and From-Name fall back to brand settings when blank."
              />
              <form action={saveTemplateMetadata} className="space-y-4 px-5 py-5">
                <input type="hidden" name="templateId" value={row.id} />
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-sm">Trigger</span>
                    <select
                      name="trigger"
                      defaultValue={row.trigger ?? ""}
                      className="w-full rounded-md px-3 py-2 text-sm outline-none"
                      style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
                    >
                      <option value="">—</option>
                      {TRIGGER_ORDER.map((t) => (
                        <option key={t} value={t}>{TRIGGER_LABEL[t]}</option>
                      ))}
                    </select>
                    <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>
                      Buckets this template into the sidebar tree.
                    </span>
                  </label>
                  <FormField
                    label="Owner email"
                    name="ownerEmail"
                    type="email"
                    defaultValue={row.ownerEmail ?? ""}
                    maxLength={120}
                    hint="Lifecycle manager responsible for this template."
                  />
                </div>
                <FormField
                  label="Tags (comma-separated)"
                  name="tags"
                  defaultValue={row.tags.join(", ")}
                  maxLength={500}
                  hint='e.g. "high-volume, trial, weekly". Used to filter the catalog.'
                />
                <div className="grid gap-4 md:grid-cols-3">
                  <FormField label="From name"  name="fromName"  defaultValue={row.fromName  ?? ""} maxLength={120} hint="Display name on outbound. Blank = brand default." />
                  <FormField label="From email" name="fromEmail" defaultValue={row.fromEmail ?? ""} maxLength={200} hint="DKIM-signed domain only. Blank = brand default." />
                  <FormField label="Reply-to"   name="replyTo"   defaultValue={row.replyTo   ?? ""} maxLength={200} hint="Where customer replies go. Blank = brand default." />
                </div>
                <div className="flex justify-end pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <button
                    type="submit"
                    className="rounded-md px-3 py-2 text-xs font-medium"
                    style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
                  >
                    Save metadata
                  </button>
                </div>
              </form>
            </Card>
          )}

          {/* 30-day metrics */}
          <Card>
            <CardHeader
              title="30-day metrics"
              description={`Rolled up from NotificationTemplateMetric. Last 30 days of send / delivery / engagement.`}
            />
            <div className="grid grid-cols-2 gap-4 px-5 py-5 md:grid-cols-4">
              <MetricTile label="Sent"      value={formatThousands(totals.sent)}      hint="Total messages enqueued" />
              <MetricTile label="Opened"    value={formatThousands(totals.opened)}    hint={`${formatRate(totals.sent > 0 ? totals.opened / totals.sent : 0)} open rate`} />
              <MetricTile label="Clicked"   value={formatThousands(totals.clicked)}   hint={`${formatRate(totals.sent > 0 ? totals.clicked / totals.sent : 0)} CTR`} />
              <MetricTile label="Bounced"   value={formatThousands(totals.bounced)}   hint={totals.sent > 0 ? `${formatRate(totals.bounced / totals.sent)} bounce rate` : "—"} tone={totals.bounced > 0 ? "danger" : "default"} />
            </div>
            {metricRows.length > 0 && (
              <div className="px-5 pb-5">
                <Sparkline points={metricRows.map((m) => m.sent)} label="Daily send volume" />
              </div>
            )}
          </Card>

          {/* A/B variants */}
          {canWrite && (
            <Card>
              <CardHeader
                title="A/B variants"
                description="The template's own content row is implicit variant A. Add B/C variants to test alternates — dispatcher samples by weight at send time."
              />
              <div id="variants" className="px-5 py-5">
                {variants.length === 0 ? (
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    No experiment variants. Add one below to start an A/B test.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {variants.map((v) => (
                      <li
                        key={v.id}
                        className="grid grid-cols-1 gap-3 rounded-md px-3 py-3 md:grid-cols-[100px_1fr_120px_100px_auto]"
                        style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}
                      >
                        <div className="text-sm font-semibold">{v.label}</div>
                        <div className="min-w-0">
                          <div className="truncate text-sm">{v.subject}</div>
                          <div className="truncate text-xs" style={{ color: "var(--text-muted)" }}>{v.headline}</div>
                        </div>
                        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                          Weight {v.weight}%
                          {!v.active && <span className="ml-2 text-[10px] uppercase">paused</span>}
                        </div>
                        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {formatThousands(v.sentCount)} sent
                          {v.sentCount > 0 && (
                            <> · {formatRate(v.openCount / v.sentCount)} open</>
                          )}
                        </div>
                        <form action={deleteVariant}>
                          <input type="hidden" name="id" value={v.id} />
                          <button
                            type="submit"
                            className="text-xs"
                            style={{ color: "var(--danger-fg)" }}
                          >
                            Delete
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <form action={saveVariant} className="space-y-3 px-5 pb-5">
                <input type="hidden" name="templateId" value={row.id} />
                <div className="grid gap-3 md:grid-cols-3">
                  <FormField label="Label" name="label" required maxLength={40} placeholder="B" hint="Short ID, unique within this template." />
                  <FormField label="Weight (0–100)" name="weight" type="number" defaultValue="50" required hint="Sampling chance vs other variants." />
                  <label className="flex items-end gap-2 text-sm">
                    <input type="checkbox" name="active" defaultChecked className="h-4 w-4" />
                    <span>Active</span>
                  </label>
                </div>
                <FormField label="Subject" name="subject" required maxLength={300} />
                <FormField label="Preheader" name="preheader" maxLength={300} />
                <FormField label="Headline" name="headline" required maxLength={300} />
                <FormField label="Subheading" name="subheading" maxLength={300} />
                <TextArea label="Body" name="body" rows={5} required maxLength={8000} />
                <div className="grid gap-3 md:grid-cols-2">
                  <FormField label="CTA label" name="ctaLabel" maxLength={100} />
                  <FormField label="CTA URL / token" name="ctaUrlToken" maxLength={200} />
                </div>
                <FormField label="Footer note" name="footerNote" maxLength={500} />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="rounded-md px-3 py-2 text-xs font-medium"
                    style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
                  >
                    Save variant
                  </button>
                </div>
              </form>
            </Card>
          )}

          {/* Locales */}
          <Card>
            <CardHeader
              title="Locales"
              description="Per-locale copies of this template. Adding a locale clones the English content as the starting point — translator edits it from this list."
            />
            <div className="px-5 py-5">
              {localeRows.length === 0 ? (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>No localized rows yet.</p>
              ) : (
                <ul className="space-y-2">
                  {localeRows.map((l) => (
                    <li
                      key={l.id}
                      className="grid grid-cols-[60px_1fr_120px_auto] items-center gap-3 rounded-md px-3 py-2"
                      style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}
                    >
                      <span className="font-mono text-xs">{l.locale}</span>
                      <span className="truncate text-sm">{l.subject}</span>
                      <ApprovalPill state={l.approvalState} />
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {relativeFromNow(l.updatedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {canWrite && (
                <form action={provisionLocale} className="mt-4 flex items-end gap-3">
                  <input type="hidden" name="templateId" value={row.id} />
                  <FormField label="Add locale (BCP 47)" name="locale" placeholder="es-MX" required maxLength={20} />
                  <button
                    type="submit"
                    className="rounded-md px-3 py-2 text-xs font-medium"
                    style={{ background: "var(--surface-1)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}
                  >
                    Add locale
                  </button>
                </form>
              )}
            </div>
          </Card>

          {/* Review timeline */}
          {reviews.length > 0 && (
            <Card>
              <CardHeader title="Review timeline" description="Approval state transitions and reviewer comments." />
              <ol className="px-5 py-5">
                {reviews.map((r, idx) => (
                  <li
                    key={r.id}
                    className="grid grid-cols-[140px_1fr] gap-4 py-3 text-sm"
                    style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
                  >
                    <div>
                      <div className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                        {r.fromState} → {r.toState}
                      </div>
                      <div className="mt-1 text-xs" style={{ color: "var(--text-faint)" }}>
                        {relativeFromNow(r.createdAt)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs" style={{ color: "var(--text-default)" }}>{r.actorEmail}</div>
                      {r.note && (
                        <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{r.note}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────── */

function ApprovalPill({ state }: { state: NotificationApprovalState }) {
  const t = APPROVAL_TONE[state];
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
      style={{ background: t.bg, color: t.fg, border: `1px solid ${t.fg}` }}
    >
      {t.label}
    </span>
  );
}

function MetricTile({
  label, value, hint, tone = "default",
}: { label: string; value: string; hint?: string; tone?: "default" | "danger" }) {
  const fg = tone === "danger" ? "var(--danger-fg)" : "var(--text-default)";
  return (
    <div
      className="rounded-md px-3 py-3"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}
    >
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>{label}</div>
      <div className="mt-1 text-lg font-semibold" style={{ color: fg }}>{value}</div>
      {hint && <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{hint}</div>}
    </div>
  );
}

function Sparkline({ points, label }: { points: number[]; label: string }) {
  if (points.length === 0) return null;
  const max = Math.max(1, ...points);
  const w = 600;
  const h = 60;
  const step = w / Math.max(1, points.length - 1);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${i * step} ${h - (p / max) * h}`)
    .join(" ");
  return (
    <div>
      <div className="mb-2 text-[10px] uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
        {label}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: 60 }}>
        <path d={path} fill="none" stroke="var(--accent-primary)" strokeWidth={1.5} />
      </svg>
    </div>
  );
}

function buildSampleTokens(
  schema: TokenSchema,
  brand: Awaited<ReturnType<typeof loadBrand>>,
): TokenValues {
  const out: TokenValues = {
    product_name:  brand.productName,
    support_email: brand.supportEmail ?? "",
    current_year:  new Date().getFullYear(),
  };
  for (const [key, spec] of Object.entries(schema)) {
    if (spec.sample !== undefined && spec.sample !== "") {
      out[key] = spec.sample;
      continue;
    }
    if (spec.type === "url") out[key] = "https://example.com/";
    else if (spec.type === "number") out[key] = 42;
    else out[key] = `{{${key}}}`;
  }
  return out;
}

function FormField({
  label,
  hint,
  name,
  defaultValue,
  type = "text",
  required,
  placeholder,
  maxLength,
  disabled,
}: {
  label: string;
  hint?: string;
  name: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm">{label}</span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        required={required}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        className="w-full rounded-md px-3 py-2 text-sm outline-none"
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          color: "var(--text)",
        }}
      />
      {hint && (
        <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}

function TextArea({
  label,
  hint,
  name,
  defaultValue,
  rows = 4,
  required,
  maxLength,
  disabled,
}: {
  label: string;
  hint?: string;
  name: string;
  defaultValue?: string;
  rows?: number;
  required?: boolean;
  maxLength?: number;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm">{label}</span>
      <textarea
        name={name}
        defaultValue={defaultValue}
        rows={rows}
        required={required}
        maxLength={maxLength}
        disabled={disabled}
        className="w-full rounded-md px-3 py-2 text-sm outline-none font-mono"
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          color: "var(--text)",
        }}
      />
      {hint && (
        <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}

function Banner({ tone, children }: { tone: "ok" | "error"; children: React.ReactNode }) {
  const style: React.CSSProperties =
    tone === "ok"
      ? {
          background: "var(--success-surface)",
          color: "var(--success-fg)",
          border: "1px solid var(--success-fg)",
        }
      : {
          background: "var(--danger-surface)",
          color: "var(--danger-fg)",
          border: "1px solid var(--danger-fg)",
        };
  return (
    <div className="rounded-md px-4 py-3 text-sm" style={style}>
      {children}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const style: React.CSSProperties =
    status === "PUBLISHED"
      ? {
          background: "var(--success-surface)",
          color: "var(--success-fg)",
          border: "1px solid var(--success-fg)",
        }
      : status === "DRAFT"
      ? {
          background: "var(--warning-surface)",
          color: "var(--warning-fg)",
          border: "1px solid var(--warning-fg)",
        }
      : {
          background: "var(--surface-2)",
          color: "var(--text-muted)",
          border: "1px solid var(--border-subtle)",
        };
  const label =
    status === "PUBLISHED" ? "published"
    : status === "DRAFT"   ? "draft"
    : status === "DISABLED"? "disabled"
    : "default";
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
      style={style}
    >
      {label}
    </span>
  );
}

function CriticalBadge() {
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider"
      style={{
        background: "var(--accent-surface)",
        color: "var(--accent-primary)",
        border: "1px solid var(--accent-primary)",
      }}
    >
      critical
    </span>
  );
}

function DisabledBadge() {
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider"
      style={{
        background: "var(--danger-surface)",
        color: "var(--danger-fg)",
        border: "1px solid var(--danger-fg)",
      }}
    >
      off
    </span>
  );
}

function formatRel(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}
