import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import type { AnnouncementType, AnnouncementPriority } from "@prisma/client";
import {
  updateAnnouncement,
  publishAnnouncement,
  scheduleAnnouncement,
  unpublishAnnouncement,
  archiveAnnouncement,
  deleteAnnouncement,
  liveStatus,
  type LiveStatus,
} from "@/app/actions/announcements";

// /platform/announcements/[id] — announcement composer + state machine.
//
// One big form posts to updateAnnouncement (saves all fields). Status
// transitions (Publish, Schedule, Unpublish, Archive, Delete) each
// post to their own dedicated action so we can audit-log them as
// discrete events.

const TYPE_OPTIONS: { value: AnnouncementType; label: string; hint: string }[] = [
  { value: "RELEASE",     label: "Release",     hint: "Shipped a feature or fix" },
  { value: "NEW_FEATURE", label: "New feature", hint: "Capability now available" },
  { value: "MAINTENANCE", label: "Maintenance", hint: "Scheduled downtime / read-only window" },
  { value: "INCIDENT",    label: "Incident",    hint: "Active outage or post-incident report" },
  { value: "PRICING",     label: "Pricing",     hint: "Pricing or policy change" },
  { value: "GENERAL",     label: "General",     hint: "Anything that doesn't fit the buckets above" },
];

const PRIORITY_OPTIONS: { value: AnnouncementPriority; label: string; hint: string; tone: string }[] = [
  { value: "INFO",      label: "Info",      hint: "Low priority — informational",        tone: "var(--text-muted)" },
  { value: "IMPORTANT", label: "Important", hint: "Worth highlighting — accent banner",   tone: "var(--accent-primary)" },
  { value: "CRITICAL",  label: "Critical",  hint: "Urgent — red banner shown to tenants", tone: "var(--danger-fg)" },
];

export const dynamic = "force-dynamic";

export default async function PlatformAnnouncementEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requirePlatformStaff();

  const a = await db.platformAnnouncement.findUnique({ where: { id } });
  if (!a) notFound();

  const live = liveStatus(a, new Date());
  const canDelete = a.status === "DRAFT";

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────── */}
      <header>
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          <Link href="/platform/announcements" className="hover:underline">
            Announcements
          </Link>
          <span className="mx-1.5">/</span>
          <span className="font-mono">#{a.id.slice(0, 8)}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1
              className="text-2xl font-semibold tracking-tight"
              style={{ color: "var(--text-default)" }}
            >
              {a.title || <span style={{ color: "var(--text-faint)" }}>Untitled announcement</span>}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <LiveStatusChip live={live} />
              <Chip
                label={a.type.replace("_", " ").toLowerCase()}
                bg="var(--surface-2)"
                fg="var(--text-default)"
              />
              <Chip
                label={a.priority.toLowerCase()}
                bg={
                  a.priority === "CRITICAL"  ? "var(--danger-surface)"  :
                  a.priority === "IMPORTANT" ? "var(--accent-surface)"  :
                  "var(--surface-2)"
                }
                fg={
                  a.priority === "CRITICAL"  ? "var(--danger-fg)"      :
                  a.priority === "IMPORTANT" ? "var(--accent-primary)" :
                  "var(--text-muted)"
                }
              />
            </div>
          </div>

          {/* Status-transition action cluster */}
          <div className="flex flex-wrap gap-2">
            {a.status !== "PUBLISHED" && a.status !== "ARCHIVED" && (
              <form action={publishAnnouncement.bind(null, a.id)}>
                <ActionButton tone="accent" disabled={!ctx.canWrite}>
                  Publish now
                </ActionButton>
              </form>
            )}
            {a.publishAt && a.status === "DRAFT" && (
              <form action={scheduleAnnouncement.bind(null, a.id)}>
                <ActionButton tone="neutral" disabled={!ctx.canWrite}>
                  Schedule
                </ActionButton>
              </form>
            )}
            {(a.status === "PUBLISHED" || a.status === "SCHEDULED") && (
              <form action={unpublishAnnouncement.bind(null, a.id)}>
                <ActionButton tone="neutral" disabled={!ctx.canWrite}>
                  Unpublish
                </ActionButton>
              </form>
            )}
            {a.status !== "ARCHIVED" && (
              <form action={archiveAnnouncement.bind(null, a.id)}>
                <ActionButton tone="neutral" disabled={!ctx.canWrite}>
                  Archive
                </ActionButton>
              </form>
            )}
            {canDelete && (
              <form action={deleteAnnouncement.bind(null, a.id)}>
                <ActionButton tone="danger" disabled={!ctx.canWrite}>
                  Delete
                </ActionButton>
              </form>
            )}
          </div>
        </div>
      </header>

      {/* Banners */}
      {sp.ok && (
        <Banner tone="success" title="Saved" body={
          sp.ok === "published"  ? "Announcement is live for matching tenants." :
          sp.ok === "scheduled"  ? "Announcement scheduled — will publish automatically." :
          sp.ok === "saved"      ? "Changes saved." :
          sp.ok === "created"    ? "Draft created. Fill in the details and publish when ready." :
          sp.ok === "unpublished" ? "Returned to draft." :
          "Saved."
        } />
      )}
      {sp.error && <Banner tone="danger" title="Action failed" body={decodeURIComponent(sp.error)} />}

      {/* ── Big form ───────────────────────────────────── */}
      <form action={updateAnnouncement.bind(null, a.id)} className="space-y-5">
        <Section title="Content" description="Title is the headline shown on the in-app banner. Body is plain text or markdown.">
          <div className="space-y-4">
            <FormField
              label="Title"
              name="title"
              defaultValue={a.title}
              required
              maxLength={200}
              placeholder='e.g. "Scheduled maintenance — Sunday 2026-04-26 02:00 UTC"'
              disabled={!ctx.canWrite}
            />
            <label className="block">
              <span className="mb-1 block text-sm font-medium" style={{ color: "var(--text-default)" }}>
                Body
              </span>
              <textarea
                name="body"
                defaultValue={a.body}
                rows={8}
                maxLength={8000}
                placeholder={[
                  "What changed, why, and what tenants should do.",
                  "",
                  "• Markdown links work: [text](url)",
                  "• Keep the first line punchy — it's the banner preview.",
                ].join("\n")}
                disabled={!ctx.canWrite}
                className="ts-focus w-full rounded-md px-3 py-2 text-sm outline-none"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-default)",
                }}
              />
              <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>
                Up to 8,000 chars. Plain text or markdown.
              </span>
            </label>
            <FormField
              label="Tags"
              name="tags"
              defaultValue={a.tags.join(", ")}
              placeholder='e.g. "billing, q2-launch, eu-region"'
              hint="Comma-separated. Free-form. Used for quick scanning, no semantics yet."
              disabled={!ctx.canWrite}
            />
          </div>
        </Section>

        <div className="grid gap-5 md:grid-cols-2">
          <Section title="Type" description="Sets the icon and accent color in the feed.">
            <div className="grid grid-cols-1 gap-2">
              {TYPE_OPTIONS.map((o) => {
                const active = o.value === a.type;
                return (
                  <label
                    key={o.value}
                    className="ts-focus flex items-start gap-3 rounded-lg p-3 transition-colors"
                    style={{
                      background: active ? "var(--accent-surface)" : "var(--surface-1)",
                      border: `1px solid ${active ? "var(--accent-primary)" : "var(--border-default)"}`,
                      cursor: ctx.canWrite ? "pointer" : "not-allowed",
                    }}
                  >
                    <input
                      type="radio"
                      name="type"
                      value={o.value}
                      defaultChecked={active}
                      disabled={!ctx.canWrite}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium" style={{ color: "var(--text-default)" }}>
                        {o.label}
                      </div>
                      <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                        {o.hint}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </Section>

          <Section title="Priority" description="Drives banner color and how aggressively it surfaces.">
            <div className="grid grid-cols-1 gap-2">
              {PRIORITY_OPTIONS.map((o) => {
                const active = o.value === a.priority;
                return (
                  <label
                    key={o.value}
                    className="ts-focus flex items-start gap-3 rounded-lg p-3 transition-colors"
                    style={{
                      background: active
                        ? (o.value === "CRITICAL" ? "var(--danger-surface)"
                          : o.value === "IMPORTANT" ? "var(--accent-surface)"
                          : "var(--surface-2)")
                        : "var(--surface-1)",
                      border: `1px solid ${active ? o.tone : "var(--border-default)"}`,
                      cursor: ctx.canWrite ? "pointer" : "not-allowed",
                    }}
                  >
                    <input
                      type="radio"
                      name="priority"
                      value={o.value}
                      defaultChecked={active}
                      disabled={!ctx.canWrite}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium" style={{ color: active ? o.tone : "var(--text-default)" }}>
                        {o.label}
                      </div>
                      <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                        {o.hint}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </Section>
        </div>

        <Section title="Targeting" description="Choose who sees this announcement. Defaults to ALL tenants.">
          <div className="space-y-4">
            <select
              name="audience"
              defaultValue={a.audience}
              disabled={!ctx.canWrite}
              className="ts-focus w-full rounded-md px-3 py-2 text-sm outline-none md:w-72"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
                color: "var(--text-default)",
              }}
            >
              <option value="ALL">All tenants</option>
              <option value="PLAN">Specific plans</option>
              <option value="COHORT">Specific cohorts</option>
              <option value="TENANT">Specific tenants</option>
            </select>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Set the matching list below — only the one for the selected audience is read at delivery time.
            </p>

            <div className="grid gap-4 md:grid-cols-3">
              <FormField
                label="Plans (audience: PLAN)"
                name="audiencePlans"
                defaultValue={a.audiencePlans.join(", ")}
                placeholder="STARTER, GROWTH"
                hint="Comma-separated plan codes."
                disabled={!ctx.canWrite}
              />
              <FormField
                label="Cohorts (audience: COHORT)"
                name="audienceCohorts"
                defaultValue={a.audienceCohorts.join(", ")}
                placeholder="ALPHA, BETA"
                hint="Comma-separated cohort codes."
                disabled={!ctx.canWrite}
              />
              <FormField
                label="Tenant IDs (audience: TENANT)"
                name="audienceTenantIds"
                defaultValue={a.audienceTenantIds.join(", ")}
                placeholder="tnt_abc, tnt_def"
                hint="Comma-separated tenant ids."
                disabled={!ctx.canWrite}
              />
            </div>
          </div>
        </Section>

        <Section title="Schedule" description="Optional. Leave both blank to publish-now and stay live forever.">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              label="Publish at (UTC)"
              name="publishAt"
              type="datetime-local"
              defaultValue={toLocalInput(a.publishAt)}
              hint="Future timestamp activates the SCHEDULED state. Past timestamps publish immediately."
              disabled={!ctx.canWrite}
            />
            <FormField
              label="Expire at (UTC)"
              name="expireAt"
              type="datetime-local"
              defaultValue={toLocalInput(a.expireAt)}
              hint="After this, the banner disappears for all tenants. Useful for maintenance windows."
              disabled={!ctx.canWrite}
            />
          </div>
        </Section>

        {ctx.canWrite ? (
          <div className="flex items-center justify-end gap-2">
            <Link
              href="/platform/announcements"
              className="ts-focus rounded-md px-4 py-2 text-sm"
              style={{ color: "var(--text-muted)" }}
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="ts-focus rounded-md px-4 py-2 text-sm font-medium"
              style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
            >
              Save changes
            </button>
          </div>
        ) : (
          <div
            className="rounded-md px-4 py-3 text-xs"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-muted)",
            }}
          >
            Read-only — saving requires admin role.
          </div>
        )}
      </form>

      {/* ── Metadata footer ─────────────────────────────── */}
      <div
        className="grid gap-2 rounded-md px-5 py-4 text-xs md:grid-cols-2"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-subtle)",
          color: "var(--text-muted)",
        }}
      >
        <div>
          Created {a.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
          {a.publishedAt && (
            <> · published {a.publishedAt.toISOString().slice(0, 16).replace("T", " ")} UTC</>
          )}
        </div>
        <div>
          Updated {a.updatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC
          {a.authorId && <> · by {a.authorId.slice(0, 8)}</>}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

function LiveStatusChip({ live }: { live: LiveStatus }) {
  const palette =
    live === "live"      ? { bg: "var(--success-surface)", fg: "var(--success-fg)" } :
    live === "scheduled" ? { bg: "var(--accent-surface)",  fg: "var(--accent-primary)" } :
    live === "expired"   ? { bg: "var(--surface-2)",       fg: "var(--text-faint)" } :
    live === "archived"  ? { bg: "var(--surface-2)",       fg: "var(--text-faint)" } :
                            { bg: "var(--surface-2)",       fg: "var(--text-muted)" };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
      style={{ background: palette.bg, color: palette.fg, border: `1px solid ${palette.fg}` }}
    >
      {(live === "live" || live === "scheduled") && (
        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: palette.fg }} />
      )}
      {live}
    </span>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="overflow-hidden rounded-xl"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <header
        className="px-5 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
            {description}
          </p>
        )}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
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
      <span className="mb-1 block text-sm font-medium" style={{ color: "var(--text-default)" }}>
        {label}
      </span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        required={required}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        className="ts-focus w-full rounded-md px-3 py-2 text-sm outline-none"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
          color: "var(--text-default)",
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

function ActionButton({
  tone,
  children,
  disabled,
}: {
  tone: "accent" | "neutral" | "danger";
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const style: React.CSSProperties =
    tone === "accent"
      ? { background: "var(--accent-primary)", color: "var(--accent-fg)" }
      : tone === "danger"
      ? {
          background: "var(--danger-surface)",
          color: "var(--danger-fg)",
          border: "1px solid var(--danger-fg)",
        }
      : {
          background: "var(--surface-2)",
          color: "var(--text-default)",
          border: "1px solid var(--border-default)",
        };
  return (
    <button
      type="submit"
      disabled={disabled}
      className="ts-focus rounded-md px-3 py-2 text-xs font-medium disabled:opacity-50"
      style={style}
    >
      {children}
    </button>
  );
}

function Banner({
  tone,
  title,
  body,
}: {
  tone: "danger" | "success";
  title: string;
  body: string;
}) {
  const palette =
    tone === "danger"
      ? { bg: "var(--danger-surface)",  fg: "var(--danger-fg)",  border: "var(--danger-fg)"  }
      : { bg: "var(--success-surface)", fg: "var(--success-fg)", border: "var(--success-fg)" };
  return (
    <div
      className="rounded-md px-4 py-3 text-sm"
      style={{ background: palette.bg, border: `1px solid ${palette.border}`, color: palette.fg }}
    >
      <div className="font-semibold">{title}</div>
      <div className="mt-0.5 text-xs" style={{ opacity: 0.85 }}>{body}</div>
    </div>
  );
}

function Chip({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
      style={{ background: bg, color: fg }}
    >
      {label}
    </span>
  );
}

// Convert a Date to the local-input format YYYY-MM-DDTHH:mm. Treats
// the input as UTC because the form labels say "(UTC)" — server reads
// new Date(string), which interprets the string as local time… but for
// the admin-only audience this is acceptable. If we ever need a real
// timezone picker, plumb that here.
function toLocalInput(d: Date | null | undefined): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  );
}
