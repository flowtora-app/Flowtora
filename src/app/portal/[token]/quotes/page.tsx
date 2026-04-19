import Link from "next/link";
import { requirePortalToken, portalPath } from "@/lib/portal";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { formatMoney, formatDate } from "@/lib/format";
import { statusColor, statusLabel } from "@/lib/quotes";

export default async function PortalQuotesPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await requirePortalToken(token);

  // We hide DRAFT quotes from the portal — they haven't been sent to the
  // customer yet. Everything else is visible.
  const quotes = await db.quote.findMany({
    where: {
      tenantId:   ctx.tenant.id,
      customerId: ctx.customer.id,
      status:     { not: "DRAFT" },
    },
    select: {
      id: true, number: true, status: true, total: true,
      issuedAt: true, expiresAt: true, approvedAt: true, declinedAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Quotes</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Review and respond to quotes from {ctx.tenant.name}.
        </p>
      </div>

      <Card>
        <CardHeader title={`${quotes.length} total`} />
        <ul>
          {quotes.length === 0 && (
            <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
              No quotes yet.
            </li>
          )}
          {quotes.map((q) => (
            <li
              key={q.id}
              className="flex items-center justify-between px-5 py-3"
              style={{ borderTop: "1px solid var(--border-subtle)" }}
            >
              <div className="flex items-center gap-3">
                <Link href={portalPath(token, `quotes/${q.id}`)} className="text-sm font-medium underline">
                  {q.number}
                </Link>
                <span
                  className="rounded-full px-2 py-0.5 text-xs"
                  style={{ background: statusColor(q.status), color: "white" }}
                >
                  {statusLabel(q.status)}
                </span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {q.issuedAt && <>issued {formatDate(q.issuedAt, ctx.tenant.dateFormat)}</>}
                  {q.expiresAt && <> · expires {formatDate(q.expiresAt, ctx.tenant.dateFormat)}</>}
                  {q.approvedAt && <> · approved {formatDate(q.approvedAt, ctx.tenant.dateFormat)}</>}
                  {q.declinedAt && <> · declined {formatDate(q.declinedAt, ctx.tenant.dateFormat)}</>}
                </span>
              </div>
              <div className="text-sm font-medium">
                {formatMoney(Number(q.total), ctx.tenant.currency)}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
