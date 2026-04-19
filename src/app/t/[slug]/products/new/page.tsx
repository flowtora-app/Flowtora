import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { Card, CardHeader } from "@/components/Card";
import { ProductForm } from "@/components/ProductForm";
import { createProduct } from "@/app/actions/products";

export default async function NewProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "products:manage");
  const action = createProduct.bind(null, slug);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 text-sm">
        <Link href={`/t/${slug}/products`} className="underline" style={{ color: "var(--muted)" }}>
          ← Products
        </Link>
      </div>
      <Card>
        <CardHeader title="New product" />
        <div className="px-5 py-5">
          <ProductForm
            action={action}
            submitLabel="Create product"
            error={sp.error}
            isGroupRoot={ctx.tenant.isGroupRoot}
          />
        </div>
      </Card>
    </div>
  );
}
