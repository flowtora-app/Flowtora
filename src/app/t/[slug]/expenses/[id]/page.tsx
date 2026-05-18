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
    <div className="space-y-5">
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
              width: 48,
              height: 48,
              borderRadius: 12,
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
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 4h12l4 4v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
              <path d="M14 4v5h5M8 10h2M8 14h6M8 18h6" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1
                className="font-semibold"
                style={{
                  color: "var(--text-default)",
                  fontSize: 22,
                  letterSpacing: "-0.018em",
                  lineHeight: 1.2,
                  fontFeatureSettings: "'tnum' 1",
                }}
              >
                {formatMoney(expense.amount.toString(), ctx.tenant.currency)}
              </h1>
              {expense.billable && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    padding: "2px 7px",
                    borderRadius: 999,
                    color: "var(--emerald-500)",
                    background:
                      "color-mix(in oklab, var(--emerald-500) 14%, transparent)",
                    border:
                      "1px solid color-mix(in oklab, var(--emerald-500) 30%, transparent)",
                    lineHeight: 1,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: 999,
                      background: "var(--emerald-500)",
                    }}
                  />
                  Billable
                </span>
              )}
            </div>
            <p
              className="mt-1.5"
              style={{
                color: "var(--text-muted)",
                fontSize: 12.5,
                lineHeight: 1.4,
              }}
            >
              <span style={{ color: "var(--text-default)", fontWeight: 500 }}>
                {formatDate(expense.date)}
              </span>
              <span style={{ color: "var(--text-faint)" }}> · </span>
              {expenseMethodLabel(expense.method)}
              {expense.category && (
                <>
                  <span style={{ color: "var(--text-faint)" }}> · </span>
                  {expense.category}
                </>
              )}
              {expense.vendor && (
                <>
                  <span style={{ color: "var(--text-faint)" }}> · </span>
                  <Link
                    href={`/t/${slug}/vendors/${expense.vendor.id}`}
                    style={{ color: "var(--accent-primary)", fontWeight: 500 }}
                    className="hover:underline"
                  >
                    {expense.vendor.name}
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
      </header>

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
              <ReceiptUploadInput slug={slug} name="receiptUrl" initial={expense.receiptUrl} />
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
