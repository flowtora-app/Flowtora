import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { Field, SelectField, TextArea, Button, Checkbox } from "@/components/Field";
import {
  updateQuoteTemplate,
  deleteQuoteTemplate,
  addTemplateSection,
  deleteTemplateSection,
  addTemplateItem,
  removeTemplateItem,
} from "@/app/actions/quote-templates";
import { PRICING_MODELS, pricingMeta } from "@/lib/pricing";
import { getGroupContext } from "@/lib/franchise";
import { formatDate } from "@/lib/format";

// Phase 9 Slice D — Template detail. Mirrors the quote builder's shape
// (settings + sections + line items) without the live-totals machinery,
// because a template has no quantities resolved yet — it's a shape, not
// a priced quote.

export default async function QuoteTemplateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "quotes:view");
  const canManage = ctx.can("quotes:manage");

  const tpl = await db.quoteTemplate.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      sections: { orderBy: { sortOrder: "asc" } },
      items: {
        orderBy: { sortOrder: "asc" },
        include: { product: { select: { id: true, name: true } } },
      },
    },
  });
  if (!tpl) notFound();

  // Products list — own + shared from parent group — matching the quote
  // builder so reps see the same catalog when authoring a template.
  const groupCtx = await getGroupContext(ctx.tenant.id);
  const productSelect = {
    id: true, name: true, pricingModel: true, category: true,
  } as const;
  const [ownProducts, sharedProducts] = await Promise.all([
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
  ]);
  const products = [
    ...ownProducts,
    ...sharedProducts.map((p) => ({ ...p, name: `[Shared] ${p.name}` })),
  ];

  // Group items by section for display.
  const ungrouped = tpl.items.filter((it) => !it.sectionId);
  const bySection = new Map<string, typeof tpl.items>();
  for (const s of tpl.sections) bySection.set(s.id, []);
  for (const it of tpl.items) {
    if (it.sectionId && bySection.has(it.sectionId)) {
      bySection.get(it.sectionId)!.push(it);
    }
  }

  const sectionOptions = [
    { value: "", label: "— Un-grouped —" },
    ...tpl.sections.map((s) => ({ value: s.id, label: s.title })),
  ];

  const saveMeta    = updateQuoteTemplate.bind(null, slug, tpl.id);
  const delTemplate = deleteQuoteTemplate.bind(null, slug, tpl.id);
  const addSection  = addTemplateSection.bind(null, slug, tpl.id);
  const addItem     = addTemplateItem.bind(null, slug, tpl.id);

  type Item = (typeof tpl.items)[number];

  function ItemsUL({ items }: { items: Item[] }) {
    return (
      <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
        {items.map((it) => {
          const meta = pricingMeta(it.pricingModel);
          return (
            <li key={it.id} className="flex items-start justify-between gap-4 px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{it.name}</span>
                  {it.isOptional && (
                    <span
                      className="rounded-full px-2 py-0.5 text-xs"
                      style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
                    >
                      Optional
                    </span>
                  )}
                  {it.product && (
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      · from catalog
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  {meta.label}
                  {it.basePrice != null && (
                    <>
                      {" · base "}
                      {Number(it.basePrice).toFixed(2)}
                    </>
                  )}
                  {it.unit && <> · {it.unit}</>}
                  {it.wasteFactorPct != null && Number(it.wasteFactorPct) > 0 && (
                    <> · waste {Number(it.wasteFactorPct)}%</>
                  )}
                </div>
                {it.description && (
                  <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    {it.description}
                  </div>
                )}
              </div>
              {canManage && (
                <form action={removeTemplateItem.bind(null, slug, it.id)}>
                  <Button type="submit" variant="secondary">Remove</Button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <Link href={`/t/${slug}/quotes/templates`} className="underline" style={{ color: "var(--muted)" }}>
          ← Templates
        </Link>
      </div>

      {sp.error && (
        <div className="rounded-md px-3 py-2 text-sm" style={{ background: "#3a1517", color: "#ff8b8b", border: "1px solid #5b2024" }}>
          {sp.error}
        </div>
      )}

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{tpl.name}</h1>
            <span
              className="rounded-full px-2 py-0.5 text-xs"
              style={{
                background: tpl.active ? "#10b981" : "#6b7280",
                color: "white",
              }}
            >
              {tpl.active ? "Active" : "Archived"}
            </span>
          </div>
          <div className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            {tpl.items.length} {tpl.items.length === 1 ? "line" : "lines"} ·{" "}
            {tpl.sections.length} {tpl.sections.length === 1 ? "section" : "sections"} · Updated{" "}
            {formatDate(tpl.updatedAt)}
          </div>
        </div>
      </div>

      {/* Settings */}
      <Card>
        <CardHeader title="Template settings" />
        <form action={saveMeta} className="grid grid-cols-2 gap-4 px-5 py-4">
          <div className="col-span-2">
            <Field label="Template name" name="name" defaultValue={tpl.name} required />
          </div>
          <div className="col-span-2">
            <TextArea
              label="Internal description"
              name="description"
              rows={2}
              defaultValue={tpl.description ?? ""}
            />
          </div>

          <SelectField
            label="Default discount"
            name="discountType"
            defaultValue={tpl.discountType}
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
            defaultValue={tpl.discountValue.toString()}
            hint="Flat currency or 0–100 for %."
          />

          <SelectField
            label="Default deposit"
            name="depositType"
            defaultValue={tpl.depositType}
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
            defaultValue={tpl.depositValue.toString()}
            hint="Flat currency or 0–100 for %."
          />

          <div className="col-span-2">
            <TextArea
              label="Default customer-facing note"
              name="customerNote"
              rows={2}
              defaultValue={tpl.customerNote ?? ""}
            />
          </div>
          <div className="col-span-2">
            <TextArea label="Default terms" name="terms" rows={3} defaultValue={tpl.terms ?? ""} />
          </div>
          <div className="col-span-2">
            <Checkbox label="Active (available in new-quote picker)" name="active" defaultChecked={tpl.active} />
          </div>
          {canManage && (
            <div className="col-span-2 flex gap-2">
              <Button type="submit">Save settings</Button>
            </div>
          )}
        </form>
      </Card>

      {/* Sections + lines */}
      <Card>
        <CardHeader
          title="Sections & line items"
          description="Group lines under headings for readability on the customer view. Un-grouped lines render first."
        />

        {/* Un-grouped */}
        <div>
          <div
            className="px-5 py-3 text-sm font-medium"
            style={{
              background: "var(--surface-1)",
              borderTop: "1px solid var(--border-subtle)",
            }}
          >
            Un-grouped
            <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>
              {ungrouped.length} {ungrouped.length === 1 ? "line" : "lines"}
            </span>
          </div>
          {ungrouped.length > 0 ? (
            <ItemsUL items={ungrouped} />
          ) : (
            <div
              className="px-5 py-4 text-sm"
              style={{
                color: "var(--text-muted)",
                borderTop: "1px solid var(--border-subtle)",
              }}
            >
              No un-grouped lines.
            </div>
          )}
        </div>

        {/* Section blocks */}
        {tpl.sections.map((section) => {
          const sectionItems = bySection.get(section.id) ?? [];
          return (
            <div key={section.id}>
              <div
                className="flex items-center justify-between gap-2 px-5 py-3"
                style={{
                  background: "var(--surface-1)",
                  borderTop: "1px solid var(--border-subtle)",
                }}
              >
                <div>
                  <div className="text-sm font-medium">{section.title}</div>
                  {section.description && (
                    <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                      {section.description}
                    </div>
                  )}
                </div>
                {canManage && (
                  <form action={deleteTemplateSection.bind(null, slug, section.id)}>
                    <Button type="submit" variant="secondary">
                      Delete section
                    </Button>
                  </form>
                )}
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
                  No lines in this section yet.
                </div>
              )}
            </div>
          );
        })}

        {/* Add section */}
        {canManage && (
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
                placeholder="Sub-heading blurb shown under the title."
              />
            </div>
            <Button type="submit" variant="secondary">Add section</Button>
          </form>
        )}

        {/* Add item */}
        {canManage && (
          <div className="px-5 py-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <div className="text-sm font-medium">Add line item</div>

            <form action={addItem} className="mt-3 grid grid-cols-5 items-end gap-3">
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
              <SelectField
                label="Section"
                name="sectionId"
                defaultValue=""
                options={sectionOptions}
              />
              <Button type="submit" variant="secondary">Add</Button>
            </form>

            <form action={addItem} className="mt-3 grid grid-cols-6 items-end gap-3">
              <div className="col-span-2">
                <Field label="Or ad-hoc — name" name="name" placeholder="e.g. Rush surcharge" />
              </div>
              <div>
                <SelectField
                  label="Pricing model"
                  name="pricingModel"
                  defaultValue="FIXED"
                  options={PRICING_MODELS.map((m) => ({ value: m.value, label: m.label }))}
                />
              </div>
              <Field
                label="Base price"
                name="basePrice"
                type="number"
                step="0.01"
                min="0"
                defaultValue="0"
              />
              <SelectField
                label="Section"
                name="sectionId"
                defaultValue=""
                options={sectionOptions}
              />
              <Button type="submit" variant="secondary">Add</Button>
            </form>
          </div>
        )}
      </Card>

      {/* Danger zone */}
      {canManage && (
        <Card>
          <CardHeader
            title="Delete template"
            description="Removes the template. Quotes already created from it are unaffected — each quote is a fully decoupled snapshot."
          />
          <form action={delTemplate} className="px-5 py-4">
            <Button type="submit" variant="danger">Delete template</Button>
          </form>
        </Card>
      )}
    </div>
  );
}
