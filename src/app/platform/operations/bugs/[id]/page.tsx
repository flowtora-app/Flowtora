// Page 37 — Bug detail page.
//
// 5 tabs: Details · Linked issues · Activity · Tenants impacted · Resolution.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadBugDetail,
  loadBugFilterOptions,
  synthesizeSentryEnvelope,
  type SentryEnvelope,
} from "@/server/platform/bugs";
import {
  updateBug,
  transitionBug,
  assignBug,
  postBugComment,
  addBugAttachment,
  removeBugAttachment,
  saveBugResolution,
  addBugTenantImpact,
  removeBugTenantImpact,
  syncBugFromSentry,
} from "@/app/actions/platform-bugs";
import { renderMarkdown } from "@/lib/md-to-html";
import type {
  BugSeverity,
  BugStatus,
  BugEnvironment,
  BugFrequency,
  SupportTicketModule,
} from "@prisma/client";
import {
  ENV_LABEL,
  FREQ_LABEL,
  FormError,
  FormOk,
  MODULE_LABEL,
  SEVERITY_DESC,
  SeverityPill,
  STATUS_LABEL,
  STATUS_TONE,
  StatusPill,
  relativeFromNow,
} from "../_components/shared";
import { BugTabs, isBugTab } from "../_components/BugTabs";

export const dynamic = "force-dynamic";

const SEVERITIES: BugSeverity[] = ["SEV1", "SEV2", "SEV3", "SEV4"];
const STATUSES: BugStatus[] = ["NEW", "TRIAGED", "IN_PROGRESS", "IN_REVIEW", "RESOLVED", "RELEASED", "WONT_FIX", "DUPLICATE"];
const ENVS: BugEnvironment[] = ["PRODUCTION", "STAGING", "SANDBOX"];
const FREQUENCIES: BugFrequency[] = ["ALWAYS", "OFTEN", "SOMETIMES", "RARE"];
const MODULES: SupportTicketModule[] = [
  "BILLING", "AUTH", "PROOFS", "ORDERS", "INVOICES", "QUOTES",
  "PRODUCTS", "REPORTS", "INTEGRATIONS", "PORTAL", "EMAIL", "ADMIN", "OTHER",
];

export default async function BugDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string; tab?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requirePlatformStaff();
  const canWrite = ctx.can("support.respond");

  const tab = isBugTab(sp.tab) ? sp.tab : "details";

  const [bug, options] = await Promise.all([
    loadBugDetail(id),
    loadBugFilterOptions(),
  ]);
  if (!bug) notFound();

  const sentryEnv: SentryEnvelope | null = bug.linkedSentryIssueId
    ? synthesizeSentryEnvelope({
        id: bug.id,
        title: bug.title,
        createdAt: bug.createdAt,
        module: bug.module,
        linkedSentryIssueId: bug.linkedSentryIssueId,
      })
    : null;

  const hrefFor = (t: typeof tab) => `/platform/operations/bugs/${bug.id}${t === "details" ? "" : `?tab=${t}`}`;
  const returnTo = `/platform/operations/bugs/${bug.id}`;

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        <Link href="/platform/operations/bugs" className="underline" style={{ color: "var(--text-muted)" }}>
          Bugs
        </Link>
        <span className="mx-1.5">/</span>
        <span className="font-mono">#{bug.number}</span>
        <span className="mx-1.5">·</span>
        <span style={{ color: "var(--text-default)" }}>{bug.title}</span>
      </div>

      <FormOk msg={sp.ok} />
      <FormError msg={sp.error} />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <SeverityPill severity={bug.severity} />
            <StatusPill status={bug.status} />
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
              style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
            >
              {ENV_LABEL[bug.environment]}
            </span>
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
            >
              {MODULE_LABEL[bug.module]}
            </span>
            {bug.duplicateOfId && bug.duplicateOfTitle && (
              <Link
                href={`/platform/operations/bugs/${bug.duplicateOfId}`}
                className="rounded-full px-1.5 py-0.5 text-[10px] font-medium underline"
                style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
              >
                Duplicate of: {bug.duplicateOfTitle.slice(0, 40)}
              </Link>
            )}
          </div>
          <h1
            className="mt-1.5 text-[22px] font-semibold leading-tight"
            style={{ color: "var(--text-default)" }}
          >
            <span className="font-mono text-[16px]" style={{ color: "var(--text-muted)" }}>#{bug.number}</span>{" "}
            {bug.title}
          </h1>
          <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
            {bug.reporterUserName ? `Reported by ${bug.reporterUserName}` : "System-reported"}
            {bug.reporterTenantName && ` · via ${bug.reporterTenantName}`}
            {" · created "}{relativeFromNow(bug.createdAt)}
            {bug.lastSyncedAt && ` · Sentry synced ${relativeFromNow(bug.lastSyncedAt)}`}
          </p>
        </div>

        {/* Assignee picker */}
        {canWrite && (
          <form action={assignBug} className="flex items-center gap-2 rounded-lg border p-2"
                style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
            <input type="hidden" name="id" value={bug.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Assignee
            </span>
            <select
              name="assigneeUserId"
              defaultValue={bug.assigneeUserId ?? "__unassign__"}
              className="ts-focus rounded-md px-2 py-1 text-[11px] outline-none"
              style={inputStyle()}
            >
              <option value="__unassign__">Unassigned</option>
              {options.staff.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
            <button
              type="submit"
              className="ts-focus rounded-md px-2 py-1 text-[10px] font-semibold"
              style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
            >
              Save
            </button>
          </form>
        )}
      </div>

      {/* Status transitions */}
      {canWrite && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border p-2"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <span className="px-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Move to
          </span>
          {STATUSES.filter((s) => s !== bug.status).map((s) => (
            <form key={s} action={transitionBug}>
              <input type="hidden" name="id" value={bug.id} />
              <input type="hidden" name="to" value={s} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <button
                type="submit"
                className="ts-focus rounded-md px-2 py-1 text-[11px] font-medium"
                style={{
                  background: "var(--surface-1)",
                  color: STATUS_TONE[s].fg,
                  border: `1px solid ${STATUS_TONE[s].fg}`,
                }}
              >
                → {STATUS_LABEL[s]}
              </button>
            </form>
          ))}
        </div>
      )}

      <BugTabs
        active={tab}
        hrefFor={hrefFor}
        counts={{
          activity: bug.activity.length + bug.comments.length,
          tenants: bug.tenantImpacts.length,
          linked: (bug.linkedSentryIssueId ? 1 : 0) + (bug.linkedLinearIssueId ? 1 : 0) + (bug.linkedJiraIssueId ? 1 : 0) + bug.linkedTickets.length + bug.linkedFeatureRequests.length,
        }}
      />

      <div
        className="rounded-lg border p-4"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
      >
        {tab === "details"    && <DetailsTab bug={bug} canWrite={canWrite} />}
        {tab === "linked"     && <LinkedTab bug={bug} sentry={sentryEnv} canWrite={canWrite} />}
        {tab === "activity"   && <ActivityTab bug={bug} canWrite={canWrite} />}
        {tab === "tenants"    && <TenantsTab bug={bug} options={options} canWrite={canWrite} />}
        {tab === "resolution" && <ResolutionTab bug={bug} options={options} canWrite={canWrite} />}
      </div>
    </div>
  );
}

/* ── Details tab ──────────────────────────────────────── */

function DetailsTab({
  bug, canWrite,
}: {
  bug: Awaited<ReturnType<typeof loadBugDetail>>;
  canWrite: boolean;
}) {
  if (!bug) return null;
  const html = renderMarkdown(bug.description || "*(no description)*");
  return (
    <form action={updateBug} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={bug.id} />
      <Field label="Title">
        <input
          name="title"
          required
          defaultValue={bug.title}
          disabled={!canWrite}
          className="ts-focus w-full rounded-md px-3 py-2 text-[14px] font-semibold outline-none"
          style={inputStyle()}
        />
      </Field>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Severity">
          <Select name="severity" defaultValue={bug.severity} disabled={!canWrite}>
            {SEVERITIES.map((s) => <option key={s} value={s} title={SEVERITY_DESC[s]}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Module">
          <Select name="module" defaultValue={bug.module} disabled={!canWrite}>
            {MODULES.map((m) => <option key={m} value={m}>{MODULE_LABEL[m]}</option>)}
          </Select>
        </Field>
        <Field label="Environment">
          <Select name="environment" defaultValue={bug.environment} disabled={!canWrite}>
            {ENVS.map((e) => <option key={e} value={e}>{ENV_LABEL[e]}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Description (Markdown)">
        <textarea
          name="description"
          defaultValue={bug.description}
          rows={6}
          disabled={!canWrite}
          className="ts-focus w-full rounded-md px-3 py-2 font-mono text-[12px] outline-none"
          style={{ ...inputStyle(), lineHeight: 1.5 }}
        />
      </Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Repro steps">
          <textarea
            name="reproSteps"
            defaultValue={bug.reproSteps}
            rows={6}
            placeholder="1. …\n2. …\n3. …"
            disabled={!canWrite}
            className="ts-focus w-full rounded-md px-3 py-2 font-mono text-[12px] outline-none"
            style={{ ...inputStyle(), lineHeight: 1.5 }}
          />
        </Field>
        <div className="flex flex-col gap-3">
          <Field label="Expected">
            <textarea
              name="expected"
              defaultValue={bug.expected}
              rows={3}
              disabled={!canWrite}
              className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
              style={{ ...inputStyle(), lineHeight: 1.5 }}
            />
          </Field>
          <Field label="Actual">
            <textarea
              name="actual"
              defaultValue={bug.actual}
              rows={3}
              disabled={!canWrite}
              className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
              style={{ ...inputStyle(), lineHeight: 1.5 }}
            />
          </Field>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Browser / OS">
          <input
            name="browserOS"
            defaultValue={bug.browserOS ?? ""}
            placeholder="Chrome 124 / macOS 14"
            disabled={!canWrite}
            className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
            style={inputStyle()}
          />
        </Field>
        <Field label="Frequency">
          <Select name="frequency" defaultValue={bug.frequency} disabled={!canWrite}>
            {FREQUENCIES.map((f) => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}
          </Select>
        </Field>
        <Field label="Tags (comma-separated)">
          <input
            name="tags"
            defaultValue={bug.tags.join(", ")}
            disabled={!canWrite}
            className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
            style={inputStyle()}
          />
        </Field>
      </div>
      <Field label="Account context" help="Reproduction context — which tenant, which workflow, which order id, etc.">
        <textarea
          name="accountContext"
          defaultValue={bug.accountContext ?? ""}
          rows={3}
          disabled={!canWrite}
          className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
          style={{ ...inputStyle(), lineHeight: 1.5 }}
        />
      </Field>
      <Field label="Business impact" help="Free-form summary used for prioritization stand-ups.">
        <textarea
          name="businessImpact"
          defaultValue={bug.businessImpact ?? ""}
          rows={3}
          disabled={!canWrite}
          className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
          style={{ ...inputStyle(), lineHeight: 1.5 }}
        />
      </Field>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Sentry issue id" help="e.g. FLOWTORA-1A2B3C — the lookup key on Sentry.">
          <input
            name="linkedSentryIssueId"
            defaultValue={bug.linkedSentryIssueId ?? ""}
            disabled={!canWrite}
            className="ts-focus w-full rounded-md px-2 py-1.5 text-[12px] outline-none"
            style={inputStyle()}
          />
        </Field>
        <Field label="Linear issue id" help="e.g. ENG-1234">
          <input
            name="linkedLinearIssueId"
            defaultValue={bug.linkedLinearIssueId ?? ""}
            disabled={!canWrite}
            className="ts-focus w-full rounded-md px-2 py-1.5 text-[12px] outline-none"
            style={inputStyle()}
          />
        </Field>
        <Field label="Jira issue key" help="e.g. PLT-456">
          <input
            name="linkedJiraIssueId"
            defaultValue={bug.linkedJiraIssueId ?? ""}
            disabled={!canWrite}
            className="ts-focus w-full rounded-md px-2 py-1.5 text-[12px] outline-none"
            style={inputStyle()}
          />
        </Field>
      </div>

      <Attachments bug={bug} canWrite={canWrite} />

      {canWrite && (
        <div className="flex items-center justify-end gap-2">
          <button
            type="submit"
            className="ts-focus rounded-md px-4 py-2 text-[12px] font-semibold"
            style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
          >
            Save details
          </button>
        </div>
      )}

      {/* Description preview as a separate card so it doesn't block the form. */}
      <section
        className="rounded-md border p-3"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
      >
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          Description (preview)
        </h2>
        <div
          className="md-preview text-[12px] leading-relaxed"
          style={{ color: "var(--text-default)" }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </section>
    </form>
  );
}

function Attachments({
  bug, canWrite,
}: {
  bug: NonNullable<Awaited<ReturnType<typeof loadBugDetail>>>;
  canWrite: boolean;
}) {
  return (
    <section
      className="rounded-md border p-3"
      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
    >
      <h2 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
        Attachments ({bug.attachments.length})
      </h2>
      {bug.attachments.length === 0 ? (
        <p className="mt-2 text-[11px]" style={{ color: "var(--text-faint)" }}>
          No screenshots/videos yet.
        </p>
      ) : (
        <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {bug.attachments.map((a) => (
            <li
              key={a.id}
              className="rounded-md border p-2"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ts-focus truncate text-[12px] underline"
                  style={{ color: "var(--accent-primary)" }}
                >
                  {a.name}
                </a>
                {canWrite && (
                  <RemoveAttachmentForm bugId={bug.id} attachmentId={a.id} />
                )}
              </div>
              {a.mime?.startsWith("image/") && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={a.url} alt={a.name} className="mt-2 max-h-40 rounded-sm object-contain" />
              )}
              <div className="mt-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
                {a.mime ?? "unknown type"}
                {a.size && ` · ${(a.size / 1024).toFixed(1)} KB`}
              </div>
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <form
          action={addBugAttachment}
          className="mt-3 grid gap-2 rounded-md border border-dashed p-2 md:grid-cols-[1fr_minmax(0,140px)_minmax(0,140px)_auto]"
          style={{ borderColor: "var(--border-default)" }}
        >
          <input type="hidden" name="id" value={bug.id} />
          <input
            name="url"
            placeholder="https://uploads.flowtora.com/…"
            required
            className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
            style={inputStyle()}
          />
          <input
            name="name"
            placeholder="screenshot-1.png"
            required
            className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
            style={inputStyle()}
          />
          <input
            name="mime"
            placeholder="image/png"
            className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
            style={inputStyle()}
          />
          <button
            type="submit"
            className="ts-focus rounded-md px-3 py-1.5 text-[11px] font-semibold"
            style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
          >
            + Add
          </button>
        </form>
      )}
    </section>
  );
}

function RemoveAttachmentForm({ bugId, attachmentId }: { bugId: string; attachmentId: string }) {
  return (
    <form action={removeBugAttachment}>
      <input type="hidden" name="bugId" value={bugId} />
      <input type="hidden" name="attachmentId" value={attachmentId} />
      <button type="submit" className="text-[10px] underline" style={{ color: "var(--text-muted)" }}>
        Remove
      </button>
    </form>
  );
}

/* ── Linked tab ───────────────────────────────────────── */

function LinkedTab({
  bug, sentry, canWrite,
}: {
  bug: NonNullable<Awaited<ReturnType<typeof loadBugDetail>>>;
  sentry: SentryEnvelope | null;
  canWrite: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* Sentry */}
      <section
        className="rounded-md border p-3"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
            📡 Sentry
          </h2>
          <div className="flex items-center gap-2">
            {bug.lastSyncedAt && (
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                Last synced {relativeFromNow(bug.lastSyncedAt)}
              </span>
            )}
            {canWrite && (
              <form action={syncBugFromSentry}>
                <input type="hidden" name="id" value={bug.id} />
                <button
                  type="submit"
                  className="ts-focus rounded-md px-2 py-1 text-[11px] font-semibold"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
                >
                  {bug.linkedSentryIssueId ? "Resync" : "Sync from Sentry"}
                </button>
              </form>
            )}
          </div>
        </div>
        {!sentry ? (
          <p className="mt-2 text-[11px]" style={{ color: "var(--text-faint)" }}>
            Not linked. Click <b>Sync from Sentry</b> to link this bug to a synthetic Sentry
            issue (the runtime tag-correlator will auto-detect impacted tenants).
          </p>
        ) : (
          <div className="mt-2 grid gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono" style={{ color: "var(--text-muted)" }}>
                {sentry.issueId}
              </span>
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{
                  background: sentry.level === "fatal" ? "var(--rose-50, var(--surface-2))" : "var(--warning-surface)",
                  color: sentry.level === "fatal" ? "var(--danger-fg)" : "var(--warning-fg)",
                }}
              >
                {sentry.level}
              </span>
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {sentry.count.toLocaleString()} events · {sentry.userCount.toLocaleString()} users
              </span>
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                First seen {relativeFromNow(sentry.firstSeen)} · Last seen {relativeFromNow(sentry.lastSeen)}
              </span>
            </div>
            <div className="rounded-md border p-2"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
              <div className="text-[11px] font-semibold" style={{ color: "var(--text-default)" }}>
                {sentry.exception.type}: {sentry.exception.value}
              </div>
              <pre className="mt-1 overflow-auto text-[11px] font-mono leading-relaxed" style={{ color: "var(--text-default)" }}>
                {sentry.exception.frames.map((f) =>
                  `  at ${f.function} (${f.filename}:${f.lineno})${f.in_app ? "" : "  [vendor]"}`
                ).join("\n")}
              </pre>
            </div>
            <div className="rounded-md border p-2"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Breadcrumbs
              </div>
              <ul className="flex flex-col gap-0.5 text-[11px]" style={{ color: "var(--text-default)" }}>
                {sentry.breadcrumbs.map((b, idx) => (
                  <li key={idx} className="flex items-baseline gap-2">
                    <span className="w-16 shrink-0 text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {b.category}
                    </span>
                    <span style={{ color: b.level === "error" ? "var(--danger-fg)" : "var(--text-default)" }}>
                      {b.message}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>

      {/* Linear / Jira */}
      <section
        className="rounded-md border p-3"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
      >
        <h2 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
          ↗ Linear / Jira
        </h2>
        <div className="grid gap-2 text-[12px] md:grid-cols-2">
          <ExternalLink prefix="Linear" id={bug.linkedLinearIssueId} url={bug.linkedLinearIssueId ? `https://linear.app/flowtora/issue/${bug.linkedLinearIssueId}` : null} />
          <ExternalLink prefix="Jira"   id={bug.linkedJiraIssueId}   url={bug.linkedJiraIssueId   ? `https://flowtora.atlassian.net/browse/${bug.linkedJiraIssueId}` : null} />
        </div>
        <p className="mt-1 text-[11px]" style={{ color: "var(--text-faint)" }}>
          Edit the ids on the Details tab — the link-out resolves them against the configured Linear/Jira workspaces.
        </p>
      </section>

      {/* Linked support tickets */}
      <section
        className="rounded-md border p-3"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
      >
        <h2 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
          🎫 Customer tickets ({bug.linkedTickets.length})
        </h2>
        {bug.linkedTickets.length === 0 ? (
          <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>
            No tickets reference this bug yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-[12px]">
            {bug.linkedTickets.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/platform/support/${t.id}`}
                  className="ts-focus underline"
                  style={{ color: "var(--text-default)" }}
                >
                  {t.subject}
                </Link>
                <span className="ml-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {t.status.replace(/_/g, " ").toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Linked feature requests */}
      {bug.linkedFeatureRequests.length > 0 && (
        <section
          className="rounded-md border p-3"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
        >
          <h2 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
            🪄 Feature requests ({bug.linkedFeatureRequests.length})
          </h2>
          <ul className="flex flex-col gap-1.5 text-[12px]">
            {bug.linkedFeatureRequests.map((f) => (
              <li key={f.id}>
                <Link
                  href={`/platform/operations/feature-requests/${f.id}`}
                  className="ts-focus underline"
                  style={{ color: "var(--text-default)" }}
                >
                  {f.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Duplicates */}
      {bug.duplicates.length > 0 && (
        <section
          className="rounded-md border p-3"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
        >
          <h2 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
            🔁 Marked as duplicates of this bug ({bug.duplicates.length})
          </h2>
          <ul className="flex flex-col gap-1.5 text-[12px]">
            {bug.duplicates.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/platform/operations/bugs/${d.id}`}
                  className="ts-focus underline"
                  style={{ color: "var(--text-default)" }}
                >
                  #{d.number} {d.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ExternalLink({ prefix, id, url }: { prefix: string; id: string | null; url: string | null }) {
  if (!id || !url) {
    return (
      <div
        className="rounded-md border border-dashed p-2 text-[11px]"
        style={{ borderColor: "var(--border-default)", color: "var(--text-faint)" }}
      >
        No {prefix} link set.
      </div>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="ts-focus rounded-md border p-2 text-[12px]"
      style={{
        background: "var(--surface-1)",
        borderColor: "var(--border-subtle)",
        color: "var(--accent-primary)",
      }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
        {prefix}
      </div>
      <div className="mt-0.5 font-mono">{id}</div>
    </a>
  );
}

/* ── Activity tab ─────────────────────────────────────── */

function ActivityTab({
  bug, canWrite,
}: {
  bug: NonNullable<Awaited<ReturnType<typeof loadBugDetail>>>;
  canWrite: boolean;
}) {
  // Merge activity events + comments into a single chronological feed.
  const feed: { kind: "activity" | "comment"; at: Date; payload: unknown }[] = [
    ...bug.activity.map((a) => ({ kind: "activity" as const, at: a.createdAt, payload: a })),
    ...bug.comments.map((c) => ({ kind: "comment" as const, at: c.createdAt, payload: c })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2" id="comments">
        {feed.length === 0 && (
          <li className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            No activity yet.
          </li>
        )}
        {feed.map((entry, idx) => (
          <li key={idx}>
            {entry.kind === "comment" ? (
              <CommentItem comment={entry.payload as typeof bug.comments[0]} />
            ) : (
              <ActivityItem activity={entry.payload as typeof bug.activity[0]} />
            )}
          </li>
        ))}
      </ul>

      {canWrite && (
        <form action={postBugComment} className="flex flex-col gap-2 rounded-md border p-3"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <input type="hidden" name="id" value={bug.id} />
          <textarea
            name="body"
            required
            rows={3}
            placeholder="Add a comment…"
            className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
            style={{ ...inputStyle(), lineHeight: 1.5 }}
          />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
              <input type="checkbox" name="internal" className="ts-focus h-3 w-3" />
              Internal-only note
            </label>
            <button
              type="submit"
              className="ts-focus rounded-md px-3 py-1.5 text-[11px] font-semibold"
              style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
            >
              Post
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function CommentItem({ comment }: { comment: { authorName: string | null; body: string; internal: boolean; createdAt: Date } }) {
  return (
    <div
      className="rounded-md border p-3"
      style={{
        background: comment.internal ? "var(--warning-surface)" : "var(--surface-1)",
        borderColor: comment.internal ? "var(--amber-200, var(--border-default))" : "var(--border-subtle)",
      }}
    >
      <div className="flex items-baseline justify-between gap-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
        <span style={{ color: "var(--text-default)", fontWeight: 600 }}>
          {comment.authorName ?? "(removed user)"}
        </span>
        <span>
          {comment.internal && (
            <span className="mr-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                  style={{ background: "var(--warning-surface)", color: "var(--warning-fg)" }}>
              internal
            </span>
          )}
          {relativeFromNow(comment.createdAt)}
        </span>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-[12px]" style={{ color: "var(--text-default)" }}>
        {comment.body}
      </p>
    </div>
  );
}

function ActivityItem({ activity }: { activity: { action: string; actorName: string | null; createdAt: Date; details: unknown } }) {
  const detail = (() => {
    if (typeof activity.details !== "object" || activity.details === null) return "";
    const d = activity.details as Record<string, unknown>;
    if (activity.action === "status_changed")    return `${d.from} → ${d.to}`;
    if (activity.action === "assignee_changed")  return `${d.from ?? "—"} → ${d.to ?? "—"}`;
    if (activity.action === "severity_changed")  return `${d.from} → ${d.to}`;
    if (activity.action === "sentry_synced")     return `${d.issueId ?? ""} · ${d.count ?? "?"} events`;
    if (activity.action === "tenant_impact_added")   return `tenant ${d.tenantId}`;
    if (activity.action === "tenant_impact_removed") return "tenant impact removed";
    if (activity.action === "attachment_added")  return `${d.name ?? "file"}`;
    return "";
  })();
  return (
    <div className="flex items-baseline gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
      <span aria-hidden style={{ color: "var(--accent-primary)" }}>•</span>
      <span style={{ color: "var(--text-default)", fontWeight: 600 }}>
        {activity.actorName ?? "system"}
      </span>
      <span>{activity.action.replace(/_/g, " ")}</span>
      {detail && <code className="rounded-sm px-1 text-[10px]" style={{ background: "var(--surface-2)", color: "var(--text-default)" }}>{detail}</code>}
      <span className="ml-auto">{relativeFromNow(activity.createdAt)}</span>
    </div>
  );
}

/* ── Tenants impacted tab ─────────────────────────────── */

function TenantsTab({
  bug, options, canWrite,
}: {
  bug: NonNullable<Awaited<ReturnType<typeof loadBugDetail>>>;
  options: Awaited<ReturnType<typeof loadBugFilterOptions>>;
  canWrite: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        Tenants are auto-correlated by Sentry tag (the sync action upserts impact rows). You can also add
        tenants manually from triage.
      </p>
      {bug.tenantImpacts.length === 0 ? (
        <div
          className="rounded-md border p-6 text-center text-[12px]"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
        >
          No impacted tenants recorded yet.
        </div>
      ) : (
        <ul
          className="overflow-hidden rounded-md"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
        >
          {bug.tenantImpacts.map((i, idx) => (
            <li
              key={i.id}
              className="flex items-center justify-between gap-3 px-3 py-2.5"
              style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
                    {i.tenantName}
                  </span>
                  {i.autoDetected && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                      style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}
                    >
                      auto
                    </span>
                  )}
                </div>
                {i.note && (
                  <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {i.note}
                  </div>
                )}
                <div className="mt-0.5 text-[10px]" style={{ color: "var(--text-faint)" }}>
                  First seen {relativeFromNow(i.firstSeenAt)} · Last seen {relativeFromNow(i.lastSeenAt)}
                </div>
              </div>
              {canWrite && (
                <form action={removeBugTenantImpact}>
                  <input type="hidden" name="impactId" value={i.id} />
                  <input type="hidden" name="bugId" value={bug.id} />
                  <button type="submit" className="text-[10px] underline" style={{ color: "var(--danger-fg)" }}>
                    Remove
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {canWrite && (
        <form action={addBugTenantImpact}
              className="flex flex-wrap items-end gap-2 rounded-md border p-3"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <input type="hidden" name="id" value={bug.id} />
          <Field label="Add tenant">
            <select
              name="tenantId"
              required
              defaultValue=""
              className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
              style={inputStyle()}
            >
              <option value="" disabled>— Pick a tenant —</option>
              {options.tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Note (optional)">
            <input
              name="note"
              placeholder="e.g. They escalated via on-call"
              className="ts-focus w-[260px] rounded-md px-2 py-1.5 text-[12px] outline-none"
              style={inputStyle()}
            />
          </Field>
          <button
            type="submit"
            className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-semibold"
            style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
          >
            + Add impact
          </button>
        </form>
      )}
    </div>
  );
}

/* ── Resolution tab ───────────────────────────────────── */

function ResolutionTab({
  bug, options, canWrite,
}: {
  bug: NonNullable<Awaited<ReturnType<typeof loadBugDetail>>>;
  options: Awaited<ReturnType<typeof loadBugFilterOptions>>;
  canWrite: boolean;
}) {
  const requirePostmortem = bug.severity === "SEV1" || bug.severity === "SEV2";
  return (
    <form action={saveBugResolution} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={bug.id} />
      <Field label="Root cause" help="What was actually broken.">
        <textarea
          name="rootCause"
          defaultValue={bug.rootCause ?? ""}
          rows={5}
          disabled={!canWrite}
          className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
          style={{ ...inputStyle(), lineHeight: 1.5 }}
        />
      </Field>
      <Field label="Fix description" help="What changed to fix it. Linkable to the PR.">
        <textarea
          name="fixDescription"
          defaultValue={bug.fixDescription ?? ""}
          rows={5}
          disabled={!canWrite}
          className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
          style={{ ...inputStyle(), lineHeight: 1.5 }}
        />
      </Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Verified by">
          <Select name="verifiedByUserId" defaultValue={bug.verifiedByUserId ?? ""} disabled={!canWrite}>
            <option value="">— Not verified yet —</option>
            {options.staff.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
          </Select>
        </Field>
        <Field
          label={requirePostmortem ? "Postmortem URL · required for SEV1/SEV2" : "Postmortem URL"}
          help={requirePostmortem ? "Link to the public postmortem doc." : undefined}
        >
          <input
            name="postmortemUrl"
            defaultValue={bug.postmortemUrl ?? ""}
            disabled={!canWrite}
            placeholder="https://flowtora.com/postmortems/…"
            className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
            style={{
              ...inputStyle(),
              borderColor: requirePostmortem && !bug.postmortemUrl ? "var(--rose-200, var(--border-default))" : "var(--border-default)",
            }}
          />
        </Field>
      </div>
      {requirePostmortem && !bug.postmortemUrl && (
        <p className="text-[11px]" style={{ color: "var(--danger-fg)" }}>
          ⚠ {bug.severity} bugs require a postmortem URL before they ship.
        </p>
      )}
      {canWrite && (
        <div className="flex items-center justify-end gap-2">
          <button
            type="submit"
            className="ts-focus rounded-md px-4 py-2 text-[12px] font-semibold"
            style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
          >
            Save resolution
          </button>
        </div>
      )}
    </form>
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

function Select({
  name, defaultValue, disabled, children,
}: {
  name: string;
  defaultValue: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      disabled={disabled}
      className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
      style={inputStyle()}
    >
      {children}
    </select>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    background: "var(--surface-1)",
    border: "1px solid var(--border-default)",
    color: "var(--text-default)",
  };
}
