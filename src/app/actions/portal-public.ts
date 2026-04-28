"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { resolvePortalToken, portalPath } from "@/lib/portal";
import { logAudit } from "@/lib/audit";
import { createOrderFromQuoteInTx } from "@/app/actions/orders";
import { notifyMany } from "@/lib/notifications";
import { computeQuoteTotals } from "@/lib/quotes";
import {
  isStorageConfigured,
  publicUrlFor,
  putFile,
  StorageError,
} from "@/lib/storage";
import { checkStorageQuota } from "@/lib/storage-quota";

// Filter out synthetic user ids like "portal:<tokenId>" — those aren't real
// staff users and will never log in to receive notifications.
const realUser = (id: string | null | undefined): string | null =>
  id && !id.startsWith("portal:") ? id : null;

// These actions are invoked by unauthenticated customers via a portal token.
// Every entrypoint MUST:
//   1. Resolve + validate the token (rejects revoked/expired)
//   2. Look up the target entity scoped to (tenantId, customerId) from the token
//   3. Enforce workflow state (e.g. can't approve an APPROVED quote again)
//   4. Audit with { portalTokenId, customerId } — userId stays null because
//      this isn't a staff action.

const optionalLong = z.string().max(4000).optional().or(z.literal(""));
const empty = (s: string | undefined) => (s && s.length > 0 ? s : null);

// ────────────────────────────────────────────────────────────
// Quote: approve / decline
// ────────────────────────────────────────────────────────────

const quoteRespondSchema = z.object({
  decision: z.enum(["APPROVE", "DECLINE"]),
  note:     optionalLong,
});

// Extracts all "acceptOptional" multi-values from a FormData payload.
// The client component emits one `<input type="hidden" name="acceptOptional" …>`
// per optional item the customer opted into, so multiple values for the same
// key are expected.
function parseAcceptedOptional(formData: FormData): string[] {
  const raw = formData.getAll("acceptOptional");
  return raw
    .map((v) => (typeof v === "string" ? v : ""))
    .filter((s) => s.length > 0 && s.length < 120);
}

// Phase 9 — flips the specified optional line items to required, then
// recomputes totals. Used by BOTH the portal approve flow and the public
// share approve flow before stamping the quote APPROVED.
async function acceptOptionalItemsInTx(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  quoteId: string,
  acceptedIds: string[],
) {
  if (acceptedIds.length > 0) {
    await tx.quoteItem.updateMany({
      where: { id: { in: acceptedIds }, quoteId, isOptional: true },
      data:  { isOptional: false },
    });
  }
  // Recompute totals inside the transaction so the APPROVED row reflects
  // the final accepted bundle, not the pre-approval snapshot.
  const q = await tx.quote.findUnique({
    where:   { id: quoteId },
    include: { items: true },
  });
  if (!q) return;
  const totals = computeQuoteTotals(
    q.items.map((it) => ({
      subtotal: it.subtotal,
      taxable: it.taxable,
      isOptional: it.isOptional,
    })),
    {
      discountType:  q.discountType,
      discountValue: Number(q.discountValue),
      taxRate:       Number(q.taxRate),
      depositType:   q.depositType,
      depositValue:  Number(q.depositValue),
    },
  );
  await tx.quote.update({
    where: { id: quoteId },
    data: {
      subtotal:         totals.subtotal as never,
      discountAmount:   totals.discountAmount as never,
      taxAmount:        totals.taxAmount as never,
      total:            totals.total as never,
      optionalSubtotal: totals.optionalSubtotal as never,
      depositAmount:    totals.depositAmount as never,
    },
  });
}

export async function respondToQuotePortal(token: string, quoteId: string, formData: FormData) {
  const ctx = await resolvePortalToken(token);
  if (!ctx) redirect(`/portal/expired`);

  const parsed = quoteRespondSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${portalPath(token, `quotes/${quoteId}`)}?error=${encodeURIComponent("Invalid response.")}`);
  }
  const { decision, note } = parsed.data;
  const acceptedOptionalIds = parseAcceptedOptional(formData);

  const quote = await db.quote.findFirst({
    where: { id: quoteId, tenantId: ctx.tenant.id, customerId: ctx.customer.id },
    select: {
      id: true, number: true, status: true,
      customerId: true, customerNote: true,
      salesRepId: true, createdBy: true,
    },
  });
  if (!quote) redirect(`${portalPath(token)}?error=${encodeURIComponent("Quote not found.")}`);

  // The customer can only act on quotes that are visible to them.
  // SENT and VIEWED are the decision-time states; DRAFT is internal,
  // APPROVED/DECLINED/EXPIRED are terminal or already decided.
  const decidable = quote.status === "SENT" || quote.status === "VIEWED";
  if (!decidable) {
    redirect(`${portalPath(token, `quotes/${quoteId}`)}?error=${encodeURIComponent("This quote can't be changed.")}`);
  }

  const now = new Date();
  // Append the customer's note to the existing customerNote field with a
  // timestamp prefix, so staff see the full decision trail.
  const stamp = now.toISOString().slice(0, 16).replace("T", " ");
  const notePrefix = decision === "APPROVE" ? "Customer approved" : "Customer declined";
  const acceptedNote = decision === "APPROVE" && acceptedOptionalIds.length > 0
    ? ` (accepted ${acceptedOptionalIds.length} optional ${acceptedOptionalIds.length === 1 ? "item" : "items"})`
    : "";
  const newLine = empty(note)
    ? `[${stamp}] ${notePrefix}${acceptedNote}: ${note}`
    : `[${stamp}] ${notePrefix}${acceptedNote}.`;
  const mergedNote = quote.customerNote ? `${quote.customerNote}\n${newLine}` : newLine;

  if (decision === "APPROVE") {
    await db.$transaction(async (tx) => {
      // Accept optional add-ons + recompute totals first, so the order we
      // create next inherits the final committed line set.
      await acceptOptionalItemsInTx(tx, quoteId, acceptedOptionalIds);
      await tx.quote.update({
        where: { id: quoteId },
        data: {
          status:       "APPROVED",
          approvedAt:   now,
          customerNote: mergedNote,
        },
      });
      await tx.customer.update({
        where: { id: quote.customerId },
        data: { stage: "WON" },
      });
      await createOrderFromQuoteInTx(tx, {
        tenantId: ctx.tenant.id,
        quoteId,
        // No staff userId — record the customer's portal token as the creator.
        // Using the token id keeps it traceable and distinct from a real user.
        createdByUserId: `portal:${ctx.token.id}`,
      });
    });
  } else {
    await db.quote.update({
      where: { id: quoteId },
      data: {
        status:       "DECLINED",
        declinedAt:   now,
        customerNote: mergedNote,
      },
    });
  }

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     null,
    action:     decision === "APPROVE" ? "portal.quote_approved" : "portal.quote_declined",
    entityType: "Quote",
    entityId:   quoteId,
    metadata:   {
      portalTokenId: ctx.token.id,
      customerId:    ctx.customer.id,
      acceptedOptionalIds,
    },
  });

  // Notify the sales rep (preferred) and the quote creator. No actor to
  // exclude — the "actor" is a customer, not a staff member.
  await notifyMany(
    [realUser(quote.salesRepId), realUser(quote.createdBy)],
    {
      tenantId:   ctx.tenant.id,
      type:       decision === "APPROVE" ? "portal.quote_approved" : "portal.quote_declined",
      title:      decision === "APPROVE"
        ? `${ctx.customer.name} approved quote ${quote.number}`
        : `${ctx.customer.name} declined quote ${quote.number}`,
      body:       empty(note),
      entityType: "Quote",
      entityId:   quoteId,
      link:       `/t/${ctx.tenant.slug}/quotes/${quoteId}`,
    },
  );

  // Staff views — invalidate the internal pages so they see the change.
  revalidatePath(`/t/${ctx.tenant.slug}/quotes/${quoteId}`);
  revalidatePath(`/t/${ctx.tenant.slug}/quotes`);
  redirect(portalPath(token, `quotes/${quoteId}`));
}

// ────────────────────────────────────────────────────────────
// Phase 9 — Public share link response
// ────────────────────────────────────────────────────────────
//
// Unlike the portal flow above, the public share link does NOT go through
// the portal token / customer authentication layer. The `shareToken` on
// the Quote itself is the proof of authorization — anyone with the URL
// can respond (customers share these with approvers internally, so we
// don't want to gate too aggressively). Audit records log "public share"
// as the actor.

export async function respondToQuoteShare(shareToken: string, formData: FormData) {
  if (!shareToken || shareToken.length < 8) {
    redirect(`/q/invalid`);
  }

  const parsed = quoteRespondSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/q/${shareToken}?error=${encodeURIComponent("Invalid response.")}`);
  }
  const { decision, note } = parsed.data;
  const acceptedOptionalIds = parseAcceptedOptional(formData);

  const quote = await db.quote.findUnique({
    where: { shareToken },
    select: {
      id: true, number: true, status: true,
      tenantId: true, customerId: true, customerNote: true,
      salesRepId: true, createdBy: true,
      tenant: { select: { slug: true } },
      customer: { select: { name: true } },
    },
  });
  if (!quote) redirect(`/q/invalid`);

  const decidable = quote.status === "SENT" || quote.status === "VIEWED";
  if (!decidable) {
    redirect(`/q/${shareToken}?error=${encodeURIComponent("This quote can't be changed.")}`);
  }

  const now = new Date();
  const stamp = now.toISOString().slice(0, 16).replace("T", " ");
  const notePrefix = decision === "APPROVE" ? "Approved via share link" : "Declined via share link";
  const acceptedNote = decision === "APPROVE" && acceptedOptionalIds.length > 0
    ? ` (accepted ${acceptedOptionalIds.length} optional ${acceptedOptionalIds.length === 1 ? "item" : "items"})`
    : "";
  const newLine = empty(note)
    ? `[${stamp}] ${notePrefix}${acceptedNote}: ${note}`
    : `[${stamp}] ${notePrefix}${acceptedNote}.`;
  const mergedNote = quote.customerNote ? `${quote.customerNote}\n${newLine}` : newLine;

  if (decision === "APPROVE") {
    await db.$transaction(async (tx) => {
      await acceptOptionalItemsInTx(tx, quote.id, acceptedOptionalIds);
      await tx.quote.update({
        where: { id: quote.id },
        data: {
          status:       "APPROVED",
          approvedAt:   now,
          customerNote: mergedNote,
        },
      });
      await tx.customer.update({
        where: { id: quote.customerId },
        data: { stage: "WON" },
      });
      await createOrderFromQuoteInTx(tx, {
        tenantId:        quote.tenantId,
        quoteId:         quote.id,
        createdByUserId: `share:${shareToken.slice(0, 8)}`,
      });
    });
  } else {
    await db.quote.update({
      where: { id: quote.id },
      data: {
        status:       "DECLINED",
        declinedAt:   now,
        customerNote: mergedNote,
      },
    });
  }

  await logAudit({
    tenantId:   quote.tenantId,
    userId:     null,
    action:     decision === "APPROVE" ? "share.quote_approved" : "share.quote_declined",
    entityType: "Quote",
    entityId:   quote.id,
    metadata:   {
      via:                "share-link",
      customerId:         quote.customerId,
      acceptedOptionalIds,
    },
  });

  await notifyMany(
    [realUser(quote.salesRepId), realUser(quote.createdBy)],
    {
      tenantId:   quote.tenantId,
      type:       decision === "APPROVE" ? "share.quote_approved" : "share.quote_declined",
      title:      decision === "APPROVE"
        ? `${quote.customer.name} approved quote ${quote.number} via share link`
        : `${quote.customer.name} declined quote ${quote.number} via share link`,
      body:       empty(note),
      entityType: "Quote",
      entityId:   quote.id,
      link:       `/t/${quote.tenant.slug}/quotes/${quote.id}`,
    },
  );

  revalidatePath(`/t/${quote.tenant.slug}/quotes/${quote.id}`);
  revalidatePath(`/t/${quote.tenant.slug}/quotes`);
  redirect(`/q/${shareToken}?done=1`);
}

// ────────────────────────────────────────────────────────────
// Proof: approve / request changes (customer response)
// ────────────────────────────────────────────────────────────

const proofRespondSchema = z.object({
  decision: z.enum(["APPROVE", "CHANGES"]),
  note:     optionalLong,
});

export async function respondToProofPortal(token: string, proofId: string, formData: FormData) {
  const ctx = await resolvePortalToken(token);
  if (!ctx) redirect(`/portal/expired`);

  const parsed = proofRespondSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${portalPath(token, `proofs/${proofId}`)}?error=${encodeURIComponent("Invalid response.")}`);
  }
  const { decision, note } = parsed.data;

  // Proofs belong to orders; scope by the order's customerId.
  const proof = await db.proof.findFirst({
    where: {
      id:       proofId,
      tenantId: ctx.tenant.id,
      order:    { customerId: ctx.customer.id },
    },
    select: {
      id: true,
      status: true,
      orderId: true,
      version: true,
      revisionRound: true,
      createdBy: true,
      customerResponse: true,
      lockedAt: true,
      order: { select: { number: true, productionManagerId: true, installerId: true } },
    },
  });
  if (!proof) redirect(`${portalPath(token)}?error=${encodeURIComponent("Proof not found.")}`);

  if (proof.lockedAt) {
    redirect(`${portalPath(token, `proofs/${proofId}`)}?error=${encodeURIComponent("This proof has been locked.")}`);
  }
  if (proof.status !== "SENT") {
    redirect(`${portalPath(token, `proofs/${proofId}`)}?error=${encodeURIComponent("This proof can't be changed right now.")}`);
  }

  const now = new Date();
  const nextStatus = decision === "APPROVE" ? "APPROVED" : "CHANGES_REQUESTED";
  const approving = decision === "APPROVE";

  // Phase 11 — the proof + ledger writes go in one transaction so the
  // timeline and the status stay consistent even if the DB blips. On
  // APPROVE we lock immediately (same rule as staff-side change).
  await db.$transaction(async (tx) => {
    await tx.proof.update({
      where: { id: proofId },
      data: {
        status:           nextStatus,
        respondedAt:      now,
        customerResponse: empty(note),
        ...(approving
          ? { lockedAt: now, lockedBy: `customer:${ctx.customer.id}` }
          : {}),
      },
    });

    await tx.proofDecision.create({
      data: {
        tenantId:            ctx.tenant.id,
        proofId,
        round:               proof.revisionRound,
        decision:            approving ? "APPROVED" : "CHANGES_REQUESTED",
        decidedByCustomerId: ctx.customer.id,
        notes:               empty(note),
        metadata:            { via: "portal", portalTokenId: ctx.token.id },
      },
    });
    if (approving) {
      await tx.proofDecision.create({
        data: {
          tenantId:            ctx.tenant.id,
          proofId,
          round:               proof.revisionRound,
          decision:            "LOCKED",
          decidedByCustomerId: ctx.customer.id,
          metadata:            { via: "portal", portalTokenId: ctx.token.id },
        },
      });
    }
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     null,
    action:     approving ? "portal.proof_approved" : "portal.proof_changes_requested",
    entityType: "Proof",
    entityId:   proofId,
    metadata:   { portalTokenId: ctx.token.id, customerId: ctx.customer.id, round: proof.revisionRound },
  });

  // Phase 11 — notify more than just the designer. The PM and installer
  // need to know when a proof lands so they can schedule production /
  // plan an install window. This is purely additive — the designer still
  // gets the portal-specific ping.
  await notifyMany(
    [
      realUser(proof.createdBy),
      proof.order.productionManagerId,
      proof.order.installerId,
    ],
    {
      tenantId:   ctx.tenant.id,
      type:       approving ? "portal.proof_approved" : "portal.proof_changes_requested",
      title:      approving
        ? `${ctx.customer.name} approved proof v${proof.version} on order ${proof.order.number}`
        : `${ctx.customer.name} requested changes on proof v${proof.version} (order ${proof.order.number})`,
      body:       empty(note),
      entityType: "Proof",
      entityId:   proofId,
      link:       `/t/${ctx.tenant.slug}/orders/${proof.orderId}/proofs/${proofId}`,
    },
  );

  revalidatePath(`/t/${ctx.tenant.slug}/orders/${proof.orderId}/proofs/${proofId}`);
  revalidatePath(`/t/${ctx.tenant.slug}/orders/${proof.orderId}`);
  redirect(portalPath(token, `proofs/${proofId}`));
}

// ────────────────────────────────────────────────────────────
// Phase 15 Slice A — Public share link response (proof)
// ────────────────────────────────────────────────────────────
//
// Unlike the portal flow above, the /share/<token> view is forwardable
// to anyone — the token IS the authorization. We still bind the response
// to the specific proof via the token's proofId, run the same status
// guards, and stamp `decidedByCustomerId: null` on the decision ledger
// (we genuinely don't know which contact approved — it could be a
// forwarded approver who isn't in our Customer table).

export async function respondToProofShare(shareTokenId: string, formData: FormData) {
  // shareTokenId is the DB row id, not the URL token — the page binds
  // this via .bind(null, token.id) so we don't need to re-resolve the
  // token string here (already validated by the page).
  const parsed = proofRespondSchema.safeParse(Object.fromEntries(formData.entries()));
  const redirectBack = `/share/`; // filled in after lookup

  const share = await db.shareToken.findFirst({
    where: { id: shareTokenId, kind: "PROOF", revokedAt: null },
    select: {
      id: true,
      proofId: true,
      token: true,
      expiresAt: true,
      tenantId: true,
      proof: {
        select: {
          id: true, status: true, orderId: true, version: true, revisionRound: true,
          createdBy: true, lockedAt: true, tenantId: true,
          order: {
            select: {
              number: true, customerId: true,
              productionManagerId: true, installerId: true,
              customer: { select: { name: true } },
            },
          },
          tenant: { select: { slug: true } },
        },
      },
    },
  });
  if (!share || !share.proof || !share.proof.order) {
    redirect(`/share/invalid`);
  }
  if (share.expiresAt && share.expiresAt.getTime() <= Date.now()) {
    redirect(`/share/expired`);
  }
  const back = `${redirectBack}${share.token}`;

  if (!parsed.success) {
    redirect(`${back}?error=${encodeURIComponent("Invalid response.")}`);
  }
  const { decision, note } = parsed.data;

  const proof = share.proof;

  if (proof.lockedAt) {
    redirect(`${back}?error=${encodeURIComponent("This proof has been locked.")}`);
  }
  if (proof.status !== "SENT") {
    redirect(`${back}?error=${encodeURIComponent("This proof can't be changed right now.")}`);
  }

  const now = new Date();
  const approving = decision === "APPROVE";
  const nextStatus = approving ? "APPROVED" : "CHANGES_REQUESTED";

  await db.$transaction(async (tx) => {
    await tx.proof.update({
      where: { id: proof.id },
      data: {
        status:           nextStatus,
        respondedAt:      now,
        customerResponse: empty(note),
        ...(approving
          ? { lockedAt: now, lockedBy: `share:${share.id}` }
          : {}),
      },
    });
    await tx.proofDecision.create({
      data: {
        tenantId: share.tenantId,
        proofId:  proof.id,
        round:    proof.revisionRound,
        decision: approving ? "APPROVED" : "CHANGES_REQUESTED",
        // decidedByCustomerId intentionally null — share link is
        // unauthenticated and the actor may not be the primary contact.
        notes:    empty(note),
        metadata: { via: "share", shareTokenId: share.id },
      },
    });
    if (approving) {
      await tx.proofDecision.create({
        data: {
          tenantId: share.tenantId,
          proofId:  proof.id,
          round:    proof.revisionRound,
          decision: "LOCKED",
          metadata: { via: "share", shareTokenId: share.id },
        },
      });
    }
  });

  await logAudit({
    tenantId:   share.tenantId,
    userId:     null,
    action:     approving ? "share.proof_approved" : "share.proof_changes_requested",
    entityType: "Proof",
    entityId:   proof.id,
    metadata:   { shareTokenId: share.id, round: proof.revisionRound },
  });

  await notifyMany(
    [
      realUser(proof.createdBy),
      proof.order.productionManagerId,
      proof.order.installerId,
    ],
    {
      tenantId:   share.tenantId,
      type:       approving ? "share.proof_approved" : "share.proof_changes_requested",
      title:      approving
        ? `${proof.order.customer.name} approved proof v${proof.version} (order ${proof.order.number}) via share link`
        : `${proof.order.customer.name} requested changes on proof v${proof.version} (order ${proof.order.number}) via share link`,
      body:       empty(note),
      entityType: "Proof",
      entityId:   proof.id,
      link:       `/t/${proof.tenant.slug}/orders/${proof.orderId}/proofs/${proof.id}`,
    },
  );

  revalidatePath(`/t/${proof.tenant.slug}/orders/${proof.orderId}/proofs/${proof.id}`);
  revalidatePath(`/t/${proof.tenant.slug}/orders/${proof.orderId}`);
  redirect(`${back}?done=1`);
}

// ────────────────────────────────────────────────────────────
// Customer file upload from portal
// ────────────────────────────────────────────────────────────
//
// The customer can attach files to an order from the portal order
// detail page: briefs, site photos, existing branding, proof markup
// annotations. The browser posts a real <input type="file"> via the
// server action's multipart FormData — we stream the bytes straight
// to R2 and persist the resulting public URL in File.storageUrl.
//
// Notifies the salesRep, productionManager, and installer assigned to
// the order (overlapping with other customer-action notifications).
// Deduplication is handled by `notifyMany`.

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB
const FILENAME_MAX     = 120;

function sanitizeFilename(raw: string): string {
  // Strip path separators and trim whitespace — guard against someone
  // submitting "../../etc/passwd" or similar.
  return raw
    .split(/[\\/]/)
    .pop()!
    .trim()
    .replace(/[\x00-\x1f]/g, "")
    .slice(0, FILENAME_MAX);
}

export async function uploadPortalFile(
  token: string,
  orderId: string,
  formData: FormData,
) {
  const ctx = await resolvePortalToken(token);
  if (!ctx) redirect(`/portal/expired`);

  const file = formData.get("file");
  const notes = (formData.get("notes") as string | null) ?? "";
  const back = portalPath(token, `orders/${orderId}`);

  if (!(file instanceof File) || file.size === 0) {
    redirect(`${back}?error=${encodeURIComponent("Please attach a file before uploading.")}`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    redirect(`${back}?error=${encodeURIComponent("File is too large (25 MB max).")}`);
  }
  const filename = sanitizeFilename(file.name);
  if (!filename) {
    redirect(`${back}?error=${encodeURIComponent("Invalid filename.")}`);
  }

  // Tenant's plan-level storage quota. The customer can't see the
  // tenant's plan, so the message stays neutral — they're nudged to
  // contact the shop rather than learn about pricing tiers.
  const quota = await checkStorageQuota(ctx.tenant.id, ctx.tenant.plan, file.size);
  if (quota) {
    redirect(`${back}?error=${encodeURIComponent("This shop's storage is full. Please contact them directly to share the file.")}`);
  }

  if (!isStorageConfigured()) {
    redirect(`${back}?error=${encodeURIComponent("File hosting isn't configured. Contact support.")}`);
  }

  // Order must belong to this customer.
  const order = await db.order.findFirst({
    where: { id: orderId, tenantId: ctx.tenant.id, customerId: ctx.customer.id },
    select: {
      id: true, number: true, customerId: true,
      productionManagerId: true, installerId: true, createdBy: true,
    },
  });
  if (!order) {
    redirect(`${portalPath(token)}?error=${encodeURIComponent("Order not found.")}`);
  }

  let url: string;
  let size: number;
  let mime: string;
  try {
    const result = await putFile({
      tenantId: ctx.tenant.id,
      scope: "customer-files",
      ownerId: order.id,
      file,
      visibility: "public",
    });
    url = publicUrlFor(result.key);
    size = result.size;
    mime = result.contentType;
  } catch (err) {
    if (err instanceof StorageError) {
      redirect(`${back}?error=${encodeURIComponent(err.message)}`);
    }
    console.error("[uploadPortalFile] put failed:", err);
    redirect(`${back}?error=${encodeURIComponent("Upload failed. Try again.")}`);
  }

  const isImage = mime.startsWith("image/");

  const fileRow = await db.file.create({
    data: {
      tenantId:   ctx.tenant.id,
      // We stamp the synthetic "portal:<tokenId>" so the staff-side "uploaded
      // by" column can tell this apart from staff uploads. Real portal
      // contacts don't exist in the User table, so this is the closest we
      // can get without inventing a customer-user bridge.
      uploaderId: `portal:${ctx.token.id}`,
      filename,
      storageUrl: url,
      mimeType:   mime || null,
      sizeBytes:  size,
      kind:       "CUSTOMER_UPLOAD",
      customerId: ctx.customer.id,
      orderId:    order.id,
      // R2 serves the full image, so the thumbnail field can point at the
      // same URL — saves us thumbnail generation until we need it.
      thumbnailUrl: isImage ? url : null,
      notes:      empty(notes),
    },
  });
  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     null,
    action:     "portal.file_uploaded",
    entityType: "File",
    entityId:   fileRow.id,
    metadata:   {
      portalTokenId: ctx.token.id,
      customerId:    ctx.customer.id,
      orderId:       order.id,
      filename,
      sizeBytes:     size,
    },
  });

  await notifyMany(
    [
      order.productionManagerId,
      order.installerId,
      realUser(order.createdBy),
    ],
    {
      tenantId:   ctx.tenant.id,
      type:       "portal.file_uploaded",
      title:      `${ctx.customer.name} uploaded a file to order ${order.number}`,
      body:       filename,
      entityType: "File",
      entityId:   fileRow.id,
      link:       `/t/${ctx.tenant.slug}/orders/${order.id}`,
    },
  );

  revalidatePath(`/t/${ctx.tenant.slug}/orders/${order.id}`);
  redirect(`${portalPath(token, `orders/${orderId}`)}?uploaded=1`);
}

export async function deletePortalFile(
  token: string,
  fileId: string,
) {
  const ctx = await resolvePortalToken(token);
  if (!ctx) redirect(`/portal/expired`);

  // Customers can only delete files THEY uploaded, and only the ones
  // attached to orders they own. Staff-uploaded files are invisible to
  // the delete flow because the `uploaderId` check will fail.
  const file = await db.file.findFirst({
    where: {
      id:         fileId,
      tenantId:   ctx.tenant.id,
      customerId: ctx.customer.id,
      kind:       "CUSTOMER_UPLOAD",
      uploaderId: `portal:${ctx.token.id}`,
    },
    select: { id: true, orderId: true, filename: true, createdAt: true },
  });
  if (!file) {
    // Not found or not owned — bail silently back to the order page.
    redirect(`${portalPath(token)}?error=${encodeURIComponent("File not found.")}`);
  }

  // Grace period: the customer can take back their own upload within 24
  // hours. After that the staff has presumably referenced it and removing
  // it would break the paper trail — they need to call and ask.
  const ageMs = Date.now() - file.createdAt.getTime();
  if (ageMs > 24 * 3600_000) {
    redirect(`${portalPath(token, `orders/${file.orderId}`)}?error=${encodeURIComponent("Files older than 24 hours can't be removed here — please contact us to remove it.")}`);
  }

  await db.file.delete({ where: { id: file.id } });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     null,
    action:     "portal.file_deleted",
    entityType: "File",
    entityId:   file.id,
    metadata:   {
      portalTokenId: ctx.token.id,
      customerId:    ctx.customer.id,
      orderId:       file.orderId,
      filename:      file.filename,
    },
  });

  if (file.orderId) {
    revalidatePath(`/t/${ctx.tenant.slug}/orders/${file.orderId}`);
    redirect(`${portalPath(token, `orders/${file.orderId}`)}?removed=1`);
  }
  redirect(portalPath(token));
}
