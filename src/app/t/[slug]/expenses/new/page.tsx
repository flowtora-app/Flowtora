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
    <div className="mx-auto max-w-2xl space-y-5">
      <div style={{ fontSize: 12 }}>
        <Link
          href={`/t/${slug}/expenses`}
          className="ts-focus inline-flex items-center gap-1 transition-colors hover:text-[var(--text-default)]"
          style={{ color: "var(--text-muted)" }}
        >
          ← Expenses
        </Link>
      </div>

      <header
        className="relative overflow-hidden rounded-2xl"
        style={{
          padding: "18px 22px",
          background:
            "radial-gradient(720px circle at -8% -40%, var(--accent-surface), transparent 55%), " +
            "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
          border: "1px solid var(--border-subtle)",
          boxShadow:
            "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
            "0 1px 2px 0 rgba(0,0,0,0.18)",
        }}
      >
        <div className="flex items-start gap-3.5">
          <span
            aria-hidden
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: 10,
              background:
                "linear-gradient(135deg, var(--accent-surface-strong), var(--accent-surface))",
              color: "var(--accent-primary)",
              border:
                "1px solid color-mix(in oklab, var(--accent-primary) 30%, transparent)",
              flexShrink: 0,
              boxShadow:
                "inset 0 1px 0 0 color-mix(in oklab, white 6%, transparent)",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 4h12l4 4v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
              <path d="M14 4v5h5M8 10h2M8 14h6M8 18h6" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <h1
              className="font-semibold"
              style={{
                color: "var(--text-default)",
                fontSize: 22,
                letterSpacing: "-0.018em",
                lineHeight: 1.2,
              }}
            >
              Log expense
            </h1>
            <p
              className="mt-1.5"
              style={{
                color: "var(--text-muted)",
                fontSize: 12.5,
                lineHeight: 1.45,
              }}
            >
              Everything from a Home Depot receipt to a subcontractor bill.
            </p>
          </div>
        </div>
      </header>

      <Card>
        <form action={action} className="space-y-4 px-5 py-5">
          {sp.error && (
            <div
              className="rounded-lg px-3.5 py-2.5"
              style={{
                background: "color-mix(in oklab, var(--rose-500) 14%, transparent)",
                color: "var(--danger-fg, var(--rose-500))",
                border:
                  "1px solid color-mix(in oklab, var(--rose-500) 30%, transparent)",
                fontSize: 12.5,
                fontWeight: 500,
              }}
            >
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
            <ReceiptUploadInput slug={slug} name="receiptUrl" />
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
