import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import type { FeedbackKind, FeedbackStatus } from "@prisma/client";
import { changeFeedbackStatus, saveFeedbackInternalNotes } from "@/app/actions/feedback";

// /platform/feedback/[id] — feedback detail.
//
// Sections:
//   1. Header (breadcrumb, summary, chips, vote count)
//   2. Banners (error / ok)
//   3. Original submission card (body + tenant + submitter + context)
//   4. Status & roadmap card (admin status changer + resolution note)
//   5. Internal notes (admin-only, never shown to tenant)
//   6. Recent voters (top voters' tenants for context)

export const dynamic = "force-dynamic";

const STATUS_OPTIONS: { value: FeedbackStatus; label: string }[] = [
  { value: "NEW",          label: "New (default)" },
  { value: "UNDER_REVIEW", label: "Under review — looking at it" },
  { value: "PLANNED",      label: "Planned — committed to roadmap" },
  { value: "IN_PROGRESS",  label: "In progress — being built" },
  { value: "SHIPPED",      label: "Shipped — done" },
  { value: "REJECTED",     label: "Rejected — won't do" },
];

const STATUS_TONE: Record<FeedbackStatus, { bg: string; fg: string; label: string }> = {
  NEW:          { bg: "var(--surface-2)",       fg: "var(--text-muted)",     label: "New" },
  UNDER_REVIEW: { bg: "var(--accent-surface)",  fg: "var(--accent-primary)", label: "Under review" },
  PLANNED:      { bg: "var(--accent-surface)",  fg: "var(--accent-primary)", label: "Planned" },
  IN_PROGRESS:  { bg: "var(--warning-surface)", fg: "var(--warning-fg)",     label: "In progress" },
  SHIPPED:      { bg: "var(--success-surface)", fg: "var(--success-fg)",     label: "Shipped" },
  REJECTED:     { bg: "var(--surface-2)",       fg: "var(--text-faint)",     label: "Rejected" },
};

const KIND_TONE: Record<FeedbackKind, { bg: string; fg: string; icon: string; label: string }> = {
  IDEA:   { bg: "var(--accent-surface)",  fg: "var(--accent-primary)", icon: "💡", label: "Idea" },
  BUG:    { bg: "var(--danger-surface)",  fg: "var(--danger-fg)",      icon: "🐞", label: "Bug" },
  PRAISE: { bg: "var(--success-surface)", fg: "var(--success-fg)",     icon: "🙌", label: "Praise" },
  OTHER:  { bg: "var(--surface-2)",       fg: "var(--text-muted)",     icon: "•",  label: "Other" },
};

export default async function PlatformFeedbackDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requirePlatformStaff();

  const feedback = await db.feedback.findUnique({
    where: { id },
    include: {
      votes: {
        orderBy: { createdAt: "desc" },
        take: 12,
      },
    },
  });
  if (!feedback) notFound();

  const [tenant, submitter, voterUsers, voterTenants, similar] = await Promise.all([
    db.tenant.findUnique({
      where:  { id: feedback.tenantId },
      select: { id: true, name: true, slug: true, plan: true },
    }),
    db.user.findUnique({
      where:  { id: feedback.userId },
      select: { id: true, email: true, name: true },
    }),
    feedback.votes.length
      ? db.user.findMany({
          where:  { id: { in: feedback.votes.map((v) => v.userId) } },
          select: { id: true, email: true, name: true },
        })
      : Promise.resolve([] as { id: string; email: string; name: string | null }[]),
    feedback.votes.length
      ? db.tenant.findMany({
          where:  { id: { in: Array.from(new Set(feedback.votes.map((v) => v.tenantId))) } },
          select: { id: true, name: true, slug: true },
        })
      : Promise.resolve([] as { id: string; name: string; slug: string }[]),
    // Similar feedback by kind, ordered by recency. Cheap heuristic for
    // "you might want to dedupe these".
    db.feedback.findMany({
      where: {
        id:   { not: feedback.id },
        kind: feedback.kind,
      },
      orderBy: [{ voteCount: "desc" }, { createdAt: "desc" }],
      take: 5,
      select: {
        id: true,
        summary: true,
        status: true,
        voteCount: true,
        kind: true,
      },
    }),
  ]);
  const voterUserById = new Map(voterUsers.map((u) => [u.id, u]));
  const voterTenantById = new Map(voterTenants.map((t) => [t.id, t]));

  const statusTone = STATUS_TONE[feedback.status];
  const kindTone   = KIND_TONE[feedback.kind];

  return (
    <div className="space-y-6">
      {/* ── Header ───────────────────────────────────────── */}
      <header>
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          <Link href="/platform/feedback" className="hover:underline">
            Feedback hub
          </Link>
          <span className="mx-1.5">/</span>
          <span className="font-mono">#{feedback.id.slice(0, 8)}</span>
        </div>
        <div className="mt-1 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1
              className="text-2xl font-semibold tracking-tight"
              style={{ color: "var(--text-default)" }}
            >
              {feedback.summary}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Chip {...statusTone} />
              <Chip bg={kindTone.bg} fg={kindTone.fg} label={`${kindTone.icon} ${kindTone.label}`} />
              {typeof feedback.rating === "number" && (
                <Chip
                  bg="var(--warning-surface)"
                  fg="var(--warning-fg)"
                  label={`${"★".repeat(feedback.rating)}${"☆".repeat(5 - feedback.rating)}`}
                  title={`Rated ${feedback.rating}/5 by submitter`}
                />
              )}
              {feedback.shippedAt && (
                <Chip
                  bg="var(--success-surface)"
                  fg="var(--success-fg)"
                  label={`shipped ${feedback.shippedAt.toISOString().slice(0, 10)}`}
                  title="Date the feature was marked shipped"
                />
              )}
            </div>
          </div>
          <VoteBadge count={feedback.voteCount} />
        </div>
      </header>

      {/* ── Banners ──────────────────────────────────────── */}
      {sp.error && (
        <Banner tone="danger" title="Action failed" body={decodeURIComponent(sp.error)} />
      )}
      {sp.ok && (
        <Banner tone="success" title="Saved" body="Changes saved." />
      )}

      {/* ── Submission card ──────────────────────────────── */}
      <Section
        title="Original submission"
        description={`Submitted by ${submitter?.name ?? submitter?.email ?? "unknown user"} on ${feedback.createdAt.toISOString().slice(0, 10)}`}
        right={
          tenant && (
            <Link
              href={`/platform/tenants/${tenant.id}`}
              className="ts-focus rounded-md px-2.5 py-1 text-xs font-medium"
              style={{
                background: "var(--surface-1)",
                color: "var(--text-default)",
                border: "1px solid var(--border-default)",
              }}
            >
              {tenant.name} ({tenant.plan}) →
            </Link>
          )
        }
      >
        {feedback.body ? (
          <div className="whitespace-pre-wrap text-sm" style={{ color: "var(--text-default)" }}>
            {feedback.body}
          </div>
        ) : (
          <p className="text-sm italic" style={{ color: "var(--text-muted)" }}>
            (No body — only a one-line summary was provided.)
          </p>
        )}
        {feedback.context && (
          <div
            className="mt-3 rounded-md px-3 py-2 text-xs"
            style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
          >
            <b style={{ color: "var(--text-default)" }}>From page:</b>{" "}
            <span className="font-mono">{feedback.context}</span>
          </div>
        )}
      </Section>

      {/* ── Status & roadmap ─────────────────────────────── */}
      <Section
        title="Status & roadmap"
        description="Move this through the pipeline. Resolution note is shown to the submitter on SHIPPED or REJECTED."
      >
        <form action={changeFeedbackStatus.bind(null, feedback.id)} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium" style={{ color: "var(--text-default)" }}>
              Status
            </span>
            <select
              name="status"
              defaultValue={feedback.status}
              disabled={!ctx.canWrite}
              className="ts-focus w-full rounded-md px-3 py-2 text-sm outline-none"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
                color: "var(--text-default)",
              }}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium" style={{ color: "var(--text-default)" }}>
              Resolution note (public — shown to submitter)
            </span>
            <textarea
              name="resolutionNote"
              defaultValue={feedback.resolutionNote ?? ""}
              rows={4}
              maxLength={2000}
              disabled={!ctx.canWrite}
              placeholder='e.g. "Shipped in the 2026-04-22 release — bulk update is now live in /customers"'
              className="ts-focus w-full rounded-md px-3 py-2 text-sm outline-none"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
                color: "var(--text-default)",
              }}
            />
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              Only displays once status is SHIPPED or REJECTED. Empty for other statuses.
            </p>
          </label>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!ctx.canWrite}
              className="ts-focus rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
              style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
            >
              {ctx.canWrite ? "Save status" : "Requires admin role"}
            </button>
          </div>
        </form>
      </Section>

      {/* ── Internal notes ───────────────────────────────── */}
      <Section
        title="Internal notes"
        description="Admin-only. Tenants never see this. Use for triage hand-offs, PM context, or 'why we said no'."
      >
        <form action={saveFeedbackInternalNotes.bind(null, feedback.id)} className="space-y-3">
          <textarea
            name="internalNotes"
            defaultValue={feedback.internalNotes ?? ""}
            rows={5}
            maxLength={4000}
            disabled={!ctx.canWrite}
            placeholder="Free-form notes for the platform team."
            className="ts-focus w-full rounded-md px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
              color: "var(--text-default)",
            }}
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!ctx.canWrite}
              className="ts-focus rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
              style={{
                background: "var(--surface-2)",
                color: "var(--text-default)",
                border: "1px solid var(--border-default)",
              }}
            >
              {ctx.canWrite ? "Save notes" : "Requires admin role"}
            </button>
          </div>
        </form>
      </Section>

      {/* ── Voters ─────────────────────────────────────────── */}
      {feedback.votes.length > 0 && (
        <Section
          title={`Voters (${feedback.voteCount})`}
          description="Most recent upvotes. Click a tenant to drill into their context."
        >
          <ul className="grid gap-2 md:grid-cols-2">
            {feedback.votes.map((v) => {
              const u = voterUserById.get(v.userId);
              const t = voterTenantById.get(v.tenantId);
              return (
                <li
                  key={v.id}
                  className="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm"
                  style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
                >
                  <div className="min-w-0">
                    <div
                      className="truncate text-xs font-medium"
                      style={{ color: "var(--text-default)" }}
                    >
                      {u?.name ?? u?.email ?? "unknown user"}
                    </div>
                    <div className="mt-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {t ? (
                        <Link href={`/platform/tenants/${t.id}`} className="underline">
                          {t.name}
                        </Link>
                      ) : "unknown tenant"}
                      {" · "}
                      {v.createdAt.toISOString().slice(0, 10)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {/* ── Similar feedback ───────────────────────────────── */}
      {similar.length > 0 && (
        <Section
          title="Similar feedback"
          description={`Other ${KIND_TONE[feedback.kind].label.toLowerCase()}s. Worth checking before you respond — there may be duplicates.`}
        >
          <ul className="space-y-2">
            {similar.map((s) => {
              const sTone = STATUS_TONE[s.status];
              return (
                <li key={s.id}>
                  <Link
                    href={`/platform/feedback/${s.id}`}
                    className="flex items-start gap-3 rounded-md px-3 py-2 transition-colors hover:bg-[var(--surface-2)]"
                  >
                    <span
                      className="inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
                      style={{
                        background: s.voteCount > 0 ? "var(--accent-surface)" : "var(--surface-2)",
                        color:      s.voteCount > 0 ? "var(--accent-primary)" : "var(--text-muted)",
                      }}
                    >
                      ↑ {s.voteCount}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-sm font-medium"
                        style={{ color: "var(--text-default)" }}
                      >
                        {s.summary}
                      </span>
                    </span>
                    <span
                      className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{ background: sTone.bg, color: sTone.fg }}
                    >
                      {sTone.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

function VoteBadge({ count }: { count: number }) {
  return (
    <div
      className="flex shrink-0 flex-col items-center justify-center rounded-xl px-4 py-3"
      style={{
        background: count > 0 ? "var(--accent-surface)" : "var(--surface-2)",
        border: `1px solid ${count > 0 ? "var(--accent-primary)" : "var(--border-default)"}`,
        minWidth: "72px",
      }}
    >
      <span
        className="text-xs leading-none"
        aria-hidden
        style={{ color: count > 0 ? "var(--accent-primary)" : "var(--text-muted)" }}
      >
        ↑
      </span>
      <span
        className="mt-1 text-xl font-semibold tabular-nums"
        style={{ color: count > 0 ? "var(--accent-primary)" : "var(--text-default)" }}
      >
        {count}
      </span>
      <span
        className="mt-0.5 text-[10px] uppercase tracking-wide"
        style={{ color: "var(--text-muted)" }}
      >
        votes
      </span>
    </div>
  );
}

function Section({
  title,
  description,
  right,
  children,
}: {
  title: string;
  description?: string;
  right?: React.ReactNode;
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
        className="flex items-start justify-between gap-3 px-5 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              {description}
            </p>
          )}
        </div>
        {right}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Chip({
  bg,
  fg,
  label,
  title,
}: {
  bg: string;
  fg: string;
  label: string;
  title?: string;
}) {
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
      style={{ background: bg, color: fg, border: `1px solid ${fg}` }}
      title={title}
    >
      {label}
    </span>
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
