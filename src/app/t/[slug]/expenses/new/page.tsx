import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { Field, SelectField, TextArea, Button, Checkbox } from "@/components/Field";
import { ReceiptUploadInput } from "@/components/ReceiptUploadInput";
import { EXPENSE_METHODS, SUGGESTED_EXPENSE_CATEGORIES } from "@/lib/finance";
import { createExpense } from "@/app/actions/expenses";

export default async function NewExpensePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    error?: string;
    vendorId?: string;
    orderId?: string;
    category?: string;
  }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  await requirePermission(slug, "expenses:manage");

  const [tenant, vendors, orders] = await Promise.all([
    db.tenant.findUnique({ where: { slug }, select: { id: true } }),
    db.vendor.findMany({
      where: { tenant: { slug }, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.order.findMany({
      where: { tenant: { slug } },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: { id: true, number: true, status: true },
    }),
  ]);
  void tenant;

  const action = createExpense.bind(null, slug);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 text-sm">
        <Link href={`/t/${slug}/expenses`} className="underline" style={{ color: "var(--muted)" }}>
          ← Expenses
        </Link>
      </div>
      <Card>
        <CardHeader
          title="Log expense"
          description="Everything from a Home Depot receipt to a subcontractor bill."
        />
        <form action={action} className="space-y-4 px-5 py-5">
          {sp.error && (
            <div className="rounded-md px-3 py-2 text-sm"
              style={{ background: "#3a1517", color: "#ff8b8b", border: "1px solid #5b2024" }}>
              {sp.error}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date" name="date" type="date" required defaultValue={today} />
            <Field label="Amount" name="amount" type="number" step="0.01" min="0" required placeholder="0.00" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label="Vendor"
              name="vendorId"
              defaultValue={sp.vendorId ?? ""}
              options={[
                { value: "", label: "— No vendor / one-off —" },
                ...vendors.map((v) => ({ value: v.id, label: v.name })),
              ]}
            />
            <SelectField
              label="Order (optional)"
              name="orderId"
              defaultValue={sp.orderId ?? ""}
              options={[
                { value: "", label: "— No order (overhead) —" },
                ...orders.map((o) => ({ value: o.id, label: `${o.number} · ${o.status.replace(/_/g, " ").toLowerCase()}` })),
              ]}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block">
                <span className="mb-1 block text-sm">Category</span>
                <input
                  name="category"
                  list="expense-categories"
                  defaultValue={sp.category ?? ""}
                  placeholder="e.g. Materials"
                  className="w-full rounded-md px-3 py-2 text-sm outline-none"
                  style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
                />
              </label>
              <datalist id="expense-categories">
                {SUGGESTED_EXPENSE_CATEGORIES.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <SelectField
              label="Method"
              name="method"
              defaultValue="CARD"
              options={EXPENSE_METHODS.map((m) => ({ value: m.value, label: m.label }))}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tax" name="taxAmount" type="number" step="0.01" min="0" placeholder="0.00" />
            <Field label="Reference" name="reference" placeholder="Check #, last 4, txn id" />
          </div>
          <TextArea label="Memo" name="memo" rows={2} placeholder="What was purchased?" />
          <Checkbox name="billable" label="Billable — can be rebilled to the customer" />

          <div>
            <div className="mb-1 text-sm">Receipt</div>
            <ReceiptUploadInput name="receiptUrl" />
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit">Save expense</Button>
            <Link href={`/t/${slug}/expenses`} className="text-sm" style={{ color: "var(--muted)" }}>
              Cancel
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
