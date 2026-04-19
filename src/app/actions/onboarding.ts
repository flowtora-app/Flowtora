"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { businessDefaultsFor } from "@/lib/business-defaults";

const businessSchema = z.object({
  businessType: z.enum(["SIGN_SHOP", "PRINT_SHOP", "HYBRID", "OTHER"]),
  services: z.array(z.string()).default([]),
});

export async function saveBusinessStep(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "tenant:manage");
  const services = formData.getAll("services").map(String);
  const parsed = businessSchema.safeParse({
    businessType: formData.get("businessType"),
    services,
  });
  if (!parsed.success) redirect(`/t/${slug}/onboarding/business?error=invalid`);

  // Phase 4 Slice A — apply industry presets on the FIRST time a business
  // type is chosen. We don't want to stomp someone who picked SIGN_SHOP,
  // edited defaults on step 3, and then navigated back to edit services —
  // that would silently undo their work. Gate on `businessType == null` so
  // the preset only lands once.
  const firstPick = ctx.tenant.businessType === null;
  const preset = firstPick ? businessDefaultsFor(parsed.data.businessType) : null;

  await db.tenant.update({
    where: { id: ctx.tenant.id },
    data: {
      businessType: parsed.data.businessType,
      services: parsed.data.services,
      ...(preset
        ? {
            defaultDepositPercent: preset.financial.defaultDepositPercent,
            defaultPaymentTerms: preset.financial.defaultPaymentTerms,
            proofRequiresApproval: preset.financial.proofRequiresApproval,
            requireProofBeforeProduction: preset.financial.requireProofBeforeProduction,
            requireDepositBeforeProduction: preset.financial.requireDepositBeforeProduction,
            requireDepositBeforeInstall: preset.financial.requireDepositBeforeInstall,
            quoteNumberPrefix: preset.financial.quoteNumberPrefix,
            orderNumberPrefix: preset.financial.orderNumberPrefix,
            invoiceNumberPrefix: preset.financial.invoiceNumberPrefix,
            rushFeePercent: preset.financial.rushFeePercent,
          }
        : {}),
    },
  });
  await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "onboarding.business" });
  redirect(`/t/${slug}/onboarding/branding`);
}

const brandingSchema = z.object({
  logoUrl: z.string().url().optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  website: z.string().url().optional().or(z.literal("")),
  addressLine1: z.string().max(160).optional().or(z.literal("")),
  city: z.string().max(80).optional().or(z.literal("")),
  region: z.string().max(80).optional().or(z.literal("")),
  postalCode: z.string().max(20).optional().or(z.literal("")),
  country: z.string().max(80).optional().or(z.literal("")),
  timezone: z.string().min(1).max(80),
  currency: z.string().length(3),
});

export async function saveBrandingStep(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "tenant:manage");
  const parsed = brandingSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`/t/${slug}/onboarding/branding?error=invalid`);

  const empty = (s: string | undefined) => (s && s.length > 0 ? s : null);

  await db.tenant.update({
    where: { id: ctx.tenant.id },
    data: {
      logoUrl: empty(parsed.data.logoUrl),
      phone: empty(parsed.data.phone),
      website: empty(parsed.data.website),
      addressLine1: empty(parsed.data.addressLine1),
      city: empty(parsed.data.city),
      region: empty(parsed.data.region),
      postalCode: empty(parsed.data.postalCode),
      country: empty(parsed.data.country),
      timezone: parsed.data.timezone,
      currency: parsed.data.currency.toUpperCase(),
    },
  });
  redirect(`/t/${slug}/onboarding/defaults`);
}

const defaultsSchema = z.object({
  quoteNumberPrefix: z.string().max(8).default("Q-"),
  orderNumberPrefix: z.string().max(8).default("O-"),
  invoiceNumberPrefix: z.string().max(8).default("INV-"),
  defaultTaxRate: z.coerce.number().min(0).max(1),
  defaultDepositPercent: z.coerce.number().int().min(0).max(100),
  defaultPaymentTerms: z.enum(["DUE_ON_RECEIPT", "NET_15", "NET_30", "NET_45", "NET_60"]),
  proofRequiresApproval: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});

export async function saveDefaultsStep(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "tenant:manage");
  const parsed = defaultsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`/t/${slug}/onboarding/defaults?error=invalid`);

  await db.tenant.update({
    where: { id: ctx.tenant.id },
    data: parsed.data,
  });
  redirect(`/t/${slug}/onboarding/team`);
}

export async function completeOnboarding(slug: string) {
  const ctx = await requirePermission(slug, "tenant:manage");
  await db.tenant.update({
    where: { id: ctx.tenant.id },
    data: { onboardingCompletedAt: new Date() },
  });
  await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "onboarding.completed" });
  revalidatePath(`/t/${slug}`, "layout");
  // Slice D — send them to a celebration screen instead of silently
  // dropping into the dashboard. It's a small thing that makes the
  // finish line feel earned.
  redirect(`/t/${slug}/onboarding/done`);
}
