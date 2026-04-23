"use server";

// Phase 17 Slice D — support ticket actions.
//
// The tenant side: any active member can open a ticket, read their own
// tenant's tickets, and post replies. The platform side (assign, change
// status, priority) lives in `actions/platform.ts` so it shares the
// requirePlatformStaff / requirePlatformAdmin gating.
//
// Notifications go out on staff replies so the tenant inbox flags
// attention without polling. We intentionally do NOT re-notify tenant
// staff when one of their colleagues replies — that's normal thread
// activity visible whenever they revisit the ticket page.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { sendNotification } from "@/lib/notifications";
import { getPref, resolvePrefs, resolveEffectivePref } from "@/lib/notif-prefs";
import { appOrigin } from "@/lib/share";
import { computeDueBy } from "@/lib/support-sla";
import type { SupportTicketCategory, SupportTicketPriority } from "@prisma/client";

const CATEGORIES = ["BILLING", "BUG", "FEATURE_REQUEST", "QUESTION", "OTHER"] as const;
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

const openSchema = z.object({
  subject:  z.string().min(3).max(200),
  category: z.enum(CATEGORIES),
  priority: z.enum(PRIORITIES).optional(),
  body:     z.string().min(1).max(8000),
});

export async function openSupportTicket(slug: string, formData: FormData) {
  const ctx = await requireTenant(slug);
  const parsed = openSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/support/new?error=${encodeURIComponent("Add a subject, category, and body.")}`);
  }
  const { subject, category, priority, body } = parsed.data;
  const effectivePriority = (priority ?? "NORMAL") as SupportTicketPriority;

  const ticket = await db.supportTicket.create({
    data: {
      tenantId: ctx.tenant.id,
      subject,
      category: category as SupportTicketCategory,
      priority: effectivePriority,
      openedByUserId: ctx.userId,
      // Phase 20 Slice C — start the SLA clock immediately. Platform staff
      // see the "due in 4h" / "due in 3d" chip from the moment it opens.
      dueBy: computeDueBy(effectivePriority),
      messages: {
        create: {
          authorId: ctx.userId,
          isStaff: false,
          body,
        },
      },
    },
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "support.ticket_opened",
    entityType: "SupportTicket",
    entityId: ticket.id,
    metadata: { subject, category, priority: priority ?? "NORMAL" },
  });

  redirect(`/t/${slug}/support/${ticket.id}`);
}

const replySchema = z.object({
  body: z.string().min(1).max(8000),
});

export async function replyToSupportTicket(slug: string, ticketId: string, formData: FormData) {
  const ctx = await requireTenant(slug);
  const parsed = replySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/support/${ticketId}?error=${encodeURIComponent("Reply can't be empty.")}`);
  }

  // Must belong to this tenant. The tenant scoping is why we don't just use
  // a global findUnique — prevents a forged ticket id from a sibling tenant.
  const ticket = await db.supportTicket.findFirst({
    where: { id: ticketId, tenantId: ctx.tenant.id },
    select: { id: true, status: true, assignedTo: true, priority: true },
  });
  if (!ticket) {
    redirect(`/t/${slug}/support?error=${encodeURIComponent("Ticket not found")}`);
  }

  await db.supportTicketMessage.create({
    data: {
      ticketId: ticket.id,
      authorId: ctx.userId,
      isStaff: false,
      body: parsed.data.body,
    },
  });

  // A customer reply should always kick a resolved/waiting ticket back to
  // the platform team's queue. If it was already open / in-progress we leave
  // status alone to avoid flicker.
  const wasReactivated =
    ticket.status === "RESOLVED" || ticket.status === "WAITING_CUSTOMER" || ticket.status === "CLOSED";
  const nextStatus = wasReactivated ? "OPEN" : ticket.status;
  await db.supportTicket.update({
    where: { id: ticket.id },
    data: {
      status: nextStatus,
      resolvedAt: nextStatus === "OPEN" ? null : undefined,
      closedAt:   nextStatus === "OPEN" ? null : undefined,
      // Phase 20 Slice C — if the customer reactivated a resting ticket, the
      // platform SLA clock starts fresh. Don't reset on "already active"
      // replies — those don't add pressure; they're just more context.
      dueBy: wasReactivated ? computeDueBy(ticket.priority) : undefined,
    },
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "support.ticket_replied",
    entityType: "SupportTicket",
    entityId: ticket.id,
    metadata: { side: "tenant" },
  });

  revalidatePath(`/t/${slug}/support/${ticket.id}`);
  revalidatePath(`/t/${slug}/support`);
}

const rateSchema = z.object({
  rating:  z.string().regex(/^[1-5]$/),
  comment: z.string().max(2000).optional().or(z.literal("")),
});

/**
 * Phase 20 Slice E — satisfaction rating. Available to any active tenant
 * member once a ticket is RESOLVED or CLOSED. Overwrites are allowed so the
 * tenant can refine their answer; we stamp `satisfactionAt` + `ratedByUserId`
 * every time but never nullify them after the fact.
 */
export async function rateSupportTicket(slug: string, ticketId: string, formData: FormData) {
  const ctx = await requireTenant(slug);
  const parsed = rateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/support/${ticketId}?error=${encodeURIComponent("Pick a rating from 1 to 5.")}`);
  }

  const ticket = await db.supportTicket.findFirst({
    where: { id: ticketId, tenantId: ctx.tenant.id },
    select: { id: true, status: true },
  });
  if (!ticket) return;
  // Ratings only make sense after the thread has stopped. Silently bail if
  // the ticket has reopened between page render and submission — the UI
  // will refresh without the widget.
  if (ticket.status !== "RESOLVED" && ticket.status !== "CLOSED") return;

  const rating = parseInt(parsed.data.rating, 10);
  const comment = parsed.data.comment?.trim() ? parsed.data.comment.trim() : null;

  await db.supportTicket.update({
    where: { id: ticket.id },
    data: {
      satisfactionRating:  rating,
      satisfactionComment: comment,
      satisfactionAt:      new Date(),
      ratedByUserId:       ctx.userId,
    },
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "support.ticket_rated",
    entityType: "SupportTicket",
    entityId: ticket.id,
    metadata: { rating, hasComment: Boolean(comment) },
  });

  revalidatePath(`/t/${slug}/support/${ticket.id}`);
}

/**
 * Tenant-side close. Owner-level affordance — once a ticket is closed the
 * tenant needs to open a new one (simpler than "reopen" UX, and platform
 * staff can still see the history.)
 */
export async function closeSupportTicketAsTenant(slug: string, ticketId: string) {
  const ctx = await requireTenant(slug);
  const ticket = await db.supportTicket.findFirst({
    where: { id: ticketId, tenantId: ctx.tenant.id },
    select: { id: true, status: true, assignedTo: true },
  });
  if (!ticket) return;
  if (ticket.status === "CLOSED") return;

  await db.supportTicket.update({
    where: { id: ticket.id },
    data: { status: "CLOSED", closedAt: new Date() },
  });

  // Let the assigned platform user know the customer considers it handled.
  if (ticket.assignedTo) {
    // Platform staff users aren't tied to a tenant membership, so notifyMany
    // (which creates Notification rows tenant-scoped) isn't a natural fit.
    // Fall back to audit only — platform staff see the status change in
    // their queue.
  }

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "support.ticket_closed_by_tenant",
    entityType: "SupportTicket",
    entityId: ticket.id,
  });

  revalidatePath(`/t/${slug}/support/${ticket.id}`);
  revalidatePath(`/t/${slug}/support`);
}

// ────────────────────────────────────────────────────────────
// Platform-staff write helpers — imported by actions/platform.ts so we keep
// a single file-per-bounded-context. Exported here for discoverability.
// ────────────────────────────────────────────────────────────

const STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"] as const;

const staffReplySchema = z.object({
  body: z.string().min(1).max(8000),
  nextStatus: z.enum(STATUSES).optional(),
  // Phase 20 — checkbox in the platform reply form. When "on", the post
  // is filed as a staff-only internal note: not shown to the tenant, no
  // notifications sent, no status transition.
  internal: z.union([z.literal("on"), z.literal("")]).optional(),
});

/**
 * Platform staff posts a reply on a ticket. Optionally transitions the
 * status in the same submit (e.g. "reply and mark waiting on customer").
 * Notifies every active tenant member so somebody actually sees the response.
 *
 * Caller MUST have already run requirePlatformStaff — this helper does not
 * re-check. It's invoked from actions/platform.ts.
 */
export async function platformReplyToSupportTicket(params: {
  ticketId: string;
  authorUserId: string;
  authorEmail: string;
  formData: FormData;
}) {
  const { ticketId, authorUserId, authorEmail } = params;
  const parsed = staffReplySchema.safeParse(Object.fromEntries(params.formData.entries()));
  if (!parsed.success) {
    redirect(`/platform/support/${ticketId}?error=${encodeURIComponent("Reply can't be empty.")}`);
  }

  const ticket = await db.supportTicket.findUnique({
    where: { id: ticketId },
    select: {
      id: true, tenantId: true, status: true, subject: true,
      firstStaffReplyAt: true,
      tenant: { select: { slug: true, name: true } },
    },
  });
  if (!ticket) {
    redirect(`/platform/support?error=${encodeURIComponent("Ticket not found")}`);
  }

  const isInternal = parsed.data.internal === "on";

  await db.supportTicketMessage.create({
    data: {
      ticketId: ticket.id,
      authorId: authorUserId,
      isStaff:  true,
      internal: isInternal,
      body:     parsed.data.body,
    },
  });

  // Internal notes never transition status or notify the tenant — they're
  // staff-to-staff annotations, not customer-facing replies. Only the
  // public reply path updates status + fires notifications.
  let nextStatus = ticket.status;
  if (!isInternal) {
    nextStatus = parsed.data.nextStatus ?? (ticket.status === "OPEN" ? "IN_PROGRESS" : ticket.status);
    // Phase 20 Slice C — once platform responds, the SLA clock for *this*
    // turn is satisfied. The chip disappears until the customer replies.
    // `firstStaffReplyAt` is stamped only on the first such reply so we can
    // report TTR honestly even if the status yo-yos later.
    await db.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: nextStatus,
        resolvedAt: nextStatus === "RESOLVED" ? new Date() : (nextStatus === "CLOSED" ? undefined : null),
        closedAt:   nextStatus === "CLOSED"   ? new Date() : null,
        dueBy: null,
        firstStaffReplyAt: ticket.firstStaffReplyAt ?? new Date(),
      },
    });

    // Notify every active member of the tenant so at least one inbox catches
    // the reply. We exclude nobody here — even the original opener benefits
    // from the notification in a different-device scenario.
    //
    // M5 — the in-app bell and the email now fire through a single
    // sendNotification() call per member. Previously this was a
    // notifyMany() (bell, unconditional) + a per-user sendNotification()
    // (email, pref-gated). The dispatcher's IN_APP channel collapses
    // those into one codepath: the bell row comes from the same
    // registered kind + template as the email, so the wording stays in
    // sync and admins only edit one row.
    //
    // Per-user email prefs still gate the EMAIL channel (default off,
    // opt-in via the member's notifPrefs or tenant defaults). IN_APP
    // remains unconditional — that's the same behaviour the old
    // notifyMany had.
    const members = await db.membership.findMany({
      where: { tenantId: ticket.tenantId, status: "ACTIVE" },
      select: { userId: true, notifPrefs: true, user: { select: { email: true, name: true } } },
    });

    const ticketTenant = await db.tenant.findUnique({
      where: { id: ticket.tenantId },
      select: { defaultNotifPrefs: true },
    });
    const tenantDefaults = resolvePrefs(ticketTenant?.defaultNotifPrefs);
    const ticketUrl = `${appOrigin()}/t/${ticket.tenant.slug}/support/${ticket.id}`;
    const bellLink = `/t/${ticket.tenant.slug}/support/${ticket.id}`;

    await Promise.all(
      members.map(async (m) => {
        const pref = resolveEffectivePref(resolvePrefs(m.notifPrefs), tenantDefaults, "support.staff_replied");
        const channels: ("EMAIL" | "IN_APP")[] = ["IN_APP"];
        if (pref.email && m.user?.email) channels.push("EMAIL");

        await sendNotification({
          kind: "support.staff_reply",
          channels,
          to: m.user?.email ?? undefined,
          tenantId: ticket.tenantId,
          userId: m.userId,
          // Keep the legacy bell type so old + new rows render with the
          // same icon/color in the inbox. Callers can decouple from the
          // kind name when the legacy label is materially different.
          inAppType: "support.staff_replied",
          link: bellLink,
          entityType: "SupportTicket",
          entityId: ticket.id,
          tokens: {
            ticket_subject: ticket.subject,
            staff_name:     authorEmail,
            reply_preview:  parsed.data.body,
            workspace_name: ticket.tenant.name,
            ticket_url:     ticketUrl,
          },
        });
      }),
    );
  }

  await logAudit({
    tenantId: ticket.tenantId,
    userId: authorUserId,
    action: isInternal ? "platform.support_internal_note" : "platform.support_reply",
    entityType: "SupportTicket",
    entityId: ticket.id,
    metadata: { actor: authorEmail, nextStatus, internal: isInternal },
  });

  revalidatePath(`/platform/support/${ticket.id}`);
  revalidatePath(`/platform/support`);
  revalidatePath(`/platform/tenants/${ticket.tenantId}`);
}

const updateTicketSchema = z.object({
  status:     z.enum(STATUSES).optional(),
  priority:   z.enum(PRIORITIES).optional(),
  assignedTo: z.string().optional().or(z.literal("")),
});

export async function platformUpdateSupportTicket(params: {
  ticketId: string;
  authorUserId: string;
  authorEmail: string;
  formData: FormData;
}) {
  const { ticketId, authorUserId, authorEmail } = params;
  const parsed = updateTicketSchema.safeParse(Object.fromEntries(params.formData.entries()));
  if (!parsed.success) {
    redirect(`/platform/support/${ticketId}?error=${encodeURIComponent("Invalid update")}`);
  }

  const ticket = await db.supportTicket.findUnique({
    where: { id: ticketId },
    select: { id: true, tenantId: true, status: true, priority: true, assignedTo: true, dueBy: true },
  });
  if (!ticket) return;

  const nextStatus   = parsed.data.status   ?? ticket.status;
  const nextPriority = parsed.data.priority ?? ticket.priority;
  // Empty string unassigns; undefined means "leave as is" (the field wasn't in
  // this particular form submit).
  const nextAssigned =
    parsed.data.assignedTo === undefined ? ticket.assignedTo
    : parsed.data.assignedTo === ""      ? null
    : parsed.data.assignedTo;

  if (
    nextStatus === ticket.status &&
    nextPriority === ticket.priority &&
    nextAssigned === ticket.assignedTo
  ) {
    revalidatePath(`/platform/support/${ticket.id}`);
    return;
  }

  // Phase 20 Slice C — SLA recomputation on triage edits:
  //   - status moved into a resting state: clear dueBy (nothing to pace).
  //   - status moved back into an active state with no dueBy: start a fresh
  //     clock off the current priority.
  //   - priority changed while the clock is running: rescale relative to now
  //     so an escalation to URGENT tightens the deadline immediately.
  const active = nextStatus === "OPEN" || nextStatus === "IN_PROGRESS";
  let nextDueBy: Date | null | undefined = undefined;
  if (!active) {
    nextDueBy = null;
  } else if (ticket.dueBy === null) {
    nextDueBy = computeDueBy(nextPriority);
  } else if (nextPriority !== ticket.priority) {
    nextDueBy = computeDueBy(nextPriority);
  }

  await db.supportTicket.update({
    where: { id: ticket.id },
    data: {
      status: nextStatus,
      priority: nextPriority,
      assignedTo: nextAssigned,
      resolvedAt: nextStatus === "RESOLVED" ? new Date() : (nextStatus === "CLOSED" ? undefined : null),
      closedAt:   nextStatus === "CLOSED"   ? new Date() : null,
      ...(nextDueBy !== undefined ? { dueBy: nextDueBy } : {}),
    },
  });

  await logAudit({
    tenantId: ticket.tenantId,
    userId: authorUserId,
    action: "platform.support_ticket_updated",
    entityType: "SupportTicket",
    entityId: ticket.id,
    metadata: {
      actor: authorEmail,
      from: { status: ticket.status, priority: ticket.priority, assignedTo: ticket.assignedTo },
      to:   { status: nextStatus,      priority: nextPriority,   assignedTo: nextAssigned },
    },
  });

  revalidatePath(`/platform/support/${ticket.id}`);
  revalidatePath(`/platform/support`);
}
