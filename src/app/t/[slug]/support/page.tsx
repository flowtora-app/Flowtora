import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";

// /t/[slug]/support — tenant support dashboard (transformation rewrite).
//
// Layout:
//   1. Header with "+ New ticket" + "Report an issue" CTAs
//   2. KPI mini-band — open / waiting on you / resolved this month / total
//   3. Active tickets card (Open / In progress / Waiting on you)
//   4. History (Resolved / Closed) — collapsed-feeling, smaller
//   5. Help resources card (FAQs, docs, contact)
//
// All queries are tenant-scoped. The /t/[slug]/support/new page handles
// ticket creation; /t/[slug]/support/[id] is the detail thread.

const STATUS_TONE: Record<string, { bg: string; fg: string; label: string }> = {
  OPEN:             { bg: "var(--accent-surface)",  fg: "var(--accent-primary)", label: "Open" },
  IN_PROGRESS:      { bg: "var(--warning-surface)", fg: "var(--warning-fg)",     label: "In progress" },
  WAITING_CUSTOMER: { bg: "var(--warning-surface)", fg: "var(--warning-fg)",     label: "Waiting on you" },
  RESOLVED:         { bg: "var(--success-surface)", fg: "var(--success-fg)",     label: "Resolved" },
  CLOSED:           { bg: "var(--surface-2)",       fg: "var(--text-muted)",     label: "Closed" },
};

const PRIORITY_TONE: Record<string, string> = {
  URGENT: "var(--danger-fg)",
  HIGH:   "var(--warning-fg)",
  NORMAL: "var(--accent-primary)",
  LOW:    "var(--border-default)",
};

const DAY_MS = 86_400_000;

export default async function TenantSupportListPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireTenant(slug);

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [tickets, byStatus, resolvedThisMonth] = await Promise.all([
    db.supportTicket.findMany({
      where: { tenantId: ctx.tenant.id },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 200,
      include: { _count: { select: { messages: true } } },
    }),
    db.supportTicket.groupBy({
      by: ["status"],
      where: { tenantId: ctx.tenant.id },
      _count: { _all: true },
    }),
    db.supportTicket.count({
      where: {
        tenantId: ctx.tenant.id,
        status: "RESOLVED",
        resolvedAt: { gte: monthStart },
      },
    }),
  ]);

  const counts = Object.fromEntries(byStatus.map((c) => [c.status, c._count._all])) as Record<string, number>;
  const openCount    = (counts.OPEN ?? 0) + (counts.IN_PROGRESS ?? 0) + (counts.WAITING_CUSTOMER ?? 0);
  const waitingOnYou = counts.WAITING_CUSTOMER ?? 0;
  const totalCount   = tickets.length;

  const active = tickets.filter((t) => t.status !== "CLOSED" && t.status !== "RESOLVED");
  const recentDone = tickets.filter((t) => t.status === "CLOSED" || t.status === "RESOLVED").slice(0, 8);

  const now = new Date();

  return (
    <div className="space-y-6">
      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-default)" }}>
            Support
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Need a hand? Open a ticket — the Flowtora team replies here, and you'll get an in-app
            and email notification when we do.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/t/${slug}/support/new?kind=BUG`}
            className="ts-focus rounded-md px-3 py-2 text-sm font-medium"
            style={{
              background: "var(--surface-1)",
              color: "var(--text-default)",
              border: "1px solid var(--border-default)",
            }}
          >
            🐞 Report an issue
          </Link>
          <Link
            href={`/t/${slug}/support/new`}
            className="ts-focus rounded-md px-4 py-2 text-sm font-medium"
            style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
          >
            + New ticket
          </Link>
        </div>
      </div>

      {/* ── KPI band ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Active"
          value={openCount.toString()}
          hint={openCount === 0 ? "No open tickets" : "Currently being worked on"}
          tone={openCount > 0 ? "accent" : "default"}
        />
        <Stat
          label="Waiting on you"
          value={waitingOnYou.toString()}
          hint={waitingOnYou === 0 ? "Nothing to reply to" : "We need more info to continue"}
          tone={waitingOnYou > 0 ? "warning" : "default"}
        />
        <Stat
          label="Resolved this month"
          value={resolvedThisMonth.toString()}
          hint={resolvedThisMonth === 0 ? "—" : "Issues closed in current month"}
          tone="success"
        />
        <Stat
          label="All time"
          value={totalCount.toString()}
          hint={totalCount === 0 ? "No history yet" : "Tickets ever opened"}
          tone="default"
        />
      </div>

      {/* ── Active tickets ────────────────────────────────── */}
      <Section title="Active" description="Open tickets and ones we're working on right now.">
        {active.length === 0 ? (
          <EmptyState
            title="Nothing open right now."
            body="When you open a ticket it'll show here until it's resolved."
            ctaHref={`/t/${slug}/support/new`}
            ctaLabel="Open your first ticket"
          />
        ) : (
          <ul className="-mx-5 -my-5">
            {active.map((t, idx) => (
              <TicketRow
                key={t.id}
                slug={slug}
                t={t}
                isFirst={idx === 0}
                now={now}
              />
            ))}
          </ul>
        )}
      </Section>

      {/* ── Recent history ────────────────────────────────── */}
      {recentDone.length > 0 && (
        <Section
          title="Recently resolved"
          description="Closed tickets — for the record. Open a new one if anything regresses."
        >
          <ul className="-mx-5 -my-5">
            {recentDone.map((t, idx) => (
              <TicketRow
                key={t.id}
                slug={slug}
                t={t}
                isFirst={idx === 0}
                now={now}
                muted
              />
            ))}
          </ul>
        </Section>
      )}

      {/* ── Help resources ────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2">
        <ResourceCard
          icon="📚"
          title="Help center"
          body="Step-by-step guides for everyday workflows — quotes, install scheduling, billing."
          href="https://flowtora.com/help"
          external
          ctaLabel="Browse help"
        />
        <ResourceCard
          icon="✉"
          title="Talk to a human"
          body="Our team replies during business hours. Urgent issues get bumped to the front of the queue."
          href={`/t/${slug}/support/new?kind=QUESTION`}
          ctaLabel="Open a ticket"
        />
      </div>

      <p className="text-xs" style={{ color: "var(--text-faint)" }}>
        Tip: hit <kbd
          className="rounded px-1.5 py-0.5 font-mono"
          style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}
        >⌘ + Shift + H</kbd>{" "}
        anywhere in the app to open the help menu.
      </p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// PIECES
// ────────────────────────────────────────────────────────────────

function TicketRow({
  slug,
  t,
  isFirst,
  now,
  muted,
}: {
  slug: string;
  t: {
    id: string;
    subject: string;
    status: string;
    priority: string;
    category: string;
    updatedAt: Date;
    _count: { messages: number };
  };
  isFirst: boolean;
  now: Date;
  muted?: boolean;
}) {
  const status = STATUS_TONE[t.status] ?? { bg: "var(--surface-2)", fg: "var(--text-muted)", label: t.status };
  const prio = PRIORITY_TONE[t.priority] ?? "var(--border-default)";
  const isWaitingOnYou = t.status === "WAITING_CUSTOMER";
  return (
    <li
      style={{ borderTop: isFirst ? "none" : "1px solid var(--border-subtle)" }}
    >
      <Link
        href={`/t/${slug}/support/${t.id}`}
        className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:opacity-95"
        style={{ color: "var(--text-default)", opacity: muted ? 0.85 : 1 }}
      >
        <span
          aria-hidden
          className="mt-2 inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ background: prio }}
          title={`Priority: ${t.priority}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: status.bg, color: status.fg, border: `1px solid ${status.fg}` }}
            >
              {status.label}
            </span>
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {t.category.replace(/_/g, " ").toLowerCase()}
            </span>
            {isWaitingOnYou && (
              <span
                className="text-[11px] font-medium"
                style={{ color: "var(--warning-fg)" }}
              >
                · please reply
              </span>
            )}
          </div>
          <div className="mt-1 truncate font-semibold">{t.subject}</div>
          <div className="mt-0.5 truncate text-xs" style={{ color: "var(--text-muted)" }}>
            #{t.id.slice(0, 8)} · {t._count.messages} message{t._count.messages === 1 ? "" : "s"} ·{" "}
            updated {relative(t.updatedAt, now)}
          </div>
        </div>
        <span className="shrink-0 text-xs" style={{ color: "var(--text-muted)" }}>
          →
        </span>
      </Link>
    </li>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: "default" | "accent" | "success" | "warning";
}) {
  const palette =
    tone === "accent"  ? { bg: "var(--accent-surface)",  border: "var(--accent-primary)", label: "var(--accent-primary)" } :
    tone === "success" ? { bg: "var(--success-surface)", border: "var(--success-fg)",     label: "var(--success-fg)"     } :
    tone === "warning" ? { bg: "var(--warning-surface)", border: "var(--warning-fg)",     label: "var(--warning-fg)"     } :
                          { bg: "var(--surface-1)",       border: "var(--border-subtle)",  label: "var(--text-muted)"     };
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        className="text-xs font-medium uppercase tracking-wide"
        style={{ color: palette.label }}
      >
        {label}
      </div>
      <div
        className="mt-2 text-2xl font-semibold tabular-nums tracking-tight"
        style={{ color: "var(--text-default)" }}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{hint}</div>
      )}
    </div>
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

function EmptyState({
  title,
  body,
  ctaHref,
  ctaLabel,
}: {
  title: string;
  body: string;
  ctaHref: string;
  ctaLabel: string;
}) {
  return (
    <div className="text-center">
      <div className="mb-1 text-2xl" aria-hidden>📬</div>
      <div className="font-medium" style={{ color: "var(--text-default)" }}>{title}</div>
      <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{body}</div>
      <Link
        href={ctaHref}
        className="ts-focus mt-3 inline-block rounded-md px-3 py-1.5 text-xs font-medium"
        style={{
          background: "var(--accent-primary)",
          color: "var(--accent-fg)",
        }}
      >
        {ctaLabel}
      </Link>
    </div>
  );
}

function ResourceCard({
  icon,
  title,
  body,
  href,
  ctaLabel,
  external,
}: {
  icon: string;
  title: string;
  body: string;
  href: string;
  ctaLabel: string;
  external?: boolean;
}) {
  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden>{icon}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
            {title}
          </h3>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            {body}
          </p>
        </div>
      </div>
      <div className="mt-4">
        {external ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="ts-focus text-xs font-semibold underline"
            style={{ color: "var(--accent-primary)" }}
          >
            {ctaLabel} ↗
          </a>
        ) : (
          <Link
            href={href}
            className="ts-focus text-xs font-semibold underline"
            style={{ color: "var(--accent-primary)" }}
          >
            {ctaLabel} →
          </Link>
        )}
      </div>
    </div>
  );
}

function relative(d: Date, now: Date): string {
  const mins = Math.round((now.getTime() - d.getTime()) / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}
