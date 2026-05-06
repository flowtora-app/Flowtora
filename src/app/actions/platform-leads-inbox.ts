"use server";

// Page 44 — Lead Inbox actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import { computeLeadScore } from "@/server/platform/leads-inbox";
import type {
  MarketingLeadStatus,
  LeadActivityKind,
} from "@prisma/client";

const ROUTE = "/platform/marketing/leads";
const PERM = "leads.manage" as const;
const detailRoute = (id: string) => `${ROUTE}/${id}`;

const STATUS_VALUES = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "DISQUALIFIED", "SPAM"] as const;

/* ── Per-lead profile edit ───────────────────────────── */

const profileSchema = z.object({
  id:       z.string().min(1),
  name:     z.string().max(200).optional().or(z.literal("")),
  company:  z.string().max(200).optional().or(z.literal("")),
  role:     z.string().max(100).optional().or(z.literal("")),
  phone:    z.string().max(40).optional().or(z.literal("")),
  region:   z.string().max(100).optional().or(z.literal("")),
  industry: z.string().max(100).optional().or(z.literal("")),
  tagsRaw:  z.string().max(500).optional().or(z.literal("")),
  notes:    z.string().max(5000).optional().or(z.literal("")),
});

export async function updateLeadProfile(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = profileSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const tags = (d.tagsRaw ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  await db.marketingLead.update({
    where: { id: d.id },
    data: {
      name:     d.name     || null,
      company:  d.company  || null,
      role:     d.role     || null,
      phone:    d.phone    || null,
      region:   d.region   || null,
      industry: d.industry || null,
      tags,
      notes:    d.notes    || null,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.lead.profile_updated",
    entityType: "MarketingLead",
    entityId: d.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(detailRoute(d.id));
  revalidatePath(ROUTE);
  redirect(`${detailRoute(d.id)}?ok=profile-updated`);
}

/* ── Status change ──────────────────────────────────── */

const statusSchema = z.object({
  id:                 z.string().min(1),
  status:             z.enum(STATUS_VALUES),
  disqualifiedReason: z.string().max(500).optional().or(z.literal("")),
});

export async function changeLeadStatus(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = statusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const { id, status, disqualifiedReason } = parsed.data;
  const lead = await db.marketingLead.findUnique({ where: { id } });
  if (!lead) redirect(`${ROUTE}?error=not-found`);

  const data: Record<string, unknown> = { status: status as MarketingLeadStatus };
  if (status === "DISQUALIFIED") data.disqualifiedReason = disqualifiedReason || null;
  if (status === "QUALIFIED" && lead.sqlAt == null) data.sqlAt = new Date();
  if (status === "CONVERTED" && lead.convertedAt == null) data.convertedAt = new Date();

  await db.marketingLead.update({ where: { id }, data });
  await db.leadActivity.create({
    data: {
      leadId: id,
      kind: "STATUS_CHANGED",
      detail: `Status changed: ${lead.status} → ${status}`,
      metadata: { from: lead.status, to: status },
    },
  });
  await db.leadRoutingEvent.create({
    data: {
      leadId: id,
      ruleName: "Manual status change",
      action: status,
      detail: disqualifiedReason || `Set by ${ctx.email}`,
    },
  });
  await touchLastActivity(id);
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.lead.status_changed",
    entityType: "MarketingLead",
    entityId: id,
    metadata: { actor: ctx.email, from: lead.status, to: status },
  });
  revalidatePath(detailRoute(id));
  revalidatePath(ROUTE);
  redirect(`${detailRoute(id)}?ok=status-changed`);
}

/* ── Assignment ─────────────────────────────────────── */

const assignSchema = z.object({
  id:      z.string().min(1),
  ownerId: z.string().optional().or(z.literal("")), // empty = unassign
});

export async function assignLead(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = assignSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const { id, ownerId } = parsed.data;
  const lead = await db.marketingLead.findUnique({ where: { id } });
  if (!lead) redirect(`${ROUTE}?error=not-found`);

  let ownerLabel = "Unassigned";
  if (ownerId) {
    const owner = await db.user.findUnique({ where: { id: ownerId }, select: { name: true, email: true } });
    if (!owner) redirect(`${ROUTE}?error=owner-not-found`);
    ownerLabel = owner.name || owner.email;
  }

  await db.marketingLead.update({
    where: { id },
    data: { assignedToUserId: ownerId || null },
  });
  await db.leadActivity.create({
    data: {
      leadId: id,
      kind: "ASSIGNED",
      detail: `Assigned to ${ownerLabel}`,
      metadata: { ownerId: ownerId || null },
    },
  });
  await db.leadRoutingEvent.create({
    data: {
      leadId: id,
      ruleName: "Manual assignment",
      action: "ROUTED_TO",
      detail: ownerLabel,
    },
  });
  await touchLastActivity(id);
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.lead.assigned",
    entityType: "MarketingLead",
    entityId: id,
    metadata: { actor: ctx.email, ownerId: ownerId || null, ownerLabel },
  });
  revalidatePath(detailRoute(id));
  revalidatePath(ROUTE);
  redirect(`${detailRoute(id)}?ok=assigned`);
}

/* ── Convert to tenant trial ────────────────────────── */

const convertSchema = z.object({
  id:        z.string().min(1),
  tenantId:  z.string().min(1, "Tenant required"),
});

export async function convertLeadToTrial(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = convertSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const id = formData.get("id");
    redirect(`${detailRoute(String(id ?? ""))}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const { id, tenantId } = parsed.data;
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, slug: true } });
  if (!tenant) redirect(`${detailRoute(id)}?error=tenant-not-found`);
  await db.marketingLead.update({
    where: { id },
    data: {
      status: "CONVERTED",
      convertedAt: new Date(),
      convertedTenantId: tenantId,
    },
  });
  await db.leadActivity.create({
    data: {
      leadId: id,
      kind: "CONVERTED",
      detail: `Converted to tenant ${tenant.name}`,
      url: `/platform/tenants/${tenant.slug}`,
      metadata: { tenantId: tenant.id },
    },
  });
  await db.leadRoutingEvent.create({
    data: {
      leadId: id,
      ruleName: "Manual conversion",
      action: "CONVERTED",
      detail: `Linked to tenant ${tenant.slug}`,
    },
  });
  await touchLastActivity(id);
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.lead.converted",
    entityType: "MarketingLead",
    entityId: id,
    metadata: { actor: ctx.email, tenantId },
  });
  revalidatePath(detailRoute(id));
  revalidatePath(ROUTE);
  redirect(`${detailRoute(id)}?ok=converted`);
}

/* ── Add note ───────────────────────────────────────── */

const noteSchema = z.object({
  id:   z.string().min(1),
  body: z.string().min(1).max(5000),
});

export async function addLeadNote(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = noteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const { id, body } = parsed.data;
  // Append to running notes ledger.
  const lead = await db.marketingLead.findUnique({ where: { id }, select: { notes: true } });
  const author = ctx.email;
  const dateStr = new Date().toLocaleString();
  const entry = `[${dateStr} · ${author}]\n${body}`;
  const newNotes = lead?.notes ? `${lead.notes}\n\n${entry}` : entry;
  await db.marketingLead.update({ where: { id }, data: { notes: newNotes } });
  await db.leadActivity.create({
    data: {
      leadId: id,
      kind: "NOTE_ADDED",
      detail: body.length > 80 ? body.slice(0, 80) + "…" : body,
    },
  });
  await touchLastActivity(id);
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.lead.note_added",
    entityType: "MarketingLead",
    entityId: id,
    metadata: { actor: ctx.email, length: body.length },
  });
  revalidatePath(detailRoute(id));
  redirect(`${detailRoute(id)}?ok=note-added`);
}

/* ── Send email ─────────────────────────────────────── */

const emailSchema = z.object({
  id:      z.string().min(1),
  subject: z.string().min(1).max(200),
  body:    z.string().min(1).max(20_000),
});

export async function sendLeadEmail(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = emailSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const id = formData.get("id");
    redirect(`${detailRoute(String(id ?? ""))}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const { id, subject, body } = parsed.data;
  const lead = await db.marketingLead.findUnique({ where: { id }, select: { email: true } });
  if (!lead) redirect(`${detailRoute(id)}?error=not-found`);
  await db.leadEmailMessage.create({
    data: {
      leadId: id,
      direction: "OUT",
      subject,
      body,
      fromEmail: ctx.email ?? "noreply@flowtora.com",
      toEmail: lead.email,
      authorId: ctx.userId,
    },
  });
  await db.leadActivity.create({
    data: {
      leadId: id,
      kind: "EMAIL_SENT",
      detail: `Sent: ${subject}`,
      metadata: { subject },
    },
  });
  // Stamp first-contact when relevant.
  await db.marketingLead.update({
    where: { id },
    data: {
      firstContactedAt: { set: undefined } as never, // safeguard for already-set columns
      lastContactedAt: new Date(),
    },
  }).catch(() => {});
  await db.marketingLead.updateMany({
    where: { id, firstContactedAt: null },
    data: { firstContactedAt: new Date() },
  });
  await touchLastActivity(id);
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.lead.email_sent",
    entityType: "MarketingLead",
    entityId: id,
    metadata: { actor: ctx.email, subject, length: body.length },
  });
  revalidatePath(detailRoute(id));
  redirect(`${detailRoute(id)}?ok=email-sent`);
}

/* ── Tasks ───────────────────────────────────────── */

const taskCreateSchema = z.object({
  leadId: z.string().min(1),
  title:  z.string().min(1).max(200),
  notes:  z.string().max(2000).optional().or(z.literal("")),
  dueAt:  z.string().optional().or(z.literal("")),
  ownerId: z.string().optional().or(z.literal("")),
});

export async function createLeadTask(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = taskCreateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const id = formData.get("leadId");
    redirect(`${detailRoute(String(id ?? ""))}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const { leadId, title, notes, dueAt, ownerId } = parsed.data;
  const due = dueAt ? new Date(dueAt) : null;
  await db.leadTask.create({
    data: {
      leadId,
      title,
      notes: notes || null,
      dueAt: due && !isNaN(due.getTime()) ? due : null,
      assignedToUserId: ownerId || ctx.userId,
      createdById: ctx.userId,
    },
  });
  await touchLastActivity(leadId);
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.lead.task_created",
    entityType: "MarketingLead",
    entityId: leadId,
    metadata: { actor: ctx.email, title },
  });
  revalidatePath(detailRoute(leadId));
  redirect(`${detailRoute(leadId)}?ok=task-created`);
}

const taskCompleteSchema = z.object({
  id:     z.string().min(1),
  leadId: z.string().min(1),
});
export async function completeLeadTask(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = taskCompleteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const { id, leadId } = parsed.data;
  const t = await db.leadTask.findUnique({ where: { id }, select: { title: true } });
  await db.leadTask.update({ where: { id }, data: { completedAt: new Date() } });
  await db.leadActivity.create({
    data: {
      leadId,
      kind: "TASK_COMPLETED",
      detail: t?.title ? `Completed: ${t.title}` : "Task completed",
    },
  });
  await touchLastActivity(leadId);
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.lead.task_completed",
    entityType: "LeadTask",
    entityId: id,
    metadata: { actor: ctx.email, leadId },
  });
  revalidatePath(detailRoute(leadId));
  redirect(`${detailRoute(leadId)}?ok=task-completed`);
}

const taskDeleteSchema = z.object({
  id:     z.string().min(1),
  leadId: z.string().min(1),
});
export async function deleteLeadTask(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = taskDeleteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const { id, leadId } = parsed.data;
  await db.leadTask.delete({ where: { id } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.lead.task_deleted",
    entityType: "LeadTask",
    entityId: id,
    metadata: { actor: ctx.email, leadId },
  });
  revalidatePath(detailRoute(leadId));
  redirect(`${detailRoute(leadId)}?ok=task-deleted`);
}

/* ── Score recompute ────────────────────────────────── */

const recomputeSchema = z.object({ id: z.string().min(1) });

export async function recomputeLeadScore(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = recomputeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const { id } = parsed.data;
  await runRecomputeForLead(id);
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.lead.score_recomputed",
    entityType: "MarketingLead",
    entityId: id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(detailRoute(id));
  redirect(`${detailRoute(id)}?ok=score-recomputed`);
}

async function runRecomputeForLead(id: string) {
  const lead = await db.marketingLead.findUnique({ where: { id } });
  if (!lead) return;
  const counts = await db.leadActivity.groupBy({
    by: ["kind"],
    where: { leadId: id },
    _count: { _all: true },
  });
  const get = (kind: LeadActivityKind) => counts.find((c) => c.kind === kind)?._count._all ?? 0;
  const result = computeLeadScore({
    hasCompany: !!lead.company,
    hasPhone:   !!lead.phone,
    teamSize:   lead.teamSize,
    hasMessage: !!lead.message,
    source:     lead.kind,
    pageViews:        get("PAGE_VIEW"),
    formSubmits:      get("FORM_SUBMIT"),
    emailOpens:       get("EMAIL_OPENED"),
    emailClicks:      get("EMAIL_CLICKED"),
    meetingsScheduled: get("MEETING_SCHEDULED"),
    callsLogged:      get("CALL_MADE") + get("CALL_RECEIVED"),
    daysSinceCreate:  Math.max(0, Math.floor((Date.now() - lead.createdAt.getTime()) / 86_400_000)),
  });
  // MQL/SQL gates — score >= 40 → MQL stamp; status QUALIFIED → SQL stamp.
  const data: Record<string, unknown> = {
    score: result.score,
    scoreFactors: result.factors,
  };
  if (lead.mqlAt == null && result.score >= 40) data.mqlAt = new Date();
  if (lead.sqlAt == null && (lead.status === "QUALIFIED" || lead.status === "CONVERTED")) data.sqlAt = new Date();

  await db.marketingLead.update({ where: { id }, data });
  await db.leadActivity.create({
    data: {
      leadId: id,
      kind: "SCORE_UPDATED",
      detail: `Score → ${result.score}`,
      metadata: { score: result.score, factorCount: result.factors.length },
    },
  });
  // If score crossed an MQL gate, log a routing event.
  if (lead.mqlAt == null && result.score >= 40) {
    await db.leadRoutingEvent.create({
      data: {
        leadId: id,
        ruleName: "MQL gate (score ≥ 40)",
        action: "QUALIFIED",
        detail: `Score reached ${result.score} — promoted to MQL.`,
      },
    });
  }
  await touchLastActivity(id);
}

/* ── Bulk actions ───────────────────────────────────── */

const bulkSchema = z.object({
  ids: z.string().min(1), // comma-separated
});

const bulkAssignSchema = bulkSchema.extend({
  ownerId: z.string().optional().or(z.literal("")),
});

export async function bulkAssignLeads(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = bulkAssignSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const { ids, ownerId } = parsed.data;
  const idList = ids.split(",").filter(Boolean);
  if (idList.length === 0) redirect(`${ROUTE}?error=no-leads-selected`);
  await db.marketingLead.updateMany({
    where: { id: { in: idList } },
    data: { assignedToUserId: ownerId || null },
  });
  for (const id of idList) {
    await db.leadActivity.create({
      data: { leadId: id, kind: "ASSIGNED", detail: ownerId ? `Bulk assigned` : "Bulk unassigned" },
    });
    await touchLastActivity(id);
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.lead.bulk_assigned",
    entityType: "MarketingLead",
    entityId: "*",
    metadata: { actor: ctx.email, count: idList.length, ownerId: ownerId || null },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=bulk-assigned-${idList.length}`);
}

const bulkTagSchema = bulkSchema.extend({
  tag: z.string().min(1).max(50),
});

export async function bulkTagLeads(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = bulkTagSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const { ids, tag } = parsed.data;
  const idList = ids.split(",").filter(Boolean);
  if (idList.length === 0) redirect(`${ROUTE}?error=no-leads-selected`);
  for (const id of idList) {
    const lead = await db.marketingLead.findUnique({ where: { id }, select: { tags: true } });
    if (!lead) continue;
    if (!lead.tags.includes(tag)) {
      await db.marketingLead.update({
        where: { id },
        data: { tags: { set: [...lead.tags, tag] } },
      });
      await db.leadActivity.create({
        data: { leadId: id, kind: "TAG_ADDED", detail: `Added tag "${tag}"`, metadata: { tag } },
      });
      await touchLastActivity(id);
    }
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.lead.bulk_tagged",
    entityType: "MarketingLead",
    entityId: "*",
    metadata: { actor: ctx.email, count: idList.length, tag },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=bulk-tagged-${idList.length}`);
}

const bulkDisqualifySchema = bulkSchema.extend({
  reason: z.string().max(500).optional().or(z.literal("")),
});
export async function bulkDisqualifyLeads(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = bulkDisqualifySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const { ids, reason } = parsed.data;
  const idList = ids.split(",").filter(Boolean);
  if (idList.length === 0) redirect(`${ROUTE}?error=no-leads-selected`);
  await db.marketingLead.updateMany({
    where: { id: { in: idList } },
    data: { status: "DISQUALIFIED", disqualifiedReason: reason || null },
  });
  for (const id of idList) {
    await db.leadActivity.create({
      data: { leadId: id, kind: "STATUS_CHANGED", detail: `Bulk disqualified${reason ? ": " + reason : ""}` },
    });
    await db.leadRoutingEvent.create({
      data: { leadId: id, ruleName: "Bulk disqualify", action: "DISQUALIFIED", detail: reason || null },
    });
    await touchLastActivity(id);
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.lead.bulk_disqualified",
    entityType: "MarketingLead",
    entityId: "*",
    metadata: { actor: ctx.email, count: idList.length },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=bulk-disqualified-${idList.length}`);
}

/* ── Helpers ────────────────────────────────────────── */

async function touchLastActivity(id: string) {
  await db.marketingLead.update({
    where: { id },
    data: { lastActivityAt: new Date() },
  }).catch(() => {});
}
