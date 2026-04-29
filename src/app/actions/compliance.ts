"use server";

// Phase 17 Slice E — data-export + account-deletion actions.
//
// Tenant side: owner requests an export, cancels a deletion, or requests
// a deletion. Platform side: staff fulfills exports, executes deletions.
//
// Both requests are tenant-initiated and require the OWNER role
// specifically — ADMIN is not enough because these touch the existence of
// the account itself. We also rate-limit at the app layer by refusing to
// open a second SCHEDULED deletion for the same tenant.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { requirePlatformAdmin } from "@/lib/platform";
import { logAudit } from "@/lib/audit";
import { logPlatformAudit } from "@/lib/platform";
import {
  generateTenantExport,
  EXPORT_RETENTION_DAYS,
  DELETION_GRACE_DAYS,
} from "@/lib/compliance";

// ────────────────────────────────────────────────────────────
// Data export — tenant requests, platform fulfills
// ────────────────────────────────────────────────────────────

/**
 * Tenant owner clicks "Export my data" from settings → danger zone.
 * Creates a PENDING request. If an open (PENDING / PROCESSING / COMPLETED
 * and un-expired) request already exists, no-op — they already have one
 * in flight or a recent download is available.
 */
export async function requestDataExport(slug: string) {
  const ctx = await requireTenant(slug);
  if (ctx.role !== "OWNER") {
    redirect(`/t/${slug}/settings/danger?error=${encodeURIComponent("Only the owner can request exports.")}`);
  }

  // Don't stack open requests. Completed-but-still-downloadable counts too.
  const existing = await db.dataExportRequest.findFirst({
    where: {
      tenantId: ctx.tenant.id,
      OR: [
        { status: { in: ["PENDING", "PROCESSING"] } },
        { status: "COMPLETED", expiresAt: { gt: new Date() } },
      ],
    },
  });
  if (existing) {
    redirect(`/t/${slug}/settings/danger?error=${encodeURIComponent("An export is already in flight or recently completed.")}`);
  }

  const req = await db.dataExportRequest.create({
    data: {
      tenantId: ctx.tenant.id,
      requestedBy: ctx.userId,
      status: "PENDING",
    },
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "compliance.export_requested",
    entityType: "DataExportRequest",
    entityId: req.id,
  });

  revalidatePath(`/t/${slug}/settings/danger`);
  revalidatePath(`/platform/compliance`);
}

/**
 * Platform staff clicks "Fulfill" on a pending export — we generate the
 * JSON bundle synchronously (fine for our volumes) and stash it on the
 * row with an expiry. Tenant downloads via a signed route below.
 */
export async function fulfillDataExport(requestId: string) {
  const ctx = await requirePlatformAdmin();
  const req = await db.dataExportRequest.findUnique({
    where: { id: requestId },
    select: { id: true, tenantId: true, status: true },
  });
  if (!req) return;
  if (req.status !== "PENDING" && req.status !== "FAILED") return;

  // Mark PROCESSING before we start so concurrent "Fulfill" clicks can't
  // double-generate the payload.
  await db.dataExportRequest.update({
    where: { id: req.id },
    data: { status: "PROCESSING", errorMessage: null },
  });

  try {
    const payload = await generateTenantExport(req.tenantId);
    const expiresAt = new Date(Date.now() + EXPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    await db.dataExportRequest.update({
      where: { id: req.id },
      data: {
        status: "COMPLETED",
        payload,
        expiresAt,
        completedAt: new Date(),
      },
    });

    await logPlatformAudit({
      userId: ctx.userId,
      tenantId: req.tenantId,
      action: "platform.export_fulfilled",
      entityType: "DataExportRequest",
      entityId: req.id,
      metadata: {
        actor: ctx.email,
        payloadBytes: payload.length,
        expiresAt: expiresAt.toISOString(),
      },
    });
  } catch (err) {
    await db.dataExportRequest.update({
      where: { id: req.id },
      data: {
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
    await logPlatformAudit({
      userId: ctx.userId,
      tenantId: req.tenantId,
      action: "platform.export_failed",
      entityType: "DataExportRequest",
      entityId: req.id,
      metadata: { actor: ctx.email, error: err instanceof Error ? err.message : String(err) },
    });
  }

  revalidatePath(`/platform/compliance`);
  revalidatePath(`/platform/tenants/${req.tenantId}`);
}

// ────────────────────────────────────────────────────────────
// Account deletion — tenant requests with grace period
// ────────────────────────────────────────────────────────────

const deletionSchema = z.object({
  reason: z.string().max(500).optional().or(z.literal("")),
  confirm: z.string().optional(), // UI passes the tenant slug as confirmation
});

/**
 * Tenant OWNER schedules deletion. Inserts a SCHEDULED request; nothing
 * destructive happens yet. The owner can cancel any time before the
 * scheduled-for date, at which point platform staff may execute.
 */
export async function requestAccountDeletion(slug: string, formData: FormData) {
  const ctx = await requireTenant(slug);
  if (ctx.role !== "OWNER") {
    redirect(`/t/${slug}/settings/danger?error=${encodeURIComponent("Only the owner can delete the account.")}`);
  }
  const parsed = deletionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/settings/danger?error=${encodeURIComponent("Invalid request.")}`);
  }
  if (parsed.data.confirm !== ctx.tenant.slug) {
    redirect(`/t/${slug}/settings/danger?error=${encodeURIComponent("Type the shop slug exactly to confirm.")}`);
  }

  // Refuse if one is already SCHEDULED. Owner can cancel it first.
  const existing = await db.accountDeletionRequest.findFirst({
    where: { tenantId: ctx.tenant.id, status: "SCHEDULED" },
  });
  if (existing) {
    redirect(`/t/${slug}/settings/danger?error=${encodeURIComponent("A deletion is already scheduled.")}`);
  }

  const scheduledFor = new Date(Date.now() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
  const req = await db.accountDeletionRequest.create({
    data: {
      tenantId: ctx.tenant.id,
      requestedBy: ctx.userId,
      reason: parsed.data.reason?.trim() || null,
      scheduledFor,
      status: "SCHEDULED",
    },
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "compliance.deletion_requested",
    entityType: "AccountDeletionRequest",
    entityId: req.id,
    metadata: { scheduledFor: scheduledFor.toISOString() },
  });

  revalidatePath(`/t/${slug}/settings/danger`);
  revalidatePath(`/platform/compliance`);
}

/**
 * Tenant OWNER cancels a SCHEDULED deletion. Available right up until
 * platform staff execute it.
 */
export async function cancelAccountDeletionAsTenant(slug: string, requestId: string) {
  const ctx = await requireTenant(slug);
  if (ctx.role !== "OWNER") return;

  const req = await db.accountDeletionRequest.findFirst({
    where: { id: requestId, tenantId: ctx.tenant.id, status: "SCHEDULED" },
  });
  if (!req) return;

  await db.accountDeletionRequest.update({
    where: { id: req.id },
    data: {
      status: "CANCELED",
      canceledBy: ctx.userId,
      canceledAt: new Date(),
    },
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "compliance.deletion_canceled_by_tenant",
    entityType: "AccountDeletionRequest",
    entityId: req.id,
  });

  revalidatePath(`/t/${slug}/settings/danger`);
  revalidatePath(`/platform/compliance`);
}

/**
 * Platform ADMIN executes a scheduled deletion once the grace period has
 * elapsed. We don't actually row-delete the tenant (payment history,
 * compliance hold, etc.) — we flip status → CANCELED, null out external
 * billing identifiers, and record the event. A follow-up hard-delete
 * cron/runbook can purge rows later once finance signs off.
 */
export async function executeAccountDeletion(requestId: string) {
  const ctx = await requirePlatformAdmin();
  const req = await db.accountDeletionRequest.findUnique({
    where: { id: requestId },
    select: { id: true, tenantId: true, status: true, scheduledFor: true },
  });
  if (!req) return;
  if (req.status !== "SCHEDULED") return;
  if (req.scheduledFor.getTime() > Date.now()) {
    // Platform staff override ("force delete now") could be useful later;
    // for v1 we insist on the grace period to avoid foot-guns.
    redirect(`/platform/compliance?error=${encodeURIComponent("Grace period hasn't elapsed yet.")}`);
  }

  await db.$transaction([
    db.tenant.update({
      where: { id: req.tenantId },
      data: {
        status: "CANCELED",
        stripeSubscriptionId: null,
        suspensionReason: "Account deleted per owner request.",
      },
    }),
    db.accountDeletionRequest.update({
      where: { id: req.id },
      data: {
        status: "COMPLETED",
        completedBy: ctx.userId,
        completedAt: new Date(),
      },
    }),
  ]);

  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: req.tenantId,
    action: "platform.account_deleted",
    entityType: "AccountDeletionRequest",
    entityId: req.id,
    metadata: { actor: ctx.email },
  });

  revalidatePath(`/platform/compliance`);
  revalidatePath(`/platform/tenants/${req.tenantId}`);
}

/**
 * Platform ADMIN can cancel a scheduled deletion on the tenant's behalf
 * (e.g. they called support saying "oops, keep us active").
 */
export async function cancelAccountDeletionAsStaff(requestId: string) {
  const ctx = await requirePlatformAdmin();
  const req = await db.accountDeletionRequest.findUnique({
    where: { id: requestId },
    select: { id: true, tenantId: true, status: true },
  });
  if (!req) return;
  if (req.status !== "SCHEDULED") return;

  await db.accountDeletionRequest.update({
    where: { id: req.id },
    data: {
      status: "CANCELED",
      canceledBy: ctx.userId,
      canceledAt: new Date(),
    },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: req.tenantId,
    action: "platform.deletion_canceled",
    entityType: "AccountDeletionRequest",
    entityId: req.id,
    metadata: { actor: ctx.email },
  });

  revalidatePath(`/platform/compliance`);
  revalidatePath(`/platform/tenants/${req.tenantId}`);
}

// ────────────────────────────────────────────────────────────
// Slice E2 — admin-only export & deletion management.
// Three additions for the compliance redesign:
//   • regenerateDataExport — re-run fulfillment on a COMPLETED row,
//     useful when a tenant's data has changed since export
//   • cancelDataExportAsStaff — back out a PENDING / FAILED request
//   • extendDeletionGracePeriod — bump scheduledFor by N days
// ────────────────────────────────────────────────────────────

export async function regenerateDataExport(requestId: string) {
  const ctx = await requirePlatformAdmin();
  const req = await db.dataExportRequest.findUnique({
    where:  { id: requestId },
    select: { id: true, tenantId: true, status: true },
  });
  if (!req) return;
  if (req.status !== "COMPLETED" && req.status !== "EXPIRED" && req.status !== "FAILED") return;

  // Reset to PROCESSING and clear the old payload so concurrent
  // download attempts during regeneration get a clean failure rather
  // than the stale bundle.
  await db.dataExportRequest.update({
    where: { id: req.id },
    data: {
      status: "PROCESSING",
      payload: null,
      errorMessage: null,
      expiresAt: null,
      completedAt: null,
    },
  });

  try {
    const payload = await generateTenantExport(req.tenantId);
    const expiresAt = new Date(Date.now() + EXPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await db.dataExportRequest.update({
      where: { id: req.id },
      data: {
        status: "COMPLETED",
        payload,
        expiresAt,
        completedAt: new Date(),
      },
    });
    await logPlatformAudit({
      userId:     ctx.userId,
      tenantId:   req.tenantId,
      action:     "platform.export_regenerated",
      entityType: "DataExportRequest",
      entityId:   req.id,
      metadata:   { actor: ctx.email, payloadBytes: payload.length },
    });
  } catch (err) {
    await db.dataExportRequest.update({
      where: { id: req.id },
      data: {
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
  }

  revalidatePath(`/platform/compliance`);
  revalidatePath(`/platform/tenants/${req.tenantId}`);
}

export async function cancelDataExportAsStaff(requestId: string, formData: FormData) {
  const ctx = await requirePlatformAdmin();
  const req = await db.dataExportRequest.findUnique({
    where:  { id: requestId },
    select: { id: true, tenantId: true, status: true },
  });
  if (!req) return;
  if (req.status === "COMPLETED" || req.status === "EXPIRED") {
    redirect(`/platform/compliance?error=${encodeURIComponent("Cannot cancel a completed export.")}`);
  }
  const reason = (formData.get("reason") as string | null)?.trim() || "Canceled by platform admin";

  // No CANCELED enum value — encode cancellation as FAILED with a
  // recognizable errorMessage prefix. The UI keys off the prefix to
  // render a "Canceled" pill instead of "Failed".
  await db.dataExportRequest.update({
    where: { id: req.id },
    data: { status: "FAILED", errorMessage: `Canceled: ${reason}` },
  });

  await logPlatformAudit({
    userId:     ctx.userId,
    tenantId:   req.tenantId,
    action:     "platform.export_canceled",
    entityType: "DataExportRequest",
    entityId:   req.id,
    metadata:   { actor: ctx.email, reason },
  });

  revalidatePath(`/platform/compliance`);
  revalidatePath(`/platform/tenants/${req.tenantId}`);
}

const extendSchema = z.object({
  days: z.coerce.number().int().min(1).max(180),
});

export async function extendDeletionGracePeriod(requestId: string, formData: FormData) {
  const ctx = await requirePlatformAdmin();
  const parsed = extendSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/platform/compliance?error=${encodeURIComponent("Invalid extension days (1–180).")}`);
  }
  const req = await db.accountDeletionRequest.findUnique({
    where:  { id: requestId },
    select: { id: true, tenantId: true, status: true, scheduledFor: true },
  });
  if (!req) return;
  if (req.status !== "SCHEDULED") {
    redirect(`/platform/compliance?error=${encodeURIComponent("Only scheduled deletions can be extended.")}`);
  }
  const next = new Date(req.scheduledFor.getTime() + parsed.data.days * 86_400_000);
  await db.accountDeletionRequest.update({
    where: { id: req.id },
    data:  { scheduledFor: next },
  });

  await logPlatformAudit({
    userId:     ctx.userId,
    tenantId:   req.tenantId,
    action:     "platform.deletion_grace_extended",
    entityType: "AccountDeletionRequest",
    entityId:   req.id,
    metadata:   { actor: ctx.email, days: parsed.data.days, newScheduledFor: next.toISOString() },
  });

  revalidatePath(`/platform/compliance`);
  revalidatePath(`/platform/tenants/${req.tenantId}`);
}
