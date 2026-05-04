"use server";

// Page 36 — Feature Requests / Roadmap actions.
//
// Author lifecycle (create, edit, transition, merge), voting (per-user
// idempotent), comments, and ticket linking. All audit-logged.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
  requirePlatformStaff,
} from "@/lib/platform";

const LIST_ROUTE = "/platform/operations/feature-requests";
const PERM_WRITE = "features.manage" as const;
const detailRoute = (id: string) => `${LIST_ROUTE}/${id}`;

function splitList(input: string | undefined | null): string[] {
  if (!input) return [];
  return input.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
}

/* ── Create ────────────────────────────────────────────── */

const createSchema = z.object({
  title: z.string().min(1, "Title required").max(200),
  description: z.string().max(20_000).default(""),
  tags: z.string().optional().or(z.literal("")),
  swimlane: z.string().max(40).optional().or(z.literal("")),
  isPublic: z.union([z.literal("on"), z.literal("")]).optional(),
  submitterTenantId: z.string().optional().or(z.literal("")),
});

export async function createFeatureRequest(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${LIST_ROUTE}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const created = await db.featureRequest.create({
    data: {
      title: d.title,
      description: d.description,
      tags: splitList(d.tags).map((t) => t.toLowerCase()),
      swimlane: d.swimlane || null,
      isPublic: d.isPublic === "on",
      submitterUserId: ctx.userId,
      submitterTenantId: d.submitterTenantId || null,
      status: "SUBMITTED",
    },
    select: { id: true },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.feature_request.created",
    entityType: "FeatureRequest",
    entityId: created.id,
    metadata: { actor: ctx.email, title: d.title, isPublic: d.isPublic === "on" },
  });
  revalidatePath(LIST_ROUTE);
  redirect(`${detailRoute(created.id)}?ok=created`);
}

/* ── Update ────────────────────────────────────────────── */

const updateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1, "Title required").max(200),
  description: z.string().max(20_000).default(""),
  tags: z.string().optional().or(z.literal("")),
  swimlane: z.string().max(40).optional().or(z.literal("")),
  plannedRelease: z.string().max(20).optional().or(z.literal("")),
  isPublic: z.union([z.literal("on"), z.literal("")]).optional(),
  iceImpact: z.string().optional().or(z.literal("")),
  iceConfidence: z.string().optional().or(z.literal("")),
  iceEase: z.string().optional().or(z.literal("")),
  effort: z.enum(["", "XS", "S", "M", "L", "XL"]).default(""),
  linkedSupportTicketIds: z.string().optional().or(z.literal("")),
});

const toIce = (v: string | undefined): number | null => {
  if (!v) return null;
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return null;
  return Math.max(1, Math.min(10, n));
};

export async function updateFeatureRequest(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = updateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const id = formData.get("id");
    redirect(`${detailRoute(String(id))}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  await db.featureRequest.update({
    where: { id: d.id },
    data: {
      title: d.title,
      description: d.description,
      tags: splitList(d.tags).map((t) => t.toLowerCase()),
      swimlane: d.swimlane || null,
      plannedRelease: d.plannedRelease || null,
      isPublic: d.isPublic === "on",
      iceImpact: toIce(d.iceImpact),
      iceConfidence: toIce(d.iceConfidence),
      iceEase: toIce(d.iceEase),
      effort: d.effort === "" ? null : d.effort,
      linkedSupportTicketIds: splitList(d.linkedSupportTicketIds),
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.feature_request.updated",
    entityType: "FeatureRequest",
    entityId: d.id,
    metadata: { actor: ctx.email, title: d.title },
  });
  revalidatePath(LIST_ROUTE);
  revalidatePath(detailRoute(d.id));
  redirect(`${detailRoute(d.id)}?ok=saved`);
}

/* ── Transition (status change) ────────────────────────── */

const transitionSchema = z.object({
  id: z.string().min(1),
  to: z.enum(["SUBMITTED", "BACKLOG", "UNDER_REVIEW", "PLANNED", "IN_PROGRESS", "BETA", "SHIPPED", "WONT_DO"]),
  /** Optional — used by the kanban drag-drop to bounce back to the board on success. */
  returnTo: z.string().optional().or(z.literal("")),
});

export async function transitionFeatureRequest(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = transitionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const id = formData.get("id");
    redirect(`${detailRoute(String(id))}?error=${encodeURIComponent("Invalid status")}`);
  }
  const { id, to } = parsed.data;
  const now = new Date();
  await db.featureRequest.update({
    where: { id },
    data: {
      status: to,
      shippedAt: to === "SHIPPED" ? now : undefined,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: `platform.feature_request.${to.toLowerCase()}`,
    entityType: "FeatureRequest",
    entityId: id,
    metadata: { actor: ctx.email, to },
  });
  revalidatePath(LIST_ROUTE);
  revalidatePath(detailRoute(id));
  const dest = parsed.data.returnTo && parsed.data.returnTo.startsWith(LIST_ROUTE)
    ? parsed.data.returnTo
    : detailRoute(id);
  const sep = dest.includes("?") ? "&" : "?";
  redirect(`${dest}${sep}ok=transitioned`);
}

/* ── Voting ────────────────────────────────────────────── */

const voteSchema = z.object({
  id: z.string().min(1),
  direction: z.enum(["UP", "DOWN", "CLEAR"]),
  returnTo: z.string().optional().or(z.literal("")),
});

export async function voteOnFeatureRequest(formData: FormData) {
  const ctx = await requirePlatformStaff();
  const parsed = voteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Invalid vote")}`);
  }
  const { id, direction } = parsed.data;
  const existing = await db.featureRequestVote.findUnique({
    where: { requestId_userId: { requestId: id, userId: ctx.userId } },
    select: { direction: true },
  });

  // Handle the 3 transitions: clear, change, add.
  if (direction === "CLEAR") {
    if (existing) {
      await db.featureRequestVote.delete({
        where: { requestId_userId: { requestId: id, userId: ctx.userId } },
      });
      await db.featureRequest.update({
        where: { id },
        data: existing.direction === "UP"
          ? { upvoteCount: { decrement: 1 } }
          : { downvoteCount: { decrement: 1 } },
      });
    }
  } else {
    if (!existing) {
      await db.featureRequestVote.create({
        data: { requestId: id, userId: ctx.userId, direction },
      });
      await db.featureRequest.update({
        where: { id },
        data: direction === "UP"
          ? { upvoteCount: { increment: 1 } }
          : { downvoteCount: { increment: 1 } },
      });
    } else if (existing.direction !== direction) {
      // Flip — decrement old, increment new.
      await db.featureRequestVote.update({
        where: { requestId_userId: { requestId: id, userId: ctx.userId } },
        data: { direction },
      });
      await db.featureRequest.update({
        where: { id },
        data: direction === "UP"
          ? { upvoteCount: { increment: 1 }, downvoteCount: { decrement: 1 } }
          : { downvoteCount: { increment: 1 }, upvoteCount: { decrement: 1 } },
      });
    }
  }

  revalidatePath(detailRoute(id));
  const dest = parsed.data.returnTo && parsed.data.returnTo.startsWith(LIST_ROUTE)
    ? parsed.data.returnTo
    : detailRoute(id);
  redirect(dest);
}

/* ── Comments ──────────────────────────────────────────── */

const commentSchema = z.object({
  id: z.string().min(1),
  body: z.string().min(1, "Comment required").max(8_000),
});

export async function postFeatureRequestComment(formData: FormData) {
  const ctx = await requirePlatformStaff();
  const parsed = commentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const id = formData.get("id");
    redirect(`${detailRoute(String(id))}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  await db.featureRequestComment.create({
    data: {
      requestId: parsed.data.id,
      authorId: ctx.userId,
      body: parsed.data.body,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.feature_request.commented",
    entityType: "FeatureRequest",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(detailRoute(parsed.data.id));
  redirect(`${detailRoute(parsed.data.id)}#comments`);
}

/* ── Merge ─────────────────────────────────────────────── */

const mergeSchema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
});

export async function mergeFeatureRequests(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = mergeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Invalid merge")}`);
  const { sourceId, targetId } = parsed.data;
  if (sourceId === targetId) redirect(`${detailRoute(sourceId)}?error=${encodeURIComponent("Pick a different target")}`);

  const [source, target] = await Promise.all([
    db.featureRequest.findUnique({ where: { id: sourceId } }),
    db.featureRequest.findUnique({ where: { id: targetId } }),
  ]);
  if (!source || !target) redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Source or target missing")}`);

  // Re-point votes — INSERT IGNORE-style: if a user voted on both, keep the
  // target vote and drop the source vote (no double-counting). For simplicity
  // we do this in two steps: delete source-side votes that already exist on
  // target, then re-point the rest.
  if (source && target) {
    const sourceVotes = await db.featureRequestVote.findMany({
      where: { requestId: sourceId },
      select: { id: true, userId: true, direction: true },
    });
    const existingTargetVoteUsers = new Set(
      (await db.featureRequestVote.findMany({
        where: { requestId: targetId },
        select: { userId: true },
      })).map((v) => v.userId),
    );
    const toRepoint = sourceVotes.filter((v) => !existingTargetVoteUsers.has(v.userId));
    const toDrop = sourceVotes.filter((v) => existingTargetVoteUsers.has(v.userId));
    if (toDrop.length > 0) {
      await db.featureRequestVote.deleteMany({ where: { id: { in: toDrop.map((v) => v.id) } } });
    }
    for (const v of toRepoint) {
      await db.featureRequestVote.update({
        where: { id: v.id },
        data: { requestId: targetId },
      });
    }
    // Re-tally target counters from FeatureRequestVote.
    const [up, down] = await Promise.all([
      db.featureRequestVote.count({ where: { requestId: targetId, direction: "UP" } }),
      db.featureRequestVote.count({ where: { requestId: targetId, direction: "DOWN" } }),
    ]);
    await db.featureRequest.update({
      where: { id: targetId },
      data: {
        upvoteCount: up,
        downvoteCount: down,
        // Merge tag union + ticket id union.
        tags: Array.from(new Set([...target.tags, ...source.tags])),
        linkedSupportTicketIds: Array.from(new Set([...target.linkedSupportTicketIds, ...source.linkedSupportTicketIds])),
      },
    });
    // Re-point comments.
    await db.featureRequestComment.updateMany({
      where: { requestId: sourceId },
      data: { requestId: targetId },
    });
    // Mark the source merged.
    await db.featureRequest.update({
      where: { id: sourceId },
      data: { mergedIntoId: targetId, mergedAt: new Date() },
    });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.feature_request.merged",
      entityType: "FeatureRequest",
      entityId: sourceId,
      metadata: { actor: ctx.email, sourceTitle: source.title, targetId, targetTitle: target.title },
    });
  }

  revalidatePath(LIST_ROUTE);
  revalidatePath(detailRoute(targetId));
  redirect(`${detailRoute(targetId)}?ok=merged-from-${sourceId.slice(0, 6)}`);
}

/* ── Convert to support ticket / bug ───────────────────── */

const convertSchema = z.object({
  id: z.string().min(1),
});

export async function convertFeatureRequestToBug(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = convertSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Invalid")}`);

  const fr = await db.featureRequest.findUnique({ where: { id: parsed.data.id } });
  if (!fr) redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Not found")}`);
  // Page 37 (Bug Reports) is its own surface; until then we materialize the
  // converted bug as a SupportTicket with category=BUG so it lands in the
  // shared inbox + has a real audit trail.
  if (!fr) return;
  const tenantId = fr.submitterTenantId;
  if (!tenantId) {
    redirect(`${detailRoute(fr.id)}?error=${encodeURIComponent("Need a submitter tenant before converting")}`);
  }
  const ticket = await db.supportTicket.create({
    data: {
      tenantId,
      subject: `[bug] ${fr.title}`,
      category: "BUG",
      module: "OTHER",
      priority: "NORMAL",
      status: "OPEN",
      openedByUserId: fr.submitterUserId,
    },
    select: { id: true },
  });
  await db.supportTicketMessage.create({
    data: {
      ticketId: ticket.id,
      authorId: ctx.userId,
      isStaff: true,
      internal: true,
      body: `Converted from feature request ${fr.id} (${fr.title}). Original description:\n\n${fr.description}`,
    },
  });
  await db.featureRequest.update({
    where: { id: fr.id },
    data: {
      linkedBugId: ticket.id,
      status: fr.status === "SUBMITTED" || fr.status === "UNDER_REVIEW" ? "WONT_DO" : fr.status,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.feature_request.converted_to_bug",
    entityType: "FeatureRequest",
    entityId: fr.id,
    metadata: { actor: ctx.email, ticketId: ticket.id },
  });
  revalidatePath(LIST_ROUTE);
  revalidatePath(detailRoute(fr.id));
  redirect(`${detailRoute(fr.id)}?ok=converted-to-${ticket.id.slice(0, 6)}`);
}
