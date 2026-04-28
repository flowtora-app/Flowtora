import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { TextArea, Button } from "@/components/Field";
import {
  replyToSupportTicket,
  closeSupportTicketAsTenant,
  rateSupportTicket,
} from "@/app/actions/support";

// /t/[slug]/support/[id] — tenant ticket detail (transformation rewrite).
//
// Conversation thread + reply box + rating widget when resolved. Internal
// staff notes are filtered out at the query level so a rendering bug
// can never accidentally show them to the tenant.
//
// Polish-only rewrite: same data, same actions, new tokens / structure.

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

export default async function TenantSupportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await requireTenant(slug);

  const ticket = await db.supportTicket.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      messages: {
        where:   { internal: false },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!ticket) notFound();

  const authorIds = Array.from(
    new Set(ticket.messages.map((m) => m.authorId).filter((x): x is string => Boolean(x))),
  );
  const authors = authorIds.length
    ? await db.user.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, email: true, name: true },
      })
    : [];
  const authorById = new Map(authors.map((a) => [a.id, a]));

  const status = STATUS_TONE[ticket.status] ?? { bg: "var(--surface-2)", fg: "var(--text-muted)", label: ticket.status };
  const prio   = PRIORITY_TONE[ticket.priority] ?? "var(--border-default)";
  const isActive = ticket.status !== "CLOSED";
  const canRate  = ticket.status === "RESOLVED" || ticket.status === "CLOSED";

  const reply = replyToSupportTicket.bind(null, slug, ticket.id);
  const close = closeSupportTicketAsTenant.bind(null, slug, ticket.id);
  const rate  = rateSupportTicket.bind(null, slug, ticket.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* ── Header ────────────────────────────────────────── */}
      <div>
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          <Link href={`/t/${slug}/support`} className="hover:underline">
            Support
          </Link>
          <span className="mx-1.5">/</span>
          <span className="font-mono">#{ticket.id.slice(0, 8)}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <h1
            className="flex items-center gap-3 text-2xl font-semibold tracking-tight"
            style={{ color: "var(--text-default)" }}
          >
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: prio }}
              title={`Priority: ${ticket.priority}`}
            />
            {ticket.subject}
          </h1>
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide"
            style={{ background: status.bg, color: status.fg, border: `1px solid ${status.fg}` }}
          >
            {status.label}
          </span>
        </div>
        <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
          {ticket.category.replace(/_/g, " ").toLowerCase()} ·
          {" "}priority {ticket.priority.toLowerCase()} ·
          {" "}opened {ticket.createdAt.toISOString().slice(0, 10)}
        </div>
      </div>

      {sp.error && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "var(--danger-surface)",
            color: "var(--danger-fg)",
            border: "1px solid var(--danger-fg)",
          }}
        >
          <div className="font-semibold">Action failed</div>
          <div className="mt-0.5 text-xs" style={{ opacity: 0.85 }}>
            {decodeURIComponent(sp.error)}
          </div>
        </div>
      )}

      {/* ── Thread ────────────────────────────────────────── */}
      <div className="space-y-3">
        {ticket.messages.map((m) => {
          const author = m.authorId ? authorById.get(m.authorId) : null;
          const label = m.isStaff ? "Flowtora Support" : author?.name ?? author?.email ?? "you";
          return (
            <div
              key={m.id}
              className="rounded-lg px-4 py-3 text-sm"
              style={{
                background: m.isStaff ? "var(--accent-surface)" : "var(--surface-1)",
                border: `1px solid ${m.isStaff ? "var(--accent-primary)" : "var(--border-subtle)"}`,
              }}
            >
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span
                  className="font-semibold"
                  style={{ color: m.isStaff ? "var(--accent-primary)" : "var(--text-default)" }}
                >
                  {label}
                </span>
                <span style={{ color: "var(--text-muted)" }}>
                  {m.createdAt.toISOString().replace("T", " ").slice(0, 16)}
                </span>
              </div>
              <div
                className="mt-2 whitespace-pre-wrap"
                style={{ color: "var(--text-default)" }}
              >
                {m.body}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Reply / close ─────────────────────────────────── */}
      {isActive ? (
        <Section title="Reply" description="Add detail, answer a follow-up, or share an update.">
          <form action={reply} className="space-y-3">
            <TextArea
              label="Message"
              name="body"
              rows={6}
              required
              maxLength={8000}
              placeholder="Type your reply…"
            />
            <div className="flex items-center justify-between gap-3">
              <form action={close}>
                <button
                  type="submit"
                  className="ts-focus text-xs underline"
                  style={{ color: "var(--text-muted)" }}
                >
                  Close ticket
                </button>
              </form>
              <Button type="submit">Send reply</Button>
            </div>
          </form>
        </Section>
      ) : (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          This ticket is closed.{" "}
          <Link href={`/t/${slug}/support/new`} className="underline" style={{ color: "var(--accent-primary)" }}>
            Open a new one
          </Link>{" "}
          if you need more help.
        </div>
      )}

      {/* ── Rate ──────────────────────────────────────────── */}
      {canRate && (
        <Section
          title={ticket.satisfactionRating ? "Thanks for the rating" : "How did we do?"}
          description={
            ticket.satisfactionRating
              ? `You rated this ${ticket.satisfactionRating}/5. Want to update? Just resubmit.`
              : "A quick rating helps us improve."
          }
        >
          <form action={rate} className="space-y-3">
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="flex items-center gap-1 text-sm" style={{ color: "var(--text-default)" }}>
                  <input
                    type="radio"
                    name="rating"
                    value={n}
                    required
                    defaultChecked={ticket.satisfactionRating === n}
                  />
                  {n}
                </label>
              ))}
              <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>
                1 = poor · 5 = excellent
              </span>
            </div>
            <TextArea
              label="Anything to add? (optional)"
              name="comment"
              rows={3}
              maxLength={2000}
              defaultValue={ticket.satisfactionComment ?? ""}
            />
            <div className="flex justify-end">
              <Button type="submit">
                {ticket.satisfactionRating ? "Update rating" : "Submit rating"}
              </Button>
            </div>
          </form>
        </Section>
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
