"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { notifyMany } from "@/lib/notifications";
import { listActiveMembers } from "@/lib/members";
import {
  PARENT_VIEW_PERMISSION,
  parentWhere,
  parentLabel,
  extractMentionedUserIds,
  type CommentParent,
  type CommentParentKind,
} from "@/lib/comments";

// Phase 14 — Comment actions.
//
// One entry point per verb (create/update/delete). Each takes an explicit
// `parent` descriptor so the action:
//   1. picks the right view permission (via PARENT_VIEW_PERMISSION)
//   2. validates the parent actually belongs to the caller's tenant
//   3. can revalidate the right detail page
//
// Form payloads come in as FormData from server-component `<form action={...}>`
// wrappers (see CommentThread). The parent descriptor is encoded as hidden
// inputs (`parentKind`, `parentId`) and rehydrated server-side — keeping the
// wire shape flat makes the component trivially reusable.

const parentKindEnum = z.enum(["customer", "quote", "order", "proof", "install", "task"]);

const createSchema = z.object({
  parentKind: parentKindEnum,
  parentId:   z.string().min(1),
  body:       z.string().trim().min(1).max(10_000),
});

const updateSchema = z.object({
  body: z.string().trim().min(1).max(10_000),
});

// Rehydrate a CommentParent from the flat (kind, id) pair. Kept close to the
// schema so the Zod enum + union stay in lock-step.
function toParent(kind: CommentParentKind, id: string): CommentParent {
  switch (kind) {
    case "customer": return { kind: "customer",  customerId: id };
    case "quote":    return { kind: "quote",     quoteId: id };
    case "order":    return { kind: "order",     orderId: id };
    case "proof":    return { kind: "proof",     proofId: id };
    case "install":  return { kind: "install",   installEventId: id };
    case "task":     return { kind: "task",      taskId: id };
  }
}

// Revalidation path for the detail page the comment is shown on. Matches the
// router conventions everywhere else in the app.
function revalidateParent(slug: string, kind: CommentParentKind, id: string) {
  switch (kind) {
    case "customer": return revalidatePath(`/t/${slug}/customers/${id}`);
    case "quote":    return revalidatePath(`/t/${slug}/quotes/${id}`);
    case "order":    return revalidatePath(`/t/${slug}/orders/${id}`);
    case "proof":    // proofs render nested under orders — caller can pass orderId if needed
                     return revalidatePath(`/t/${slug}/orders`);
    case "install":  return revalidatePath(`/t/${slug}/installs/${id}`);
    case "task":     return revalidatePath(`/t/${slug}/inbox`);
  }
}

// ────────────────────────────────────────────────────────────
// Parent-existence check per kind — single source of truth.
// Returns true if the parent row exists and belongs to `tenantId`.
// ────────────────────────────────────────────────────────────
async function parentBelongsToTenant(
  tenantId: string,
  parent: CommentParent,
): Promise<boolean> {
  switch (parent.kind) {
    case "customer":
      return !!(await db.customer.findFirst({ where: { id: parent.customerId, tenantId }, select: { id: true } }));
    case "quote":
      return !!(await db.quote.findFirst({ where: { id: parent.quoteId, tenantId }, select: { id: true } }));
    case "order":
      return !!(await db.order.findFirst({ where: { id: parent.orderId, tenantId }, select: { id: true } }));
    case "proof":
      return !!(await db.proof.findFirst({ where: { id: parent.proofId, tenantId }, select: { id: true } }));
    case "install":
      return !!(await db.installEvent.findFirst({ where: { id: parent.installEventId, tenantId }, select: { id: true } }));
    case "task":
      return !!(await db.task.findFirst({ where: { id: parent.taskId, tenantId }, select: { id: true } }));
  }
}

// ────────────────────────────────────────────────────────────
// Create
// ────────────────────────────────────────────────────────────

export async function createComment(slug: string, formData: FormData) {
  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return; // silent ignore — form validation is UX, not security

  const parent = toParent(parsed.data.parentKind, parsed.data.parentId);
  const ctx = await requirePermission(slug, PARENT_VIEW_PERMISSION[parent.kind]);

  if (!(await parentBelongsToTenant(ctx.tenant.id, parent))) return;

  // Slice B — resolve @mentions against the tenant's active roster.
  // The list is tiny (shop-sized) so this extra query per post is fine.
  const members = await listActiveMembers(ctx.tenant.id);
  const mentionedUserIds = extractMentionedUserIds(parsed.data.body, members);

  const created = await db.comment.create({
    data: {
      tenantId: ctx.tenant.id,
      authorId: ctx.userId,
      body:     parsed.data.body,
      mentionedUserIds,
      ...parentWhere(parent),
    },
  });

  // Notify mentioned users. Self-mentions are filtered by `notifyMany`'s
  // `excludeUserId` option — same pattern used by every other notify site.
  if (mentionedUserIds.length > 0) {
    const authorName =
      members.find((m) => m.userId === ctx.userId)?.name ?? "A teammate";
    const snippet = summarize(parsed.data.body);
    await notifyMany(
      mentionedUserIds,
      {
        tenantId:   ctx.tenant.id,
        type:       "comment.mention",
        title:      `${authorName} mentioned you on a ${parentLabel(parent.kind)}`,
        body:       snippet,
        entityType: "Comment",
        entityId:   created.id,
        link:       parentDetailLink(slug, parent),
      },
      { excludeUserId: ctx.userId },
    );
  }

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "comment.created",
    entityType: "Comment",
    entityId:   created.id,
    metadata:   { parentKind: parent.kind, mentions: mentionedUserIds.length },
  });

  revalidateParent(slug, parent.kind, parsed.data.parentId);
}

// Short preview for notification bodies — strip whitespace runs, cap at a
// sensible length. Long single-line snippets get a trailing ellipsis.
function summarize(body: string): string {
  const compact = body.replace(/\s+/g, " ").trim();
  if (compact.length <= 140) return compact;
  return compact.slice(0, 137) + "…";
}

// Deep-link for the notification → takes you to the detail page where the
// comment thread lives. Proof detail lives under `orders/{id}/proofs/{id}`,
// which needs the parent order. For now we degrade gracefully: without the
// order id in hand, we link the user to the order list and they find their
// way. A follow-up can denormalize orderId onto Comment if this becomes
// painful.
function parentDetailLink(slug: string, parent: CommentParent): string {
  switch (parent.kind) {
    case "customer": return `/t/${slug}/customers/${parent.customerId}`;
    case "quote":    return `/t/${slug}/quotes/${parent.quoteId}`;
    case "order":    return `/t/${slug}/orders/${parent.orderId}`;
    case "proof":    return `/t/${slug}/orders`;
    case "install":  return `/t/${slug}/installs/${parent.installEventId}`;
    case "task":     return `/t/${slug}/inbox?chip=tasks`;
  }
}

// ────────────────────────────────────────────────────────────
// Update — only the author can edit their own comment.
// ────────────────────────────────────────────────────────────

export async function updateComment(
  slug: string,
  commentId: string,
  formData: FormData,
) {
  const parsed = updateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const ctx = await requirePermission(slug, "customers:view"); // any staff member
  const existing = await db.comment.findFirst({
    where: { id: commentId, tenantId: ctx.tenant.id, deletedAt: null },
    select: {
      id: true, authorId: true, mentionedUserIds: true,
      customerId: true, quoteId: true, orderId: true,
      proofId: true, installEventId: true, taskId: true,
    },
  });
  if (!existing) return;
  if (existing.authorId !== ctx.userId) {
    // No one but the author can rewrite the content — reword policy is a
    // deliberate social choice, not just a technical restriction.
    redirect(`/t/${slug}/dashboard?error=forbidden`);
  }

  const members = await listActiveMembers(ctx.tenant.id);
  const mentionedUserIds = extractMentionedUserIds(parsed.data.body, members);

  await db.comment.update({
    where: { id: commentId },
    data: {
      body:     parsed.data.body,
      mentionedUserIds,
      editedAt: new Date(),
    },
  });

  // Edit notification policy: only fan out to users NEWLY added to the
  // mention list, so fixing a typo that rescued a mention still alerts
  // that user without re-pinging everyone from the original post.
  const oldSet = new Set(existing.mentionedUserIds);
  const newly = mentionedUserIds.filter((uid) => !oldSet.has(uid));
  if (newly.length > 0) {
    const kind = parentKindOfRow(existing);
    const parentId = parentIdOfRow(existing, kind);
    if (kind && parentId) {
      const authorName =
        members.find((m) => m.userId === ctx.userId)?.name ?? "A teammate";
      await notifyMany(
        newly,
        {
          tenantId:   ctx.tenant.id,
          type:       "comment.mention",
          title:      `${authorName} mentioned you on a ${parentLabel(kind)}`,
          body:       summarize(parsed.data.body),
          entityType: "Comment",
          entityId:   commentId,
          link:       parentDetailLink(slug, toParent(kind, parentId)),
        },
        { excludeUserId: ctx.userId },
      );
    }
  }

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "comment.updated",
    entityType: "Comment",
    entityId:   commentId,
  });

  const kind = parentKindOfRow(existing);
  const parentId = parentIdOfRow(existing, kind);
  if (kind && parentId) revalidateParent(slug, kind, parentId);
}

// ────────────────────────────────────────────────────────────
// Delete — author can delete own; `staff:manage` can delete any.
// Soft-delete (sets deletedAt + replaces body with a tombstone marker) so
// thread context survives the removal.
// ────────────────────────────────────────────────────────────

export async function deleteComment(slug: string, commentId: string) {
  const ctx = await requirePermission(slug, "customers:view");
  const existing = await db.comment.findFirst({
    where: { id: commentId, tenantId: ctx.tenant.id, deletedAt: null },
    select: {
      id: true, authorId: true,
      customerId: true, quoteId: true, orderId: true,
      proofId: true, installEventId: true, taskId: true,
    },
  });
  if (!existing) return;

  const isAuthor = existing.authorId === ctx.userId;
  const isMod    = ctx.can("staff:manage");
  if (!isAuthor && !isMod) {
    redirect(`/t/${slug}/dashboard?error=forbidden`);
  }

  await db.comment.update({
    where: { id: commentId },
    data: {
      deletedAt: new Date(),
      body:      "", // clear contents so nothing lingers in the DB blob
    },
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "comment.deleted",
    entityType: "Comment",
    entityId:   commentId,
    metadata:   { byAuthor: isAuthor },
  });

  const kind = parentKindOfRow(existing);
  const parentId = parentIdOfRow(existing, kind);
  if (kind && parentId) revalidateParent(slug, kind, parentId);
}

// ────────────────────────────────────────────────────────────
// Parent recovery from a stored comment row. Needed for revalidation after
// update/delete — the form only has a commentId so we look up which parent
// it points at by walking the nullable FKs.
// ────────────────────────────────────────────────────────────
type ParentCols = {
  customerId:     string | null;
  quoteId:        string | null;
  orderId:        string | null;
  proofId:        string | null;
  installEventId: string | null;
  taskId:         string | null;
};

function parentKindOfRow(row: ParentCols): CommentParentKind | null {
  if (row.customerId)     return "customer";
  if (row.quoteId)        return "quote";
  if (row.orderId)        return "order";
  if (row.proofId)        return "proof";
  if (row.installEventId) return "install";
  if (row.taskId)         return "task";
  return null;
}

function parentIdOfRow(row: ParentCols, kind: CommentParentKind | null): string | null {
  switch (kind) {
    case "customer": return row.customerId;
    case "quote":    return row.quoteId;
    case "order":    return row.orderId;
    case "proof":    return row.proofId;
    case "install":  return row.installEventId;
    case "task":     return row.taskId;
    default:         return null;
  }
}
