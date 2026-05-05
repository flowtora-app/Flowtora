"use server";

// Page 37 — Bug Reports actions.
//
// Author lifecycle (create / update / transition / assign / mark
// duplicate / resolve / release), comments + attachments, tenant-impact
// management, and Sentry sync (local stub).

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
  requirePlatformStaff,
} from "@/lib/platform";
import { synthesizeSentryEnvelope } from "@/server/platform/bugs";

const LIST_ROUTE = "/platform/operations/bugs";
const PERM_WRITE = "support.respond" as const;
const detailRoute = (id: string) => `${LIST_ROUTE}/${id}`;

function splitList(input: string | undefined | null): string[] {
  if (!input) return [];
  return input.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
}

/* ── Create ────────────────────────────────────────────── */

const createSchema = z.object({
  title: z.string().min(1, "Title required").max(200),
  severity: z.enum(["SEV1", "SEV2", "SEV3", "SEV4"]).default("SEV3"),
  module: z.enum([
    "BILLING", "AUTH", "PROOFS", "ORDERS", "INVOICES", "QUOTES",
    "PRODUCTS", "REPORTS", "INTEGRATIONS", "PORTAL", "EMAIL", "ADMIN", "OTHER",
  ]).default("OTHER"),
  environment: z.enum(["PRODUCTION", "STAGING", "SANDBOX"]).default("PRODUCTION"),
  description: z.string().max(20_000).default(""),
  reproSteps: z.string().max(20_000).default(""),
  expected: z.string().max(2000).default(""),
  actual: z.string().max(2000).default(""),
  reporterTenantId: z.string().optional().or(z.literal("")),
  tags: z.string().optional().or(z.literal("")),
});

export async function createBug(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${LIST_ROUTE}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const created = await db.bug.create({
    data: {
      title: d.title,
      severity: d.severity,
      module: d.module,
      environment: d.environment,
      description: d.description,
      reproSteps: d.reproSteps,
      expected: d.expected,
      actual: d.actual,
      reporterUserId: ctx.userId,
      reporterTenantId: d.reporterTenantId || null,
      tags: splitList(d.tags).map((t) => t.toLowerCase()),
      status: "NEW",
    },
    select: { id: true, number: true },
  });
  await db.bugActivity.create({
    data: {
      bugId: created.id,
      action: "created",
      actorId: ctx.userId,
      details: { severity: d.severity, environment: d.environment, module: d.module },
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.bug.created",
    entityType: "Bug",
    entityId: created.id,
    metadata: { actor: ctx.email, number: created.number, severity: d.severity },
  });
  revalidatePath(LIST_ROUTE);
  redirect(`${detailRoute(created.id)}?ok=created`);
}

/* ── Update ────────────────────────────────────────────── */

const updateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  severity: z.enum(["SEV1", "SEV2", "SEV3", "SEV4"]),
  module: z.enum([
    "BILLING", "AUTH", "PROOFS", "ORDERS", "INVOICES", "QUOTES",
    "PRODUCTS", "REPORTS", "INTEGRATIONS", "PORTAL", "EMAIL", "ADMIN", "OTHER",
  ]),
  environment: z.enum(["PRODUCTION", "STAGING", "SANDBOX"]),
  frequency: z.enum(["ALWAYS", "OFTEN", "SOMETIMES", "RARE"]).default("SOMETIMES"),
  description: z.string().max(20_000).default(""),
  reproSteps: z.string().max(20_000).default(""),
  expected: z.string().max(2000).default(""),
  actual: z.string().max(2000).default(""),
  browserOS: z.string().max(200).optional().or(z.literal("")),
  accountContext: z.string().max(2000).optional().or(z.literal("")),
  businessImpact: z.string().max(2000).optional().or(z.literal("")),
  tags: z.string().optional().or(z.literal("")),
  linkedSentryIssueId: z.string().max(120).optional().or(z.literal("")),
  linkedLinearIssueId: z.string().max(120).optional().or(z.literal("")),
  linkedJiraIssueId: z.string().max(120).optional().or(z.literal("")),
});

export async function updateBug(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = updateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const id = formData.get("id");
    redirect(`${detailRoute(String(id))}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const before = await db.bug.findUnique({
    where: { id: d.id },
    select: { severity: true },
  });
  await db.bug.update({
    where: { id: d.id },
    data: {
      title: d.title,
      severity: d.severity,
      module: d.module,
      environment: d.environment,
      frequency: d.frequency,
      description: d.description,
      reproSteps: d.reproSteps,
      expected: d.expected,
      actual: d.actual,
      browserOS: d.browserOS || null,
      accountContext: d.accountContext || null,
      businessImpact: d.businessImpact || null,
      tags: splitList(d.tags).map((t) => t.toLowerCase()),
      linkedSentryIssueId: d.linkedSentryIssueId || null,
      linkedLinearIssueId: d.linkedLinearIssueId || null,
      linkedJiraIssueId: d.linkedJiraIssueId || null,
    },
  });
  if (before && before.severity !== d.severity) {
    await db.bugActivity.create({
      data: {
        bugId: d.id,
        action: "severity_changed",
        actorId: ctx.userId,
        details: { from: before.severity, to: d.severity },
      },
    });
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.bug.updated",
    entityType: "Bug",
    entityId: d.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(LIST_ROUTE);
  revalidatePath(detailRoute(d.id));
  redirect(`${detailRoute(d.id)}?ok=saved`);
}

/* ── Transition (status change) ────────────────────────── */

const transitionSchema = z.object({
  id: z.string().min(1),
  to: z.enum(["NEW", "TRIAGED", "IN_PROGRESS", "IN_REVIEW", "RESOLVED", "RELEASED", "WONT_FIX", "DUPLICATE"]),
  duplicateOfId: z.string().optional().or(z.literal("")),
  returnTo: z.string().optional().or(z.literal("")),
});

export async function transitionBug(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = transitionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const id = formData.get("id");
    redirect(`${detailRoute(String(id))}?error=${encodeURIComponent("Invalid status")}`);
  }
  const { id, to } = parsed.data;
  const now = new Date();
  const before = await db.bug.findUnique({ where: { id }, select: { status: true } });
  await db.bug.update({
    where: { id },
    data: {
      status: to,
      triagedAt: to === "TRIAGED" ? now : undefined,
      startedAt: to === "IN_PROGRESS" ? now : undefined,
      resolvedAt: to === "RESOLVED" ? now : undefined,
      releasedAt: to === "RELEASED" ? now : undefined,
      duplicateOfId: to === "DUPLICATE" ? (parsed.data.duplicateOfId || null) : undefined,
    },
  });
  await db.bugActivity.create({
    data: {
      bugId: id,
      action: "status_changed",
      actorId: ctx.userId,
      details: { from: before?.status ?? "NEW", to },
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: `platform.bug.${to.toLowerCase()}`,
    entityType: "Bug",
    entityId: id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(LIST_ROUTE);
  revalidatePath(detailRoute(id));
  const dest = parsed.data.returnTo && parsed.data.returnTo.startsWith(LIST_ROUTE)
    ? parsed.data.returnTo
    : detailRoute(id);
  const sep = dest.includes("?") ? "&" : "?";
  redirect(`${dest}${sep}ok=transitioned`);
}

/* ── Assign ────────────────────────────────────────────── */

const assignSchema = z.object({
  id: z.string().min(1),
  assigneeUserId: z.string().min(1),
  returnTo: z.string().optional().or(z.literal("")),
});

export async function assignBug(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = assignSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const id = formData.get("id");
    redirect(`${detailRoute(String(id))}?error=${encodeURIComponent("Invalid assignment")}`);
  }
  const { id, assigneeUserId } = parsed.data;
  const target = assigneeUserId === "__unassign__" ? null : assigneeUserId;
  const before = await db.bug.findUnique({ where: { id }, select: { assigneeUserId: true } });
  await db.bug.update({ where: { id }, data: { assigneeUserId: target } });
  await db.bugActivity.create({
    data: {
      bugId: id,
      action: "assignee_changed",
      actorId: ctx.userId,
      details: { from: before?.assigneeUserId ?? null, to: target },
    },
  });
  revalidatePath(detailRoute(id));
  const dest = parsed.data.returnTo && parsed.data.returnTo.startsWith(LIST_ROUTE)
    ? parsed.data.returnTo
    : detailRoute(id);
  const sep = dest.includes("?") ? "&" : "?";
  redirect(`${dest}${sep}ok=reassigned`);
}

/* ── Comment ───────────────────────────────────────────── */

const commentSchema = z.object({
  id: z.string().min(1),
  body: z.string().min(1, "Comment required").max(8_000),
  internal: z.union([z.literal("on"), z.literal("")]).optional(),
});

export async function postBugComment(formData: FormData) {
  const ctx = await requirePlatformStaff();
  const parsed = commentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const id = formData.get("id");
    redirect(`${detailRoute(String(id))}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  await db.bugComment.create({
    data: {
      bugId: parsed.data.id,
      authorId: ctx.userId,
      body: parsed.data.body,
      internal: parsed.data.internal === "on",
    },
  });
  await db.bugActivity.create({
    data: {
      bugId: parsed.data.id,
      action: "commented",
      actorId: ctx.userId,
      details: { internal: parsed.data.internal === "on" },
    },
  });
  revalidatePath(detailRoute(parsed.data.id));
  redirect(`${detailRoute(parsed.data.id)}?tab=activity#comments`);
}

/* ── Attachments (URL-only — uploads handled by host) ── */

const attachmentSchema = z.object({
  id: z.string().min(1),
  url: z.string().url("Must be a valid URL"),
  name: z.string().min(1).max(200),
  mime: z.string().max(80).optional().or(z.literal("")),
});

export async function addBugAttachment(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = attachmentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const id = formData.get("id");
    redirect(`${detailRoute(String(id))}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  await db.bugAttachment.create({
    data: {
      bugId: parsed.data.id,
      url: parsed.data.url,
      name: parsed.data.name,
      mime: parsed.data.mime || null,
      uploadedByUserId: ctx.userId,
    },
  });
  await db.bugActivity.create({
    data: { bugId: parsed.data.id, action: "attachment_added", actorId: ctx.userId, details: { name: parsed.data.name } },
  });
  revalidatePath(detailRoute(parsed.data.id));
  redirect(`${detailRoute(parsed.data.id)}?ok=attached`);
}

const removeAttachmentSchema = z.object({
  attachmentId: z.string().min(1),
  bugId: z.string().min(1),
});

export async function removeBugAttachment(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = removeAttachmentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Invalid")}`);
  await db.bugAttachment.delete({ where: { id: parsed.data.attachmentId } });
  await db.bugActivity.create({
    data: { bugId: parsed.data.bugId, action: "attachment_removed", actorId: ctx.userId, details: {} },
  });
  revalidatePath(detailRoute(parsed.data.bugId));
  redirect(`${detailRoute(parsed.data.bugId)}?ok=detached`);
}

/* ── Resolution ────────────────────────────────────────── */

const resolutionSchema = z.object({
  id: z.string().min(1),
  rootCause: z.string().max(8000).default(""),
  fixDescription: z.string().max(8000).default(""),
  verifiedByUserId: z.string().optional().or(z.literal("")),
  postmortemUrl: z.string().max(500).optional().or(z.literal("")),
});

export async function saveBugResolution(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = resolutionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const id = formData.get("id");
    redirect(`${detailRoute(String(id))}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  await db.bug.update({
    where: { id: parsed.data.id },
    data: {
      rootCause: parsed.data.rootCause || null,
      fixDescription: parsed.data.fixDescription || null,
      verifiedByUserId: parsed.data.verifiedByUserId || null,
      postmortemUrl: parsed.data.postmortemUrl || null,
    },
  });
  await db.bugActivity.create({
    data: { bugId: parsed.data.id, action: "resolution_saved", actorId: ctx.userId, details: {} },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.bug.resolution_saved",
    entityType: "Bug",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(detailRoute(parsed.data.id));
  redirect(`${detailRoute(parsed.data.id)}?tab=resolution&ok=saved`);
}

/* ── Tenant impact ─────────────────────────────────────── */

const impactSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  note: z.string().max(2000).optional().or(z.literal("")),
});

export async function addBugTenantImpact(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = impactSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const id = formData.get("id");
    redirect(`${detailRoute(String(id))}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  await db.bugTenantImpact.upsert({
    where: { bugId_tenantId: { bugId: parsed.data.id, tenantId: parsed.data.tenantId } },
    create: {
      bugId: parsed.data.id,
      tenantId: parsed.data.tenantId,
      note: parsed.data.note || null,
      autoDetected: false,
    },
    update: {
      lastSeenAt: new Date(),
      note: parsed.data.note || null,
    },
  });
  await db.bugActivity.create({
    data: { bugId: parsed.data.id, action: "tenant_impact_added", actorId: ctx.userId, details: { tenantId: parsed.data.tenantId } },
  });
  revalidatePath(detailRoute(parsed.data.id));
  redirect(`${detailRoute(parsed.data.id)}?tab=tenants&ok=tenant-added`);
}

const removeImpactSchema = z.object({
  impactId: z.string().min(1),
  bugId: z.string().min(1),
});

export async function removeBugTenantImpact(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = removeImpactSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Invalid")}`);
  await db.bugTenantImpact.delete({ where: { id: parsed.data.impactId } });
  await db.bugActivity.create({
    data: { bugId: parsed.data.bugId, action: "tenant_impact_removed", actorId: ctx.userId, details: {} },
  });
  revalidatePath(detailRoute(parsed.data.bugId));
  redirect(`${detailRoute(parsed.data.bugId)}?tab=tenants&ok=tenant-removed`);
}

/* ── Sentry / Linear / Jira sync (local stub) ──────────── */

const syncSchema = z.object({ id: z.string().min(1) });

export async function syncBugFromSentry(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = syncSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Invalid")}`);
  const bug = await db.bug.findUnique({
    where: { id: parsed.data.id },
    select: { id: true, title: true, createdAt: true, module: true, linkedSentryIssueId: true, reporterTenantId: true },
  });
  if (!bug) redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Bug not found")}`);
  if (!bug) return;

  const env = synthesizeSentryEnvelope({
    id: bug.id,
    title: bug.title,
    createdAt: bug.createdAt,
    module: bug.module,
    linkedSentryIssueId: bug.linkedSentryIssueId,
  });

  await db.bug.update({
    where: { id: bug.id },
    data: {
      linkedSentryIssueId: env.issueId,
      lastSyncedAt: new Date(),
    },
  });

  // Auto-correlate impacted tenants from the synthetic Sentry tags. In
  // a real integration these come from the issue's `tenant` tag values.
  // For seed/demo we map tag prefixes to real tenant slugs and upsert.
  const tenantSlugCandidates = env.tenantTagsSeen.map((s) => s.replace(/^t-/, ""));
  const tenants = await db.tenant.findMany({
    where: { slug: { in: tenantSlugCandidates } },
    select: { id: true },
  });
  for (const t of tenants) {
    await db.bugTenantImpact.upsert({
      where: { bugId_tenantId: { bugId: bug.id, tenantId: t.id } },
      create: {
        bugId: bug.id,
        tenantId: t.id,
        autoDetected: true,
        firstSeenAt: env.firstSeen,
        lastSeenAt: env.lastSeen,
      },
      update: { lastSeenAt: env.lastSeen },
    });
  }

  await db.bugActivity.create({
    data: {
      bugId: bug.id,
      action: "sentry_synced",
      actorId: ctx.userId,
      details: { issueId: env.issueId, count: env.count, userCount: env.userCount },
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.bug.sentry_synced",
    entityType: "Bug",
    entityId: bug.id,
    metadata: { actor: ctx.email, issueId: env.issueId },
  });
  revalidatePath(detailRoute(bug.id));
  redirect(`${detailRoute(bug.id)}?tab=linked&ok=synced`);
}
