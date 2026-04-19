"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { notifyMany } from "@/lib/notifications";
import { INSTALL_TRANSITIONS } from "@/lib/installs";
import { loadApprovalRules, orderHasDeposit } from "@/lib/approvals";

const optionalString = z.string().max(200).optional().or(z.literal(""));
const optionalLong   = z.string().max(4000).optional().or(z.literal(""));
const empty = (s: string | undefined) => (s && s.length > 0 ? s : null);

async function assertEvent(tenantId: string, id: string) {
  return db.installEvent.findFirst({
    where: { id, tenantId },
    select: {
      id: true, status: true, kind: true,
      orderId: true, customerId: true,
      installerId: true, crewIds: true,
      order:    { select: { number: true } },
      customer: { select: { name: true } },
    },
  });
}

async function validAssignee(tenantId: string, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const m = await db.membership.findFirst({
    where: { tenantId, userId, status: "ACTIVE" },
    select: { userId: true },
  });
  return m ? userId : null;
}

// Parse a "YYYY-MM-DDTHH:mm" datetime-local string. Browser submits it without a
// timezone offset, so `new Date(s)` interprets it as local time — which is what
// we want for a shop's calendar.
function parseLocalDT(s: string | undefined | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

// Take a comma or newline separated list of userIds, validate each as an active
// member of this tenant, and return the deduped result.
async function filterValidCrew(tenantId: string, raw: string | undefined): Promise<string[]> {
  if (!raw) return [];
  const ids = Array.from(new Set(
    raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean),
  ));
  if (ids.length === 0) return [];
  const members = await db.membership.findMany({
    where: { tenantId, userId: { in: ids }, status: "ACTIVE" },
    select: { userId: true },
  });
  const valid = new Set(members.map((m) => m.userId));
  return ids.filter((id) => valid.has(id));
}

// ────────────────────────────────────────────────────────────
// Create
// ────────────────────────────────────────────────────────────

const createSchema = z.object({
  orderId:        z.string().min(1),
  kind:           z.enum(["SURVEY", "INSTALL", "SERVICE", "DELIVERY", "PICKUP"]).default("INSTALL"),
  title:          optionalString,
  scheduledStart: z.string().min(1),
  scheduledEnd:   z.string().min(1),
  installerId:    optionalString,
  crewIds:        optionalLong, // comma/newline separated userIds
  addressLine1:   optionalString,
  addressLine2:   optionalString,
  city:           optionalString,
  region:         optionalString,
  postalCode:     optionalString,
  country:        optionalString,
  notes:          optionalLong,
  // Where to redirect on success — defaults to the calendar.
  redirectTo:     optionalString,
});

export async function createInstallEvent(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "installs:manage");
  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const back = (formData.get("redirectTo") as string | null) ?? `/t/${slug}/installs`;
    redirect(`${back}?error=${encodeURIComponent("Invalid install event input.")}`);
  }
  const d = parsed.data;

  const order = await db.order.findFirst({
    where: { id: d.orderId, tenantId: ctx.tenant.id },
    select: { id: true, number: true, customerId: true, locationId: true, customer: {
      select: {
        name: true,
        locationId: true,
        installAddressLine1: true, installAddressLine2: true,
        installCity: true, installRegion: true,
        installPostalCode: true, installCountry: true,
        billingAddressLine1: true, billingAddressLine2: true,
        billingCity: true, billingRegion: true,
        billingPostalCode: true, billingCountry: true,
      },
    } },
  });
  if (!order) redirect(`/t/${slug}/installs?error=${encodeURIComponent("Order not found.")}`);

  // Phase 13 — deposit-before-install gate. We only enforce on *create*;
  // editing an existing install's schedule is allowed either way because by
  // then it's already on the calendar and the shop knows about it.
  //
  // The gate only makes sense for the main INSTALL visit. Surveys, deliveries,
  // pickups, and warranty service visits can be scheduled regardless of
  // deposit state (customers often book surveys before paying anything).
  if (d.kind === "INSTALL") {
    const rules = await loadApprovalRules(ctx.tenant.id);
    const depositReason = await orderHasDeposit(ctx.tenant.id, order.id, rules);
    if (depositReason) {
      const back = d.redirectTo || `/t/${slug}/installs`;
      redirect(`${back}?error=${encodeURIComponent(depositReason)}`);
    }
  }

  const start = parseLocalDT(d.scheduledStart);
  const end   = parseLocalDT(d.scheduledEnd);
  if (!start || !end || end.getTime() <= start.getTime()) {
    const back = d.redirectTo || `/t/${slug}/installs`;
    redirect(`${back}?error=${encodeURIComponent("End must be after start.")}`);
  }

  const installerId = await validAssignee(ctx.tenant.id, empty(d.installerId));
  const crewIds     = await filterValidCrew(ctx.tenant.id, d.crewIds || "");

  // Address: if the user typed anything, use their values; otherwise fall back
  // to the customer's install address (or billing, if no install address).
  const typedAny =
    empty(d.addressLine1) || empty(d.addressLine2) ||
    empty(d.city) || empty(d.region) ||
    empty(d.postalCode) || empty(d.country);
  const c = order.customer;
  const addr = typedAny
    ? {
        addressLine1: empty(d.addressLine1),
        addressLine2: empty(d.addressLine2),
        city:         empty(d.city),
        region:       empty(d.region),
        postalCode:   empty(d.postalCode),
        country:      empty(d.country),
      }
    : {
        addressLine1: c.installAddressLine1 ?? c.billingAddressLine1 ?? null,
        addressLine2: c.installAddressLine2 ?? c.billingAddressLine2 ?? null,
        city:         c.installCity         ?? c.billingCity         ?? null,
        region:       c.installRegion       ?? c.billingRegion       ?? null,
        postalCode:   c.installPostalCode   ?? c.billingPostalCode   ?? null,
        country:      c.installCountry      ?? c.billingCountry      ?? null,
      };

  const event = await db.installEvent.create({
    data: {
      tenantId:       ctx.tenant.id,
      orderId:        order.id,
      customerId:     order.customerId,
      // Phase 15 — inherit branch from the order (or fall back to the customer's
      // home branch if the order somehow has none).
      locationId:     order.locationId ?? order.customer.locationId,
      kind:           d.kind,
      title:          empty(d.title),
      status:         "SCHEDULED",
      scheduledStart: start,
      scheduledEnd:   end,
      installerId,
      crewIds,
      notes:          empty(d.notes),
      createdBy:      ctx.userId,
      ...addr,
    },
  });

  // Phase 22 Slice D — seed the tenant's default install checklist on the
  // main INSTALL visit only. Surveys, deliveries, pickups, and service
  // visits rarely reuse the same checklist, so we skip auto-apply for those
  // kinds and let staff pick a template manually.
  if (d.kind === "INSTALL") {
    const tenantDef = await db.tenant.findUnique({
      where: { id: ctx.tenant.id },
      select: { defaultInstallChecklistTemplateId: true },
    });
    if (tenantDef?.defaultInstallChecklistTemplateId) {
      const tpl = await db.checklistTemplate.findFirst({
        where: {
          id: tenantDef.defaultInstallChecklistTemplateId,
          tenantId: ctx.tenant.id,
          kind: "INSTALL",
          active: true,
        },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      });
      if (tpl && tpl.items.length > 0) {
        await db.checklistItem.createMany({
          data: tpl.items.map((it, idx) => ({
            tenantId:       ctx.tenant.id,
            orderId:        null,
            installEventId: event.id,
            templateId:     tpl.id,
            title:          it.title,
            description:    it.description,
            sortOrder:      idx + 1,
          })),
        });
      }
    }
  }

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "install.created",
    entityType: "InstallEvent",
    entityId:   event.id,
    metadata:   { orderId: order.id, kind: d.kind },
  });

  // Notify the installer + every crew member that they've been put on this job.
  // Exclude the actor so whoever scheduled it doesn't ping themselves.
  const when = start.toISOString().slice(0, 16).replace("T", " ");
  await notifyMany(
    [installerId, ...crewIds],
    {
      tenantId:   ctx.tenant.id,
      type:       "install.assigned",
      title:      `Assigned to ${d.kind.toLowerCase()} for ${order.customer.name} (order ${order.number}) on ${when}`,
      body:       empty(d.notes),
      entityType: "InstallEvent",
      entityId:   event.id,
      link:       `/t/${slug}/installs/${event.id}`,
    },
    { excludeUserId: ctx.userId },
  );

  revalidatePath(`/t/${slug}/installs`);
  revalidatePath(`/t/${slug}/orders/${order.id}`);
  redirect(d.redirectTo || `/t/${slug}/installs/${event.id}`);
}

// ────────────────────────────────────────────────────────────
// Update meta (schedule/assignees/address/notes)
// ────────────────────────────────────────────────────────────

const updateSchema = z.object({
  kind:           z.enum(["SURVEY", "INSTALL", "SERVICE", "DELIVERY", "PICKUP"]).default("INSTALL"),
  title:          optionalString,
  scheduledStart: z.string().min(1),
  scheduledEnd:   z.string().min(1),
  installerId:    optionalString,
  crewIds:        optionalLong,
  addressLine1:   optionalString,
  addressLine2:   optionalString,
  city:           optionalString,
  region:         optionalString,
  postalCode:     optionalString,
  country:        optionalString,
  notes:          optionalLong,
});

export async function updateInstallEvent(slug: string, eventId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "installs:manage");
  const ev = await assertEvent(ctx.tenant.id, eventId);
  if (!ev) return;

  const parsed = updateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/installs/${eventId}?error=${encodeURIComponent("Invalid input.")}`);
  }
  const d = parsed.data;

  const start = parseLocalDT(d.scheduledStart);
  const end   = parseLocalDT(d.scheduledEnd);
  if (!start || !end || end.getTime() <= start.getTime()) {
    redirect(`/t/${slug}/installs/${eventId}?error=${encodeURIComponent("End must be after start.")}`);
  }

  const installerId = await validAssignee(ctx.tenant.id, empty(d.installerId));
  const crewIds     = await filterValidCrew(ctx.tenant.id, d.crewIds || "");

  await db.installEvent.update({
    where: { id: eventId },
    data: {
      kind:           d.kind,
      title:          empty(d.title),
      scheduledStart: start,
      scheduledEnd:   end,
      installerId,
      crewIds,
      addressLine1: empty(d.addressLine1),
      addressLine2: empty(d.addressLine2),
      city:         empty(d.city),
      region:       empty(d.region),
      postalCode:   empty(d.postalCode),
      country:      empty(d.country),
      notes:        empty(d.notes),
    },
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "install.updated",
    entityType: "InstallEvent",
    entityId:   eventId,
  });

  // Split recipients: newly-assigned people hear "you were assigned"; people
  // who were already on the event hear "your assignment changed". Use sets so
  // crew churn doesn't double-notify.
  const prev = new Set<string>([
    ...(ev.installerId ? [ev.installerId] : []),
    ...ev.crewIds,
  ]);
  const nextAll = new Set<string>([
    ...(installerId ? [installerId] : []),
    ...crewIds,
  ]);
  const added   = [...nextAll].filter((u) => !prev.has(u));
  const kept    = [...nextAll].filter((u) => prev.has(u));
  const when    = start.toISOString().slice(0, 16).replace("T", " ");
  const orderNo = ev.order.number;
  const custNm  = ev.customer.name;
  await Promise.all([
    notifyMany(
      added,
      {
        tenantId:   ctx.tenant.id,
        type:       "install.assigned",
        title:      `Assigned to ${d.kind.toLowerCase()} for ${custNm} (order ${orderNo}) on ${when}`,
        body:       empty(d.notes),
        entityType: "InstallEvent",
        entityId:   eventId,
        link:       `/t/${slug}/installs/${eventId}`,
      },
      { excludeUserId: ctx.userId },
    ),
    notifyMany(
      kept,
      {
        tenantId:   ctx.tenant.id,
        type:       "install.updated",
        title:      `Install updated for ${custNm} (order ${orderNo}) — now ${when}`,
        entityType: "InstallEvent",
        entityId:   eventId,
        link:       `/t/${slug}/installs/${eventId}`,
      },
      { excludeUserId: ctx.userId },
    ),
  ]);

  revalidatePath(`/t/${slug}/installs`);
  revalidatePath(`/t/${slug}/installs/${eventId}`);
  revalidatePath(`/t/${slug}/orders/${ev.orderId}`);
}

// ────────────────────────────────────────────────────────────
// Status transitions
// ────────────────────────────────────────────────────────────

const statusSchema = z.object({
  status:       z.enum(["SCHEDULED", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELED", "NO_SHOW"]),
  cancelReason: optionalString,
});

export async function changeInstallStatus(slug: string, eventId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "installs:manage");
  const ev = await assertEvent(ctx.tenant.id, eventId);
  if (!ev) return;

  const parsed = statusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const next = parsed.data.status;

  if (!INSTALL_TRANSITIONS[ev.status].includes(next)) {
    redirect(`/t/${slug}/installs/${eventId}?error=${encodeURIComponent(`Can't move from ${ev.status} to ${next}.`)}`);
  }

  const now = new Date();
  const patch: Prisma.InstallEventUpdateInput = { status: next };
  if (next === "IN_PROGRESS") {
    patch.arrivedAt = now;
    patch.completedAt = null;
    patch.canceledAt = null;
    patch.cancelReason = null;
  }
  if (next === "COMPLETED") {
    patch.completedAt = now;
  }
  if (next === "CANCELED" || next === "NO_SHOW") {
    patch.canceledAt = now;
    patch.cancelReason = empty(parsed.data.cancelReason);
  }
  if (next === "SCHEDULED" || next === "CONFIRMED") {
    // Rewinding — clear terminal timestamps so the history stays coherent.
    if (ev.status === "COMPLETED") patch.completedAt = null;
    if (ev.status === "CANCELED" || ev.status === "NO_SHOW") {
      patch.canceledAt = null;
      patch.cancelReason = null;
    }
  }

  await db.installEvent.update({ where: { id: eventId }, data: patch });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "install.status_changed",
    entityType: "InstallEvent",
    entityId:   eventId,
    metadata:   { from: ev.status, to: next },
  });

  // Let everyone on the job know the state moved. A SCHEDULED→CONFIRMED or
  // →CANCELED change matters to the people showing up.
  await notifyMany(
    [ev.installerId, ...ev.crewIds],
    {
      tenantId:   ctx.tenant.id,
      type:       "install.updated",
      title:      `Install ${next.toLowerCase().replace("_", " ")} — ${ev.customer.name} (order ${ev.order.number})`,
      entityType: "InstallEvent",
      entityId:   eventId,
      link:       `/t/${slug}/installs/${eventId}`,
    },
    { excludeUserId: ctx.userId },
  );

  revalidatePath(`/t/${slug}/installs`);
  revalidatePath(`/t/${slug}/installs/${eventId}`);
  revalidatePath(`/t/${slug}/orders/${ev.orderId}`);
}

// ────────────────────────────────────────────────────────────
// Delete
// ────────────────────────────────────────────────────────────

export async function deleteInstallEvent(slug: string, eventId: string) {
  const ctx = await requirePermission(slug, "installs:manage");
  const ev = await assertEvent(ctx.tenant.id, eventId);
  if (!ev) return;

  await db.installEvent.delete({ where: { id: eventId } });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "install.deleted",
    entityType: "InstallEvent",
    entityId:   eventId,
  });

  revalidatePath(`/t/${slug}/installs`);
  revalidatePath(`/t/${slug}/orders/${ev.orderId}`);
  redirect(`/t/${slug}/installs`);
}

// ────────────────────────────────────────────────────────────
// Phase 13 — logistics (tools / materials / access notes / GPS)
// ────────────────────────────────────────────────────────────
//
// Separate from `updateInstallEvent` because the logistics form lives on
// the detail page (and later on the field page) next to the address and
// should be savable without touching the schedule or crew.

const logisticsSchema = z.object({
  toolsList:     optionalLong,
  materialsList: optionalLong,
  accessNotes:   optionalLong,
  hazardsNotes:  optionalLong,
  gpsLat:        optionalString,
  gpsLng:        optionalString,
  odometerStart: optionalString,
  odometerEnd:   optionalString,
});

function parseOptionalFloat(s: string | undefined): number | null {
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
function parseOptionalInt(s: string | undefined): number | null {
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

export async function updateInstallLogistics(slug: string, eventId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "installs:manage");
  const ev = await assertEvent(ctx.tenant.id, eventId);
  if (!ev) return;
  const parsed = logisticsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/installs/${eventId}?error=${encodeURIComponent("Invalid logistics input.")}`);
  }
  const d = parsed.data;
  const lat = parseOptionalFloat(d.gpsLat);
  const lng = parseOptionalFloat(d.gpsLng);
  // Defensive: reject out-of-range coords instead of silently storing garbage.
  if (lat !== null && (lat < -90 || lat > 90)) {
    redirect(`/t/${slug}/installs/${eventId}?error=${encodeURIComponent("GPS latitude out of range.")}`);
  }
  if (lng !== null && (lng < -180 || lng > 180)) {
    redirect(`/t/${slug}/installs/${eventId}?error=${encodeURIComponent("GPS longitude out of range.")}`);
  }
  await db.installEvent.update({
    where: { id: eventId },
    data: {
      toolsList:     empty(d.toolsList),
      materialsList: empty(d.materialsList),
      accessNotes:   empty(d.accessNotes),
      hazardsNotes:  empty(d.hazardsNotes),
      gpsLat:        lat,
      gpsLng:        lng,
      odometerStart: parseOptionalInt(d.odometerStart),
      odometerEnd:   parseOptionalInt(d.odometerEnd),
    },
  });
  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "install.logistics_updated",
    entityType: "InstallEvent",
    entityId:   eventId,
  });
  revalidatePath(`/t/${slug}/installs/${eventId}`);
}

// ────────────────────────────────────────────────────────────
// Phase 13 — photos
// ────────────────────────────────────────────────────────────

const photoSchema = z.object({
  url:      z.string().min(1).max(2048),
  caption:  optionalString,
  phase:    z.enum(["BEFORE", "DURING", "AFTER", "ISSUE", "SURVEY"]).default("DURING"),
  issueId:  optionalString,
  widthPx:  optionalString,
  heightPx: optionalString,
  // Redirect hint — pages can override (the field page wants to return to itself).
  redirectTo: optionalString,
});

export async function addInstallPhoto(slug: string, eventId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "installs:manage");
  const ev = await assertEvent(ctx.tenant.id, eventId);
  if (!ev) return;
  const parsed = photoSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const back = (formData.get("redirectTo") as string | null) ?? `/t/${slug}/installs/${eventId}`;
    redirect(`${back}?error=${encodeURIComponent("Invalid photo input.")}`);
  }
  const d = parsed.data;
  // Guard the URL format. We accept https://, /api/files/..., and small data:
  // image URLs (used by the mobile-camera capture path). Anything else is
  // rejected so we don't end up storing javascript: or mailto: strings.
  if (!/^(https:\/\/|\/|data:image\/)/.test(d.url)) {
    const back = d.redirectTo || `/t/${slug}/installs/${eventId}`;
    redirect(`${back}?error=${encodeURIComponent("Photo URL must be https, an app-relative path, or a data:image URL.")}`);
  }
  // If an issueId was provided, ensure it belongs to this event.
  let safeIssueId: string | null = null;
  if (empty(d.issueId)) {
    const issue = await db.installIssue.findFirst({
      where: { id: d.issueId!, tenantId: ctx.tenant.id, installEventId: eventId },
      select: { id: true },
    });
    safeIssueId = issue?.id ?? null;
  }
  const photo = await db.installPhoto.create({
    data: {
      tenantId:       ctx.tenant.id,
      installEventId: eventId,
      issueId:        safeIssueId,
      url:            d.url,
      caption:        empty(d.caption),
      phase:          d.phase,
      widthPx:        parseOptionalInt(d.widthPx),
      heightPx:       parseOptionalInt(d.heightPx),
      capturedBy:     ctx.userId,
    },
  });
  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "install.photo_added",
    entityType: "InstallPhoto",
    entityId:   photo.id,
    metadata:   { installEventId: eventId, phase: d.phase, issueId: safeIssueId },
  });
  revalidatePath(`/t/${slug}/installs/${eventId}`);
  revalidatePath(`/t/${slug}/installs/${eventId}/field`);
}

export async function deleteInstallPhoto(slug: string, eventId: string, photoId: string) {
  const ctx = await requirePermission(slug, "installs:manage");
  const p = await db.installPhoto.findFirst({
    where: { id: photoId, tenantId: ctx.tenant.id, installEventId: eventId },
    select: { id: true },
  });
  if (!p) return;
  await db.installPhoto.delete({ where: { id: photoId } });
  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "install.photo_deleted",
    entityType: "InstallPhoto",
    entityId:   photoId,
    metadata:   { installEventId: eventId },
  });
  revalidatePath(`/t/${slug}/installs/${eventId}`);
  revalidatePath(`/t/${slug}/installs/${eventId}/field`);
}

// ────────────────────────────────────────────────────────────
// Phase 13 — signatures
// ────────────────────────────────────────────────────────────
//
// Captured as a data URL from a <canvas>. We cap the payload at ~300KB —
// anything larger is probably not a signature but a photo, and should go
// through the photo pipeline instead.

const signatureSchema = z.object({
  dataUrl:     z.string().min(1).max(400_000),
  signerName:  z.string().min(1).max(200),
  signerRole:  z.enum(["CUSTOMER", "INSTALLER", "WITNESS"]).default("CUSTOMER"),
  signerTitle: optionalString,
  disclaimer:  optionalLong,
  notes:       optionalLong,
  redirectTo:  optionalString,
});

export async function captureInstallSignature(slug: string, eventId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "installs:manage");
  const ev = await assertEvent(ctx.tenant.id, eventId);
  if (!ev) return;
  const parsed = signatureSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const back = (formData.get("redirectTo") as string | null) ?? `/t/${slug}/installs/${eventId}`;
    redirect(`${back}?error=${encodeURIComponent("Signature input invalid.")}`);
  }
  const d = parsed.data;
  // Data-URL-only for signatures — we inline them. Anything else is a misuse
  // (drag-drop file upload belongs on the photo path, not the signature path).
  if (!d.dataUrl.startsWith("data:image/")) {
    const back = d.redirectTo || `/t/${slug}/installs/${eventId}`;
    redirect(`${back}?error=${encodeURIComponent("Signature must be a data:image URL.")}`);
  }
  const sig = await db.installSignature.create({
    data: {
      tenantId:       ctx.tenant.id,
      installEventId: eventId,
      dataUrl:        d.dataUrl,
      signerName:     d.signerName.trim(),
      signerRole:     d.signerRole,
      signerTitle:    empty(d.signerTitle),
      disclaimer:     empty(d.disclaimer),
      notes:          empty(d.notes),
      capturedBy:     ctx.userId,
    },
  });
  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "install.signature_captured",
    entityType: "InstallSignature",
    entityId:   sig.id,
    metadata:   { installEventId: eventId, role: d.signerRole, name: d.signerName },
  });
  revalidatePath(`/t/${slug}/installs/${eventId}`);
  revalidatePath(`/t/${slug}/installs/${eventId}/field`);
}

export async function deleteInstallSignature(slug: string, eventId: string, sigId: string) {
  const ctx = await requirePermission(slug, "installs:manage");
  const s = await db.installSignature.findFirst({
    where: { id: sigId, tenantId: ctx.tenant.id, installEventId: eventId },
    select: { id: true },
  });
  if (!s) return;
  await db.installSignature.delete({ where: { id: sigId } });
  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "install.signature_deleted",
    entityType: "InstallSignature",
    entityId:   sigId,
    metadata:   { installEventId: eventId },
  });
  revalidatePath(`/t/${slug}/installs/${eventId}`);
  revalidatePath(`/t/${slug}/installs/${eventId}/field`);
}

// ────────────────────────────────────────────────────────────
// Phase 13 — field issue escalation
// ────────────────────────────────────────────────────────────

const issueSchema = z.object({
  title:       z.string().min(1).max(200),
  description: optionalLong,
  severity:    z.enum(["LOW", "MEDIUM", "HIGH", "BLOCKER"]).default("MEDIUM"),
  redirectTo:  optionalString,
});

export async function reportInstallIssue(slug: string, eventId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "installs:view");
  const ev = await assertEvent(ctx.tenant.id, eventId);
  if (!ev) return;
  const parsed = issueSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const back = (formData.get("redirectTo") as string | null) ?? `/t/${slug}/installs/${eventId}`;
    redirect(`${back}?error=${encodeURIComponent("Issue input invalid.")}`);
  }
  const d = parsed.data;
  const issue = await db.installIssue.create({
    data: {
      tenantId:         ctx.tenant.id,
      installEventId:   eventId,
      title:            d.title.trim(),
      description:      empty(d.description),
      severity:         d.severity,
      blocksCompletion: d.severity === "BLOCKER",
      reportedBy:       ctx.userId,
    },
  });
  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "install.issue_reported",
    entityType: "InstallIssue",
    entityId:   issue.id,
    metadata:   { installEventId: eventId, severity: d.severity },
  });
  // Alert the office so an installer flagging a blocker gets a fast reaction.
  // We page the installer (if set), any crew members, *and* the event's
  // creator (usually the dispatcher).
  const audience = new Set<string>([
    ...(ev.installerId ? [ev.installerId] : []),
    ...ev.crewIds,
  ]);
  // We don't have the creator on `ev` — pull it.
  const creator = await db.installEvent.findUnique({
    where: { id: eventId },
    select: { createdBy: true },
  });
  if (creator?.createdBy) audience.add(creator.createdBy);
  await notifyMany(
    [...audience],
    {
      tenantId:   ctx.tenant.id,
      type:       d.severity === "BLOCKER" ? "install.blocker" : "install.issue",
      title:      `${d.severity.toLowerCase()} issue on ${ev.customer.name} (order ${ev.order.number}): ${d.title.trim()}`,
      body:       empty(d.description),
      entityType: "InstallEvent",
      entityId:   eventId,
      link:       `/t/${slug}/installs/${eventId}`,
    },
    { excludeUserId: ctx.userId },
  );
  revalidatePath(`/t/${slug}/installs/${eventId}`);
  revalidatePath(`/t/${slug}/installs/${eventId}/field`);
}

const issueUpdateSchema = z.object({
  status:     z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED"]),
  resolution: optionalLong,
  severity:   z.enum(["LOW", "MEDIUM", "HIGH", "BLOCKER"]).optional(),
});

export async function updateInstallIssue(
  slug: string,
  eventId: string,
  issueId: string,
  formData: FormData,
) {
  const ctx = await requirePermission(slug, "installs:manage");
  const issue = await db.installIssue.findFirst({
    where: { id: issueId, tenantId: ctx.tenant.id, installEventId: eventId },
  });
  if (!issue) return;
  const parsed = issueUpdateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const d = parsed.data;
  const patch: Prisma.InstallIssueUpdateInput = { status: d.status };
  if (d.severity) {
    patch.severity = d.severity;
    patch.blocksCompletion = d.severity === "BLOCKER" && d.status !== "RESOLVED";
  }
  const now = new Date();
  if (d.status === "ACKNOWLEDGED" && issue.status === "OPEN") {
    patch.ackBy = ctx.userId;
    patch.ackAt = now;
  }
  if (d.status === "RESOLVED") {
    patch.resolvedBy = ctx.userId;
    patch.resolvedAt = now;
    patch.resolution = empty(d.resolution);
    patch.blocksCompletion = false;
  }
  if (d.status === "OPEN" && issue.status !== "OPEN") {
    patch.resolvedBy = null;
    patch.resolvedAt = null;
    patch.resolution = null;
    patch.blocksCompletion = (d.severity ?? issue.severity) === "BLOCKER";
  }
  await db.installIssue.update({ where: { id: issueId }, data: patch });
  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "install.issue_updated",
    entityType: "InstallIssue",
    entityId:   issueId,
    metadata:   { from: issue.status, to: d.status },
  });
  // Poke the reporter when someone closes their issue — they're the one
  // waiting to know whether it's OK to move on.
  if (d.status === "RESOLVED") {
    await notifyMany(
      [issue.reportedBy],
      {
        tenantId:   ctx.tenant.id,
        type:       "install.issue_resolved",
        title:      `Issue resolved: ${issue.title}`,
        body:       empty(d.resolution),
        entityType: "InstallEvent",
        entityId:   eventId,
        link:       `/t/${slug}/installs/${eventId}`,
      },
      { excludeUserId: ctx.userId },
    );
  }
  revalidatePath(`/t/${slug}/installs/${eventId}`);
  revalidatePath(`/t/${slug}/installs/${eventId}/field`);
}

export async function deleteInstallIssue(slug: string, eventId: string, issueId: string) {
  const ctx = await requirePermission(slug, "installs:manage");
  const issue = await db.installIssue.findFirst({
    where: { id: issueId, tenantId: ctx.tenant.id, installEventId: eventId },
    select: { id: true },
  });
  if (!issue) return;
  await db.installIssue.delete({ where: { id: issueId } });
  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "install.issue_deleted",
    entityType: "InstallIssue",
    entityId:   issueId,
    metadata:   { installEventId: eventId },
  });
  revalidatePath(`/t/${slug}/installs/${eventId}`);
  revalidatePath(`/t/${slug}/installs/${eventId}/field`);
}

// ────────────────────────────────────────────────────────────
// Phase 13 — site surveys
// ────────────────────────────────────────────────────────────
//
// Upsert-style: the first save creates the row; subsequent saves update.
// We keep this separate from the main install update form because the
// survey card on the detail page is large and often edited by a different
// person (salesperson / estimator vs. dispatcher).

const surveySchema = z.object({
  widthMm:         optionalString,
  heightMm:        optionalString,
  depthMm:         optionalString,
  mountingSurface: optionalString,
  mountingMethod:  optionalString,
  powerAvailable:  optionalString, // "1" or "0"/""
  powerNotes:      optionalLong,
  electricalNotes: optionalLong,
  accessNotes:     optionalLong,
  clearanceNotes:  optionalLong,
  siteContactName: optionalString,
  siteContactPhone: optionalString,
  permitStatus:    z.enum(["NONE", "NEEDED", "APPLIED", "APPROVED", "REJECTED", "EXPIRED"]).default("NONE"),
  permitNumber:    optionalString,
  permitNotes:     optionalLong,
  permitAppliedAt:  optionalString,
  permitApprovedAt: optionalString,
  permitExpiresAt:  optionalString,
  summary:         optionalLong,
  blocked:         optionalString,
  blockedReason:   optionalLong,
  surveyedAt:      optionalString,
  markSurveyed:    optionalString, // "1" to stamp surveyedBy/At=now
});

function optionalDate(s: string | undefined | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

export async function saveSiteSurvey(slug: string, eventId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "installs:manage");
  const ev = await assertEvent(ctx.tenant.id, eventId);
  if (!ev) return;
  const parsed = surveySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/installs/${eventId}?error=${encodeURIComponent("Site survey input invalid.")}`);
  }
  const d = parsed.data;
  const existing = await db.siteSurvey.findUnique({ where: { installEventId: eventId } });
  const now = new Date();
  const markSurveyed = d.markSurveyed === "1";
  const data = {
    widthMm:          parseOptionalInt(d.widthMm),
    heightMm:         parseOptionalInt(d.heightMm),
    depthMm:          parseOptionalInt(d.depthMm),
    mountingSurface:  empty(d.mountingSurface),
    mountingMethod:   empty(d.mountingMethod),
    powerAvailable:   d.powerAvailable === "1",
    powerNotes:       empty(d.powerNotes),
    electricalNotes:  empty(d.electricalNotes),
    accessNotes:      empty(d.accessNotes),
    clearanceNotes:   empty(d.clearanceNotes),
    siteContactName:  empty(d.siteContactName),
    siteContactPhone: empty(d.siteContactPhone),
    permitStatus:     d.permitStatus,
    permitNumber:     empty(d.permitNumber),
    permitNotes:      empty(d.permitNotes),
    permitAppliedAt:  optionalDate(d.permitAppliedAt),
    permitApprovedAt: optionalDate(d.permitApprovedAt),
    permitExpiresAt:  optionalDate(d.permitExpiresAt),
    summary:          empty(d.summary),
    blocked:          d.blocked === "1",
    blockedReason:    empty(d.blockedReason),
  };
  if (existing) {
    await db.siteSurvey.update({
      where: { id: existing.id },
      data: {
        ...data,
        ...(markSurveyed ? { surveyedBy: ctx.userId, surveyedAt: now } : {}),
      },
    });
  } else {
    await db.siteSurvey.create({
      data: {
        tenantId:        ctx.tenant.id,
        installEventId:  eventId,
        ...data,
        surveyedBy:      markSurveyed ? ctx.userId : null,
        surveyedAt:      markSurveyed ? now : optionalDate(d.surveyedAt),
      },
    });
  }
  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     existing ? "install.survey_updated" : "install.survey_created",
    entityType: "SiteSurvey",
    entityId:   eventId, // Using event id because survey id doesn't exist yet for create path pre-fetch
    metadata:   { installEventId: eventId, permitStatus: d.permitStatus, markSurveyed },
  });
  revalidatePath(`/t/${slug}/installs/${eventId}`);
  revalidatePath(`/t/${slug}/installs/${eventId}/field`);
}

export async function deleteSiteSurvey(slug: string, eventId: string) {
  const ctx = await requirePermission(slug, "installs:manage");
  const survey = await db.siteSurvey.findFirst({
    where: { tenantId: ctx.tenant.id, installEventId: eventId },
    select: { id: true },
  });
  if (!survey) return;
  await db.siteSurvey.delete({ where: { id: survey.id } });
  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "install.survey_deleted",
    entityType: "SiteSurvey",
    entityId:   survey.id,
    metadata:   { installEventId: eventId },
  });
  revalidatePath(`/t/${slug}/installs/${eventId}`);
  revalidatePath(`/t/${slug}/installs/${eventId}/field`);
}

// ────────────────────────────────────────────────────────────
// Phase 13 — evidence waiver
// ────────────────────────────────────────────────────────────
//
// Some events legitimately have no photos or signatures — a five-minute
// dropoff, a supplier pickup. Rather than fail readiness forever or mark
// a fake completion, a manager explicitly waives the evidence check with
// a note. The waive is reversible.

const waiverSchema = z.object({
  waived: z.enum(["1", "0"]).default("1"),
  note:   optionalLong,
});

export async function setEvidenceWaiver(slug: string, eventId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "installs:manage");
  const ev = await assertEvent(ctx.tenant.id, eventId);
  if (!ev) return;
  const parsed = waiverSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const waived = parsed.data.waived === "1";
  await db.installEvent.update({
    where: { id: eventId },
    data: {
      evidenceWaived:     waived,
      evidenceWaivedBy:   waived ? ctx.userId : null,
      evidenceWaivedNote: waived ? empty(parsed.data.note) : null,
    },
  });
  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     waived ? "install.evidence_waived" : "install.evidence_unwaived",
    entityType: "InstallEvent",
    entityId:   eventId,
    metadata:   { note: parsed.data.note ?? null },
  });
  revalidatePath(`/t/${slug}/installs/${eventId}`);
  revalidatePath(`/t/${slug}/installs/${eventId}/field`);
}

// ────────────────────────────────────────────────────────────
// Phase 13 — evidence-aware completion
// ────────────────────────────────────────────────────────────
//
// `changeInstallStatus` treats all transitions as equal. The field page
// wants a single "Done" button that ALSO refuses to complete when there's
// an open blocker or zero evidence (unless waived). We expose this as a
// separate action so the existing status endpoint stays simple.

export async function completeInstallWithEvidence(slug: string, eventId: string) {
  const ctx = await requirePermission(slug, "installs:manage");
  const ev = await db.installEvent.findFirst({
    where: { id: eventId, tenantId: ctx.tenant.id },
    include: {
      _count: { select: { photos: true, signatures: true } },
      issues: { where: { status: { not: "RESOLVED" }, blocksCompletion: true }, select: { id: true, title: true } },
    },
  });
  if (!ev) return;
  if (!INSTALL_TRANSITIONS[ev.status].includes("COMPLETED")) {
    redirect(`/t/${slug}/installs/${eventId}?error=${encodeURIComponent(`Can't complete from ${ev.status}.`)}`);
  }
  // Blocker guard.
  if (ev.issues.length > 0) {
    const titles = ev.issues.map((i) => i.title).slice(0, 2).join("; ");
    redirect(`/t/${slug}/installs/${eventId}?error=${encodeURIComponent(`Resolve blocking issue(s) first: ${titles}`)}`);
  }
  // Evidence guard — enforced only for fulfillment kinds (INSTALL/DELIVERY)
  // and when not waived.
  const requiresEvidence =
    !ev.evidenceWaived && (ev.kind === "INSTALL" || ev.kind === "DELIVERY");
  if (requiresEvidence && ev._count.photos === 0 && ev._count.signatures === 0) {
    redirect(`/t/${slug}/installs/${eventId}?error=${encodeURIComponent("Add a photo or signature, or waive evidence, before completing.")}`);
  }
  await db.installEvent.update({
    where: { id: eventId },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "install.completed_with_evidence",
    entityType: "InstallEvent",
    entityId:   eventId,
    metadata:   {
      photos: ev._count.photos,
      signatures: ev._count.signatures,
      evidenceWaived: ev.evidenceWaived,
    },
  });
  revalidatePath(`/t/${slug}/installs`);
  revalidatePath(`/t/${slug}/installs/${eventId}`);
  revalidatePath(`/t/${slug}/installs/${eventId}/field`);
  revalidatePath(`/t/${slug}/orders/${ev.orderId}`);
}
