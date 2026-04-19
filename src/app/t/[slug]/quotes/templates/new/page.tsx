import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { Card, CardHeader } from "@/components/Card";
import { Field, SelectField, TextArea, Button, Checkbox } from "@/components/Field";
import { createQuoteTemplate } from "@/app/actions/quote-templates";

// Phase 9 Slice D — Template create form. Kept minimal: name the template,
// optionally seed its defaults (discount, deposit, note, terms). Sections +
// line items are added afterwards on the detail page.

export default async function NewQuoteTemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  await requirePermission(slug, "quotes:manage");

  const action = createQuoteTemplate.bind(null, slug);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 text-sm">
        <Link href={`/t/${slug}/quotes/templates`} className="underline" style={{ color: "var(--muted)" }}>
          ← Templates
        </Link>
      </div>
      <Card>
        <CardHeader
          title="New quote template"
          description="Create a reusable starting point. After saving, add sections and line items on the template detail page."
        />
        <form action={action} className="space-y-4 px-5 py-5">
          {sp.error && (
            <div className="rounded-md px-3 py-2 text-sm" style={{ background: "#3a1517", color: "#ff8b8b", border: "1px solid #5b2024" }}>
              {sp.error}
            </div>
          )}

          <Field label="Template name" name="name" required placeholder="e.g. Standard vehicle wrap" />
          <TextArea
            label="Internal description (optional)"
            name="description"
            rows={2}
            placeholder="Who this template is for, when to pick it, anything your reps should know."
          />

          <div className="grid grid-cols-2 gap-4">
            <SelectField
              label="Default discount"
              name="discountType"
              defaultValue="NONE"
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
              defaultValue="0"
              hint="Flat currency or 0–100 for %."
            />
            <SelectField
              label="Default deposit"
              name="depositType"
              defaultValue="NONE"
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
              defaultValue="0"
              hint="Flat currency or 0–100 for %."
            />
          </div>

          <TextArea
            label="Default customer-facing note"
            name="customerNote"
            rows={2}
            placeholder="Appears above the line items on the customer-facing view."
          />
          <TextArea
            label="Default terms"
            name="terms"
            rows={3}
            placeholder="Payment terms, warranty language, turnaround expectations."
          />

          <Checkbox label="Active (available in new-quote picker)" name="active" defaultChecked />

          <div className="flex gap-2">
            <Button type="submit">Create template</Button>
            <Link href={`/t/${slug}/quotes/templates`}>
              <Button type="button" variant="secondary">Cancel</Button>
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
