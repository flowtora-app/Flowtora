"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { defaultExpiryDaysFor } from "@/lib/share";

// Phase 15 Slice A — public share-link issuance.
//
// Mirrors the portal-token actions: gated behind the relevant entity's
// `:manage` permission (staff who can edit it can also share it), records
// every create/revoke/delete to the audit log, revalidates the staff
// detail page so the new URL pops up instantly.
//
// We parse expiry as "YYYY-MM-DD" end-of-day OR as a shorthand "+N" days
// so the common form ("send and forget") is a one-keystroke pick.

const optionalString = z.string().max(200).optional().or(z.literal(""));
const empty = (s: string | undefined) => (s && s.length > 0 ? s : null);

function parseExpiry(raw: string | null, defaultDays: number): Date | null {
  if (!raw) {
    // Default: now + defaultDays at end-of-day.
    const dt = new Date();
    dt.setDate(dt.getDate() + defaultDays);
    dt.setHours(23, 59, 59, 999);
    return dt;
  }
  if (raw === "never") return null;
  // "+N" shorthand — N days from today at end-of-day.
  const plus = /^\+(\d{1,4})$/.exec(raw);
  if (plus) {
    const n = parseInt(plus[1], 10);
    if (!Number.isFinite(n) || n <= 0) return null;
    const dt = new Date();
    dt.setDate(dt.getDate() + n);
    dt.setHours(23, 59, 59, 999);
    return dt;
  }
  // "YYYY-MM-DD" ISO date.
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) {
    const [_, y, m, d] = iso;
    const dt = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10), 23, 59, 59, 999);
    if (Number.isFinite(dt.getTime())) return dt;
  }
  return null;
}

// ────────────────────────────────────────────────────────────
// Invoice share links
// ────────────────────────────────────────────────────────────

const invoiceShareSchema = z.object({
  label:     optionalString,
  expiresAt: optionalString, // "YYYY-MM-DD", "+N", "never", or blank
});

export async function issueInvoiceShareToken(
  slug: string,
  invoiceId: string,
  formData: FormData,
) {
  const ctx = await requirePermission(slug, "invoices:manage");
  const parsed = invoiceShareSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/invoices/${invoiceId}?error=${encodeURIComponent("Invalid share link input.")}`);
  }

  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, tenantId: ctx.tenant.id },
    select: { id: true, locationId: true, customerId: true, number: true },
  });
  if (!invoice) {
    redirect(`/t/${slug}/invoices?error=${encodeURIComponent("Invoice not found.")}`);
  }
  ctx.assertBranchAccess(invoice.locationId);

  const expiresAt = parseExpiry(empty(parsed.data.expiresAt), defaultExpiryDaysFor("INVOICE"));

  const token = await db.shareToken.create({
    data: {
      tenantId:  ctx.tenant.id,
      kind:      "INVOICE",
      invoiceId: invoice.id,
      label:     empty(parsed.data.label),
      expiresAt,
      createdBy: ctx.userId,
    },
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "share.invoice_token_issued",
    entityType: "Invoice",
    entityId:   invoice.id,
    metadata:   {
      shareTokenId: token.id,
      customerId:   invoice.customerId,
      expiresAt:    expiresAt?.toISOString() ?? null,
    },
  });

  revalidatePath(`/t/${slug}/invoices/${invoice.id}`);
}

// ────────────────────────────────────────────────────────────
// Proof share links
// ────────────────────────────────────────────────────────────

const proofShareSchema = z.object({
  label:     optionalString,
  expiresAt: optionalString,
});

export async function issueProofShareToken(
  slug: string,
  orderId: string,
  proofId: string,
  formData: FormData,
) {
  const ctx = await requirePermission(slug, "proofs:manage");
  const parsed = proofShareSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/orders/${orderId}/proofs/${proofId}?error=${encodeURIComponent("Invalid share link input.")}`);
  }

  const proof = await db.proof.findFirst({
    where: { id: proofId, tenantId: ctx.tenant.id, orderId },
    select: {
      id: true,
      order: { select: { locationId: true, customerId: true, number: true } },
    },
  });
  if (!proof) {
    redirect(`/t/${slug}/orders/${orderId}?error=${encodeURIComponent("Proof not found.")}`);
  }
  ctx.assertBranchAccess(proof.order.locationId);

  const expiresAt = parseExpiry(empty(parsed.data.expiresAt), defaultExpiryDaysFor("PROOF"));

  const token = await db.shareToken.create({
    data: {
      tenantId:  ctx.tenant.id,
      kind:      "PROOF",
      proofId:   proof.id,
      label:     empty(parsed.data.label),
      expiresAt,
      createdBy: ctx.userId,
    },
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "share.proof_token_issued",
    entityType: "Proof",
    entityId:   proof.id,
    metadata:   {
      shareTokenId: token.id,
      customerId:   proof.order.customerId,
      expiresAt:    expiresAt?.toISOString() ?? null,
    },
  });

  revalidatePath(`/t/${slug}/orders/${orderId}/proofs/${proofId}`);
}

// ────────────────────────────────────────────────────────────
// Revoke / delete — shared across kinds
// ────────────────────────────────────────────────────────────

/**
 * Revoke a share token. Idempotent — no-ops if already revoked or deleted.
 * Permission is derived from the token's kind so a PROOF token revocation
 * checks `proofs:manage`, an INVOICE token checks `invoices:manage`.
 */
export async function revokeShareToken(
  slug: string,
  shareTokenId: string,
) {
  // Look up first (unauthenticated — the permission gate is below) so we
  // know which capability to demand.
  const row = await db.shareToken.findUnique({
    where: { id: shareTokenId },
    select: {
      id: true, kind: true, tenantId: true, revokedAt: true,
      proofId: true, invoiceId: true,
      proof:   { select: { orderId: true } },
    },
  });
  if (!row) return;

  const capability = row.kind === "PROOF" ? "proofs:manage" : "invoices:manage";
  const ctx = await requirePermission(slug, capability);
  if (row.tenantId !== ctx.tenant.id) return;
  if (row.revokedAt) return;

  await db.shareToken.update({
    where: { id: row.id },
    data:  { revokedAt: new Date(), revokedBy: ctx.userId },
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     row.kind === "PROOF"
      ? "share.proof_token_revoked"
      : "share.invoice_token_revoked",
    entityType: "ShareToken",
    entityId:   row.id,
    metadata:   { kind: row.kind, proofId: row.proofId, invoiceId: row.invoiceId },
  });

  if (row.kind === "INVOICE" && row.invoiceId) {
    revalidatePath(`/t/${slug}/invoices/${row.invoiceId}`);
  } else if (row.kind === "PROOF" && row.proofId && row.proof?.orderId) {
    revalidatePath(`/t/${slug}/orders/${row.proof.orderId}/proofs/${row.proofId}`);
  }
}
