import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { createCustomer } from "@/app/actions/customers";
import { CustomerForm } from "@/components/CustomerForm";
import { Button } from "@/components/Field";
import { Card } from "@/components/Card";
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
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <Link
          href={`/t/${slug}/customers`}
          className="text-sm underline"
          style={{ color: "var(--text-muted)" }}
        >
          ← Back to customers
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">New customer</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Capture the essentials — you can add contacts, tasks, portal access,
          and more from the detail page.
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
          <CustomerForm members={members} />

          <div
            className="flex items-center justify-end gap-2 pt-4"
            style={{ borderTop: "1px solid var(--border-subtle)" }}
          >
            <Link
              href={`/t/${slug}/customers`}
              className="ts-focus rounded-md px-3 py-1.5 text-sm"
              style={{ color: "var(--text-muted)" }}
            >
              Cancel
            </Link>
            <Button type="submit">Create customer</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
