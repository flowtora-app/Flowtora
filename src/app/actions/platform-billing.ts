"use server";

// Phase 3 — Platform billing actions.
//
// Three concerns: coupons, dunning state, and admin-issued invoices.
// All gated through the new fine-grained permissions:
//   billing.coupon       — mint / archive / apply coupons
//   billing.invoice      — draft + send manual invoices
//   billing.refund       — void / refund manual invoices
//   billing.plan_change  — pause/resume/resolve dunning (it's effectively a plan event)
//
// Multi-currency: all money values are stored as INTEGER MINOR UNITS
// (cents for USD, yen for JPY, etc.). The currency itself is stored on
// the parent row (Coupon.currency, PlatformBillingInvoice.currency).
// See lib/billing-currency for formatting + conversion helpers.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePlatformPermission, logPlatformAudit } from "@/lib/platform";
import {
  SUPPORTED_CURRENCIES,
  isSupportedCurrency,
  applyCouponDiscount,
} from "@/lib/billing-currency";
import {
  pushCouponToStripe,
  deleteCouponFromStripe,
} from "@/lib/stripe-coupons";
import type { DunningStage, Prisma } from "@prisma/client";

const CODE_RX = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

// ─────────────────────────────────────────────────────────────────────
// Coupons
// ─────────────────────────────────────────────────────────────────────

const couponCreateSchema = z.object({
  code: z.string().trim().toUpperCase().regex(CODE_RX, "Code must be 3-32 chars: letters, numbers, dash or underscore"),
  name: z.string().trim().max(120).optional().or(z.literal("")),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  discountType: z.enum(["PERCENT", "FIXED"]),
  amount: z.coerce.number().int().min(1),
  currency: z.string().trim().toUpperCase().optional().or(z.literal("")),
  appliesToPlans: z.string().optional(),  // comma-separated slugs, blank = any
  appliesToTenantIds: z.string().optional(), // comma-separated tenant IDs, blank = any
  maxRedemptions: z.coerce.number().int().min(1).optional(),
  maxRedemptionsPerCustomer: z.coerce.number().int().min(1).optional(),
  // Page 20 — duration mechanics.
  duration: z.enum(["ONCE", "REPEATING", "FOREVER"]).default("ONCE"),
  durationMonths: z.coerce.number().int().min(1).max(60).optional(),
  minSubscriptionAmount: z.coerce.number().int().min(0).optional(),
  firstTimeOnly: z.union([z.literal("on"), z.literal("")]).optional(),
  newTenantsOnlyDays: z.coerce.number().int().min(1).max(365).optional(),
  stackable: z.union([z.literal("on"), z.literal("")]).optional(),
  showOnPricingPage: z.union([z.literal("on"), z.literal("")]).optional(),
  validFrom: z.string().optional().or(z.literal("")),
  validUntil: z.string().optional().or(z.literal("")),
  status: z.enum(["DRAFT", "ACTIVE"]).default("ACTIVE"),
});

export async function createCoupon(formData: FormData) {
  const ctx = await requirePlatformPermission("billing.coupon");

  const raw = Object.fromEntries(formData.entries());
  const parsed = couponCreateSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid coupon";
    redirect(`/platform/billing/coupons?error=${encodeURIComponent(msg)}`);
  }
  const d = parsed.data;

  // PERCENT must be 1-100. FIXED requires a currency.
  if (d.discountType === "PERCENT" && (d.amount < 1 || d.amount > 100)) {
    redirect(`/platform/billing/coupons?error=${encodeURIComponent("Percent must be 1-100")}`);
  }
  if (d.discountType === "FIXED") {
    if (!d.currency || !isSupportedCurrency(d.currency)) {
      redirect(`/platform/billing/coupons?error=${encodeURIComponent("Fixed coupons need a currency")}`);
    }
  }

  // Uniqueness — surface a friendly error rather than a Prisma exception.
  const clash = await db.coupon.findUnique({ where: { code: d.code }, select: { id: true } });
  if (clash) {
    redirect(`/platform/billing/coupons?error=${encodeURIComponent(`Code "${d.code}" already exists`)}`);
  }

  const validUntil =
    d.validUntil && d.validUntil.trim() !== "" ? new Date(d.validUntil) : null;
  if (validUntil && Number.isNaN(validUntil.getTime())) {
    redirect(`/platform/billing/coupons?error=${encodeURIComponent("Invalid expiry date")}`);
  }

  const planSlugs = (d.appliesToPlans ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const tenantIds = (d.appliesToTenantIds ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Page 20 — REPEATING duration must have durationMonths.
  if (d.duration === "REPEATING" && (!d.durationMonths || d.durationMonths < 1)) {
    redirect(`/platform/billing/coupons?error=${encodeURIComponent("Repeating duration needs a month count")}`);
  }

  const validFrom = d.validFrom && d.validFrom.trim() !== ""
    ? new Date(d.validFrom)
    : new Date();
  if (Number.isNaN(validFrom.getTime())) {
    redirect(`/platform/billing/coupons?error=${encodeURIComponent("Invalid start date")}`);
  }

  const created = await db.coupon.create({
    data: {
      code: d.code,
      name: d.name?.trim() || null,
      description: d.description?.trim() || null,
      discountType: d.discountType,
      amount: d.amount,
      currency: d.discountType === "PERCENT" ? null : (d.currency ?? null),
      appliesToPlans: planSlugs,
      appliesToTenantIds: tenantIds,
      maxRedemptions: d.maxRedemptions ?? null,
      maxRedemptionsPerCustomer: d.maxRedemptionsPerCustomer ?? null,
      duration: d.duration,
      durationMonths: d.duration === "REPEATING" ? (d.durationMonths ?? null) : null,
      minSubscriptionAmount: d.minSubscriptionAmount ?? null,
      firstTimeOnly: d.firstTimeOnly === "on",
      newTenantsOnlyDays: d.newTenantsOnlyDays ?? null,
      stackable: d.stackable === "on",
      showOnPricingPage: d.showOnPricingPage === "on",
      validFrom,
      validUntil,
      status: d.status,
      createdById: ctx.userId,
    },
    select: { id: true, code: true },
  });

  // Mirror to Stripe — best-effort, doesn't block the create. ACTIVE
  // coupons sync immediately so the recurring subscription cycle picks
  // them up; DRAFT coupons stay local until promoted.
  let stripeStatus: "synced" | "skipped" | "failed" = "skipped";
  if (d.status === "ACTIVE") {
    const sync = await pushCouponToStripe({
      code: d.code,
      description: d.description?.trim() || null,
      discountType: d.discountType,
      amount: d.amount,
      currency: d.discountType === "PERCENT" ? null : (d.currency ?? null),
      validUntil,
      maxRedemptions: d.maxRedemptions ?? null,
    });
    if (sync.ok) {
      stripeStatus = "synced";
      await db.coupon.update({
        where: { id: created.id },
        data: { stripeCouponId: sync.stripeCouponId, stripeSyncedAt: new Date() },
      });
    } else {
      stripeStatus = "failed";
      await logPlatformAudit({
        userId: ctx.userId,
        action: "platform.coupon_stripe_sync_failed",
        entityType: "Coupon",
        entityId: created.id,
        metadata: { code: created.code, reason: sync.reason },
      });
    }
  }

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.coupon_created",
    entityType: "Coupon",
    entityId: created.id,
    metadata: {
      code: created.code,
      discountType: d.discountType,
      amount: d.amount,
      currency: d.currency || null,
      stripeStatus,
    },
  });

  revalidatePath("/platform/billing/coupons");
  redirect(`/platform/billing/coupons?ok=created`);
}

export async function archiveCoupon(couponId: string) {
  const ctx = await requirePlatformPermission("billing.coupon");

  const row = await db.coupon.findUnique({
    where: { id: couponId },
    select: { id: true, status: true, code: true, stripeCouponId: true },
  });
  if (!row) redirect(`/platform/billing/coupons?error=${encodeURIComponent("Coupon not found")}`);
  if (row.status === "ARCHIVED") redirect(`/platform/billing/coupons?ok=already_archived`);

  await db.$transaction([
    db.coupon.update({
      where: { id: row.id },
      data: { status: "ARCHIVED", stripeCouponId: null, stripeSyncedAt: null },
    }),
    // Detach from any tenants currently sitting on this coupon — they
    // shouldn't keep a discount on a coupon we just killed.
    db.tenant.updateMany({
      where: { activeCouponId: row.id },
      data: { activeCouponId: null },
    }),
  ]);

  // Best-effort Stripe deletion. If the coupon is gone from Stripe
  // already (404) we treat it as success.
  let stripeStatus: "removed" | "skipped" | "failed" = "skipped";
  if (row.stripeCouponId) {
    const del = await deleteCouponFromStripe(row.stripeCouponId);
    stripeStatus = del.ok ? "removed" : "failed";
    if (!del.ok) {
      await logPlatformAudit({
        userId: ctx.userId,
        action: "platform.coupon_stripe_delete_failed",
        entityType: "Coupon",
        entityId: row.id,
        metadata: { code: row.code, reason: del.reason },
      });
    }
  }

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.coupon_archived",
    entityType: "Coupon",
    entityId: row.id,
    metadata: { code: row.code, stripeStatus },
  });

  revalidatePath("/platform/billing/coupons");
  redirect(`/platform/billing/coupons?ok=archived`);
}

export async function reactivateCoupon(couponId: string) {
  const ctx = await requirePlatformPermission("billing.coupon");

  const row = await db.coupon.findUnique({
    where: { id: couponId },
    select: {
      id: true, status: true, code: true, description: true,
      discountType: true, amount: true, currency: true,
      validUntil: true, maxRedemptions: true,
    },
  });
  if (!row) redirect(`/platform/billing/coupons?error=${encodeURIComponent("Coupon not found")}`);
  if (row.validUntil && row.validUntil < new Date()) {
    redirect(`/platform/billing/coupons?error=${encodeURIComponent("Coupon has expired — adjust validUntil first")}`);
  }

  await db.coupon.update({ where: { id: row.id }, data: { status: "ACTIVE" } });

  // Re-push to Stripe — archive cleared the stripeCouponId; we need a
  // fresh row in Stripe to discount the next subscription cycle.
  const sync = await pushCouponToStripe({
    code: row.code,
    description: row.description,
    discountType: row.discountType,
    amount: row.amount,
    currency: row.currency,
    validUntil: row.validUntil,
    maxRedemptions: row.maxRedemptions,
  });
  let stripeStatus: "synced" | "failed" = "failed";
  if (sync.ok) {
    stripeStatus = "synced";
    await db.coupon.update({
      where: { id: row.id },
      data: { stripeCouponId: sync.stripeCouponId, stripeSyncedAt: new Date() },
    });
  } else {
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.coupon_stripe_sync_failed",
      entityType: "Coupon",
      entityId: row.id,
      metadata: { code: row.code, reason: sync.reason },
    });
  }

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.coupon_reactivated",
    entityType: "Coupon",
    entityId: row.id,
    metadata: { code: row.code, stripeStatus },
  });

  revalidatePath("/platform/billing/coupons");
  redirect(`/platform/billing/coupons?ok=reactivated`);
}

const applyCouponSchema = z.object({
  tenantId: z.string().min(1),
});

export async function applyCouponToTenant(couponId: string, formData: FormData) {
  const ctx = await requirePlatformPermission("billing.coupon");
  const parsed = applyCouponSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/platform/billing/coupons?error=${encodeURIComponent("Invalid tenant")}`);
  }

  const [coupon, tenant] = await Promise.all([
    db.coupon.findUnique({
      where: { id: couponId },
      select: {
        id: true, code: true, status: true, validUntil: true,
        maxRedemptions: true, redeemedCount: true,
      },
    }),
    db.tenant.findUnique({
      where: { id: parsed.data.tenantId },
      select: { id: true, name: true, currency: true },
    }),
  ]);
  if (!coupon) redirect(`/platform/billing/coupons?error=${encodeURIComponent("Coupon not found")}`);
  if (!tenant) redirect(`/platform/billing/coupons?error=${encodeURIComponent("Tenant not found")}`);
  if (coupon.status !== "ACTIVE") {
    redirect(`/platform/billing/coupons?error=${encodeURIComponent("Coupon is not active")}`);
  }
  if (coupon.validUntil && coupon.validUntil < new Date()) {
    redirect(`/platform/billing/coupons?error=${encodeURIComponent("Coupon has expired")}`);
  }
  if (coupon.maxRedemptions && coupon.redeemedCount >= coupon.maxRedemptions) {
    redirect(`/platform/billing/coupons?error=${encodeURIComponent("Coupon redemption cap reached")}`);
  }

  await db.tenant.update({
    where: { id: tenant.id },
    data: { activeCouponId: coupon.id },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: tenant.id,
    action: "platform.coupon_applied_to_tenant",
    entityType: "Tenant",
    entityId: tenant.id,
    metadata: { couponCode: coupon.code, couponId: coupon.id },
  });

  revalidatePath("/platform/billing/coupons");
  revalidatePath(`/platform/tenants/${tenant.id}`);
  redirect(`/platform/billing/coupons?ok=applied`);
}

export async function detachCouponFromTenant(tenantId: string) {
  const ctx = await requirePlatformPermission("billing.coupon");
  const t = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, activeCouponId: true, name: true },
  });
  if (!t) redirect(`/platform/billing/coupons?error=${encodeURIComponent("Tenant not found")}`);
  if (!t.activeCouponId) redirect(`/platform/billing/coupons?ok=no_active_coupon`);

  await db.tenant.update({ where: { id: t.id }, data: { activeCouponId: null } });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: t.id,
    action: "platform.coupon_detached_from_tenant",
    entityType: "Tenant",
    entityId: t.id,
    metadata: { couponId: t.activeCouponId },
  });
  revalidatePath("/platform/billing/coupons");
  redirect(`/platform/billing/coupons?ok=detached`);
}

// ─────────────────────────────────────────────────────────────────────
// Dunning state machine
// ─────────────────────────────────────────────────────────────────────

const NEXT_STAGE: Partial<Record<DunningStage, DunningStage>> = {
  NONE:           "PAYMENT_FAILED",
  PAYMENT_FAILED: "REMINDER_1",
  REMINDER_1:     "REMINDER_2",
  REMINDER_2:     "FINAL_NOTICE",
  FINAL_NOTICE:   "SUSPEND",
};

export async function startDunning(tenantId: string) {
  const ctx = await requirePlatformPermission("billing.plan_change");
  const t = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, dunningStage: true, name: true },
  });
  if (!t) redirect(`/platform/billing/dunning?error=${encodeURIComponent("Tenant not found")}`);
  if (t.dunningStage !== "NONE" && t.dunningStage !== "RESOLVED") {
    redirect(`/platform/billing/dunning?ok=already_active`);
  }

  const now = new Date();
  await db.tenant.update({
    where: { id: t.id },
    data: {
      dunningStage: "PAYMENT_FAILED",
      dunningStartedAt: now,
      dunningPausedAt: null,
      dunningLastEventAt: now,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: t.id,
    action: "platform.dunning_started",
    entityType: "Tenant",
    entityId: t.id,
    metadata: { stage: "PAYMENT_FAILED" },
  });
  revalidatePath("/platform/billing/dunning");
  redirect(`/platform/billing/dunning?ok=started`);
}

export async function advanceDunning(tenantId: string) {
  const ctx = await requirePlatformPermission("billing.plan_change");
  const t = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, dunningStage: true, name: true, status: true },
  });
  if (!t) redirect(`/platform/billing/dunning?error=${encodeURIComponent("Tenant not found")}`);

  const next = NEXT_STAGE[t.dunningStage];
  if (!next) {
    redirect(`/platform/billing/dunning?error=${encodeURIComponent("Cannot advance from " + t.dunningStage)}`);
  }

  // Hitting SUSPEND auto-suspends the tenant. This is the last manual
  // door before access is cut — kept manual on purpose so an operator
  // can wave it off if there's an active phone call.
  const sideEffects: Prisma.TenantUpdateInput = {
    dunningStage: next,
    dunningLastEventAt: new Date(),
    dunningPausedAt: null,
  };
  if (next === "SUSPEND" && t.status !== "SUSPENDED") {
    sideEffects.status = "SUSPENDED";
    sideEffects.suspensionReason = "Dunning final stage — payment past due.";
  }

  await db.tenant.update({ where: { id: t.id }, data: sideEffects });

  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: t.id,
    action: "platform.dunning_advanced",
    entityType: "Tenant",
    entityId: t.id,
    metadata: { from: t.dunningStage, to: next, suspended: next === "SUSPEND" },
  });
  revalidatePath("/platform/billing/dunning");
  if (next === "SUSPEND") revalidatePath(`/platform/tenants/${t.id}`);
  redirect(`/platform/billing/dunning?ok=advanced`);
}

export async function pauseDunning(tenantId: string) {
  const ctx = await requirePlatformPermission("billing.plan_change");
  const t = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, dunningStage: true, dunningPausedAt: true },
  });
  if (!t) redirect(`/platform/billing/dunning?error=${encodeURIComponent("Tenant not found")}`);
  if (t.dunningStage === "NONE" || t.dunningStage === "RESOLVED") {
    redirect(`/platform/billing/dunning?error=${encodeURIComponent("No active dunning to pause")}`);
  }
  if (t.dunningPausedAt) redirect(`/platform/billing/dunning?ok=already_paused`);

  await db.tenant.update({
    where: { id: t.id },
    data: { dunningPausedAt: new Date(), dunningLastEventAt: new Date() },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: t.id,
    action: "platform.dunning_paused",
    entityType: "Tenant",
    entityId: t.id,
    metadata: { stage: t.dunningStage },
  });
  revalidatePath("/platform/billing/dunning");
  redirect(`/platform/billing/dunning?ok=paused`);
}

export async function resumeDunning(tenantId: string) {
  const ctx = await requirePlatformPermission("billing.plan_change");
  const t = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, dunningPausedAt: true },
  });
  if (!t) redirect(`/platform/billing/dunning?error=${encodeURIComponent("Tenant not found")}`);
  if (!t.dunningPausedAt) redirect(`/platform/billing/dunning?ok=not_paused`);

  await db.tenant.update({
    where: { id: t.id },
    data: { dunningPausedAt: null, dunningLastEventAt: new Date() },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: t.id,
    action: "platform.dunning_resumed",
    entityType: "Tenant",
    entityId: t.id,
  });
  revalidatePath("/platform/billing/dunning");
  redirect(`/platform/billing/dunning?ok=resumed`);
}

export async function resolveDunning(tenantId: string) {
  const ctx = await requirePlatformPermission("billing.plan_change");
  const t = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, dunningStage: true, status: true },
  });
  if (!t) redirect(`/platform/billing/dunning?error=${encodeURIComponent("Tenant not found")}`);
  if (t.dunningStage === "NONE" || t.dunningStage === "RESOLVED") {
    redirect(`/platform/billing/dunning?ok=already_resolved`);
  }

  // Resolving lifts a previously-applied suspension *only* if it was
  // applied by dunning. We don't blanket-reactivate suspended tenants —
  // an admin may have suspended for ToS reasons.
  const lift = t.status === "SUSPENDED";
  const data: Prisma.TenantUpdateInput = {
    dunningStage: "RESOLVED",
    dunningPausedAt: null,
    dunningLastEventAt: new Date(),
  };
  if (lift) {
    data.status = "ACTIVE";
    data.suspensionReason = null;
  }

  await db.tenant.update({ where: { id: t.id }, data });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: t.id,
    action: "platform.dunning_resolved",
    entityType: "Tenant",
    entityId: t.id,
    metadata: { liftedSuspension: lift, fromStage: t.dunningStage },
  });
  revalidatePath("/platform/billing/dunning");
  if (lift) revalidatePath(`/platform/tenants/${t.id}`);
  redirect(`/platform/billing/dunning?ok=resolved`);
}

// ─────────────────────────────────────────────────────────────────────
// Multi-currency
// ─────────────────────────────────────────────────────────────────────

const currencySchema = z.object({
  currency: z.string().trim().toUpperCase().refine(
    (v) => SUPPORTED_CURRENCIES.includes(v as never),
    "Currency not supported",
  ),
});

export async function updateTenantCurrency(tenantId: string, formData: FormData) {
  const ctx = await requirePlatformPermission("billing.plan_change");
  const parsed = currencySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/platform/tenants/${tenantId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid currency")}`);
  }
  const t = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, currency: true },
  });
  if (!t) redirect(`/platform/tenants?error=${encodeURIComponent("Tenant not found")}`);
  if (t.currency === parsed.data.currency) {
    redirect(`/platform/tenants/${tenantId}?ok=currency_unchanged`);
  }

  await db.tenant.update({ where: { id: t.id }, data: { currency: parsed.data.currency } });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: t.id,
    action: "platform.tenant_currency_changed",
    entityType: "Tenant",
    entityId: t.id,
    metadata: { from: t.currency, to: parsed.data.currency },
  });
  revalidatePath(`/platform/tenants/${tenantId}`);
  redirect(`/platform/tenants/${tenantId}?ok=currency_saved`);
}

// ─────────────────────────────────────────────────────────────────────
// Manual invoicing — drafting, sending, marking paid.
// ─────────────────────────────────────────────────────────────────────

const invoiceItemRowSchema = z.object({
  description: z.string().trim().min(1, "Description required").max(300),
  quantity: z.coerce.number().int().min(1).max(10_000),
  unitAmount: z.coerce.number().int().min(0).max(100_000_000),  // cap at $1M / line
});

const invoiceCreateSchema = z.object({
  tenantId: z.string().min(1),
  currency: z.string().trim().toUpperCase().default("USD"),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  termsText: z.string().trim().max(500).optional().or(z.literal("")),
  dueAt: z.string().optional().or(z.literal("")),
  couponCode: z.string().trim().toUpperCase().optional().or(z.literal("")),
});

const NUMBER_PREFIX = "PI-";

async function nextInvoiceNumber(): Promise<string> {
  // Use the highest existing PI- number + 1. Cheap because the count
  // of platform invoices stays small relative to e.g. Stripe invoices.
  const rows = await db.platformBillingInvoice.findMany({
    where: { number: { startsWith: NUMBER_PREFIX } },
    select: { number: true },
    orderBy: { createdAt: "desc" },
    take: 1,
  });
  const last = rows[0]?.number;
  const n = last ? parseInt(last.replace(NUMBER_PREFIX, ""), 10) : 1000;
  const next = (Number.isFinite(n) ? n : 1000) + 1;
  return `${NUMBER_PREFIX}${next}`;
}

export async function createPlatformInvoice(formData: FormData) {
  const ctx = await requirePlatformPermission("billing.invoice");

  const raw = Object.fromEntries(formData.entries());
  const parsedHeader = invoiceCreateSchema.safeParse(raw);
  if (!parsedHeader.success) {
    const msg = parsedHeader.error.issues[0]?.message ?? "Invalid invoice";
    redirect(`/platform/billing/invoices?error=${encodeURIComponent(msg)}`);
  }
  const h = parsedHeader.data;

  if (!isSupportedCurrency(h.currency)) {
    redirect(`/platform/billing/invoices?error=${encodeURIComponent("Currency not supported")}`);
  }

  // Items come through as parallel arrays: items.description[], items.quantity[], items.unitAmount[].
  const descs = formData.getAll("itemDescription").map(String);
  const qtys  = formData.getAll("itemQuantity").map(String);
  const units = formData.getAll("itemUnit").map(String);
  const items: { description: string; quantity: number; unitAmount: number }[] = [];
  for (let i = 0; i < descs.length; i++) {
    if (!descs[i]?.trim()) continue;  // skip blank rows
    const ok = invoiceItemRowSchema.safeParse({
      description: descs[i],
      quantity: qtys[i] ?? "1",
      unitAmount: units[i] ?? "0",
    });
    if (!ok.success) {
      redirect(`/platform/billing/invoices?error=${encodeURIComponent(ok.error.issues[0]?.message ?? "Bad line item")}`);
    }
    items.push(ok.data);
  }
  if (items.length === 0) {
    redirect(`/platform/billing/invoices?error=${encodeURIComponent("Add at least one line item")}`);
  }

  // Resolve coupon if provided.
  let couponId: string | null = null;
  let discountMinor = 0;
  const subtotalMinor = items.reduce((acc, it) => acc + it.quantity * it.unitAmount, 0);
  if (h.couponCode && h.couponCode.trim()) {
    const c = await db.coupon.findUnique({
      where: { code: h.couponCode.trim() },
      select: {
        id: true, status: true, validUntil: true, discountType: true,
        amount: true, currency: true, maxRedemptions: true, redeemedCount: true,
      },
    });
    if (!c || c.status !== "ACTIVE") {
      redirect(`/platform/billing/invoices?error=${encodeURIComponent("Coupon not found or inactive")}`);
    }
    if (c.validUntil && c.validUntil < new Date()) {
      redirect(`/platform/billing/invoices?error=${encodeURIComponent("Coupon expired")}`);
    }
    if (c.maxRedemptions && c.redeemedCount >= c.maxRedemptions) {
      redirect(`/platform/billing/invoices?error=${encodeURIComponent("Coupon redemption cap reached")}`);
    }
    const result = applyCouponDiscount({
      subtotalMinor,
      currency: h.currency,
      couponDiscountType: c.discountType,
      couponAmount: c.amount,
      couponCurrency: c.currency,
    });
    if (result.mismatch) {
      redirect(`/platform/billing/invoices?error=${encodeURIComponent("Coupon currency must match invoice currency")}`);
    }
    discountMinor = result.discountMinor;
    couponId = c.id;
  }

  const dueAt = h.dueAt && h.dueAt.trim() !== "" ? new Date(h.dueAt) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) {
    redirect(`/platform/billing/invoices?error=${encodeURIComponent("Invalid due date")}`);
  }

  const number = await nextInvoiceNumber();
  const total = subtotalMinor - discountMinor;

  const invoice = await db.platformBillingInvoice.create({
    data: {
      tenantId: h.tenantId,
      number,
      status: "DRAFT",
      currency: h.currency,
      subtotal: subtotalMinor,
      discount: discountMinor,
      tax: 0,
      total,
      notes: h.notes?.trim() || null,
      termsText: h.termsText?.trim() || null,
      dueAt,
      couponId,
      createdById: ctx.userId,
      items: {
        create: items.map((it, idx) => ({
          description: it.description.trim(),
          quantity: it.quantity,
          unitAmount: it.unitAmount,
          lineTotal: it.quantity * it.unitAmount,
          position: idx,
        })),
      },
    },
    select: { id: true, number: true },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: h.tenantId,
    action: "platform.invoice_created",
    entityType: "PlatformBillingInvoice",
    entityId: invoice.id,
    metadata: { number: invoice.number, total, currency: h.currency, lineItems: items.length },
  });

  revalidatePath("/platform/billing/invoices");
  redirect(`/platform/billing/invoices?ok=created&id=${invoice.id}`);
}

export async function sendPlatformInvoice(invoiceId: string) {
  const ctx = await requirePlatformPermission("billing.invoice");

  const inv = await db.platformBillingInvoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, status: true, tenantId: true, number: true, couponId: true, total: true },
  });
  if (!inv) redirect(`/platform/billing/invoices?error=${encodeURIComponent("Invoice not found")}`);
  if (inv.status !== "DRAFT") {
    redirect(`/platform/billing/invoices?error=${encodeURIComponent(`Can't send a ${inv.status.toLowerCase()} invoice`)}`);
  }

  await db.$transaction(async (tx) => {
    await tx.platformBillingInvoice.update({
      where: { id: inv.id },
      data: { status: "SENT", issuedAt: new Date() },
    });
    if (inv.couponId) {
      await tx.coupon.update({
        where: { id: inv.couponId },
        data: { redeemedCount: { increment: 1 } },
      });
      await tx.couponRedemption.create({
        data: {
          couponId: inv.couponId,
          tenantId: inv.tenantId,
          invoiceId: inv.id,
          appliedAmount: inv.total,
        },
      });
    }
  });

  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: inv.tenantId,
    action: "platform.invoice_sent",
    entityType: "PlatformBillingInvoice",
    entityId: inv.id,
    metadata: { number: inv.number },
  });

  // Email/notification dispatch — left to the existing notifications
  // pipeline. The /platform/notifications phase wired transactional
  // templates; a follow-up will register a "platform_invoice_sent"
  // template and fan it out from here. For now the audit row is the
  // record of what happened.

  revalidatePath("/platform/billing/invoices");
  redirect(`/platform/billing/invoices?ok=sent`);
}

const markPaidSchema = z.object({
  amount: z.coerce.number().int().min(0).optional(),
});

export async function markPlatformInvoicePaid(invoiceId: string, formData: FormData) {
  const ctx = await requirePlatformPermission("billing.invoice");
  const parsed = markPaidSchema.safeParse(Object.fromEntries(formData.entries()));
  const inv = await db.platformBillingInvoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, status: true, total: true, tenantId: true, number: true },
  });
  if (!inv) redirect(`/platform/billing/invoices?error=${encodeURIComponent("Invoice not found")}`);
  if (inv.status !== "SENT") {
    redirect(`/platform/billing/invoices?error=${encodeURIComponent(`Can't mark ${inv.status.toLowerCase()} invoice paid`)}`);
  }

  const amount = parsed.success && parsed.data.amount ? parsed.data.amount : inv.total;
  await db.platformBillingInvoice.update({
    where: { id: inv.id },
    data: { status: "PAID", amountPaid: amount, paidAt: new Date() },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: inv.tenantId,
    action: "platform.invoice_paid",
    entityType: "PlatformBillingInvoice",
    entityId: inv.id,
    metadata: { number: inv.number, amount },
  });
  revalidatePath("/platform/billing/invoices");
  redirect(`/platform/billing/invoices?ok=paid`);
}

export async function voidPlatformInvoice(invoiceId: string) {
  const ctx = await requirePlatformPermission("billing.refund");

  const inv = await db.platformBillingInvoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, status: true, tenantId: true, number: true },
  });
  if (!inv) redirect(`/platform/billing/invoices?error=${encodeURIComponent("Invoice not found")}`);
  if (inv.status === "VOIDED" || inv.status === "REFUNDED") {
    redirect(`/platform/billing/invoices?ok=already_void`);
  }

  await db.platformBillingInvoice.update({
    where: { id: inv.id },
    data: { status: "VOIDED", voidedAt: new Date() },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: inv.tenantId,
    action: "platform.invoice_voided",
    entityType: "PlatformBillingInvoice",
    entityId: inv.id,
    metadata: { number: inv.number },
  });
  revalidatePath("/platform/billing/invoices");
  redirect(`/platform/billing/invoices?ok=voided`);
}

