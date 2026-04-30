import { db } from "@/lib/db";
import { Banner, Card, CardBody, CardHeader, EmptyState } from "@/components/ui";

export interface TenantCustomersTabProps { tenantId: string; canImpersonate: boolean }

export async function TenantCustomersTab({ tenantId, canImpersonate }: TenantCustomersTabProps) {
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
  const last12Buckets: { label: string; date: Date }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(monthStart);
    d.setMonth(d.getMonth() - i);
    last12Buckets.push({ label: d.toLocaleDateString(undefined, { month: "short" }), date: d });
  }

  const [total, newThisMonth, top10, all] = await Promise.all([
    db.customer.count({ where: { tenantId } }),
    db.customer.count({ where: { tenantId, createdAt: { gte: monthStart } } }),
    db.customer.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, name: true, email: true, createdAt: true },
    }),
    db.order.groupBy({
      by: ["customerId"],
      where: { tenantId },
      _sum: { total: true },
      _count: { _all: true },
      take: 50,
      orderBy: { _sum: { total: "desc" } },
    }),
  ]);

  // Map orders → customer name lookup.
  const ids = all.map((a) => a.customerId).filter(Boolean) as string[];
  const customerMap = new Map(top10.map((c) => [c.id, c]));
  // For top-by-LTV use the orders aggregate.
  const top = all
    .map((a) => ({
      id: a.customerId!,
      ltv: Math.round(Number((a._sum as { total?: unknown } | null)?.total ?? 0)),
      orders: a._count._all,
      customer: customerMap.get(a.customerId!),
    }))
    .filter((x) => x.id)
    .slice(0, 10);

  void ids;

  return (
    <div className="space-y-4">
      {!canImpersonate && (
        <Banner variant="info" title="Customer names anonymised">
          Names + emails masked because your role can't impersonate. Open the tenant's app to see the raw values.
        </Banner>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Tile label="Total customers"   value={total.toLocaleString()} />
        <Tile label="New this month"    value={newThisMonth.toLocaleString()} />
        <Tile label="Top 10 LTV (sum)"  value={`$${top.reduce((s, c) => s + c.ltv, 0).toLocaleString()}`} />
      </div>

      <Card padding="none" className="overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <CardHeader title="Top 10 by lifetime spend" />
        </div>
        {top.length === 0 ? (
          <CardBody><EmptyState title="No customer revenue" description="Once orders are paid, the leaderboard fills." /></CardBody>
        ) : (
          <table className="w-full text-[12px]">
            <thead style={{ background: "var(--surface-2)" }}>
              <tr><Th>#</Th><Th>Customer</Th><Th align="right">Orders</Th><Th align="right">LTV</Th></tr>
            </thead>
            <tbody>
              {top.map((c, i) => (
                <tr key={c.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <Td><span className="font-mono" style={{ color: "var(--text-faint)" }}>{i + 1}</span></Td>
                  <Td>{canImpersonate ? (c.customer?.name ?? c.id) : redact(c.id)}</Td>
                  <Td align="right">{c.orders}</Td>
                  <Td align="right">${c.ltv.toLocaleString()}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card padding="md">
        <CardHeader title="Trend" />
        <CardBody>
          <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Per-tenant customer-growth chart wires up alongside the platform-side Cohort Retention
            report. For now, raw counts above. (Total: {total.toLocaleString()}, +{newThisMonth.toLocaleString()} this month.)
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function redact(id: string): string { return `C-${id.slice(0, 4).toUpperCase()}`; }
function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3" style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
      <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="mt-0.5 text-[18px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>{value}</div>
    </div>
  );
}
function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)", textAlign: align }}>{children}</th>;
}
function Td({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <td className="px-3 py-2" style={{ color: "var(--text-default)", textAlign: align, fontVariantNumeric: align === "right" ? "tabular-nums" : undefined, fontFamily: align === "right" ? "ui-monospace, Menlo, monospace" : undefined }}>{children}</td>;
}
