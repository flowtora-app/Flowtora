import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { Field, TextArea, Button } from "@/components/Field";
import { formatMoney, formatDate } from "@/lib/format";
import { expenseMethodLabel } from "@/lib/finance";
import {
  updateVendor,
  archiveVendor,
  restoreVendor,
  deleteVendor,
} from "@/app/actions/vendors";

export default async function VendorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "vendors:view");
  const canManage = ctx.can("vendors:manage");

  const vendor = await db.vendor.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      _count: { select: { expenses: true } },
      expenses: {
        orderBy: { date: "desc" },
        take: 50,
        include: { order: { select: { id: true, number: true } } },
      },
    },
  });
  if (!vendor) notFound();

  // Lifetime / YTD spend summaries. YTD means "since Jan 1 of current
  // year" in the tenant's server time — a crude proxy for fiscal year
  // which we can refine when tenants start asking for calendar-year
  // reports with a custom start month.
  const ytdStart = new Date(new Date().getFullYear(), 0, 1);
  const [lifetime, ytd] = await Promise.all([
    db.expense.aggregate({
      where: { tenantId: ctx.tenant.id, vendorId: vendor.id },
      _sum: { amount: true },
    }),
    db.expense.aggregate({
      where: { tenantId: ctx.tenant.id, vendorId: vendor.id, date: { gte: ytdStart } },
      _sum: { amount: true },
    }),
  ]);
  const lifetimeSpend = Number(lifetime._sum.amount ?? 0);
  const ytdSpend = Number(ytd._sum.amount ?? 0);

  const updateAction  = updateVendor.bind(null, slug, vendor.id);
  const archiveAction = archiveVendor.bind(null, slug, vendor.id);
  const restoreAction = restoreVendor.bind(null, slug, vendor.id);
  const deleteAction  = deleteVendor.bind(null, slug, vendor.id);

  return (
    <div className="space-y-5">
      <div style={{ fontSize: 12 }}>
        <Link
          href={`/t/${slug}/vendors`}
          className="ts-focus inline-flex items-center gap-1 transition-colors hover:text-[var(--text-default)]"
          style={{ color: "var(--text-muted)" }}
        >
          ← Vendors
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
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3.5">
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
                fontSize: 18,
                fontWeight: 700,
                flexShrink: 0,
                boxShadow:
                  "inset 0 1px 0 0 color-mix(in oklab, white 6%, transparent)",
              }}
            >
              {(vendor.name ?? "?").trim().charAt(0).toUpperCase() || "?"}
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
                  }}
                >
                  {vendor.name}
                </h1>
                {!vendor.active && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      padding: "2px 7px",
                      borderRadius: 999,
                      background: "var(--surface-2)",
                      border: "1px solid var(--border-subtle)",
                      color: "var(--text-muted)",
                      lineHeight: 1,
                    }}
                  >
                    Archived
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
                  {vendor.category ?? "Uncategorized"}
                </span>
                <span style={{ color: "var(--text-faint)" }}> · </span>
                <span style={{ color: "var(--text-default)", fontFeatureSettings: "'tnum' 1" }}>
                  {vendor._count.expenses}
                </span>{" "}
                expense{vendor._count.expenses === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          {canManage && (
            <Link
              href={`/t/${slug}/expenses/new?vendorId=${vendor.id}`}
              className="ts-focus inline-flex items-center gap-1.5 rounded-lg font-semibold transition-transform"
              style={{
                height: 32,
                padding: "0 14px",
                background:
                  "linear-gradient(180deg, color-mix(in oklab, var(--accent-primary) 96%, white 4%) 0%, var(--accent-primary) 100%)",
                color: "var(--accent-fg)",
                border:
                  "1px solid color-mix(in oklab, var(--accent-primary) 80%, black 20%)",
                boxShadow:
                  "0 1px 0 0 rgba(255,255,255,0.15) inset, " +
                  "0 1px 2px 0 rgba(0,0,0,0.35)",
                fontSize: 12.5,
                letterSpacing: "-0.005em",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Log expense
            </Link>
          )}
        </div>
      </header>

      {sp.error && (
        <div className="rounded-md px-3 py-2 text-sm"
          style={{ background: "#3a1517", color: "#ff8b8b", border: "1px solid #5b2024" }}>
          {sp.error}
        </div>
      )}

      {/* Spend summary */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="px-5 py-4">
          <div className="text-xs" style={{ color: "var(--muted)" }}>Lifetime spend</div>
          <div className="mt-1 text-lg font-semibold">{formatMoney(lifetimeSpend, ctx.tenant.currency)}</div>
        </Card>
        <Card className="px-5 py-4">
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            Year to date ({new Date().getFullYear()})
          </div>
          <div className="mt-1 text-lg font-semibold">{formatMoney(ytdSpend, ctx.tenant.currency)}</div>
        </Card>
      </div>

      {/* Recent expenses */}
      <Card>
        <CardHeader
          title="Recent expenses"
          description={vendor._count.expenses > 50 ? `Showing 50 most recent of ${vendor._count.expenses}` : undefined}
          right={
            <Link href={`/t/${slug}/expenses?vendor=${vendor.id}`} className="text-xs underline"
              style={{ color: "var(--muted)" }}>
              See all
            </Link>
          }
        />
        {vendor.expenses.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
            No expenses recorded against this vendor yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead style={{ color: "var(--muted)" }}>
              <tr className="text-left">
                <th className="px-4 py-2 font-normal">Date</th>
                <th className="px-4 py-2 font-normal">Category</th>
                <th className="px-4 py-2 font-normal">Order</th>
                <th className="px-4 py-2 font-normal">Method</th>
                <th className="px-4 py-2 font-normal text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {vendor.expenses.map((e) => (
                <tr key={e.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="px-4 py-2">
                    <Link href={`/t/${slug}/expenses/${e.id}`} className="underline">
                      {formatDate(e.date)}
                    </Link>
                  </td>
                  <td className="px-4 py-2" style={{ color: "var(--muted)" }}>{e.category ?? "—"}</td>
                  <td className="px-4 py-2" style={{ color: "var(--muted)" }}>
                    {e.order ? (
                      <Link href={`/t/${slug}/orders/${e.order.id}`} className="underline">
                        {e.order.number}
                      </Link>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2" style={{ color: "var(--muted)" }}>{expenseMethodLabel(e.method)}</td>
                  <td className="px-4 py-2 text-right">{formatMoney(e.amount.toString(), ctx.tenant.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Edit form */}
      {canManage && (
        <Card>
          <CardHeader title="Details" />
          <form action={updateAction} className="space-y-4 px-5 py-5">
            <Field label="Name" name="name" required defaultValue={vendor.name} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Category" name="category" defaultValue={vendor.category ?? ""} />
              <Field label="Primary contact" name="contact" defaultValue={vendor.contact ?? ""} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Email" name="email" type="email" defaultValue={vendor.email ?? ""} />
              <Field label="Phone" name="phone" defaultValue={vendor.phone ?? ""} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Website" name="website" defaultValue={vendor.website ?? ""} />
              <Field label="Account # with vendor" name="accountNumber" defaultValue={vendor.accountNumber ?? ""} />
            </div>
            <Field label="Address line 1" name="addressLine1" defaultValue={vendor.addressLine1 ?? ""} />
            <Field label="Address line 2" name="addressLine2" defaultValue={vendor.addressLine2 ?? ""} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="City" name="city" defaultValue={vendor.city ?? ""} />
              <Field label="Region / state" name="region" defaultValue={vendor.region ?? ""} />
              <Field label="Postal code" name="postalCode" defaultValue={vendor.postalCode ?? ""} />
            </div>
            <Field label="Country" name="country" defaultValue={vendor.country ?? ""} />
            <TextArea label="Notes" name="notes" rows={3} defaultValue={vendor.notes ?? ""} />
            <Button type="submit">Save changes</Button>
          </form>
        </Card>
      )}

      {/* Danger zone */}
      {canManage && (
        <Card>
          <CardHeader title="Archive / delete" />
          <div className="space-y-3 px-5 py-5 text-sm" style={{ color: "var(--muted)" }}>
            <p>
              Archiving hides the vendor from active lists but keeps historical expenses readable.
              Deletion is only allowed when the vendor has no recorded expenses.
            </p>
            <div className="flex flex-wrap gap-2">
              {vendor.active ? (
                <form action={archiveAction}>
                  <Button type="submit" variant="secondary">Archive vendor</Button>
                </form>
              ) : (
                <form action={restoreAction}>
                  <Button type="submit" variant="secondary">Restore vendor</Button>
                </form>
              )}
              {vendor._count.expenses === 0 && (
                <form action={deleteAction}>
                  <Button type="submit" variant="danger">Delete vendor</Button>
                </form>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
