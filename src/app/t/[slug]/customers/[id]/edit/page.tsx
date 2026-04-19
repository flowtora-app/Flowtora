import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/tenant";
import { updateCustomer } from "@/app/actions/customers";
import { CustomerForm } from "@/components/CustomerForm";
import { Button } from "@/components/Field";
import { Card, CardHeader } from "@/components/Card";
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
    <div>
      <h1 className="text-2xl font-semibold">Edit {customer.name}</h1>
      <Card className="mt-4">
        <CardHeader title="Details" />
        <form action={action} className="space-y-6 px-5 py-5">
          <CustomerForm customer={customer} members={members} />
          {sp.error && <p className="text-sm" style={{ color: "#ff6b6b" }}>{decodeURIComponent(sp.error)}</p>}
          <div className="flex justify-end">
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
