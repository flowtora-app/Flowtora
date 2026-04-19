import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { Button, Field, SelectField, TextArea } from "@/components/Field";
import { FilesCard } from "@/components/FilesCard";
import { CommentThread } from "@/components/CommentThread";
import { ActivityTimeline } from "@/components/ui/ActivityTimeline";
import { stageColor, stageLabel, lostReasonLabel } from "@/lib/crm";
import { statusColor, statusLabel } from "@/lib/quotes";
import { statusColor as orderStatusColor, statusLabel as orderStatusLabel } from "@/lib/orders";
import { statusColor as invoiceStatusColor, statusLabel as invoiceStatusLabel } from "@/lib/invoices";
import { formatMoney, formatDateTime, formatDate, humanize, relativeDays } from "@/lib/format";
import { memberLookup, listActiveMembers } from "@/lib/members";
import {
  addContact, deleteContact,
  addInteraction,
  changeStage,
  createTask, toggleTask, deleteTask,
  deleteCustomer,
} from "@/app/actions/customers";
import { issuePortalToken, revokePortalToken, deletePortalToken } from "@/app/actions/portal-tokens";
import { isPortalTokenActive, portalTokenStatusLabel, portalPath } from "@/lib/portal";
import { SendMessageWidget } from "@/components/SendMessageWidget";
import { CustomerCommsTimeline } from "@/components/CustomerCommsTimeline";
import { loadSendContext } from "@/app/actions/message-templates";
import { replyToPortalMessage, markPortalMessagesRead } from "@/app/actions/portal-messages";
import { computeOpportunityHealth } from "@/lib/opportunity-health";
import { loadHealthBundle } from "@/lib/opportunity-health-loader";
import { computeNextAction } from "@/lib/next-action";
import { HealthBadge } from "@/components/crm/HealthBadge";
import { OpportunityHealthCard } from "@/components/crm/OpportunityHealthCard";
import { NextActionPanel } from "@/components/crm/NextActionPanel";
import { StageChangeCard } from "@/components/crm/StageChangeCard";
import { TagEditor } from "@/components/crm/TagEditor";
import { loadTenantTags } from "@/lib/customer-tags";

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { id } = await params;
  const c = await db.customer.findUnique({
    where:  { id },
    select: { name: true },
  });
  return { title: c?.name ?? "Customer" };
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const ctx = await requirePermission(slug, "customers:view");
  const customer = await db.customer.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      interactions: { orderBy: { occurredAt: "desc" }, take: 50 },
      tasks: { orderBy: [{ completedAt: "asc" }, { dueDate: "asc" }] },
      quotes: { orderBy: { updatedAt: "desc" }, take: 20 },
      orders: { orderBy: { updatedAt: "desc" }, take: 20 },
      invoices: { orderBy: { updatedAt: "desc" }, take: 20 },
      files: { orderBy: { createdAt: "desc" } },
      portalTokens: { orderBy: { createdAt: "desc" } },
      // Phase 14 — internal comment thread. Include deleted rows so the UI
      // can render "(removed)" tombstones rather than silently dropping them.
      comments: { orderBy: { createdAt: "asc" }, take: 200 },
    },
  });
  if (!customer) notFound();
  ctx.assertBranchAccess(customer.locationId);

  const [members, memberMap, sendCtx, tagSuggestions, portalMessages, emailEvents] = await Promise.all([
    listActiveMembers(ctx.tenant.id),
    memberLookup(ctx.tenant.id),
    loadSendContext(ctx.tenant.id, ctx.tenant.currency, {
      customerId: customer.id,
      senderUserId: ctx.userId,
    }),
    loadTenantTags(ctx.tenant.id),
    db.portalMessage.findMany({
      where: { tenantId: ctx.tenant.id, customerId: customer.id, archivedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, direction: true, subject: true, body: true, createdAt: true, readAt: true,
        sender: { select: { name: true } },
      },
    }),
    // Phase 16 — automated outbound emails (branded templates + webhooks)
    // feed the unified communication history timeline. Cap at 100 to keep
    // the page quick for long-tenured customers.
    db.emailEvent.findMany({
      where: { tenantId: ctx.tenant.id, customerId: customer.id },
      orderBy: { sentAt: "desc" },
      take: 100,
      select: {
        id: true, kind: true, direction: true, subject: true, bodyPreview: true,
        toAddress: true, sentAt: true, openedAt: true, clickedAt: true,
        failedAt: true, failReason: true,
        senderUserId: true,
      },
    }),
  ]);

  // Resolve sender userIds on email events to name/email pairs in a single
  // batch rather than N+1 lookups per row.
  const emailSenderIds = Array.from(new Set(emailEvents.map((e) => e.senderUserId).filter((x): x is string => Boolean(x))));
  const emailSenders = emailSenderIds.length
    ? await db.user.findMany({
        where: { id: { in: emailSenderIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const emailSenderById = new Map(emailSenders.map((u) => [u.id, { name: u.name, email: u.email }]));
  const emailEventsForTimeline = emailEvents.map((e) => ({
    ...e,
    sender: e.senderUserId ? emailSenderById.get(e.senderUserId) ?? null : null,
  }));

  // Member id → display name for the timeline interaction rows.
  const memberNameById = new Map<string, string>(
    members.map((m) => [m.userId, m.name ?? m.email ?? "Staff"]),
  );

  const unreadPortalMessages = portalMessages.filter(
    (m) => m.direction === "INBOUND" && !m.readAt,
  ).length;

  const canEdit = ctx.can("customers:edit");
  const canDelete = ctx.can("customers:delete");
  const canQuote = ctx.can("quotes:manage");
  const canInvoice = ctx.can("invoices:manage");
  const canUploadFiles = ctx.can("files:upload");

  // Phase 7 — opportunity health + next action.
  //
  // We already loaded interactions/tasks/quotes above, so in principle
  // we could compute the health inputs inline without an extra trip.
  // But `loadHealthBundle` batches four targeted aggregate queries and
  // keeps the per-row cost identical whether we score 1 customer or
  // 100 — using it here keeps one code path across list/kanban/detail
  // and avoids subtle drift if the rules evolve.
  const healthBundle = await loadHealthBundle(ctx.tenant.id, [customer]);
  const healthInput = healthBundle.get(customer.id);
  const healthReport = healthInput
    ? computeOpportunityHealth(healthInput)
    : null;

  // Latest sent quote — used by the next-action engine to decide
  // whether to nudge ("you sent this 7d ago, no reply").
  const latestSentQuote = customer.quotes.find(
    (q) => q.status === "SENT" || q.status === "VIEWED" || q.status === "APPROVED",
  );
  const overdueTaskCount = customer.tasks.filter(
    (t) => !t.completedAt && t.dueDate && t.dueDate.getTime() < Date.now(),
  ).length;

  const nextAction = healthReport
    ? computeNextAction({
        stage: customer.stage,
        lastTouchAt: healthInput?.lastTouchAt ?? null,
        openQuoteStatus: healthInput?.openQuoteStatus ?? null,
        latestQuoteSentAt: latestSentQuote?.sentAt ?? null,
        overdueTaskCount,
        hasAnyInteraction: customer.interactions.length > 0,
        customerName: customer.name,
        health: healthReport,
      })
    : null;
  // Hide the panel outright for closed stages — there's no useful
  // "next action" for a won or lost deal beyond the canonical ones
  // the engine returns, and leaving the panel up adds visual noise.
  const showNextAction =
    nextAction && customer.stage !== "WON" && customer.stage !== "LOST";

  const stageAction = changeStage.bind(null, slug);
  const contactAction = addContact.bind(null, slug);
  const interactionAction = addInteraction.bind(null, slug);
  const taskAction = createTask.bind(null, slug);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{customer.name}</h1>
            <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: stageColor(customer.stage), color: "white" }}>
              {stageLabel(customer.stage)}
            </span>
            {healthReport && (
              <HealthBadge
                tier={healthReport.tier}
                score={healthReport.score}
                atRisk={healthReport.atRisk}
              />
            )}
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            {humanize(customer.kind)} · {humanize(customer.status)}
            {customer.ownerId && memberMap.get(customer.ownerId) && (
              <> · owner {memberMap.get(customer.ownerId)!.name}</>
            )}
            {customer.source && <> · source {customer.source}</>}
          </p>
          {customer.stage === "LOST" && customer.lostReason && (
            <p
              className="mt-2 inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-xs"
              style={{
                background: "var(--danger-surface)",
                color: "var(--danger-fg)",
              }}
            >
              <span aria-hidden>⊘</span>
              <span>
                <strong>Lost reason:</strong>{" "}
                {lostReasonLabel(customer.lostReason) ?? customer.lostReason}
              </span>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {canQuote && (
            <Link href={`/t/${slug}/quotes/new?customerId=${customer.id}`}>
              <Button type="button">New quote</Button>
            </Link>
          )}
          <Link href={`/t/${slug}/customers/${customer.id}/timeline`}>
            <Button type="button" variant="secondary">Timeline</Button>
          </Link>
          {canEdit && (
            <Link href={`/t/${slug}/customers/${customer.id}/edit`}>
              <Button type="button" variant="secondary">Edit</Button>
            </Link>
          )}
          {canDelete && (
            <form action={deleteCustomer.bind(null, slug, customer.id)}>
              <Button type="submit" variant="danger">Delete</Button>
            </form>
          )}
        </div>
      </div>

      {/* Phase 7 — "Next action" card. Prominent, above-the-fold
          guidance on the single highest-leverage next step. */}
      {showNextAction && nextAction && (
        <NextActionPanel
          slug={slug}
          customerId={customer.id}
          action={nextAction}
          canEdit={canEdit}
        />
      )}

      {/* Phase 7 — guided stage conversion. Adapts the form to the
          picked stage: canonical lost reasons for LOST, quote-required
          guard for WON, reactivation prompt for LOST → active. */}
      {canEdit && (
        <StageChangeCard
          slug={slug}
          customerId={customer.id}
          currentStage={customer.stage}
          hasAnyQuote={customer.quotes.length > 0}
          existingLostReason={customer.lostReason}
          action={stageAction}
        />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: profile + addresses */}
        <div className="space-y-4 lg:col-span-1">
          <Card>
            <CardHeader title="Contact" />
            <dl className="grid grid-cols-1 gap-y-2 px-5 py-4 text-sm">
              <Row label="Email" value={customer.email} />
              <Row label="Phone" value={customer.phone} />
              <Row label="Website" value={customer.website} />
              <Row label="Estimated value" value={formatMoney(customer.estimatedValue?.toString() ?? null, ctx.tenant.currency)} />
              <Row label="Close probability" value={customer.closeProbability != null ? `${customer.closeProbability}%` : null} />
            </dl>
            {/* Phase 7 — inline tag editor. Suggestions come from the
                tenant-wide tag catalogue so reps stay consistent. */}
            <div
              className="space-y-2 px-5 py-4"
              style={{ borderTop: "1px solid var(--border-subtle)" }}
            >
              <div
                className="text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-faint)" }}
              >
                Tags
              </div>
              <TagEditor
                slug={slug}
                customerId={customer.id}
                tags={customer.tags}
                suggestions={tagSuggestions}
                canEdit={canEdit}
              />
            </div>
          </Card>

          {/* Phase 7 — transparent health breakdown. Each reason is a
              plain-English string from the engine, so a rep can see
              exactly why the score is what it is — no hidden weights. */}
          {healthReport && <OpportunityHealthCard report={healthReport} />}

          <Card>
            <CardHeader title="Billing address" />
            <Address
              line1={customer.billingAddressLine1}
              line2={customer.billingAddressLine2}
              city={customer.billingCity}
              region={customer.billingRegion}
              postal={customer.billingPostalCode}
              country={customer.billingCountry}
            />
          </Card>

          <Card>
            <CardHeader title="Install address" />
            <Address
              line1={customer.installAddressLine1}
              line2={customer.installAddressLine2}
              city={customer.installCity}
              region={customer.installRegion}
              postal={customer.installPostalCode}
              country={customer.installCountry}
            />
          </Card>

          {customer.notes && (
            <Card>
              <CardHeader title="Notes" />
              <p className="whitespace-pre-wrap px-5 py-4 text-sm">{customer.notes}</p>
            </Card>
          )}

          {/* Portal links — let customers view their records without a login. */}
          <Card>
            <CardHeader
              title="Customer portal"
              description="Token-based links for the customer"
            />
            <ul>
              {customer.portalTokens.length === 0 && (
                <li className="px-5 py-4 text-xs" style={{ color: "var(--muted)" }}>
                  No portal links yet.
                </li>
              )}
              {customer.portalTokens.map((t) => {
                const active = isPortalTokenActive(t);
                const base = process.env.APP_URL ?? "";
                const url = `${base}${portalPath(t.token)}`;
                const revoke = revokePortalToken.bind(null, slug, t.id);
                const del = deletePortalToken.bind(null, slug, t.id);
                return (
                  <li
                    key={t.id}
                    className="space-y-2 px-5 py-3"
                    style={{ borderTop: "1px solid var(--border)" }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{t.label ?? "Portal link"}</span>
                        <span
                          className="rounded-full px-2 py-0.5 text-xs"
                          style={{
                            background: active ? "#10b981" : "#6b7280",
                            color: "white",
                          }}
                        >
                          {portalTokenStatusLabel(t)}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        {active && canEdit && (
                          <form action={revoke}>
                            <button type="submit" className="text-xs underline" style={{ color: "#ff6b6b" }}>
                              Revoke
                            </button>
                          </form>
                        )}
                        {canEdit && (
                          <form action={del}>
                            <button type="submit" className="text-xs underline" style={{ color: "var(--muted)" }}>
                              Delete
                            </button>
                          </form>
                        )}
                      </div>
                    </div>
                    <div className="text-xs" style={{ color: "var(--muted)" }}>
                      {t.expiresAt ? <>Expires {formatDate(t.expiresAt)}</> : <>No expiry</>}
                      {t.lastUsedAt && <> · Last used {formatDate(t.lastUsedAt)}</>}
                    </div>
                    <input
                      readOnly
                      className="w-full rounded-md bg-transparent px-2 py-1 text-xs"
                      style={{ border: "1px solid var(--border)", color: "var(--muted)" }}
                      defaultValue={url}
                    />
                  </li>
                );
              })}
            </ul>
            {canEdit && (
              <form
                action={issuePortalToken.bind(null, slug)}
                className="space-y-3 px-5 py-4"
                style={{ borderTop: "1px solid var(--border)" }}
              >
                <input type="hidden" name="customerId" value={customer.id} />
                <Field label="Label (optional)" name="label" placeholder="e.g. Jane @ ACME" />
                <Field label="Expires (optional)" name="expiresAt" type="date" />
                <Button type="submit" variant="secondary">Issue new portal link</Button>
              </form>
            )}
          </Card>
        </div>

        {/* Right: contacts, activity, tasks */}
        <div className="space-y-4 lg:col-span-2">
          {/* Contacts */}
          <Card>
            <CardHeader title="Contacts" description={`${customer.contacts.length} on file`} />
            <ul>
              {customer.contacts.map((c) => {
                const remove = deleteContact.bind(null, slug, c.id);
                return (
                  <li key={c.id} className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                    <div>
                      <div className="text-sm">
                        {c.firstName} {c.lastName ?? ""}
                        {c.isPrimary && <span className="ml-2 rounded-full px-2 py-0.5 text-xs" style={{ background: "var(--accent)", color: "white" }}>Primary</span>}
                      </div>
                      <div className="text-xs" style={{ color: "var(--muted)" }}>
                        {[c.title, c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                    {canEdit && (
                      <form action={remove}>
                        <button type="submit" className="text-xs underline" style={{ color: "#ff6b6b" }}>Remove</button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
            {canEdit && (
              <form action={contactAction} className="space-y-3 px-5 py-4" style={{ borderTop: "1px solid var(--border)" }}>
                <input type="hidden" name="customerId" value={customer.id} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="First name" name="firstName" required />
                  <Field label="Last name" name="lastName" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Title" name="title" />
                  <Field label="Email" name="email" type="email" />
                  <Field label="Phone" name="phone" />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isPrimary" /> Primary contact
                </label>
                <Button type="submit" variant="secondary">Add contact</Button>
              </form>
            )}
          </Card>

          {/* Unified communication history — merges automated emails, portal
              messages, and logged interactions into a single timeline. The
              "Activity" card below keeps the quick-log form and raw list. */}
          <CustomerCommsTimeline
            customerName={customer.name}
            emailEvents={emailEventsForTimeline}
            portalMessages={portalMessages}
            interactions={customer.interactions}
            memberNameById={memberNameById}
          />

          {/* Activity */}
          <Card>
            <CardHeader title="Log activity" description="Quick-log a call, meeting, or note." />
            <ul>
              {customer.interactions.length === 0 && (
                <li className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>No activity yet.</li>
              )}
              {customer.interactions.slice(0, 5).map((it) => (
                <li key={it.id} className="px-5 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>
                    {humanize(it.type)} · {formatDateTime(it.occurredAt)} · {memberMap.get(it.userId)?.name ?? "—"}
                  </div>
                  {it.subject && <div className="mt-0.5 text-sm font-medium">{it.subject}</div>}
                  {it.body && <div className="mt-0.5 whitespace-pre-wrap text-sm">{it.body}</div>}
                </li>
              ))}
            </ul>
            {canEdit && (
              <form action={interactionAction} className="space-y-3 px-5 py-4" style={{ borderTop: "1px solid var(--border)" }}>
                <input type="hidden" name="customerId" value={customer.id} />
                <div className="grid grid-cols-[140px_1fr] gap-3">
                  <SelectField
                    label="Type"
                    name="type"
                    defaultValue="NOTE"
                    options={[
                      { value: "NOTE", label: "Note" },
                      { value: "CALL", label: "Call" },
                      { value: "EMAIL", label: "Email" },
                      { value: "MEETING", label: "Meeting" },
                      { value: "TEXT", label: "Text" },
                    ]}
                  />
                  <Field label="Subject" name="subject" />
                </div>
                <TextArea label="Details" name="body" rows={3} />
                <Button type="submit" variant="secondary">Log activity</Button>
              </form>
            )}
          </Card>

          {/* Quotes */}
          <Card>
            <CardHeader
              title="Quotes"
              description={`${customer.quotes.length} on file`}
              right={canQuote ? (
                <Link href={`/t/${slug}/quotes/new?customerId=${customer.id}`} className="text-xs underline" style={{ color: "var(--muted)" }}>
                  New quote
                </Link>
              ) : undefined}
            />
            <ul>
              {customer.quotes.length === 0 && (
                <li className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>No quotes yet.</li>
              )}
              {customer.quotes.map((q) => (
                <li key={q.id} className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                  <div className="flex items-center gap-3">
                    <Link href={`/t/${slug}/quotes/${q.id}`} className="text-sm font-medium underline">
                      {q.number}
                    </Link>
                    <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: statusColor(q.status), color: "white" }}>
                      {statusLabel(q.status)}
                    </span>
                    <span className="text-xs" style={{ color: "var(--muted)" }}>
                      {q.expiresAt ? `expires ${formatDate(q.expiresAt)}` : "no expiry"}
                    </span>
                  </div>
                  <div className="text-sm font-medium">
                    {formatMoney(q.total.toString(), ctx.tenant.currency)}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          {/* Invoices */}
          <Card>
            <CardHeader
              title="Invoices"
              description={`${customer.invoices.length} on file`}
              right={canInvoice ? (
                <Link href={`/t/${slug}/invoices/new?customerId=${customer.id}`} className="text-xs underline" style={{ color: "var(--muted)" }}>
                  New invoice
                </Link>
              ) : undefined}
            />
            <ul>
              {customer.invoices.length === 0 && (
                <li className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>No invoices yet.</li>
              )}
              {customer.invoices.map((inv) => {
                const balance = Math.max(0, Number(inv.total) - Number(inv.amountPaid));
                return (
                  <li key={inv.id} className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                    <div className="flex items-center gap-3">
                      <Link href={`/t/${slug}/invoices/${inv.id}`} className="text-sm font-medium underline">
                        {inv.number}
                      </Link>
                      <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: invoiceStatusColor(inv.status), color: "white" }}>
                        {invoiceStatusLabel(inv.status)}
                      </span>
                      <span className="text-xs" style={{ color: "var(--muted)" }}>
                        {inv.dueDate ? `due ${formatDate(inv.dueDate)}` : "no due date"}
                      </span>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-medium">{formatMoney(inv.total.toString(), ctx.tenant.currency)}</div>
                      {balance > 0 && (
                        <div className="text-xs" style={{ color: "var(--muted)" }}>
                          {formatMoney(balance, ctx.tenant.currency)} due
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* Orders */}
          <Card>
            <CardHeader title="Orders" description={`${customer.orders.length} on file`} />
            <ul>
              {customer.orders.length === 0 && (
                <li className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>No orders yet.</li>
              )}
              {customer.orders.map((o) => (
                <li key={o.id} className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                  <div className="flex items-center gap-3">
                    <Link href={`/t/${slug}/orders/${o.id}`} className="text-sm font-medium underline">
                      {o.number}
                    </Link>
                    <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: orderStatusColor(o.status), color: "white" }}>
                      {orderStatusLabel(o.status)}
                    </span>
                    <span className="text-xs" style={{ color: "var(--muted)" }}>
                      {o.dueDate ? `due ${formatDate(o.dueDate)}` : "no due date"}
                    </span>
                  </div>
                  <div className="text-sm font-medium">
                    {formatMoney(o.total.toString(), ctx.tenant.currency)}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          {/* Files */}
          <FilesCard
            slug={slug}
            files={customer.files}
            parent={{ kind: "customer", id: customer.id }}
            canUpload={canUploadFiles}
            memberMap={memberMap}
            backUrl={`/t/${slug}/customers/${customer.id}`}
            defaultKind="REFERENCE"
          />

          {/* Tasks */}
          <Card>
            <CardHeader title="Tasks" description={`${customer.tasks.filter(t => !t.completedAt).length} open`} />
            <ul>
              {customer.tasks.length === 0 && (
                <li className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>No tasks.</li>
              )}
              {customer.tasks.map((t) => {
                const toggle = toggleTask.bind(null, slug, t.id);
                const remove = deleteTask.bind(null, slug, t.id);
                return (
                  <li key={t.id} className="flex items-start justify-between gap-3 px-5 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                    <form action={toggle} className="mt-0.5">
                      <button type="submit" aria-label="toggle">
                        <span style={{
                          display: "inline-block", width: 16, height: 16, borderRadius: 4,
                          border: "1px solid var(--border)",
                          background: t.completedAt ? "var(--accent)" : "transparent",
                        }} />
                      </button>
                    </form>
                    <div className="flex-1">
                      <div className={`text-sm ${t.completedAt ? "line-through opacity-60" : ""}`}>{t.title}</div>
                      <div className="text-xs" style={{ color: "var(--muted)" }}>
                        {[
                          t.assignedTo ? memberMap.get(t.assignedTo)?.name : null,
                          t.dueDate ? `due ${formatDate(t.dueDate)} (${relativeDays(t.dueDate)})` : null,
                          humanize(t.priority),
                        ].filter(Boolean).join(" · ")}
                      </div>
                      {t.description && <div className="mt-0.5 whitespace-pre-wrap text-sm">{t.description}</div>}
                    </div>
                    {canEdit && (
                      <form action={remove}>
                        <button type="submit" className="text-xs underline" style={{ color: "#ff6b6b" }}>Delete</button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
            {canEdit && (
              <form action={taskAction} className="space-y-3 px-5 py-4" style={{ borderTop: "1px solid var(--border)" }}>
                <input type="hidden" name="customerId" value={customer.id} />
                <Field label="Title" name="title" required />
                <div className="grid grid-cols-3 gap-3">
                  <SelectField
                    label="Assignee"
                    name="assignedTo"
                    defaultValue=""
                    options={[{ value: "", label: "Unassigned" }, ...members.map((m) => ({ value: m.userId, label: m.name }))]}
                  />
                  <Field label="Due date" name="dueDate" type="date" />
                  <SelectField
                    label="Priority"
                    name="priority"
                    defaultValue="NORMAL"
                    options={[
                      { value: "LOW", label: "Low" },
                      { value: "NORMAL", label: "Normal" },
                      { value: "HIGH", label: "High" },
                    ]}
                  />
                </div>
                <TextArea label="Description" name="description" rows={2} />
                <Button type="submit" variant="secondary">Add task</Button>
              </form>
            )}
          </Card>
        </div>
      </div>

      {/* Phase 14 — send a canned update to the customer. */}
      {canEdit && (
        <Card>
          <CardHeader
            title="Send update"
            description="Pick a message template, customize, and record the send on this customer's timeline."
          />
          <SendMessageWidget
            slug={slug}
            customerId={customer.id}
            customerEmail={customer.email}
            returnTo={`/t/${slug}/customers/${customer.id}`}
            templates={sendCtx.templates}
            bag={sendCtx.bag}
          />
        </Card>
      )}

      {/* Phase 16 — two-way portal message thread. */}
      <Card>
        <CardHeader
          title="Portal messages"
          description="Messages sent by the customer from their portal. Reply sends a real email and updates their thread."
          right={
            unreadPortalMessages > 0 ? (
              <span
                className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white"
                style={{ background: "var(--danger)" }}
              >
                {unreadPortalMessages}
              </span>
            ) : undefined
          }
        />
        {/* Mark unread messages as read when staff opens this card */}
        {unreadPortalMessages > 0 && (
          <form action={markPortalMessagesRead.bind(null, slug, customer.id)}>
            <input type="hidden" name="_noop" value="1" />
          </form>
        )}
        <div className="px-5 pb-4 space-y-3">
          {portalMessages.length === 0 ? (
            <p className="py-4 text-sm" style={{ color: "var(--text-muted)" }}>
              No portal messages yet. When {customer.name} sends a message from
              their portal, it will appear here.
            </p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto py-1">
              {portalMessages.map((msg) => {
                const isInbound = msg.direction === "INBOUND";
                return (
                  <div
                    key={msg.id}
                    className="rounded-lg px-4 py-3 text-sm"
                    style={{
                      background: isInbound ? "var(--surface-0)" : "var(--surface-2)",
                      border: "1px solid var(--border-subtle)",
                      marginLeft: isInbound ? 0 : "auto",
                      maxWidth: isInbound ? "100%" : "85%",
                    }}
                  >
                    <div
                      className="mb-1 flex items-center justify-between gap-2 text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <span className="font-semibold" style={{ color: "var(--text-default)" }}>
                        {isInbound ? customer.name : (msg.sender?.name ?? "You")}
                        {isInbound && !msg.readAt && (
                          <span
                            className="ml-2 rounded px-1 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                            style={{ background: "var(--danger)", color: "#fff" }}
                          >
                            New
                          </span>
                        )}
                      </span>
                      <span>{formatDateTime(msg.createdAt)}</span>
                    </div>
                    {msg.subject && (
                      <div className="mb-0.5 font-medium" style={{ color: "var(--text-strong)" }}>
                        {msg.subject}
                      </div>
                    )}
                    <p className="whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text-default)" }}>
                      {msg.body}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Reply form — only visible when portal access is active */}
          {canEdit && customer.email && (
            <form
              action={replyToPortalMessage.bind(null, slug)}
              className="space-y-2 pt-2 border-t"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <input type="hidden" name="customerId" value={customer.id} />
              <input type="hidden" name="toAddress" value={customer.email} />
              <div className="space-y-1">
                <label className="block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  Subject <span className="text-[10px] font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  name="subject"
                  maxLength={300}
                  placeholder="Re: your message"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    background: "var(--input-bg)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-default)",
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  Reply <span className="text-[10px] text-red-500">*</span>
                </label>
                <textarea
                  name="body"
                  rows={3}
                  required
                  maxLength={4000}
                  placeholder="Type your reply…"
                  className="w-full resize-y rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    background: "var(--input-bg)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-default)",
                  }}
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="rounded-lg px-4 py-1.5 text-sm font-semibold transition-opacity hover:opacity-90"
                  style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
                >
                  Send reply
                </button>
              </div>
            </form>
          )}
          {canEdit && !customer.email && (
            <p className="text-xs italic" style={{ color: "var(--text-muted)" }}>
              Add an email address to this customer to enable replies.
            </p>
          )}
        </div>
      </Card>

      {/* Phase 14 — internal team thread attached to this customer. */}
      <CommentThread
        slug={slug}
        parentKind="customer"
        parentId={customer.id}
        comments={customer.comments}
        currentUserId={ctx.userId}
        memberMap={memberMap}
        canModerate={ctx.can("staff:manage")}
      />

      {/* Phase E — audit-driven activity feed for this customer. */}
      <ActivityTimeline
        tenantId={ctx.tenant.id}
        entityType="Customer"
        entityId={customer.id}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-xs" style={{ color: "var(--muted)" }}>{label}</dt>
      <dd className="text-right">{value || <span style={{ color: "var(--muted)" }}>—</span>}</dd>
    </div>
  );
}

function Address(props: {
  line1: string | null; line2: string | null;
  city: string | null; region: string | null;
  postal: string | null; country: string | null;
}) {
  const empty = !props.line1 && !props.city && !props.country;
  if (empty) return <p className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>—</p>;
  return (
    <p className="whitespace-pre-line px-5 py-4 text-sm">
      {[
        props.line1,
        props.line2,
        [props.city, props.region, props.postal].filter(Boolean).join(", "),
        props.country,
      ].filter(Boolean).join("\n")}
    </p>
  );
}
