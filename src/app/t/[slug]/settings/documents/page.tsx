import { requirePermission } from "@/lib/tenant";
import { saveDocuments } from "@/app/actions/settings";
import { Button, TextArea } from "@/components/Field";
import { Card, CardHeader } from "@/components/Card";

// Phase 21 Slice B — document output customization. Three plain-text
// blocks rendered on customer-facing quotes and invoices (emails + portal).
// Payment instructions live on invoices only — e.g. "ACH: routing xxx,
// account yyy" or "Make checks payable to Acme Signs." Everything is plain
// text so shops can't accidentally inject HTML that breaks portal layout.

export default async function DocumentsSettings({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const { tenant } = await requirePermission(slug, "tenant:manage");
  const action = saveDocuments.bind(null, slug);

  return (
    <Card>
      <CardHeader
        title="Document customization"
        description="Footer copy and payment instructions shown on customer-facing quotes and invoices."
      />
      <form action={action} className="space-y-4 px-5 py-5">
        <TextArea
          label="Quote footer"
          name="quoteFooterText"
          rows={4}
          maxLength={2000}
          placeholder="Thank you for considering us! All prices are valid for 30 days. Deposit required to begin production."
          defaultValue={tenant.quoteFooterText ?? ""}
        />
        <TextArea
          label="Invoice footer"
          name="invoiceFooterText"
          rows={4}
          maxLength={2000}
          placeholder="Thank you for your business! Late payments accrue a 1.5% monthly finance charge."
          defaultValue={tenant.invoiceFooterText ?? ""}
        />
        <TextArea
          label="Payment instructions"
          name="paymentInstructions"
          rows={5}
          maxLength={2000}
          placeholder={
            "ACH: routing 021000021, account 1234567890\n" +
            "Check: payable to Acme Signs, LLC\n" +
            "Credit card surcharge: 3%"
          }
          defaultValue={tenant.paymentInstructions ?? ""}
        />
        {sp.error && (
          <p className="text-sm" style={{ color: "var(--danger-fg)" }}>{decodeURIComponent(sp.error)}</p>
        )}
        <div className="flex justify-end">
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Card>
  );
}
