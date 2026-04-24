import { requirePermission } from "@/lib/tenant";
import { saveWorkflow } from "@/app/actions/settings";
import { Button, Field, Checkbox } from "@/components/Field";
import { Card, CardHeader } from "@/components/Card";

// Phase 4 (transformation) — one page, four approval gates.
//
// Before: `proofRequiresApproval` lived on /settings/financial with a
// misleading "Require customer proof approval before production" label,
// while the three `require…Before…` flags lived here. Operators rightly
// read the two surfaces as overlapping and would toggle the wrong one.
//
// After: all four gates edit on this page, grouped into one "Production
// gates" card. The matrix reads top-to-bottom as the work lifecycle —
// (1) do proofs need a customer sign-off at all? → (2) can production
// start without one? → (3) must a deposit be collected before
// production? → (4) must a deposit be collected before install? The
// labels are distinct enough that someone opening this page the first
// time understands what each flag does without cross-referencing the
// other.
//
// The `#production-gates` anchor on the section is the deep-link target
// the financial page links to ("moved to Workflow → Rules & gates"),
// and is also used by the onboarding wizard when it highlights proof
// policy during shop setup.

export default async function WorkflowSettings({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant } = await requirePermission(slug, "tenant:manage");
  const action = saveWorkflow.bind(null, slug);

  return (
    <Card>
      <CardHeader
        title="Rules & gates"
        description="Gate quote sending, production, and install scheduling on explicit approvals. Set a threshold to 0 to disable that rule."
      />
      <form action={action} className="space-y-6 px-5 py-5">
        <div>
          <h3 className="text-sm font-medium">Quote send gates</h3>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            When either threshold trips, a manager or owner must approve the quote before a sales rep can send it.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field
              label="Max discount % without approval"
              name="approvalDiscountThresholdPct"
              type="number"
              min="0"
              max="100"
              defaultValue={String(tenant.approvalDiscountThresholdPct)}
              hint="0 = no limit. Example: 20 means discounts over 20% need approval."
            />
            <Field
              label="Max quote total without approval"
              name="approvalLargeJobThreshold"
              type="number"
              step="0.01"
              min="0"
              defaultValue={String(tenant.approvalLargeJobThreshold)}
              hint="0 = no limit. Amount in your shop currency."
            />
          </div>
        </div>

        <div id="production-gates" style={{ scrollMarginTop: 92 }}>
          <h3 className="text-sm font-medium">Production gates</h3>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            The rules that decide when an order is allowed to move forward. Read top to bottom — each gate is evaluated in lifecycle order.
          </p>
          <div className="mt-3 space-y-2">
            <Checkbox
              name="proofRequiresApproval"
              label="Require customers to approve proofs before they count as signed off"
              defaultChecked={tenant.proofRequiresApproval}
            />
            <Checkbox
              name="requireProofBeforeProduction"
              label="Require an approved proof before an order can enter production"
              defaultChecked={tenant.requireProofBeforeProduction}
            />
            <Checkbox
              name="requireDepositBeforeProduction"
              label="Require the order's deposit % to be paid before production can start"
              defaultChecked={tenant.requireDepositBeforeProduction}
            />
            <Checkbox
              name="requireDepositBeforeInstall"
              label="Require the order's deposit % to be paid before an install can be scheduled"
              defaultChecked={tenant.requireDepositBeforeInstall}
            />
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium">Rush pricing</h3>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            Adds a one-click surcharge line to a quote for rush jobs. Calculated from the quote's current subtotal at apply-time.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field
              label="Rush surcharge %"
              name="rushFeePercent"
              type="number"
              min="0"
              max="100"
              defaultValue={String(tenant.rushFeePercent)}
              hint="0 hides the rush button. Example: 25 adds a 25% line to the quote."
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Card>
  );
}
