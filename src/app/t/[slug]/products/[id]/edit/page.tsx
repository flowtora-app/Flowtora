import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { Button } from "@/components/Field";
import { ProductForm, type ProductFormInitial } from "@/components/ProductForm";
import { updateProduct, deleteProduct } from "@/app/actions/products";

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "products:manage");

  const product = await db.product.findFirst({
    where: { id, tenantId: ctx.tenant.id },
  });
  if (!product) notFound();

  const action = updateProduct.bind(null, slug, product.id);
  const remove = deleteProduct.bind(null, slug, product.id);

  // Decimal columns can't cross the server→client boundary in Next.js 15
  // (they're class instances, not plain JSON). Stringify before handing to
  // the client-side ProductForm.
  const initial: ProductFormInitial = {
    name: product.name,
    description: product.description,
    sku: product.sku,
    category: product.category,
    pricingModel: product.pricingModel,
    basePrice: product.basePrice.toString(),
    cost: product.cost?.toString() ?? null,
    wasteFactorPct: product.wasteFactorPct.toString(),
    unit: product.unit,
    imageUrl: product.imageUrl,
    taxable: product.taxable,
    active: product.active,
    shared: product.shared,
    kind: product.kind,
    priceFormula: product.priceFormula,
    markupPct: product.markupPct?.toString() ?? null,
    markupFixed: product.markupFixed?.toString() ?? null,
    productionNotes: product.productionNotes,
    specSheet: product.specSheet,
    internalSku: product.internalSku,
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="text-sm">
        <Link href={`/t/${slug}/products/${product.id}`} className="underline" style={{ color: "var(--muted)" }}>
          ← {product.name}
        </Link>
      </div>
      <Card>
        <CardHeader title="Edit product" />
        <div className="px-5 py-5">
          <ProductForm
            action={action}
            initial={initial}
            submitLabel="Save changes"
            error={sp.error}
            isGroupRoot={ctx.tenant.isGroupRoot}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Danger zone" />
        <form action={remove} className="flex items-center justify-between px-5 py-4">
          <div className="text-sm" style={{ color: "var(--muted)" }}>
            Deleting removes this product from the catalog. Existing quotes keep their own copy.
          </div>
          <Button type="submit" variant="danger">Delete product</Button>
        </form>
      </Card>
    </div>
  );
}
