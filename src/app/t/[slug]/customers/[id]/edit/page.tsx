import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/tenant";
import { updateCustomer } from "@/app/actions/customers";
import { CustomerForm } from "@/components/CustomerForm";
import { Button } from "@/components/Field";
import { Card } from "@/components/Card";
import { listActiveMembers } from "@/lib/members";
import { db } from "@/lib/db";

export default async function EditCustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "customers:edit");
  const customer = await db.customer.findFirst({ where: { id, tenantId: ctx.tenant.id } });
  if (!customer) notFound();
  ctx.assertBranchAccess(customer.locationId);

  const members = await listActiveMembers(ctx.tenant.id);
  const action = updateCustomer.bind(null, slug, customer.id);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <Link
          href={`/t/${slug}/customers/${customer.id}`}
          className="text-sm underline"
          style={{ color: "var(--text-muted)" }}
        >
          ← Back to {customer.name}
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">Edit customer</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Update profile, contact info, pipeline value, and addresses.
        </p>
      </div>

      {sp.error && (
        <div
          className="rounded-md px-3 py-2 text-sm"
          style={{
            background: "var(--danger-surface)",
            color: "var(--danger-fg)",
            border: "1px solid var(--danger-fg)",
          }}
        >
          {decodeURIComponent(sp.error)}
        </div>
      )}

      <Card>
        <form action={action} className="space-y-6 px-5 py-5">
          <CustomerForm customer={customer} members={members} />

          <div
            className="flex items-center justify-end gap-2 pt-4"
            style={{ borderTop: "1px solid var(--border-subtle)" }}
          >
            <Link
              href={`/t/${slug}/customers/${customer.id}`}
              className="ts-focus rounded-md px-3 py-1.5 text-sm"
              style={{ color: "var(--text-muted)" }}
            >
              Cancel
            </Link>
            <Button type="submit">Save changes</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
