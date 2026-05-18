"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";

// Customer-facing proof actions — called from the public proof
// approval surface (S-7) using the ShareToken for auth. No staff
// session required.

const approveSchema = z.object({
  signatureName: z.string().min(1, "Signature is required").max(120),
});

const requestChangesSchema = z.object({
  feedback: z.string().min(1, "Tell us what to change").max(2000),
});

/** Look up the proof for a given share token, returning null when
 *  the token is bad, revoked, or expired. The caller is the public
 *  proof page itself, which renders an honest error state when this
 *  comes back null. */
async function resolveProofToken(slug: string, token: string) {
  const tenant = await db.tenant.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!tenant) return null;

  const share = await db.shareToken.findUnique({
    where: { token },
    include: {
      proof: {
        include: {
          order: {
            include: {
              customer: { select: { id: true, name: true, email: true } },
            },
          },
        },
      },
    },
  });
  if (!share || share.tenantId !== tenant.id) return null;
  if (share.kind !== "PROOF" || !share.proof) return null;
  if (share.revokedAt)                        return null;
  if (share.expiresAt && share.expiresAt.getTime() < Date.now()) return null;

  return { tenantId: tenant.id, share };
}

/** Stamp the token's lastUsedAt + viewCount on each render. Fire and
 *  forget — never blocks the page render. */
export async function bumpProofTokenView(slug: string, token: string): Promise<void> {
  const r = await resolveProofToken(slug, token);
  if (!r) return;
  await db.shareToken.update({
    where: { id: r.share.id },
    data: { lastUsedAt: new Date(), viewCount: { increment: 1 } },
  }).catch(() => { /* non-fatal */ });
}

export async function approveProof(slug: string, token: string, formData: FormData) {
  const parsed = approveSchema.safeParse({
    signatureName: formData.get("signatureName"),
  });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`/shop/${slug}/proofs/${token}?error=${encodeURIComponent(msg)}`);
  }

  const r = await resolveProofToken(slug, token);
  if (!r) {
    redirect(`/shop/${slug}/proofs/${token}?error=${encodeURIComponent("This proof link is no longer valid")}`);
  }
  const { share } = r;
  const proof = share.proof!;

  // Idempotent: if it's already APPROVED, just bounce back to the page.
  if (proof.status === "APPROVED") {
    redirect(`/shop/${slug}/proofs/${token}?ok=already-approved`);
  }

  const now = new Date();
  await db.$transaction([
    db.proof.update({
      where: { id: proof.id },
      data: {
        status:           "APPROVED",
        respondedAt:      now,
        customerResponse: `Signed: ${parsed.data.signatureName}`,
        lockedAt:         now,
      },
    }),
    db.proofDecision.create({
      data: {
        tenantId: proof.tenantId,
        proofId:  proof.id,
        round:    proof.revisionRound,
        decision: "APPROVED",
        decidedByCustomerId: proof.order.customer.id,
        notes:    `Signed by ${parsed.data.signatureName} via shared link`,
        metadata: { via: "share", tokenId: share.id, signatureName: parsed.data.signatureName },
      },
    }),
  ]);

  revalidatePath(`/shop/${slug}/proofs/${token}`);
  redirect(`/shop/${slug}/proofs/${token}?ok=approved`);
}

export async function requestProofChanges(slug: string, token: string, formData: FormData) {
  const parsed = requestChangesSchema.safeParse({
    feedback: formData.get("feedback"),
  });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`/shop/${slug}/proofs/${token}?error=${encodeURIComponent(msg)}`);
  }

  const r = await resolveProofToken(slug, token);
  if (!r) {
    redirect(`/shop/${slug}/proofs/${token}?error=${encodeURIComponent("This proof link is no longer valid")}`);
  }
  const { share } = r;
  const proof = share.proof!;

  const now = new Date();
  await db.$transaction([
    db.proof.update({
      where: { id: proof.id },
      data: {
        status:           "CHANGES_REQUESTED",
        respondedAt:      now,
        customerResponse: parsed.data.feedback,
      },
    }),
    db.proofDecision.create({
      data: {
        tenantId: proof.tenantId,
        proofId:  proof.id,
        round:    proof.revisionRound,
        decision: "CHANGES_REQUESTED",
        decidedByCustomerId: proof.order.customer.id,
        notes:    parsed.data.feedback,
        metadata: { via: "share", tokenId: share.id },
      },
    }),
  ]);

  revalidatePath(`/shop/${slug}/proofs/${token}`);
  redirect(`/shop/${slug}/proofs/${token}?ok=changes-requested`);
}
