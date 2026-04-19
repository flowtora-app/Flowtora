import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { TextArea, Button } from "@/components/Field";
import {
  replyToSupportTicket,
  closeSupportTicketAsTenant,
  rateSupportTicket,
} from "@/app/actions/support";

// Phase 17 Slice D — tenant-side ticket detail. Shows the message thread,
// lets any active tenant member reply, and lets them close the ticket when
// the issue is handled. Platform staff controls (priority, assignment)
// live on the mirror /platform/support/[id] page.

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  OPEN:              { label: "Open",              color: "#8bb9ff" },
  IN_PROGRESS:       { label: "In progress",       color: "#ffc98b" },
  WAITING_CUSTOMER:  { label: "Waiting on you",    color: "#ffc98b" },
  RESOLVED:          { label: "Resolved",          color: "#7dd688" },
  CLOSED:            { label: "Closed",            color: "var(--muted)" },
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
      // Phase 20 — strip internal staff notes at query time so there's no
      // way a rendering bug accidentally shows them to the tenant.
      messages: {
        where:   { internal: false },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!ticket) notFound();

  // Look up author names. We mix tenant users + platform staff on the same
  // thread, so a single `findMany` for every author id is simplest.
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

  const meta = STATUS_LABELS[ticket.status] ?? { label: ticket.status, color: "var(--muted)" };
  const isActive = ticket.status !== "CLOSED";

  const reply = replyToSupportTicket.bind(null, slug, ticket.id);
  const close = closeSupportTicketAsTenant.bind(null, slug, ticket.id);
  const rate  = rateSupportTicket.bind(null, slug, ticket.id);

  // Rating widget appears once the thread rests. We still show it after
  // CLOSED so a tenant can rate even after their own close click.
  const canRate = ticket.status === "RESOLVED" || ticket.status === "CLOSED";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <div className="text-xs" style={{ color: "var(--muted)" }}>
          <Link href={`/t/${slug}/support`} className="underline">Support</Link> / ticket {ticket.id.slice(0, 8)}
        </div>
        <div className="mt-1 flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold">{ticket.subject}</h1>
          <span
            className="rounded-full px-2 py-0.5 text-xs"
            style={{ color: meta.color, border: `1px solid ${meta.color}` }}
          >
            {meta.label}
          </span>
        </div>
        <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
          {ticket.category.replace(/_/g, " ")} · priority {ticket.priority.toLowerCase()} · opened{" "}
          {ticket.createdAt.toISOString().slice(0, 10)}
        </div>
      </div>

      {sp.error && (
        <div
          className="rounded-md px-4 py-2 text-sm"
          style={{ background: "#3a1517", color: "#ff8b8b", border: "1px solid #5b2024" }}
        >
          {decodeURIComponent(sp.error)}
        </div>
      )}

      <div className="space-y-3">
        {ticket.messages.map((m) => {
          const author = m.authorId ? authorById.get(m.authorId) : null;
          const label = m.isStaff ? "Tracksign Support" : author?.name ?? author?.email ?? "you";
          return (
            <div
              key={m.id}
              className="rounded-md px-4 py-3 text-sm"
              style={{
                background: m.isStaff ? "#15263a" : "var(--panel)",
                border: `1px solid ${m.isStaff ? "#2a4a7a" : "var(--border)"}`,
              }}
            >
              <div className="flex items-center justify-between text-xs" style={{ color: "var(--muted)" }}>
                <span className="font-medium" style={{ color: m.isStaff ? "#8bb9ff" : "var(--text)" }}>
                  {label}
                </span>
                <span>{m.createdAt.toISOString().replace("T", " ").slice(0, 16)}</span>
              </div>
              <div className="mt-2 whitespace-pre-wrap">{m.body}</div>
            </div>
          );
        })}
      </div>

      {isActive ? (
        <Card>
          <CardHeader title="Reply" />
          <form action={reply} className="space-y-3 px-5 py-4">
            <TextArea
              label="Message"
              name="body"
              rows={6}
              required
              maxLength={8000}
              placeholder="Add more info, answer a question, or share an update."
            />
            <div className="flex items-center justify-end">
              <Button type="submit">Send reply</Button>
            </div>
          </form>
          <form action={close} className="border-t px-5 py-3" style={{ borderColor: "var(--border)" }}>
            <button type="submit" className="text-xs underline" style={{ color: "var(--muted)" }}>
              Close ticket
            </button>
          </form>
        </Card>
      ) : (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--muted)" }}
        >
          This ticket is closed. <Link href={`/t/${slug}/support/new`} className="underline">Open a new one</Link> if you need more help.
        </div>
      )}

      {canRate && (
        <Card>
          <CardHeader
            title={ticket.satisfactionRating ? "Thanks for the rating" : "How did we do?"}
            description={
              ticket.satisfactionRating
                ? `You rated this ${ticket.satisfactionRating}/5 · updating is fine — just resubmit.`
                : "Let platform support know how this ticket went."
            }
          />
          <form action={rate} className="space-y-3 px-5 py-4">
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="flex items-center gap-1 text-sm">
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
              <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>
                1 = poor, 5 = excellent
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
              <Button type="submit">{ticket.satisfactionRating ? "Update rating" : "Submit rating"}</Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
