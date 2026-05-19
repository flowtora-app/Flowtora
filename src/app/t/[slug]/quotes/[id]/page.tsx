import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { CommentThread } from "@/components/CommentThread";
import { FilesCard } from "@/components/FilesCard";
import { AttachFilesCard } from "@/components/files/AttachFilesCard";
import { Button, Field, SelectField, TextArea, Checkbox } from "@/components/Field";
import {
  updateQuoteMeta,
  addQuoteItem,
  updateQuoteItem,
  removeQuoteItem,
  duplicateQuoteItem,
  changeQuoteStatus,
  deleteQuote,
  duplicateQuote,
  reviseQuote,
  approveQuoteForSending,
  applyRushFee,
  addQuoteSection,
  updateQuoteSection,
  deleteQuoteSection,
  moveQuoteItemToSection,
  toggleQuoteItemOptional,
  saveQuoteDeposit,
  mintQuoteShareToken,
  revokeQuoteShareToken,
} from "@/app/actions/quotes";
import { addPackageToQuote } from "@/app/actions/products";
import { saveQuoteAsTemplate } from "@/app/actions/quote-templates";
import { loadApprovalRules, quoteSendBlockers } from "@/lib/approvals";
import {
  QUOTE_STATUSES,
  statusColor,
  statusLabel,
  parseSelectedOptions,
  parseQuantityTiers,
} from "@/lib/quotes";
import { pickTierPrice, pricingMeta, computeLineCost, marginPercent } from "@/lib/pricing";
import { formatMoney, formatDate, humanize } from "@/lib/format";
import { listActiveMembers, memberLookup } from "@/lib/members";
import { SendMessageWidget } from "@/components/SendMessageWidget";
import { loadSendContext } from "@/app/actions/message-templates";
import { getGroupContext } from "@/lib/franchise";
import { QuotePortalPreview } from "@/components/quotes/QuotePortalPreview";
import { AddLineItemBuilder } from "@/components/quotes/AddLineItemBuilder";
import { AutoSaveForm } from "@/components/AutoSaveForm";
import { Icon } from "@/components/shell/icons";
import { isEntitled } from "@/lib/entitlements";

// Phase 6 (transformation) — the old 5-tab editor (Details / Pricing /
// Notes / Sharing / Activity) collapsed into a single scrollable page
// with an always-visible customer-preview rail on the right. Autosave
// replaces explicit Save buttons on the meta / pricing / deposit /
// notes forms. `?tab=…` query strings from legacy bookmarks still
// work (the page renders the same content regardless), so we don't
// special-case them — they land on the right content anyway.

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { id } = await params;
  const q = await db.quote.findUnique({
    where:  { id },
    select: { number: true },
  });
  return { title: q?.number ? `Quote ${q.number}` : "Quote" };
}

function declinedReasonLabel(reason: string): string {
  switch (reason) {
    case "PRICE":        return "Price too high";
    case "COMPETITOR":   return "Went with competitor";
    case "TIMING":       return "Timing / not ready";
    case "NO_RESPONSE":  return "No response";
    case "SCOPE_CHANGE": return "Scope changed";
    case "OTHER":        return "Other";
    default:             return humanize(reason);
  }
}

// Non-primary status transitions surfaced in the actions row. The primary
// transition for each status (e.g. DRAFT → SENT, SENT → APPROVED) is promoted
// to the sticky header's primary CTA, so it's filtered out of this table.
const SECONDARY_STATUS_BUTTONS: Record<string, { to: string; label: string; variant?: "primary" | "secondary" | "danger" }[]> = {
  DRAFT:    [],
  SENT:     [
    { to: "VIEWED",   label: "Mark as viewed",    variant: "secondary" },
    { to: "DECLINED", label: "Mark as declined",  variant: "danger" },
    { to: "DRAFT",    label: "Back to draft",     variant: "secondary" },
  ],
  VIEWED: [
    { to: "DECLINED", label: "Mark as declined",  variant: "danger" },
    { to: "DRAFT",    label: "Back to draft",     variant: "secondary" },
  ],
  APPROVED: [],
  DECLINED: [],
  EXPIRED:  [],
};

export default async function QuoteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ error?: string; notice?: string; tab?: string }>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "quotes:view");
  const canManage = ctx.can("quotes:manage");
  // `sp.tab` is ignored — Phase 6 collapsed the tabs into a single page.
  // Legacy bookmarks still resolve; anchors (#pricing, #sharing) could
  // be added later if we want smooth-scroll targets.
  void sp.tab;

  const quote = await db.quote.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      customer: true,
      order: { select: { id: true, number: true, status: true } },
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          product: {
            include: {
              optionGroups: {
                orderBy: { sortOrder: "asc" },
                include: { options: { orderBy: { sortOrder: "asc" } } },
              },
            },
          },
        },
      },
      sections: { orderBy: { sortOrder: "asc" } },
      comments: { orderBy: { createdAt: "asc" }, take: 200 },
      files:    { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });
  if (!quote) notFound();
  ctx.assertBranchAccess(quote.locationId);

  const groupCtx = await getGroupContext(ctx.tenant.id);
  const productSelect = {
    id: true, name: true, pricingModel: true, basePrice: true, unit: true, category: true,
  } as const;
  const [ownProducts, sharedProducts, members, memberMap, rules, sendCtx, packages] = await Promise.all([
    db.product.findMany({
      where: { tenantId: ctx.tenant.id, active: true },
      orderBy: { name: "asc" },
      select: productSelect,
    }),
    groupCtx.parentTenantId
      ? db.product.findMany({
          where: { tenantId: groupCtx.parentTenantId, active: true, shared: true },
          orderBy: { name: "asc" },
          select: productSelect,
        })
      : Promise.resolve([] as Awaited<ReturnType<typeof db.product.findMany<{ select: typeof productSelect }>>>),
    listActiveMembers(ctx.tenant.id),
    memberLookup(ctx.tenant.id),
    loadApprovalRules(ctx.tenant.id),
    loadSendContext(ctx.tenant.id, ctx.tenant.currency, {
      customerId:   quote.customerId,
      quoteId:      quote.id,
      senderUserId: ctx.userId,
    }),
    db.productPackage.findMany({
      where: { tenantId: ctx.tenant.id, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, _count: { select: { components: true } } },
    }),
  ]);
  const products = [
    ...ownProducts,
    ...sharedProducts.map((p) => ({ ...p, name: `[Shared] ${p.name}` })),
  ];

  const editable = canManage && quote.status !== "APPROVED";

  // Margin computation (staff-only; rendered in the Pricing tab).
  let costBase = 0;
  let linesWithCost = 0;
  for (const it of quote.items) {
    const lineCost = computeLineCost({
      pricingModel: it.pricingModel,
      costPerUnit:  it.costSnapshot != null ? Number(it.costSnapshot) : null,
      quantity:     it.quantity != null ? Number(it.quantity) : undefined,
      width:        it.width != null ? Number(it.width) : undefined,
      height:       it.height != null ? Number(it.height) : undefined,
      length:       it.length != null ? Number(it.length) : undefined,
      hours:        it.hours != null ? Number(it.hours) : undefined,
      wasteFactorPct: it.wasteFactorPct != null ? Number(it.wasteFactorPct) : 0,
    });
    if (lineCost != null) {
      costBase += lineCost;
      linesWithCost += 1;
    }
  }
  const marginSubtotal = Number(quote.subtotal);
  const margin = marginPercent(marginSubtotal, linesWithCost > 0 ? costBase : null);
  const grossProfit = linesWithCost > 0 ? marginSubtotal - costBase : null;
  const marginCoverageNote = linesWithCost === 0
    ? "No line items have a cost set — add cost in the product catalog to see margin."
    : linesWithCost < quote.items.length
      ? `${linesWithCost} of ${quote.items.length} line items have a cost — margin reflects only those.`
      : null;

  const showApprovalBanner = quote.status === "DRAFT";
  const blockers = showApprovalBanner
    ? quoteSendBlockers(
        {
          discountType:  quote.discountType,
          discountValue: Number(quote.discountValue),
          subtotal:      Number(quote.subtotal),
          total:         Number(quote.total),
        },
        rules,
      )
    : [];
  const approveAction = approveQuoteForSending.bind(null, slug, quote.id);

  const pendingApproval = showApprovalBanner
    ? await db.approvalRequest.findFirst({
        where: {
          tenantId:   ctx.tenant.id,
          entityType: "Quote",
          entityId:   quote.id,
          status:     "PENDING",
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true, requestedById: true, reason: true },
      })
    : null;

  const saveMeta = updateQuoteMeta.bind(null, slug, quote.id);
  const addItem = addQuoteItem.bind(null, slug, quote.id);
  const addPkg = addPackageToQuote.bind(null, slug, quote.id);
  const dup = duplicateQuote.bind(null, slug, quote.id);
  const revise = reviseQuote.bind(null, slug, quote.id);
  const del = deleteQuote.bind(null, slug, quote.id);
  const rush = applyRushFee.bind(null, slug, quote.id);
  const addSection = addQuoteSection.bind(null, slug, quote.id);
  const saveDeposit = saveQuoteDeposit.bind(null, slug, quote.id);
  const mintShare = mintQuoteShareToken.bind(null, slug, quote.id);
  const revokeShare = revokeQuoteShareToken.bind(null, slug, quote.id);
  const saveAsTpl = saveQuoteAsTemplate.bind(null, slug, quote.id);
  const setStatus = changeQuoteStatus.bind(null, slug, quote.id);

  const rootId = quote.parentQuoteId ?? quote.id;
  const revisionChain = await db.quote.findMany({
    where: {
      tenantId: ctx.tenant.id,
      OR: [{ id: rootId }, { parentQuoteId: rootId }],
    },
    orderBy: { revisionNumber: "asc" },
    select: {
      id: true,
      number: true,
      status: true,
      revisionNumber: true,
      supersededAt: true,
      total: true,
      updatedAt: true,
    },
  });
  const hasRevisions = revisionChain.length > 1;

  const sectionById = new Map(quote.sections.map((s) => [s.id, s]));
  const ungrouped = quote.items.filter((it) => !it.sectionId || !sectionById.has(it.sectionId));
  const bySection = new Map<string, typeof quote.items>();
  for (const s of quote.sections) bySection.set(s.id, [] as typeof quote.items);
  for (const it of quote.items) {
    if (it.sectionId && sectionById.has(it.sectionId)) {
      bySection.get(it.sectionId)!.push(it);
    }
  }

  const sectionOptions = [
    { value: "", label: "— un-grouped —" },
    ...quote.sections.map((s) => ({ value: s.id, label: s.title })),
  ];

  type LineItem = (typeof quote.items)[number];
  function ItemsUL({ items }: { items: LineItem[] }) {
    if (items.length === 0) return null;
    return (
      <ul
        className="space-y-2 px-5 py-4"
        style={{ borderTop: "1px solid var(--border-subtle)" }}
      >
        {items.map((item) => {
          const meta = pricingMeta(item.pricingModel);
          const selected = parseSelectedOptions(item.selectedOptions as unknown);
          const selectedByGroup = new Map(selected.map((o) => [o.groupName, o.label]));
          const save = updateQuoteItem.bind(null, slug, item.id);
          const remove = removeQuoteItem.bind(null, slug, item.id);
          const dup = duplicateQuoteItem.bind(null, slug, item.id);
          const moveItem = moveQuoteItemToSection.bind(null, slug, item.id);
          const toggleOptional = toggleQuoteItemOptional.bind(null, slug, item.id);

          const tiers = parseQuantityTiers(item.quantityTiers as unknown);
          const qtyForTier = item.quantity != null ? Number(item.quantity) : null;
          const tierApplies =
            item.pricingModel === "PER_UNIT" ||
            item.pricingModel === "PER_SQFT" ||
            item.pricingModel === "PER_LINEAR_FT";
          const activeTierPrice = tierApplies && qtyForTier != null
            ? pickTierPrice(tiers, qtyForTier)
            : null;
          const nextTier = tierApplies && qtyForTier != null
            ? tiers
                .filter((t) => qtyForTier < t.minQuantity)
                .sort((a, b) => a.minQuantity - b.minQuantity)[0] ?? null
            : null;

          const lineCostExt = computeLineCost({
            pricingModel: item.pricingModel,
            costPerUnit: item.costSnapshot != null ? Number(item.costSnapshot) : null,
            quantity: item.quantity != null ? Number(item.quantity) : undefined,
            width: item.width != null ? Number(item.width) : undefined,
            height: item.height != null ? Number(item.height) : undefined,
            length: item.length != null ? Number(item.length) : undefined,
            hours: item.hours != null ? Number(item.hours) : undefined,
            wasteFactorPct: item.wasteFactorPct != null ? Number(item.wasteFactorPct) : 0,
          });
          const lineSubtotal = Number(item.subtotal);
          const lineMargin =
            lineCostExt != null ? marginPercent(lineSubtotal, lineCostExt) : null;

          const formula = formulaForItem(item, ctx.tenant.currency);
          const hasOptionGroups = !!item.product && item.product.optionGroups.length > 0;
          const hasTierInfo = tierApplies && tiers.length > 0;

          const descPreview = item.description
            ? item.description.length > 90
              ? `${item.description.slice(0, 87)}…`
              : item.description
            : null;
          const optionSummary = selected.length > 0
            ? selected.map((o) => `${o.groupName}: ${o.label}`).join(" · ")
            : null;

          return (
            <li key={item.id}>
              <details
                className="group overflow-hidden rounded-lg [&>summary]:list-none [&>summary::-webkit-details-marker]:hidden"
                style={{
                  background: item.isOptional ? "var(--surface-1)" : "var(--surface-0)",
                  border: item.isOptional
                    ? "1px solid var(--accent-primary)"
                    : "1px solid var(--border-subtle)",
                }}
              >
                <summary
                  className="flex cursor-pointer items-center gap-4 px-4 py-3 transition-colors hover:bg-[var(--surface-1)]"
                  aria-label={`${item.name} — click to ${editable ? "edit" : "view details"}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="truncate text-sm font-semibold"
                        style={{ color: "var(--text-default)" }}
                      >
                        {item.name}
                      </span>
                      {item.isOptional && (
                        <span
                          className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                          style={{
                            background: "var(--accent-surface)",
                            color: "var(--accent-primary)",
                          }}
                        >
                          Optional
                        </span>
                      )}
                    </div>
                    <div
                      className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] tabular-nums"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <span>{meta.label}</span>
                      {formula && (
                        <>
                          <span aria-hidden>·</span>
                          <span>{formula}</span>
                        </>
                      )}
                      {canManage && lineMargin != null && (
                        <>
                          <span aria-hidden>·</span>
                          <span
                            style={{
                              color:
                                lineMargin >= 40
                                  ? "var(--success-fg)"
                                  : lineMargin >= 20
                                    ? "var(--accent-primary)"
                                    : "var(--danger-fg)",
                            }}
                            title={`Cost ${formatMoney(lineCostExt ?? 0, ctx.tenant.currency)}`}
                          >
                            {lineMargin.toFixed(1)}% margin
                          </span>
                        </>
                      )}
                    </div>
                    {descPreview && (
                      <div
                        className="mt-1 truncate text-xs"
                        style={{ color: "var(--text-faint, var(--text-muted))" }}
                      >
                        {descPreview}
                      </div>
                    )}
                    {optionSummary && (
                      <div
                        className="mt-0.5 truncate text-[11px]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {optionSummary}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <div
                      className="text-lg font-semibold tabular-nums leading-tight"
                      style={{ color: "var(--text-default)" }}
                    >
                      {formatMoney(item.subtotal.toString(), ctx.tenant.currency)}
                    </div>
                    {item.quantity != null && item.pricingModel === "PER_UNIT" && (
                      <div
                        className="text-[11px] tabular-nums"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Qty {Number(item.quantity)}
                      </div>
                    )}
                  </div>
                  <div
                    aria-hidden
                    className="shrink-0 transition-transform group-open:rotate-180"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <Icon.ChevronDown />
                  </div>
                </summary>

                <div style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <form action={save}>
                    <div className="space-y-3 px-4 py-4">
                      <Field
                        label="Line name"
                        name="name"
                        required
                        defaultValue={item.name}
                      />
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        {item.pricingModel !== "CUSTOM_QUOTE" && (
                          <Field
                            label={`Base${item.unit ? ` / ${item.unit}` : ""}`}
                            name="basePrice"
                            type="number"
                            step="0.01"
                            min="0"
                            defaultValue={item.basePrice.toString()}
                          />
                        )}
                        {meta.inputs.includes("quantity") && (
                          <Field
                            label="Qty"
                            name="quantity"
                            type="number"
                            step="0.01"
                            min="0"
                            defaultValue={item.quantity?.toString() ?? "1"}
                          />
                        )}
                        {meta.inputs.includes("width") && (
                          <Field
                            label="Width (ft)"
                            name="width"
                            type="number"
                            step="0.01"
                            min="0"
                            defaultValue={item.width?.toString() ?? ""}
                          />
                        )}
                        {meta.inputs.includes("height") && (
                          <Field
                            label="Height (ft)"
                            name="height"
                            type="number"
                            step="0.01"
                            min="0"
                            defaultValue={item.height?.toString() ?? ""}
                          />
                        )}
                        {meta.inputs.includes("length") && (
                          <Field
                            label="Length (ft)"
                            name="length"
                            type="number"
                            step="0.01"
                            min="0"
                            defaultValue={item.length?.toString() ?? ""}
                          />
                        )}
                        {meta.inputs.includes("hours") && (
                          <Field
                            label="Hours"
                            name="hours"
                            type="number"
                            step="0.25"
                            min="0"
                            defaultValue={item.hours?.toString() ?? ""}
                          />
                        )}
                        {item.pricingModel === "CUSTOM_QUOTE" && (
                          <Field
                            label="Price (manual)"
                            name="manualPrice"
                            type="number"
                            step="0.01"
                            min="0"
                            defaultValue={item.manualPrice?.toString() ?? ""}
                          />
                        )}
                      </div>

                      <TextArea
                        label="Description"
                        name="description"
                        rows={2}
                        defaultValue={item.description ?? ""}
                      />

                      {hasOptionGroups && (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          {item.product!.optionGroups.map((g) => {
                            const currentLabel = selectedByGroup.get(g.name);
                            const currentId = g.options.find((o) => o.label === currentLabel)?.id ?? "";
                            return (
                              <SelectField
                                key={g.id}
                                label={`${g.name}${g.required ? " *" : ""}`}
                                name={`option_${g.id}`}
                                defaultValue={currentId}
                                options={[
                                  { value: "", label: g.required ? "— select —" : "— none —" },
                                  ...g.options.map((o) => ({
                                    value: o.id,
                                    label: Number(o.priceAdjustment) === 0
                                      ? o.label
                                      : `${o.label} (${Number(o.priceAdjustment) > 0 ? "+" : ""}${formatMoney(o.priceAdjustment.toString(), ctx.tenant.currency)})`,
                                  })),
                                ]}
                              />
                            );
                          })}
                        </div>
                      )}

                      {!item.product && selected.length > 0 && (
                        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                          Options: {optionSummary}
                        </div>
                      )}

                      {hasTierInfo && (
                        <div
                          className="rounded-md px-3 py-2 text-xs"
                          style={{
                            background: "var(--surface-1)",
                            border: "1px solid var(--border-subtle)",
                            color: "var(--text-muted)",
                          }}
                        >
                          {activeTierPrice != null ? (
                            <>Tier price applied: {formatMoney(activeTierPrice, ctx.tenant.currency)} / unit.</>
                          ) : (
                            <>Base price in effect.</>
                          )}
                          {nextTier && (
                            <>
                              {" · "}Next break at {nextTier.minQuantity}+ units:{" "}
                              {formatMoney(nextTier.pricePerUnit, ctx.tenant.currency)} / unit.
                            </>
                          )}
                        </div>
                      )}

                      {canManage && lineMargin == null && item.pricingModel !== "CUSTOM_QUOTE" && (
                        <div
                          className="text-[11px]"
                          style={{ color: "var(--text-muted)" }}
                        >
                          No cost snapshotted — set a cost on the product in the catalog to see margin here.
                        </div>
                      )}

                      <Checkbox
                        label="Taxable"
                        name="taxable"
                        defaultChecked={item.taxable}
                      />
                    </div>

                    {editable && (
                      <div
                        className="flex items-center justify-end gap-2 px-4 py-2"
                        style={{
                          borderTop: "1px solid var(--border-subtle)",
                          background: "var(--surface-1)",
                        }}
                      >
                        <Button type="submit" variant="secondary">
                          Save changes
                        </Button>
                      </div>
                    )}
                  </form>

                  {editable && (
                    <div
                      className="flex flex-wrap items-center gap-2 px-4 py-2"
                      style={{
                        borderTop: "1px solid var(--border-subtle)",
                        background: "var(--surface-0)",
                      }}
                    >
                      {sectionOptions.length > 1 && (
                        <form action={moveItem} className="flex items-center gap-2">
                          <label
                            htmlFor={`move-${item.id}`}
                            className="text-[11px] uppercase tracking-wide"
                            style={{ color: "var(--text-muted)" }}
                          >
                            Section
                          </label>
                          <select
                            id={`move-${item.id}`}
                            name="sectionId"
                            defaultValue={item.sectionId ?? ""}
                            className="rounded-md px-2 py-1 text-xs"
                            style={{
                              background: "var(--panel)",
                              border: "1px solid var(--border)",
                              color: "var(--text)",
                            }}
                          >
                            {sectionOptions.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="rounded-md px-2 py-1 text-[11px]"
                            style={{
                              border: "1px solid var(--border-subtle)",
                              color: "var(--text-muted)",
                            }}
                          >
                            Move
                          </button>
                        </form>
                      )}
                      <div className="ml-auto flex items-center gap-1">
                        <form action={toggleOptional}>
                          <IconActionButton
                            label={item.isOptional ? "Make required" : "Mark optional"}
                          >
                            <Icon.Bookmark />
                          </IconActionButton>
                        </form>
                        <form action={dup}>
                          <IconActionButton label="Duplicate line">
                            <Icon.Products />
                          </IconActionButton>
                        </form>
                        <form action={remove}>
                          <IconActionButton label="Delete line" danger>
                            <Icon.X />
                          </IconActionButton>
                        </form>
                      </div>
                    </div>
                  )}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    );
  }

  const rushPct = ctx.tenant.rushFeePercent;
  const currentSubtotal = Number(quote.subtotal);
  const rushPreview = rushPct > 0 && currentSubtotal > 0
    ? Math.round(currentSubtotal * (rushPct / 100) * 100) / 100
    : 0;
  // advancedPricing gates the rush-fee surcharge. Hide the button at
  // both the page level (here) and the action level (applyRushFee
  // also re-checks). Editable + rushPct > 0 + non-empty subtotal stays
  // as the existing show-when-meaningful logic.
  const hasAdvancedPricing = await isEntitled(ctx.tenant.id, ctx.tenant.plan, "advancedPricing");
  const canApplyRush = editable && rushPct > 0 && currentSubtotal > 0 && hasAdvancedPricing;

  // Preview is always visible in the right rail (Phase 6). The `?preview=1`
  // query param from older bookmarks is ignored — the rail renders either
  // way. Keeping the handler-free `previewItems` / `previewSections`
  // projections below so we can feed them straight into the inline pane.
  const previewItems = quote.items.map((it) => {
    const opts = parseSelectedOptions(it.selectedOptions as unknown);
    return {
      id:            it.id,
      name:          it.name,
      description:   it.description,
      subtotal:      Number(it.subtotal),
      isOptional:    it.isOptional,
      sectionId:     it.sectionId,
      optionSummary: opts.length > 0
        ? opts.map((o) => `${o.groupName}: ${o.label}`).join(" · ")
        : null,
    };
  });
  const previewSections = quote.sections.map((s) => ({
    id:          s.id,
    title:       s.title,
    description: s.description,
  }));

  // Header primary CTA — the single most important action for this status.
  // Rendered right of the total in the sticky header; other transitions live
  // in the compact actions row below.
  let primaryCta: React.ReactNode = null;
  if (canManage) {
    if (quote.status === "DRAFT") {
      primaryCta = (
        <form action={setStatus}>
          <input type="hidden" name="status" value="SENT" />
          <Button type="submit">Send quote</Button>
        </form>
      );
    } else if (quote.status === "SENT" || quote.status === "VIEWED") {
      primaryCta = (
        <form action={setStatus}>
          <input type="hidden" name="status" value="APPROVED" />
          <Button type="submit">Convert to order</Button>
        </form>
      );
    } else if (quote.status === "APPROVED" && quote.order) {
      primaryCta = (
        <Link
          href={`/t/${slug}/orders/${quote.order.id}`}
          className="ts-focus inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors"
          style={{
            background: "var(--accent)",
            color: "white",
          }}
        >
          Open order →
        </Link>
      );
    } else if (quote.status === "DECLINED" || quote.status === "EXPIRED") {
      primaryCta = (
        <form action={setStatus}>
          <input type="hidden" name="status" value="DRAFT" />
          <Button type="submit" variant="secondary">Revert to draft</Button>
        </form>
      );
    }
  }

  const secondaryTransitions = SECONDARY_STATUS_BUTTONS[quote.status] ?? [];

  const expiryDaysLeft = quote.expiresAt
    ? Math.ceil((quote.expiresAt.getTime() - Date.now()) / 86_400_000)
    : null;
  const expiringSoon =
    expiryDaysLeft != null && expiryDaysLeft >= 0 && expiryDaysLeft <= 3 &&
    (quote.status === "SENT" || quote.status === "VIEWED");

  return (
    <div className="space-y-5">
      <div className="text-sm">
        <Link href={`/t/${slug}/quotes`} className="underline" style={{ color: "var(--text-muted)" }}>
          ← Quotes
        </Link>
      </div>

      {sp.error && (
        <div
          className="rounded-md px-3 py-2 text-sm"
          style={{
            background: "var(--danger-surface)",
            color: "var(--danger-fg)",
            border: "1px solid var(--danger-fg)",
          }}
        >
          {sp.error}
        </div>
      )}
      {sp.notice && (
        <div
          className="rounded-md px-4 py-2 text-sm"
          style={{ background: "var(--success-surface)", color: "var(--success-fg)", border: "1px solid var(--success-fg)" }}
        >
          {sp.notice}
        </div>
      )}

      {/* Status-specific banners — conditional, above the sticky header so
          they scroll away on long pages. */}
      {quote.status === "DECLINED" && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "color-mix(in oklab, #ef4444 10%, var(--surface-0))",
            border: "1px solid color-mix(in oklab, #ef4444 40%, var(--border-default))",
          }}
        >
          <div className="font-medium">
            Declined{quote.declinedAt ? <> on {formatDate(quote.declinedAt)}</> : null}
            {quote.declinedReason ? <> · {declinedReasonLabel(quote.declinedReason)}</> : null}
          </div>
          {quote.declinedNote && (
            <div className="mt-1 whitespace-pre-wrap text-xs" style={{ color: "var(--text-muted)" }}>
              {quote.declinedNote}
            </div>
          )}
        </div>
      )}

      {quote.supersededAt && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "var(--warning-surface, #3a2e15)",
            color: "var(--warning-fg, #ffd27a)",
            border: "1px solid var(--warning-fg, #a97a1d)",
          }}
        >
          This quote was superseded by a newer revision on {formatDate(quote.supersededAt)}.
          {" "}
          {(() => {
            const newest = [...revisionChain]
              .filter((r) => !r.supersededAt && r.id !== quote.id)
              .sort((a, b) => b.revisionNumber - a.revisionNumber)[0];
            return newest ? (
              <Link href={`/t/${slug}/quotes/${newest.id}`} className="underline">
                Open rev {newest.revisionNumber} ({newest.number}) →
              </Link>
            ) : null;
          })()}
        </div>
      )}

      {showApprovalBanner && blockers.length > 0 && !quote.approvedToSendAt && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "var(--warning-surface, #3a2e15)",
            color: "var(--warning-fg, #ffd27a)",
            border: "1px solid var(--warning-fg, #5b4620)",
          }}
        >
          <div className="font-medium">
            {pendingApproval ? "Approval pending" : "Needs approval before sending"}
          </div>
          <ul className="mt-1 list-disc pl-5">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          {pendingApproval ? (
            <div className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
              Requested on {formatDate(pendingApproval.createdAt)}
              {pendingApproval.requestedById && (
                <> by {memberMap.get(pendingApproval.requestedById)?.name ?? "a team member"}</>
              )}.{" "}
              <Link href={`/t/${slug}/inbox?chip=approvals`} className="underline">Open approvals inbox</Link>
            </div>
          ) : ctx.can("quotes:approve_exceptions") ? (
            <form action={approveAction} className="mt-3">
              <Button type="submit" variant="secondary">Approve this quote for sending</Button>
            </form>
          ) : (
            <div className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
              Click &ldquo;Send quote&rdquo; to request manager approval, or adjust the discount / total until both rules are satisfied.
            </div>
          )}
        </div>
      )}

      {showApprovalBanner && quote.approvedToSendAt && (
        <div
          className="rounded-md px-4 py-2 text-sm"
          style={{
            background: "var(--success-surface)",
            color: "var(--success-fg)",
            border: "1px solid var(--success-fg)",
          }}
        >
          Approved to send
          {quote.approvedToSendById && (
            <> by {memberMap.get(quote.approvedToSendById)?.name ?? "a manager"}</>
          )}
          {" on "}{formatDate(quote.approvedToSendAt)}.
        </div>
      )}

      {/* STICKY HEADER — ID + status + customer/rep/expiry + total + primary actions.
          Premium-redesigned to match the customer detail status row pattern:
          rounded-2xl card, accent halo, frosted-blur backdrop, 48px customer
          avatar tile, tinted status pill, 22px tabular total. */}
      <header
        className="sticky top-0 z-10 overflow-hidden rounded-2xl"
        style={{
          background:
            "radial-gradient(720px circle at -8% -40%, var(--accent-surface), transparent 55%), " +
            "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
          border: "1px solid var(--border-subtle)",
          boxShadow:
            "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
            "0 2px 8px -2px rgba(0,0,0,0.25)",
          backdropFilter: "saturate(140%) blur(2px)",
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
          <div className="flex min-w-0 flex-1 items-start gap-3.5">
            {/* Customer avatar — 48px gradient tile + accent ring. */}
            <Link
              href={`/t/${slug}/customers/${quote.customer.id}`}
              aria-label={`View ${quote.customer.name}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 48,
                height: 48,
                borderRadius: 12,
                background:
                  "linear-gradient(135deg, var(--accent-surface-strong), var(--accent-surface))",
                color: "var(--accent-primary)",
                border:
                  "1px solid color-mix(in oklab, var(--accent-primary) 30%, transparent)",
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: "0.02em",
                flexShrink: 0,
                boxShadow:
                  "inset 0 1px 0 0 color-mix(in oklab, white 6%, transparent)",
              }}
            >
              {(quote.customer.name ?? "?").trim().charAt(0).toUpperCase() || "?"}
            </Link>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1
                  className="font-semibold"
                  style={{
                    color: "var(--text-default)",
                    fontSize: 22,
                    letterSpacing: "-0.018em",
                    lineHeight: 1.2,
                    fontFeatureSettings: "'tnum' 1",
                  }}
                >
                  {quote.number}
                </h1>
                {/* Status pill — tinted using the existing status hex. */}
                {(() => {
                  const sc = statusColor(quote.status);
                  return (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        padding: "2px 7px",
                        borderRadius: 999,
                        color: sc,
                        background: `color-mix(in oklab, ${sc} 16%, transparent)`,
                        border: `1px solid color-mix(in oklab, ${sc} 32%, transparent)`,
                        lineHeight: 1,
                        whiteSpace: "nowrap",
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: 999,
                          background: sc,
                          boxShadow: `0 0 0 1.5px color-mix(in oklab, ${sc} 25%, transparent)`,
                        }}
                      />
                      {statusLabel(quote.status)}
                    </span>
                  );
                })()}
                {hasRevisions && (
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      padding: "2px 6px",
                      borderRadius: 4,
                      color: "var(--text-muted)",
                      background: "var(--surface-2)",
                      border: "1px solid var(--border-subtle)",
                      lineHeight: 1,
                    }}
                    title="Part of a revision chain"
                  >
                    Rev {quote.revisionNumber} of {revisionChain.length}
                  </span>
                )}
                {expiringSoon && (
                  <span
                    className="inline-flex items-center gap-1.5"
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      padding: "2px 8px",
                      borderRadius: 999,
                      color: "var(--warning-fg, var(--amber-500))",
                      background:
                        "color-mix(in oklab, var(--amber-500) 14%, transparent)",
                      border:
                        "1px solid color-mix(in oklab, var(--amber-500) 30%, transparent)",
                      lineHeight: 1,
                    }}
                    title={`Expires in ${expiryDaysLeft} day${expiryDaysLeft === 1 ? "" : "s"}`}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 999,
                        background: "var(--warning-fg, var(--amber-500))",
                        boxShadow:
                          "0 0 0 2px color-mix(in oklab, var(--amber-500) 25%, transparent)",
                      }}
                    />
                    Expires in {expiryDaysLeft}d
                  </span>
                )}
              </div>
              <div
                className="mt-1.5 truncate"
                style={{
                  color: "var(--text-muted)",
                  fontSize: 12.5,
                  lineHeight: 1.4,
                }}
              >
                For{" "}
                <Link
                  href={`/t/${slug}/customers/${quote.customer.id}`}
                  style={{
                    color: "var(--text-default)",
                    fontWeight: 500,
                    textDecoration: "none",
                  }}
                  className="hover:underline"
                >
                  {quote.customer.name}
                </Link>
                <span style={{ color: "var(--text-faint)" }}> · </span>
                Rep{" "}
                <span style={{ color: "var(--text-default)" }}>
                  {quote.salesRepId ? (memberMap.get(quote.salesRepId)?.name ?? "—") : "—"}
                </span>
                <span style={{ color: "var(--text-faint)" }}> · </span>
                Expires{" "}
                <span style={{ color: "var(--text-default)" }}>
                  {quote.expiresAt ? formatDate(quote.expiresAt) : "—"}
                </span>
                {quote.order && (
                  <>
                    <span style={{ color: "var(--text-faint)" }}> · </span>
                    Order{" "}
                    <Link
                      href={`/t/${slug}/orders/${quote.order.id}`}
                      style={{
                        color: "var(--accent-primary)",
                        fontWeight: 500,
                        textDecoration: "none",
                      }}
                      className="hover:underline"
                    >
                      {quote.order.number}
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right">
              <div
                style={{
                  color: "var(--text-faint)",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  lineHeight: 1.1,
                }}
              >
                Total
              </div>
              <div
                className="mt-1 font-semibold"
                style={{
                  color: "var(--text-default)",
                  fontSize: 22,
                  letterSpacing: "-0.018em",
                  lineHeight: 1.1,
                  fontFeatureSettings: "'tnum' 1",
                }}
              >
                {formatMoney(quote.total.toString(), ctx.tenant.currency)}
              </div>
            </div>
            {canManage && primaryCta && (
              <div className="flex items-center gap-2">
                {primaryCta}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Compact actions row — remaining transitions, rush fee, revise, duplicate, delete.
          Deliberately not sticky; keep the header light. */}
      {canManage &&
        (secondaryTransitions.length > 0 ||
          canApplyRush ||
          quote.status !== "APPROVED") && (
          <div className="flex flex-wrap items-center gap-2">
            {secondaryTransitions.map((b) => {
              if (b.to === "DECLINED") {
                return (
                  <form key={b.to} action={setStatus} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="status" value="DECLINED" />
                    <select
                      name="declinedReason"
                      defaultValue=""
                      className="rounded-md px-2 py-1.5 text-sm outline-none"
                      style={{
                        background: "var(--surface-1)",
                        border: "1px solid var(--border-subtle)",
                        color: "var(--text-default)",
                      }}
                    >
                      <option value="">Reason (optional)…</option>
                      <option value="PRICE">Price too high</option>
                      <option value="COMPETITOR">Went with competitor</option>
                      <option value="TIMING">Timing / not ready</option>
                      <option value="NO_RESPONSE">No response</option>
                      <option value="SCOPE_CHANGE">Scope changed</option>
                      <option value="OTHER">Other</option>
                    </select>
                    <input
                      name="declinedNote"
                      placeholder="Note (optional)"
                      maxLength={500}
                      className="w-48 rounded-md px-2 py-1.5 text-sm outline-none"
                      style={{
                        background: "var(--surface-1)",
                        border: "1px solid var(--border-subtle)",
                        color: "var(--text-default)",
                      }}
                    />
                    <Button type="submit" variant={b.variant ?? "danger"}>{b.label}</Button>
                  </form>
                );
              }
              return (
                <form key={b.to} action={setStatus}>
                  <input type="hidden" name="status" value={b.to} />
                  <Button type="submit" variant={b.variant ?? "secondary"}>{b.label}</Button>
                </form>
              );
            })}
            {canApplyRush && (
              <form action={rush}>
                <Button type="submit" variant="secondary">
                  Add rush fee ({rushPct}% = {formatMoney(rushPreview, ctx.tenant.currency)})
                </Button>
              </form>
            )}
            {quote.status !== "APPROVED" && (
              <form action={revise}>
                <Button type="submit" variant="secondary">Revise</Button>
              </form>
            )}
            <form action={dup}>
              <Button type="submit" variant="secondary">Duplicate</Button>
            </form>
            {quote.status !== "APPROVED" && (
              <form action={del}>
                <Button type="submit" variant="danger">Delete</Button>
              </form>
            )}
          </div>
        )}

      {/* Approved-handoff tiles — only when the quote has been converted. */}
      {quote.status === "APPROVED" && (
        <Card>
          <CardHeader
            title="Approved — hand off to production"
            description={
              quote.approvedAt
                ? `Customer approved on ${formatDate(quote.approvedAt)}. Here's what to do next.`
                : "Customer approved. Here's what to do next."
            }
          />
          <div className="px-5 py-4 space-y-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <HandoffTile
                label="Order"
                value={quote.order ? quote.order.number : "Creating…"}
                status={quote.order ? (quote.order.status ?? "—") : ""}
                href={quote.order ? `/t/${slug}/orders/${quote.order.id}` : null}
                hint={
                  quote.order
                    ? "The order carries the line-item snapshot forward for scheduling and production."
                    : "Approving a quote auto-creates an order. If you don't see one yet, reload."
                }
              />
              <HandoffTile
                label="Deposit"
                value={
                  Number(quote.depositAmount) > 0
                    ? formatMoney(quote.depositAmount.toString(), ctx.tenant.currency)
                    : "None"
                }
                status={
                  quote.depositType === "PERCENT"
                    ? `${Number(quote.depositValue).toString()}%`
                    : quote.depositType === "FIXED"
                      ? "Flat"
                      : ""
                }
                href={quote.order ? `/t/${slug}/orders/${quote.order.id}` : null}
                hint={
                  Number(quote.depositAmount) > 0
                    ? "Record the deposit against the order before production starts."
                    : "No deposit required for this job."
                }
              />
              <HandoffTile
                label="Total"
                value={formatMoney(quote.total.toString(), ctx.tenant.currency)}
                status={`${quote.items.length} line${quote.items.length === 1 ? "" : "s"}`}
                href={null}
                hint="Final agreed total, including tax and discounts."
              />
            </div>
          </div>
        </Card>
      )}

      {/* MAIN WORKSPACE — single-page editor on the left, always-visible
          customer preview on the right (Phase 6). The preview was a
          drawer behind a Preview button in Phase 5 and prior; giving it
          a permanent home cuts one click off every review cycle and
          makes autosave changes visible as the customer will see them. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader
              title="Line items"
              description={
                quote.items.length === 0
                  ? "Start by adding your first product or service below."
                  : `${quote.items.length} line${quote.items.length === 1 ? "" : "s"} · click a row to edit. Group related lines into sections for a cleaner proposal.`
              }
            />

            {editable && (
              <div
                className="px-5 py-4"
                style={{ borderTop: "1px solid var(--border-subtle)" }}
              >
                <AddLineItemBuilder
                  addAction={addItem}
                  addPackageAction={addPkg}
                  products={products.map((p) => ({
                    id: p.id,
                    name: p.name,
                    category: p.category,
                    pricingLabel: pricingMeta(p.pricingModel).label,
                  }))}
                  packages={packages.map((p) => ({
                    id: p.id,
                    name: p.name,
                    componentCount: p._count.components,
                  }))}
                />
              </div>
            )}

            {quote.items.length === 0 && !editable && (
              <div
                className="px-5 py-8 text-center text-sm"
                style={{
                  color: "var(--text-muted)",
                  borderTop: "1px solid var(--border-subtle)",
                }}
              >
                No line items yet.
              </div>
            )}

            {(ungrouped.length > 0 || (quote.sections.length === 0 && quote.items.length > 0)) && (
              <div>
                {quote.sections.length > 0 && ungrouped.length > 0 && (
                  <div
                    className="px-5 py-2 text-[11px] font-medium uppercase tracking-wide"
                    style={{
                      color: "var(--text-muted)",
                      background: "var(--surface-1)",
                      borderTop: "1px solid var(--border-subtle)",
                    }}
                  >
                    Un-grouped
                  </div>
                )}
                <ItemsUL items={ungrouped} />
              </div>
            )}

            {quote.sections.map((section) => {
              const sectionItems = bySection.get(section.id) ?? [];
              const saveSection = updateQuoteSection.bind(null, slug, section.id);
              const removeSection = deleteQuoteSection.bind(null, slug, section.id);
              const sectionTotal = sectionItems
                .filter((it) => !it.isOptional)
                .reduce((sum, it) => sum + Number(it.subtotal), 0);
              const sectionOptionalTotal = sectionItems
                .filter((it) => it.isOptional)
                .reduce((sum, it) => sum + Number(it.subtotal), 0);

              return (
                <div key={section.id}>
                  <div
                    className="flex flex-col gap-2 px-5 py-3"
                    style={{
                      background: "var(--surface-1)",
                      borderTop: "1px solid var(--border-subtle)",
                    }}
                  >
                    {editable ? (
                      <form action={saveSection} className="flex flex-wrap items-end gap-2">
                        <div className="flex-1 min-w-[220px]">
                          <Field
                            label="Section"
                            name="title"
                            required
                            defaultValue={section.title}
                          />
                        </div>
                        <div className="flex-[2] min-w-[260px]">
                          <Field
                            label="Description (optional)"
                            name="description"
                            defaultValue={section.description ?? ""}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button type="submit" variant="secondary">
                            Save
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <div>
                        <div className="text-sm font-semibold">{section.title}</div>
                        {section.description && (
                          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                            {section.description}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs" style={{ color: "var(--text-muted)" }}>
                      <span>
                        {sectionItems.length} {sectionItems.length === 1 ? "line" : "lines"}
                        {" · "}Subtotal {formatMoney(sectionTotal, ctx.tenant.currency)}
                        {sectionOptionalTotal > 0 && (
                          <>
                            {" · "}Optional {formatMoney(sectionOptionalTotal, ctx.tenant.currency)}
                          </>
                        )}
                      </span>
                      {editable && (
                        <form action={removeSection}>
                          <button
                            type="submit"
                            className="text-xs underline"
                            style={{ color: "var(--danger-fg)" }}
                            title="Deleting a section leaves its lines on the quote — they fall into the un-grouped band."
                          >
                            Delete section
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                  {sectionItems.length > 0 ? (
                    <ItemsUL items={sectionItems} />
                  ) : (
                    <div
                      className="px-5 py-4 text-sm"
                      style={{
                        color: "var(--text-muted)",
                        borderTop: "1px solid var(--border-subtle)",
                      }}
                    >
                      No lines in this section yet. Move a line here from the dropdown on each line below, or add a new line and assign it.
                    </div>
                  )}
                </div>
              );
            })}

            {editable && (
              <details
                className="group [&>summary]:list-none [&>summary::-webkit-details-marker]:hidden"
                style={{
                  borderTop: "1px solid var(--border-subtle)",
                  background: "var(--surface-1)",
                }}
              >
                <summary
                  className="flex cursor-pointer items-center justify-between gap-2 px-5 py-2.5 text-xs font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  <span>+ New section</span>
                  <span
                    aria-hidden
                    className="transition-transform group-open:rotate-180"
                  >
                    <Icon.ChevronDown size={14} />
                  </span>
                </summary>
                <form
                  action={addSection}
                  className="flex flex-wrap items-end gap-2 px-5 pb-3"
                >
                  <div className="flex-1 min-w-[220px]">
                    <Field label="Section title" name="title" placeholder="e.g. Installation" required />
                  </div>
                  <div className="flex-[2] min-w-[260px]">
                    <Field
                      label="Description (optional)"
                      name="description"
                      placeholder="e.g. Performed on-site after signage delivery."
                    />
                  </div>
                  <Button type="submit" variant="secondary">Add section</Button>
                </form>
              </details>
            )}
          </Card>

          {/* Former "Details" tab — always visible. Expiration and sales rep
              assignment, autosaved on blur / change. */}
          <Card>
            <CardHeader title="Details" description="Expiration and sales rep assignment. Changes autosave." />
            <AutoSaveForm
              action={saveMeta}
              label="Details"
              className="grid grid-cols-1 gap-4 px-5 py-4 md:grid-cols-2"
            >
              <Field
                label="Expires on"
                name="expiresAt"
                type="date"
                defaultValue={quote.expiresAt ? formatDate(quote.expiresAt) : ""}
              />
              <SelectField
                label="Sales rep"
                name="salesRepId"
                defaultValue={quote.salesRepId ?? ""}
                options={[
                  { value: "", label: "Unassigned" },
                  ...members.map((m) => ({ value: m.userId, label: m.name })),
                ]}
              />
            </AutoSaveForm>
          </Card>

          {/* Former "Pricing" tab — Discount & tax, Deposit, Margin, Save as template. */}
          <Card>
            <CardHeader title="Discount & tax" description="Applied to every non-optional line. Changes autosave." />
            <AutoSaveForm
              action={saveMeta}
              label="Pricing"
              className="grid grid-cols-1 gap-4 px-5 py-4 md:grid-cols-3"
            >
              <SelectField
                label="Discount"
                name="discountType"
                defaultValue={quote.discountType}
                options={[
                  { value: "NONE", label: "No discount" },
                  { value: "FIXED", label: "Flat amount" },
                  { value: "PERCENT", label: "Percent" },
                ]}
              />
              <Field
                label="Discount value"
                name="discountValue"
                type="number"
                step="0.01"
                min="0"
                defaultValue={quote.discountValue.toString()}
                hint="Flat currency or 0–100 for %."
              />
              <Field
                label="Tax rate (%)"
                name="taxRatePercent"
                type="number"
                step="0.0001"
                min="0"
                defaultValue={(Number(quote.taxRate) * 100).toString()}
              />
            </AutoSaveForm>
          </Card>

          {canManage && (
            <Card>
              <CardHeader
                title="Deposit"
                description="Amount required from the customer before production starts. Deposit flows into the order when this quote is approved. Autosaves."
              />
              <AutoSaveForm
                action={saveDeposit}
                label="Deposit"
                className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-2"
              >
                <SelectField
                  label="Deposit type"
                  name="depositType"
                  defaultValue={quote.depositType}
                  options={[
                    { value: "NONE", label: "No deposit" },
                    { value: "FIXED", label: "Flat amount" },
                    { value: "PERCENT", label: "Percent of total" },
                  ]}
                />
                <Field
                  label="Deposit value"
                  name="depositValue"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={quote.depositValue.toString()}
                  hint="Flat currency or 0–100 for %."
                />
              </AutoSaveForm>
            </Card>
          )}

          {canManage && (
            <Card>
              <CardHeader
                title="Margin"
                description="Staff-only. Based on cost snapshots taken when each line was added — historical quotes stay stable even if catalog costs change later."
              />
              <div className="grid grid-cols-1 gap-3 px-5 py-4 text-sm md:grid-cols-3">
                <div
                  className="rounded-md px-3 py-2"
                  style={{
                    background: "var(--surface-1)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <div className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Cost</div>
                  <div className="mt-1 text-lg font-semibold tabular-nums">
                    {linesWithCost > 0 ? formatMoney(costBase, ctx.tenant.currency) : "—"}
                  </div>
                </div>
                <div
                  className="rounded-md px-3 py-2"
                  style={{
                    background: "var(--surface-1)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <div className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Gross profit</div>
                  <div className="mt-1 text-lg font-semibold tabular-nums">
                    {grossProfit != null ? formatMoney(grossProfit, ctx.tenant.currency) : "—"}
                  </div>
                </div>
                <div
                  className="rounded-md px-3 py-2"
                  style={{
                    background: "var(--accent-surface)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <div className="text-xs uppercase tracking-wide" style={{ color: "var(--accent-primary)" }}>Margin</div>
                  <div className="mt-1 text-lg font-semibold tabular-nums" style={{ color: "var(--accent-primary)" }}>
                    {margin != null ? `${margin.toFixed(1)}%` : "—"}
                  </div>
                </div>
                {marginCoverageNote && (
                  <div className="md:col-span-3 text-xs" style={{ color: "var(--text-muted)" }}>
                    {marginCoverageNote}
                  </div>
                )}
              </div>
            </Card>
          )}

          {canManage && (
            <Card>
              <CardHeader
                title="Save as template"
                description="Snapshot this quote's sections and line items into a reusable template. Future quotes created from the template are fully decoupled."
              />
              {/* NOT autosave — save-as-template creates a new template
                  row every time, so we keep an explicit submit. */}
              <form action={saveAsTpl} className="grid grid-cols-1 items-end gap-3 px-5 py-4 md:grid-cols-3">
                <div className="md:col-span-1">
                  <Field label="Template name" name="name" required placeholder="e.g. Standard vehicle wrap" />
                </div>
                <div className="md:col-span-2">
                  <Field
                    label="Internal description (optional)"
                    name="description"
                    placeholder="Who this template is for, when to pick it."
                  />
                </div>
                <div className="md:col-span-3">
                  <Button type="submit" variant="secondary">Save as template</Button>
                </div>
              </form>
            </Card>
          )}

          {/* Former "Notes" tab — customer-facing copy + internal notes, autosaved. */}
          <Card>
            <CardHeader
              title="Notes"
              description="Customer-facing copy and internal context. Customer note and terms are shown on the share link; internal notes are staff-only. Changes autosave."
            />
            <AutoSaveForm action={saveMeta} label="Notes" className="space-y-4 px-5 py-4">
              <TextArea
                label="Customer-facing note"
                name="customerNote"
                rows={3}
                defaultValue={quote.customerNote ?? ""}
              />
              <TextArea
                label="Terms"
                name="terms"
                rows={3}
                defaultValue={quote.terms ?? ""}
              />
              <TextArea
                label="Internal notes"
                name="notes"
                rows={3}
                defaultValue={quote.notes ?? ""}
              />
            </AutoSaveForm>
          </Card>

          {/* Former "Sharing" tab — collapsed into a <details> so it stays
              out of the way until the quote is ready to send. Rendered
              open by default for SENT/VIEWED so reps don't miss the
              share link when following up. */}
          <CollapsibleSection
            id="sharing"
            title="Sharing"
            summary={
              quote.shareToken
                ? "Public link minted · rotate or revoke"
                : "No public link minted yet"
            }
            defaultOpen={quote.status === "SENT" || quote.status === "VIEWED"}
          >
            {canManage && (
              <Card>
                <CardHeader
                  title="Public share link"
                  description="One-click URL for the customer — they can toggle optional add-ons and approve without logging in."
                />
                <div className="px-5 py-4 space-y-3">
                  {quote.shareToken ? (
                    <>
                      <div
                        className="rounded-md px-3 py-2 text-xs font-mono break-all"
                        style={{
                          background: "var(--surface-1)",
                          border: "1px solid var(--border-subtle)",
                          color: "var(--text-default)",
                        }}
                      >
                        /q/{quote.shareToken}
                      </div>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                        Paste the URL above into your outreach email. Revoking disables the link immediately.
                      </div>
                      <div className="flex gap-2">
                        <form action={mintShare}>
                          <Button type="submit" variant="secondary">Rotate token</Button>
                        </form>
                        <form action={revokeShare}>
                          <Button type="submit" variant="danger">Revoke link</Button>
                        </form>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                        No public link minted yet. Generate one when you&apos;re ready to share.
                      </div>
                      <form action={mintShare}>
                        <Button type="submit">Generate share link</Button>
                      </form>
                    </>
                  )}
                </div>
              </Card>
            )}

            {canManage && (
              <Card>
                <CardHeader
                  title="Send update"
                  description="Share this quote status with the customer. The send is logged on their timeline."
                />
                <SendMessageWidget
                  slug={slug}
                  customerId={quote.customerId}
                  customerEmail={quote.customer.email}
                  quoteId={quote.id}
                  returnTo={`/t/${slug}/quotes/${quote.id}`}
                  templates={sendCtx.templates}
                  bag={sendCtx.bag}
                />
              </Card>
            )}
          </CollapsibleSection>

          {/* Files attached to this quote. Mounted as a collapsible so
              the editor stays focused — open when there's artwork /
              reference material to manage. */}
          <CollapsibleSection
            id="files"
            title="Files"
            summary={`${quote.files.filter((f) => !f.archivedAt).length} file${quote.files.filter((f) => !f.archivedAt).length === 1 ? "" : "s"}`}
            defaultOpen={quote.files.length > 0}
          >
            {canManage && (
              <AttachFilesCard
                slug={slug}
                parent={{ kind: "quote", id: quote.id }}
                defaultKind="REFERENCE"
                title="Attach files to this quote"
                description="Reference photos, briefs, mockups — anything that helps shape the job. Drag and drop or click to browse."
              />
            )}
            <FilesCard
              slug={slug}
              files={quote.files}
              parent={{ kind: "quote", id: quote.id }}
              canUpload={canManage}
              backUrl={`/t/${slug}/quotes/${quote.id}`}
              title="Quote files"
              defaultKind="REFERENCE"
              memberMap={memberMap}
              suppressUploadForm
            />
          </CollapsibleSection>

          {/* Former "Activity" tab — timeline, revisions, comments. Tucked
              behind a collapsible because it's reference, not editing. */}
          <CollapsibleSection
            id="activity"
            title="Activity"
            summary={`${quote.comments.length} comment${quote.comments.length === 1 ? "" : "s"}${hasRevisions ? ` · ${revisionChain.length} revisions` : ""}`}
            defaultOpen={false}
          >
            <Card>
              <CardHeader title="Timeline" description="Status milestones for this quote." />
              <div className="grid grid-cols-2 gap-3 px-5 py-4 text-xs sm:grid-cols-3 md:grid-cols-6">
                {QUOTE_STATUSES.map((s) => {
                  const stamp =
                    s.value === "SENT" ? quote.sentAt
                    : s.value === "VIEWED" ? quote.viewedAt
                    : s.value === "APPROVED" ? quote.approvedAt
                    : s.value === "DECLINED" ? quote.declinedAt
                    : s.value === "DRAFT" ? quote.createdAt
                    : s.value === "EXPIRED" ? quote.expiresAt
                    : null;
                  const isActive = quote.status === s.value;
                  return (
                    <div
                      key={s.value}
                      className="rounded-md px-3 py-2"
                      style={{
                        background: isActive ? "var(--accent-surface)" : "var(--surface-1)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      <div
                        className="text-[11px] font-medium uppercase tracking-wide"
                        style={{ color: isActive ? s.color : "var(--text-muted)" }}
                      >
                        {s.label}
                      </div>
                      <div className="mt-1" style={{ color: "var(--text-default)" }}>
                        {stamp ? formatDate(stamp) : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {hasRevisions && (
              <Card>
                <CardHeader
                  title="Revisions"
                  description="Every revision made to this quote. The most recent live revision is highlighted."
                />
                <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                  {revisionChain.map((rev) => {
                    const isCurrent = rev.id === quote.id;
                    const isLive = !rev.supersededAt;
                    return (
                      <li key={rev.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="flex items-center gap-3 text-sm">
                          <span
                            className="rounded-full px-2 py-0.5 text-xs"
                            style={{
                              background: isLive ? "#10b981" : "#6b7280",
                              color: "white",
                            }}
                          >
                            Rev {rev.revisionNumber}
                          </span>
                          {isCurrent ? (
                            <span className="font-medium">{rev.number}</span>
                          ) : (
                            <Link href={`/t/${slug}/quotes/${rev.id}`} className="font-medium underline">
                              {rev.number}
                            </Link>
                          )}
                          <span
                            className="rounded-full px-2 py-0.5 text-xs"
                            style={{ background: statusColor(rev.status), color: "white" }}
                          >
                            {statusLabel(rev.status)}
                          </span>
                          {isCurrent && (
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                              · viewing
                            </span>
                          )}
                          {rev.supersededAt && (
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                              · superseded {formatDate(rev.supersededAt)}
                            </span>
                          )}
                        </div>
                        <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                          {formatMoney(rev.total.toString(), ctx.tenant.currency)}
                          {" · "}Updated {formatDate(rev.updatedAt)}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}

            <CommentThread
              slug={slug}
              parentKind="quote"
              parentId={quote.id}
              comments={quote.comments}
              currentUserId={ctx.userId}
              memberMap={memberMap}
              canModerate={ctx.can("staff:manage")}
            />
          </CollapsibleSection>
        </div>

        {/* RIGHT RAIL — live customer preview. Always rendered; sticky on
            wide screens so the editor and the preview stay side-by-side
            while scrolling. On narrow screens the rail stacks below the
            editor (grid collapses to 1 column). */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <QuotePortalPreview
            mode="inline"
            tenantName={ctx.tenant.name}
            number={quote.number}
            status={quote.status}
            customerName={quote.customer.name}
            expiresAt={quote.expiresAt}
            currency={ctx.tenant.currency}
            subtotal={Number(quote.subtotal)}
            discountType={quote.discountType}
            discountValue={Number(quote.discountValue)}
            discountAmount={Number(quote.discountAmount)}
            taxRate={Number(quote.taxRate)}
            taxAmount={Number(quote.taxAmount)}
            total={Number(quote.total)}
            optionalSubtotal={Number(quote.optionalSubtotal)}
            depositType={quote.depositType}
            depositValue={Number(quote.depositValue)}
            depositAmount={Number(quote.depositAmount)}
            customerNote={quote.customerNote}
            terms={quote.terms}
            items={previewItems}
            sections={previewSections}
          />
        </aside>
      </div>
    </div>
  );
}

/**
 * Collapsible wrapper used for the Sharing + Activity sections. Keeps
 * the single-page editor focused on the most common workflow (edit
 * lines, adjust pricing, write notes) and hides reference / outbound
 * tasks one click away. Summary text shows what's inside without
 * expanding — "Public link minted · rotate or revoke", "3 comments",
 * etc. — so reps can scan the page at a glance.
 */
function CollapsibleSection({
  id,
  title,
  summary,
  defaultOpen,
  children,
}: {
  id: string;
  title: string;
  summary: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      id={id}
      open={defaultOpen}
      className="group rounded-lg [&>summary]:list-none [&>summary::-webkit-details-marker]:hidden"
      style={{
        background: "var(--surface-0)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <summary
        className="flex cursor-pointer items-center justify-between gap-3 px-5 py-3"
        style={{ color: "var(--text-default)" }}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">{title}</span>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {summary}
          </span>
        </div>
        <span
          aria-hidden
          className="transition-transform group-open:rotate-180"
          style={{ color: "var(--text-muted)" }}
        >
          <Icon.ChevronDown size={16} />
        </span>
      </summary>
      <div
        className="space-y-5 px-1 pb-5 pt-1"
        style={{ borderTop: "1px solid var(--border-subtle)" }}
      >
        {children}
      </div>
    </details>
  );
}

type LineItemForFormula = {
  pricingModel: string;
  basePrice: { toString(): string } | number;
  manualPrice?: { toString(): string } | number | null;
  quantity?: { toString(): string } | number | null;
  width?: { toString(): string } | number | null;
  height?: { toString(): string } | number | null;
  length?: { toString(): string } | number | null;
  hours?: { toString(): string } | number | null;
};
function formulaForItem(item: LineItemForFormula, currency: string): string | null {
  const price = Number(item.basePrice);
  const qty = item.quantity != null ? Number(item.quantity) : null;
  const w = item.width != null ? Number(item.width) : null;
  const h = item.height != null ? Number(item.height) : null;
  const l = item.length != null ? Number(item.length) : null;
  const hrs = item.hours != null ? Number(item.hours) : null;
  const fmt = (n: number) => formatMoney(n, currency);
  switch (item.pricingModel) {
    case "FIXED":
      return "Flat fee";
    case "PER_UNIT":
      return qty != null ? `${qty} × ${fmt(price)}` : null;
    case "PER_SQFT":
      return w != null && h != null
        ? `${w} × ${h} ft² × ${qty ?? 1} × ${fmt(price)}/sqft`
        : null;
    case "PER_LINEAR_FT":
      return l != null
        ? `${l} ft × ${qty ?? 1} × ${fmt(price)}/ft`
        : null;
    case "LABOR_HOURLY":
      return hrs != null ? `${hrs} hrs × ${fmt(price)}/hr` : null;
    case "CUSTOM_QUOTE":
      return "Manual price";
    default:
      return null;
  }
}

function Row({ label, value, muted, bold }: { label: string; value: string; muted?: boolean; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: muted ? "var(--text-muted)" : "var(--text-default)" }}>{label}</span>
      <span className={bold ? "text-lg font-semibold" : ""}>{value}</span>
    </div>
  );
}

function IconActionButton({
  label,
  danger,
  children,
}: {
  label: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      title={label}
      aria-label={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--surface-2)]"
      style={{
        color: danger ? "var(--danger-fg)" : "var(--text-muted)",
      }}
    >
      {children}
    </button>
  );
}

function HandoffTile({
  label,
  value,
  status,
  hint,
  href,
}: {
  label: string;
  value: string;
  status?: string;
  hint: string;
  href: string | null;
}) {
  const body = (
    <div
      className="rounded-md px-3 py-3"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      {status && (
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          {status}
        </div>
      )}
      <div className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
        {hint}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}
