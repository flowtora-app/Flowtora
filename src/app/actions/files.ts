"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";

const optionalString = z.string().max(200).optional().or(z.literal(""));
const optionalLong = z.string().max(4000).optional().or(z.literal(""));
const empty = (s: string | undefined) => (s && s.length > 0 ? s : null);

// Real blob storage lands in Phase 14. For now, users paste a hosted URL —
// any public URL works (Dropbox share link, WeTransfer, Cloudinary, etc.).
const createSchema = z.object({
  filename:     z.string().min(1).max(255),
  storageUrl:   z.string().url().max(2000),
  thumbnailUrl: optionalString,
  mimeType:     optionalString,
  sizeBytes:    z.string().optional().or(z.literal("")),
  // Phase 11 — expanded FileKind taxonomy. Existing "ARTWORK" rows are
  // still readable but new uploads prefer the split values. Defaulting
  // to ATTACHMENT is intentional: if someone forgets to pick, catch-all
  // is less wrong than misclassifying.
  kind: z.enum([
    "ATTACHMENT", "REFERENCE", "ARTWORK", "PROOF", "INVOICE", "OTHER",
    "DESIGN_SOURCE", "PRODUCTION_READY", "MOCKUP",
  ]).default("ATTACHMENT"),
  notes:        optionalLong,
  // Phase 11 — optional iteration label ("this is v3 of the same art
  // piece"). Designers use this to track tweaks that don't warrant a
  // new customer-facing proof version.
  assetVersion: z.string().optional().or(z.literal("")),

  // Parent — exactly one should be set.
  customerId: optionalString,
  quoteId:    optionalString,
  orderId:    optionalString,
  proofId:    optionalString,
});

// Verifies the caller has access to the specified parent entity within this
// tenant. Returns a path tuple for redirects + revalidation.
async function resolveParent(
  tenantId: string,
  p: { customerId?: string | null; quoteId?: string | null; orderId?: string | null; proofId?: string | null },
): Promise<{ ok: true; parent: "customer" | "quote" | "order" | "proof"; id: string; redirectPath: string } | { ok: false; error: string }> {
  const set = [p.customerId, p.quoteId, p.orderId, p.proofId].filter(Boolean).length;
  if (set !== 1) return { ok: false, error: "Attach a file to exactly one entity." };

  if (p.customerId) {
    const c = await db.customer.findFirst({ where: { id: p.customerId, tenantId }, select: { id: true } });
    if (!c) return { ok: false, error: "Customer not found." };
    return { ok: true, parent: "customer", id: c.id, redirectPath: `/t/__slug__/customers/${c.id}` };
  }
  if (p.quoteId) {
    const q = await db.quote.findFirst({ where: { id: p.quoteId, tenantId }, select: { id: true } });
    if (!q) return { ok: false, error: "Quote not found." };
    return { ok: true, parent: "quote", id: q.id, redirectPath: `/t/__slug__/quotes/${q.id}` };
  }
  if (p.orderId) {
    const o = await db.order.findFirst({ where: { id: p.orderId, tenantId }, select: { id: true } });
    if (!o) return { ok: false, error: "Order not found." };
    return { ok: true, parent: "order", id: o.id, redirectPath: `/t/__slug__/orders/${o.id}` };
  }
  if (p.proofId) {
    const pr = await db.proof.findFirst({ where: { id: p.proofId, tenantId }, select: { id: true, orderId: true } });
    if (!pr) return { ok: false, error: "Proof not found." };
    return { ok: true, parent: "proof", id: pr.id, redirectPath: `/t/__slug__/orders/${pr.orderId}/proofs/${pr.id}` };
  }
  return { ok: false, error: "No parent." };
}

export async function createFile(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "files:upload");
  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    // Try to keep users near where they started.
    const backUrl = (formData.get("backUrl") as string | null) ?? `/t/${slug}/dashboard`;
    redirect(`${backUrl}?error=${encodeURIComponent("Invalid file input. Paste a valid URL.")}`);
  }
  const d = parsed.data;

  const resolved = await resolveParent(ctx.tenant.id, {
    customerId: empty(d.customerId),
    quoteId:    empty(d.quoteId),
    orderId:    empty(d.orderId),
    proofId:    empty(d.proofId),
  });
  if (!resolved.ok) {
    const backUrl = (formData.get("backUrl") as string | null) ?? `/t/${slug}/dashboard`;
    redirect(`${backUrl}?error=${encodeURIComponent(resolved.error)}`);
  }

  const sizeBytes = (() => {
    if (!d.sizeBytes || d.sizeBytes.length === 0) return null;
    const n = Number(d.sizeBytes);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  })();

  const assetVersion = (() => {
    if (!d.assetVersion || d.assetVersion.length === 0) return null;
    const n = Number(d.assetVersion);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  })();

  const data: Prisma.FileUncheckedCreateInput = {
    tenantId:     ctx.tenant.id,
    uploaderId:   ctx.userId,
    filename:     d.filename,
    storageUrl:   d.storageUrl,
    thumbnailUrl: empty(d.thumbnailUrl),
    mimeType:     empty(d.mimeType),
    sizeBytes,
    kind:         d.kind,
    notes:        empty(d.notes),
    assetVersion,
    customerId:   resolved.parent === "customer" ? resolved.id : null,
    quoteId:      resolved.parent === "quote" ? resolved.id : null,
    orderId:      resolved.parent === "order" ? resolved.id : null,
    proofId:      resolved.parent === "proof" ? resolved.id : null,
  };

  const file = await db.file.create({ data });

  // Phase 11 — if the file is attached to a proof, also drop a REVISED
  // entry on the proof decision ledger so the designer's timeline shows
  // "files were added" alongside status changes. Keeps the art history
  // legible without having to cross-reference the files table.
  if (resolved.parent === "proof") {
    const proof = await db.proof.findFirst({
      where:  { id: resolved.id, tenantId: ctx.tenant.id },
      select: { revisionRound: true },
    });
    if (proof) {
      await db.proofDecision.create({
        data: {
          tenantId:        ctx.tenant.id,
          proofId:         resolved.id,
          round:           proof.revisionRound,
          decision:        "REVISED",
          decidedByUserId: ctx.userId,
          notes:           `+ ${d.filename}`,
          metadata:        { fileId: file.id, kind: d.kind },
        },
      });
    }
  }

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "file.created",
    entityType: "File",
    entityId:   file.id,
    metadata:   { kind: d.kind, parent: resolved.parent, parentId: resolved.id },
  });

  revalidatePath(resolved.redirectPath.replace("__slug__", slug));
}

// ────────────────────────────────────────────────────────────
// Archive / restore — Phase 11
//
// We soft-archive rather than delete in most cases because proof files have
// legal value ("what did we actually show the customer on v1?"). Archived
// files still render in the revision history but drop out of the active
// FilesCard list. Hard delete is available via deleteFile for cases where
// the file was uploaded in error (wrong customer, wrong URL pasted, etc.).
//
// Both actions refuse to touch files attached to a locked proof — once a
// customer has approved, the artwork record must stay frozen.
// ────────────────────────────────────────────────────────────

async function loadFileForMutation(tenantId: string, fileId: string) {
  return db.file.findFirst({
    where: { id: fileId, tenantId },
    select: {
      id: true,
      filename: true,
      kind: true,
      archivedAt: true,
      customerId: true,
      quoteId: true,
      orderId: true,
      proofId: true,
      proof: { select: { id: true, orderId: true, lockedAt: true, revisionRound: true } },
    },
  });
}

function fileRevalidationPaths(slug: string, f: {
  customerId: string | null;
  quoteId: string | null;
  orderId: string | null;
  proofId: string | null;
  proof: { orderId: string } | null;
}): string[] {
  const paths: string[] = [];
  if (f.customerId) paths.push(`/t/${slug}/customers/${f.customerId}`);
  if (f.quoteId)    paths.push(`/t/${slug}/quotes/${f.quoteId}`);
  if (f.orderId)    paths.push(`/t/${slug}/orders/${f.orderId}`);
  if (f.proof && f.proofId) paths.push(`/t/${slug}/orders/${f.proof.orderId}/proofs/${f.proofId}`);
  return paths;
}

export async function archiveFile(slug: string, fileId: string) {
  const ctx = await requirePermission(slug, "files:upload");
  const file = await loadFileForMutation(ctx.tenant.id, fileId);
  if (!file || file.archivedAt) return;

  // Locked proofs are frozen — the customer approved this exact artwork set.
  if (file.proof?.lockedAt) return;

  await db.file.update({
    where: { id: file.id },
    data:  { archivedAt: new Date(), archivedBy: ctx.userId },
  });

  if (file.proofId && file.proof) {
    await db.proofDecision.create({
      data: {
        tenantId:        ctx.tenant.id,
        proofId:         file.proofId,
        round:           file.proof.revisionRound,
        decision:        "REVISED",
        decidedByUserId: ctx.userId,
        notes:           `− ${file.filename} (archived)`,
        metadata:        { fileId: file.id, kind: file.kind, op: "archive" },
      },
    });
  }

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "file.archived",
    entityType: "File",
    entityId:   file.id,
    metadata:   { filename: file.filename },
  });

  for (const p of fileRevalidationPaths(slug, file)) revalidatePath(p);
}

export async function restoreFile(slug: string, fileId: string) {
  const ctx = await requirePermission(slug, "files:upload");
  const file = await loadFileForMutation(ctx.tenant.id, fileId);
  if (!file || !file.archivedAt) return;

  if (file.proof?.lockedAt) return;

  await db.file.update({
    where: { id: file.id },
    data:  { archivedAt: null, archivedBy: null },
  });

  if (file.proofId && file.proof) {
    await db.proofDecision.create({
      data: {
        tenantId:        ctx.tenant.id,
        proofId:         file.proofId,
        round:           file.proof.revisionRound,
        decision:        "REVISED",
        decidedByUserId: ctx.userId,
        notes:           `+ ${file.filename} (restored)`,
        metadata:        { fileId: file.id, kind: file.kind, op: "restore" },
      },
    });
  }

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "file.restored",
    entityType: "File",
    entityId:   file.id,
    metadata:   { filename: file.filename },
  });

  for (const p of fileRevalidationPaths(slug, file)) revalidatePath(p);
}

// ────────────────────────────────────────────────────────────
// Delete
// ────────────────────────────────────────────────────────────

export async function deleteFile(slug: string, fileId: string) {
  const ctx = await requirePermission(slug, "files:upload");
  const file = await db.file.findFirst({
    where: { id: fileId, tenantId: ctx.tenant.id },
    select: {
      id: true,
      filename: true,
      customerId: true,
      quoteId: true,
      orderId: true,
      proofId: true,
      proof: { select: { orderId: true, lockedAt: true } },
    },
  });
  if (!file) return;

  // Phase 11 — a locked proof's artwork is frozen. Archive is the correct
  // affordance for "we don't want to see this in the list"; hard delete is
  // not permitted once a customer has signed off on this exact file set.
  if (file.proof?.lockedAt) return;

  await db.file.delete({ where: { id: file.id } });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "file.deleted",
    entityType: "File",
    entityId:   file.id,
  });

  // Revalidate wherever it was shown.
  if (file.customerId) revalidatePath(`/t/${slug}/customers/${file.customerId}`);
  if (file.quoteId)    revalidatePath(`/t/${slug}/quotes/${file.quoteId}`);
  if (file.orderId)    revalidatePath(`/t/${slug}/orders/${file.orderId}`);
  if (file.proof)      revalidatePath(`/t/${slug}/orders/${file.proof.orderId}/proofs/${file.proofId}`);
}
