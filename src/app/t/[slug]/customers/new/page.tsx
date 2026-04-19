import { requirePermission } from "@/lib/tenant";
import { createCustomer } from "@/app/actions/customers";
import { CustomerForm } from "@/components/CustomerForm";
import { Button } from "@/components/Field";
import { Card, CardHeader } from "@/components/Card";
import { listActiveMembers } from "@/lib/members";

export default async function NewCustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "customers:create");
  const action = createCustomer.bind(null, slug);
  const members = await listActiveMembers(ctx.tenant.id);

  return (
    <div>
      <h1 className="text-2xl font-semibold">New customer</h1>
      <Card className="mt-4">
        <CardHeader title="Details" />
        <form action={action} className="space-y-6 px-5 py-5">
          <CustomerForm members={members} />
          {sp.error && <p className="text-sm" style={{ color: "#ff6b6b" }}>{decodeURIComponent(sp.error)}</p>}
          <div className="flex justify-end">
            <Button type="submit">Create</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
