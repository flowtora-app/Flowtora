import { requirePermission } from "@/lib/tenant";
import { saveDefaultsStep } from "@/app/actions/onboarding";
import { Button, Field, SelectField, Checkbox } from "@/components/Field";
import { Card, CardHeader } from "@/components/Card";

export default async function DefaultsStep({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant } = await requirePermission(slug, "tenant:manage");
  const action = saveDefaultsStep.bind(null, slug);

  return (
    <Card>
      <CardHeader title="Numbering & financial defaults" description="You can change all of these later in Settings." />
      <form action={action} className="space-y-4 px-5 py-5">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Quote # prefix" name="quoteNumberPrefix" defaultValue={tenant.quoteNumberPrefix} />
          <Field label="Order # prefix" name="orderNumberPrefix" defaultValue={tenant.orderNumberPrefix} />
          <Field label="Invoice # prefix" name="invoiceNumberPrefix" defaultValue={tenant.invoiceNumberPrefix} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field
            label="Default tax rate"
            name="defaultTaxRate"
            type="number"
            step="0.0001"
            min="0"
            max="1"
            defaultValue={String(tenant.defaultTaxRate)}
            hint="Decimal, e.g. 0.0875 for 8.75%."
          />
          <Field
            label="Deposit %"
            name="defaultDepositPercent"
            type="number"
            min="0"
            max="100"
            defaultValue={String(tenant.defaultDepositPercent)}
          />
          <SelectField
            label="Payment terms"
            name="defaultPaymentTerms"
            defaultValue={tenant.defaultPaymentTerms}
            options={[
              { value: "DUE_ON_RECEIPT", label: "Due on receipt" },
              { value: "NET_15", label: "Net 15" },
              { value: "NET_30", label: "Net 30" },
              { value: "NET_45", label: "Net 45" },
              { value: "NET_60", label: "Net 60" },
            ]}
          />
        </div>
        <Checkbox
          name="proofRequiresApproval"
          label="Require customer proof approval before production"
          defaultChecked={tenant.proofRequiresApproval}
        />
        <div className="flex justify-end">
          <Button type="submit">Continue</Button>
        </div>
      </form>
    </Card>
  );
}
