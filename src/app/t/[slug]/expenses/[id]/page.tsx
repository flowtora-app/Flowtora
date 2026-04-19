import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { Field, SelectField, TextArea, Button, Checkbox } from "@/components/Field";
import { ReceiptUploadInput } from "@/components/ReceiptUploadInput";
import { formatMoney, formatDate } from "@/lib/format";
import { EXPENSE_METHODS, SUGGESTED_EXPENSE_CATEGORIES, expenseMethodLabel } from "@/lib/finance";
import { updateExpense, deleteExpense } from "@/app/actions/expenses";

export default async function ExpenseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "expenses:view");
  const canManage = ctx.can("expenses:manage");

  const expense = await db.expense.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      vendor: { select: { id: true, name: true } },
      order:  { select: { id: true, number: true, status: true } },
    },
  });
  if (!expense) notFound();

  const [vendors, orders] = canManage
    ? await Promise.all([
        db.vendor.findMany({
          where: {
            tenantId: ctx.tenant.id,
            OR: [{ active: true }, { id: expense.vendorId ?? "__none__" }],
          },
          orderBy: { name: "asc" },
          select: { id: true, name: true, active: true },
        }),
        db.order.findMany({
          where: { tenantId: ctx.tenant.id },
          orderBy: { updatedAt: "desc" },
          take: 200,
          select: { id: true, number: true, status: true },
        }),
      ])
    : [[], []] as const;

  const updateAction = updateExpense.bind(null, slug, expense.id);
  const deleteAction = deleteExpense.bind(null, slug, expense.id);

  const receiptIsImage =
    expense.receiptUrl &&
    (expense.receiptUrl.startsWith("data:image/") ||
      /\.(png|jpe?g|gif|webp)(\?|$)/i.test(expense.receiptUrl));

  return (
    <div className="space-y-6">
      <div className="mb-2 text-sm">
        <Link href={`/t/${slug}/expenses`} className="underline" style={{ color: "var(--muted)" }}>
          ← Expenses
        </Link>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {formatMoney(expense.amount.toString(), ctx.tenant.currency)}
            {expense.billable && (
              <span className="ml-2 align-middle rounded-full px-2 py-0.5 text-xs"
                style={{ background: "#1f3a2a", color: "#a7f3d0" }}>
                billable
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            {formatDate(expense.date)} · {expenseMethodLabel(expense.method)}
            {expense.category && <> · {expense.category}</>}
            {expense.vendor && (
              <>
                {" · "}
                <Link href={`/t/${slug}/vendors/${expense.vendor.id}`} className="underline">
                  {expense.vendor.name}
                </Link>
              </>
            )}
          </p>
        </div>
      </div>

      {sp.error && (
        <div className="rounded-md px-3 py-2 text-sm"
          style={{ background: "#3a1517", color: "#ff8b8b", border: "1px solid #5b2024" }}>
          {sp.error}
        </div>
      )}

      {/* At-a-glance summary + linked order block. Rendered read-only so
          users who can view-only expenses still get the full story. */}
      <Card>
        <CardHeader title="Details" />
        <dl className="grid grid-cols-1 gap-y-2 px-5 py-4 text-sm sm:grid-cols-2">
          <dt style={{ color: "var(--muted)" }}>Amount</dt>
          <dd className="text-right sm:text-left">
            {formatMoney(expense.amount.toString(), ctx.tenant.currency)}
          </dd>
          <dt style={{ color: "var(--muted)" }}>Tax</dt>
          <dd className="text-right sm:text-left">
            {Number(expense.taxAmount) > 0
              ? formatMoney(expense.taxAmount.toString(), ctx.tenant.currency)
              : "—"}
          </dd>
          <dt style={{ color: "var(--muted)" }}>Date</dt>
          <dd className="text-right sm:text-left">{formatDate(expense.date)}</dd>
          <dt style={{ color: "var(--muted)" }}>Method</dt>
          <dd className="text-right sm:text-left">{expenseMethodLabel(expense.method)}</dd>
          <dt style={{ color: "var(--muted)" }}>Reference</dt>
          <dd className="text-right sm:text-left">{expense.reference ?? "—"}</dd>
          <dt style={{ color: "var(--muted)" }}>Category</dt>
          <dd className="text-right sm:text-left">{expense.category ?? "—"}</dd>
          <dt style={{ color: "var(--muted)" }}>Vendor</dt>
          <dd className="text-right sm:text-left">
            {expense.vendor ? (
              <Link href={`/t/${slug}/vendors/${expense.vendor.id}`} className="underline">
                {expense.vendor.name}
              </Link>
            ) : "—"}
          </dd>
          <dt style={{ color: "var(--muted)" }}>Order</dt>
          <dd className="text-right sm:text-left">
            {expense.order ? (
              <Link href={`/t/${slug}/orders/${expense.order.id}`} className="underline">
                {expense.order.number}
              </Link>
            ) : "—"}
          </dd>
          {expense.memo && (
            <>
              <dt style={{ color: "var(--muted)" }}>Memo</dt>
              <dd className="text-right sm:text-left whitespace-pre-wrap">{expense.memo}</dd>
            </>
          )}
        </dl>
      </Card>

      {/* Receipt preview */}
      {expense.receiptUrl && (
        <Card>
          <CardHeader
            title="Receipt"
            right={
              <a
                href={expense.receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs underline"
                style={{ color: "var(--muted)" }}
              >
                Open full size
              </a>
            }
          />
          <div className="px-5 py-4">
            {receiptIsImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={expense.receiptUrl}
                alt="Receipt"
                className="rounded-md"
                style={{ maxWidth: 420, border: "1px solid var(--border)" }}
              />
            ) : (
              <a
                href={expense.receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm underline"
                style={{ color: "var(--text)" }}
              >
                {expense.receiptUrl.length > 80
                  ? expense.receiptUrl.slice(0, 80) + "…"
                  : expense.receiptUrl}
              </a>
            )}
          </div>
        </Card>
      )}

      {/* Edit form — only rendered for users who can edit. */}
      {canManage && (
        <Card>
          <CardHeader title="Edit" />
          <form action={updateAction} className="space-y-4 px-5 py-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Date" name="date" type="date" required
                defaultValue={expense.date.toISOString().slice(0, 10)}
              />
              <Field
                label="Amount" name="amount" type="number" step="0.01" min="0" required
                defaultValue={expense.amount.toString()}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                label="Vendor"
                name="vendorId"
                defaultValue={expense.vendorId ?? ""}
                options={[
                  { value: "", label: "— No vendor —" },
                  ...vendors.map((v) => ({
                    value: v.id,
                    label: v.active ? v.name : `${v.name} (archived)`,
                  })),
                ]}
              />
              <SelectField
                label="Order"
                name="orderId"
                defaultValue={expense.orderId ?? ""}
                options={[
                  { value: "", label: "— No order (overhead) —" },
                  ...orders.map((o) => ({
                    value: o.id,
                    label: `${o.number} · ${o.status.replace(/_/g, " ").toLowerCase()}`,
                  })),
                ]}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block">
                  <span className="mb-1 block text-sm">Category</span>
                  <input
                    name="category"
                    list="expense-categories-edit"
                    defaultValue={expense.category ?? ""}
                    className="w-full rounded-md px-3 py-2 text-sm outline-none"
                    style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
                  />
                </label>
                <datalist id="expense-categories-edit">
                  {SUGGESTED_EXPENSE_CATEGORIES.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <SelectField
                label="Method"
                name="method"
                defaultValue={expense.method}
                options={EXPENSE_METHODS.map((m) => ({ value: m.value, label: m.label }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Tax" name="taxAmount" type="number" step="0.01" min="0"
                defaultValue={expense.taxAmount.toString()}
              />
              <Field
                label="Reference" name="reference"
                defaultValue={expense.reference ?? ""}
              />
            </div>
            <TextArea label="Memo" name="memo" rows={2} defaultValue={expense.memo ?? ""} />
            <Checkbox name="billable" label="Billable — can be rebilled to the customer" defaultChecked={expense.billable} />

            <div>
              <div className="mb-1 text-sm">Receipt</div>
              <ReceiptUploadInput name="receiptUrl" initial={expense.receiptUrl} />
            </div>

            <div className="flex items-center gap-2">
              <Button type="submit">Save changes</Button>
              <Link href={`/t/${slug}/expenses`} className="text-sm" style={{ color: "var(--muted)" }}>
                Cancel
              </Link>
            </div>
          </form>
        </Card>
      )}

      {canManage && (
        <Card>
          <CardHeader title="Delete expense" />
          <div className="space-y-3 px-5 py-5 text-sm" style={{ color: "var(--muted)" }}>
            <p>
              Deleting the expense removes it from the ledger and recomputes margin on
              any linked order. Consider editing the memo instead if it was merely a
              typo.
            </p>
            <form action={deleteAction}>
              <Button type="submit" variant="danger">Delete expense</Button>
            </form>
          </div>
        </Card>
      )}
    </div>
  );
}
