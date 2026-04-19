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
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 text-sm">
        <Link href={`/t/${slug}/invoices`} className="underline" style={{ color: "var(--muted)" }}>
          ← Invoices
        </Link>
      </div>
      <Card>
        <CardHeader
          title="New invoice"
          description="Optionally tie to an existing order to seed line items."
        />
        <form action={action} className="space-y-4 px-5 py-5">
          {sp.error && (
            <div className="rounded-md px-3 py-2 text-sm" style={{ background: "#3a1517", color: "#ff8b8b", border: "1px solid #5b2024" }}>
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
