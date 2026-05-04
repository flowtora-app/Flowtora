import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { Card, CardHeader } from "@/components/Card";
import { TextArea, SelectField, Button, Checkbox } from "@/components/Field";
import { slaChip, slaChipStyle, formatDuration } from "@/lib/support-sla";
import {
  replyToSupportTicketAsStaff,
  updateSupportTicketAsStaff,
} from "@/app/actions/platform";
import { CannedReplyPicker } from "./CannedReplyPicker";
import { AiSuggestionsPicker } from "./AiSuggestionsPicker";
import { suggestRepliesForTicket } from "@/server/platform/support-tickets";

// Phase 17 Slice D — platform-side ticket detail. Mirrors the tenant view
// but with staff-only controls (assignment, priority, status) in a side
// panel. Support agents can reply; only admins can reassign / escalate.

const STATUS_OPTIONS = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "WAITING_CUSTOMER", label: "Waiting on customer" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
];

const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

const REPLY_STATUS_OPTIONS = [
  { value: "",                  label: "Keep status as-is" },
  { value: "IN_PROGRESS",       label: "Mark in progress" },
  { value: "WAITING_CUSTOMER",  label: "Mark waiting on customer" },
  { value: "RESOLVED",          label: "Reply and resolve" },
];

export default async function PlatformSupportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requirePlatformStaff();

  const ticket = await db.supportTicket.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!ticket) notFound();

  // Resolve tenant, authors, the list of platform users available as
  // assignees, and the active canned-reply library. Parallel to keep the
  // page snappy.
  const authorIds = Array.from(
    new Set(ticket.messages.map((m) => m.authorId).filter((x): x is string => Boolean(x))),
  );
  const [tenant, authors, platformUsers, cannedAll, aiSuggestions] = await Promise.all([
    db.tenant.findUnique({
      where: { id: ticket.tenantId },
      select: { id: true, name: true, slug: true, plan: true, status: true },
    }),
    authorIds.length
      ? db.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, email: true, name: true, platformRole: true },
        })
      : Promise.resolve([] as { id: string; email: string; name: string | null; platformRole: string | null }[]),
    db.user.findMany({
      where: { platformRole: { not: null } },
      select: { id: true, email: true, name: true, platformRole: true },
    }),
    db.supportCannedReply.findMany({
      where: { archivedAt: null },
      orderBy: { title: "asc" },
      select: { id: true, title: true, body: true, category: true },
    }),
    suggestRepliesForTicket(ticket.id, 3),
  ]);
  const authorById = new Map(authors.map((a) => [a.id, a]));

  // Filter canned replies to those that match the ticket category (and any
  // "any category" templates, i.e. category === null). We keep the order.
  const cannedForTicket = cannedAll.filter(
    (c) => c.category === null || c.category === ticket.category,
  );

  const reply = replyToSupportTicketAsStaff.bind(null, ticket.id);
  const update = updateSupportTicketAsStaff.bind(null, ticket.id);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs" style={{ color: "var(--muted)" }}>
          <Link href="/platform/support" className="underline">Support queue</Link> /
          {tenant ? (
            <> <Link href={`/platform/tenants/${tenant.id}`} className="underline">{tenant.name}</Link></>
          ) : (
            " deleted tenant"
          )}
          {" / "}
          {ticket.id.slice(0, 8)}
        </div>
        <div className="mt-1 flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold">{ticket.subject}</h1>
          {(() => {
            const chip = slaChip({
              dueBy: ticket.dueBy,
              status: ticket.status,
              firstStaffReplyAt: ticket.firstStaffReplyAt,
            });
            if (!chip) return null;
            const s = slaChipStyle(chip.tone);
            return (
              <span
                className="rounded-full px-2 py-0.5 text-xs"
                style={{ color: s.color, border: `1px solid ${s.border}` }}
              >
                SLA · {chip.label}
              </span>
            );
          })()}
        </div>
        <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
          {ticket.category.replace(/_/g, " ")} · priority {ticket.priority.toLowerCase()} · status {ticket.status.replace(/_/g, " ").toLowerCase()}
          {ticket.firstStaffReplyAt && (
            <>
              {" · "}first response in{" "}
              {formatDuration(ticket.firstStaffReplyAt.getTime() - ticket.createdAt.getTime())}
            </>
          )}
          {ticket.satisfactionRating && (
            <>
              {" · "}rated{" "}
              <span style={{ color: ticket.satisfactionRating >= 4 ? "#7dd688" : ticket.satisfactionRating <= 2 ? "#ff8b8b" : "#ffc98b" }}>
                {ticket.satisfactionRating}/5
              </span>
              {ticket.satisfactionComment && ` · "${ticket.satisfactionComment.slice(0, 80)}${ticket.satisfactionComment.length > 80 ? "…" : ""}"`}
            </>
          )}
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

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-3">
          {ticket.messages.map((m) => {
            const author = m.authorId ? authorById.get(m.authorId) : null;
            const label = m.isStaff ? (author?.name ?? author?.email ?? "platform") : (author?.name ?? author?.email ?? "tenant user");
            const bg     = m.internal ? "#3a2f15" : m.isStaff ? "#15263a" : "var(--panel)";
            const border = m.internal ? "#5b4920" : m.isStaff ? "#2a4a7a" : "var(--border)";
            const nameFg = m.internal ? "#ffc98b" : m.isStaff ? "#8bb9ff" : "var(--text)";
            return (
              <div
                key={m.id}
                className="rounded-md px-4 py-3 text-sm"
                style={{ background: bg, border: `1px solid ${border}` }}
              >
                <div className="flex items-center justify-between text-xs" style={{ color: "var(--muted)" }}>
                  <span className="font-medium" style={{ color: nameFg }}>
                    {label}
                    {m.isStaff && !m.internal && <span style={{ opacity: 0.7 }}> · platform</span>}
                    {m.internal && (
                      <span
                        className="ml-2 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide"
                        style={{ border: "1px solid #5b4920", color: "#ffc98b" }}
                      >
                        internal note · staff only
                      </span>
                    )}
                  </span>
                  <span>{m.createdAt.toISOString().replace("T", " ").slice(0, 16)}</span>
                </div>
                <div className="mt-2 whitespace-pre-wrap">{m.body}</div>
              </div>
            );
          })}

          <Card>
            <CardHeader title="Reply as platform" />
            <form action={reply} className="space-y-3 px-5 py-4">
              <AiSuggestionsPicker
                suggestions={aiSuggestions}
                bodyTextareaName="body"
              />
              <CannedReplyPicker
                templates={cannedForTicket.map((c) => ({
                  id: c.id, title: c.title, body: c.body, category: c.category,
                }))}
                tenantName={tenant?.name ?? ""}
                ticketSubject={ticket.subject}
                bodyTextareaName="body"
              />
              <TextArea label="Message" name="body" rows={6} required maxLength={8000} />
              <SelectField
                label="After replying"
                name="nextStatus"
                options={REPLY_STATUS_OPTIONS}
                defaultValue=""
              />
              <div className="flex items-center justify-between gap-3">
                <Checkbox
                  label="Post as internal note (staff only — not sent to tenant)"
                  name="internal"
                />
                <Button type="submit">Send reply</Button>
              </div>
            </form>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader title="Tenant" />
            {tenant ? (
              <div className="space-y-1 px-5 py-4 text-sm">
                <Link href={`/platform/tenants/${tenant.id}`} className="font-medium underline">
                  {tenant.name}
                </Link>
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  {tenant.slug} · {tenant.plan} · {tenant.status}
                </div>
                <Link
                  href={`/t/${tenant.slug}/dashboard`}
                  className="mt-2 inline-block text-xs underline"
                  style={{ color: "var(--muted)" }}
                >
                  Open workspace (silent)
                </Link>
              </div>
            ) : (
              <p className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>
                Tenant was deleted.
              </p>
            )}
          </Card>

          <Card>
            <CardHeader title="Triage" />
            <form action={update} className="space-y-3 px-5 py-4">
              <SelectField
                label="Status"
                name="status"
                options={STATUS_OPTIONS}
                defaultValue={ticket.status}
                disabled={!ctx.canWrite}
              />
              <SelectField
                label="Priority"
                name="priority"
                options={PRIORITY_OPTIONS}
                defaultValue={ticket.priority}
                disabled={!ctx.canWrite}
              />
              <SelectField
                label="Assigned to"
                name="assignedTo"
                options={[
                  { value: "", label: "— unassigned —" },
                  ...platformUsers.map((u) => ({ value: u.id, label: `${u.name ?? u.email} (${u.platformRole})` })),
                ]}
                defaultValue={ticket.assignedTo ?? ""}
                disabled={!ctx.canWrite}
              />
              <Button type="submit" disabled={!ctx.canWrite}>
                {ctx.canWrite ? "Save triage" : "Admin only"}
              </Button>
            </form>
          </Card>
        </aside>
      </div>
    </div>
  );
}
