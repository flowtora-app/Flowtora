import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { SelectField, Button } from "@/components/Field";
import { createInvoice } from "@/app/actions/invoices";

export default async function NewInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; customerId?: string; orderId?: string; kind?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "invoices:manage");

  const [customers, openOrders] = await Promise.all([
    db.customer.findMany({
      where: { tenantId: ctx.tenant.id, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.order.findMany({
      where: { tenantId: ctx.tenant.id },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: { id: true, number: true, customerId: true, status: true },
    }),
  ]);

  const action = createInvoice.bind(null, slug);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div style={{ fontSize: 12 }}>
        <Link
          href={`/t/${slug}/invoices`}
          className="ts-focus inline-flex items-center gap-1 transition-colors hover:text-[var(--text-default)]"
          style={{ color: "var(--text-muted)" }}
        >
          ← Invoices
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
              <path d="M6 4h12v16l-3-2-3 2-3-2-3 2V4z" />
              <path d="M9 9h6M9 13h6M9 17h3" />
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
              New invoice
            </h1>
            <p
              className="mt-1.5"
              style={{
                color: "var(--text-muted)",
                fontSize: 12.5,
                lineHeight: 1.45,
              }}
            >
              Optionally tie to an existing order to seed line items.
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
          <SelectField
            label="Customer"
            name="customerId"
            required
            defaultValue={sp.customerId ?? ""}
            options={[
              { value: "", label: "— Choose a customer —" },
              ...customers.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <SelectField
            label="Order (optional)"
            name="orderId"
            defaultValue={sp.orderId ?? ""}
            options={[
              { value: "", label: "— No order —" },
              ...openOrders.map((o) => ({
                value: o.id,
                label: `${o.number} (${o.status.replace(/_/g, " ").toLowerCase()})`,
              })),
            ]}
          />
          <SelectField
            label="Kind"
            name="kind"
            defaultValue={sp.kind ?? "STANDARD"}
            options={[
              { value: "STANDARD", label: "Standard — snapshot order lines" },
              { value: "DEPOSIT",  label: "Deposit — single-line deposit" },
              { value: "BALANCE",  label: "Balance — remaining due" },
            ]}
          />
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Deposit/balance kinds only apply when an order is selected.
          </p>
          <Button type="submit">Create draft</Button>
        </form>
      </Card>
    </div>
  );
}
