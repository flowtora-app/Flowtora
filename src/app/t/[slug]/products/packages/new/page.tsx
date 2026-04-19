import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { Card, CardHeader } from "@/components/Card";
import { Button, Field, TextArea, Checkbox } from "@/components/Field";
import { createPackage } from "@/app/actions/products";

export default async function NewPackagePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  await requirePermission(slug, "products:manage");
  const action = createPackage.bind(null, slug);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="text-sm">
        <Link
          href={`/t/${slug}/products/packages`}
          className="underline"
          style={{ color: "var(--muted)" }}
        >
          ← Packages
        </Link>
      </div>
      <Card>
        <CardHeader title="New package template" />
        <form action={action} className="space-y-4 px-5 py-5">
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

          <Field
            label="Name"
            name="name"
            required
            placeholder="e.g. Storefront starter pack"
            hint="Shown to reps when they add the package to a quote."
          />
          <TextArea
            label="Customer description"
            name="description"
            rows={3}
            placeholder="Optional. Copied onto each expanded quote line as context."
          />
          <TextArea
            label="Internal notes"
            name="internalNotes"
            rows={3}
            placeholder="Notes for reps only. Never shown to customers."
          />

          <Checkbox label="Active (available on quotes)" name="active" defaultChecked />

          <p className="text-xs" style={{ color: "var(--muted)" }}>
            You&apos;ll add components on the next page.
          </p>

          <Button type="submit">Create package</Button>
        </form>
      </Card>
    </div>
  );
}
