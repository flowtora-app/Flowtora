"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";

const profileSchema = z.object({
  name: z.string().min(1).max(120),
  logoUrl: z.string().url().optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  website: z.string().url().optional().or(z.literal("")),
  taxId: z.string().max(40).optional().or(z.literal("")),
  addressLine1: z.string().max(160).optional().or(z.literal("")),
  addressLine2: z.string().max(160).optional().or(z.literal("")),
  city: z.string().max(80).optional().or(z.literal("")),
  region: z.string().max(80).optional().or(z.literal("")),
  postalCode: z.string().max(20).optional().or(z.literal("")),
  country: z.string().max(80).optional().or(z.literal("")),
  timezone: z.string().min(1).max(80),
  currency: z.string().length(3),
  // Phase 15 Slice D — brand accent applied to the customer portal + share
  // pages. Hex only (#RGB or #RRGGBB); other values rejected so we never
  // end up injecting CSS-compatible gibberish.
  brandPrimaryColor: z
    .string()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
    .optional()
    .or(z.literal("")),
  // Phase 21 Slice A — display name + reply-to for customer-facing emails.
  // We don't ever let tenants override the envelope sender because DKIM/SPF
  // are tied to our verified domain. The reply-to address is what the
  // customer's "Reply" button targets.
  emailFromName: z.string().max(120).optional().or(z.literal("")),
  emailReplyTo:  z.string().email().optional().or(z.literal("")),
  // Phase 21 Slice D — customer-facing date format.
  dateFormat:    z.enum(["ISO", "US", "EU"]).optional(),
  weekStartsOn:  z.coerce.number().int().min(0).max(6).optional(),
});

export async function saveProfile(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "tenant:manage");
  const parsed = profileSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/settings/profile?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`);
  }
  const empty = (s: string | undefined) => (s && s.length > 0 ? s : null);
  const d = parsed.data;
  await db.tenant.update({
    where: { id: ctx.tenant.id },
    data: {
      name: d.name,
      logoUrl: empty(d.logoUrl),
      phone: empty(d.phone),
      website: empty(d.website),
      taxId: empty(d.taxId),
      addressLine1: empty(d.addressLine1),
      addressLine2: empty(d.addressLine2),
      city: empty(d.city),
      region: empty(d.region),
      postalCode: empty(d.postalCode),
      country: empty(d.country),
      timezone: d.timezone,
      currency: d.currency.toUpperCase(),
      brandPrimaryColor: empty(d.brandPrimaryColor),
      emailFromName: empty(d.emailFromName),
      emailReplyTo:  empty(d.emailReplyTo),
      ...(d.dateFormat   ? { dateFormat:   d.dateFormat }   : {}),
      ...(d.weekStartsOn !== undefined ? { weekStartsOn: d.weekStartsOn } : {}),
    },
  });
  await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "settings.profile" });
  revalidatePath(`/t/${slug}/settings/profile`);
}

const numberingSchema = z.object({
  quoteNumberPrefix: z.string().max(8),
  orderNumberPrefix: z.string().max(8),
  invoiceNumberPrefix: z.string().max(8),
});

export async function saveNumbering(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "tenant:manage");
  const parsed = numberingSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`/t/${slug}/settings/numbering?error=invalid`);
  await db.tenant.update({ where: { id: ctx.tenant.id }, data: parsed.data });
  await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "settings.numbering" });
  revalidatePath(`/t/${slug}/settings/numbering`);
}

const financialSchema = z.object({
  defaultTaxRate: z.coerce.number().min(0).max(1),
  defaultDepositPercent: z.coerce.number().int().min(0).max(100),
  defaultPaymentTerms: z.enum(["DUE_ON_RECEIPT", "NET_15", "NET_30", "NET_45", "NET_60"]),
  proofRequiresApproval: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});

export async function saveFinancial(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "tenant:manage");
  const parsed = financialSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`/t/${slug}/settings/financial?error=invalid`);
  await db.tenant.update({ where: { id: ctx.tenant.id }, data: parsed.data });
  await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "settings.financial" });
  revalidatePath(`/t/${slug}/settings/financial`);
}

// ────────────────────────────────────────────────────────────
// Phase 21 Slice B — document output customization
// ────────────────────────────────────────────────────────────

const documentsSchema = z.object({
  quoteFooterText:     z.string().max(2000).optional().or(z.literal("")),
  invoiceFooterText:   z.string().max(2000).optional().or(z.literal("")),
  paymentInstructions: z.string().max(2000).optional().or(z.literal("")),
});

export async function saveDocuments(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "tenant:manage");
  const parsed = documentsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/settings/documents?error=${encodeURIComponent("Copy is too long (max 2000 chars).")}`);
  }
  const empty = (s: string | undefined) => (s && s.trim().length > 0 ? s.trim() : null);
  await db.tenant.update({
    where: { id: ctx.tenant.id },
    data: {
      quoteFooterText:     empty(parsed.data.quoteFooterText),
      invoiceFooterText:   empty(parsed.data.invoiceFooterText),
      paymentInstructions: empty(parsed.data.paymentInstructions),
    },
  });
  await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "settings.documents" });
  revalidatePath(`/t/${slug}/settings/documents`);
}

// ────────────────────────────────────────────────────────────
// Phase 13 — workflow / approval rules
// ────────────────────────────────────────────────────────────

const workflowSchema = z.object({
  // 0 disables each threshold. Keeping them as plain numbers (not nullable)
  // because "disabled" is just 0 — easier to reason about than null/0/false.
  approvalDiscountThresholdPct: z.coerce.number().int().min(0).max(100),
  approvalLargeJobThreshold:    z.coerce.number().min(0).max(10_000_000),
  requireProofBeforeProduction:   z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  requireDepositBeforeProduction: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  requireDepositBeforeInstall:    z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  // Phase 13 — rush surcharge, as a percent of the quote subtotal at apply-time.
  // 0 disables the feature (the button won't show a suggested amount).
  rushFeePercent:               z.coerce.number().int().min(0).max(100),
});

export async function saveWorkflow(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "tenant:manage");
  const parsed = workflowSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`/t/${slug}/settings/workflow?error=invalid`);
  await db.tenant.update({ where: { id: ctx.tenant.id }, data: parsed.data });
  await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "settings.workflow" });
  revalidatePath(`/t/${slug}/settings/workflow`);
}

// ────────────────────────────────────────────────────────────
// Phase 22 Slice C + D — automation defaults
// ────────────────────────────────────────────────────────────
//
// House-wide fallbacks: when a new quote/order/install lands without an
// explicit owner or checklist, these defaults kick in so staff don't have
// to keep re-selecting the same "who runs sales" / "standard install
// checklist" fields every time.

const automationSchema = z.object({
  defaultSalesRepId:                optionalStringOrEmpty(),
  defaultProductionManagerId:       optionalStringOrEmpty(),
  defaultOrderChecklistTemplateId:  optionalStringOrEmpty(),
  defaultInstallChecklistTemplateId: optionalStringOrEmpty(),
});

function optionalStringOrEmpty() {
  return z.string().max(64).optional().or(z.literal(""));
}

export async function saveAutomation(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "tenant:manage");
  const parsed = automationSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`/t/${slug}/settings/automation?error=invalid`);
  const d = parsed.data;
  const empty = (s: string | undefined) => (s && s.length > 0 ? s : null);

  // Validate each referenced user / template belongs to this tenant. A
  // stale pick (deleted member) silently resolves to null rather than
  // erroring — users can reselect without losing the rest of the form.
  const [sales, prod, orderTpl, installTpl] = await Promise.all([
    empty(d.defaultSalesRepId)
      ? db.membership.findFirst({
          where: { tenantId: ctx.tenant.id, userId: d.defaultSalesRepId!, status: "ACTIVE" },
          select: { userId: true },
        })
      : null,
    empty(d.defaultProductionManagerId)
      ? db.membership.findFirst({
          where: { tenantId: ctx.tenant.id, userId: d.defaultProductionManagerId!, status: "ACTIVE" },
          select: { userId: true },
        })
      : null,
    empty(d.defaultOrderChecklistTemplateId)
      ? db.checklistTemplate.findFirst({
          where: { id: d.defaultOrderChecklistTemplateId!, tenantId: ctx.tenant.id, kind: "ORDER", active: true },
          select: { id: true },
        })
      : null,
    empty(d.defaultInstallChecklistTemplateId)
      ? db.checklistTemplate.findFirst({
          where: { id: d.defaultInstallChecklistTemplateId!, tenantId: ctx.tenant.id, kind: "INSTALL", active: true },
          select: { id: true },
        })
      : null,
  ]);

  await db.tenant.update({
    where: { id: ctx.tenant.id },
    data: {
      defaultSalesRepId:                 sales?.userId ?? null,
      defaultProductionManagerId:        prod?.userId ?? null,
      defaultOrderChecklistTemplateId:   orderTpl?.id ?? null,
      defaultInstallChecklistTemplateId: installTpl?.id ?? null,
    },
  });

  await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "settings.automation" });
  revalidatePath(`/t/${slug}/settings/automation`);
  redirect(`/t/${slug}/settings/automation?saved=1`);
}
