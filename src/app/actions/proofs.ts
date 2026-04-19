"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { ProofDecisionKind } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { notifyMany } from "@/lib/notifications";
import { PROOF_TRANSITIONS } from "@/lib/proofs";
// Phase 15 Slice E — customer-facing "proof ready" email.
import { sendCustomerEmail, proofReadyEmail } from "@/lib/customer-emails";
import { appOrigin } from "@/lib/share";
import { formatDate } from "@/lib/format";

const optionalString = z.string().max(200).optional().or(z.literal(""));
const optionalLong = z.string().max(4000).optional().or(z.literal(""));
const empty = (s: string | undefined) => (s && s.length > 0 ? s : null);

async function assertProof(tenantId: string, proofId: string) {
  return db.proof.findFirst({
    where: { id: proofId, tenantId },
    select: {
      id: true, status: true, orderId: true, version: true,
      revisionRound: true, lockedAt: true, createdBy: true,
    },
  });
}

// ────────────────────────────────────────────────────────────
// Phase 11 — Decision ledger helper
// ────────────────────────────────────────────────────────────
//
// Every meaningful proof state change gets a ProofDecision row. This is
// the source of truth for the "proof timeline" card the designer sees and
// the audit trail we'd show to a customer in a dispute. Keep this helper
// tiny and predictable — callers are expected to have already validated
// the state change.
async function recordDecision(args: {
  tx?:                Prisma.TransactionClient;
  tenantId:           string;
  proofId:            string;
  round:              number;
  decision:           ProofDecisionKind;
  decidedByUserId?:   string | null;
  decidedByCustomerId?: string | null;
  notes?:             string | null;
  metadata?:          Prisma.InputJsonValue;
}) {
  const client = args.tx ?? db;
  await client.proofDecision.create({
    data: {
      tenantId:           args.tenantId,
      proofId:            args.proofId,
      round:              args.round,
      decision:           args.decision,
      decidedByUserId:    args.decidedByUserId     ?? null,
      decidedByCustomerId: args.decidedByCustomerId ?? null,
      notes:              args.notes               ?? null,
      metadata:           args.metadata            ?? Prisma.JsonNull,
    },
  });
}

// Re-export as a server helper for portal-public.ts to call when a customer
// acts via portal/share link. Exported from here so there's exactly one
// place that writes to the ledger.
export async function recordProofDecisionFromPortal(args: {
  tenantId:           string;
  proofId:            string;
  round:              number;
  decision:           ProofDecisionKind;
  decidedByCustomerId?: string | null;
  notes?:             string | null;
  metadata?:          Prisma.InputJsonValue;
}) {
  await recordDecision(args);
}

// ────────────────────────────────────────────────────────────
// Create — starts a new version for the given order.
// If a prior version exists, the new one's version = max + 1.
// ────────────────────────────────────────────────────────────

const createSchema = z.object({
  orderId:     z.string().min(1),
  title:       optionalString,
  description: optionalLong,
});

export async function createProof(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "proofs:manage");
  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/orders?error=${encodeURIComponent("Invalid proof input.")}`);
  }
  const d = parsed.data;

  const order = await db.order.findFirst({
    where: { id: d.orderId, tenantId: ctx.tenant.id },
    select: { id: true },
  });
  if (!order) redirect(`/t/${slug}/orders?error=${encodeURIComponent("Order not found.")}`);

  const proof = await db.$transaction(async (tx) => {
    const prev = await tx.proof.findFirst({
      where: { orderId: order.id },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = (prev?.version ?? 0) + 1;
    const created = await tx.proof.create({
      data: {
        tenantId: ctx.tenant.id,
        orderId: order.id,
        version,
        title: empty(d.title),
        description: empty(d.description),
        status: "DRAFT",
        createdBy: ctx.userId,
      },
    });
    await recordDecision({
      tx,
      tenantId:        ctx.tenant.id,
      proofId:         created.id,
      round:           1,
      decision:        "CREATED",
      decidedByUserId: ctx.userId,
    });
    return created;
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "proof.created",
    entityType: "Proof",
    entityId:   proof.id,
    metadata:   { orderId: order.id, version: proof.version },
  });

  revalidatePath(`/t/${slug}/orders/${order.id}`);
  redirect(`/t/${slug}/orders/${order.id}/proofs/${proof.id}`);
}

// ────────────────────────────────────────────────────────────
// Phase 11 — Start revision (CHANGES_REQUESTED → new version v+1)
// ────────────────────────────────────────────────────────────
//
// This is the happy-path "customer asked for changes → make a new version"
// action. Cleaner than telling the user "go click New proof and remember
// which one this came from": we clone title/description, link the chain,
// stamp the predecessor as superseded.

export async function startProofRevision(slug: string, proofId: string) {
  const ctx = await requirePermission(slug, "proofs:manage");
  const source = await db.proof.findFirst({
    where:  { id: proofId, tenantId: ctx.tenant.id },
    select: {
      id: true, orderId: true, status: true, version: true,
      title: true, description: true, internalNotes: true,
      watermarkEnabled: true, supersededAt: true,
    },
  });
  if (!source) return;

  // We allow revision-starting from any non-approved status — the sales rep
  // might want to proactively build v2 before the customer even responds.
  // We DO block when approved + locked, because that's the whole point of
  // locking.
  if (source.status === "APPROVED") {
    redirect(`/t/${slug}/orders/${source.orderId}/proofs/${proofId}?error=${encodeURIComponent("Approved proofs are locked — nothing to revise.")}`);
  }

  const newProof = await db.$transaction(async (tx) => {
    const maxVersion = await tx.proof.aggregate({
      where: { orderId: source.orderId },
      _max:  { version: true },
    });
    const version = (maxVersion._max.version ?? source.version) + 1;

    const created = await tx.proof.create({
      data: {
        tenantId:          ctx.tenant.id,
        orderId:           source.orderId,
        version,
        title:             source.title,
        description:       source.description,
        internalNotes:     source.internalNotes,
        watermarkEnabled:  source.watermarkEnabled,
        status:            "DRAFT",
        revisionRound:     1,
        createdBy:         ctx.userId,
      },
    });

    // Stamp the predecessor as superseded so the UI can dim it in lists
    // and the portal can redirect customers to the newest live version.
    if (!source.supersededAt) {
      await tx.proof.update({
        where: { id: source.id },
        data: {
          supersededAt:       new Date(),
          supersededByProofId: created.id,
        },
      });
      await recordDecision({
        tx,
        tenantId:        ctx.tenant.id,
        proofId:         source.id,
        round:           1, // source's round — we don't know it here; safe default
        decision:        "SUPERSEDED",
        decidedByUserId: ctx.userId,
        metadata:        { supersededByProofId: created.id, newVersion: version },
      });
    }

    await recordDecision({
      tx,
      tenantId:        ctx.tenant.id,
      proofId:         created.id,
      round:           1,
      decision:        "CREATED",
      decidedByUserId: ctx.userId,
      metadata:        { fromProofId: source.id, fromVersion: source.version },
    });

    return created;
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "proof.revision_started",
    entityType: "Proof",
    entityId:   newProof.id,
    metadata:   { orderId: source.orderId, fromProofId: source.id, newVersion: newProof.version },
  });

  revalidatePath(`/t/${slug}/orders/${source.orderId}`);
  redirect(`/t/${slug}/orders/${source.orderId}/proofs/${newProof.id}`);
}

// ────────────────────────────────────────────────────────────
// Meta: title + description (while editable)
// ────────────────────────────────────────────────────────────

const metaSchema = z.object({
  title:       optionalString,
  description: optionalLong,
});

export async function updateProofMeta(slug: string, proofId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "proofs:manage");
  const proof = await assertProof(ctx.tenant.id, proofId);
  if (!proof) return;
  if (proof.lockedAt) {
    redirect(`/t/${slug}/orders/${proof.orderId}/proofs/${proofId}?error=${encodeURIComponent("Proof is locked — meta can't be edited.")}`);
  }
  if (proof.status !== "DRAFT" && proof.status !== "CHANGES_REQUESTED") {
    redirect(`/t/${slug}/orders/${proof.orderId}/proofs/${proofId}?error=${encodeURIComponent("Proof isn't editable right now.")}`);
  }

  const parsed = metaSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  await db.proof.update({
    where: { id: proofId },
    data: {
      title: empty(parsed.data.title),
      description: empty(parsed.data.description),
    },
  });
  revalidatePath(`/t/${slug}/orders/${proof.orderId}/proofs/${proofId}`);
}

// ────────────────────────────────────────────────────────────
// Phase 11 — Designer settings (internal notes, due date, watermark)
// ────────────────────────────────────────────────────────────
//
// Separate from meta because these are designer-facing controls — they
// survive between DRAFT and SENT (you might set a due date after sending,
// or tighten watermarking on a repeat offender customer).

const settingsSchema = z.object({
  internalNotes:    optionalLong,
  dueAt:            optionalString, // YYYY-MM-DD
  watermarkEnabled: z.string().optional(), // checkbox → "on" | undefined
});

export async function updateProofSettings(slug: string, proofId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "proofs:manage");
  const proof = await assertProof(ctx.tenant.id, proofId);
  if (!proof) return;
  if (proof.lockedAt) {
    redirect(`/t/${slug}/orders/${proof.orderId}/proofs/${proofId}?error=${encodeURIComponent("Proof is locked.")}`);
  }

  const parsed = settingsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const d = parsed.data;

  await db.proof.update({
    where: { id: proofId },
    data: {
      internalNotes:    empty(d.internalNotes),
      dueAt:            d.dueAt ? new Date(d.dueAt) : null,
      watermarkEnabled: d.watermarkEnabled === "on",
    },
  });
  revalidatePath(`/t/${slug}/orders/${proof.orderId}/proofs/${proofId}`);
}

// ────────────────────────────────────────────────────────────
// Status transitions (Phase 11 — with locking + round bump + ledger)
// ────────────────────────────────────────────────────────────

const statusSchema = z.object({
  status: z.enum(["DRAFT", "SENT", "APPROVED", "CHANGES_REQUESTED", "REJECTED"]),
  customerResponse: optionalLong,
});

export async function changeProofStatus(slug: string, proofId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "proofs:manage");
  const proof = await assertProof(ctx.tenant.id, proofId);
  if (!proof) return;

  if (proof.lockedAt) {
    redirect(`/t/${slug}/orders/${proof.orderId}/proofs/${proofId}?error=${encodeURIComponent("Proof is locked — no further transitions.")}`);
  }

  const parsed = statusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const next = parsed.data.status;

  if (!PROOF_TRANSITIONS[proof.status].includes(next)) {
    redirect(`/t/${slug}/orders/${proof.orderId}/proofs/${proofId}?error=${encodeURIComponent(`Can't move from ${proof.status} to ${next}.`)}`);
  }

  const now = new Date();
  const patch: Prisma.ProofUpdateInput = { status: next };
  let newRound = proof.revisionRound;

  if (next === "SENT") {
    patch.sentAt = now;
    patch.respondedAt = null;
    patch.customerResponse = null;
    // Round-bump: going from CHANGES_REQUESTED → SENT means we took the
    // feedback and re-shipped the same proof version. Each bounce = +1.
    if (proof.status === "CHANGES_REQUESTED") {
      newRound = proof.revisionRound + 1;
      patch.revisionRound = newRound;
    }
  }
  if (next === "APPROVED" || next === "CHANGES_REQUESTED" || next === "REJECTED") {
    patch.respondedAt = now;
    patch.customerResponse = empty(parsed.data.customerResponse);
  }
  // APPROVED is a one-way door: we lock immediately so downstream edits
  // are impossible. LOCKED decision gets its own ledger row so the timeline
  // tells the full story.
  if (next === "APPROVED") {
    patch.lockedAt = now;
    patch.lockedBy = ctx.userId;
  }
  if (next === "DRAFT") {
    patch.sentAt = null;
    patch.respondedAt = null;
    patch.customerResponse = null;
  }

  await db.$transaction(async (tx) => {
    await tx.proof.update({ where: { id: proofId }, data: patch });

    // Map the transition to a decision kind. SENT is its own kind;
    // APPROVED logs both APPROVED and LOCKED so the timeline shows both
    // events as distinct rows.
    const kindMap: Record<string, ProofDecisionKind> = {
      DRAFT:             "REOPENED",
      SENT:              "SENT",
      APPROVED:          "APPROVED",
      CHANGES_REQUESTED: "CHANGES_REQUESTED",
      REJECTED:          "REJECTED",
    };
    await recordDecision({
      tx,
      tenantId:         ctx.tenant.id,
      proofId,
      round:            newRound,
      decision:         kindMap[next],
      decidedByUserId:  ctx.userId,
      notes:            empty(parsed.data.customerResponse),
      metadata:         { previousStatus: proof.status, via: "staff" },
    });
    if (next === "APPROVED") {
      await recordDecision({
        tx,
        tenantId:        ctx.tenant.id,
        proofId,
        round:           newRound,
        decision:        "LOCKED",
        decidedByUserId: ctx.userId,
      });
    }
  });

  // Phase 14 — customer timeline entry when a proof is sent.
  if (next === "SENT") {
    const ctxProof = await db.proof.findUnique({
      where: { id: proofId },
      select: {
        version: true, title: true, dueAt: true,
        order: {
          select: {
            id: true, number: true, customerId: true,
            productionManagerId: true, installerId: true,
            customer: { select: { email: true, name: true } },
          },
        },
      },
    });
    if (ctxProof?.order.customer.email) {
      // Phase 15 Slice E — branded customer email. Find a live portal token
      // so we can deep-link the customer straight to the proof they need
      // to act on; fall back to no URL when the customer has never been
      // issued a portal token (staff can add one from the customer page).
      const portal = await db.portalToken.findFirst({
        where: {
          tenantId: ctx.tenant.id,
          customerId: ctxProof.order.customerId,
          revokedAt: null,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
        select: { token: true },
        orderBy: { createdAt: "desc" },
      });
      const url = portal
        ? `${appOrigin()}/portal/${portal.token}/proofs/${proofId}`
        : null;
      await sendCustomerEmail({
        tenantId:     ctx.tenant.id,
        customerId:   ctxProof.order.customerId,
        senderUserId: ctx.userId,
        kind:         "PROOF_SENT",
        to:           ctxProof.order.customer.email,
        relatedEntityType: "Proof",
        relatedEntityId:   proofId,
        rendered: proofReadyEmail({
          shopName:     ctx.tenant.name,
          shopPhone:    ctx.tenant.phone,
          shopWebsite:  ctx.tenant.website,
          customerName: ctxProof.order.customer.name,
          proofTitle:   ctxProof.title ?? `Proof v${ctxProof.version}`,
          orderNumber:  ctxProof.order.number,
          url,
          dueAt:        ctxProof.dueAt ? formatDate(ctxProof.dueAt) : null,
        }),
      });
    }
    // Phase 11 — notify watchers (creator + PM + installer) so the whole
    // team sees the hand-off on their feed, not just whoever ran the send.
    if (ctxProof) {
      await notifyMany(
        [proof.createdBy, ctxProof.order.productionManagerId, ctxProof.order.installerId],
        {
          tenantId:   ctx.tenant.id,
          type:       "proof.sent",
          title:      `Proof v${ctxProof.version} sent on ${ctxProof.order.number}`,
          entityType: "Proof",
          entityId:   proofId,
          link:       `/t/${slug}/orders/${ctxProof.order.id}/proofs/${proofId}`,
        },
        { excludeUserId: ctx.userId },
      );
    }
  }

  // Phase 11 — notify watchers on lock so production knows it's safe to go.
  if (next === "APPROVED") {
    const ctxProof = await db.proof.findUnique({
      where:  { id: proofId },
      select: {
        version: true,
        order: { select: {
          id: true, number: true,
          productionManagerId: true, installerId: true,
        } },
      },
    });
    if (ctxProof) {
      await notifyMany(
        [proof.createdBy, ctxProof.order.productionManagerId, ctxProof.order.installerId],
        {
          tenantId:   ctx.tenant.id,
          type:       "proof.locked",
          title:      `Proof v${ctxProof.version} approved + locked on ${ctxProof.order.number}`,
          entityType: "Proof",
          entityId:   proofId,
          link:       `/t/${slug}/orders/${ctxProof.order.id}/proofs/${proofId}`,
        },
        { excludeUserId: ctx.userId },
      );
    }
  }

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "proof.status_changed",
    entityType: "Proof",
    entityId:   proofId,
    metadata:   { from: proof.status, to: next, round: newRound },
  });

  revalidatePath(`/t/${slug}/orders/${proof.orderId}/proofs/${proofId}`);
  revalidatePath(`/t/${slug}/orders/${proof.orderId}`);
}

// ────────────────────────────────────────────────────────────
// Delete (draft only)
// ────────────────────────────────────────────────────────────

export async function deleteProof(slug: string, proofId: string) {
  const ctx = await requirePermission(slug, "proofs:manage");
  const proof = await assertProof(ctx.tenant.id, proofId);
  if (!proof) return;
  if (proof.lockedAt) {
    redirect(`/t/${slug}/orders/${proof.orderId}/proofs/${proofId}?error=${encodeURIComponent("Proof is locked.")}`);
  }
  if (proof.status !== "DRAFT") {
    redirect(`/t/${slug}/orders/${proof.orderId}/proofs/${proofId}?error=${encodeURIComponent("Only draft proofs can be deleted.")}`);
  }
  const orderId = proof.orderId;
  await db.proof.delete({ where: { id: proofId } });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "proof.deleted",
    entityType: "Proof",
    entityId:   proofId,
  });

  revalidatePath(`/t/${slug}/orders/${orderId}`);
  redirect(`/t/${slug}/orders/${orderId}`);
}
