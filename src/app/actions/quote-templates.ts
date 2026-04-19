"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { computeItemSubtotal, computeQuoteTotals } from "@/lib/quotes";

// Phase 9 — Quote templates. Snapshot-style starting points for recurring
// jobs. A template stores its own sections + item snapshots; instantiating
// a template creates a fresh Quote/QuoteSection/QuoteItem tree that's
// fully decoupled from the template thereafter.

const optionalString = z.string().max(200).optional().or(z.literal(""));
const optionalLong = z.string().max(4000).optional().or(z.literal(""));
const empty = (s: string | undefined) => (s && s.length > 0 ? s : null);
const emptyNum = (s: string | undefined) => {
  if (!s || s.length === 0) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

// ────────────────────────────────────────────────────────────
// Create / update / delete
// ────────────────────────────────────────────────────────────

const templateSchema = z.object({
  name:          z.string().min(1).max(120),
  description:   optionalLong,
  customerNote:  optionalLong,
  terms:         optionalLong,
  discountType:  z.enum(["NONE", "FIXED", "PERCENT"]),
  discountValue: z.string().optional().or(z.literal("")),
  depositType:   z.enum(["NONE", "FIXED", "PERCENT"]),
  depositValue:  z.string().optional().or(z.literal("")),
  active:        optionalString,
});

export async function createQuoteTemplate(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "quotes:manage");
  const parsed = templateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/quotes/templates/new?error=${encodeURIComponent("Template name required.")}`);
  }
  const d = parsed.data;

  const tpl = await db.quoteTemplate.create({
    data: {
      tenantId:     ctx.tenant.id,
      name:         d.name,
      description:  empty(d.description) ?? null,
      customerNote: empty(d.customerNote) ?? null,
      terms:        empty(d.terms) ?? null,
      discountType: d.discountType,
      discountValue: (emptyNum(d.discountValue) ?? 0) as never,
      depositType:  d.depositType,
      depositValue: (emptyNum(d.depositValue) ?? 0) as never,
      active:       d.active === "on" || d.active === "true",
    },
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "quote_template.created",
    entityType: "QuoteTemplate",
    entityId:   tpl.id,
    metadata:   { name: tpl.name },
  });

  redirect(`/t/${slug}/quotes/templates/${tpl.id}`);
}

export async function updateQuoteTemplate(slug: string, templateId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "quotes:manage");
  const existing = await db.quoteTemplate.findFirst({
    where:  { id: templateId, tenantId: ctx.tenant.id },
    select: { id: true },
  });
  if (!existing) redirect(`/t/${slug}/quotes/templates`);

  const parsed = templateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/quotes/templates/${templateId}?error=${encodeURIComponent("Template name required.")}`);
  }
  const d = parsed.data;

  await db.quoteTemplate.update({
    where: { id: templateId },
    data: {
      name:         d.name,
      description:  empty(d.description) ?? null,
      customerNote: empty(d.customerNote) ?? null,
      terms:        empty(d.terms) ?? null,
      discountType: d.discountType,
      discountValue: (emptyNum(d.discountValue) ?? 0) as never,
      depositType:  d.depositType,
      depositValue: (emptyNum(d.depositValue) ?? 0) as never,
      active:       d.active === "on" || d.active === "true",
    },
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "quote_template.updated",
    entityType: "QuoteTemplate",
    entityId:   templateId,
  });

  revalidatePath(`/t/${slug}/quotes/templates/${templateId}`);
  revalidatePath(`/t/${slug}/quotes/templates`);
}

export async function deleteQuoteTemplate(slug: string, templateId: string) {
  const ctx = await requirePermission(slug, "quotes:manage");
  const existing = await db.quoteTemplate.findFirst({
    where:  { id: templateId, tenantId: ctx.tenant.id },
    select: { id: true, name: true },
  });
  if (!existing) redirect(`/t/${slug}/quotes/templates`);

  await db.quoteTemplate.delete({ where: { id: templateId } });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "quote_template.deleted",
    entityType: "QuoteTemplate",
    entityId:   templateId,
    metadata:   { name: existing.name },
  });

  revalidatePath(`/t/${slug}/quotes/templates`);
  redirect(`/t/${slug}/quotes/templates`);
}

// ────────────────────────────────────────────────────────────
// Template sections
// ────────────────────────────────────────────────────────────

const sectionSchema = z.object({
  title:       z.string().min(1).max(120),
  description: optionalLong,
});

export async function addTemplateSection(slug: string, templateId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "quotes:manage");
  const existing = await db.quoteTemplate.findFirst({
    where:  { id: templateId, tenantId: ctx.tenant.id },
    select: { id: true },
  });
  if (!existing) redirect(`/t/${slug}/quotes/templates`);

  const parsed = sectionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/quotes/templates/${templateId}?error=${encodeURIComponent("Section title required.")}`);
  }

  const last = await db.quoteTemplateSection.findFirst({
    where:   { templateId },
    orderBy: { sortOrder: "desc" },
  });
  const sortOrder = (last?.sortOrder ?? 0) + 1;

  await db.quoteTemplateSection.create({
    data: {
      templateId,
      title:       parsed.data.title,
      description: empty(parsed.data.description) ?? null,
      sortOrder,
    },
  });

  revalidatePath(`/t/${slug}/quotes/templates/${templateId}`);
}

export async function deleteTemplateSection(slug: string, sectionId: string) {
  const ctx = await requirePermission(slug, "quotes:manage");
  const section = await db.quoteTemplateSection.findFirst({
    where:  { id: sectionId, template: { tenantId: ctx.tenant.id } },
    select: { id: true, templateId: true },
  });
  if (!section) redirect(`/t/${slug}/quotes/templates`);

  // Items in this section fall into the un-grouped band via SetNull.
  await db.quoteTemplateSection.delete({ where: { id: sectionId } });
  revalidatePath(`/t/${slug}/quotes/templates/${section.templateId}`);
}

// ────────────────────────────────────────────────────────────
// Template items
// ────────────────────────────────────────────────────────────

const addItemSchema = z.object({
  productId: optionalString,
  sectionId: optionalString,
  // Ad-hoc fallback
  name:         optionalString,
  pricingModel: z.enum([
    "FIXED", "PER_UNIT", "PER_SQFT", "PER_LINEAR_FT", "LABOR_HOURLY", "CUSTOM_QUOTE",
  ]).optional(),
  basePrice:    z.string().optional().or(z.literal("")),
});

export async function addTemplateItem(slug: string, templateId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "quotes:manage");
  const tpl = await db.quoteTemplate.findFirst({
    where:  { id: templateId, tenantId: ctx.tenant.id },
    select: { id: true },
  });
  if (!tpl) redirect(`/t/${slug}/quotes/templates`);

  const parsed = addItemSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/quotes/templates/${templateId}?error=${encodeURIComponent("Invalid line.")}`);
  }
  const d = parsed.data;

  const sectionId = empty(d.sectionId);
  const last = await db.quoteTemplateItem.findFirst({
    where:   { templateId },
    orderBy: { sortOrder: "desc" },
  });
  const sortOrder = (last?.sortOrder ?? 0) + 1;

  // Path A — from catalog. We snapshot name/pricing/base/unit/taxable/waste
  // and cost onto the template so it's stable even if the product changes.
  if (d.productId) {
    const product = await db.product.findFirst({
      where: {
        id: d.productId,
        OR: [
          { tenantId: ctx.tenant.id },
          { shared: true }, // franchise-inherited shared products
        ],
      },
    });
    if (!product) {
      redirect(`/t/${slug}/quotes/templates/${templateId}?error=${encodeURIComponent("Product not found.")}`);
    }
    await db.quoteTemplateItem.create({
      data: {
        templateId,
        sectionId,
        productId:      product.id,
        name:           product.name,
        description:    product.description,
        pricingModel:   product.pricingModel,
        basePrice:      product.basePrice,
        unit:           product.unit,
        taxable:        product.taxable,
        wasteFactorPct: product.wasteFactorPct,
        costSnapshot:   product.cost,
        sortOrder,
      },
    });
  } else {
    // Path B — ad-hoc line. Name + pricing model + base price are the minimum.
    if (!d.name || !d.pricingModel) {
      redirect(`/t/${slug}/quotes/templates/${templateId}?error=${encodeURIComponent("Pick a product or fill in the ad-hoc row.")}`);
    }
    const base = Math.max(0, emptyNum(d.basePrice) ?? 0);
    await db.quoteTemplateItem.create({
      data: {
        templateId,
        sectionId,
        name:         d.name,
        pricingModel: d.pricingModel,
        basePrice:    base as never,
        sortOrder,
      },
    });
  }

  revalidatePath(`/t/${slug}/quotes/templates/${templateId}`);
}

export async function removeTemplateItem(slug: string, itemId: string) {
  const ctx = await requirePermission(slug, "quotes:manage");
  const item = await db.quoteTemplateItem.findFirst({
    where:  { id: itemId, template: { tenantId: ctx.tenant.id } },
    select: { id: true, templateId: true },
  });
  if (!item) redirect(`/t/${slug}/quotes/templates`);

  await db.quoteTemplateItem.delete({ where: { id: itemId } });
  revalidatePath(`/t/${slug}/quotes/templates/${item.templateId}`);
}

// ────────────────────────────────────────────────────────────
// Save existing quote as a template
// ────────────────────────────────────────────────────────────

const saveAsTemplateSchema = z.object({
  name:        z.string().min(1).max(120),
  description: optionalLong,
});

export async function saveQuoteAsTemplate(slug: string, quoteId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "quotes:manage");
  const q = await db.quote.findFirst({
    where: { id: quoteId, tenantId: ctx.tenant.id },
    include: { items: true, sections: true },
  });
  if (!q) redirect(`/t/${slug}/quotes`);

  const parsed = saveAsTemplateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/quotes/${quoteId}?error=${encodeURIComponent("Template name required.")}`);
  }
  const d = parsed.data;

  const tpl = await db.$transaction(async (tx) => {
    const tpl = await tx.quoteTemplate.create({
      data: {
        tenantId:     ctx.tenant.id,
        name:         d.name,
        description:  empty(d.description) ?? null,
        customerNote: q.customerNote,
        terms:        q.terms,
        discountType: q.discountType,
        discountValue: q.discountValue,
        depositType:  q.depositType,
        depositValue: q.depositValue,
        active:       true,
      },
    });

    // Clone sections and build id remap.
    const sectionIdMap = new Map<string, string>();
    for (const s of q.sections) {
      const ns = await tx.quoteTemplateSection.create({
        data: {
          templateId:  tpl.id,
          title:       s.title,
          description: s.description,
          sortOrder:   s.sortOrder,
        },
      });
      sectionIdMap.set(s.id, ns.id);
    }

    if (q.items.length > 0) {
      await tx.quoteTemplateItem.createMany({
        data: q.items.map((it) => ({
          templateId:      tpl.id,
          sectionId:       it.sectionId ? sectionIdMap.get(it.sectionId) ?? null : null,
          productId:       it.productId,
          name:            it.name,
          description:     it.description,
          pricingModel:    it.pricingModel,
          basePrice:       it.basePrice,
          unit:            it.unit,
          taxable:         it.taxable,
          quantity:        it.quantity,
          width:           it.width,
          height:          it.height,
          length:          it.length,
          hours:           it.hours,
          manualPrice:     it.manualPrice,
          selectedOptions: (it.selectedOptions ?? []) as Prisma.InputJsonValue,
          quantityTiers:   (it.quantityTiers   ?? []) as Prisma.InputJsonValue,
          wasteFactorPct:  it.wasteFactorPct,
          costSnapshot:    it.costSnapshot,
          isOptional:      it.isOptional,
          sortOrder:       it.sortOrder,
        })),
      });
    }

    return tpl;
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "quote_template.saved_from_quote",
    entityType: "QuoteTemplate",
    entityId:   tpl.id,
    metadata:   { sourceQuoteId: quoteId, sourceQuoteNumber: q.number },
  });

  redirect(`/t/${slug}/quotes/templates/${tpl.id}`);
}

// ────────────────────────────────────────────────────────────
// Create a quote from a template
// ────────────────────────────────────────────────────────────

const fromTemplateSchema = z.object({
  templateId:    z.string().min(1),
  customerId:    z.string().min(1),
  expiresInDays: z.string().optional().or(z.literal("")),
});

export async function createQuoteFromTemplate(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "quotes:manage");
  const parsed = fromTemplateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/quotes/new?error=${encodeURIComponent("Pick a template and a customer.")}`);
  }

  const { templateId, customerId, expiresInDays } = parsed.data;

  const [tpl, customer, tenant] = await Promise.all([
    db.quoteTemplate.findFirst({
      where: { id: templateId, tenantId: ctx.tenant.id, active: true },
      include: { items: true, sections: true },
    }),
    db.customer.findFirst({ where: { id: customerId, tenantId: ctx.tenant.id } }),
    db.tenant.findUnique({
      where:  { id: ctx.tenant.id },
      select: { defaultTaxRate: true },
    }),
  ]);
  if (!tpl || !customer) {
    redirect(`/t/${slug}/quotes/new?error=${encodeURIComponent("Template or customer not found.")}`);
  }

  // Determine expiry (matches createQuote semantics).
  const days = emptyNum(expiresInDays);
  const expiresAt = days != null && days > 0
    ? new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    : null;

  const quote = await db.$transaction(async (tx) => {
    const t = await tx.tenant.update({
      where: { id: ctx.tenant.id },
      data:  { quoteLastNumber: { increment: 1 } },
      select: { quoteNumberPrefix: true, quoteLastNumber: true },
    });
    const number = `${t.quoteNumberPrefix}${t.quoteLastNumber}`;

    const q = await tx.quote.create({
      data: {
        tenantId:      ctx.tenant.id,
        customerId:    customer.id,
        locationId:    customer.locationId,
        number,
        status:        "DRAFT",
        expiresAt,
        taxRate:       (tenant?.defaultTaxRate ?? 0) as never,
        discountType:  tpl.discountType,
        discountValue: tpl.discountValue,
        depositType:   tpl.depositType,
        depositValue:  tpl.depositValue,
        customerNote:  tpl.customerNote,
        terms:         tpl.terms,
        createdBy:     ctx.userId,
        salesRepId:    ctx.userId,
      },
    });

    const sectionIdMap = new Map<string, string>();
    for (const s of tpl.sections) {
      const ns = await tx.quoteSection.create({
        data: {
          quoteId:     q.id,
          title:       s.title,
          description: s.description,
          sortOrder:   s.sortOrder,
        },
      });
      sectionIdMap.set(s.id, ns.id);
    }

    // Create quote items and compute their subtotals in a single pass.
    // We createMany to keep round-trips low, then update subtotals after.
    if (tpl.items.length > 0) {
      // Pre-compute subtotals using the same rules as live quote items.
      const itemsWithSubtotal = tpl.items.map((it) => {
        const subtotal = computeItemSubtotal({
          pricingModel:    it.pricingModel,
          basePrice:       it.basePrice,
          quantity:        it.quantity,
          width:           it.width,
          height:          it.height,
          length:          it.length,
          hours:           it.hours,
          manualPrice:     it.manualPrice,
          selectedOptions: it.selectedOptions,
          quantityTiers:   it.quantityTiers,
          wasteFactorPct:  it.wasteFactorPct,
        });
        return { it, subtotal };
      });

      await tx.quoteItem.createMany({
        data: itemsWithSubtotal.map(({ it, subtotal }) => ({
          quoteId:         q.id,
          productId:       it.productId,
          sectionId:       it.sectionId ? sectionIdMap.get(it.sectionId) ?? null : null,
          name:            it.name,
          description:     it.description,
          pricingModel:    it.pricingModel,
          basePrice:       it.basePrice,
          unit:            it.unit,
          taxable:         it.taxable,
          quantity:        it.quantity,
          width:           it.width,
          height:          it.height,
          length:          it.length,
          hours:           it.hours,
          manualPrice:     it.manualPrice,
          selectedOptions: (it.selectedOptions ?? []) as Prisma.InputJsonValue,
          quantityTiers:   (it.quantityTiers   ?? []) as Prisma.InputJsonValue,
          wasteFactorPct:  it.wasteFactorPct,
          costSnapshot:    it.costSnapshot,
          isOptional:      it.isOptional,
          subtotal:        subtotal as never,
          sortOrder:       it.sortOrder,
        })),
      });
    }

    // Recompute rolled-up totals (handles optional split + deposit + tax).
    const withItems = await tx.quote.findUnique({
      where:   { id: q.id },
      include: { items: true },
    });
    if (withItems) {
      const totals = computeQuoteTotals(
        withItems.items.map((it) => ({
          subtotal: it.subtotal, taxable: it.taxable, isOptional: it.isOptional,
        })),
        {
          discountType:  withItems.discountType,
          discountValue: Number(withItems.discountValue),
          taxRate:       Number(withItems.taxRate),
          depositType:   withItems.depositType,
          depositValue:  Number(withItems.depositValue),
        },
      );
      await tx.quote.update({
        where: { id: q.id },
        data: {
          subtotal:         totals.subtotal as never,
          discountAmount:   totals.discountAmount as never,
          taxAmount:        totals.taxAmount as never,
          total:            totals.total as never,
          optionalSubtotal: totals.optionalSubtotal as never,
          depositAmount:    totals.depositAmount as never,
        },
      });
    }

    return q;
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "quote.created_from_template",
    entityType: "Quote",
    entityId:   quote.id,
    metadata:   { templateId: tpl.id, templateName: tpl.name, customerId: customer.id },
  });

  redirect(`/t/${slug}/quotes/${quote.id}`);
}
