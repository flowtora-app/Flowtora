"use server";

// M5 — PlanPriceOverride admin actions.
//
// Each override row says "tenant X pays $Y for plan Z instead of the
// current sticker price." Used for:
//   • grandfathered pricing ("you got in early, forever at $49")
//   • custom-negotiated Enterprise deals
//   • temporary comp'd access ("free until 2027-01")
//
// The billing/invoice layer doesn't read these yet — that plumbing
// lands alongside the M6 webhook migration. The admin surface ships
// first so sales / success can stop keeping track in spreadsheets.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePlatformAdmin, logPlatformAudit } from "@/lib/platform";

const priceStrSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Use dollars.cents, e.g. 49 or 49.50")
  .optional()
  .or(z.literal(""));

const overrideSchema = z.object({
  planId: z.string().min(1, "Pick a plan."),
  priceMonthly: priceStrSchema,
  priceAnnual: priceStrSchema,
  currency: z.string().length(3).toUpperCase().default("USD"),
  note: z.string().max(400).optional().or(z.literal("")),
  // HTML <input type="date"> produces YYYY-MM-DD. We accept "" for
  // "no expiry" and any parseable ISO prefix otherwise.
  expiresAt: z
    .string()
    .optional()
    .or(z.literal("")),
});

// Upsert: on the tenant × plan unique pair. Creating and editing
// share the same code path because there's always at most one override
// per (tenant, plan). If the admin wants to "replace" an override they
// just save a new one on the same plan — no "edit vs new" distinction
// is surfaced in the UI.
export async function upsertPriceOverride(tenantId: string, formData: FormData) {
  const ctx = await requirePlatformAdmin();
  const raw = Object.fromEntries(formData.entries());
  const parsed = overrideSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`/platform/tenants/${tenantId}?error=${encodeURIComponent(msg)}`);
  }

  // Safety: both prices blank is almost certainly a mistake. The
  // override row with no prices means "current sticker price" which
  // is already the default behavior, so we reject it.
  if (!parsed.data.priceMonthly && !parsed.data.priceAnnual) {
    redirect(
      `/platform/tenants/${tenantId}?error=${encodeURIComponent(
        "Set a monthly or annual override price (both blank means no override).",
      )}`,
    );
  }

  const [tenant, plan] = await Promise.all([
    db.tenant.findUnique({ where: { id: tenantId }, select: { id: true } }),
    db.pricingPlan.findUnique({ where: { id: parsed.data.planId }, select: { id: true, slug: true } }),
  ]);
  if (!tenant) redirect(`/platform/tenants?error=${encodeURIComponent("Tenant not found")}`);
  if (!plan) redirect(`/platform/tenants/${tenantId}?error=${encodeURIComponent("Plan not found")}`);

  // Parse expiresAt — accept YYYY-MM-DD as the end of that day UTC
  // so "expires on Dec 31" behaves the intuitive way.
  let expiresAt: Date | null = null;
  if (parsed.data.expiresAt) {
    const parsedDate = new Date(parsed.data.expiresAt);
    if (Number.isNaN(parsedDate.getTime())) {
      redirect(
        `/platform/tenants/${tenantId}?error=${encodeURIComponent("Invalid expiry date.")}`,
      );
    }
    // Push to end-of-day UTC if no time component was supplied.
    if (parsed.data.expiresAt.length === 10) {
      parsedDate.setUTCHours(23, 59, 59, 999);
    }
    expiresAt = parsedDate;
  }

  await db.planPriceOverride.upsert({
    where: {
      tenantId_planId: { tenantId, planId: plan.id },
    },
    create: {
      tenantId,
      planId: plan.id,
      priceMonthly: parsed.data.priceMonthly || null,
      priceAnnual: parsed.data.priceAnnual || null,
      currency: parsed.data.currency || "USD",
      note: parsed.data.note || null,
      expiresAt,
    },
    update: {
      priceMonthly: parsed.data.priceMonthly || null,
      priceAnnual: parsed.data.priceAnnual || null,
      currency: parsed.data.currency || "USD",
      note: parsed.data.note || null,
      expiresAt,
    },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.price_override_saved",
    entityType: "PlanPriceOverride",
    tenantId,
    metadata: {
      planSlug: plan.slug,
      priceMonthly: parsed.data.priceMonthly || null,
      priceAnnual: parsed.data.priceAnnual || null,
      expiresAt: expiresAt?.toISOString() ?? null,
      note: parsed.data.note || null,
      actor: ctx.email,
    },
  });

  revalidatePath(`/platform/tenants/${tenantId}`);
  redirect(`/platform/tenants/${tenantId}?ok=override-saved`);
}

export async function deletePriceOverride(
  tenantId: string,
  overrideId: string,
) {
  const ctx = await requirePlatformAdmin();

  const existing = await db.planPriceOverride.findUnique({
    where: { id: overrideId },
    select: {
      id: true,
      tenantId: true,
      plan: { select: { slug: true } },
    },
  });
  if (!existing) {
    redirect(`/platform/tenants/${tenantId}?error=${encodeURIComponent("Override not found")}`);
  }
  if (existing.tenantId !== tenantId) {
    // Shouldn't happen with the admin UI — log and reject in case of
    // hand-crafted form submissions.
    redirect(`/platform/tenants/${tenantId}?error=${encodeURIComponent("Override mismatch")}`);
  }

  await db.planPriceOverride.delete({ where: { id: overrideId } });

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.price_override_deleted",
    entityType: "PlanPriceOverride",
    tenantId,
    metadata: { planSlug: existing.plan.slug, actor: ctx.email },
  });

  revalidatePath(`/platform/tenants/${tenantId}`);
  redirect(`/platform/tenants/${tenantId}?ok=override-deleted`);
}
