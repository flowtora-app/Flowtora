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
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────── */

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
