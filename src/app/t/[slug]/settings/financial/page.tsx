import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { saveFinancial } from "@/app/actions/settings";
import { Button, Field, SelectField } from "@/components/Field";
import { Card, CardHeader } from "@/components/Card";

// Phase 4 (transformation) — `proofRequiresApproval` moved out of this
// page and into the unified "Production gates" section on the workflow
// settings page. Financial defaults now owns only tax + deposit % +
// payment terms, which read as a coherent set without the orphan
// approval toggle. The link at the bottom points users to where the
// proof setting went.

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
        <div className="flex items-center justify-between gap-3 pt-2">
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Looking for proof-approval gates? They moved to{" "}
            <Link
              href={`/t/${slug}/settings/workflow#production-gates`}
              className="underline"
              style={{ color: "var(--accent-primary)" }}
            >
              Workflow → Rules &amp; gates
            </Link>
            .
          </p>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Card>
  );
}
