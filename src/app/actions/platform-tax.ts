"use server";

// Page 21 — Tax & Compliance server actions.
//
// Permissions: every mutation gates on `compliance.manage`.
// Audit-logged. Honestly deferred provider integrations (Stripe Tax /
// Avalara / TaxJar) — saving the provider field flips the local
// config; the actual SDK round-trip is a TODO flagged inline.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logPlatformAudit, requirePlatformPermission } from "@/lib/platform";

const ROUTE = "/platform/billing/tax";

/* ── Configuration tab ─────────────────────────────────── */

const configSchema = z.object({
  provider: z.enum(["NONE", "STRIPE", "AVALARA", "TAXJAR"]).default("NONE"),
  euOssRegistration: z.string().trim().max(100).optional().or(z.literal("")),
  ukMtdRegistration: z.string().trim().max(100).optional().or(z.literal("")),
  auGstRegistration: z.string().trim().max(100).optional().or(z.literal("")),
  reverseChargeEU: z.union([z.literal("on"), z.literal("")]).optional(),
});

export async function savePlatformTaxConfig(formData: FormData) {
  const ctx = await requirePlatformPermission("compliance.manage");
  const parsed = configSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid config";
    redirect(`${ROUTE}?tab=config&error=${encodeURIComponent(msg)}`);
  }

  await db.platformTaxConfig.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      provider: parsed.data.provider,
      // Honest stub — real connection state would come from a provider
      // SDK ping. We mark "configured" so the UI can render it as
      // "ready to wire" without lying about an active connection.
      providerStatus: parsed.data.provider === "NONE"
        ? null
        : "configured (integration not wired)",
      euOssRegistration: parsed.data.euOssRegistration?.trim() || null,
      ukMtdRegistration: parsed.data.ukMtdRegistration?.trim() || null,
      auGstRegistration: parsed.data.auGstRegistration?.trim() || null,
      reverseChargeEU: parsed.data.reverseChargeEU === "on",
      updatedBy: ctx.userId,
    },
    update: {
      provider: parsed.data.provider,
      providerStatus: parsed.data.provider === "NONE"
        ? null
        : "configured (integration not wired)",
      euOssRegistration: parsed.data.euOssRegistration?.trim() || null,
      ukMtdRegistration: parsed.data.ukMtdRegistration?.trim() || null,
      auGstRegistration: parsed.data.auGstRegistration?.trim() || null,
      reverseChargeEU: parsed.data.reverseChargeEU === "on",
      updatedBy: ctx.userId,
    },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.tax_config_updated",
    entityType: "PlatformTaxConfig",
    entityId: "default",
    metadata: { actor: ctx.email, provider: parsed.data.provider },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=config&ok=saved`);
}

/* ── Settings tab ──────────────────────────────────────── */

const settingsSchema = z.object({
  defaultBehavior: z.enum(["EXCLUSIVE", "INCLUSIVE"]).default("EXCLUSIVE"),
  defaultRounding: z.enum(["ROUND_HALF_UP", "ROUND_DOWN", "ROUND_BANKERS"]).default("ROUND_HALF_UP"),
  /** Free-form JSON object as text. Parsed and validated. */
  defaultTaxCodes: z.string().optional().or(z.literal("")),
});

export async function savePlatformTaxSettings(formData: FormData) {
  const ctx = await requirePlatformPermission("compliance.manage");
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid settings";
    redirect(`${ROUTE}?tab=settings&error=${encodeURIComponent(msg)}`);
  }

  let taxCodes: Record<string, unknown> | null = null;
  if (parsed.data.defaultTaxCodes && parsed.data.defaultTaxCodes.trim() !== "") {
    try {
      const parsedJson: unknown = JSON.parse(parsed.data.defaultTaxCodes);
      if (parsedJson && typeof parsedJson === "object" && !Array.isArray(parsedJson)) {
        taxCodes = parsedJson as Record<string, unknown>;
      } else {
        redirect(`${ROUTE}?tab=settings&error=${encodeURIComponent("Tax codes must be a JSON object")}`);
      }
    } catch {
      redirect(`${ROUTE}?tab=settings&error=${encodeURIComponent("Invalid JSON in tax codes")}`);
    }
  }

  const codesJson = (taxCodes ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull;
  await db.platformTaxConfig.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      defaultBehavior: parsed.data.defaultBehavior,
      defaultRounding: parsed.data.defaultRounding,
      defaultTaxCodes: codesJson,
      updatedBy: ctx.userId,
    },
    update: {
      defaultBehavior: parsed.data.defaultBehavior,
      defaultRounding: parsed.data.defaultRounding,
      defaultTaxCodes: codesJson,
      updatedBy: ctx.userId,
    },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.tax_settings_updated",
    entityType: "PlatformTaxConfig",
    entityId: "default",
    metadata: { actor: ctx.email, behavior: parsed.data.defaultBehavior, rounding: parsed.data.defaultRounding },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=settings&ok=saved`);
}

/* ── Tax rates ─────────────────────────────────────────── */

const rateSchema = z.object({
  id: z.string().optional(),
  country: z.string().trim().toUpperCase().length(2, "Country must be a 2-letter ISO code"),
  region: z.string().trim().toUpperCase().max(8).optional().or(z.literal("")),
  label: z.string().trim().min(2).max(120),
  /** Display rate as percent, e.g. "8.75". Converted to decimal on save. */
  ratePct: z.coerce.number().min(0).max(99.9999),
  nexusThreshold: z.coerce.number().int().min(0).default(0),
  taxId: z.string().trim().max(60).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function upsertTaxRate(formData: FormData) {
  const ctx = await requirePlatformPermission("compliance.manage");
  const parsed = rateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid rate";
    redirect(`${ROUTE}?tab=config&error=${encodeURIComponent(msg)}`);
  }

  const rateDecimal = (parsed.data.ratePct / 100).toFixed(4);

  if (parsed.data.id) {
    await db.taxRate.update({
      where: { id: parsed.data.id },
      data: {
        country: parsed.data.country,
        region: parsed.data.region?.trim() || null,
        label: parsed.data.label,
        rate: rateDecimal,
        nexusThreshold: parsed.data.nexusThreshold,
        taxId: parsed.data.taxId?.trim() || null,
        notes: parsed.data.notes?.trim() || null,
      },
    });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.tax_rate_updated",
      entityType: "TaxRate",
      entityId: parsed.data.id,
      metadata: { actor: ctx.email, country: parsed.data.country, region: parsed.data.region || null, ratePct: parsed.data.ratePct },
    });
  } else {
    const created = await db.taxRate.create({
      data: {
        country: parsed.data.country,
        region: parsed.data.region?.trim() || null,
        label: parsed.data.label,
        rate: rateDecimal,
        nexusThreshold: parsed.data.nexusThreshold,
        taxId: parsed.data.taxId?.trim() || null,
        notes: parsed.data.notes?.trim() || null,
        createdById: ctx.userId,
      },
      select: { id: true },
    });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.tax_rate_created",
      entityType: "TaxRate",
      entityId: created.id,
      metadata: { actor: ctx.email, country: parsed.data.country, region: parsed.data.region || null, ratePct: parsed.data.ratePct },
    });
  }
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=config&ok=rate_saved`);
}

export async function deleteTaxRate(rateId: string) {
  const ctx = await requirePlatformPermission("compliance.manage");
  const rate = await db.taxRate.findUnique({
    where: { id: rateId },
    select: { id: true, country: true, region: true },
  });
  if (!rate) redirect(`${ROUTE}?tab=config&error=${encodeURIComponent("Rate not found")}`);
  await db.taxRate.delete({ where: { id: rateId } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.tax_rate_deleted",
    entityType: "TaxRate",
    entityId: rateId,
    metadata: { actor: ctx.email, country: rate.country, region: rate.region },
    severity: "WARNING",
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=config&ok=rate_deleted`);
}

/* ── Tax exemptions ─────────────────────────────────────── */

const exemptionSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string().min(1),
  exemptionType: z.enum(["RESALE", "GOVERNMENT", "NONPROFIT", "EDUCATION", "REVERSE_CHARGE", "OTHER"]),
  taxId: z.string().trim().max(80).optional().or(z.literal("")),
  jurisdictions: z.string().optional(), // comma-separated
  certificateUrl: z.string().trim().max(500).optional().or(z.literal("")),
  certificateName: z.string().trim().max(200).optional().or(z.literal("")),
  expiresAt: z.string().optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function upsertTaxExemption(formData: FormData) {
  const ctx = await requirePlatformPermission("compliance.manage");
  const parsed = exemptionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid exemption";
    redirect(`${ROUTE}?tab=exemptions&error=${encodeURIComponent(msg)}`);
  }
  const tenant = await db.tenant.findUnique({
    where: { id: parsed.data.tenantId },
    select: { id: true, name: true },
  });
  if (!tenant) redirect(`${ROUTE}?tab=exemptions&error=${encodeURIComponent("Tenant not found")}`);

  const expiresAt = parsed.data.expiresAt && parsed.data.expiresAt.trim() !== ""
    ? new Date(parsed.data.expiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    redirect(`${ROUTE}?tab=exemptions&error=${encodeURIComponent("Invalid expiry date")}`);
  }

  const jurisdictions = (parsed.data.jurisdictions ?? "")
    .split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);

  if (parsed.data.id) {
    await db.taxExemption.update({
      where: { id: parsed.data.id },
      data: {
        tenantId: parsed.data.tenantId,
        exemptionType: parsed.data.exemptionType,
        taxId: parsed.data.taxId?.trim() || null,
        jurisdictions,
        certificateUrl: parsed.data.certificateUrl?.trim() || null,
        certificateName: parsed.data.certificateName?.trim() || null,
        expiresAt,
        notes: parsed.data.notes?.trim() || null,
      },
    });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.tax_exemption_updated",
      entityType: "TaxExemption",
      entityId: parsed.data.id,
      metadata: { actor: ctx.email, tenantId: parsed.data.tenantId, exemptionType: parsed.data.exemptionType },
    });
  } else {
    const created = await db.taxExemption.create({
      data: {
        tenantId: parsed.data.tenantId,
        exemptionType: parsed.data.exemptionType,
        taxId: parsed.data.taxId?.trim() || null,
        jurisdictions,
        certificateUrl: parsed.data.certificateUrl?.trim() || null,
        certificateName: parsed.data.certificateName?.trim() || null,
        expiresAt,
        notes: parsed.data.notes?.trim() || null,
        createdById: ctx.userId,
      },
      select: { id: true },
    });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.tax_exemption_created",
      entityType: "TaxExemption",
      entityId: created.id,
      metadata: { actor: ctx.email, tenantId: parsed.data.tenantId, exemptionType: parsed.data.exemptionType },
    });
  }
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=exemptions&ok=saved`);
}

export async function verifyTaxExemption(exemptionId: string) {
  const ctx = await requirePlatformPermission("compliance.manage");
  const ex = await db.taxExemption.findUnique({
    where: { id: exemptionId },
    select: { id: true, tenantId: true, verifiedAt: true },
  });
  if (!ex) redirect(`${ROUTE}?tab=exemptions&error=${encodeURIComponent("Exemption not found")}`);
  await db.taxExemption.update({
    where: { id: exemptionId },
    data: ex.verifiedAt
      ? { verifiedAt: null, verifiedBy: null }   // toggle off
      : { verifiedAt: new Date(), verifiedBy: ctx.userId },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: ex.tenantId,
    action: ex.verifiedAt ? "platform.tax_exemption_unverified" : "platform.tax_exemption_verified",
    entityType: "TaxExemption",
    entityId: exemptionId,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=exemptions&ok=verified`);
}

export async function revokeTaxExemption(exemptionId: string) {
  const ctx = await requirePlatformPermission("compliance.manage");
  const ex = await db.taxExemption.findUnique({
    where: { id: exemptionId },
    select: { id: true, tenantId: true },
  });
  if (!ex) redirect(`${ROUTE}?tab=exemptions&error=${encodeURIComponent("Exemption not found")}`);
  await db.taxExemption.delete({ where: { id: exemptionId } });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: ex.tenantId,
    action: "platform.tax_exemption_revoked",
    entityType: "TaxExemption",
    entityId: exemptionId,
    metadata: { actor: ctx.email },
    severity: "WARNING",
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=exemptions&ok=revoked`);
}

/* ── Tax filings ────────────────────────────────────────── */

const filingSchema = z.object({
  id: z.string().optional(),
  jurisdiction: z.string().trim().toUpperCase().min(2).max(20),
  period: z.string().trim().min(4).max(20),
  taxableSales: z.coerce.number().int().min(0).default(0),
  taxCollected: z.coerce.number().int().min(0).default(0),
  dueAt: z.string().min(1, "Due date required"),
  submittedAt: z.string().optional().or(z.literal("")),
  externalRef: z.string().trim().max(80).optional().or(z.literal("")),
  pdfUrl: z.string().trim().max(500).optional().or(z.literal("")),
  status: z.enum(["DRAFT", "SUBMITTED", "ACCEPTED", "AMENDED", "REJECTED"]).default("DRAFT"),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function upsertTaxFiling(formData: FormData) {
  const ctx = await requirePlatformPermission("compliance.manage");
  const parsed = filingSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid filing";
    redirect(`${ROUTE}?tab=filings&error=${encodeURIComponent(msg)}`);
  }

  const dueAt = new Date(parsed.data.dueAt);
  if (Number.isNaN(dueAt.getTime())) {
    redirect(`${ROUTE}?tab=filings&error=${encodeURIComponent("Invalid due date")}`);
  }
  const submittedAt = parsed.data.submittedAt && parsed.data.submittedAt.trim() !== ""
    ? new Date(parsed.data.submittedAt) : null;
  if (submittedAt && Number.isNaN(submittedAt.getTime())) {
    redirect(`${ROUTE}?tab=filings&error=${encodeURIComponent("Invalid submitted date")}`);
  }

  if (parsed.data.id) {
    await db.taxFiling.update({
      where: { id: parsed.data.id },
      data: {
        jurisdiction: parsed.data.jurisdiction,
        period: parsed.data.period,
        taxableSales: parsed.data.taxableSales,
        taxCollected: parsed.data.taxCollected,
        dueAt,
        submittedAt,
        externalRef: parsed.data.externalRef?.trim() || null,
        pdfUrl: parsed.data.pdfUrl?.trim() || null,
        status: parsed.data.status,
        notes: parsed.data.notes?.trim() || null,
      },
    });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.tax_filing_updated",
      entityType: "TaxFiling",
      entityId: parsed.data.id,
      metadata: { actor: ctx.email, jurisdiction: parsed.data.jurisdiction, period: parsed.data.period, status: parsed.data.status },
    });
  } else {
    const created = await db.taxFiling.create({
      data: {
        jurisdiction: parsed.data.jurisdiction,
        period: parsed.data.period,
        taxableSales: parsed.data.taxableSales,
        taxCollected: parsed.data.taxCollected,
        dueAt,
        submittedAt,
        externalRef: parsed.data.externalRef?.trim() || null,
        pdfUrl: parsed.data.pdfUrl?.trim() || null,
        status: parsed.data.status,
        notes: parsed.data.notes?.trim() || null,
        createdById: ctx.userId,
      },
      select: { id: true },
    });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.tax_filing_created",
      entityType: "TaxFiling",
      entityId: created.id,
      metadata: { actor: ctx.email, jurisdiction: parsed.data.jurisdiction, period: parsed.data.period },
    });
  }
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=filings&ok=saved`);
}

export async function deleteTaxFiling(filingId: string) {
  const ctx = await requirePlatformPermission("compliance.manage");
  const f = await db.taxFiling.findUnique({
    where: { id: filingId },
    select: { id: true, jurisdiction: true, period: true },
  });
  if (!f) redirect(`${ROUTE}?tab=filings&error=${encodeURIComponent("Filing not found")}`);
  await db.taxFiling.delete({ where: { id: filingId } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.tax_filing_deleted",
    entityType: "TaxFiling",
    entityId: filingId,
    metadata: { actor: ctx.email, jurisdiction: f.jurisdiction, period: f.period },
    severity: "WARNING",
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=filings&ok=deleted`);
}
