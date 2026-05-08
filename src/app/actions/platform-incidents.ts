"use server";

// Page 54 — Incident Log actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import type {
  IncidentSeverity,
  IncidentStatus,
  IncidentDetectedBy,
  IncidentTimelineKind,
  AffectedNotificationStatus,
  IncidentCommChannel,
  IncidentCommStatus,
  ActionItemStatus,
  StatusPageComponentStatus,
  StatusPageMaintenanceState,
  RunbookStatus,
} from "@prisma/client";

const ROUTE = "/platform/security/incidents";
const PERM_READ = "incidents.read" as const;
const PERM_MANAGE = "incidents.manage" as const;
const PERM_PM = "incidents.postmortem.write" as const;
const PERM_SP = "incidents.statuspage.write" as const;

const SEVERITIES = ["SEV1", "SEV2", "SEV3", "SEV4"] as const;
const STATUSES = ["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"] as const;
const DETECTED_BYS = [
  "ALERT", "CUSTOMER_REPORT", "INTERNAL", "SYNTHETIC_CHECK",
  "MANUAL", "PARTNER", "SECURITY_FEED",
] as const;
const TIMELINE_KINDS = [
  "STATUS_CHANGE", "COMMS_SENT", "MITIGATION", "ROLE_ASSIGNED",
  "NOTE", "DEPLOY", "FLAG_TOGGLE", "PAGE_FIRED", "ALERT", "HANDOFF", "RESOLUTION",
] as const;
const COMM_CHANNELS = ["STATUS_PAGE", "EMAIL", "TWITTER_X", "IN_APP", "SLACK"] as const;
const COMM_STATUSES = ["DRAFT", "PUBLISHED", "RETRACTED"] as const;
const ACTION_STATUSES = ["TODO", "IN_PROGRESS", "DONE", "CANCELLED", "BLOCKED"] as const;
const COMPONENT_STATUSES = ["OPERATIONAL", "DEGRADED", "PARTIAL_OUTAGE", "MAJOR_OUTAGE", "MAINTENANCE"] as const;
const MAINT_STATES = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
const RUNBOOK_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;

/* ── Open / declare incident ──────────────────────────── */

const openSchema = z.object({
  title:       z.string().min(1).max(200),
  summary:     z.string().max(2000).optional(),
  severity:    z.enum(SEVERITIES),
  detectedBy:  z.enum(DETECTED_BYS),
  services:    z.string().optional(),
  tags:        z.string().optional(),
  startedAt:   z.string().optional(),
});

export async function declareIncident(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = openSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const services = (d.services ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const tags     = (d.tags ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const externalId = `INC-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9999) + 1).padStart(4, "0")}`;
  const startedAt = d.startedAt ? new Date(d.startedAt) : new Date();
  const sev = d.severity as IncidentSeverity;
  const postmortemDays = sev === "SEV1" ? 7 : sev === "SEV2" ? 10 : 14;
  const created = await db.incident.create({
    data: {
      externalId,
      title: d.title,
      summary: d.summary || null,
      severity: sev,
      status: "INVESTIGATING",
      detectedBy: d.detectedBy as IncidentDetectedBy,
      services,
      tags,
      startedAt,
      detectedAt: new Date(),
      postmortemRequired: sev === "SEV1" || sev === "SEV2",
      postmortemDueAt: new Date(Date.now() + postmortemDays * 86_400_000),
      commanderId: ctx.userId,
    },
    select: { id: true, externalId: true },
  });
  await db.incidentTimelineEvent.create({
    data: {
      incidentId: created.id,
      kind: "STATUS_CHANGE",
      body: `Incident declared (${sev}) — status INVESTIGATING`,
      actor: ctx.email.split("@")[0]!,
      actorEmail: ctx.email,
      source: "Manual",
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.incident.declared",
    entityType: "Incident", entityId: created.id,
    metadata: { actor: ctx.email, externalId: created.externalId, severity: sev },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${created.id}?ok=incident-declared`);
}

/* ── Set status ───────────────────────────────────────── */

const setStatusSchema = z.object({
  id:     z.string().min(1),
  status: z.enum(STATUSES),
  note:   z.string().max(2000).optional(),
});

export async function setIncidentStatus(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = setStatusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const d = parsed.data;
  const status = d.status as IncidentStatus;
  const now = new Date();
  const r = await db.incident.findUnique({ where: { id: d.id } });
  if (!r) redirect(`${ROUTE}?error=Not-found`);
  const dur = status === "RESOLVED"
    ? Math.max(0, Math.round((now.getTime() - r!.startedAt.getTime()) / 60_000))
    : r!.durationMin;
  await db.incident.update({
    where: { id: d.id },
    data: {
      status,
      identifiedAt: status === "IDENTIFIED" || status === "MONITORING" || status === "RESOLVED"
        ? r!.identifiedAt ?? now : undefined,
      monitoringAt: status === "MONITORING" || status === "RESOLVED"
        ? r!.monitoringAt ?? now : undefined,
      resolvedAt:   status === "RESOLVED" ? now : null,
      durationMin:  dur,
    },
  });
  await db.incidentTimelineEvent.create({
    data: {
      incidentId: d.id,
      kind: status === "RESOLVED" ? "RESOLUTION" : "STATUS_CHANGE",
      body: d.note ?? `Status set to ${status}`,
      actor: ctx.email.split("@")[0]!,
      actorEmail: ctx.email,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.incident.status_set",
    entityType: "Incident", entityId: d.id,
    metadata: { actor: ctx.email, status },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${d.id}?ok=status-${status.toLowerCase()}`);
}

/* ── Assign roles ─────────────────────────────────────── */

const rolesSchema = z.object({
  id:           z.string().min(1),
  commanderId:  z.string().optional().or(z.literal("")),
  scribeId:     z.string().optional().or(z.literal("")),
  commsLeadId:  z.string().optional().or(z.literal("")),
});

export async function assignIncidentRoles(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = rolesSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const d = parsed.data;
  await db.incident.update({
    where: { id: d.id },
    data: {
      commanderId:  d.commanderId  || null,
      scribeId:     d.scribeId     || null,
      commsLeadId:  d.commsLeadId  || null,
    },
  });
  await db.incidentTimelineEvent.create({
    data: {
      incidentId: d.id,
      kind: "ROLE_ASSIGNED",
      body: `Roles assigned (IC=${d.commanderId ? "set" : "—"}, Scribe=${d.scribeId ? "set" : "—"}, Comms=${d.commsLeadId ? "set" : "—"})`,
      actor: ctx.email.split("@")[0]!,
      actorEmail: ctx.email,
    },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${d.id}?ok=roles-assigned`);
}

/* ── Add timeline event ───────────────────────────────── */

const timelineSchema = z.object({
  id:    z.string().min(1),
  kind:  z.enum(TIMELINE_KINDS),
  body:  z.string().min(1).max(2000),
  source: z.string().max(60).optional(),
});

export async function addTimelineEvent(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = timelineSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const d = parsed.data;
  await db.incidentTimelineEvent.create({
    data: {
      incidentId: d.id,
      kind: d.kind as IncidentTimelineKind,
      body: d.body,
      source: d.source || null,
      actor: ctx.email.split("@")[0]!,
      actorEmail: ctx.email,
    },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${d.id}?ok=timeline-added`);
}

/* ── Add affected service / tenant ────────────────────── */

const addAffectedSvcSchema = z.object({
  id:          z.string().min(1),
  serviceName: z.string().min(1).max(100),
  status:      z.enum(COMPONENT_STATUSES),
  region:      z.string().max(40).optional(),
});

export async function addAffectedService(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = addAffectedSvcSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const d = parsed.data;
  await db.incidentAffectedService.upsert({
    where: { incidentId_serviceName: { incidentId: d.id, serviceName: d.serviceName } },
    create: {
      incidentId: d.id,
      serviceName: d.serviceName,
      componentStatus: d.status as StatusPageComponentStatus,
      region: d.region || null,
    },
    update: {
      componentStatus: d.status as StatusPageComponentStatus,
      region: d.region || null,
    },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${d.id}?ok=service-added`);
}

const addAffectedTenSchema = z.object({
  id:        z.string().min(1),
  tenantId:  z.string().min(1),
  notes:     z.string().max(500).optional(),
});

export async function addAffectedTenant(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = addAffectedTenSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const d = parsed.data;
  const t = await db.tenant.findUnique({ where: { id: d.tenantId }, select: { name: true } });
  await db.incidentAffectedTenant.upsert({
    where: { incidentId_tenantId: { incidentId: d.id, tenantId: d.tenantId } },
    create: {
      incidentId: d.id, tenantId: d.tenantId,
      tenantName: t?.name ?? "(unknown)",
      notes: d.notes || null,
    },
    update: { notes: d.notes || null },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${d.id}?ok=tenant-added`);
}

/* ── Comms ────────────────────────────────────────────── */

const commSchema = z.object({
  id:       z.string().min(1),
  channel:  z.enum(COMM_CHANNELS),
  subject:  z.string().max(200).optional(),
  body:     z.string().min(1).max(20_000),
  publish:  z.union([z.literal("on"), z.literal("")]).optional(),
});

export async function saveComm(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_SP);
  const parsed = commSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const d = parsed.data;
  const status: IncidentCommStatus = d.publish === "on" ? "PUBLISHED" : "DRAFT";
  const created = await db.incidentComm.create({
    data: {
      incidentId: d.id,
      channel: d.channel as IncidentCommChannel,
      status,
      subject: d.subject || null,
      body: d.body,
      authorId: ctx.userId,
      authorName: ctx.email.split("@")[0]!,
      publishedAt: status === "PUBLISHED" ? new Date() : null,
      audienceSize: d.channel === "EMAIL" ? Math.floor(Math.random() * 5000) + 50 : null,
    },
  });
  if (status === "PUBLISHED") {
    await db.incidentTimelineEvent.create({
      data: {
        incidentId: d.id,
        kind: "COMMS_SENT",
        body: `${d.channel} update published${d.subject ? `: ${d.subject}` : ""}`,
        actor: ctx.email.split("@")[0]!,
        actorEmail: ctx.email,
      },
    });
  }
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.incident.comm_saved",
    entityType: "IncidentComm", entityId: created.id,
    metadata: { actor: ctx.email, channel: d.channel, status },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${d.id}?ok=comm-${status.toLowerCase()}`);
}

const publishCommSchema = z.object({ id: z.string().min(1) });

export async function publishComm(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_SP);
  const parsed = publishCommSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const c = await db.incidentComm.findUnique({ where: { id: parsed.data.id } });
  if (!c) redirect(`${ROUTE}?error=Not-found`);
  await db.incidentComm.update({
    where: { id: parsed.data.id },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });
  await db.incidentTimelineEvent.create({
    data: {
      incidentId: c!.incidentId,
      kind: "COMMS_SENT",
      body: `${c!.channel} update published${c!.subject ? `: ${c!.subject}` : ""}`,
      actor: ctx.email.split("@")[0]!,
      actorEmail: ctx.email,
    },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${c!.incidentId}?ok=comm-published`);
}

/* ── Mitigations ──────────────────────────────────────── */

const mitigationSchema = z.object({
  id:          z.string().min(1),
  title:       z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  kind:        z.string().max(40).optional(),
  reference:   z.string().max(200).optional(),
  effective:   z.union([z.literal("on"), z.literal("")]).optional(),
});

export async function addMitigation(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = mitigationSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const d = parsed.data;
  await db.incidentMitigation.create({
    data: {
      incidentId: d.id,
      title: d.title,
      description: d.description || null,
      kind: d.kind || null,
      reference: d.reference || null,
      effective: d.effective !== "",
      appliedById: ctx.userId,
    },
  });
  await db.incidentTimelineEvent.create({
    data: {
      incidentId: d.id,
      kind: "MITIGATION",
      body: `Mitigation: ${d.title}${d.kind ? ` (${d.kind})` : ""}`,
      actor: ctx.email.split("@")[0]!,
      actorEmail: ctx.email,
    },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${d.id}?ok=mitigation-added`);
}

/* ── Postmortem ──────────────────────────────────────── */

const postmortemSchema = z.object({
  id:               z.string().min(1),
  body:             z.string().min(1).max(50_000),
  customerSummary:  z.string().max(5000).optional(),
  publish:          z.union([z.literal("on"), z.literal("")]).optional(),
});

export async function savePostmortem(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_PM);
  const parsed = postmortemSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const d = parsed.data;
  const publish = d.publish === "on";
  await db.incident.update({
    where: { id: d.id },
    data: {
      postmortemBody: d.body,
      customerSummary: d.customerSummary || null,
      postmortemPublishedAt: publish ? new Date() : null,
      postmortemUrl: publish
        ? `https://docs.flowtora.com/incidents/${d.id}/postmortem.pdf`
        : null,
    },
  });
  await db.incidentTimelineEvent.create({
    data: {
      incidentId: d.id,
      kind: "NOTE",
      body: publish ? "Postmortem published" : "Postmortem draft saved",
      actor: ctx.email.split("@")[0]!,
      actorEmail: ctx.email,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: publish ? "platform.incident.postmortem_published" : "platform.incident.postmortem_saved",
    entityType: "Incident", entityId: d.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${d.id}?ok=postmortem-${publish ? "published" : "saved"}`);
}

/* ── Action items ─────────────────────────────────────── */

const actionItemSchema = z.object({
  id:           z.string().min(1),
  itemId:       z.string().optional(),
  title:        z.string().min(1).max(200),
  description:  z.string().max(2000).optional(),
  ownerEmail:   z.string().email().optional().or(z.literal("")),
  externalRef:  z.string().max(60).optional(),
  status:       z.enum(ACTION_STATUSES),
  dueAt:        z.string().optional(),
});

export async function saveActionItem(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_PM);
  const parsed = actionItemSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const d = parsed.data;
  const data = {
    title: d.title,
    description: d.description || null,
    ownerEmail: d.ownerEmail || null,
    externalRef: d.externalRef || null,
    status: d.status as ActionItemStatus,
    dueAt: d.dueAt ? new Date(d.dueAt) : null,
    completedAt: d.status === "DONE" ? new Date() : null,
  };
  if (d.itemId) {
    await db.incidentActionItem.update({ where: { id: d.itemId }, data });
  } else {
    await db.incidentActionItem.create({ data: { ...data, incidentId: d.id } });
  }
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${d.id}?ok=action-item-saved`);
}

const setActionStatusSchema = z.object({
  id:     z.string().min(1),
  itemId: z.string().min(1),
  status: z.enum(ACTION_STATUSES),
});

export async function setActionItemStatus(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_PM);
  const parsed = setActionStatusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const d = parsed.data;
  await db.incidentActionItem.update({
    where: { id: d.itemId },
    data: {
      status: d.status as ActionItemStatus,
      completedAt: d.status === "DONE" ? new Date() : null,
    },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${d.id}?ok=action-status-set`);
}

/* ── Status page ──────────────────────────────────────── */

const componentSchema = z.object({
  id:          z.string().optional(),
  slug:        z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
  name:        z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  position:    z.coerce.number().int().min(0).max(999),
  status:      z.enum(COMPONENT_STATUSES),
  publiclyListed: z.union([z.literal("on"), z.literal("")]).optional(),
  parentId:    z.string().optional(),
  region:      z.string().max(40).optional(),
});

export async function saveStatusPageComponent(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_SP);
  const parsed = componentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=status_page&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const data = {
    name: d.name,
    description: d.description || null,
    position: d.position,
    status: d.status as StatusPageComponentStatus,
    publiclyListed: d.publiclyListed === "on",
    parentId: d.parentId || null,
    region: d.region || null,
  };
  await db.statusPageComponent.upsert({
    where: { slug: d.slug },
    create: { slug: d.slug, ...data },
    update: data,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.statuspage.component_saved",
    entityType: "StatusPageComponent", entityId: d.slug,
    metadata: { actor: ctx.email, slug: d.slug, status: d.status },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=status_page&ok=component-saved`);
}

const maintenanceSchema = z.object({
  id:        z.string().optional(),
  title:     z.string().min(1).max(200),
  body:      z.string().min(1).max(20_000),
  startsAt:  z.string().min(1),
  endsAt:    z.string().min(1),
  state:     z.enum(MAINT_STATES),
  componentSlugs: z.string().optional(),
});

export async function saveMaintenance(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_SP);
  const parsed = maintenanceSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=status_page&error=Invalid`);
  const d = parsed.data;
  const slugs = (d.componentSlugs ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const data = {
    title: d.title,
    body: d.body,
    startsAt: new Date(d.startsAt),
    endsAt: new Date(d.endsAt),
    state: d.state as StatusPageMaintenanceState,
    componentSlugs: slugs,
  };
  if (d.id) {
    await db.statusPageMaintenance.update({ where: { id: d.id }, data });
  } else {
    await db.statusPageMaintenance.create({ data });
  }
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.statuspage.maintenance_saved",
    entityType: "StatusPageMaintenance", entityId: d.id ?? "(new)",
    metadata: { actor: ctx.email, state: d.state },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=status_page&ok=maintenance-saved`);
}

/* ── Runbooks ────────────────────────────────────────── */

const runbookSchema = z.object({
  id:         z.string().optional(),
  slug:       z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
  title:      z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  body:       z.string().min(1),
  status:     z.enum(RUNBOOK_STATUSES),
  service:    z.string().max(80).optional(),
  tags:       z.string().optional(),
  ownerEmail: z.string().email().optional().or(z.literal("")),
  nextReviewAt: z.string().optional(),
});

export async function saveRunbook(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = runbookSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=runbooks&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const tags = (d.tags ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const data = {
    title: d.title,
    description: d.description || null,
    body: d.body,
    status: d.status as RunbookStatus,
    service: d.service || null,
    tags,
    ownerEmail: d.ownerEmail || null,
    nextReviewAt: d.nextReviewAt ? new Date(d.nextReviewAt) : null,
    lastReviewedAt: d.status === "ACTIVE" ? new Date() : undefined,
  };
  await db.runbook.upsert({
    where: { slug: d.slug },
    create: { slug: d.slug, ...data },
    update: data,
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=runbooks&ok=runbook-saved`);
}

/* ── On-call override ─────────────────────────────────── */

const overrideSchema = z.object({
  teamId:   z.string().min(1),
  userId:   z.string().min(1),
  level:    z.enum(["PRIMARY", "SECONDARY", "TERTIARY"]),
  startsAt: z.string().min(1),
  endsAt:   z.string().min(1),
  notes:    z.string().max(500).optional(),
});

export async function createOnCallOverride(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = overrideSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=on_call&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  await db.onCallShift.create({
    data: {
      teamId: d.teamId,
      userId: d.userId,
      level: d.level as "PRIMARY" | "SECONDARY" | "TERTIARY",
      startsAt: new Date(d.startsAt),
      endsAt: new Date(d.endsAt),
      isOverride: true,
      notes: d.notes || null,
      createdBy: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.oncall.override_created",
    entityType: "OnCallShift", entityId: d.userId,
    metadata: { actor: ctx.email, teamId: d.teamId, level: d.level },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=on_call&ok=override-created`);
}
