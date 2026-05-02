"use server";

// Subscription server actions — Page 15.
//
// Permissions:
//   • Change plan / cancel / pause / resume / reactivate / add-charge
//     / issue-credit: billing.plan_change.
//   • Apply coupon: billing.coupon (CSMs have it).
//   • Send portal-link email: billing.read.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { logPlatformAudit, requirePlatformStaff } from "@/lib/platform";
import {
  recordTenantPlanChanged,
  recordTenantCanceled,
} from "@/server/billing/subscription-events";
import { appOrigin } from "@/lib/share";
import type { Plan } from "@prisma/client";

const PLAN_VALUES = ["STARTER", "GROWTH", "PRO", "ENTERPRISE"] as const;

/* ── Change plan ────────────────────────────────────────── */

const changePlanSchema = z.object({
  tenantId: z.string().min(1),
  toPlan: z.enum(PLAN_VALUES),
  cycle: z.union([z.literal("MONTHLY"), z.literal("ANNUAL")]).optional(),
  reason: z.string().max(500).optional(),
});

export async function changeSubscriptionPlan(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("billing.plan_change")) {
    return { ok: false, error: "Your role can't change plans" } as const;
  }
  const parsed = changePlanSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" } as const;
  }

  const t = await db.tenant.findUnique({
    where: { id: parsed.data.tenantId },
    select: { id: true, plan: true, billingCycle: true },
  });
  if (!t) return { ok: false, error: "Tenant not found" } as const;
  if (t.plan === parsed.data.toPlan && (parsed.data.cycle ?? t.billingCycle) === t.billingCycle) {
    return { ok: false, error: "No change — already on this plan + cycle" } as const;
  }

  await db.tenant.update({
    where: { id: t.id },
    data: {
      plan: parsed.data.toPlan,
      ...(parsed.data.cycle ? { billingCycle: parsed.data.cycle } : {}),
    },
  });
  await recordTenantPlanChanged({
    tenantId: t.id,
    fromPlan: t.plan,
    toPlan: parsed.data.toPlan as Plan,
    actorUserId: ctx.userId,
    reason: parsed.data.reason,
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: t.id,
    action: "platform.subscription_plan_changed",
    entityType: "Tenant",
    entityId: t.id,
    metadata: {
      actor: ctx.email, fromPlan: t.plan, toPlan: parsed.data.toPlan,
      cycle: parsed.data.cycle ?? t.billingCycle, reason: parsed.data.reason,
    },
    severity: "WARNING",
  });
  revalidatePath("/platform/billing");
  revalidatePath(`/platform/billing/${t.id}`);
  return { ok: true } as const;
}

/* ── Apply / clear coupon ──────────────────────────────── */

const couponSchema = z.object({
  tenantId: z.string().min(1),
  couponId: z.string().optional(),
});

export async function applyCouponToSubscription(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("billing.coupon")) {
    return { ok: false, error: "Your role can't apply coupons" } as const;
  }
  const parsed = couponSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  if (parsed.data.couponId) {
    const c = await db.coupon.findUnique({
      where: { id: parsed.data.couponId },
      select: { id: true, status: true },
    });
    if (!c || c.status !== "ACTIVE") return { ok: false, error: "Coupon not active" } as const;
  }
  await db.tenant.update({
    where: { id: parsed.data.tenantId },
    data: { activeCouponId: parsed.data.couponId || null },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: parsed.data.tenantId,
    action: parsed.data.couponId
      ? "platform.subscription_coupon_applied"
      : "platform.subscription_coupon_cleared",
    entityType: "Tenant",
    entityId: parsed.data.tenantId,
    metadata: { actor: ctx.email, couponId: parsed.data.couponId ?? null },
  });
  revalidatePath(`/platform/billing/${parsed.data.tenantId}`);
  return { ok: true } as const;
}

/* ── Pause / resume ─────────────────────────────────────── */

const pauseSchema = z.object({
  tenantId: z.string().min(1),
  /** ISO datetime — when the pause ends. */
  pausedUntil: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export async function pauseSubscription(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("billing.plan_change")) {
    return { ok: false, error: "Your role can't pause subscriptions" } as const;
  }
  const parsed = pauseSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
  const until = new Date(parsed.data.pausedUntil);
  if (Number.isNaN(until.getTime())) return { ok: false, error: "Invalid date" } as const;

  await db.tenant.update({
    where: { id: parsed.data.tenantId },
    data: { pausedUntil: until },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: parsed.data.tenantId,
    action: "platform.subscription_paused",
    entityType: "Tenant",
    entityId: parsed.data.tenantId,
    metadata: { actor: ctx.email, pausedUntil: until.toISOString(), reason: parsed.data.reason },
    severity: "WARNING",
  });
  revalidatePath(`/platform/billing/${parsed.data.tenantId}`);
  return { ok: true } as const;
}

const tenantIdSchema = z.object({ tenantId: z.string().min(1) });

export async function resumeSubscription(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("billing.plan_change")) {
    return { ok: false, error: "Your role can't resume subscriptions" } as const;
  }
  const parsed = tenantIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  await db.tenant.update({
    where: { id: parsed.data.tenantId },
    data: { pausedUntil: null },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: parsed.data.tenantId,
    action: "platform.subscription_resumed",
    entityType: "Tenant",
    entityId: parsed.data.tenantId,
    metadata: { actor: ctx.email },
  });
  revalidatePath(`/platform/billing/${parsed.data.tenantId}`);
  return { ok: true } as const;
}

/* ── Cancel ─────────────────────────────────────────────── */

const cancelSchema = z.object({
  tenantId: z.string().min(1),
  /** "now" cancels immediately; "period_end" sets cancelAtPeriodEnd. */
  when: z.union([z.literal("now"), z.literal("period_end")]).default("period_end"),
  reason: z.string().max(500).optional(),
});

export async function cancelSubscription(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("billing.plan_change")) {
    return { ok: false, error: "Your role can't cancel subscriptions" } as const;
  }
  const parsed = cancelSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const t = await db.tenant.findUnique({
    where: { id: parsed.data.tenantId },
    select: { id: true, status: true, plan: true, currentPeriodEnd: true },
  });
  if (!t) return { ok: false, error: "Tenant not found" } as const;

  if (parsed.data.when === "now") {
    await db.tenant.update({
      where: { id: t.id },
      data: {
        status: "CANCELED",
        cancelAtPeriodEnd: false,
        cancelScheduledFor: null,
        cancelReason: parsed.data.reason ?? null,
      },
    });
    await recordTenantCanceled({
      tenantId: t.id,
      lastPlan: t.plan,
      actorUserId: ctx.userId,
      reason: parsed.data.reason,
    });
  } else {
    await db.tenant.update({
      where: { id: t.id },
      data: {
        cancelAtPeriodEnd: true,
        cancelScheduledFor: t.currentPeriodEnd,
        cancelReason: parsed.data.reason ?? null,
      },
    });
  }
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: t.id,
    action: parsed.data.when === "now"
      ? "platform.subscription_canceled_now"
      : "platform.subscription_cancel_scheduled",
    entityType: "Tenant",
    entityId: t.id,
    metadata: { actor: ctx.email, when: parsed.data.when, reason: parsed.data.reason },
    severity: "CRITICAL",
  });
  revalidatePath("/platform/billing");
  revalidatePath(`/platform/billing/${t.id}`);
  return { ok: true } as const;
}

export async function reactivateSubscription(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("billing.plan_change")) {
    return { ok: false, error: "Your role can't reactivate subscriptions" } as const;
  }
  const parsed = tenantIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const t = await db.tenant.findUnique({
    where: { id: parsed.data.tenantId },
    select: { id: true, status: true, cancelAtPeriodEnd: true },
  });
  if (!t) return { ok: false, error: "Tenant not found" } as const;

  await db.tenant.update({
    where: { id: t.id },
    data: {
      status: "ACTIVE",
      cancelAtPeriodEnd: false,
      cancelScheduledFor: null,
      cancelReason: null,
      pausedUntil: null,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: t.id,
    action: "platform.subscription_reactivated",
    entityType: "Tenant",
    entityId: t.id,
    metadata: { actor: ctx.email, prevStatus: t.status },
    severity: "WARNING",
  });
  revalidatePath("/platform/billing");
  revalidatePath(`/platform/billing/${t.id}`);
  return { ok: true } as const;
}

/* ── Send portal link / payment-method-update email ─────── */

export async function sendPaymentPortalLink(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("billing.read")) {
    return { ok: false, error: "Your role can't send portal links" } as const;
  }
  const parsed = tenantIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const t = await db.tenant.findUnique({
    where: { id: parsed.data.tenantId },
    select: {
      id: true, name: true, slug: true, stripeCustomerId: true,
      memberships: {
        where: { role: "OWNER" },
        select: { user: { select: { email: true } } },
        take: 1,
      },
    },
  });
  if (!t) return { ok: false, error: "Tenant not found" } as const;
  const ownerEmail = t.memberships[0]?.user?.email;
  if (!ownerEmail) return { ok: false, error: "No OWNER email on file" } as const;

  // We don't actually mint a Stripe portal session today (no Stripe
  // signing key wired in); send the tenant to their workspace
  // settings billing tab where they can update card details.
  const url = `${appOrigin()}/t/${t.slug}/settings/billing`;
  await sendEmail({
    to: ownerEmail,
    subject: "Update your Flowtora payment method",
    text: `Hey,\n\nFlowtora support asked you to update your payment method.\n\n${url}\n\n— The Flowtora team`,
    html: `<p>Flowtora support asked you to update your payment method.</p><p><a href="${url}">${url}</a></p>`,
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: t.id,
    action: "platform.subscription_portal_link_sent",
    entityType: "Tenant",
    entityId: t.id,
    metadata: { actor: ctx.email, recipient: ownerEmail },
  });
  return { ok: true } as const;
}

/* ── Add one-time charge / issue credit (DRAFT invoices) ── */

const chargeSchema = z.object({
  tenantId: z.string().min(1),
  /** Cents (minor units). Positive = charge; negative = credit. */
  amountCents: z.coerce.number().int().refine((v) => v !== 0, "Amount must be non-zero"),
  description: z.string().min(1).max(200),
  currency: z.string().length(3).optional(),
});

export async function addOneOffCharge(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("billing.invoice")) {
    return { ok: false, error: "Your role can't add charges" } as const;
  }
  const parsed = chargeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" } as const;
  }
  const t = await db.tenant.findUnique({
    where: { id: parsed.data.tenantId },
    select: { id: true, currency: true },
  });
  if (!t) return { ok: false, error: "Tenant not found" } as const;

  const currency = parsed.data.currency ?? t.currency;
  const total = parsed.data.amountCents;
  // Mint a unique invoice number — best-effort sequential.
  const lastNum = await db.platformBillingInvoice.findFirst({
    orderBy: { createdAt: "desc" },
    select: { number: true },
  });
  const n = parseInt((lastNum?.number ?? "PI-1000").replace(/\D/g, ""), 10) || 1000;
  const number = `PI-${n + 1}`;

  const invoice = await db.platformBillingInvoice.create({
    data: {
      tenantId: t.id,
      number,
      currency,
      subtotal: total,
      discount: 0,
      tax: 0,
      total,
      amountPaid: 0,
      status: "DRAFT",
      createdById: ctx.userId,
      items: {
        create: [{
          description: parsed.data.description,
          quantity: 1,
          unitAmount: total,
          lineTotal: total,
        }],
      },
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: t.id,
    action: total > 0
      ? "platform.subscription_charge_added"
      : "platform.subscription_credit_issued",
    entityType: "PlatformBillingInvoice",
    entityId: invoice.id,
    metadata: { actor: ctx.email, total, currency, description: parsed.data.description },
    severity: "WARNING",
  });
  revalidatePath(`/platform/billing/${t.id}`);
  return { ok: true, invoiceId: invoice.id } as const;
}
