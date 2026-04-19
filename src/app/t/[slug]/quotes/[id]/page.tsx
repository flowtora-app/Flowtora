import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { CommentThread } from "@/components/CommentThread";
import { Button, Field, SelectField, TextArea, Checkbox } from "@/components/Field";
import {
  updateQuoteMeta,
  addQuoteItem,
  updateQuoteItem,
  removeQuoteItem,
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
import { PRICING_MODELS, pickTierPrice, pricingMeta, computeLineCost, marginPercent } from "@/lib/pricing";
import { formatMoney, formatDate, humanize } from "@/lib/format";
import { listActiveMembers, memberLookup } from "@/lib/members";
import { SendMessageWidget } from "@/components/SendMessageWidget";
import { loadSendContext } from "@/app/actions/message-templates";
import { getGroupContext } from "@/lib/franchise";

// Phase 23 — browser tab title resolves to the quote number so teammates
// juggling multiple tabs ("which quote was that again?") can tell them apart.
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

// Status transitions exposed as buttons for each current status.
const STATUS_BUTTONS: Record<string, { to: string; label: string; variant?: "primary" | "secondary" | "danger" }[]> = {
  DRAFT:    [{ to: "SENT", label: "Mark as sent" }],
  SENT:     [
    { to: "VIEWED", label: "Mark as viewed", variant: "secondary" },
    { to: "APPROVED", label: "Mark as approved" },
    { to: "DECLINED", label: "Mark as declined", variant: "danger" },
    { to: "DRAFT", label: "Back to draft", variant: "secondary" },
  ],
  VIEWED: [
    { to: "APPROVED", label: "Mark as approved" },
    { to: "DECLINED", label: "Mark as declined", variant: "danger" },
    { to: "DRAFT", label: "Back to draft", variant: "secondary" },
  ],
  APPROVED: [],
  DECLINED: [{ to: "DRAFT", label: "Revert to draft", variant: "secondary" }],
  EXPIRED:  [{ to: "DRAFT", label: "Revert to draft", variant: "secondary" }],
};

export default async function QuoteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "quotes:view");
  const canManage = ctx.can("quotes:manage");

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
      // Phase 9 — sections group line items under headings.
      sections: { orderBy: { sortOrder: "asc" } },
      // Phase 14 — internal quote conversation.
      comments: { orderBy: { createdAt: "asc" }, take: 200 },
    },
  });
  if (!quote) notFound();
  ctx.assertBranchAccess(quote.locationId);

  // Phase 15 Slice D — also surface inherited shared products from the
  // parent group root so franchisees can quote against the canonical catalog.
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
    // Phase 8 — active packages for the "Add package" picker. We only need
    // id + name + a component count so the rep sees what they're about to
    // drop in. The expansion itself re-reads components server-side so the
    // numbers stay fresh.
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
  const buttons = STATUS_BUTTONS[quote.status] ?? [];

  // Phase 18 Slice F — gross margin panel. Each line contributes its snapshot
  // cost extended by the same dimensions that drove its subtotal; lines
  // without a cost snapshot are excluded from the cost base and flagged so
  // the number can't be misread as "all lines covered".
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

  // Phase 13 — compute approval state for this quote. We surface this on any
  // pre-SENT quote so the sales rep isn't surprised by a redirect-with-error
  // when they try to send. Post-SENT quotes don't need the banner.
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

  // Phase 22 Slice A — pending ApprovalRequest for this quote, if any.
  // Surfaced on the banner so the rep can see "waiting on manager" instead
  // of re-clicking send.
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
  // Phase 9 Slice D — one-click "save this quote as a template" so reps
  // don't have to rebuild recurring shapes by hand.
  const saveAsTpl = saveQuoteAsTemplate.bind(null, slug, quote.id);

  // Phase 9 Slice E — load the full revision chain so staff can see every
  // prior version and jump between them. Root is either this quote (if it's
  // the original) or its parent. We pull ALL quotes whose parentQuoteId is
  // the root, plus the root itself.
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

  // Phase 9 — group items by section (null bucket = un-grouped band at top).
  // We render the un-grouped bucket first, then each section in sortOrder.
  const sectionById = new Map(quote.sections.map((s) => [s.id, s]));
  const ungrouped = quote.items.filter((it) => !it.sectionId || !sectionById.has(it.sectionId));
  const bySection = new Map<string, typeof quote.items>();
  for (const s of quote.sections) bySection.set(s.id, [] as typeof quote.items);
  for (const it of quote.items) {
    if (it.sectionId && sectionById.has(it.sectionId)) {
      bySection.get(it.sectionId)!.push(it);
    }
  }

  // Options available in the "move to section" dropdown.
  const sectionOptions = [
    { value: "", label: "— un-grouped —" },
    ...quote.sections.map((s) => ({ value: s.id, label: s.title })),
  ];

  // Phase 9 — per-item render. Extracted as a nested component so we can
  // reuse it inside the un-grouped band and each section's list. Nested
  // component closures are fine in an RSC — this only runs on the server.
  type LineItem = (typeof quote.items)[number];
  function ItemsUL({ items }: { items: LineItem[] }) {
    if (items.length === 0) return null;
    return (
      <ul>
        {items.map((item) => {
          const meta = pricingMeta(item.pricingModel);
          const selected = parseSelectedOptions(item.selectedOptions as unknown);
          const selectedByGroup = new Map(selected.map((o) => [o.groupName, o.label]));
          const save = updateQuoteItem.bind(null, slug, item.id);
          const remove = removeQuoteItem.bind(null, slug, item.id);
          const moveItem = moveQuoteItemToSection.bind(null, slug, item.id);
          const toggleOptional = toggleQuoteItemOptional.bind(null, slug, item.id);

          // Phase 13 — tier hint. Parse the snapshotted tiers and determine
          // whether any apply at the current quantity, so the rep can see
          // why the price is what it is (or how close they are to the next
          // break).
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

          // Phase 8 Slice D — per-line margin. Uses the snapshotted cost
          // so the number is stable even if the catalog later changes. We
          // only show this to staff (quotes:manage) — it's never for the
          // customer-facing portal path, which renders from a different
          // component anyway. Missing cost → no badge.
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

          return (
            <li
              key={item.id}
              className="px-5 py-4"
              style={{
                borderTop: "1px solid var(--border-subtle)",
                // Phase 9 — dim optional rows a touch so they read visually
                // as "not counted in the main total".
                background: item.isOptional ? "var(--surface-1)" : undefined,
              }}
            >
              <form action={save} className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <Field label="Name" name="name" required defaultValue={item.name} />
                  </div>
                  <div className="text-right text-sm">
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {meta.label} subtotal
                      {item.isOptional && (
                        <span
                          className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]"
                          style={{
                            background: "var(--accent-surface)",
                            color: "var(--accent-primary)",
                          }}
                          title="Optional line — excluded from the main total. Rolled up as 'Optional add-ons' instead."
                        >
                          Optional
                        </span>
                      )}
                    </div>
                    <div className="text-lg font-semibold">{formatMoney(item.subtotal.toString(), ctx.tenant.currency)}</div>
                    {canManage && lineMargin != null && (
                      <div
                        className="mt-0.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                        style={{
                          background:
                            lineMargin >= 40
                              ? "var(--success-surface)"
                              : lineMargin >= 20
                                ? "var(--accent-surface)"
                                : "var(--danger-surface)",
                          color:
                            lineMargin >= 40
                              ? "var(--success-fg)"
                              : lineMargin >= 20
                                ? "var(--accent-primary)"
                                : "var(--danger-fg)",
                        }}
                        title={`Cost ${formatMoney(lineCostExt ?? 0, ctx.tenant.currency)} → ${lineMargin.toFixed(1)}% margin`}
                      >
                        {lineMargin.toFixed(1)}% margin
                      </div>
                    )}
                    {canManage && lineMargin == null && item.pricingModel !== "CUSTOM_QUOTE" && (
                      <div
                        className="mt-0.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px]"
                        style={{
                          background: "var(--surface-2)",
                          color: "var(--text-muted)",
                        }}
                        title="No cost snapshotted when this line was added — set a cost on the product to see margin next time."
                      >
                        no cost
                      </div>
                    )}
                  </div>
                </div>

                <TextArea label="Description" name="description" rows={2} defaultValue={item.description ?? ""} />

                {/* Pricing model inputs */}
                <div className="grid grid-cols-5 gap-3">
                  {item.pricingModel !== "CUSTOM_QUOTE" && (
                    <Field
                      label={`Base price${item.unit ? ` / ${item.unit}` : ""}`}
                      name="basePrice"
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={item.basePrice.toString()}
                    />
                  )}
                  {meta.inputs.includes("quantity") && (
                    <Field label="Quantity" name="quantity" type="number" step="0.01" min="0"
                      defaultValue={item.quantity?.toString() ?? "1"} />
                  )}
                  {meta.inputs.includes("width") && (
                    <Field label="Width (ft)" name="width" type="number" step="0.01" min="0"
                      defaultValue={item.width?.toString() ?? ""} />
                  )}
                  {meta.inputs.includes("height") && (
                    <Field label="Height (ft)" name="height" type="number" step="0.01" min="0"
                      defaultValue={item.height?.toString() ?? ""} />
                  )}
                  {meta.inputs.includes("length") && (
                    <Field label="Length (ft)" name="length" type="number" step="0.01" min="0"
                      defaultValue={item.length?.toString() ?? ""} />
                  )}
                  {meta.inputs.includes("hours") && (
                    <Field label="Hours" name="hours" type="number" step="0.25" min="0"
                      defaultValue={item.hours?.toString() ?? ""} />
                  )}
                  {item.pricingModel === "CUSTOM_QUOTE" && (
                    <Field label="Price (manual)" name="manualPrice" type="number" step="0.01" min="0"
                      defaultValue={item.manualPrice?.toString() ?? ""} />
                  )}
                </div>

                {/* Option groups (only if product still exists) */}
                {item.product && item.product.optionGroups.length > 0 && (
                  <div className="grid grid-cols-3 gap-3">
                    {item.product.optionGroups.map((g) => {
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

                {/* Read-only snapshot for detached products */}
                {!item.product && selected.length > 0 && (
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Options: {selected.map((o) => `${o.groupName}: ${o.label}`).join(" · ")}
                  </div>
                )}

                {/* Phase 13 — quantity break hint */}
                {tierApplies && tiers.length > 0 && (
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {activeTierPrice != null ? (
                      <>
                        Tier price applied: {formatMoney(activeTierPrice, ctx.tenant.currency)} / unit.
                      </>
                    ) : (
                      <>Base price in effect.</>
                    )}
                    {nextTier && (
                      <>
                        {" "}Next break at {nextTier.minQuantity}+ units:{" "}
                        {formatMoney(nextTier.pricePerUnit, ctx.tenant.currency)} / unit.
                      </>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <Checkbox label="Taxable" name="taxable" defaultChecked={item.taxable} />
                  {editable && (
                    <div className="flex gap-2">
                      <Button type="submit" variant="secondary">Save row</Button>
                    </div>
                  )}
                </div>
              </form>

              {/* Phase 9 — per-line controls: move to section, optional toggle, remove. */}
              {editable && (
                <div
                  className="mt-3 flex flex-wrap items-end gap-3 rounded-md px-3 py-2"
                  style={{
                    background: "var(--surface-2)",
                    border: "1px dashed var(--border-subtle)",
                  }}
                >
                  <form action={moveItem} className="flex items-end gap-2">
                    <div className="min-w-[200px]">
                      <SelectField
                        label="Section"
                        name="sectionId"
                        defaultValue={item.sectionId ?? ""}
                        options={sectionOptions}
                      />
                    </div>
                    <Button type="submit" variant="secondary">Move</Button>
                  </form>

                  <form action={toggleOptional} className="ml-auto flex items-center gap-2">
                    <Button type="submit" variant="secondary">
                      {item.isOptional ? "Make required" : "Mark as optional"}
                    </Button>
                  </form>

                  <form action={remove}>
                    <button
                      type="submit"
                      className="text-xs underline"
                      style={{ color: "var(--danger-fg)" }}
                    >
                      Remove line
                    </button>
                  </form>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  // Phase 13 — rush fee. Only offered while the quote is still editable and
  // the tenant has actually configured a rush %. Shows a preview so the rep
  // can decide before clicking.
  const rushPct = ctx.tenant.rushFeePercent;
  const currentSubtotal = Number(quote.subtotal);
  const rushPreview = rushPct > 0 && currentSubtotal > 0
    ? Math.round(currentSubtotal * (rushPct / 100) * 100) / 100
    : 0;
  const canApplyRush = editable && rushPct > 0 && currentSubtotal > 0;

  return (
    <div className="space-y-6">
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

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{quote.number}</h1>
            <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: statusColor(quote.status), color: "white" }}>
              {statusLabel(quote.status)}
            </span>
            {hasRevisions && (
              <span
                className="rounded-full px-2 py-0.5 text-xs"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-muted)",
                }}
                title="Part of a revision chain"
              >
                Rev {quote.revisionNumber} of {revisionChain.length}
              </span>
            )}
          </div>
          <div className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            For <Link href={`/t/${slug}/customers/${quote.customer.id}`} className="underline">{quote.customer.name}</Link>
            {" · "}Sales rep: {quote.salesRepId ? (memberMap.get(quote.salesRepId)?.name ?? "—") : "—"}
            {quote.expiresAt && <>{" · "}Expires {formatDate(quote.expiresAt)}</>}
            {quote.order && (
              <>{" · "}Order <Link href={`/t/${slug}/orders/${quote.order.id}`} className="underline">{quote.order.number}</Link></>
            )}
          </div>
        </div>
        {canManage && (
          <div className="flex gap-2">
            {/* Revise is the right action when a live quote needs pricing
                or scope changes — it keeps the chain intact. Duplicate
                stays available for starting a fully unrelated quote from
                this one as a template-in-disguise. */}
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
      </div>

      {/* Phase 9 Slice E — superseded banner. A newer revision exists, so
          anything in this quote is stale. Don't hide the quote — staff may
          still need to reference it — but make the state unmistakable. */}
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
            // Link to the newest live revision in the chain, if any.
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

      {/* Phase 9 Slice E — approved-quote handoff card. Once a quote is
          APPROVED, the sales conversation is done and the operational
          conversation starts. We pull the important next-step links into
          a single panel so a rep doesn't have to go hunting for the order
          or the deposit invoice after a win. */}
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
            {quote.order && (
              <div className="flex gap-2">
                <Link href={`/t/${slug}/orders/${quote.order.id}`}>
                  <Button type="button">Open order</Button>
                </Link>
                <Link href={`/t/${slug}/orders/${quote.order.id}#payments`}>
                  <Button type="button" variant="secondary">Record payment</Button>
                </Link>
                <Link href={`/t/${slug}/customers/${quote.customerId}`}>
                  <Button type="button" variant="secondary">Customer page</Button>
                </Link>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Phase 13 — approval banner. Only relevant while the quote is a DRAFT. */}
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
              <Link href={`/t/${slug}/approvals`} className="underline">Open approvals inbox</Link>
            </div>
          ) : ctx.can("quotes:approve_exceptions") ? (
            <form action={approveAction} className="mt-3">
              <Button type="submit" variant="secondary">Approve this quote for sending</Button>
            </form>
          ) : (
            <div className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
              Click &ldquo;Mark as sent&rdquo; to request manager approval, or adjust the discount / total until both rules are satisfied.
            </div>
          )}
        </div>
      )}
      {/* Phase 22 Slice A — surface notice/error params from approval flow. */}
      {sp.notice && (
        <div
          className="rounded-md px-4 py-2 text-sm"
          style={{ background: "var(--success-surface)", color: "var(--success-fg)", border: "1px solid var(--success-fg)" }}
        >
          {sp.notice}
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

      {/* Status transitions + Phase 13 rush fee */}
      {canManage && (buttons.length > 0 || canApplyRush) && (
        <Card>
          <div className="flex flex-wrap items-center gap-2 px-5 py-3">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>Actions:</span>
            {buttons.map((b) => {
              const action = changeQuoteStatus.bind(null, slug, quote.id);
              return (
                <form key={b.to} action={action}>
                  <input type="hidden" name="status" value={b.to} />
                  <Button type="submit" variant={b.variant ?? "primary"}>{b.label}</Button>
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
          </div>
        </Card>
      )}

      {/* Line items */}
      <Card>
        <CardHeader
          title="Line items"
          description={
            quote.items.length === 0
              ? "Add products below to get started."
              : "Group lines into sections (Signage, Install, Optional upgrades…) to make the customer proposal easier to read."
          }
        />

        {/* Un-grouped band */}
        {(ungrouped.length > 0 || quote.sections.length === 0) && (
          <div>
            {quote.sections.length > 0 && ungrouped.length > 0 && (
              <div
                className="px-5 py-2 text-xs uppercase tracking-wide"
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

        {/* Sections */}
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

        {/* Add section */}
        {editable && (
          <form
            action={addSection}
            className="flex flex-wrap items-end gap-2 px-5 py-3"
            style={{
              borderTop: "1px solid var(--border-subtle)",
              background: "var(--surface-1)",
            }}
          >
            <div className="flex-1 min-w-[220px]">
              <Field label="New section title" name="title" placeholder="e.g. Installation" required />
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
        )}

        {/* Add item */}
        {editable && (
          <div className="px-5 py-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            {/* Phase 8 — package expansion. Only shown if the shop has at
                least one active template; otherwise the UI just skips to
                the per-line adds below so newcomers aren't shown an empty
                picker. Each expansion is one server round-trip and ends
                with a revalidate of this page. */}
            {packages.length > 0 && (
              <form
                action={addPkg}
                className="mb-4 grid grid-cols-5 items-end gap-3 rounded-md px-3 py-3"
                style={{
                  background: "var(--surface-1)",
                  border: "1px dashed var(--border-subtle)",
                }}
              >
                <div className="col-span-4">
                  <SelectField
                    label="Add package (expands into multiple lines)"
                    name="packageId"
                    defaultValue=""
                    options={[
                      { value: "", label: "— pick a template —" },
                      ...packages.map((p) => ({
                        value: p.id,
                        label: `${p.name} · ${p._count.components} component${p._count.components === 1 ? "" : "s"}`,
                      })),
                    ]}
                  />
                </div>
                <Button type="submit" variant="secondary">
                  Expand
                </Button>
              </form>
            )}

            <div className="text-sm font-medium">Add line item</div>

            <form action={addItem} className="mt-3 grid grid-cols-4 items-end gap-3">
              <div className="col-span-3">
                <SelectField
                  label="From catalog"
                  name="productId"
                  defaultValue=""
                  options={[
                    { value: "", label: "— pick a product —" },
                    ...products.map((p) => ({
                      value: p.id,
                      label: `${p.name}${p.category ? ` — ${p.category}` : ""} — ${pricingMeta(p.pricingModel).label}`,
                    })),
                  ]}
                />
              </div>
              <Button type="submit" variant="secondary">Add</Button>
            </form>

            <form action={addItem} className="mt-3 grid grid-cols-6 items-end gap-3">
              <div className="col-span-2">
                <Field label="Or ad-hoc — name" name="name" placeholder="e.g. Rush surcharge" />
              </div>
              <div className="col-span-2">
                <SelectField
                  label="Pricing model"
                  name="pricingModel"
                  defaultValue="FIXED"
                  options={PRICING_MODELS.map((m) => ({ value: m.value, label: m.label }))}
                />
              </div>
              <Field label="Base price" name="basePrice" type="number" step="0.01" min="0" defaultValue="0" />
              <Button type="submit" variant="secondary">Add</Button>
            </form>
          </div>
        )}
      </Card>

      {/* Totals + meta grid */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2">
          <CardHeader title="Quote settings" />
          <form action={saveMeta} className="grid grid-cols-2 gap-4 px-5 py-4">
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
            <div /> {/* spacer */}
            <div className="col-span-2">
              <TextArea label="Customer-facing note" name="customerNote" rows={2} defaultValue={quote.customerNote ?? ""} />
            </div>
            <div className="col-span-2">
              <TextArea label="Terms" name="terms" rows={2} defaultValue={quote.terms ?? ""} />
            </div>
            <div className="col-span-2">
              <TextArea label="Internal notes" name="notes" rows={2} defaultValue={quote.notes ?? ""} />
            </div>
            {editable && (
              <div className="col-span-2">
                <Button type="submit">Save settings</Button>
              </div>
            )}
          </form>
        </Card>

        <Card>
          <CardHeader title="Totals" />
          <div className="space-y-2 px-5 py-4 text-sm">
            <Row label="Subtotal" value={formatMoney(quote.subtotal.toString(), ctx.tenant.currency)} />
            {Number(quote.discountAmount) > 0 && (
              <Row
                label={`Discount (${quote.discountType === "PERCENT" ? `${Number(quote.discountValue)}%` : humanize(quote.discountType)})`}
                value={`− ${formatMoney(quote.discountAmount.toString(), ctx.tenant.currency)}`}
                muted
              />
            )}
            <Row
              label={`Tax (${(Number(quote.taxRate) * 100).toFixed(Number(quote.taxRate) * 100 < 1 ? 3 : 2)}%)`}
              value={formatMoney(quote.taxAmount.toString(), ctx.tenant.currency)}
              muted
            />
            <div style={{ borderTop: "1px solid var(--border-subtle)" }} className="pt-2">
              <Row
                label="Total"
                value={formatMoney(quote.total.toString(), ctx.tenant.currency)}
                bold
              />
            </div>

            {/* Phase 9 — optional rollup. Only shown when at least one line
                is marked optional. Separated visually so no one reads it as
                part of the committed total. */}
            {Number(quote.optionalSubtotal) > 0 && (
              <div
                className="mt-3 rounded-md px-3 py-2"
                style={{
                  background: "var(--accent-surface)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div
                  className="text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--accent-primary)" }}
                >
                  Optional add-ons (not included)
                </div>
                <Row
                  label="Optional subtotal"
                  value={formatMoney(quote.optionalSubtotal.toString(), ctx.tenant.currency)}
                />
                <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  Customers can accept any of these from the share link. Accepted lines flip to required and the total re-computes.
                </div>
              </div>
            )}

            {/* Phase 9 — deposit rollup. Only shown when a deposit is configured. */}
            {quote.depositType !== "NONE" && Number(quote.depositAmount) > 0 && (
              <div
                className="mt-3 rounded-md px-3 py-2"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div
                  className="text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)" }}
                >
                  Deposit required
                </div>
                <Row
                  label={
                    quote.depositType === "PERCENT"
                      ? `Deposit (${Number(quote.depositValue)}% of total)`
                      : "Deposit (flat)"
                  }
                  value={formatMoney(quote.depositAmount.toString(), ctx.tenant.currency)}
                  bold
                />
                <Row
                  label="Balance on completion"
                  value={formatMoney(
                    Math.max(0, Number(quote.total) - Number(quote.depositAmount)),
                    ctx.tenant.currency,
                  )}
                  muted
                />
              </div>
            )}

            {/* Phase 18 Slice F — gross margin (staff-only; this card is only
                rendered on the internal quote editor). Computed from cost
                snapshots on each line so historical quotes stay stable. */}
            {canManage && (
              <div
                className="mt-3 rounded-md px-3 py-2"
                style={{
                  background: "var(--accent-surface)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div
                  className="text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--accent-primary)" }}
                >
                  Internal — margin
                </div>
                <div className="mt-1.5 flex items-center justify-between text-sm">
                  <span style={{ color: "var(--text-muted)" }}>Cost</span>
                  <span className="tabular-nums">
                    {linesWithCost > 0
                      ? formatMoney(costBase, ctx.tenant.currency)
                      : "—"}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-sm">
                  <span style={{ color: "var(--text-muted)" }}>Gross profit</span>
                  <span className="tabular-nums">
                    {grossProfit != null
                      ? formatMoney(grossProfit, ctx.tenant.currency)
                      : "—"}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-sm font-semibold">
                  <span style={{ color: "var(--text-default)" }}>Margin</span>
                  <span className="tabular-nums">
                    {margin != null ? `${margin.toFixed(1)}%` : "—"}
                  </span>
                </div>
                {marginCoverageNote && (
                  <div className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                    {marginCoverageNote}
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Phase 9 — Deposit + share link */}
      {canManage && (
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader
              title="Deposit"
              description="Amount required from the customer before production starts. Deposit flows into the order when this quote is approved."
            />
            <form action={saveDeposit} className="grid grid-cols-2 gap-3 px-5 py-4">
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
              {editable && (
                <div className="col-span-2">
                  <Button type="submit" variant="secondary">Save deposit</Button>
                </div>
              )}
            </form>
          </Card>

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
        </div>
      )}

      {/* Phase 9 Slice D — Save as template */}
      {canManage && (
        <Card>
          <CardHeader
            title="Save as template"
            description="Snapshot this quote's sections and line items into a reusable template. Future quotes created from the template are fully decoupled — they won't change if you later edit this quote."
          />
          <form action={saveAsTpl} className="grid grid-cols-3 items-end gap-3 px-5 py-4">
            <div className="col-span-1">
              <Field label="Template name" name="name" required placeholder="e.g. Standard vehicle wrap" />
            </div>
            <div className="col-span-2">
              <Field
                label="Internal description (optional)"
                name="description"
                placeholder="Who this template is for, when to pick it."
              />
            </div>
            <div className="col-span-3">
              <Button type="submit" variant="secondary">Save as template</Button>
            </div>
          </form>
        </Card>
      )}

      {/* Phase 9 Slice E — revision history. Only render if there's more
          than one entry in the chain, otherwise it's just noise. */}
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

      {/* Timeline strip */}
      <Card>
        <CardHeader title="Timeline" />
        <div className="grid grid-cols-6 gap-0 px-5 py-3 text-xs">
          {QUOTE_STATUSES.map((s) => {
            const stamp =
              s.value === "SENT" ? quote.sentAt
              : s.value === "VIEWED" ? quote.viewedAt
              : s.value === "APPROVED" ? quote.approvedAt
              : s.value === "DECLINED" ? quote.declinedAt
              : s.value === "DRAFT" ? quote.createdAt
              : s.value === "EXPIRED" ? quote.expiresAt
              : null;
            return (
              <div key={s.value}>
                <div style={{ color: quote.status === s.value ? s.color : "var(--text-muted)" }}>{s.label}</div>
                <div style={{ color: "var(--text-muted)" }}>{stamp ? formatDate(stamp) : "—"}</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Phase 14 — customer-facing send. */}
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

      {/* Phase 14 — quote-level internal discussion. */}
      <CommentThread
        slug={slug}
        parentKind="quote"
        parentId={quote.id}
        comments={quote.comments}
        currentUserId={ctx.userId}
        memberMap={memberMap}
        canModerate={ctx.can("staff:manage")}
      />
    </div>
  );
}

function Row({ label, value, muted, bold }: { label: string; value: string; muted?: boolean; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: muted ? "var(--text-muted)" : "var(--text-default)" }}>{label}</span>
      <span className={bold ? "text-lg font-semibold" : ""}>{value}</span>
    </div>
  );
}

// Phase 9 Slice E — tile used inside the approved-handoff card. The value
// is the primary number; status is a small qualifier underneath; hint is
// the "why this matters" text. If `href` is provided, the whole tile is
// clickable so the rep doesn't have to aim for tiny links.
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
