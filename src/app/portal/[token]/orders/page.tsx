import Link from "next/link";
import { requirePortalToken, portalPath } from "@/lib/portal";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatMoney, formatDate } from "@/lib/format";
import { statusColor, statusLabel } from "@/lib/orders";

export default async function PortalOrdersPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await requirePortalToken(token);

  const orders = await db.order.findMany({
    where: { tenantId: ctx.tenant.id, customerId: ctx.customer.id },
    select: {
      id: true, number: true, status: true, total: true,
      dueDate: true, completedAt: true, updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Orders</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Track the status of work we&apos;re doing for you.
        </p>
      </div>

      <Card>
        <CardHeader title={`${orders.length} total`} />
        <ul>
          {orders.length === 0 && (
            <li>
              <EmptyState
                title="Nothing to show yet"
                description="Orders will appear here as soon as work is scheduled for you."
              />
            </li>
          )}
          {orders.map((o) => (
            <li
              key={o.id}
              className="flex items-center justify-between px-5 py-3"
              style={{ borderTop: "1px solid var(--border-subtle)" }}
            >
              <div className="flex items-center gap-3">
                <Link href={portalPath(token, `orders/${o.id}`)} className="text-sm font-medium underline">
                  {o.number}
                </Link>
                <span
                  className="rounded-full px-2 py-0.5 text-xs"
                  style={{ background: statusColor(o.status), color: "white" }}
                >
                  {statusLabel(o.status)}
                </span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {o.dueDate && <>due {formatDate(o.dueDate, ctx.tenant.dateFormat)}</>}
                  {o.completedAt && <> · completed {formatDate(o.completedAt, ctx.tenant.dateFormat)}</>}
                </span>
              </div>
              <div className="text-sm font-medium">
                {formatMoney(Number(o.total), ctx.tenant.currency)}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
