import Link from "next/link";
import { requirePortalToken, portalPath } from "@/lib/portal";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { formatMoney, formatDate } from "@/lib/format";
import { statusColor, statusLabel, outstandingBalance } from "@/lib/invoices";

export default async function PortalInvoicesPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await requirePortalToken(token);

  // DRAFT and VOID invoices aren't shown in the portal.
  const invoices = await db.invoice.findMany({
    where: {
      tenantId:   ctx.tenant.id,
      customerId: ctx.customer.id,
      status:     { notIn: ["DRAFT", "VOID"] },
    },
    select: {
      id: true, number: true, status: true,
      total: true, amountPaid: true,
      refundedAmount: true, writtenOffAmount: true,
      issuedAt: true, dueDate: true,
    },
    orderBy: { issuedAt: "desc" },
  });

  const totalDue = invoices.reduce((n, inv) => n + outstandingBalance(inv), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Invoices</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Your account balance is {formatMoney(totalDue, ctx.tenant.currency)}.
        </p>
      </div>

      <Card>
        <CardHeader title={`${invoices.length} total`} />
        <ul>
          {invoices.length === 0 && (
            <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
              No invoices yet.
            </li>
          )}
          {invoices.map((inv) => {
            const balance = outstandingBalance(inv);
            return (
              <li
                key={inv.id}
                className="flex items-center justify-between px-5 py-3"
                style={{ borderTop: "1px solid var(--border-subtle)" }}
              >
                <div className="flex items-center gap-3">
                  <Link href={portalPath(token, `invoices/${inv.id}`)} className="text-sm font-medium underline">
                    {inv.number}
                  </Link>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs"
                    style={{ background: statusColor(inv.status), color: "white" }}
                  >
                    {statusLabel(inv.status)}
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {inv.issuedAt && <>issued {formatDate(inv.issuedAt, ctx.tenant.dateFormat)}</>}
                    {inv.dueDate && <> · due {formatDate(inv.dueDate, ctx.tenant.dateFormat)}</>}
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium">
                    {formatMoney(balance, ctx.tenant.currency)}
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    of {formatMoney(Number(inv.total), ctx.tenant.currency)}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
