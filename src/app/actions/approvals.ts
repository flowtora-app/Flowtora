"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission, requireTenant } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { APPROVER_PERMISSION } from "@/lib/approval-requests";

// Phase 22 Slice A — approve / reject / cancel a pending ApprovalRequest.
//
// Approving a Quote send request stamps `approvedToSendAt` on the quote so
// the original requester can hit "Send" and clear the Phase 13 gate without
// needing the approver permission themselves.

const decisionSchema = z.object({
  note: z.string().max(1000).optional().or(z.literal("")),
});

function emptyNote(s: string | undefined | null): string | null {
  return s && s.length > 0 ? s : null;
}

async function loadRequest(tenantId: string, requestId: string) {
  return db.approvalRequest.findFirst({
    where:  { id: requestId, tenantId },
  });
}

export async function approveRequest(slug: string, requestId: string, formData: FormData) {
  const ctx = await requirePermission(slug, APPROVER_PERMISSION);
  const parsed = decisionSchema.safeParse(Object.fromEntries(formData.entries()));
  const note = parsed.success ? emptyNote(parsed.data.note) : null;

  const req = await loadRequest(ctx.tenant.id, requestId);
  if (!req) redirect(`/t/${slug}/approvals`);
  if (req.status !== "PENDING") {
    redirect(`/t/${slug}/approvals?error=${encodeURIComponent("This request was already decided.")}`);
  }

  const now = new Date();
  await db.approvalRequest.update({
    where: { id: req.id },
    data:  {
      status:       "APPROVED",
      decidedById:  ctx.userId,
      decidedAt:    now,
      decisionNote: note,
    },
  });

  // Side effect by entity kind. Only Quote today; keep the switch explicit so
  // a new kind without a handler is obvious rather than silently no-op-ing.
  if (req.entityType === "Quote") {
    const quote = await db.quote.findFirst({
      where:  { id: req.entityId, tenantId: ctx.tenant.id },
      select: { id: true, number: true, approvedToSendAt: true },
    });
    if (quote && !quote.approvedToSendAt) {
      await db.quote.update({
        where: { id: quote.id },
        data:  { approvedToSendAt: now, approvedToSendById: ctx.userId },
      });
    }
    if (quote) {
      await notify({
        tenantId:   ctx.tenant.id,
        userId:     req.requestedById,
        type:       "approval.approved",
        title:      `Quote ${quote.number} approved to send`,
        body:       note ?? null,
        entityType: "Quote",
        entityId:   quote.id,
        link:       `/t/${slug}/quotes/${quote.id}`,
      });
    }
  }

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "approval.approved",
    entityType: "ApprovalRequest",
    entityId:   req.id,
    metadata:   { targetType: req.entityType, targetId: req.entityId, note },
  });

  revalidatePath(`/t/${slug}/approvals`);
  if (req.entityType === "Quote") {
    revalidatePath(`/t/${slug}/quotes/${req.entityId}`);
  }
  redirect(`/t/${slug}/approvals`);
}

export async function rejectRequest(slug: string, requestId: string, formData: FormData) {
  const ctx = await requirePermission(slug, APPROVER_PERMISSION);
  const parsed = decisionSchema.safeParse(Object.fromEntries(formData.entries()));
  const note = parsed.success ? emptyNote(parsed.data.note) : null;

  const req = await loadRequest(ctx.tenant.id, requestId);
  if (!req) redirect(`/t/${slug}/approvals`);
  if (req.status !== "PENDING") {
    redirect(`/t/${slug}/approvals?error=${encodeURIComponent("This request was already decided.")}`);
  }

  await db.approvalRequest.update({
    where: { id: req.id },
    data:  {
      status:       "REJECTED",
      decidedById:  ctx.userId,
      decidedAt:    new Date(),
      decisionNote: note,
    },
  });

  if (req.entityType === "Quote") {
    const quote = await db.quote.findFirst({
      where:  { id: req.entityId, tenantId: ctx.tenant.id },
      select: { id: true, number: true },
    });
    if (quote) {
      await notify({
        tenantId:   ctx.tenant.id,
        userId:     req.requestedById,
        type:       "approval.rejected",
        title:      `Quote ${quote.number} approval rejected`,
        body:       note ?? null,
        entityType: "Quote",
        entityId:   quote.id,
        link:       `/t/${slug}/quotes/${quote.id}`,
      });
    }
  }

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "approval.rejected",
    entityType: "ApprovalRequest",
    entityId:   req.id,
    metadata:   { targetType: req.entityType, targetId: req.entityId, note },
  });

  revalidatePath(`/t/${slug}/approvals`);
  if (req.entityType === "Quote") {
    revalidatePath(`/t/${slug}/quotes/${req.entityId}`);
  }
  redirect(`/t/${slug}/approvals`);
}

// The requester can cancel their own pending request (e.g. "never mind,
// I'll restructure the discount"). Approvers can also cancel.
export async function cancelRequest(slug: string, requestId: string) {
  const ctx = await requireTenant(slug);

  const req = await loadRequest(ctx.tenant.id, requestId);
  if (!req) redirect(`/t/${slug}/approvals`);
  if (req.status !== "PENDING") {
    redirect(`/t/${slug}/approvals?error=${encodeURIComponent("This request was already decided.")}`);
  }

  const isSelf = req.requestedById === ctx.userId;
  const isApprover = ctx.can(APPROVER_PERMISSION);
  if (!isSelf && !isApprover) {
    redirect(`/t/${slug}/approvals?error=${encodeURIComponent("You can't cancel this request.")}`);
  }

  await db.approvalRequest.update({
    where: { id: req.id },
    data:  {
      status:      "CANCELED",
      decidedById: ctx.userId,
      decidedAt:   new Date(),
    },
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "approval.canceled",
    entityType: "ApprovalRequest",
    entityId:   req.id,
    metadata:   { targetType: req.entityType, targetId: req.entityId },
  });

  revalidatePath(`/t/${slug}/approvals`);
  if (req.entityType === "Quote") {
    revalidatePath(`/t/${slug}/quotes/${req.entityId}`);
  }
  redirect(`/t/${slug}/approvals`);
}
