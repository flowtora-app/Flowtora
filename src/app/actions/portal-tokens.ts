"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { recordEmailEvent } from "@/lib/email-events";

const optionalString = z.string().max(200).optional().or(z.literal(""));
const empty = (s: string | undefined) => (s && s.length > 0 ? s : null);

// Issuing a portal token is "sharing the customer's records" — we gate it
// behind `customers:edit`. Anyone who can edit the customer can create one.

const issueSchema = z.object({
  customerId: z.string().min(1),
  label:      optionalString,
  expiresAt:  optionalString, // "YYYY-MM-DD" from a <input type=date>
});

export async function issuePortalToken(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "customers:edit");
  const parsed = issueSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/customers?error=${encodeURIComponent("Invalid portal link input.")}`);
  }
  const d = parsed.data;

  const customer = await db.customer.findFirst({
    where: { id: d.customerId, tenantId: ctx.tenant.id },
    select: { id: true, email: true },
  });
  if (!customer) {
    redirect(`/t/${slug}/customers?error=${encodeURIComponent("Customer not found.")}`);
  }

  // Parse expiry as end-of-day in the user's timezone — a token with
  // "expires 2026-04-20" should be valid through that entire day.
  let expiresAt: Date | null = null;
  if (empty(d.expiresAt)) {
    const [y, m, day] = d.expiresAt!.split("-").map((n) => parseInt(n, 10));
    if (y && m && day) {
      const dt = new Date(y, m - 1, day, 23, 59, 59, 999);
      if (Number.isFinite(dt.getTime())) expiresAt = dt;
    }
  }

  const token = await db.portalToken.create({
    data: {
      tenantId:   ctx.tenant.id,
      customerId: customer.id,
      label:      empty(d.label),
      expiresAt,
      createdBy:  ctx.userId,
    },
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "portal.token_issued",
    entityType: "PortalToken",
    entityId:   token.id,
    metadata:   { customerId: customer.id, expiresAt: expiresAt?.toISOString() ?? null },
  });

  // Phase 14 — show the portal invite on the customer timeline.
  if (customer.email) {
    await recordEmailEvent({
      tenantId:          ctx.tenant.id,
      customerId:        customer.id,
      senderUserId:      ctx.userId,
      kind:              "PORTAL_INVITE",
      toAddress:         customer.email,
      subject:           "Your customer portal link",
      relatedEntityType: "PortalToken",
      relatedEntityId:   token.id,
    });
  }

  revalidatePath(`/t/${slug}/customers/${customer.id}`);
}

export async function revokePortalToken(slug: string, tokenId: string) {
  const ctx = await requirePermission(slug, "customers:edit");
  const token = await db.portalToken.findFirst({
    where: { id: tokenId, tenantId: ctx.tenant.id },
    select: { id: true, customerId: true, revokedAt: true },
  });
  if (!token) return;
  if (token.revokedAt) return; // idempotent

  await db.portalToken.update({
    where: { id: tokenId },
    data: { revokedAt: new Date() },
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "portal.token_revoked",
    entityType: "PortalToken",
    entityId:   tokenId,
    metadata:   { customerId: token.customerId },
  });

  revalidatePath(`/t/${slug}/customers/${token.customerId}`);
}

export async function deletePortalToken(slug: string, tokenId: string) {
  const ctx = await requirePermission(slug, "customers:edit");
  const token = await db.portalToken.findFirst({
    where: { id: tokenId, tenantId: ctx.tenant.id },
    select: { id: true, customerId: true },
  });
  if (!token) return;

  await db.portalToken.delete({ where: { id: tokenId } });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "portal.token_deleted",
    entityType: "PortalToken",
    entityId:   tokenId,
    metadata:   { customerId: token.customerId },
  });

  revalidatePath(`/t/${slug}/customers/${token.customerId}`);
}
