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
import {
  CustomerDetailTabs,
  type CustomerDetailTab,
} from "@/components/customers/CustomerDetailTabs";

// Inlined rather than imported from the client component — a value exported
// from a "use client" module is a client reference and can't be called from
// the server.
function parseCustomerDetailTab(raw: string | undefined): CustomerDetailTab {
  switch (raw) {
    case "work":
    case "contacts":
    case "communication":
    case "tasks":
    case "files":
    case "activity":
      return raw;
    default:
      return "overview";
  }
}

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
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "customers:view");
  const activeTab = parseCustomerDetailTab(sp.tab);

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

  const stageAction = changeStage.bind(null, slug);
  const contactAction = addContact.bind(null, slug);
  const interactionAction = addInteraction.bind(null, slug);
  const taskAction = createTask.bind(null, slug);

  const workCount =
    customer.quotes.length + customer.orders.length + customer.invoices.length;
  const ownerName = customer.ownerId ? memberMap.get(customer.ownerId)?.name ?? null : null;

  const tabCounts: Partial<Record<CustomerDetailTab, number>> = {
    work: workCount,
    contacts: customer.contacts.length,
    communication: unreadPortalMessages,
    tasks: openTasks.length,
    files: customer.files.length,
  };

  return (
    <div className="space-y-5">
      <div className="text-sm">
        <Link href={`/t/${slug}/customers`} className="underline" style={{ color: "var(--text-muted)" }}>
          ← Customers
        </Link>
      </div>

      {/* Status-specific banners. Above the sticky header so they scroll away. */}
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

      {/* STICKY HEADER — name + stage + health + identity subline + est. value + primary CTA. */}
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
                <div
                  className="text-[10px] uppercase tracking-wide"
                  style={{ color: "var(--text-muted)" }}
                >
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
          </div>
        </div>
      </header>

      {/* Secondary actions row. */}
      <div className="flex flex-wrap items-center gap-2">
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

      {/* Next action — highest-leverage next step, above the tabs. */}
      {showNextAction && nextAction && (
        <NextActionPanel
          slug={slug}
          customerId={customer.id}
          action={nextAction}
          canEdit={canEdit}
        />
      )}

      {/* Guided stage conversion. */}
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

      {/* TABS */}
      <div className="space-y-5 pt-2">
        <CustomerDetailTabs active={activeTab} counts={tabCounts} />

        {activeTab === "overview" && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-1">
              <Card>
                <CardHeader title="Contact" />
                <dl className="grid grid-cols-1 gap-y-2 px-5 py-4 text-sm">
                  <Row label="Email" value={customer.email} />
                  <Row label="Phone" value={customer.phone} />
                  <Row label="Website" value={customer.website} />
                  <Row
                    label="Estimated value"
                    value={formatMoney(customer.estimatedValue?.toString() ?? null, ctx.tenant.currency)}
                  />
                  <Row
                    label="Close probability"
                    value={customer.closeProbability != null ? `${customer.closeProbability}%` : null}
                  />
                </dl>
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

              {healthReport && <OpportunityHealthCard report={healthReport} />}
            </div>

            <div className="space-y-5 lg:col-span-2">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
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
              </div>

              {customer.notes && (
                <Card>
                  <CardHeader title="Notes" />
                  <p className="whitespace-pre-wrap px-5 py-4 text-sm">{customer.notes}</p>
                </Card>
              )}

              <Card>
                <CardHeader
                  title="Customer portal"
                  description="Token-based links for the customer"
                />
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
            </div>
          </div>
        )}

        {activeTab === "work" && (
          <div className="space-y-5">
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
        )}

        {activeTab === "contacts" && (
          <Card>
            <CardHeader title="Contacts" description={`${customer.contacts.length} on file`} />
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
        )}

        {activeTab === "communication" && (
          <div className="space-y-5">
            <CustomerCommsTimeline
              customerName={customer.name}
              emailEvents={emailEventsForTimeline}
              portalMessages={portalMessages}
              interactions={customer.interactions}
              memberNameById={memberNameById}
            />

            <Card>
              <CardHeader title="Log activity" description="Quick-log a call, meeting, or note." />
              {canEdit && (
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
              )}
            </Card>

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
                  returnTo={`/t/${slug}/customers/${customer.id}?tab=communication`}
                  templates={sendCtx.templates}
                  bag={sendCtx.bag}
                />
              </Card>
            )}

            <Card>
              <CardHeader
                title="Portal messages"
                description="Messages sent by the customer from their portal. Reply sends a real email and updates their thread."
                right={
                  unreadPortalMessages > 0 ? (
                    <span
                      className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white"
                      style={{ background: "var(--danger-fg)" }}
                    >
                      {unreadPortalMessages}
                    </span>
                  ) : undefined
                }
              />
              {unreadPortalMessages > 0 && (
                <form action={markPortalMessagesRead.bind(null, slug, customer.id)}>
                  <input type="hidden" name="_noop" value="1" />
                </form>
              )}
              <div className="space-y-3 px-5 pb-4">
                {portalMessages.length === 0 ? (
                  <p className="py-4 text-sm" style={{ color: "var(--text-muted)" }}>
                    No portal messages yet. When {customer.name} sends a message from
                    their portal, it will appear here.
                  </p>
                ) : (
                  <div className="max-h-80 space-y-3 overflow-y-auto py-1">
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
                )}

                {canEdit && customer.email && (
                  <form
                    action={replyToPortalMessage.bind(null, slug)}
                    className="space-y-2 border-t pt-3"
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
                        style={{ background: "var(--accent-primary)", color: "white" }}
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
          </div>
        )}

        {activeTab === "tasks" && (
          <Card>
            <CardHeader title="Tasks" description={`${openTasks.length} open · ${customer.tasks.length} total`} />
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
        )}

        {activeTab === "files" && (
          <FilesCard
            slug={slug}
            files={customer.files}
            parent={{ kind: "customer", id: customer.id }}
            canUpload={canUploadFiles}
            memberMap={memberMap}
            backUrl={`/t/${slug}/customers/${customer.id}?tab=files`}
            defaultKind="REFERENCE"
          />
        )}

        {activeTab === "activity" && (
          <div className="space-y-5">
            <CommentThread
              slug={slug}
              parentKind="customer"
              parentId={customer.id}
              comments={customer.comments}
              currentUserId={ctx.userId}
              memberMap={memberMap}
              canModerate={ctx.can("staff:manage")}
            />

            <ActivityTimeline
              tenantId={ctx.tenant.id}
              entityType="Customer"
              entityId={customer.id}
            />
          </div>
        )}
      </div>
    </div>
  );
}

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
