"use server";

// Refunds & Disputes server actions — Page 18.
//
// Permissions:
//   • Refund + dispute mutations: `billing.refund`.
//   • Evidence template CRUD also gated on `billing.refund`.
//
// Honest deferral: there's no Stripe webhook ingestor today. We mint
// a PENDING refund row + log the audit event; once the webhook lands,
// the settlement signal will flip status to SUCCEEDED/FAILED. Same
// shape for `submitDisputeEvidence` — it stamps `submittedEvidenceAt`
// + flips status to UNDER_REVIEW so the UI can move on, but it
// doesn't ship the evidence packet to the gateway.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { logPlatformAudit, requirePlatformStaff } from "@/lib/platform";

/* ────────────────────────────────────────────────────────── */
/* Refunds                                                    */
/* ────────────────────────────────────────────────────────── */

const REFUND_REASONS = [
  "CUSTOMER_REQUEST", "FRAUD", "DUPLICATE",
  "SUBSCRIPTION_MISTAKE", "SERVICE_ISSUE", "OTHER",
] as const;

const refundSchema = z.object({
  paymentId: z.string().min(1),
  /** Dollars (e.g. "49.00") — converted to minor units. */
  amount: z.string().min(1),
  reason: z.enum(REFUND_REASONS),
  reasonNote: z.string().max(2000).optional(),
  internalNote: z.string().max(2000).optional(),
  customerNote: z.string().max(2000).optional(),
  asCredit: z.string().optional(), // checkbox value
});

export async function createRefund(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("billing.refund")) {
    return { ok: false, error: "Your role can't issue refunds" } as const;
  }
  const parsed = refundSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" } as const;
  }

  const dollars = Number(parsed.data.amount);
  if (Number.isNaN(dollars) || dollars <= 0) {
    return { ok: false, error: "Amount must be a positive number" } as const;
  }
  const amountMinor = Math.round(dollars * 100);

  const payment = await db.platformInvoicePayment.findUnique({
    where: { id: parsed.data.paymentId },
    select: {
      id: true, status: true, amount: true, invoiceId: true,
      invoice: { select: { tenantId: true, currency: true, number: true } },
      refunds: {
        where: { status: { in: ["SUCCEEDED", "PENDING"] } },
        select: { amount: true },
      },
    },
  });
  if (!payment) return { ok: false, error: "Payment not found" } as const;
  if (payment.status !== "succeeded" && payment.status !== "partial_refund") {
    return { ok: false, error: "Payment isn't refundable" } as const;
  }
  const alreadyRefunded = payment.refunds.reduce((acc, r) => acc + r.amount, 0);
  const remaining = payment.amount - alreadyRefunded;
  if (amountMinor > remaining) {
    return { ok: false, error: `Only $${(remaining / 100).toFixed(2)} left to refund` } as const;
  }

  const asCredit = !!parsed.data.asCredit;

  // Mint the refund + (when asCredit) the linked credit note in one txn.
  const result = await db.$transaction(async (tx) => {
    let creditNoteId: string | null = null;
    if (asCredit) {
      // Number the credit note CN-N relative to the invoice + bump.
      const last = await tx.platformCreditNote.findFirst({
        where: { invoiceId: payment.invoiceId },
        orderBy: { issuedAt: "desc" },
        select: { number: true },
      });
      const seq = (() => {
        if (!last) return 1;
        const n = Number(last.number.replace(/^CN-/, ""));
        return Number.isNaN(n) ? 1 : n + 1;
      })();
      const cn = await tx.platformCreditNote.create({
        data: {
          invoiceId: payment.invoiceId,
          number: `CN-${payment.invoice.number}-${seq}`,
          amount: amountMinor,
          reason: `Refund · ${parsed.data.reason}`,
          notes: parsed.data.customerNote || parsed.data.reasonNote || null,
          issuedBy: ctx.userId,
        },
      });
      creditNoteId = cn.id;
    }

    const refund = await tx.platformPaymentRefund.create({
      data: {
        paymentId: payment.id,
        invoiceId: payment.invoiceId,
        tenantId: payment.invoice.tenantId,
        amount: amountMinor,
        reason: parsed.data.reason,
        reasonNote: parsed.data.reasonNote?.trim() || null,
        internalNote: parsed.data.internalNote?.trim() || null,
        customerNote: parsed.data.customerNote?.trim() || null,
        asCredit,
        creditNoteId,
        // Credits settle immediately (no gateway round-trip); gateway
        // refunds stay PENDING until the webhook ingestor flips them.
        status: asCredit ? "SUCCEEDED" : "PENDING",
        completedAt: asCredit ? new Date() : null,
        initiatedBy: ctx.userId,
      },
    });

    // Update the parent payment if the refund covers it (for the
    // credit-note path, which settles immediately).
    if (asCredit) {
      const newRefunded = alreadyRefunded + amountMinor;
      const nextStatus = newRefunded >= payment.amount ? "refunded" : "partial_refund";
      await tx.platformInvoicePayment.update({
        where: { id: payment.id },
        data: { status: nextStatus, refundedAt: new Date() },
      });
    }
    return refund;
  });

  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: payment.invoice.tenantId,
    action: "platform.refund_created",
    entityType: "PlatformPaymentRefund",
    entityId: result.id,
    metadata: {
      actor: ctx.email,
      paymentId: payment.id,
      amount: amountMinor,
      reason: parsed.data.reason,
      asCredit,
    },
    severity: "WARNING",
  });

  revalidatePath("/platform/billing/refunds");
  revalidatePath(`/platform/billing/invoices/${payment.invoiceId}`);
  return { ok: true, id: result.id } as const;
}

const cancelSchema = z.object({ refundId: z.string().min(1) });

export async function cancelPendingRefund(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("billing.refund")) {
    return { ok: false, error: "Your role can't cancel refunds" } as const;
  }
  const parsed = cancelSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const refund = await db.platformPaymentRefund.findUnique({
    where: { id: parsed.data.refundId },
    select: { id: true, status: true, tenantId: true },
  });
  if (!refund) return { ok: false, error: "Refund not found" } as const;
  if (refund.status !== "PENDING") {
    return { ok: false, error: "Only pending refunds can be cancelled" } as const;
  }
  await db.platformPaymentRefund.update({
    where: { id: refund.id },
    data: { status: "FAILED", failureReason: "Cancelled by admin", completedAt: new Date() },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: refund.tenantId,
    action: "platform.refund_cancelled",
    entityType: "PlatformPaymentRefund",
    entityId: refund.id,
    metadata: { actor: ctx.email },
    severity: "WARNING",
  });
  revalidatePath("/platform/billing/refunds");
  return { ok: true } as const;
}

/* ────────────────────────────────────────────────────────── */
/* Disputes                                                   */
/* ────────────────────────────────────────────────────────── */

const evidenceSchema = z.object({
  disputeId: z.string().min(1),
  evidenceText: z.string().min(20, "Evidence must be at least 20 characters"),
});

export async function submitDisputeEvidence(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("billing.refund")) {
    return { ok: false, error: "Your role can't manage disputes" } as const;
  }
  const parsed = evidenceSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" } as const;
  }

  const dispute = await db.platformDispute.findUnique({
    where: { id: parsed.data.disputeId },
    select: { id: true, status: true, tenantId: true },
  });
  if (!dispute) return { ok: false, error: "Dispute not found" } as const;
  if (dispute.status !== "NEEDS_RESPONSE") {
    return { ok: false, error: "Evidence already submitted or dispute closed" } as const;
  }

  // Snapshot tenant context at submission time so the evidence packet
  // is reproducible even if the tenant changes later.
  const tenantSnap = await db.tenant.findUnique({
    where: { id: dispute.tenantId },
    select: { name: true, status: true, createdAt: true },
  });

  await db.platformDispute.update({
    where: { id: dispute.id },
    data: {
      evidenceText: parsed.data.evidenceText,
      submittedEvidenceAt: new Date(),
      status: "UNDER_REVIEW",
      contextSnapshot: {
        tenantStatus: tenantSnap?.status ?? null,
        tenantName: tenantSnap?.name ?? null,
        tenantCreatedAt: tenantSnap?.createdAt?.toISOString() ?? null,
        submittedBy: ctx.email,
        submittedAt: new Date().toISOString(),
      },
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: dispute.tenantId,
    action: "platform.dispute_evidence_submitted",
    entityType: "PlatformDispute",
    entityId: dispute.id,
    metadata: { actor: ctx.email, length: parsed.data.evidenceText.length },
    severity: "WARNING",
  });
  revalidatePath("/platform/billing/refunds");
  revalidatePath(`/platform/billing/refunds/disputes/${dispute.id}`);
  return { ok: true } as const;
}

const acceptSchema = z.object({ disputeId: z.string().min(1) });

export async function acceptDispute(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("billing.refund")) {
    return { ok: false, error: "Your role can't manage disputes" } as const;
  }
  const parsed = acceptSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const dispute = await db.platformDispute.findUnique({
    where: { id: parsed.data.disputeId },
    select: { id: true, status: true, tenantId: true },
  });
  if (!dispute) return { ok: false, error: "Dispute not found" } as const;
  if (dispute.status === "WON" || dispute.status === "LOST") {
    return { ok: false, error: "Dispute already resolved" } as const;
  }
  await db.platformDispute.update({
    where: { id: dispute.id },
    data: {
      status: "LOST",
      acceptedAt: new Date(),
      acceptedBy: ctx.userId,
      resolvedAt: new Date(),
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: dispute.tenantId,
    action: "platform.dispute_accepted",
    entityType: "PlatformDispute",
    entityId: dispute.id,
    metadata: { actor: ctx.email },
    severity: "WARNING",
  });
  revalidatePath("/platform/billing/refunds");
  revalidatePath(`/platform/billing/refunds/disputes/${dispute.id}`);
  return { ok: true } as const;
}

/* ────────────────────────────────────────────────────────── */
/* Evidence templates (CRUD)                                  */
/* ────────────────────────────────────────────────────────── */

const templateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  body: z.string().min(20),
});

export async function saveEvidenceTemplate(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("billing.refund")) {
    return { ok: false, error: "Your role can't edit templates" } as const;
  }
  const parsed = templateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" } as const;
  }

  const data = {
    name: parsed.data.name.trim(),
    description: parsed.data.description?.trim() || null,
    body: parsed.data.body,
  };
  if (parsed.data.id) {
    await db.chargebackEvidenceTemplate.update({
      where: { id: parsed.data.id },
      data,
    });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.evidence_template_updated",
      entityType: "ChargebackEvidenceTemplate",
      entityId: parsed.data.id,
      metadata: { actor: ctx.email, name: data.name },
    });
  } else {
    const created = await db.chargebackEvidenceTemplate.create({
      data: { ...data, createdBy: ctx.userId },
    });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.evidence_template_created",
      entityType: "ChargebackEvidenceTemplate",
      entityId: created.id,
      metadata: { actor: ctx.email, name: data.name },
    });
  }
  revalidatePath("/platform/billing/refunds");
  return { ok: true } as const;
}

const templateIdSchema = z.object({ id: z.string().min(1) });

export async function deleteEvidenceTemplate(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("billing.refund")) {
    return { ok: false, error: "Your role can't delete templates" } as const;
  }
  const parsed = templateIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
  await db.chargebackEvidenceTemplate.delete({ where: { id: parsed.data.id } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.evidence_template_deleted",
    entityType: "ChargebackEvidenceTemplate",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email },
    severity: "WARNING",
  });
  revalidatePath("/platform/billing/refunds");
  return { ok: true } as const;
}

/* ────────────────────────────────────────────────────────── */
/* Redirect-style entry — used by the +New refund <form>      */
/* ────────────────────────────────────────────────────────── */

export async function createRefundFromForm(formData: FormData) {
  const result = await createRefund(formData);
  if (!result.ok) {
    redirect(`/platform/billing/refunds?error=${encodeURIComponent(result.error)}`);
  }
  redirect(`/platform/billing/refunds?ok=1`);
}
