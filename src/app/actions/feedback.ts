"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { requirePlatformStaff, logPlatformAudit } from "@/lib/platform";

// Phase 18 Slice H — product feedback submission.
//
// Every signed-in tenant member can submit; the submission is scoped to
// the tenant so nothing leaks cross-shop. We treat the "staff:manage"
// permission as the gate for viewing the inbox (owners / managers).

const feedbackSchema = z.object({
  kind:    z.enum(["IDEA", "BUG", "PRAISE", "OTHER"]).default("IDEA"),
  rating:  z.string().optional().or(z.literal("")),
  summary: z.string().min(3, "Write at least a short headline.").max(200),
  body:    z.string().max(4000).optional().or(z.literal("")),
  context: z.string().max(500).optional().or(z.literal("")),
});

const FEEDBACK_STATUSES = ["NEW", "UNDER_REVIEW", "PLANNED", "IN_PROGRESS", "SHIPPED", "REJECTED"] as const;

export async function submitFeedback(slug: string, formData: FormData) {
  // "customers:view" is the one permission every tenant role has — it's the
  // de-facto "any member with any access" gate until we add an explicit one.
  const ctx = await requirePermission(slug, "customers:view");
  const parsed = feedbackSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/feedback?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`);
  }
  const d = parsed.data;
  const rating = d.rating && d.rating.length > 0 ? Math.min(5, Math.max(1, Number(d.rating))) : null;

  await db.feedback.create({
    data: {
      tenantId: ctx.tenant.id,
      userId:   ctx.userId,
      kind:     d.kind,
      rating:   Number.isFinite(rating) && rating != null ? rating : null,
      summary:  d.summary,
      body:     d.body && d.body.length > 0 ? d.body : null,
      context:  d.context && d.context.length > 0 ? d.context : null,
    },
  });

  revalidatePath(`/t/${slug}/feedback`);
  redirect(`/t/${slug}/feedback?sent=1`);
}

// ───────────────────────────────────────────────────────────────────
// Platform-side triage — status changes, internal notes, and the
// upvote toggle. Each action gates appropriately and revalidates the
// admin board + detail page so changes show up immediately.
// ───────────────────────────────────────────────────────────────────

const statusUpdateSchema = z.object({
  status:         z.enum(FEEDBACK_STATUSES),
  resolutionNote: z.string().max(2000).optional().or(z.literal("")),
});

/**
 * Move a Feedback row through the roadmap pipeline. Admin-only — every
 * status flip writes to the platform audit log so we can answer "who
 * shipped X" without spelunking through git history.
 */
export async function changeFeedbackStatus(feedbackId: string, formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.canWrite) {
    redirect(`/platform/feedback/${feedbackId}?error=${encodeURIComponent("Requires admin role")}`);
  }
  const parsed = statusUpdateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/platform/feedback/${feedbackId}?error=${encodeURIComponent("Invalid status")}`);
  }

  const fb = await db.feedback.findUnique({
    where:  { id: feedbackId },
    select: { id: true, status: true, shippedAt: true, tenantId: true },
  });
  if (!fb) {
    redirect(`/platform/feedback?error=${encodeURIComponent("Not found")}`);
  }
  if (fb.status === parsed.data.status && !parsed.data.resolutionNote) {
    revalidatePath(`/platform/feedback/${feedbackId}`);
    return; // no-op
  }

  const becomingShipped = fb.status !== "SHIPPED" && parsed.data.status === "SHIPPED";

  await db.feedback.update({
    where: { id: feedbackId },
    data: {
      status: parsed.data.status,
      resolutionNote:
        parsed.data.resolutionNote && parsed.data.resolutionNote.length > 0
          ? parsed.data.resolutionNote
          : null,
      ...(becomingShipped && !fb.shippedAt ? { shippedAt: new Date() } : {}),
    },
  });

  await logPlatformAudit({
    userId:     ctx.userId,
    tenantId:   fb.tenantId,
    action:     "platform.feedback_status_changed",
    entityType: "Feedback",
    entityId:   feedbackId,
    metadata:   { actor: ctx.email, from: fb.status, to: parsed.data.status },
  });

  revalidatePath("/platform/feedback");
  revalidatePath(`/platform/feedback/${feedbackId}`);
}

const internalNotesSchema = z.object({
  internalNotes: z.string().max(4000).optional().or(z.literal("")),
});

/**
 * Set or clear the admin-only internalNotes column. Tenants never see
 * this field — it's filtered out at the tenant query level.
 */
export async function saveFeedbackInternalNotes(feedbackId: string, formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.canWrite) {
    redirect(`/platform/feedback/${feedbackId}?error=${encodeURIComponent("Requires admin role")}`);
  }
  const parsed = internalNotesSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/platform/feedback/${feedbackId}?error=${encodeURIComponent("Invalid notes")}`);
  }

  await db.feedback.update({
    where: { id: feedbackId },
    data: {
      internalNotes:
        parsed.data.internalNotes && parsed.data.internalNotes.length > 0
          ? parsed.data.internalNotes
          : null,
    },
  });

  revalidatePath(`/platform/feedback/${feedbackId}`);
}

/**
 * Toggle the calling user's vote on a feedback row. Idempotent: a
 * second call from the same user removes the vote. The denormalized
 * `voteCount` is recomputed from the join table inside a transaction
 * so it stays consistent under concurrent toggles.
 */
export async function toggleFeedbackVote(slug: string, feedbackId: string) {
  const ctx = await requirePermission(slug, "customers:view");

  await db.$transaction(async (tx) => {
    const existing = await tx.feedbackVote.findUnique({
      where: { feedbackId_userId: { feedbackId, userId: ctx.userId } },
    });
    if (existing) {
      await tx.feedbackVote.delete({ where: { id: existing.id } });
    } else {
      await tx.feedbackVote.create({
        data: { feedbackId, userId: ctx.userId, tenantId: ctx.tenant.id },
      });
    }
    const count = await tx.feedbackVote.count({ where: { feedbackId } });
    await tx.feedback.update({
      where: { id: feedbackId },
      data: { voteCount: count },
    });
  });

  revalidatePath(`/t/${slug}/feedback`);
  revalidatePath("/platform/feedback");
  revalidatePath(`/platform/feedback/${feedbackId}`);
}
