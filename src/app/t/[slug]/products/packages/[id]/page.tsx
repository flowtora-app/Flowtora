import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { Button, Field, TextArea, Checkbox, SelectField } from "@/components/Field";
import { formatMoney } from "@/lib/format";
import { pricingMeta } from "@/lib/pricing";
import { kindLabel } from "@/lib/catalog";
import { getGroupContext } from "@/lib/franchise";
import {
  updatePackage,
  deletePackage,
  togglePackageActive,
  addPackageComponent,
  removePackageComponent,
} from "@/app/actions/products";

export default async function PackageDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "products:view");
  const canManage = ctx.can("products:manage");

  const pkg = await db.productPackage.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      components: {
        orderBy: { sortOrder: "asc" },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              kind: true,
              pricingModel: true,
              basePrice: true,
              unit: true,
              active: true,
              tenantId: true,
            },
          },
        },
      },
    },
  });
  if (!pkg) notFound();

  // Component picker also includes franchise-inherited shared products,
  // matching the semantics of the quote line add flow.
  const groupCtx = await getGroupContext(ctx.tenant.id);
  const [ownProducts, sharedProducts] = await Promise.all([
    db.product.findMany({
      where: { tenantId: ctx.tenant.id, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, category: true, pricingModel: true },
    }),
    groupCtx.parentTenantId
      ? db.product.findMany({
          where: { tenantId: groupCtx.parentTenantId, active: true, shared: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, category: true, pricingModel: true },
        })
      : Promise.resolve([]),
  ]);
  const productOptions = [
    { value: "", label: "— pick a product —" },
    ...ownProducts.map((p) => ({
      value: p.id,
      label: `${p.name}${p.category ? ` — ${p.category}` : ""} — ${pricingMeta(p.pricingModel).label}`,
    })),
    ...sharedProducts.map((p) => ({
      value: p.id,
      label: `[Shared] ${p.name}${p.category ? ` — ${p.category}` : ""}`,
    })),
  ];

  const save = updatePackage.bind(null, slug, pkg.id);
  const remove = deletePackage.bind(null, slug, pkg.id);
  const toggle = togglePackageActive.bind(null, slug, pkg.id);
  const addComp = addPackageComponent.bind(null, slug);

  // Rough preview of the "as of today" package total — each component's
  // product basePrice × defaultQuantity. CUSTOM_QUOTE lines are skipped
  // because they have no natural list price. This is a guidance number, not
  // a binding quote.
  const previewTotal = pkg.components.reduce((sum, c) => {
    if (c.product.pricingModel === "CUSTOM_QUOTE") return sum;
    const base = Number(c.product.basePrice);
    const qty = Number(c.defaultQuantity);
    return sum + base * qty;
  }, 0);

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <Link
          href={`/t/${slug}/products/packages`}
          className="underline"
          style={{ color: "var(--muted)" }}
        >
          ← Packages
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

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{pkg.name}</h1>
          <div className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            {pkg.components.length}{" "}
            {pkg.components.length === 1 ? "component" : "components"}
            {" · "}
            <span style={{ color: pkg.active ? "var(--success-fg)" : "var(--text-muted)" }}>
              {pkg.active ? "Active" : "Archived"}
            </span>
          </div>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <form action={toggle}>
              <Button type="submit" variant="secondary">
                {pkg.active ? "Archive" : "Activate"}
              </Button>
            </form>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="px-5 py-4">
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            Preview total
          </div>
          <div className="mt-1 text-2xl font-semibold">
            {previewTotal > 0
              ? formatMoney(previewTotal, ctx.tenant.currency)
              : "—"}
          </div>
          <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            Sum of each component&apos;s base × default qty. Ad-hoc / custom
            lines skipped.
          </div>
        </Card>
        <Card className="px-5 py-4 col-span-2">
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            How expansion works
          </div>
          <p className="mt-1 text-sm">
            When a rep clicks &ldquo;Add package&rdquo; on a quote, every
            component below becomes its own line. Pricing, cost, and waste
            factor snapshot onto the line at that moment — later catalog edits
            don&apos;t rewrite quotes already sent.
          </p>
        </Card>
      </div>

      {canManage && (
        <Card>
          <CardHeader title="Details" />
          <form action={save} className="space-y-4 px-5 py-5">
            <Field label="Name" name="name" required defaultValue={pkg.name} />
            <TextArea
              label="Customer description"
              name="description"
              rows={3}
              defaultValue={pkg.description ?? ""}
            />
            <TextArea
              label="Internal notes"
              name="internalNotes"
              rows={3}
              defaultValue={pkg.internalNotes ?? ""}
            />
            <Checkbox label="Active" name="active" defaultChecked={pkg.active} />
            <Button type="submit">Save changes</Button>
          </form>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Components"
          right={
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              Order here is the order lines are added to the quote.
            </span>
          }
        />

        <div className="px-5 py-4">
          {pkg.components.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No components yet. Add products below — each will expand to its
              own quote line.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
              {pkg.components.map((c) => {
                const removeComp = removePackageComponent.bind(null, slug, c.id);
                const base = Number(c.product.basePrice);
                const qty = Number(c.defaultQuantity);
                const line = c.product.pricingModel === "CUSTOM_QUOTE" ? null : base * qty;
                const inherited = c.product.tenantId !== ctx.tenant.id;
                return (
                  <li key={c.id} className="flex items-start justify-between gap-4 py-3 text-sm">
                    <div className="flex-1">
                      <div className="font-medium">
                        {c.product.name}
                        {!c.product.active && (
                          <span
                            className="ml-2 rounded-full px-1.5 py-0.5 text-[10px]"
                            style={{
                              background: "var(--warning-surface)",
                              color: "var(--warning-fg)",
                            }}
                          >
                            Inactive
                          </span>
                        )}
                        {inherited && (
                          <span
                            className="ml-2 rounded-full px-1.5 py-0.5 text-[10px]"
                            style={{
                              background: "var(--accent-surface)",
                              color: "var(--accent-primary)",
                            }}
                          >
                            Shared
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                        {kindLabel(c.product.kind)} ·{" "}
                        {pricingMeta(c.product.pricingModel).label} · default qty{" "}
                        {qty.toString()}
                        {c.note ? <> · {c.note}</> : null}
                      </div>
                    </div>
                    <div className="text-right">
                      <div>
                        {line != null ? formatMoney(line, ctx.tenant.currency) : "Custom"}
                      </div>
                      {canManage && (
                        <form action={removeComp} className="mt-1">
                          <button
                            type="submit"
                            className="text-xs underline"
                            style={{ color: "var(--danger-fg)" }}
                          >
                            Remove
                          </button>
                        </form>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {canManage && (
            <form
              action={addComp}
              className="mt-4 grid grid-cols-6 items-end gap-3 rounded-md px-4 py-3"
              style={{ border: "1px dashed var(--border)" }}
            >
              <input type="hidden" name="packageId" value={pkg.id} />
              <div className="col-span-3">
                <SelectField
                  label="Add component"
                  name="productId"
                  defaultValue=""
                  options={productOptions}
                />
              </div>
              <div className="col-span-1">
                <Field
                  label="Default qty"
                  name="defaultQuantity"
                  type="number"
                  step="0.01"
                  min="0.01"
                  defaultValue="1"
                />
              </div>
              <div className="col-span-1">
                <Field
                  label="Note (optional)"
                  name="note"
                  placeholder="e.g. 2 hrs adjust"
                />
              </div>
              <div className="col-span-1">
                <Button type="submit" variant="secondary">
                  Add
                </Button>
              </div>
            </form>
          )}
        </div>
      </Card>

      {canManage && (
        <Card>
          <CardHeader title="Danger zone" />
          <form
            action={remove}
            className="flex items-center justify-between px-5 py-4"
          >
            <div className="text-sm" style={{ color: "var(--muted)" }}>
              Deleting removes this package template. Quotes that already
              expanded it keep their lines.
            </div>
            <Button type="submit" variant="danger">
              Delete package
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
