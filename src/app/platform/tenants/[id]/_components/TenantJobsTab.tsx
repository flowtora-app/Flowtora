import { db } from "@/lib/db";
import { Badge, Banner, Card, CardBody, CardHeader, EmptyState } from "@/components/ui";

// Tab 5 — Jobs / Orders. Read-only with PII redaction unless the
// caller has impersonate permission. We don't actually impersonate
// here — the redaction switch just trusts that "you can see PII" is
// equivalent to "you can already impersonate to see it anyway".

export interface TenantJobsTabProps { tenantId: string; canImpersonate: boolean }

export async function TenantJobsTab({ tenantId, canImpersonate }: TenantJobsTabProps) {
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);

  const [aggregate, recentOrders, recentQuotes, recentInvoices] = await Promise.all([
    db.order.aggregate({ where: { tenantId }, _count: { _all: true }, _avg: { total: true } }),
    db.order.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { id: true, number: true, status: true, total: true, createdAt: true, customerId: true, dueDate: true },
    }),
    db.quote.count({ where: { tenantId } }),
    db.invoice.count({ where: { tenantId } }),
  ]);

  const inProduction = await db.order.count({ where: { tenantId, status: { in: ["IN_PRODUCTION", "READY", "OUT_FOR_INSTALL"] } } });
  const lateJobs = await db.order.count({ where: { tenantId, dueDate: { lt: new Date() }, status: { notIn: ["COMPLETED", "CANCELED"] } } });

  return (
    <div className="space-y-4">
      {!canImpersonate && (
        <Banner variant="info" title="PII redacted">
          Customer names are masked as <code>C-XXXX</code> on this view because your role
          can't impersonate. Open the tenant's app to see the raw values.
        </Banner>
      )}

      <Card padding="md">
        <CardHeader title="Aggregate metrics" />
        <CardBody>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Tile label="Total quotes"        value={recentQuotes.toLocaleString()} />
            <Tile label="Total work orders"   value={(aggregate._count._all ?? 0).toLocaleString()} />
            <Tile label="Total invoices"      value={recentInvoices.toLocaleString()} />
            <Tile label="Avg ticket"          value={`$${Math.round(Number(aggregate._avg.total ?? 0)).toLocaleString()}`} />
            <Tile label="In production"       value={inProduction.toLocaleString()} />
            <Tile label="Late"                value={lateJobs.toLocaleString()} tone={lateJobs > 0 ? "warning" : undefined} />
          </div>
        </CardBody>
      </Card>

      <Card padding="none" className="overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <CardHeader title="Recent orders" description={`${recentOrders.length} most recent`} />
        </div>
        {recentOrders.length === 0 ? (
          <CardBody><EmptyState title="No orders on file" description="Once the tenant accepts a quote, the order shows up here." /></CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead style={{ background: "var(--surface-2)" }}>
                <tr>
                  <Th>Order #</Th><Th>Customer</Th><Th>Status</Th><Th align="right">Total</Th><Th>Created</Th><Th>Due</Th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((o) => (
                  <tr key={o.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <Td><span className="font-mono">{o.number}</span></Td>
                    <Td>{canImpersonate ? <span className="font-mono text-[11px]" style={{ color: "var(--text-faint)" }}>{o.customerId}</span> : <span className="font-mono text-[11px]">{redact(o.customerId)}</span>}</Td>
                    <Td><Badge size="xs" color={o.status === "COMPLETED" ? "success" : o.status === "CANCELED" ? "neutral" : "info"}>{o.status.toLowerCase().replace(/_/g, " ")}</Badge></Td>
                    <Td align="right">${Number(o.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Td>
                    <Td>{o.createdAt.toLocaleDateString()}</Td>
                    <Td>{o.dueDate?.toLocaleDateString() ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function redact(s: string): string {
  if (!s) return "C-XXXX";
  return `C-${s.slice(0, 4).toUpperCase()}`;
}
function Tile({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return (
    <div className="rounded-md border p-3" style={{
      background: tone === "warning" ? "var(--amber-50)" : "var(--surface-2)",
      borderColor: tone === "warning" ? "var(--amber-200)" : "var(--border-subtle)",
    }}>
      <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="mt-0.5 text-[18px] font-semibold tabular-nums" style={{ color: tone === "warning" ? "var(--amber-800)" : "var(--text-default)" }}>{value}</div>
    </div>
  );
}
function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)", textAlign: align }}>{children}</th>;
}
function Td({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <td className="px-3 py-2" style={{ color: "var(--text-default)", textAlign: align, fontVariantNumeric: align === "right" ? "tabular-nums" : undefined, fontFamily: align === "right" ? "ui-monospace, Menlo, monospace" : undefined }}>{children}</td>;
}
