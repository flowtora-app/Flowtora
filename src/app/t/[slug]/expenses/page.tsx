import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card } from "@/components/Card";
import { Button } from "@/components/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatMoney, formatDate } from "@/lib/format";
import { expenseMethodLabel, SUGGESTED_EXPENSE_CATEGORIES } from "@/lib/finance";
import type { Prisma } from "@prisma/client";

// Phase 14 — expense ledger.
//
// The ledger is where an owner answers "where did the money go?" and
// where a production manager logs day-to-day shop spend. We surface the
// three filters that actually see regular use:
//   • month window (defaulting to the current month so "how are we
//     doing this month" is one click)
//   • vendor drop-down
//   • category drop-down, seeded with any category actually used by the
//     tenant plus the suggested list
// Billable-only and job-linked-only are quick chips above the table for
// the margin/rebill conversations.

type SP = {
  q?: string;
  from?: string;
  to?: string;
  vendor?: string;
  category?: string;
  orderId?: string;
  flags?: "billable" | "jobLinked";
};

export default async function ExpensesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SP>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "expenses:view");
  const canManage = ctx.can("expenses:manage");

  // Default window: current month, in the server's local calendar. An
  // empty `from`/`to` means "no window", so we only seed when both are
  // absent and the user hasn't narrowed by other filter either —
  // otherwise the defaults would fight the filter.
  const hasAnyFilter = !!(sp.q || sp.vendor || sp.category || sp.orderId || sp.flags);
  const now = new Date();
  const fromStr = sp.from ?? (hasAnyFilter ? "" : isoDay(new Date(now.getFullYear(), now.getMonth(), 1)));
  const toStr   = sp.to   ?? (hasAnyFilter ? "" : isoDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)));

  const where: Prisma.ExpenseWhereInput = { tenantId: ctx.tenant.id };
  const from = fromStr ? new Date(fromStr) : null;
  const to   = toStr   ? new Date(`${toStr}T23:59:59`) : null;
  if (from || to) {
    where.date = {};
    if (from) (where.date as { gte?: Date; lte?: Date }).gte = from;
    if (to)   (where.date as { gte?: Date; lte?: Date }).lte = to;
  }
  if (sp.vendor)   where.vendorId = sp.vendor;
  if (sp.orderId)  where.orderId  = sp.orderId;
  if (sp.category) where.category = sp.category;
  if (sp.flags === "billable")  where.billable = true;
  if (sp.flags === "jobLinked") where.orderId  = { not: null };
  if (sp.q) {
    where.OR = [
      { memo:      { contains: sp.q, mode: "insensitive" } },
      { reference: { contains: sp.q, mode: "insensitive" } },
      { category:  { contains: sp.q, mode: "insensitive" } },
      { vendor:    { name: { contains: sp.q, mode: "insensitive" } } },
    ];
  }

  const [expenses, vendors, usedCategories, totalAgg] = await Promise.all([
    db.expense.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 300,
      include: {
        vendor: { select: { id: true, name: true } },
        order:  { select: { id: true, number: true } },
      },
    }),
    db.vendor.findMany({
      where: { tenantId: ctx.tenant.id, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // Distinct categories used by *this* tenant — we merge with the
    // suggested list below. Deduplication happens in JS for case
    // tolerance.
    db.expense.findMany({
      where: { tenantId: ctx.tenant.id, category: { not: null } },
      distinct: ["category"],
      select: { category: true },
      take: 200,
    }),
    db.expense.aggregate({
      where,
      _sum: { amount: true, taxAmount: true },
      _count: true,
    }),
  ]);

  const usedCategorySet = new Set<string>();
  for (const u of usedCategories) if (u.category) usedCategorySet.add(u.category);
  for (const s of SUGGESTED_EXPENSE_CATEGORIES) usedCategorySet.add(s);
  const categoryOptions = Array.from(usedCategorySet).sort((a, b) => a.localeCompare(b));

  const total    = Number(totalAgg._sum.amount ?? 0);
  const tax      = Number(totalAgg._sum.taxAmount ?? 0);
  const count    = totalAgg._count ?? 0;

  const hasResults = expenses.length > 0;
  const hasExplicitFilters = hasAnyFilter || !!sp.from || !!sp.to;
  const isFirstRun = count === 0 && !hasExplicitFilters;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Expenses</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            {count} {count === 1 ? "entry" : "entries"}
            {" · "}
            <span>Total: </span>
            <span style={{ color: "var(--text)" }}>{formatMoney(total, ctx.tenant.currency)}</span>
            {tax > 0 && (
              <>
                {" · "}
                <span>Tax: </span>
                <span style={{ color: "var(--text)" }}>{formatMoney(tax, ctx.tenant.currency)}</span>
              </>
            )}
          </p>
        </div>
        {canManage && (
          <Link href={`/t/${slug}/expenses/new`}>
            <Button type="button">Log expense</Button>
          </Link>
        )}
      </div>

      {/* Quick-chip row — toggles the flags filter. */}
      <nav className="mt-4 flex flex-wrap gap-1 text-sm">
        {([
          { k: undefined,      label: "All" },
          { k: "jobLinked",    label: "Job-linked" },
          { k: "billable",     label: "Billable" },
        ] as const).map((c) => {
          const active = (sp.flags ?? undefined) === c.k;
          const qs = new URLSearchParams();
          if (c.k) qs.set("flags", c.k);
          if (sp.from) qs.set("from", sp.from);
          if (sp.to)   qs.set("to",   sp.to);
          return (
            <Link
              key={c.label}
              href={`/t/${slug}/expenses${qs.toString() ? `?${qs.toString()}` : ""}`}
              className="rounded-md px-3 py-1.5"
              style={{
                background: active ? "var(--panel)" : "transparent",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            >
              {c.label}
            </Link>
          );
        })}
      </nav>

      <form className="mt-4 flex flex-wrap gap-2 text-sm" method="get">
        {sp.flags && <input type="hidden" name="flags" value={sp.flags} />}
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search memo, ref, vendor…"
          className="flex-1 rounded-md px-3 py-2 outline-none"
          style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
        />
        <input
          type="date"
          name="from"
          defaultValue={fromStr}
          className="rounded-md px-3 py-2"
          style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
        />
        <input
          type="date"
          name="to"
          defaultValue={toStr}
          className="rounded-md px-3 py-2"
          style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
        />
        <select name="vendor" defaultValue={sp.vendor ?? ""} className="rounded-md px-3 py-2"
          style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}>
          <option value="">All vendors</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <select name="category" defaultValue={sp.category ?? ""} className="rounded-md px-3 py-2"
          style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}>
          <option value="">All categories</option>
          {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <Button type="submit" variant="secondary">Filter</Button>
        {(sp.q || sp.vendor || sp.category || sp.orderId || sp.flags || sp.from || sp.to) && (
          <Link href={`/t/${slug}/expenses`} className="rounded-md px-3 py-2" style={{ color: "var(--muted)" }}>
            Clear
          </Link>
        )}
      </form>

      {isFirstRun ? (
        <Card className="mt-4">
          <EmptyState
            icon={<span aria-hidden>🧾</span>}
            title="No expenses logged yet"
            description={
              <>
                Logging expenses — materials, subs, utilities — is what lets the
                dashboard show real gross profit per job and the P&amp;L match
                your bank statements. Every receipt you enter makes the numbers
                more honest.
              </>
            }
            action={
              canManage && (
                <Link
                  href={`/t/${slug}/expenses/new`}
                  className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-semibold transition-colors hover:brightness-110"
                  style={{ background: "var(--accent)", color: "white" }}
                >
                  Log your first expense
                </Link>
              )
            }
          />
        </Card>
      ) : (
        <Card className="mt-4 overflow-hidden">
          <table className="w-full text-sm">
            <thead style={{ color: "var(--muted)" }}>
              <tr className="text-left">
                <th className="px-4 py-3 font-normal">Date</th>
                <th className="px-4 py-3 font-normal">Vendor</th>
                <th className="px-4 py-3 font-normal">Category</th>
                <th className="px-4 py-3 font-normal">Method</th>
                <th className="px-4 py-3 font-normal">Order</th>
                <th className="px-4 py-3 font-normal">Memo</th>
                <th className="px-4 py-3 font-normal text-right">Tax</th>
                <th className="px-4 py-3 font-normal text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {!hasResults && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>
                    No expenses match.
                  </td>
                </tr>
              )}
              {expenses.map((e) => (
                <tr key={e.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="px-4 py-3">
                    <Link href={`/t/${slug}/expenses/${e.id}`} className="underline">
                      {formatDate(e.date)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {e.vendor ? (
                      <Link href={`/t/${slug}/vendors/${e.vendor.id}`} className="underline">
                        {e.vendor.name}
                      </Link>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>—</span>
                    )}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{e.category ?? "—"}</td>
                  <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{expenseMethodLabel(e.method)}</td>
                  <td className="px-4 py-3" style={{ color: "var(--muted)" }}>
                    {e.order ? (
                      <Link href={`/t/${slug}/orders/${e.order.id}`} className="underline">
                        {e.order.number}
                      </Link>
                    ) : "—"}
                    {e.billable && (
                      <span className="ml-1 rounded-full px-1.5 py-0.5 text-[10px]"
                        style={{ background: "#1f3a2a", color: "#a7f3d0" }}>
                        billable
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--muted)" }}>
                    {e.memo ? (e.memo.length > 40 ? e.memo.slice(0, 40) + "…" : e.memo) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: "var(--muted)" }}>
                    {Number(e.taxAmount) > 0 ? formatMoney(e.taxAmount.toString(), ctx.tenant.currency) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatMoney(e.amount.toString(), ctx.tenant.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
