import { requirePermission } from "@/lib/tenant";
import { saveFinancial } from "@/app/actions/settings";
import { Button, Field, SelectField, Checkbox } from "@/components/Field";
import { Card, CardHeader } from "@/components/Card";

export default async function FinancialSettings({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant } = await requirePermission(slug, "tenant:manage");
  const action = saveFinancial.bind(null, slug);

  return (
    <Card>
      <CardHeader title="Financial defaults" description="Applied to new quotes, orders, and invoices." />
      <form action={action} className="space-y-4 px-5 py-5">
        <div className="grid grid-cols-3 gap-3">
          <Field
            label="Default tax rate"
            name="defaultTaxRate"
            type="number"
            step="0.0001"
            min="0"
            max="1"
            defaultValue={String(tenant.defaultTaxRate)}
            hint="Decimal — 0.0875 = 8.75%."
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
        {/*
          DUPLICATE-LABEL WARNING: there is a visually-similar checkbox on
          /settings/workflow called `requireProofBeforeProduction`. The two
          flags are NOT the same field — `proofRequiresApproval` gates
          whether proofs need a customer sign-off at all, while the
          workflow flag gates the production-state transition.

          They can legitimately be configured differently but the label
          collision causes support confusion. Phase 4 (Settings collapse)
          unifies these under a single "proof approval matrix" in
          /settings/money. See docs/transformation-plan.md §Phase 1 —
          Proof-approval duplication note.
        */}
        <Checkbox
          name="proofRequiresApproval"
          label="Require customer proof approval before production"
          defaultChecked={tenant.proofRequiresApproval}
        />
        <div className="flex justify-end">
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Card>
  );
}
