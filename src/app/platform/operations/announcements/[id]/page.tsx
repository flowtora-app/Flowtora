// Page 35 — Announcement editor.
//
// Single-form editor with channel multi-select, targeting picker,
// CTA + hero image, schedule, frequency cap, and a per-announcement
// performance dashboard. Status transitions (Schedule / Publish /
// Archive / Back to draft) sit in the header.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformStaff } from "@/lib/platform";
import { loadAnnouncementDetail } from "@/server/platform/announcements";
import {
  saveOpsAnnouncement,
  transitionOpsAnnouncement,
} from "@/app/actions/platform-announcements";
import type {
  AnnouncementType,
  AnnouncementPriority,
  AnnouncementAudience,
  AnnouncementChannel,
  AnnouncementFrequencyCap,
  AnnouncementStatus,
  ChangelogCategory,
} from "@prisma/client";
import {
  AUDIENCE_LABEL,
  CHANNEL_LABEL,
  CHANGELOG_CATEGORY_LABEL,
  DeferredNote,
  FormError,
  FormOk,
  FREQUENCY_LABEL,
  Kpi,
  PRIORITY_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  TYPE_LABEL,
  TYPE_TONE,
  formatDateTime,
  relativeFromNow,
} from "../_components/shared";

export const dynamic = "force-dynamic";

const TYPES: AnnouncementType[] = ["RELEASE", "NEW_FEATURE", "MAINTENANCE", "INCIDENT", "PRICING", "GENERAL"];
const PRIORITIES: AnnouncementPriority[] = ["INFO", "IMPORTANT", "CRITICAL"];
const AUDIENCES: AnnouncementAudience[] = ["ALL", "PLAN", "COHORT", "TENANT"];
const CHANNELS: AnnouncementChannel[] = ["BANNER", "MODAL", "INBOX", "EMAIL", "CHANGELOG", "PUSH"];
const FREQUENCIES: AnnouncementFrequencyCap[] = ["UNLIMITED", "ONCE", "DAILY"];
const CHANGELOG_CATEGORIES: ChangelogCategory[] = ["FEATURE", "IMPROVEMENT", "FIX", "SECURITY", "DEPRECATION"];

const dtLocal = (d: Date | null) => d ? d.toISOString().slice(0, 16) : "";

export default async function OpsAnnouncementEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requirePlatformStaff();
  const canWrite = ctx.can("announcement.write");

  const a = await loadAnnouncementDetail(id);
  if (!a) notFound();

  const status = STATUS_TONE[a.status];
  const tone = TYPE_TONE[a.type];

  const ctr = a.perf.views === 0 ? null : a.perf.clicks / a.perf.views;
  const dismissalRate = a.perf.views === 0 ? null : a.perf.dismissals / a.perf.views;
  const reach = a.perf.audienceTenantCount && a.perf.audienceTenantCount > 0
    ? a.perf.distinctTenants / a.perf.audienceTenantCount
    : null;

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        <Link href="/platform/operations/announcements" className="underline" style={{ color: "var(--text-muted)" }}>
          Announcements
        </Link>
        <span className="mx-1.5">/</span>
        <span style={{ color: "var(--text-default)" }}>
          {a.title || "Untitled"}
        </span>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: status.bg, color: status.fg }}
            >
              {STATUS_LABEL[a.status]}
            </span>
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: tone.bg, color: tone.fg }}
            >
              {TYPE_LABEL[a.type]}
            </span>
            {a.priority !== "INFO" && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{
                  background: a.priority === "CRITICAL"
                    ? "var(--danger-surface, var(--surface-2))"
                    : "var(--accent-surface)",
                  color: a.priority === "CRITICAL" ? "var(--danger-fg)" : "var(--accent-primary)",
                }}
              >
                {PRIORITY_LABEL[a.priority]}
              </span>
            )}
          </div>
          <h1
            className="mt-1.5 truncate text-[22px] font-semibold leading-tight"
            style={{ color: "var(--text-default)" }}
          >
            {a.title || <span style={{ color: "var(--text-faint)" }}>Untitled announcement</span>}
          </h1>
          <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
            <span className="font-mono">#{a.id.slice(0, 8)}</span>
            {a.authorName && ` · by ${a.authorName}`}
            {" · updated "}{relativeFromNow(a.updatedAt)}
            {a.publishedAt && <> · published {formatDateTime(a.publishedAt)}</>}
          </p>
        </div>
        <StatusActions id={a.id} current={a.status} canWrite={canWrite} />
      </div>

      <FormOk msg={sp.ok} />
      <FormError msg={sp.error} />

      {/* Performance dashboard */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Views" value={a.perf.views.toLocaleString()} />
        <Kpi
          label="Click rate"
          value={ctr == null ? "—" : `${(ctr * 100).toFixed(1)}%`}
          sub={`${a.perf.clicks.toLocaleString()} clicks`}
          tone={ctr == null ? "default" : ctr >= 0.05 ? "good" : ctr >= 0.02 ? "warning" : "danger"}
        />
        <Kpi
          label="Dismissal rate"
          value={dismissalRate == null ? "—" : `${(dismissalRate * 100).toFixed(0)}%`}
          sub={`${a.perf.dismissals.toLocaleString()} dismissed`}
          tone={dismissalRate == null ? "default" : dismissalRate <= 0.30 ? "good" : dismissalRate <= 0.60 ? "warning" : "danger"}
        />
        <Kpi
          label="Reached tenants"
          value={a.perf.distinctTenants.toLocaleString()}
        />
        <Kpi
          label="Audience size"
          value={a.perf.audienceTenantCount == null ? "—" : a.perf.audienceTenantCount.toLocaleString()}
          sub={`${AUDIENCE_LABEL[a.audience]}`}
        />
        <Kpi
          label="Reach"
          value={reach == null ? "—" : `${(reach * 100).toFixed(0)}%`}
          sub="distinct tenants / audience"
          tone={reach == null ? "default" : reach >= 0.5 ? "good" : reach >= 0.2 ? "warning" : "default"}
        />
      </div>

      {/* Editor form */}
      <form
        action={saveOpsAnnouncement}
        className="flex flex-col gap-4 rounded-lg border p-4"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
      >
        <input type="hidden" name="id" value={a.id} />

        {/* Title + body */}
        <Field label="Title">
          <input
            name="title"
            defaultValue={a.title}
            disabled={!canWrite}
            className="ts-focus w-full rounded-md px-3 py-2 text-[14px] font-semibold outline-none"
            style={inputStyle()}
          />
        </Field>
        <Field label="Body" help="Plain text or Markdown. Slash-menu embeds and rich text are deferred.">
          <textarea
            name="body"
            defaultValue={a.body}
            rows={10}
            disabled={!canWrite}
            className="ts-focus w-full rounded-md px-3 py-2 font-mono text-[12px] outline-none"
            style={{ ...inputStyle(), lineHeight: 1.5 }}
          />
        </Field>

        {/* Type + priority */}
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Type">
            <Select name="type" defaultValue={a.type} disabled={!canWrite}>
              {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </Select>
          </Field>
          <Field label="Priority">
            <Select name="priority" defaultValue={a.priority} disabled={!canWrite}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </Select>
          </Field>
        </div>

        {/* Channels */}
        <Field label="Channels" help="Each selected channel fans out the same body. Per-channel content variants are deferred.">
          <div className="flex flex-wrap gap-2">
            {CHANNELS.map((c) => (
              <label
                key={c}
                className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-[12px]"
                style={{
                  background: "var(--surface-1)",
                  borderColor: a.channels.includes(c) ? "var(--accent-primary)" : "var(--border-default)",
                  color: "var(--text-default)",
                }}
              >
                <input
                  type="checkbox"
                  name="channels"
                  value={c}
                  defaultChecked={a.channels.includes(c)}
                  disabled={!canWrite}
                  className="ts-focus h-3.5 w-3.5"
                />
                {CHANNEL_LABEL[c]}
              </label>
            ))}
          </div>
        </Field>

        {/* Targeting */}
        <Field label="Audience">
          <Select name="audience" defaultValue={a.audience} disabled={!canWrite}>
            {AUDIENCES.map((aud) => (
              <option key={aud} value={aud}>{AUDIENCE_LABEL[aud]}</option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Audience plans" help="Comma-separated. Plan enum values: STARTER, GROWTH, PRO, ENTERPRISE.">
            <input
              name="audiencePlans"
              defaultValue={a.audiencePlans.join(", ")}
              disabled={!canWrite}
              className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
              style={inputStyle()}
            />
          </Field>
          <Field label="Audience cohorts" help="Comma-separated. e.g. ALPHA, BETA, PILOT.">
            <input
              name="audienceCohorts"
              defaultValue={a.audienceCohorts.join(", ")}
              disabled={!canWrite}
              className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
              style={inputStyle()}
            />
          </Field>
          <Field label="Specific tenant ids" help="Comma-separated tenant ids — overrides audience selection.">
            <input
              name="audienceTenantIds"
              defaultValue={a.audienceTenantIds.join(", ")}
              disabled={!canWrite}
              className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
              style={inputStyle()}
            />
          </Field>
        </div>
        <Field label="Changelog audience" help="When the changelog channel is selected, this controls who sees the public post.">
          <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
            <input
              type="checkbox"
              name="audienceCustomersOnly"
              defaultChecked={a.audienceCustomersOnly}
              disabled={!canWrite}
              className="ts-focus h-3.5 w-3.5"
            />
            Customers only (hide from the public RSS)
          </label>
        </Field>

        {/* CTA + hero image */}
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="CTA label">
            <input
              name="ctaLabel"
              defaultValue={a.ctaLabel ?? ""}
              maxLength={60}
              disabled={!canWrite}
              placeholder="e.g. Read the full update"
              className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
              style={inputStyle()}
            />
          </Field>
          <Field label="CTA URL">
            <input
              name="ctaUrl"
              defaultValue={a.ctaUrl ?? ""}
              disabled={!canWrite}
              placeholder="https://flowtora.com/changelog/…"
              className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
              style={inputStyle()}
            />
          </Field>
        </div>
        <Field label="Hero image URL" help="Rendered above the body in modals and emails.">
          <input
            name="heroImageUrl"
            defaultValue={a.heroImageUrl ?? ""}
            disabled={!canWrite}
            className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
            style={inputStyle()}
          />
        </Field>

        {/* Schedule + frequency */}
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Publish at" help="UTC. Leave blank to publish immediately on the next transition.">
            <input
              type="datetime-local"
              name="publishAt"
              defaultValue={dtLocal(a.publishAt)}
              disabled={!canWrite}
              className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
              style={inputStyle()}
            />
          </Field>
          <Field label="Expires at" help="Stops surfacing after this time without flipping to ARCHIVED.">
            <input
              type="datetime-local"
              name="expireAt"
              defaultValue={dtLocal(a.expireAt)}
              disabled={!canWrite}
              className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
              style={inputStyle()}
            />
          </Field>
          <Field label="Frequency cap">
            <Select name="frequencyCap" defaultValue={a.frequencyCap} disabled={!canWrite}>
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>
              ))}
            </Select>
          </Field>
        </div>

        {/* Changelog meta */}
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Changelog category" help="Used when CHANGELOG is in the channel set.">
            <Select name="changelogCategory" defaultValue={a.changelogCategory ?? ""} disabled={!canWrite}>
              <option value="">— None —</option>
              {CHANGELOG_CATEGORIES.map((c) => (
                <option key={c} value={c}>{CHANGELOG_CATEGORY_LABEL[c]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Tags" help="Comma-separated. Use 'template' to surface in the Templates tab.">
            <input
              name="tags"
              defaultValue={a.tags.join(", ")}
              disabled={!canWrite}
              className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
              style={inputStyle()}
            />
          </Field>
        </div>

        <DeferredNote>
          <strong>Deferred:</strong> A/B traffic split, recurring schedules, per-channel overrides,
          push-notification opt-out enforcement, RSS feed for the public changelog.
        </DeferredNote>

        {canWrite && (
          <div className="flex items-center justify-end gap-2">
            <button
              type="submit"
              className="ts-focus rounded-md px-4 py-2 text-[12px] font-semibold"
              style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
            >
              Save changes
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

function StatusActions({
  id, current, canWrite,
}: {
  id: string;
  current: AnnouncementStatus;
  canWrite: boolean;
}) {
  if (!canWrite) {
    return (
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        You don&apos;t have permission to change announcement status.
      </p>
    );
  }
  const allowed: AnnouncementStatus[] = (() => {
    switch (current) {
      case "DRAFT":     return ["SCHEDULED", "PUBLISHED", "ARCHIVED"];
      case "SCHEDULED": return ["DRAFT", "PUBLISHED", "ARCHIVED"];
      case "PUBLISHED": return ["DRAFT", "ARCHIVED"];
      case "ARCHIVED":  return ["DRAFT"];
    }
  })();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {allowed.map((to) => (
        <form key={to} action={transitionOpsAnnouncement}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="to" value={to} />
          <button
            type="submit"
            className="ts-focus rounded-md px-3 py-1.5 text-[11px] font-semibold"
            style={transitionButtonStyle(to)}
          >
            {transitionLabel(to)}
          </button>
        </form>
      ))}
    </div>
  );
}

function transitionLabel(to: AnnouncementStatus): string {
  switch (to) {
    case "DRAFT":     return "← Back to draft";
    case "SCHEDULED": return "Schedule";
    case "PUBLISHED": return "Publish now";
    case "ARCHIVED":  return "Archive";
  }
}

function transitionButtonStyle(to: AnnouncementStatus): React.CSSProperties {
  switch (to) {
    case "PUBLISHED": return { background: "var(--accent-primary)", color: "var(--accent-fg)" };
    case "SCHEDULED": return { background: "var(--warning-surface)", color: "var(--warning-fg)", border: "1px solid var(--amber-200, var(--border-default))" };
    case "ARCHIVED":  return { background: "var(--surface-1)", color: "var(--danger-fg)", border: "1px solid var(--rose-200, var(--border-default))" };
    case "DRAFT":     return { background: "var(--surface-1)", color: "var(--text-default)", border: "1px solid var(--border-default)" };
  }
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
