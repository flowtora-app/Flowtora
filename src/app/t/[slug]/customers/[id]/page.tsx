import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { Button, Field, SelectField, TextArea } from "@/components/Field";
import { FilesCard } from "@/components/FilesCard";
import { CommentThread } from "@/components/CommentThread";
import { ActivityTimeline } from "@/components/ui/ActivityTimeline";
import { stageColor, stageLabel, lostReasonLabel, DEFAULT_LEAD_SOURCES } from "@/lib/crm";
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
  patchCustomer,
} from "@/app/actions/customers";
import { issuePortalToken, revokePortalToken, deletePortalToken } from "@/app/actions/portal-tokens";
import { isPortalTokenActive, portalTokenStatusLabel, portalPath } from "@/lib/portal";
import { SendMessageWidget } from "@/components/SendMessageWidget";
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
import {
  CustomerDetailShell,
  DetailSection,
  SectionNav,
} from "@/components/customers/CustomerDetailShell";
import { InlineEditCard } from "@/components/customers/InlineEditCard";
import {
  TimelineStream,
  parseStreamFilter,
} from "@/components/customers/TimelineStream";

// Phase 3 (transformation) — single-scroll customer detail page.
//
// The old 7-tab layout is gone. The page now reads top-to-bottom:
//
//   1. Breadcrumb + banners
//   2. Sticky status row (name / stage / health / owner / value / CTA)
//   3. Next-action + guided stage change
//   4. Section-nav chip row (anchor links to the four main sections)
//   5. Two-column body:
//        • Left rail (identity, contact, addresses, tags, health)
//        • Center stack (activity timeline, work, tasks, portal links, files)
//
// /edit and /timeline routes are gone — both return 308 redirects here
// via middleware. Inline-edit cards replace the edit page; the unified
// TimelineStream replaces the timeline route.

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
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ activity?: string; error?: string }>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "customers:view");
  const activityFilter = parseStreamFilter(sp.activity);

  const customer = await db.customer.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      interactions: { orderBy: { occurredAt: "desc" }, take: 100 },
      tasks: { orderBy: [{ completedAt: "asc" }, { dueDate: "asc" }] },
      quotes: { orderBy: { updatedAt: "desc" }, take: 20 },
      orders: { orderBy: { updatedAt: "desc" }, take: 20 },
      invoices: { orderBy: { updatedAt: "desc" }, take: 20 },
      files: { orderBy: { createdAt: "desc" } },
      portalTokens: { orderBy: { createdAt: "desc" } },
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

  const emailSenderIds = Array.from(
    new Set(emailEvents.map((e) => e.senderUserId).filter((x): x is string => Boolean(x))),
  );
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

  const healthBundle = await loadHealthBundle(ctx.tenant.id, [customer]);
  const healthInput = healthBundle.get(customer.id);
  const healthReport = healthInput
    ? computeOpportunityHealth(healthInput)
    : null;

  const latestSentQuote = customer.quotes.find(
    (q) => q.status === "SENT" || q.status === "VIEWED" || q.status === "APPROVED",
  );
  const openTasks = customer.tasks.filter((t) => !t.completedAt);
  const overdueTaskCount = openTasks.filter(
    (t) => t.dueDate && t.dueDate.getTime() < Date.now(),
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
  const showNextAction =
    nextAction && customer.stage !== "WON" && customer.stage !== "LOST";

  // Server action bindings — each section only hands its own action.
  const stageAction = changeStage.bind(null, slug);
  const contactAction = addContact.bind(null, slug);
  const interactionAction = addInteraction.bind(null, slug);
  const taskAction = createTask.bind(null, slug);
  const patch = patchCustomer.bind(null, slug, customer.id);

  const workCount =
    customer.quotes.length + customer.orders.length + customer.invoices.length;
  const activityCount =
    customer.interactions.length +
    customer.comments.filter((c) => !c.deletedAt).length +
    portalMessages.length +
    emailEvents.length;
  const ownerName = customer.ownerId ? memberMap.get(customer.ownerId)?.name ?? null : null;

  // ─── Breadcrumb ────────────────────────────────────────────────
  const breadcrumb = (
    <div className="text-sm">
      <Link href={`/t/${slug}/customers`} className="underline" style={{ color: "var(--text-muted)" }}>
        ← Customers
      </Link>
    </div>
  );

  // ─── Banners ───────────────────────────────────────────────────
  const banners = (
    <>
      {sp.error && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "var(--danger-surface)",
            color: "var(--danger-fg)",
            border: "1px solid var(--danger-fg)",
          }}
        >
          {sp.error}
        </div>
      )}
      {customer.stage === "LOST" && customer.lostReason && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "var(--danger-surface)",
            color: "var(--danger-fg)",
            border: "1px solid var(--danger-fg)",
          }}
        >
          <div className="font-medium">
            Lost: {lostReasonLabel(customer.lostReason) ?? customer.lostReason}
          </div>
        </div>
      )}
    </>
  );

  // ─── Sticky status row ─────────────────────────────────────────
  const statusRow = (
    <header
      className="sticky top-0 z-10 rounded-lg"
      style={{
        background: "var(--surface-0)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "0 1px 2px rgb(0 0 0 / 0.04)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold" style={{ color: "var(--text-default)" }}>
              {customer.name}
            </h1>
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ background: stageColor(customer.stage), color: "white" }}
            >
              {stageLabel(customer.stage)}
            </span>
            {healthReport && (
              <HealthBadge
                tier={healthReport.tier}
                score={healthReport.score}
                atRisk={healthReport.atRisk}
              />
            )}
            {customer.status !== "ACTIVE" && (
              <span
                className="rounded-full px-2 py-0.5 text-[11px]"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-muted)",
                }}
              >
                {humanize(customer.status)}
              </span>
            )}
            {unreadPortalMessages > 0 && (
              <a
                href="#activity"
                className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
                style={{ background: "var(--danger-fg)" }}
              >
                {unreadPortalMessages} unread portal
              </a>
            )}
          </div>
          <div className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            {humanize(customer.kind)}
            {ownerName && <> · owner {ownerName}</>}
            {customer.source && <> · source {customer.source}</>}
            {customer.email && <> · {customer.email}</>}
          </div>
        </div>
        <div className="flex items-center gap-5 shrink-0">
          {customer.estimatedValue && (
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Est. value
              </div>
              <div
                className="text-2xl font-bold tabular-nums leading-tight"
                style={{ color: "var(--text-default)" }}
              >
                {formatMoney(customer.estimatedValue.toString(), ctx.tenant.currency)}
              </div>
              {customer.closeProbability != null && (
                <div className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {customer.closeProbability}% close probability
                </div>
              )}
            </div>
          )}
          {canQuote && (
            <Link href={`/t/${slug}/quotes/new?customerId=${customer.id}`}>
              <Button type="button">New quote</Button>
            </Link>
          )}
          {canDelete && (
            <form action={deleteCustomer.bind(null, slug, customer.id)}>
              <Button type="submit" variant="danger">Delete</Button>
            </form>
          )}
        </div>
      </div>
    </header>
  );

  // ─── Guided next-action + stage change ─────────────────────────
  const guidance = (
    <div className="space-y-4">
      {showNextAction && nextAction && (
        <NextActionPanel
          slug={slug}
          customerId={customer.id}
          action={nextAction}
          canEdit={canEdit}
        />
      )}
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
      <SectionNav
        anchors={[
          { id: "overview",  label: "Overview" },
          { id: "activity",  label: "Activity", count: activityCount },
          { id: "work",      label: "Work",     count: workCount },
          { id: "tasks",     label: "Tasks",    count: openTasks.length },
          { id: "files",     label: "Files",    count: customer.files.length },
          { id: "portal",    label: "Portal",   count: customer.portalTokens.length },
        ]}
      />
    </div>
  );

  // ─── Left rail ─────────────────────────────────────────────────
  const leftRail = (
    <>
      <InlineEditCard
        title="Contact"
        canEdit={canEdit}
        action={patch}
        view={
          <dl className="grid grid-cols-1 gap-y-2 px-5 py-4 text-sm">
            <Row label="Email" value={customer.email} />
            <Row label="Phone" value={customer.phone} />
            <Row label="Website" value={customer.website} />
          </dl>
        }
        edit={
          <div className="space-y-3">
            <Field label="Email" name="email" type="email" defaultValue={customer.email ?? ""} />
            <Field label="Phone" name="phone" defaultValue={customer.phone ?? ""} />
            <Field label="Website" name="website" type="url" defaultValue={customer.website ?? ""} />
          </div>
        }
      />

      <InlineEditCard
        title="Ownership & value"
        canEdit={canEdit}
        action={patch}
        view={
          <dl className="grid grid-cols-1 gap-y-2 px-5 py-4 text-sm">
            <Row label="Owner" value={ownerName} />
            <Row label="Source" value={customer.source} />
            <Row
              label="Est. value"
              value={formatMoney(customer.estimatedValue?.toString() ?? null, ctx.tenant.currency)}
            />
            <Row
              label="Close %"
              value={customer.closeProbability != null ? `${customer.closeProbability}%` : null}
            />
            <Row
              label="Default discount"
              value={customer.defaultDiscountPct ? `${customer.defaultDiscountPct}%` : null}
            />
          </dl>
        }
        edit={
          <div className="space-y-3">
            <SelectField
              label="Owner"
              name="ownerId"
              defaultValue={customer.ownerId ?? ""}
              options={[
                { value: "", label: "Unassigned" },
                ...members.map((m) => ({ value: m.userId, label: m.name })),
              ]}
            />
            <SelectField
              label="Lead source"
              name="source"
              defaultValue={customer.source ?? ""}
              options={[
                { value: "", label: "—" },
                ...DEFAULT_LEAD_SOURCES.map((s) => ({ value: s, label: s })),
              ]}
            />
            <div className="grid grid-cols-3 gap-2">
              <Field
                label="Est. value"
                name="estimatedValue"
                type="number"
                step="0.01"
                min="0"
                defaultValue={customer.estimatedValue ? String(customer.estimatedValue) : ""}
              />
              <Field
                label="Close %"
                name="closeProbability"
                type="number"
                min="0"
                max="100"
                defaultValue={customer.closeProbability != null ? String(customer.closeProbability) : ""}
              />
              <Field
                label="Discount %"
                name="defaultDiscountPct"
                type="number"
                min="0"
                max="100"
                defaultValue={customer.defaultDiscountPct != null ? String(customer.defaultDiscountPct) : ""}
              />
            </div>
          </div>
        }
      />

      <InlineEditCard
        title="Billing address"
        canEdit={canEdit}
        action={patch}
        view={
          <Address
            line1={customer.billingAddressLine1}
            line2={customer.billingAddressLine2}
            city={customer.billingCity}
            region={customer.billingRegion}
            postal={customer.billingPostalCode}
            country={customer.billingCountry}
          />
        }
        edit={<AddressFields prefix="billing" customer={customer} />}
      />

      <InlineEditCard
        title="Install address"
        canEdit={canEdit}
        action={patch}
        view={
          <Address
            line1={customer.installAddressLine1}
            line2={customer.installAddressLine2}
            city={customer.installCity}
            region={customer.installRegion}
            postal={customer.installPostalCode}
            country={customer.installCountry}
          />
        }
        edit={<AddressFields prefix="install" customer={customer} />}
      />

      <Card>
        <CardHeader title="Tags" />
        <div className="space-y-2 px-5 py-4">
          <TagEditor
            slug={slug}
            customerId={customer.id}
            tags={customer.tags}
            suggestions={tagSuggestions}
            canEdit={canEdit}
          />
        </div>
      </Card>

      {healthReport && <OpportunityHealthCard report={healthReport} />}
    </>
  );

  return (
    <CustomerDetailShell
      breadcrumb={breadcrumb}
      banners={banners}
      statusRow={statusRow}
      guidance={guidance}
      leftRail={leftRail}
    >
      {/* ═══ Overview ═══ */}
      <DetailSection id="overview" title="Overview">
        <div className="space-y-4">
          <InlineEditCard
            title="Notes"
            description="Internal context. Shown to staff, never to customers."
            canEdit={canEdit}
            action={patch}
            view={
              customer.notes ? (
                <p className="whitespace-pre-wrap px-5 py-4 text-sm">{customer.notes}</p>
              ) : (
                <p className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>
                  No notes yet.
                </p>
              )
            }
            edit={<TextArea label="Notes" name="notes" rows={5} defaultValue={customer.notes ?? ""} />}
          />

          <Card>
            <CardHeader
              title="Contacts"
              description={`${customer.contacts.length} on file`}
            />
            <ul>
              {customer.contacts.length === 0 && (
                <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
                  No contacts yet.
                </li>
              )}
              {customer.contacts.map((c) => {
                const remove = deleteContact.bind(null, slug, c.id);
                return (
                  <li
                    key={c.id}
                    className="flex items-center justify-between px-5 py-3"
                    style={{ borderTop: "1px solid var(--border-subtle)" }}
                  >
                    <div>
                      <div className="text-sm">
                        {c.firstName} {c.lastName ?? ""}
                        {c.isPrimary && (
                          <span
                            className="ml-2 rounded-full px-2 py-0.5 text-xs"
                            style={{ background: "var(--accent-primary)", color: "white" }}
                          >
                            Primary
                          </span>
                        )}
                      </div>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {[c.title, c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                    {canEdit && (
                      <form action={remove}>
                        <button type="submit" className="text-xs underline" style={{ color: "var(--danger-fg)" }}>
                          Remove
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
            {canEdit && (
              <form
                action={contactAction}
                className="space-y-3 px-5 py-4"
                style={{ borderTop: "1px solid var(--border-subtle)" }}
              >
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
        </div>
      </DetailSection>

      {/* ═══ Activity ═══ */}
      <DetailSection
        id="activity"
        title="Activity"
        description="Emails, portal messages, logged interactions, and internal comments — newest first."
      >
        <div className="space-y-4">
          <TimelineStream
            slug={slug}
            customerId={customer.id}
            customerName={customer.name}
            filter={activityFilter}
            emailEvents={emailEventsForTimeline}
            portalMessages={portalMessages}
            interactions={customer.interactions}
            comments={customer.comments}
            memberNameById={memberNameById}
          />

          {canEdit && (
            <Card>
              <CardHeader
                title="Log activity"
                description="Quick-log a call, meeting, or note."
              />
              <form
                action={interactionAction}
                className="space-y-3 px-5 py-4"
                style={{ borderTop: "1px solid var(--border-subtle)" }}
              >
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
            </Card>
          )}

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
                returnTo={`/t/${slug}/customers/${customer.id}#activity`}
                templates={sendCtx.templates}
                bag={sendCtx.bag}
              />
            </Card>
          )}

          <CommentThread
            slug={slug}
            parentKind="customer"
            parentId={customer.id}
            comments={customer.comments}
            currentUserId={ctx.userId}
            memberMap={memberMap}
            canModerate={ctx.can("staff:manage")}
          />

          {/* Portal replies — still useful on the activity tab because
              the unified stream is read-only. */}
          {canEdit && customer.email && portalMessages.length > 0 && (
            <Card>
              <CardHeader
                title="Reply to customer portal"
                description="Replies send a real email and update the thread."
              />
              <form
                action={replyToPortalMessage.bind(null, slug)}
                className="space-y-3 px-5 py-4"
                style={{ borderTop: "1px solid var(--border-subtle)" }}
              >
                <input type="hidden" name="customerId" value={customer.id} />
                <input type="hidden" name="toAddress" value={customer.email} />
                <Field label="Subject (optional)" name="subject" placeholder="Re: your message" />
                <TextArea label="Reply" name="body" rows={3} required />
                <Button type="submit">Send reply</Button>
              </form>
              {unreadPortalMessages > 0 && (
                <form action={markPortalMessagesRead.bind(null, slug, customer.id)}>
                  <input type="hidden" name="_noop" value="1" />
                </form>
              )}
            </Card>
          )}

          <ActivityTimeline
            tenantId={ctx.tenant.id}
            entityType="Customer"
            entityId={customer.id}
          />
        </div>
      </DetailSection>

      {/* ═══ Work ═══ */}
      <DetailSection id="work" title="Work" description={`${workCount} records across quotes, invoices, orders`}>
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Quotes"
              description={`${customer.quotes.length} on file`}
              right={canQuote ? (
                <Link
                  href={`/t/${slug}/quotes/new?customerId=${customer.id}`}
                  className="text-xs underline"
                  style={{ color: "var(--text-muted)" }}
                >
                  New quote
                </Link>
              ) : undefined}
            />
            <ul>
              {customer.quotes.length === 0 && (
                <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
                  No quotes yet.
                </li>
              )}
              {customer.quotes.map((q) => (
                <li
                  key={q.id}
                  className="flex items-center justify-between px-5 py-3"
                  style={{ borderTop: "1px solid var(--border-subtle)" }}
                >
                  <div className="flex items-center gap-3">
                    <Link href={`/t/${slug}/quotes/${q.id}`} className="text-sm font-medium underline">
                      {q.number}
                    </Link>
                    <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: statusColor(q.status), color: "white" }}>
                      {statusLabel(q.status)}
                    </span>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {q.expiresAt ? `expires ${formatDate(q.expiresAt)}` : "no expiry"}
                    </span>
                  </div>
                  <div className="text-sm font-medium tabular-nums">
                    {formatMoney(q.total.toString(), ctx.tenant.currency)}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader
              title="Invoices"
              description={`${customer.invoices.length} on file`}
              right={canInvoice ? (
                <Link
                  href={`/t/${slug}/invoices/new?customerId=${customer.id}`}
                  className="text-xs underline"
                  style={{ color: "var(--text-muted)" }}
                >
                  New invoice
                </Link>
              ) : undefined}
            />
            <ul>
              {customer.invoices.length === 0 && (
                <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
                  No invoices yet.
                </li>
              )}
              {customer.invoices.map((inv) => {
                const balance = Math.max(0, Number(inv.total) - Number(inv.amountPaid));
                return (
                  <li
                    key={inv.id}
                    className="flex items-center justify-between px-5 py-3"
                    style={{ borderTop: "1px solid var(--border-subtle)" }}
                  >
                    <div className="flex items-center gap-3">
                      <Link href={`/t/${slug}/invoices/${inv.id}`} className="text-sm font-medium underline">
                        {inv.number}
                      </Link>
                      <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: invoiceStatusColor(inv.status), color: "white" }}>
                        {invoiceStatusLabel(inv.status)}
                      </span>
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {inv.dueDate ? `due ${formatDate(inv.dueDate)}` : "no due date"}
                      </span>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-medium tabular-nums">{formatMoney(inv.total.toString(), ctx.tenant.currency)}</div>
                      {balance > 0 && (
                        <div className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                          {formatMoney(balance, ctx.tenant.currency)} due
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Orders" description={`${customer.orders.length} on file`} />
            <ul>
              {customer.orders.length === 0 && (
                <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
                  No orders yet.
                </li>
              )}
              {customer.orders.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center justify-between px-5 py-3"
                  style={{ borderTop: "1px solid var(--border-subtle)" }}
                >
                  <div className="flex items-center gap-3">
                    <Link href={`/t/${slug}/orders/${o.id}`} className="text-sm font-medium underline">
                      {o.number}
                    </Link>
                    <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: orderStatusColor(o.status), color: "white" }}>
                      {orderStatusLabel(o.status)}
                    </span>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {o.dueDate ? `due ${formatDate(o.dueDate)}` : "no due date"}
                    </span>
                  </div>
                  <div className="text-sm font-medium tabular-nums">
                    {formatMoney(o.total.toString(), ctx.tenant.currency)}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </DetailSection>

      {/* ═══ Tasks ═══ */}
      <DetailSection id="tasks" title="Tasks" description={`${openTasks.length} open · ${customer.tasks.length} total`}>
        <Card>
          <ul>
            {customer.tasks.length === 0 && (
              <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
                No tasks.
              </li>
            )}
            {customer.tasks.map((t) => {
              const toggle = toggleTask.bind(null, slug, t.id);
              const remove = deleteTask.bind(null, slug, t.id);
              return (
                <li
                  key={t.id}
                  className="flex items-start justify-between gap-3 px-5 py-3"
                  style={{ borderTop: "1px solid var(--border-subtle)" }}
                >
                  <form action={toggle} className="mt-0.5">
                    <button type="submit" aria-label="toggle">
                      <span
                        style={{
                          display: "inline-block",
                          width: 16,
                          height: 16,
                          borderRadius: 4,
                          border: "1px solid var(--border-default)",
                          background: t.completedAt ? "var(--accent-primary)" : "transparent",
                        }}
                      />
                    </button>
                  </form>
                  <div className="flex-1">
                    <div className={`text-sm ${t.completedAt ? "line-through opacity-60" : ""}`}>{t.title}</div>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>
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
                      <button type="submit" className="text-xs underline" style={{ color: "var(--danger-fg)" }}>
                        Delete
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
          {canEdit && (
            <form
              action={taskAction}
              className="space-y-3 px-5 py-4"
              style={{ borderTop: "1px solid var(--border-subtle)" }}
            >
              <input type="hidden" name="customerId" value={customer.id} />
              <Field label="Title" name="title" required />
              <div className="grid grid-cols-3 gap-3">
                <SelectField
                  label="Assignee"
                  name="assignedTo"
                  defaultValue=""
                  options={[
                    { value: "", label: "Unassigned" },
                    ...members.map((m) => ({ value: m.userId, label: m.name })),
                  ]}
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
      </DetailSection>

      {/* ═══ Files ═══ */}
      <DetailSection id="files" title="Files" description={`${customer.files.length} uploaded`}>
        <FilesCard
          slug={slug}
          files={customer.files}
          parent={{ kind: "customer", id: customer.id }}
          canUpload={canUploadFiles}
          memberMap={memberMap}
          backUrl={`/t/${slug}/customers/${customer.id}#files`}
          defaultKind="REFERENCE"
        />
      </DetailSection>

      {/* ═══ Customer portal ═══ */}
      <DetailSection
        id="portal"
        title="Customer portal"
        description="Token-based links you can share so the customer sees their quotes and invoices."
      >
        <Card>
          <ul>
            {customer.portalTokens.length === 0 && (
              <li className="px-5 py-4 text-xs" style={{ color: "var(--text-muted)" }}>
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
                  style={{ borderTop: "1px solid var(--border-subtle)" }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{t.label ?? "Portal link"}</span>
                      <span
                        className="rounded-full px-2 py-0.5 text-xs"
                        style={{ background: active ? "#10b981" : "#6b7280", color: "white" }}
                      >
                        {portalTokenStatusLabel(t)}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {active && canEdit && (
                        <form action={revoke}>
                          <button type="submit" className="text-xs underline" style={{ color: "var(--danger-fg)" }}>
                            Revoke
                          </button>
                        </form>
                      )}
                      {canEdit && (
                        <form action={del}>
                          <button type="submit" className="text-xs underline" style={{ color: "var(--text-muted)" }}>
                            Delete
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {t.expiresAt ? <>Expires {formatDate(t.expiresAt)}</> : <>No expiry</>}
                    {t.lastUsedAt && <> · Last used {formatDate(t.lastUsedAt)}</>}
                  </div>
                  <input
                    readOnly
                    className="w-full rounded-md bg-transparent px-2 py-1 text-xs"
                    style={{ border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
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
              style={{ borderTop: "1px solid var(--border-subtle)" }}
            >
              <input type="hidden" name="customerId" value={customer.id} />
              <Field label="Label (optional)" name="label" placeholder="e.g. Jane @ ACME" />
              <Field label="Expires (optional)" name="expiresAt" type="date" />
              <Button type="submit" variant="secondary">Issue new portal link</Button>
            </form>
          )}
        </Card>
      </DetailSection>

      {/* Portal messages panel — always available at the bottom so the
          sidebar doesn't overflow with it. */}
      {portalMessages.length > 0 && (
        <DetailSection
          id="messages"
          title="Portal messages"
          description={
            unreadPortalMessages > 0
              ? `${unreadPortalMessages} unread · ${portalMessages.length} total`
              : `${portalMessages.length} exchanged`
          }
        >
          <Card>
            <div className="max-h-96 space-y-3 overflow-y-auto px-5 py-4">
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
                        {isInbound ? customer.name : msg.sender?.name ?? "You"}
                        {isInbound && !msg.readAt && (
                          <span
                            className="ml-2 rounded px-1 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                            style={{ background: "var(--danger-fg)", color: "#fff" }}
                          >
                            New
                          </span>
                        )}
                      </span>
                      <span>{formatDateTime(msg.createdAt)}</span>
                    </div>
                    {msg.subject && (
                      <div className="mb-0.5 font-medium" style={{ color: "var(--text-default)" }}>
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
          </Card>
        </DetailSection>
      )}
    </CustomerDetailShell>
  );
}

// ─── Small presentational helpers ──────────────────────────────────

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</dt>
      <dd className="text-right">{value || <span style={{ color: "var(--text-muted)" }}>—</span>}</dd>
    </div>
  );
}

function Address(props: {
  line1: string | null; line2: string | null;
  city: string | null; region: string | null;
  postal: string | null; country: string | null;
}) {
  const empty = !props.line1 && !props.city && !props.country;
  if (empty) return <p className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>—</p>;
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

// Address edit form used inside both Billing + Install InlineEditCards.
// Each variant maps to its own set of DB columns; we just pick the
// right defaults and field names up front rather than doing fancy key
// arithmetic.
function AddressFields({
  prefix,
  customer,
}: {
  prefix: "billing" | "install";
  customer: {
    billingAddressLine1: string | null;
    billingAddressLine2: string | null;
    billingCity: string | null;
    billingRegion: string | null;
    billingPostalCode: string | null;
    billingCountry: string | null;
    installAddressLine1: string | null;
    installAddressLine2: string | null;
    installCity: string | null;
    installRegion: string | null;
    installPostalCode: string | null;
    installCountry: string | null;
  };
}) {
  const fields = prefix === "billing"
    ? {
        addressLine1: { name: "billingAddressLine1", value: customer.billingAddressLine1 },
        addressLine2: { name: "billingAddressLine2", value: customer.billingAddressLine2 },
        city:         { name: "billingCity",         value: customer.billingCity },
        region:       { name: "billingRegion",       value: customer.billingRegion },
        postalCode:   { name: "billingPostalCode",   value: customer.billingPostalCode },
        country:      { name: "billingCountry",      value: customer.billingCountry },
      }
    : {
        addressLine1: { name: "installAddressLine1", value: customer.installAddressLine1 },
        addressLine2: { name: "installAddressLine2", value: customer.installAddressLine2 },
        city:         { name: "installCity",         value: customer.installCity },
        region:       { name: "installRegion",       value: customer.installRegion },
        postalCode:   { name: "installPostalCode",   value: customer.installPostalCode },
        country:      { name: "installCountry",      value: customer.installCountry },
      };
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Address line 1" name={fields.addressLine1.name} defaultValue={fields.addressLine1.value ?? ""} />
      <Field label="Address line 2" name={fields.addressLine2.name} defaultValue={fields.addressLine2.value ?? ""} />
      <Field label="City"           name={fields.city.name}         defaultValue={fields.city.value ?? ""} />
      <Field label="State / Region" name={fields.region.name}       defaultValue={fields.region.value ?? ""} />
      <Field label="Postal code"    name={fields.postalCode.name}   defaultValue={fields.postalCode.value ?? ""} />
      <Field label="Country"        name={fields.country.name}      defaultValue={fields.country.value ?? ""} />
    </div>
  );
}
