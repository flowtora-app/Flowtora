"use server";

// Page 24 — Payouts server actions.
//
// Permissions: gated on `revenue.read` for read + finance/admin role
// check for mutations. Audit-logged. Honest deferral: actual payment-
// rail SDK calls (Stripe Connect transfer / PayPal payout / Wise) are
// not wired. Saving a payout marks it PENDING; flipping to PAID still
// has to be a manual click.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { logPlatformAudit, requirePlatformPermission } from "@/lib/platform";

const ROUTE = "/platform/billing/payouts";

/* ── Payout methods ─────────────────────────────────────── */

const methodSchema = z.object({
  id: z.string().optional(),
  affiliateId: z.string().min(1),
  type: z.enum(["STRIPE_CONNECT", "ACH", "PAYPAL", "WISE", "WIRE"]),
  label: z.string().trim().min(2).max(120),
  accountSnippet: z.string().trim().max(120).optional().or(z.literal("")),
  externalAccountId: z.string().trim().max(200).optional().or(z.literal("")),
  status: z.string().trim().max(60).optional().or(z.literal("")),
  isPrimary: z.union([z.literal("on"), z.literal("")]).optional(),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function upsertPartnerPayoutMethod(formData: FormData) {
  const ctx = await requirePlatformPermission("revenue.read");
  const parsed = methodSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`${ROUTE}?tab=methods&error=${encodeURIComponent(msg)}`);
  }
  const isPrimary = parsed.data.isPrimary === "on";

  // If we're setting this method as primary, demote any other primary
  // for the same partner first.
  if (isPrimary) {
    await db.partnerPayoutMethod.updateMany({
      where: { affiliateId: parsed.data.affiliateId, isPrimary: true },
      data: { isPrimary: false },
    });
  }

  if (parsed.data.id) {
    await db.partnerPayoutMethod.update({
      where: { id: parsed.data.id },
      data: {
        type: parsed.data.type,
        label: parsed.data.label,
        accountSnippet: parsed.data.accountSnippet?.trim() || null,
        externalAccountId: parsed.data.externalAccountId?.trim() || null,
        status: parsed.data.status?.trim() || null,
        isPrimary,
        notes: parsed.data.notes?.trim() || null,
      },
    });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.partner_payout_method_updated",
      entityType: "PartnerPayoutMethod",
      entityId: parsed.data.id,
      metadata: { actor: ctx.email, affiliateId: parsed.data.affiliateId, type: parsed.data.type },
    });
  } else {
    const created = await db.partnerPayoutMethod.create({
      data: {
        affiliateId: parsed.data.affiliateId,
        type: parsed.data.type,
        label: parsed.data.label,
        accountSnippet: parsed.data.accountSnippet?.trim() || null,
        externalAccountId: parsed.data.externalAccountId?.trim() || null,
        status: parsed.data.status?.trim() || null,
        isPrimary,
        notes: parsed.data.notes?.trim() || null,
        createdById: ctx.userId,
      },
      select: { id: true },
    });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.partner_payout_method_created",
      entityType: "PartnerPayoutMethod",
      entityId: created.id,
      metadata: { actor: ctx.email, affiliateId: parsed.data.affiliateId, type: parsed.data.type },
    });
  }
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=methods&ok=saved`);
}

export async function deletePartnerPayoutMethod(methodId: string) {
  const ctx = await requirePlatformPermission("revenue.read");
  const m = await db.partnerPayoutMethod.findUnique({
    where: { id: methodId },
    select: { id: true, affiliateId: true, label: true },
  });
  if (!m) redirect(`${ROUTE}?tab=methods&error=${encodeURIComponent("Method not found")}`);
  await db.partnerPayoutMethod.delete({ where: { id: methodId } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.partner_payout_method_deleted",
    entityType: "PartnerPayoutMethod",
    entityId: methodId,
    metadata: { actor: ctx.email, affiliateId: m.affiliateId, label: m.label },
    severity: "WARNING",
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=methods&ok=deleted`);
}

/* ── Manual payout trigger ──────────────────────────────── */

const triggerSchema = z.object({
  affiliateId: z.string().min(1),
  period: z.string().trim().min(4).max(20),
});

export async function triggerPartnerPayout(formData: FormData) {
  const ctx = await requirePlatformPermission("revenue.read");
  const parsed = triggerSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`${ROUTE}?tab=schedule&error=${encodeURIComponent(msg)}`);
  }

  // Pick the partner's primary method.
  const method = await db.partnerPayoutMethod.findFirst({
    where: { affiliateId: parsed.data.affiliateId, isPrimary: true },
    select: { id: true },
  });
  if (!method) {
    redirect(`${ROUTE}?tab=schedule&error=${encodeURIComponent("Partner has no primary payout method on file")}`);
  }

  // Roll up unpaid commission lines for the period.
  const lines = await db.partnerCommissionLine.findMany({
    where: {
      affiliateId: parsed.data.affiliateId,
      payoutId: null,
      period: parsed.data.period,
    },
    select: { id: true, kind: true, amount: true },
  });
  if (lines.length === 0) {
    redirect(`${ROUTE}?tab=schedule&error=${encodeURIComponent(`No unpaid commission for ${parsed.data.period}`)}`);
  }
  const total = lines.reduce((acc, l) => {
    if (l.kind === "DEDUCTION" || l.kind === "HOLD") return acc - l.amount;
    return acc + l.amount;
  }, 0);
  if (total <= 0) {
    redirect(`${ROUTE}?tab=schedule&error=${encodeURIComponent("Computed payout would be ≤ 0 — review deductions/holds first")}`);
  }

  // Avoid duplicate periods.
  const existing = await db.partnerPayout.findUnique({
    where: { affiliateId_period: { affiliateId: parsed.data.affiliateId, period: parsed.data.period } },
    select: { id: true, status: true },
  });
  if (existing) {
    redirect(`${ROUTE}?tab=schedule&error=${encodeURIComponent(`Payout already exists for ${parsed.data.period} (status: ${existing.status})`)}`);
  }

  const payout = await db.partnerPayout.create({
    data: {
      affiliateId: parsed.data.affiliateId,
      methodId: method.id,
      period: parsed.data.period,
      amount: total,
      currency: "USD",
      status: "PENDING",
      scheduledAt: new Date(),
      createdById: ctx.userId,
    },
    select: { id: true },
  });
  // Link the lines to the new payout.
  await db.partnerCommissionLine.updateMany({
    where: { id: { in: lines.map((l) => l.id) } },
    data: { payoutId: payout.id },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.partner_payout_triggered",
    entityType: "PartnerPayout",
    entityId: payout.id,
    metadata: { actor: ctx.email, affiliateId: parsed.data.affiliateId, period: parsed.data.period, amount: total, lineCount: lines.length },
    severity: "WARNING",
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=schedule&ok=triggered`);
}

/* ── Update payout status ───────────────────────────────── */

const updateStatusSchema = z.object({
  payoutId: z.string().min(1),
  status: z.enum(["PENDING", "IN_TRANSIT", "PAID", "FAILED", "CANCELED"]),
  externalRef: z.string().trim().max(200).optional().or(z.literal("")),
  failureReason: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function updatePartnerPayoutStatus(formData: FormData) {
  const ctx = await requirePlatformPermission("revenue.read");
  const parsed = updateStatusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`${ROUTE}?tab=history&error=${encodeURIComponent(msg)}`);
  }
  const existing = await db.partnerPayout.findUnique({
    where: { id: parsed.data.payoutId },
    select: { id: true, status: true, affiliateId: true, period: true, amount: true },
  });
  if (!existing) redirect(`${ROUTE}?tab=history&error=${encodeURIComponent("Payout not found")}`);

  const dispatchedAt = parsed.data.status === "IN_TRANSIT"
    ? new Date()
    : undefined;
  const settledAt = parsed.data.status === "PAID"
    ? new Date()
    : parsed.data.status === "FAILED" || parsed.data.status === "CANCELED"
      ? new Date()
      : undefined;

  // If canceled, unlink the commission lines so they accrue back into
  // the next period.
  if (parsed.data.status === "CANCELED" && existing.status !== "CANCELED") {
    await db.partnerCommissionLine.updateMany({
      where: { payoutId: existing.id },
      data: { payoutId: null },
    });
  }

  await db.partnerPayout.update({
    where: { id: existing.id },
    data: {
      status: parsed.data.status,
      externalRef: parsed.data.externalRef?.trim() || null,
      failureReason: parsed.data.failureReason?.trim() || null,
      ...(dispatchedAt && { dispatchedAt }),
      ...(settledAt && { settledAt }),
    },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    action: `platform.partner_payout_${parsed.data.status.toLowerCase()}`,
    entityType: "PartnerPayout",
    entityId: existing.id,
    metadata: {
      actor: ctx.email,
      affiliateId: existing.affiliateId,
      period: existing.period,
      amount: existing.amount,
      previousStatus: existing.status,
    },
    severity: parsed.data.status === "PAID" ? "INFO" : "WARNING",
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=history&ok=updated`);
}

/* ── Add commission line ────────────────────────────────── */

const addLineSchema = z.object({
  affiliateId: z.string().min(1),
  kind: z.enum(["COMMISSION", "HOLD", "DEDUCTION", "BONUS"]),
  description: z.string().trim().min(2).max(500),
  amount: z.coerce.number().int().min(1),
  period: z.string().trim().min(4).max(20),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function addPartnerCommissionLine(formData: FormData) {
  const ctx = await requirePlatformPermission("revenue.read");
  const parsed = addLineSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`${ROUTE}?tab=statements&error=${encodeURIComponent(msg)}`);
  }
  const created = await db.partnerCommissionLine.create({
    data: {
      affiliateId: parsed.data.affiliateId,
      kind: parsed.data.kind,
      description: parsed.data.description,
      amount: parsed.data.amount,
      period: parsed.data.period,
      notes: parsed.data.notes?.trim() || null,
    },
    select: { id: true },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.partner_commission_line_added",
    entityType: "PartnerCommissionLine",
    entityId: created.id,
    metadata: { actor: ctx.email, affiliateId: parsed.data.affiliateId, kind: parsed.data.kind, amount: parsed.data.amount, period: parsed.data.period },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=statements&ok=line_added`);
}
