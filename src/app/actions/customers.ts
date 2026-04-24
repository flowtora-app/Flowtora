"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { notifyMany } from "@/lib/notifications";
import { ensureDefaultLocation, resolveTenantLocationId } from "@/lib/locations";

// ────────────────────────────────────────────────────────────
// Customer create / edit / delete
// ────────────────────────────────────────────────────────────

const optionalString = z.string().max(200).optional().or(z.literal(""));
const optionalLong = z.string().max(2000).optional().or(z.literal(""));

const customerSchema = z.object({
  kind: z.enum(["BUSINESS", "INDIVIDUAL"]),
  name: z.string().min(1).max(160),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
  stage: z.enum(["NEW_LEAD", "CONTACTED", "QUOTED", "NEGOTIATING", "WON", "LOST"]).default("NEW_LEAD"),
  ownerId: optionalString,
  source: optionalString,
  estimatedValue: z.string().optional().or(z.literal("")),
  closeProbability: z.string().optional().or(z.literal("")),
  defaultDiscountPct: z.string().optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  phone: optionalString,
  website: z.string().url().optional().or(z.literal("")),
  notes: optionalLong,
  tags: optionalString, // comma-separated
  // Phase 15 — optional branch assignment. Empty string falls back to the
  // tenant's default location.
  locationId: optionalString,
  // billing
  billingAddressLine1: optionalString,
  billingAddressLine2: optionalString,
  billingCity: optionalString,
  billingRegion: optionalString,
  billingPostalCode: optionalString,
  billingCountry: optionalString,
  // install
  installAddressLine1: optionalString,
  installAddressLine2: optionalString,
  installCity: optionalString,
  installRegion: optionalString,
  installPostalCode: optionalString,
  installCountry: optionalString,
});

const empty = (s: string | undefined) => (s && s.length > 0 ? s : null);
const emptyNum = (s: string | undefined) => {
  if (!s || s.length === 0) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const parseTags = (s: string | undefined) =>
  s ? s.split(",").map((t) => t.trim()).filter(Boolean) : [];

async function validOwnerId(tenantId: string, ownerId: string | null) {
  if (!ownerId) return null;
  const m = await db.membership.findFirst({
    where: { tenantId, userId: ownerId, status: "ACTIVE" },
  });
  return m ? ownerId : null;
}

export async function createCustomer(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "customers:create");
  const parsed = customerSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/customers/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`);
  }
  const d = parsed.data;
  const ownerId = await validOwnerId(ctx.tenant.id, empty(d.ownerId));
  const closeProb = emptyNum(d.closeProbability);
  const defDisc = emptyNum(d.defaultDiscountPct);

  // Phase 15 — every new customer belongs to a branch. Use the explicitly
  // picked one (if it belongs to this tenant) or fall back to the tenant's
  // default location so downstream reports can always group by branch.
  const pickedLocation = await resolveTenantLocationId(ctx.tenant.id, empty(d.locationId));
  const locationId = pickedLocation ?? (await ensureDefaultLocation(ctx.tenant.id)).id;

  const customer = await db.customer.create({
    data: {
      tenantId: ctx.tenant.id,
      locationId,
      kind: d.kind,
      name: d.name,
      status: d.status,
      stage: d.stage,
      ownerId,
      source: empty(d.source),
      estimatedValue: empty(d.estimatedValue) as never,
      closeProbability: closeProb !== null ? Math.max(0, Math.min(100, Math.round(closeProb))) : null,
      defaultDiscountPct: defDisc !== null ? Math.max(0, Math.min(100, Math.round(defDisc))) : 0,
      email: empty(d.email),
      phone: empty(d.phone),
      website: empty(d.website),
      notes: empty(d.notes),
      tags: parseTags(d.tags),
      billingAddressLine1: empty(d.billingAddressLine1),
      billingAddressLine2: empty(d.billingAddressLine2),
      billingCity: empty(d.billingCity),
      billingRegion: empty(d.billingRegion),
      billingPostalCode: empty(d.billingPostalCode),
      billingCountry: empty(d.billingCountry),
      installAddressLine1: empty(d.installAddressLine1),
      installAddressLine2: empty(d.installAddressLine2),
      installCity: empty(d.installCity),
      installRegion: empty(d.installRegion),
      installPostalCode: empty(d.installPostalCode),
      installCountry: empty(d.installCountry),
    },
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "customer.created",
    entityType: "Customer",
    entityId: customer.id,
  });

  revalidatePath(`/t/${slug}/customers`);
  redirect(`/t/${slug}/customers/${customer.id}`);
}

export async function updateCustomer(slug: string, customerId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "customers:edit");
  const parsed = customerSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    // Phase 3: /edit route is gone; surface the error on the detail
    // page where the inline-edit cards live.
    redirect(`/t/${slug}/customers/${customerId}?error=${encodeURIComponent("Invalid input")}`);
  }

  const existing = await db.customer.findFirst({
    where: { id: customerId, tenantId: ctx.tenant.id },
  });
  if (!existing) redirect(`/t/${slug}/customers`);

  const d = parsed.data;
  const ownerId = await validOwnerId(ctx.tenant.id, empty(d.ownerId));
  const closeProb = emptyNum(d.closeProbability);
  const defDisc = emptyNum(d.defaultDiscountPct);
  // Phase 15 — allow re-pointing the customer to a different branch. Empty
  // string means "leave as-is" rather than clearing, so accidental form
  // submissions don't orphan the row.
  const rawLocation = empty(d.locationId);
  const newLocation = rawLocation === null
    ? existing.locationId
    : await resolveTenantLocationId(ctx.tenant.id, rawLocation);

  await db.customer.update({
    where: { id: customerId },
    data: {
      locationId: newLocation ?? existing.locationId,
      kind: d.kind,
      name: d.name,
      status: d.status,
      stage: d.stage,
      ownerId,
      source: empty(d.source),
      estimatedValue: empty(d.estimatedValue) as never,
      closeProbability: closeProb !== null ? Math.max(0, Math.min(100, Math.round(closeProb))) : null,
      defaultDiscountPct: defDisc !== null ? Math.max(0, Math.min(100, Math.round(defDisc))) : 0,
      email: empty(d.email),
      phone: empty(d.phone),
      website: empty(d.website),
      notes: empty(d.notes),
      tags: parseTags(d.tags),
      billingAddressLine1: empty(d.billingAddressLine1),
      billingAddressLine2: empty(d.billingAddressLine2),
      billingCity: empty(d.billingCity),
      billingRegion: empty(d.billingRegion),
      billingPostalCode: empty(d.billingPostalCode),
      billingCountry: empty(d.billingCountry),
      installAddressLine1: empty(d.installAddressLine1),
      installAddressLine2: empty(d.installAddressLine2),
      installCity: empty(d.installCity),
      installRegion: empty(d.installRegion),
      installPostalCode: empty(d.installPostalCode),
      installCountry: empty(d.installCountry),
    },
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "customer.updated",
    entityType: "Customer",
    entityId: customerId,
  });

  revalidatePath(`/t/${slug}/customers/${customerId}`);
  redirect(`/t/${slug}/customers/${customerId}`);
}

export async function deleteCustomer(slug: string, customerId: string) {
  const ctx = await requirePermission(slug, "customers:delete");
  await db.customer.deleteMany({ where: { id: customerId, tenantId: ctx.tenant.id } });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "customer.deleted",
    entityType: "Customer",
    entityId: customerId,
  });
  redirect(`/t/${slug}/customers`);
}

// ────────────────────────────────────────────────────────────
// Phase 3 (transformation) — partial update for inline-edit cards.
//
// The customer detail page replaces the /edit route with per-section
// edit toggles. Each section only submits the fields it owns (contact
// info, addresses, notes, ownership/value), so we need a server action
// that accepts whichever subset of fields arrives in the FormData and
// updates only those on the row — no-ops the rest.
//
// Security: same `customers:edit` gate as updateCustomer + branch-scope
// assertion on the existing row so a rep can't use a narrower edit
// surface to slip past the full-edit checks.
// ────────────────────────────────────────────────────────────

// Every field is optional; we only patch the ones that are present in
// the submitted FormData. Mirrors `customerSchema` but each field is
// `.optional()` so partial submissions validate.
const patchSchema = z.object({
  ownerId: optionalString,
  source: optionalString,
  estimatedValue: z.string().optional().or(z.literal("")),
  closeProbability: z.string().optional().or(z.literal("")),
  defaultDiscountPct: z.string().optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  phone: optionalString,
  website: z.string().url().optional().or(z.literal("")),
  notes: optionalLong,
  locationId: optionalString,
  // billing
  billingAddressLine1: optionalString,
  billingAddressLine2: optionalString,
  billingCity: optionalString,
  billingRegion: optionalString,
  billingPostalCode: optionalString,
  billingCountry: optionalString,
  // install
  installAddressLine1: optionalString,
  installAddressLine2: optionalString,
  installCity: optionalString,
  installRegion: optionalString,
  installPostalCode: optionalString,
  installCountry: optionalString,
});

// Keys the InlineEditCard surfaces can touch. Anything outside this set
// is ignored even if it lands in the FormData — stage/status/name/kind
// still go through the dedicated flows (changeStage, updateCustomer).
const PATCHABLE_KEYS = [
  "ownerId", "source", "estimatedValue", "closeProbability", "defaultDiscountPct",
  "email", "phone", "website", "notes", "locationId",
  "billingAddressLine1", "billingAddressLine2", "billingCity", "billingRegion", "billingPostalCode", "billingCountry",
  "installAddressLine1", "installAddressLine2", "installCity", "installRegion", "installPostalCode", "installCountry",
] as const;

export async function patchCustomer(slug: string, customerId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "customers:edit");

  // Narrow the FormData to only the keys this action may touch before
  // validation — stops callers from sneaking in fields we don't expose.
  const raw: Record<string, string> = {};
  for (const key of PATCHABLE_KEYS) {
    const v = formData.get(key);
    if (typeof v === "string") raw[key] = v;
  }
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) return;

  const existing = await db.customer.findFirst({
    where: { id: customerId, tenantId: ctx.tenant.id },
  });
  if (!existing) return;
  ctx.assertBranchAccess(existing.locationId);

  const d = parsed.data;
  // Build a Prisma patch containing only the fields that were actually
  // submitted. `undefined` means "not in the FormData" (leave alone);
  // an empty string means "clear this field to null".
  const patch: Record<string, unknown> = {};
  const setIfPresent = <K extends keyof typeof d>(key: K, mapper: (v: string) => unknown) => {
    const v = d[key];
    if (v === undefined) return;
    patch[key as string] = mapper(v as string);
  };

  setIfPresent("ownerId",        (v) => v || null);
  setIfPresent("source",         (v) => empty(v));
  setIfPresent("email",          (v) => empty(v));
  setIfPresent("phone",          (v) => empty(v));
  setIfPresent("website",        (v) => empty(v));
  setIfPresent("notes",          (v) => empty(v));
  setIfPresent("estimatedValue", (v) => empty(v)); // Prisma Decimal; empty clears
  setIfPresent("closeProbability", (v) => {
    const n = emptyNum(v);
    return n !== null ? Math.max(0, Math.min(100, Math.round(n))) : null;
  });
  setIfPresent("defaultDiscountPct", (v) => {
    const n = emptyNum(v);
    return n !== null ? Math.max(0, Math.min(100, Math.round(n))) : 0;
  });

  // Addresses — straight string passthrough with null-if-empty.
  const addressFields = [
    "billingAddressLine1", "billingAddressLine2", "billingCity", "billingRegion",
    "billingPostalCode", "billingCountry",
    "installAddressLine1", "installAddressLine2", "installCity", "installRegion",
    "installPostalCode", "installCountry",
  ] as const;
  for (const k of addressFields) setIfPresent(k, (v) => empty(v));

  // Owner validation — same gate as updateCustomer; reject anyone who
  // isn't an active member of the tenant.
  if ("ownerId" in patch) {
    patch.ownerId = await validOwnerId(ctx.tenant.id, patch.ownerId as string | null);
  }
  // Branch change — only allow moving to a location inside the tenant.
  if ("locationId" in patch && typeof patch.locationId === "string" && patch.locationId.length > 0) {
    const next = await resolveTenantLocationId(ctx.tenant.id, patch.locationId);
    if (next) patch.locationId = next;
    else delete patch.locationId; // invalid — drop it rather than corrupt the row
  }

  if (Object.keys(patch).length === 0) return;

  await db.customer.update({
    where: { id: existing.id },
    data: patch as Parameters<typeof db.customer.update>[0]["data"],
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "customer.updated",
    entityType: "Customer",
    entityId: existing.id,
    metadata: { fields: Object.keys(patch) },
  });

  revalidatePath(`/t/${slug}/customers/${existing.id}`);
}

const stageSchema = z.object({
  customerId: z.string().min(1),
  stage: z.enum(["NEW_LEAD", "CONTACTED", "QUOTED", "NEGOTIATING", "WON", "LOST"]),
  // Canonical lost reason code — one of LOST_REASONS values. We still
  // accept legacy free text from pre-Phase-7 callers (e.g. an older
  // automated integration), so the validator is permissive.
  lostReasonCode: z.string().max(40).optional(),
  lostReasonDetail: z.string().max(400).optional(),
  // Legacy single-field reason for callers that haven't been upgraded.
  lostReason: z.string().max(400).optional(),
  // Optional note captured when reactivating a LOST customer, when
  // converting to WON ("how did we close it"), or any other stage
  // move where the rep wants to record context alongside the move.
  stageNote: z.string().max(1000).optional(),
});

// Phase 7 — canonical lost reason codes, kept in sync with
// `LOST_REASONS` in `src/lib/crm.ts`. We don't import it here because
// this file is a server action module and pulling UI constants would
// force the whole thing into the client bundle.
const LOST_REASON_CODES = new Set([
  "price",
  "timing",
  "competitor",
  "no_response",
  "scope",
  "disqualified",
  "other",
]);

export async function changeStage(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "customers:edit");
  const parsed = stageSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/customers?error=${encodeURIComponent("Invalid stage change")}`);
  }

  const customer = await db.customer.findFirst({
    where: { id: parsed.data.customerId, tenantId: ctx.tenant.id },
  });
  if (!customer) return;
  ctx.assertBranchAccess(customer.locationId);

  const from = customer.stage;
  const to = parsed.data.stage;

  // Phase 7 — guard rails on "WON". A rep flipping a brand-new lead
  // straight to WON with no quote and no activity is almost always a
  // mistake — either a mis-click or a process skip. We require at
  // least one quote on file so there's a paper trail to point back to.
  if (to === "WON" && from !== "WON") {
    const quoteCount = await db.quote.count({
      where: { tenantId: ctx.tenant.id, customerId: customer.id },
    });
    if (quoteCount === 0) {
      redirect(
        `/t/${slug}/customers/${customer.id}?error=${encodeURIComponent(
          "Can't mark as won without a quote — send or record one first.",
        )}`,
      );
    }
  }

  // Phase 7 — canonical lost reason handling.
  //
  // We store the lost reason as "<code>: <detail>" so both the
  // machine-readable category (for analytics) and the human context
  // (for the next rep reading this) survive. Legacy free-text input
  // is still accepted via the `lostReason` field and stored as-is.
  let nextLostReason: string | null = null;
  if (to === "LOST") {
    const code = (parsed.data.lostReasonCode ?? "").trim();
    const detail = (parsed.data.lostReasonDetail ?? "").trim();
    if (code && LOST_REASON_CODES.has(code)) {
      nextLostReason = detail ? `${code}: ${detail}` : code;
    } else if (parsed.data.lostReason && parsed.data.lostReason.trim()) {
      // Legacy shape — treat as raw text.
      nextLostReason = parsed.data.lostReason.trim();
    } else {
      // Force the rep to pick a reason. Lost deals without a reason
      // are where team-wide learning dies.
      redirect(
        `/t/${slug}/customers/${customer.id}?error=${encodeURIComponent(
          "Pick a lost reason so the team can learn from it.",
        )}`,
      );
    }
  }

  await db.customer.update({
    where: { id: customer.id },
    data: {
      stage: to,
      lostReason: to === "LOST" ? nextLostReason : null,
    },
  });

  // Phase 7 — auto-log an interaction when the stage move matters
  // enough to want the context in the timeline. Three cases:
  //   1. Reactivating a LOST customer — record why we're re-opening.
  //   2. Marking WON — capture the "how did we close it" note.
  //   3. Any move with an explicit stageNote.
  const isReactivation = from === "LOST" && to !== "LOST";
  const note = (parsed.data.stageNote ?? "").trim();
  if (isReactivation || to === "WON" || (note && from !== to)) {
    const subject = isReactivation
      ? "Reactivated"
      : to === "WON"
      ? "Deal won"
      : `Stage moved to ${to.replace(/_/g, " ").toLowerCase()}`;
    const body = [
      `Stage: ${from.replace(/_/g, " ").toLowerCase()} → ${to.replace(/_/g, " ").toLowerCase()}`,
      note || null,
    ]
      .filter(Boolean)
      .join("\n\n");
    await db.interaction.create({
      data: {
        tenantId: ctx.tenant.id,
        customerId: customer.id,
        userId: ctx.userId,
        type: "NOTE",
        subject,
        body,
      },
    });
  }

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "customer.stage_changed",
    entityId: customer.id,
    metadata: {
      from,
      to,
      lostReason: nextLostReason ?? undefined,
      reactivated: isReactivation || undefined,
    },
  });
  revalidatePath(`/t/${slug}/leads`);
  revalidatePath(`/t/${slug}/customers`);
  revalidatePath(`/t/${slug}/customers/${customer.id}`);
}

// ────────────────────────────────────────────────────────────
// Contacts
// ────────────────────────────────────────────────────────────

const contactSchema = z.object({
  customerId: z.string().min(1),
  firstName: z.string().min(1).max(80),
  lastName: optionalString,
  title: optionalString,
  email: z.string().email().optional().or(z.literal("")),
  phone: optionalString,
  isPrimary: z.preprocess((v) => v === "on" || v === "true", z.boolean()).optional(),
  notes: optionalLong,
});

export async function addContact(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "customers:edit");
  const parsed = contactSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const customer = await db.customer.findFirst({
    where: { id: parsed.data.customerId, tenantId: ctx.tenant.id },
  });
  if (!customer) return;

  await db.$transaction(async (tx) => {
    if (parsed.data.isPrimary) {
      await tx.contact.updateMany({
        where: { customerId: customer.id, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    await tx.contact.create({
      data: {
        tenantId: ctx.tenant.id,
        customerId: customer.id,
        firstName: parsed.data.firstName,
        lastName: empty(parsed.data.lastName),
        title: empty(parsed.data.title),
        email: empty(parsed.data.email),
        phone: empty(parsed.data.phone),
        isPrimary: parsed.data.isPrimary ?? false,
        notes: empty(parsed.data.notes),
      },
    });
  });

  revalidatePath(`/t/${slug}/customers/${customer.id}`);
}

export async function deleteContact(slug: string, contactId: string) {
  const ctx = await requirePermission(slug, "customers:edit");
  const c = await db.contact.findFirst({ where: { id: contactId, tenantId: ctx.tenant.id } });
  if (!c) return;
  await db.contact.delete({ where: { id: c.id } });
  revalidatePath(`/t/${slug}/customers/${c.customerId}`);
}

// ────────────────────────────────────────────────────────────
// Interactions
// ────────────────────────────────────────────────────────────

const interactionSchema = z.object({
  customerId: z.string().min(1),
  type: z.enum(["NOTE", "CALL", "EMAIL", "MEETING", "TEXT"]),
  subject: optionalString,
  body: optionalLong,
});

export async function addInteraction(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "customers:edit");
  const parsed = interactionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const customer = await db.customer.findFirst({
    where: { id: parsed.data.customerId, tenantId: ctx.tenant.id },
  });
  if (!customer) return;

  await db.interaction.create({
    data: {
      tenantId: ctx.tenant.id,
      customerId: customer.id,
      userId: ctx.userId,
      type: parsed.data.type,
      subject: empty(parsed.data.subject),
      body: empty(parsed.data.body),
    },
  });
  revalidatePath(`/t/${slug}/customers/${customer.id}`);
}

// ────────────────────────────────────────────────────────────
// Tasks
// ────────────────────────────────────────────────────────────

const taskSchema = z.object({
  title: z.string().min(1).max(200),
  description: optionalLong,
  customerId: optionalString,
  assignedTo: optionalString,
  dueDate: optionalString, // YYYY-MM-DD
  priority: z.enum(["LOW", "NORMAL", "HIGH"]).default("NORMAL"),
});

export async function createTask(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "customers:edit");
  const parsed = taskSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const customerId = empty(parsed.data.customerId);
  if (customerId) {
    const c = await db.customer.findFirst({ where: { id: customerId, tenantId: ctx.tenant.id } });
    if (!c) return;
  }
  const assignedTo = await validOwnerId(ctx.tenant.id, empty(parsed.data.assignedTo));

  const task = await db.task.create({
    data: {
      tenantId: ctx.tenant.id,
      customerId,
      assignedTo,
      createdBy: ctx.userId,
      title: parsed.data.title,
      description: empty(parsed.data.description),
      priority: parsed.data.priority,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    },
  });

  // Notify the assignee (excluding self-assignments — no point telling yourself).
  if (assignedTo) {
    await notifyMany(
      [assignedTo],
      {
        tenantId:   ctx.tenant.id,
        type:       "task.assigned",
        title:      `You were assigned a task: ${task.title}`,
        body:       task.description,
        entityType: "Task",
        entityId:   task.id,
        link:       `/t/${slug}/inbox?chip=tasks`,
      },
      { excludeUserId: ctx.userId },
    );
  }

  if (customerId) revalidatePath(`/t/${slug}/customers/${customerId}`);
  revalidatePath(`/t/${slug}/inbox`);
}

export async function toggleTask(slug: string, taskId: string) {
  const ctx = await requirePermission(slug, "customers:edit");
  const t = await db.task.findFirst({ where: { id: taskId, tenantId: ctx.tenant.id } });
  if (!t) return;

  // We care whether this is a completion (vs. reopen) for notification purposes.
  const wasCompleted = !!t.completedAt;
  await db.task.update({
    where: { id: t.id },
    data: { completedAt: wasCompleted ? null : new Date() },
  });

  // On completion, notify the task creator — but only if someone else finished
  // it. Self-completed tasks don't need a notification.
  if (!wasCompleted && t.createdBy) {
    await notifyMany(
      [t.createdBy],
      {
        tenantId:   ctx.tenant.id,
        type:       "task.completed",
        title:      `Task completed: ${t.title}`,
        entityType: "Task",
        entityId:   t.id,
        link:       `/t/${slug}/inbox?chip=tasks`,
      },
      { excludeUserId: ctx.userId },
    );
  }

  revalidatePath(`/t/${slug}/inbox`);
  if (t.customerId) revalidatePath(`/t/${slug}/customers/${t.customerId}`);
}

export async function deleteTask(slug: string, taskId: string) {
  const ctx = await requirePermission(slug, "customers:edit");
  const t = await db.task.findFirst({ where: { id: taskId, tenantId: ctx.tenant.id } });
  if (!t) return;
  await db.task.delete({ where: { id: t.id } });
  revalidatePath(`/t/${slug}/inbox`);
  if (t.customerId) revalidatePath(`/t/${slug}/customers/${t.customerId}`);
}

// ────────────────────────────────────────────────────────────
// Tags — Phase 7
// ────────────────────────────────────────────────────────────
//
// Tags are a String[] on Customer. We expose inline add/remove so a
// rep can tag a customer without round-tripping through the edit page.
// `listCustomerTagSuggestions` powers the autocomplete dropdown — it
// reads existing distinct tags for the tenant so suggestions reflect
// the team's actual vocabulary rather than a canned list.

// Max tags per customer. 8 is plenty for filtering — past that they
// become noise and slow down the autocomplete.
const MAX_TAGS_PER_CUSTOMER = 16;

const tagMutationSchema = z.object({
  customerId: z.string().min(1),
  tag: z.string().min(1).max(40),
});

function normalizeTag(raw: string): string {
  // Lowercase + trim + collapse whitespace. Tags are free-form
  // labels; we don't want "VIP " and "vip" to be different.
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

export async function addTag(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "customers:edit");
  const parsed = tagMutationSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const customer = await db.customer.findFirst({
    where: { id: parsed.data.customerId, tenantId: ctx.tenant.id },
    select: { id: true, tags: true, locationId: true },
  });
  if (!customer) return;
  ctx.assertBranchAccess(customer.locationId);

  const tag = normalizeTag(parsed.data.tag);
  if (!tag) return;

  const existing = new Set(customer.tags.map(normalizeTag));
  if (existing.has(tag)) return; // already tagged — no-op
  if (existing.size >= MAX_TAGS_PER_CUSTOMER) return;

  await db.customer.update({
    where: { id: customer.id },
    data: { tags: { set: [...customer.tags, tag] } },
  });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "customer.tagged",
    entityType: "Customer",
    entityId: customer.id,
    metadata: { tag },
  });
  revalidatePath(`/t/${slug}/customers/${customer.id}`);
  revalidatePath(`/t/${slug}/customers`);
}

// ────────────────────────────────────────────────────────────
// Bulk operations — Phase E
// ────────────────────────────────────────────────────────────
//
// Bulk actions are driven by the DataTable's selection state. The
// client serializes the selected ids as a comma-separated hidden
// field so these handlers can stay `(slug, formData) => void` like
// the rest of the actions file.
//
// Every bulk handler:
//   • verifies every id resolves to a customer in the tenant
//   • enforces branch scope per-row (a rep scoped to branch A can't
//     archive a customer from branch B even if the id is in the list)
//   • logs one audit event per customer so the activity timeline
//     shows the change on every affected record.

const BULK_LIMIT = 200;

function parseIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, BULK_LIMIT);
}

const bulkStatusSchema = z.object({
  ids: z.string().min(1),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]),
});

export async function bulkSetCustomerStatus(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "customers:edit");
  const parsed = bulkStatusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const ids = parseIds(parsed.data.ids);
  if (ids.length === 0) return;

  const customers = await db.customer.findMany({
    where: { id: { in: ids }, tenantId: ctx.tenant.id },
    select: { id: true, locationId: true, status: true },
  });
  // Filter to rows the caller is actually allowed to touch. Silent
  // drop is the right call — the server shouldn't reveal existence of
  // rows outside the scope.
  const allowed = customers.filter((c) => {
    try {
      ctx.assertBranchAccess(c.locationId);
      return true;
    } catch {
      return false;
    }
  });

  const toUpdate = allowed.filter((c) => c.status !== parsed.data.status);
  if (toUpdate.length === 0) {
    revalidatePath(`/t/${slug}/customers`);
    return;
  }

  await db.customer.updateMany({
    where: { id: { in: toUpdate.map((c) => c.id) } },
    data: { status: parsed.data.status },
  });

  await Promise.all(
    toUpdate.map((c) =>
      logAudit({
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
        action: "customer.updated",
        entityType: "Customer",
        entityId: c.id,
        metadata: { bulk: true, field: "status", from: c.status, to: parsed.data.status },
      }),
    ),
  );

  revalidatePath(`/t/${slug}/customers`);
}

const bulkTagSchema = z.object({
  ids: z.string().min(1),
  tag: z.string().min(1).max(40),
});

export async function bulkTagCustomers(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "customers:edit");
  const parsed = bulkTagSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const ids = parseIds(parsed.data.ids);
  if (ids.length === 0) return;
  const tag = normalizeTag(parsed.data.tag);
  if (!tag) return;

  const customers = await db.customer.findMany({
    where: { id: { in: ids }, tenantId: ctx.tenant.id },
    select: { id: true, tags: true, locationId: true },
  });

  const allowed = customers.filter((c) => {
    try {
      ctx.assertBranchAccess(c.locationId);
      return true;
    } catch {
      return false;
    }
  });

  const changes = allowed.filter((c) => {
    const existing = new Set(c.tags.map(normalizeTag));
    return !existing.has(tag) && existing.size < MAX_TAGS_PER_CUSTOMER;
  });

  await Promise.all(
    changes.map((c) =>
      db.customer.update({
        where: { id: c.id },
        data: { tags: { set: [...c.tags, tag] } },
      }),
    ),
  );
  await Promise.all(
    changes.map((c) =>
      logAudit({
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
        action: "customer.tagged",
        entityType: "Customer",
        entityId: c.id,
        metadata: { tag, bulk: true },
      }),
    ),
  );

  revalidatePath(`/t/${slug}/customers`);
}

const bulkOwnerSchema = z.object({
  ids: z.string().min(1),
  ownerId: z.string().min(1),
});

export async function bulkAssignOwner(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "customers:edit");
  const parsed = bulkOwnerSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const ids = parseIds(parsed.data.ids);
  if (ids.length === 0) return;

  const ownerId = await validOwnerId(ctx.tenant.id, parsed.data.ownerId);
  if (!ownerId) return;

  const customers = await db.customer.findMany({
    where: { id: { in: ids }, tenantId: ctx.tenant.id },
    select: { id: true, locationId: true, ownerId: true },
  });

  const allowed = customers.filter((c) => {
    try {
      ctx.assertBranchAccess(c.locationId);
      return true;
    } catch {
      return false;
    }
  });

  const toUpdate = allowed.filter((c) => c.ownerId !== ownerId);
  if (toUpdate.length === 0) return;

  await db.customer.updateMany({
    where: { id: { in: toUpdate.map((c) => c.id) } },
    data: { ownerId },
  });

  await Promise.all(
    toUpdate.map((c) =>
      logAudit({
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
        action: "customer.updated",
        entityType: "Customer",
        entityId: c.id,
        metadata: { bulk: true, field: "ownerId", from: c.ownerId, to: ownerId },
      }),
    ),
  );

  revalidatePath(`/t/${slug}/customers`);
}

export async function removeTag(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "customers:edit");
  const parsed = tagMutationSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const customer = await db.customer.findFirst({
    where: { id: parsed.data.customerId, tenantId: ctx.tenant.id },
    select: { id: true, tags: true, locationId: true },
  });
  if (!customer) return;
  ctx.assertBranchAccess(customer.locationId);

  const tag = normalizeTag(parsed.data.tag);
  const nextTags = customer.tags.filter((t) => normalizeTag(t) !== tag);
  if (nextTags.length === customer.tags.length) return; // nothing changed

  await db.customer.update({
    where: { id: customer.id },
    data: { tags: { set: nextTags } },
  });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "customer.untagged",
    entityType: "Customer",
    entityId: customer.id,
    metadata: { tag },
  });
  revalidatePath(`/t/${slug}/customers/${customer.id}`);
  revalidatePath(`/t/${slug}/customers`);
}
