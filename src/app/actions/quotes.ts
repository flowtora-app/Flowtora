"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma, QuoteItem, QuoteStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
// Phase 15 Slice E — unified customer-email send helper (template + send +
// timeline in one call). Used for the "quote sent" touchpoint so customers
// see a real body preview in the portal activity feed.
import { sendCustomerEmail, quoteReadyEmail } from "@/lib/customer-emails";
import { appOrigin } from "@/lib/share";
import { formatMoney, formatDate } from "@/lib/format";
import { computeItemSubtotal, computeQuoteTotals, parseSelectedOptions, statusLabel, type SelectedOption } from "@/lib/quotes";
import { pricingMeta } from "@/lib/pricing";
import { createOrderFromQuoteInTx } from "@/app/actions/orders";
import { quoteSendBlockers, loadApprovalRules } from "@/lib/approvals";
import { notifyApprovers } from "@/lib/approval-requests";
import { getGroupContext } from "@/lib/franchise";
import { generateToken } from "@/lib/token";

const optionalString = z.string().max(200).optional().or(z.literal(""));
const optionalLong = z.string().max(4000).optional().or(z.literal(""));
const empty = (s: string | undefined) => (s && s.length > 0 ? s : null);
const emptyNum = (s: string | undefined) => {
  if (!s || s.length === 0) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

async function assertQuoteInTenant(tenantId: string, quoteId: string) {
  const q = await db.quote.findFirst({
    where: { id: quoteId, tenantId },
    select: {
      id: true, status: true, customerId: true,
      // Needed by the Phase 13 send-gate — loaded up-front so the transition
      // check doesn't need a second round-trip for the common case.
      discountType: true, discountValue: true,
      subtotal: true, total: true,
      approvedToSendAt: true,
    },
  });
  return q;
}

// Recomputes stored subtotal/tax/total for a quote based on its current items.
// Call after any item change or meta change (discount/tax/deposit/optional).
async function recomputeQuoteTotals(quoteId: string) {
  const q = await db.quote.findUnique({
    where: { id: quoteId },
    include: { items: true },
  });
  if (!q) return;
  const totals = computeQuoteTotals(
    q.items.map((it) => ({
      subtotal: it.subtotal,
      taxable: it.taxable,
      isOptional: it.isOptional,
    })),
    {
      discountType: q.discountType,
      discountValue: Number(q.discountValue),
      taxRate: Number(q.taxRate),
      depositType: q.depositType,
      depositValue: Number(q.depositValue),
    },
  );
  await db.quote.update({
    where: { id: quoteId },
    data: {
      subtotal: totals.subtotal as never,
      discountAmount: totals.discountAmount as never,
      taxAmount: totals.taxAmount as never,
      total: totals.total as never,
      optionalSubtotal: totals.optionalSubtotal as never,
      depositAmount: totals.depositAmount as never,
    },
  });
}

// ────────────────────────────────────────────────────────────
// Create / delete
// ────────────────────────────────────────────────────────────

const createSchema = z.object({
  customerId: z.string().min(1),
  expiresInDays: z.string().optional().or(z.literal("")),
  salesRepId: optionalString,
});

export async function createQuote(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "quotes:manage");
  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/quotes/new?error=${encodeURIComponent("Pick a customer first.")}`);
  }
  const customer = await db.customer.findFirst({
    where: { id: parsed.data.customerId, tenantId: ctx.tenant.id },
  });
  if (!customer) {
    redirect(`/t/${slug}/quotes/new?error=${encodeURIComponent("Customer not found.")}`);
  }

  // Optional sales rep — verify membership exists in this tenant.
  let salesRepId: string | null = null;
  const repId = empty(parsed.data.salesRepId);
  if (repId) {
    const m = await db.membership.findFirst({
      where: { tenantId: ctx.tenant.id, userId: repId, status: "ACTIVE" },
    });
    if (m) salesRepId = repId;
  }

  const days = emptyNum(parsed.data.expiresInDays);
  const expiresAt = days != null && days > 0
    ? new Date(Date.now() + days * 86_400_000)
    : null;

  // Phase 13 — pre-fill PERCENT discount from the customer's default, if set.
  // Stays editable on the quote detail page; this is just a convenience so
  // repeat customers don't have to be re-keyed every time.
  const customerDefaultPct = Math.min(100, Math.max(0, customer.defaultDiscountPct ?? 0));

  // Atomic number bump + quote create.
  const quote = await db.$transaction(async (tx) => {
    const tenant = await tx.tenant.update({
      where: { id: ctx.tenant.id },
      data: { quoteLastNumber: { increment: 1 } },
      select: {
        quoteNumberPrefix: true,
        quoteLastNumber:   true,
        defaultTaxRate:    true,
        // Phase 22 Slice C — auto-assignment fallback. Only read here; the
        // fallback cascade is explicit → tenant default → creator so shops
        // that haven't configured a default keep the original behavior.
        defaultSalesRepId: true,
      },
    });
    const number = `${tenant.quoteNumberPrefix}${tenant.quoteLastNumber}`;
    // Phase 22 Slice C — verify the tenant's configured default sales rep is
    // still an active member inside the transaction. If not, fall through to
    // the creator rather than persisting a dangling userId.
    let resolvedSalesRepId = salesRepId;
    if (!resolvedSalesRepId && tenant.defaultSalesRepId) {
      const m = await tx.membership.findFirst({
        where: { tenantId: ctx.tenant.id, userId: tenant.defaultSalesRepId, status: "ACTIVE" },
        select: { userId: true },
      });
      if (m) resolvedSalesRepId = m.userId;
    }
    return tx.quote.create({
      data: {
        tenantId: ctx.tenant.id,
        customerId: customer.id,
        // Phase 15 — inherit the customer's branch so branch reporting
        // works out of the box. Rep can re-point later if the work is
        // being built at a different shop.
        locationId: customer.locationId,
        number,
        status: "DRAFT",
        expiresAt,
        taxRate: tenant.defaultTaxRate as never,
        discountType: customerDefaultPct > 0 ? "PERCENT" : "NONE",
        discountValue: (customerDefaultPct > 0 ? customerDefaultPct : 0) as never,
        createdBy: ctx.userId,
        salesRepId: resolvedSalesRepId ?? ctx.userId,
      },
    });
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "quote.created",
    entityType: "Quote",
    entityId: quote.id,
    metadata: { number: quote.number, customerId: customer.id },
  });

  revalidatePath(`/t/${slug}/quotes`);
  redirect(`/t/${slug}/quotes/${quote.id}`);
}

export async function deleteQuote(slug: string, quoteId: string) {
  const ctx = await requirePermission(slug, "quotes:manage");
  const existing = await assertQuoteInTenant(ctx.tenant.id, quoteId);
  if (!existing) redirect(`/t/${slug}/quotes`);
  if (existing.status === "APPROVED") {
    // Approved quotes are used downstream (orders) — don't let them vanish silently.
    redirect(`/t/${slug}/quotes/${quoteId}?error=${encodeURIComponent("Can't delete an approved quote.")}`);
  }
  await db.quote.delete({ where: { id: quoteId } });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "quote.deleted",
    entityType: "Quote",
    entityId: quoteId,
  });
  redirect(`/t/${slug}/quotes`);
}

// ────────────────────────────────────────────────────────────
// Quote meta (expires, discount, tax, notes, sales rep, customer note, terms)
// ────────────────────────────────────────────────────────────

const metaSchema = z.object({
  expiresAt: optionalString, // YYYY-MM-DD
  salesRepId: optionalString,
  discountType: z.enum(["NONE", "FIXED", "PERCENT"]).default("NONE"),
  discountValue: z.string().optional().or(z.literal("")),
  taxRatePercent: z.string().optional().or(z.literal("")), // user enters %, we store fraction
  notes: optionalLong,
  customerNote: optionalLong,
  terms: optionalLong,
});

export async function updateQuoteMeta(slug: string, quoteId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "quotes:manage");
  const existing = await assertQuoteInTenant(ctx.tenant.id, quoteId);
  if (!existing) redirect(`/t/${slug}/quotes`);

  // Partial-update tolerant: only apply fields that the submitted form
  // actually carries. Lets the detail page split meta across tabbed forms
  // (Details / Pricing / Notes) without each tab clobbering the others.
  const parsed = metaSchema.partial().safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`/t/${slug}/quotes/${quoteId}?error=${encodeURIComponent("Invalid input")}`);

  const d = parsed.data;
  const data: Prisma.QuoteUpdateInput = {};

  if (formData.has("expiresAt")) {
    data.expiresAt = d.expiresAt ? new Date(d.expiresAt) : null;
  }
  if (formData.has("salesRepId")) {
    const repId = empty(d.salesRepId);
    let salesRepId: string | null = null;
    if (repId) {
      const m = await db.membership.findFirst({
        where: { tenantId: ctx.tenant.id, userId: repId, status: "ACTIVE" },
      });
      if (m) salesRepId = repId;
    }
    data.salesRepId = salesRepId;
  }
  if (formData.has("discountType")) {
    data.discountType = d.discountType ?? "NONE";
  }
  if (formData.has("discountValue") || formData.has("discountType")) {
    const effectiveType = (formData.get("discountType") as string | null) ?? existing.discountType;
    const discountValue = effectiveType === "NONE" ? 0 : (emptyNum(d.discountValue) ?? 0);
    data.discountValue = discountValue as never;
  }
  if (formData.has("taxRatePercent")) {
    const taxRate = d.taxRatePercent && d.taxRatePercent.length > 0
      ? Math.max(0, Number(d.taxRatePercent)) / 100
      : 0;
    data.taxRate = (Number.isFinite(taxRate) ? taxRate : 0) as never;
  }
  if (formData.has("notes")) data.notes = empty(d.notes);
  if (formData.has("customerNote")) data.customerNote = empty(d.customerNote);
  if (formData.has("terms")) data.terms = empty(d.terms);

  await db.quote.update({ where: { id: quoteId }, data });

  await recomputeQuoteTotals(quoteId);
  revalidatePath(`/t/${slug}/quotes/${quoteId}`);
}

// ────────────────────────────────────────────────────────────
// Line items
// ────────────────────────────────────────────────────────────

const addItemSchema = z.object({
  productId: optionalString,
  // For blank/ad-hoc lines:
  name: optionalString,
  pricingModel: z.enum(["FIXED", "PER_UNIT", "PER_SQFT", "PER_LINEAR_FT", "LABOR_HOURLY", "CUSTOM_QUOTE"]).optional(),
  basePrice: z.string().optional().or(z.literal("")),
});

export async function addQuoteItem(slug: string, quoteId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "quotes:manage");
  const existing = await assertQuoteInTenant(ctx.tenant.id, quoteId);
  if (!existing) redirect(`/t/${slug}/quotes`);

  const parsed = addItemSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const productId = empty(parsed.data.productId);
  const last = await db.quoteItem.findFirst({
    where: { quoteId },
    orderBy: { sortOrder: "desc" },
  });
  const sortOrder = (last?.sortOrder ?? 0) + 1;

  let data: Prisma.QuoteItemUncheckedCreateInput;
  if (productId) {
    // Phase 15 Slice D — accept either a tenant-owned product or an inherited
    // shared product from the parent group root. Snapshot semantics make this
    // safe: every field copied onto the line item lives on the quote forever,
    // so a later parent edit (or even unsharing) doesn't reach back into
    // already-quoted work.
    const groupCtxQ = await getGroupContext(ctx.tenant.id);
    const p = await db.product.findFirst({
      where: {
        id: productId,
        OR: [
          { tenantId: ctx.tenant.id },
          ...(groupCtxQ.parentTenantId
            ? [{ tenantId: groupCtxQ.parentTenantId, shared: true } as const]
            : []),
        ],
      },
      include: { quantityTiers: { orderBy: [{ minQuantity: "asc" }] } },
    });
    if (!p) return;
    // Snapshot tiers onto the line — catalog edits after this point must not
    // retroactively reprice this quote.
    const tierSnapshot = p.quantityTiers.map((t) => ({
      minQuantity: t.minQuantity,
      pricePerUnit: Number(t.pricePerUnit),
    }));
    data = {
      quoteId,
      productId: p.id,
      name: p.name,
      description: p.description,
      pricingModel: p.pricingModel,
      basePrice: p.basePrice,
      unit: p.unit,
      taxable: p.taxable,
      quantity: p.pricingModel !== "FIXED" && p.pricingModel !== "CUSTOM_QUOTE" ? 1 : null,
      selectedOptions: [] as never,
      quantityTiers: tierSnapshot as never,
      // Phase 18 Slice F — snapshot waste factor + cost so pricing + margin
      // on this line are immune to later catalog edits.
      wasteFactorPct: p.wasteFactorPct as never,
      costSnapshot: (p.cost ?? null) as never,
      subtotal: 0 as never,
      sortOrder,
    };
  } else {
    // Ad-hoc line
    const name = empty(parsed.data.name);
    if (!name) return;
    const pricingModel = parsed.data.pricingModel ?? "FIXED";
    const basePrice = emptyNum(parsed.data.basePrice) ?? 0;
    data = {
      quoteId,
      productId: null,
      name,
      pricingModel,
      basePrice: basePrice as never,
      taxable: true,
      quantity: pricingModel !== "FIXED" && pricingModel !== "CUSTOM_QUOTE" ? 1 : null,
      selectedOptions: [] as never,
      quantityTiers: [] as never,
      subtotal: 0 as never,
      sortOrder,
    };
  }

  const created = await db.quoteItem.create({ data });

  // Compute subtotal with defaults.
  const subtotal = computeItemSubtotal(created);
  await db.quoteItem.update({
    where: { id: created.id },
    data: { subtotal: subtotal as never },
  });

  await recomputeQuoteTotals(quoteId);
  revalidatePath(`/t/${slug}/quotes/${quoteId}`);
}

const updateItemSchema = z.object({
  name: z.string().min(1).max(200),
  description: optionalLong,
  basePrice: z.string().optional().or(z.literal("")),
  quantity: z.string().optional().or(z.literal("")),
  width: z.string().optional().or(z.literal("")),
  height: z.string().optional().or(z.literal("")),
  length: z.string().optional().or(z.literal("")),
  hours: z.string().optional().or(z.literal("")),
  manualPrice: z.string().optional().or(z.literal("")),
  taxable: z.preprocess((v) => v === "on" || v === "true", z.boolean()).optional(),
});

export async function updateQuoteItem(slug: string, itemId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "quotes:manage");
  const item = await db.quoteItem.findFirst({
    where: { id: itemId, quote: { tenantId: ctx.tenant.id } },
    include: { quote: true, product: { include: { optionGroups: { include: { options: true } } } } },
  });
  if (!item) return;

  const parsed = updateItemSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const d = parsed.data;

  // Re-collect selected options from form (field names: option_<groupId>)
  const selectedOptions: SelectedOption[] = [];
  if (item.product) {
    for (const group of item.product.optionGroups) {
      const raw = formData.get(`option_${group.id}`);
      if (typeof raw !== "string" || raw.length === 0) continue;
      const opt = group.options.find((o) => o.id === raw);
      if (opt) {
        selectedOptions.push({
          groupName: group.name,
          label: opt.label,
          adjustment: Number(opt.priceAdjustment),
        });
      }
    }
  } else {
    // Preserve existing snapshot for products without a live product record.
    selectedOptions.push(...parseSelectedOptions(item.selectedOptions as unknown));
  }

  const basePrice = emptyNum(d.basePrice);
  const updateData: Prisma.QuoteItemUpdateInput = {
    name: d.name,
    description: empty(d.description),
    basePrice: basePrice != null ? (basePrice as never) : undefined,
    quantity: parseDecimalOrNull(d.quantity) as never,
    width: parseDecimalOrNull(d.width) as never,
    height: parseDecimalOrNull(d.height) as never,
    length: parseDecimalOrNull(d.length) as never,
    hours: parseDecimalOrNull(d.hours) as never,
    manualPrice: parseDecimalOrNull(d.manualPrice) as never,
    selectedOptions: selectedOptions as never,
    taxable: d.taxable ?? false,
  };

  const updated = await db.quoteItem.update({
    where: { id: item.id },
    data: updateData,
  });

  const subtotal = computeItemSubtotal(updated);
  await db.quoteItem.update({
    where: { id: item.id },
    data: { subtotal: subtotal as never },
  });

  await recomputeQuoteTotals(item.quoteId);
  revalidatePath(`/t/${slug}/quotes/${item.quoteId}`);
}

function parseDecimalOrNull(s: string | undefined): number | null {
  if (!s || s.length === 0) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function removeQuoteItem(slug: string, itemId: string) {
  const ctx = await requirePermission(slug, "quotes:manage");
  const item = await db.quoteItem.findFirst({
    where: { id: itemId, quote: { tenantId: ctx.tenant.id } },
  });
  if (!item) return;
  await db.quoteItem.delete({ where: { id: item.id } });
  await recomputeQuoteTotals(item.quoteId);
  revalidatePath(`/t/${slug}/quotes/${item.quoteId}`);
}

export async function duplicateQuoteItem(slug: string, itemId: string) {
  const ctx = await requirePermission(slug, "quotes:manage");
  const item = await db.quoteItem.findFirst({
    where: { id: itemId, quote: { tenantId: ctx.tenant.id } },
  });
  if (!item) return;

  const last = await db.quoteItem.findFirst({
    where: { quoteId: item.quoteId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? 0) + 1;

  const created = await db.quoteItem.create({
    data: {
      quoteId:         item.quoteId,
      productId:       item.productId,
      name:            item.name,
      description:     item.description,
      pricingModel:    item.pricingModel,
      basePrice:       item.basePrice,
      unit:            item.unit,
      taxable:         item.taxable,
      quantity:        item.quantity,
      width:           item.width,
      height:          item.height,
      length:          item.length,
      hours:           item.hours,
      manualPrice:     item.manualPrice,
      selectedOptions: item.selectedOptions as Prisma.InputJsonValue,
      quantityTiers:   item.quantityTiers as Prisma.InputJsonValue,
      wasteFactorPct:  item.wasteFactorPct,
      costSnapshot:    item.costSnapshot,
      sectionId:       item.sectionId,
      isOptional:      item.isOptional,
      sortOrder,
      subtotal:        0,
    },
  });

  const subtotal = computeItemSubtotal(created);
  await db.quoteItem.update({
    where: { id: created.id },
    data:  { subtotal: subtotal as never },
  });

  await recomputeQuoteTotals(item.quoteId);
  revalidatePath(`/t/${slug}/quotes/${item.quoteId}`);
}

// ────────────────────────────────────────────────────────────
// Status transitions
// ────────────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  DRAFT:    ["SENT"],
  SENT:     ["VIEWED", "APPROVED", "DECLINED", "EXPIRED", "DRAFT"],
  VIEWED:   ["APPROVED", "DECLINED", "EXPIRED", "SENT", "DRAFT"],
  APPROVED: [], // terminal — orders downstream
  DECLINED: ["DRAFT"],
  EXPIRED:  ["DRAFT"],
};

const statusSchema = z.object({
  status: z.enum(["DRAFT", "SENT", "VIEWED", "APPROVED", "DECLINED", "EXPIRED"]),
  declinedReason: z
    .enum(["PRICE", "COMPETITOR", "TIMING", "NO_RESPONSE", "SCOPE_CHANGE", "OTHER"])
    .optional(),
  declinedNote: z.string().trim().max(500).optional(),
});

export async function changeQuoteStatus(slug: string, quoteId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "quotes:manage");
  const existing = await assertQuoteInTenant(ctx.tenant.id, quoteId);
  if (!existing) return;

  const parsed = statusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const next = parsed.data.status;

  if (!ALLOWED_TRANSITIONS[existing.status].includes(next)) {
    redirect(`/t/${slug}/quotes/${quoteId}?error=${encodeURIComponent(`Can't move from ${existing.status} to ${next}.`)}`);
  }

  // Phase 13 — approval gate on SEND. Block discount/large-job quotes unless
  // either (a) a manager has already stamped approvedToSendAt, or (b) the
  // actor holds quotes:approve_exceptions themselves (acts as self-approval).
  if (next === "SENT" && !existing.approvedToSendAt) {
    const rules = await loadApprovalRules(ctx.tenant.id);
    const blockers = quoteSendBlockers(
      {
        discountType:  existing.discountType,
        discountValue: Number(existing.discountValue),
        subtotal:      Number(existing.subtotal),
        total:         Number(existing.total),
      },
      rules,
    );
    if (blockers.length > 0) {
      if (!ctx.can("quotes:approve_exceptions")) {
        // Phase 22 Slice A — create a durable ApprovalRequest so the sales
        // rep isn't stuck chasing a manager in Slack. Dedupe against any
        // existing PENDING request for this quote so repeated send clicks
        // don't spam every manager's inbox.
        const reason = blockers.join(" · ");
        const openReq = await db.approvalRequest.findFirst({
          where: {
            tenantId:   ctx.tenant.id,
            entityType: "Quote",
            entityId:   quoteId,
            status:     "PENDING",
          },
          select: { id: true },
        });
        if (!openReq) {
          const [quoteMeta, created] = await Promise.all([
            db.quote.findUnique({ where: { id: quoteId }, select: { number: true } }),
            db.approvalRequest.create({
              data: {
                tenantId:      ctx.tenant.id,
                entityType:    "Quote",
                entityId:      quoteId,
                reason,
                status:        "PENDING",
                requestedById: ctx.userId,
              },
              select: { id: true },
            }),
          ]);
          await logAudit({
            tenantId:   ctx.tenant.id,
            userId:     ctx.userId,
            action:     "approval.requested",
            entityType: "ApprovalRequest",
            entityId:   created.id,
            metadata:   { targetType: "Quote", targetId: quoteId, reason },
          });
          await notifyApprovers({
            tenantId:    ctx.tenant.id,
            requesterId: ctx.userId,
            title:       `Approval needed: quote ${quoteMeta?.number ?? ""}`.trim(),
            body:        reason,
            link:        `/t/${slug}/approvals`,
            entityType:  "Quote",
            entityId:    quoteId,
          });
        }
        redirect(
          `/t/${slug}/quotes/${quoteId}?notice=${encodeURIComponent(
            openReq
              ? "Approval already pending — a manager has been notified."
              : "Approval requested — managers have been notified.",
          )}`,
        );
      }
      // Actor has the permission but no stamp yet — auto-stamp so the audit
      // trail records who green-lit this, not just that it was sent.
      await db.quote.update({
        where: { id: quoteId },
        data:  { approvedToSendAt: new Date(), approvedToSendById: ctx.userId },
      });
    }
  }

  const now = new Date();
  const patch: Prisma.QuoteUpdateInput = { status: next };
  if (next === "SENT") patch.sentAt = now;
  if (next === "VIEWED") patch.viewedAt = now;
  if (next === "APPROVED") patch.approvedAt = now;
  if (next === "DECLINED") {
    patch.declinedAt = now;
    patch.declinedReason = parsed.data.declinedReason ?? null;
    patch.declinedNote = parsed.data.declinedNote?.length ? parsed.data.declinedNote : null;
  }
  if (next === "DRAFT") {
    patch.sentAt = null;
    patch.viewedAt = null;
    patch.approvedAt = null;
    patch.declinedAt = null;
    patch.declinedReason = null;
    patch.declinedNote = null;
  }

  await db.quote.update({ where: { id: quoteId }, data: patch });

  // Nudge customer pipeline stage on approve + auto-create order.
  if (next === "APPROVED") {
    const q = await db.quote.findUnique({ where: { id: quoteId }, select: { customerId: true } });
    if (q) {
      await db.customer.update({
        where: { id: q.customerId },
        data: { stage: "WON" },
      });
    }
    // Create an order snapshot. If the quote already has one (e.g. re-approved),
    // createOrderFromQuoteInTx returns the existing order.
    await db.$transaction(async (tx) => {
      await createOrderFromQuoteInTx(tx, {
        tenantId: ctx.tenant.id,
        quoteId,
        createdByUserId: ctx.userId,
      });
    });
    revalidatePath(`/t/${slug}/orders`);
  } else if (next === "SENT") {
    const q = await db.quote.findUnique({
      where: { id: quoteId },
      select: {
        number: true, customerId: true, total: true, expiresAt: true,
        shareToken: true,
        customer: { select: { stage: true, email: true, name: true } },
      },
    });
    if (q) {
      // Only promote if still early in the funnel.
      if (q.customer.stage === "NEW_LEAD" || q.customer.stage === "CONTACTED") {
        await db.customer.update({ where: { id: q.customerId }, data: { stage: "QUOTED" } });
      }
      // Phase 15 Slice E — render the customer-facing "your quote is ready"
      // template and send it. In dev the provider stub just logs; the
      // EmailEvent still gets written so the portal timeline has the full
      // body preview. In production the provider swaps in (Phase 16).
      if (q.customer.email) {
        const url = q.shareToken ? `${appOrigin()}/q/${q.shareToken}` : null;
        await sendCustomerEmail({
          tenantId:     ctx.tenant.id,
          customerId:   q.customerId,
          senderUserId: ctx.userId,
          kind:         "QUOTE_SENT",
          to:           q.customer.email,
          relatedEntityType: "Quote",
          relatedEntityId:   quoteId,
          rendered: quoteReadyEmail({
            shopName:     ctx.tenant.name,
            shopPhone:    ctx.tenant.phone,
            shopWebsite:  ctx.tenant.website,
            quoteFooterText: ctx.tenant.quoteFooterText,
            customerName: q.customer.name,
            quoteNumber:  q.number,
            total:        formatMoney(Number(q.total), ctx.tenant.currency),
            expiresAt:    q.expiresAt ? formatDate(q.expiresAt) : null,
            url,
          }),
        });
      }
    }
  }

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "quote.status_changed",
    entityType: "Quote",
    entityId: quoteId,
    metadata: { from: existing.status, to: next },
  });

  revalidatePath(`/t/${slug}/quotes/${quoteId}`);
  revalidatePath(`/t/${slug}/quotes`);
}

// ────────────────────────────────────────────────────────────
// Phase 13: approve a quote that trips the send thresholds
// ────────────────────────────────────────────────────────────

// A manager/owner stamps the quote so the sales rep can send it themselves
// without needing the approve_exceptions permission at send time.
// Idempotent: calling again is a no-op (first stamp wins).
export async function approveQuoteForSending(slug: string, quoteId: string) {
  const ctx = await requirePermission(slug, "quotes:approve_exceptions");
  const q = await db.quote.findFirst({
    where:  { id: quoteId, tenantId: ctx.tenant.id },
    select: { id: true, status: true, approvedToSendAt: true },
  });
  if (!q) redirect(`/t/${slug}/quotes`);
  if (q.approvedToSendAt) {
    // Already approved — no-op, but still send the user back cleanly.
    redirect(`/t/${slug}/quotes/${quoteId}`);
  }
  // Only makes sense on quotes that are still pre-send. Once it's SENT (or
  // beyond) the gate has already been passed or no longer applies.
  if (q.status !== "DRAFT") {
    redirect(`/t/${slug}/quotes/${quoteId}?error=${encodeURIComponent("Only draft quotes can be approved to send.")}`);
  }

  const now = new Date();
  await db.quote.update({
    where: { id: quoteId },
    data:  { approvedToSendAt: now, approvedToSendById: ctx.userId },
  });

  // Phase 22 Slice A — if an inbox ApprovalRequest is open for this quote,
  // resolve it so the manager isn't double-prompted in the inbox.
  await db.approvalRequest.updateMany({
    where: {
      tenantId:   ctx.tenant.id,
      entityType: "Quote",
      entityId:   quoteId,
      status:     "PENDING",
    },
    data: {
      status:       "APPROVED",
      decidedById:  ctx.userId,
      decidedAt:    now,
      decisionNote: "Approved inline from the quote.",
    },
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "quote.approved_to_send",
    entityType: "Quote",
    entityId:   quoteId,
  });

  revalidatePath(`/t/${slug}/quotes/${quoteId}`);
  revalidatePath(`/t/${slug}/approvals`);
  redirect(`/t/${slug}/quotes/${quoteId}`);
}

// ────────────────────────────────────────────────────────────
// Duplicate
// ────────────────────────────────────────────────────────────

export async function duplicateQuote(slug: string, quoteId: string) {
  const ctx = await requirePermission(slug, "quotes:manage");
  const source = await db.quote.findFirst({
    where: { id: quoteId, tenantId: ctx.tenant.id },
    include: { items: true, sections: true },
  });
  if (!source) redirect(`/t/${slug}/quotes`);

  const cloned = await db.$transaction(async (tx) => {
    const tenant = await tx.tenant.update({
      where: { id: ctx.tenant.id },
      data: { quoteLastNumber: { increment: 1 } },
      select: { quoteNumberPrefix: true, quoteLastNumber: true },
    });
    const number = `${tenant.quoteNumberPrefix}${tenant.quoteLastNumber}`;

    // Clone the quote shell first (no items/sections yet) so we can build
    // the section-id remap before inserting lines.
    const q = await tx.quote.create({
      data: {
        tenantId: ctx.tenant.id,
        customerId: source.customerId,
        locationId: source.locationId, // Phase 15 — stay with the same branch
        number,
        status: "DRAFT",
        taxRate: source.taxRate,
        discountType: source.discountType,
        discountValue: source.discountValue,
        depositType: source.depositType,
        depositValue: source.depositValue,
        notes: source.notes,
        customerNote: source.customerNote,
        terms: source.terms,
        createdBy: ctx.userId,
        salesRepId: source.salesRepId ?? ctx.userId,
      },
    });

    // Re-mint sections; build oldId → newId lookup for line remapping.
    const sectionIdMap = new Map<string, string>();
    for (const s of source.sections) {
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

    if (source.items.length > 0) {
      await tx.quoteItem.createMany({
        data: source.items.map((it) => ({
          quoteId:         q.id,
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
          subtotal:        it.subtotal,
          sortOrder:       it.sortOrder,
          sectionId:       it.sectionId ? sectionIdMap.get(it.sectionId) ?? null : null,
          isOptional:      it.isOptional,
        })),
      });
    }

    return q;
  });

  await recomputeQuoteTotals(cloned.id);
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "quote.duplicated",
    entityType: "Quote",
    entityId: cloned.id,
    metadata: { from: source.id },
  });

  redirect(`/t/${slug}/quotes/${cloned.id}`);
}

// ────────────────────────────────────────────────────────────
// Phase 9 Slice E — Revisions
// ────────────────────────────────────────────────────────────
//
// A revision is a linked copy: the new quote chains to the parent via
// `parentQuoteId` and bumps `revisionNumber`. The parent is stamped
// `supersededAt` so stale copies don't keep getting sent. Unlike
// duplicate, which forks a completely independent quote, revise keeps
// the thread tied together so the staff UI can show the whole chain
// and the customer doesn't end up with two "live" versions.

export async function reviseQuote(slug: string, quoteId: string) {
  const ctx = await requirePermission(slug, "quotes:manage");
  const source = await db.quote.findFirst({
    where: { id: quoteId, tenantId: ctx.tenant.id },
    include: { items: true, sections: true },
  });
  if (!source) redirect(`/t/${slug}/quotes`);

  // Revisions chain from the root — so rev 3 of rev 2 of A1 all share
  // `parentQuoteId = A1`. That way the history view on any sibling shows
  // the full chain without a recursive query.
  const rootId = source.parentQuoteId ?? source.id;

  // The new revisionNumber is max+1 across the chain, so two parallel
  // revise clicks don't collide on the same number.
  const maxRevision = await db.quote.aggregate({
    where: {
      tenantId: ctx.tenant.id,
      OR: [{ id: rootId }, { parentQuoteId: rootId }],
    },
    _max: { revisionNumber: true },
  });
  const nextRevision = (maxRevision._max.revisionNumber ?? 1) + 1;

  const cloned = await db.$transaction(async (tx) => {
    const tenant = await tx.tenant.update({
      where: { id: ctx.tenant.id },
      data: { quoteLastNumber: { increment: 1 } },
      select: { quoteNumberPrefix: true, quoteLastNumber: true },
    });
    const number = `${tenant.quoteNumberPrefix}${tenant.quoteLastNumber}`;

    const q = await tx.quote.create({
      data: {
        tenantId: ctx.tenant.id,
        customerId: source.customerId,
        locationId: source.locationId,
        number,
        status: "DRAFT",
        taxRate: source.taxRate,
        discountType: source.discountType,
        discountValue: source.discountValue,
        depositType: source.depositType,
        depositValue: source.depositValue,
        notes: source.notes,
        customerNote: source.customerNote,
        terms: source.terms,
        expiresAt: source.expiresAt,
        createdBy: ctx.userId,
        salesRepId: source.salesRepId ?? ctx.userId,
        parentQuoteId: rootId,
        revisionNumber: nextRevision,
      },
    });

    const sectionIdMap = new Map<string, string>();
    for (const s of source.sections) {
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

    if (source.items.length > 0) {
      await tx.quoteItem.createMany({
        data: source.items.map((it) => ({
          quoteId:         q.id,
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
          subtotal:        it.subtotal,
          sortOrder:       it.sortOrder,
          sectionId:       it.sectionId ? sectionIdMap.get(it.sectionId) ?? null : null,
          isOptional:      it.isOptional,
        })),
      });
    }

    // Stamp the parent as superseded. Only stamp when it's still live
    // (not already superseded, approved or declined) — keeps historical
    // semantics meaningful.
    if (!source.supersededAt && source.status !== "APPROVED" && source.status !== "DECLINED") {
      await tx.quote.update({
        where: { id: source.id },
        data:  { supersededAt: new Date() },
      });
    }

    return q;
  });

  await recomputeQuoteTotals(cloned.id);
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "quote.revised",
    entityType: "Quote",
    entityId: cloned.id,
    metadata: { from: source.id, revisionNumber: nextRevision, rootId },
  });

  redirect(`/t/${slug}/quotes/${cloned.id}`);
}

// ────────────────────────────────────────────────────────────
// Phase 13 — Rush fee
// ────────────────────────────────────────────────────────────
//
// Insert a single FIXED line ("Rush fee") computed from the current subtotal
// and the tenant's configured rushFeePercent. Kept as a normal quote line (not
// a separate column on Quote) so it flows through existing subtotal/tax logic
// and shows up in the customer-facing quote PDF exactly where it belongs.

export async function applyRushFee(slug: string, quoteId: string) {
  const ctx = await requirePermission(slug, "quotes:manage");
  const existing = await assertQuoteInTenant(ctx.tenant.id, quoteId);
  if (!existing) redirect(`/t/${slug}/quotes`);

  const tenant = await db.tenant.findUnique({
    where:  { id: ctx.tenant.id },
    select: { rushFeePercent: true },
  });
  const pct = tenant?.rushFeePercent ?? 0;
  if (pct <= 0) {
    redirect(`/t/${slug}/quotes/${quoteId}?error=${encodeURIComponent("Rush pricing is disabled. Set a rush % in Settings → Workflow.")}`);
  }

  const currentSubtotal = Number(existing.subtotal);
  if (!Number.isFinite(currentSubtotal) || currentSubtotal <= 0) {
    redirect(`/t/${slug}/quotes/${quoteId}?error=${encodeURIComponent("Add line items before applying a rush fee.")}`);
  }

  const fee = Math.round(currentSubtotal * (pct / 100) * 100) / 100;

  const last = await db.quoteItem.findFirst({
    where:   { quoteId },
    orderBy: { sortOrder: "desc" },
  });
  const sortOrder = (last?.sortOrder ?? 0) + 1;

  const created = await db.quoteItem.create({
    data: {
      quoteId,
      productId:       null,
      name:            `Rush fee (${pct}%)`,
      description:     "Rush order surcharge.",
      pricingModel:    "FIXED",
      basePrice:       fee as never,
      taxable:         true,
      quantity:        null,
      selectedOptions: [] as never,
      quantityTiers:   [] as never,
      subtotal:        fee as never,
      sortOrder,
    },
  });

  await recomputeQuoteTotals(quoteId);

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "quote.rush_fee_applied",
    entityType: "Quote",
    entityId:   quoteId,
    metadata:   { pct, fee, lineItemId: created.id },
  });

  revalidatePath(`/t/${slug}/quotes/${quoteId}`);
}

// ────────────────────────────────────────────────────────────
// Phase 9 — Sections
// ────────────────────────────────────────────────────────────
//
// Sections group lines under a heading ("Signage", "Installation",
// "Optional upgrades"). A line without a sectionId sits in the default
// un-grouped band at the top (keeps existing quotes working).

const sectionSchema = z.object({
  title: z.string().min(1).max(120),
  description: optionalLong,
});

export async function addQuoteSection(slug: string, quoteId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "quotes:manage");
  const existing = await assertQuoteInTenant(ctx.tenant.id, quoteId);
  if (!existing) redirect(`/t/${slug}/quotes`);

  const parsed = sectionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/quotes/${quoteId}?error=${encodeURIComponent("Section title required.")}`);
  }

  const last = await db.quoteSection.findFirst({
    where:   { quoteId },
    orderBy: { sortOrder: "desc" },
  });
  const sortOrder = (last?.sortOrder ?? 0) + 1;

  const section = await db.quoteSection.create({
    data: {
      quoteId,
      title:       parsed.data.title,
      description: empty(parsed.data.description) ?? null,
      sortOrder,
    },
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "quote.section_added",
    entityType: "Quote",
    entityId:   quoteId,
    metadata:   { sectionId: section.id, title: section.title },
  });

  revalidatePath(`/t/${slug}/quotes/${quoteId}`);
}

export async function updateQuoteSection(slug: string, sectionId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "quotes:manage");
  const section = await db.quoteSection.findFirst({
    where:   { id: sectionId, quote: { tenantId: ctx.tenant.id } },
    select:  { id: true, quoteId: true },
  });
  if (!section) redirect(`/t/${slug}/quotes`);

  const parsed = sectionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/quotes/${section.quoteId}?error=${encodeURIComponent("Section title required.")}`);
  }

  await db.quoteSection.update({
    where: { id: sectionId },
    data: {
      title:       parsed.data.title,
      description: empty(parsed.data.description) ?? null,
    },
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "quote.section_updated",
    entityType: "Quote",
    entityId:   section.quoteId,
    metadata:   { sectionId },
  });

  revalidatePath(`/t/${slug}/quotes/${section.quoteId}`);
}

export async function deleteQuoteSection(slug: string, sectionId: string) {
  const ctx = await requirePermission(slug, "quotes:manage");
  const section = await db.quoteSection.findFirst({
    where:  { id: sectionId, quote: { tenantId: ctx.tenant.id } },
    select: { id: true, quoteId: true },
  });
  if (!section) redirect(`/t/${slug}/quotes`);

  // Items in the section fall back to the un-grouped band via onDelete: SetNull.
  await db.quoteSection.delete({ where: { id: sectionId } });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "quote.section_deleted",
    entityType: "Quote",
    entityId:   section.quoteId,
    metadata:   { sectionId },
  });

  revalidatePath(`/t/${slug}/quotes/${section.quoteId}`);
}

// Move a line to a different section (or to the un-grouped band when
// sectionId is empty). Form field: `sectionId` — empty string means null.
export async function moveQuoteItemToSection(slug: string, itemId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "quotes:manage");
  const item = await db.quoteItem.findFirst({
    where:  { id: itemId, quote: { tenantId: ctx.tenant.id } },
    select: { id: true, quoteId: true },
  });
  if (!item) redirect(`/t/${slug}/quotes`);

  const raw = String(formData.get("sectionId") ?? "");
  const targetSectionId = raw.length > 0 ? raw : null;

  if (targetSectionId) {
    // Confirm the target section belongs to the same quote.
    const section = await db.quoteSection.findFirst({
      where:  { id: targetSectionId, quoteId: item.quoteId },
      select: { id: true },
    });
    if (!section) {
      redirect(`/t/${slug}/quotes/${item.quoteId}?error=${encodeURIComponent("Section not found.")}`);
    }
  }

  await db.quoteItem.update({
    where: { id: itemId },
    data:  { sectionId: targetSectionId },
  });

  revalidatePath(`/t/${slug}/quotes/${item.quoteId}`);
}

// Toggle the isOptional flag on a line. Recomputes totals so the optional
// rollup updates in one round trip.
export async function toggleQuoteItemOptional(slug: string, itemId: string) {
  const ctx = await requirePermission(slug, "quotes:manage");
  const item = await db.quoteItem.findFirst({
    where:  { id: itemId, quote: { tenantId: ctx.tenant.id } },
    select: { id: true, quoteId: true, isOptional: true },
  });
  if (!item) redirect(`/t/${slug}/quotes`);

  await db.quoteItem.update({
    where: { id: itemId },
    data:  { isOptional: !item.isOptional },
  });

  await recomputeQuoteTotals(item.quoteId);

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "quote.item_optional_toggled",
    entityType: "QuoteItem",
    entityId:   itemId,
    metadata:   { isOptional: !item.isOptional },
  });

  revalidatePath(`/t/${slug}/quotes/${item.quoteId}`);
}

// ────────────────────────────────────────────────────────────
// Phase 9 — Deposit
// ────────────────────────────────────────────────────────────

const depositSchema = z.object({
  depositType: z.enum(["NONE", "FIXED", "PERCENT"]),
  depositValue: z.string().optional().or(z.literal("")),
});

export async function saveQuoteDeposit(slug: string, quoteId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "quotes:manage");
  const existing = await assertQuoteInTenant(ctx.tenant.id, quoteId);
  if (!existing) redirect(`/t/${slug}/quotes`);

  const parsed = depositSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/quotes/${quoteId}?error=${encodeURIComponent("Invalid deposit.")}`);
  }

  const type = parsed.data.depositType;
  const rawValue = parsed.data.depositValue;
  const value = type === "NONE" ? 0 : Math.max(0, emptyNum(rawValue) ?? 0);

  if (type === "PERCENT" && value > 100) {
    redirect(`/t/${slug}/quotes/${quoteId}?error=${encodeURIComponent("Deposit percent must be between 0 and 100.")}`);
  }

  await db.quote.update({
    where: { id: quoteId },
    data: {
      depositType:  type,
      depositValue: value as never,
    },
  });

  await recomputeQuoteTotals(quoteId);

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "quote.deposit_updated",
    entityType: "Quote",
    entityId:   quoteId,
    metadata:   { depositType: type, depositValue: value },
  });

  revalidatePath(`/t/${slug}/quotes/${quoteId}`);
}

// ────────────────────────────────────────────────────────────
// Phase 9 — Share token
// ────────────────────────────────────────────────────────────
//
// Mint (or rotate) the one-time public share link for a quote. The existing
// portal link remains valid — this is the URL to paste into an email /
// proposal where the customer hasn't authenticated.

export async function mintQuoteShareToken(slug: string, quoteId: string) {
  const ctx = await requirePermission(slug, "quotes:manage");
  const existing = await assertQuoteInTenant(ctx.tenant.id, quoteId);
  if (!existing) redirect(`/t/${slug}/quotes`);

  const token = generateToken(24);
  await db.quote.update({
    where: { id: quoteId },
    data:  { shareToken: token },
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "quote.share_token_minted",
    entityType: "Quote",
    entityId:   quoteId,
  });

  revalidatePath(`/t/${slug}/quotes/${quoteId}`);
}

export async function revokeQuoteShareToken(slug: string, quoteId: string) {
  const ctx = await requirePermission(slug, "quotes:manage");
  const existing = await assertQuoteInTenant(ctx.tenant.id, quoteId);
  if (!existing) redirect(`/t/${slug}/quotes`);

  await db.quote.update({
    where: { id: quoteId },
    data:  { shareToken: null },
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "quote.share_token_revoked",
    entityType: "Quote",
    entityId:   quoteId,
  });

  revalidatePath(`/t/${slug}/quotes/${quoteId}`);
}

// ────────────────────────────────────────────────────────────
// Phase E — Bulk operations
// ────────────────────────────────────────────────────────────
//
// Batch status flips from the quotes DataTable selection. Unlike the
// single-quote `changeQuoteStatus` handler, these bulk versions skip
// the approval-gate / side-effects (no auto-order creation, no customer
// emails) — the UI surfaces these only for workflow statuses where
// side effects aren't meaningful (DECLINED, EXPIRED). Anything richer
// still goes through the single handler from the detail page.

const BULK_QUOTE_LIMIT = 200;

function parseQuoteIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, BULK_QUOTE_LIMIT);
}

const bulkQuoteStatusSchema = z.object({
  ids: z.string().min(1),
  status: z.enum(["DECLINED", "EXPIRED", "DRAFT"]),
});

export async function bulkChangeQuoteStatus(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "quotes:manage");
  const parsed = bulkQuoteStatusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const ids = parseQuoteIds(parsed.data.ids);
  if (ids.length === 0) return;

  const quotes = await db.quote.findMany({
    where: { id: { in: ids }, tenantId: ctx.tenant.id },
    select: { id: true, status: true, locationId: true },
  });
  const next = parsed.data.status;

  const allowed = quotes.filter((q) => {
    try {
      ctx.assertBranchAccess(q.locationId);
    } catch {
      return false;
    }
    // Only apply when the transition is legal — silently drop rows that
    // can't move. Prevents approved/sent quotes from being yanked back.
    return ALLOWED_TRANSITIONS[q.status].includes(next);
  });
  if (allowed.length === 0) return;

  const now = new Date();
  const patch: Prisma.QuoteUpdateManyMutationInput = { status: next };
  if (next === "DECLINED") patch.declinedAt = now;
  if (next === "DRAFT") {
    patch.sentAt = null;
    patch.viewedAt = null;
    patch.approvedAt = null;
    patch.declinedAt = null;
  }

  await db.quote.updateMany({
    where: { id: { in: allowed.map((q) => q.id) } },
    data: patch,
  });

  await Promise.all(
    allowed.map((q) =>
      logAudit({
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
        action: "quote.status_changed",
        entityType: "Quote",
        entityId: q.id,
        metadata: { bulk: true, from: q.status, to: next },
      }),
    ),
  );

  revalidatePath(`/t/${slug}/quotes`);
}

// ────────────────────────────────────────────────────────────
// Preview payload for the list-page side drawer.
//
// Lightweight read — returns just enough to render a summary card + line
// items + totals without the full detail page's editor plumbing. The
// drawer calls this lazily the first time a row is clicked so the list
// query stays cheap (we'd otherwise pay to hydrate items for every
// visible quote just in case the user previews one).
//
// Returns null when the quote has been deleted or moved out of the
// user's branch scope — the caller shows a "Quote is no longer
// available" state and lets the user close the drawer.
// ────────────────────────────────────────────────────────────

export type QuotePreviewPayload = {
  id: string;
  number: string;
  status: QuoteStatus;
  statusLabel: string;
  customerId: string;
  customerName: string;
  expiresLabel: string | null;
  sentLabel: string | null;
  notes: string | null;
  customerNote: string | null;
  sections: Array<{
    id: string | null;
    title: string | null;
    description: string | null;
    items: Array<{
      id: string;
      name: string;
      description: string | null;
      unit: string | null;
      pricingModelLabel: string;
      inputsLabel: string | null;
      subtotal: string;
      isOptional: boolean;
    }>;
  }>;
  totals: {
    subtotal: string;
    discount: string | null;
    tax: string;
    taxRatePercent: string;
    total: string;
    optionalSubtotal: string | null;
    deposit: string | null;
  };
};

function formatItemInputsLabel(
  item: Pick<
    QuoteItem,
    "pricingModel" | "quantity" | "width" | "height" | "length" | "hours" | "unit"
  >,
): string | null {
  const qty = item.quantity != null ? Number(item.quantity) : null;
  const w = item.width != null ? Number(item.width) : null;
  const h = item.height != null ? Number(item.height) : null;
  const l = item.length != null ? Number(item.length) : null;
  const hrs = item.hours != null ? Number(item.hours) : null;
  const unit = item.unit ?? "";
  switch (item.pricingModel) {
    case "PER_UNIT":
      return qty != null ? `${qty} ${unit || "each"}` : null;
    case "PER_SQFT":
      if (w != null && h != null) {
        const base = `${w} × ${h} ft`;
        return qty && qty !== 1 ? `${base} × ${qty}` : base;
      }
      return null;
    case "PER_LINEAR_FT":
      if (l != null) {
        const base = `${l} ft`;
        return qty && qty !== 1 ? `${base} × ${qty}` : base;
      }
      return null;
    case "LABOR_HOURLY":
      return hrs != null ? `${hrs} hr` : null;
    case "FIXED":
    case "CUSTOM_QUOTE":
    default:
      return null;
  }
}

export async function getQuotePreview(
  slug: string,
  quoteId: string,
): Promise<QuotePreviewPayload | null> {
  const ctx = await requirePermission(slug, "quotes:view");

  const quote = await db.quote.findFirst({
    where: { id: quoteId, tenantId: ctx.tenant.id },
    include: {
      customer: { select: { id: true, name: true } },
      sections: { orderBy: { sortOrder: "asc" } },
      items: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!quote) return null;
  try {
    ctx.assertBranchAccess(quote.locationId);
  } catch {
    return null;
  }

  const currency = ctx.tenant.currency;
  const discountType = quote.discountType;
  const discountAmount = Number(quote.discountAmount);
  const optionalSubtotal = Number(quote.optionalSubtotal);
  const deposit = Number(quote.depositAmount);

  const bySection = new Map<string | null, typeof quote.items>();
  for (const it of quote.items) {
    const key = it.sectionId ?? null;
    const bucket = bySection.get(key) ?? [];
    bucket.push(it);
    bySection.set(key, bucket);
  }

  const sections: QuotePreviewPayload["sections"] = [];
  const ungrouped = bySection.get(null) ?? [];
  if (ungrouped.length > 0) {
    sections.push({
      id: null,
      title: null,
      description: null,
      items: ungrouped.map((it) => ({
        id: it.id,
        name: it.name,
        description: it.description,
        unit: it.unit,
        pricingModelLabel: pricingMeta(it.pricingModel).label,
        inputsLabel: formatItemInputsLabel(it),
        subtotal: formatMoney(Number(it.subtotal).toString(), currency),
        isOptional: it.isOptional,
      })),
    });
  }
  for (const sec of quote.sections) {
    const items = bySection.get(sec.id) ?? [];
    if (items.length === 0) continue;
    sections.push({
      id: sec.id,
      title: sec.title,
      description: sec.description,
      items: items.map((it) => ({
        id: it.id,
        name: it.name,
        description: it.description,
        unit: it.unit,
        pricingModelLabel: pricingMeta(it.pricingModel).label,
        inputsLabel: formatItemInputsLabel(it),
        subtotal: formatMoney(Number(it.subtotal).toString(), currency),
        isOptional: it.isOptional,
      })),
    });
  }

  const pctRaw = Number(quote.taxRate) * 100;
  const taxRatePct = (pctRaw % 1 === 0 ? pctRaw.toFixed(0) : pctRaw.toFixed(3));

  const discountLabel = (() => {
    if (discountType === "NONE" || discountAmount === 0) return null;
    const money = formatMoney(discountAmount.toString(), currency);
    if (discountType === "PERCENT") {
      return `-${money} (${Number(quote.discountValue)}% off)`;
    }
    return `-${money}`;
  })();

  return {
    id: quote.id,
    number: quote.number,
    status: quote.status,
    statusLabel: statusLabel(quote.status),
    customerId: quote.customer.id,
    customerName: quote.customer.name,
    expiresLabel: quote.expiresAt ? formatDate(quote.expiresAt) : null,
    sentLabel: quote.sentAt ? formatDate(quote.sentAt) : null,
    notes: quote.notes,
    customerNote: quote.customerNote,
    sections,
    totals: {
      subtotal: formatMoney(Number(quote.subtotal).toString(), currency),
      discount: discountLabel,
      tax: formatMoney(Number(quote.taxAmount).toString(), currency),
      taxRatePercent: taxRatePct,
      total: formatMoney(Number(quote.total).toString(), currency),
      optionalSubtotal:
        optionalSubtotal > 0
          ? formatMoney(optionalSubtotal.toString(), currency)
          : null,
      deposit:
        deposit > 0 ? formatMoney(deposit.toString(), currency) : null,
    },
  };
}
