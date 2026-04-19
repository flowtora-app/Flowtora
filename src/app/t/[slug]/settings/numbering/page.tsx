import { requirePermission } from "@/lib/tenant";
import { saveNumbering } from "@/app/actions/settings";
import { Button, Field } from "@/components/Field";
import { Card, CardHeader } from "@/components/Card";

export default async function NumberingSettings({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant } = await requirePermission(slug, "tenant:manage");
  const action = saveNumbering.bind(null, slug);

  return (
    <Card>
      <CardHeader title="Document numbering" description="Prefixes for new quotes, orders, and invoices." />
      <form action={action} className="space-y-4 px-5 py-5">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Quote prefix" name="quoteNumberPrefix" defaultValue={tenant.quoteNumberPrefix} />
          <Field label="Order prefix" name="orderNumberPrefix" defaultValue={tenant.orderNumberPrefix} />
          <Field label="Invoice prefix" name="invoiceNumberPrefix" defaultValue={tenant.invoiceNumberPrefix} />
        </div>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Last issued — quote: {tenant.quoteLastNumber}, order: {tenant.orderLastNumber}, invoice: {tenant.invoiceLastNumber}.
        </p>
        <div className="flex justify-end">
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Card>
  );
}
