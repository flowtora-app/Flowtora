import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { Card, CardHeader } from "@/components/Card";
import { Field, TextArea, Button } from "@/components/Field";
import { createVendor } from "@/app/actions/vendors";

export default async function NewVendorPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  await requirePermission(slug, "vendors:manage");

  const action = createVendor.bind(null, slug);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 text-sm">
        <Link href={`/t/${slug}/vendors`} className="underline" style={{ color: "var(--muted)" }}>
          ← Vendors
        </Link>
      </div>
      <Card>
        <CardHeader
          title="New vendor"
          description="Suppliers, subcontractors, utilities — anyone you pay."
        />
        <form action={action} className="space-y-4 px-5 py-5">
          {sp.error && (
            <div className="rounded-md px-3 py-2 text-sm"
              style={{ background: "#3a1517", color: "#ff8b8b", border: "1px solid #5b2024" }}>
              {sp.error}
            </div>
          )}
          <Field label="Name" name="name" required placeholder="Acme Signs Supply" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category" name="category" placeholder="Vinyl supplier" />
            <Field label="Primary contact" name="contact" placeholder="Pat Rivera" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email" name="email" type="email" />
            <Field label="Phone" name="phone" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Website" name="website" placeholder="https://…" />
            <Field label="Account # with vendor" name="accountNumber" />
          </div>
          <Field label="Address line 1" name="addressLine1" />
          <Field label="Address line 2" name="addressLine2" />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="City" name="city" />
            <Field label="Region / state" name="region" />
            <Field label="Postal code" name="postalCode" />
          </div>
          <Field label="Country" name="country" />
          <TextArea label="Notes" name="notes" rows={3} placeholder="Net 30, delivery windows, etc." />
          <div className="flex items-center gap-2">
            <Button type="submit">Create vendor</Button>
            <Link href={`/t/${slug}/vendors`} className="text-sm" style={{ color: "var(--muted)" }}>
              Cancel
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
