import { db } from "@/lib/db";
import { Badge, Card, CardBody, CardHeader, EmptyState } from "@/components/ui";

// Tab 7 — Catalog. Today the only persisted catalog model is Product;
// Materials / Equipment / Pricing-formulas are part of the spec's
// future scope. We render Products as the live data and surface the
// other three sub-categories with explicit "Awaiting source" empty
// states so the spec's intent stays visible.

export interface TenantCatalogTabProps { tenantId: string }

export async function TenantCatalogTab({ tenantId }: TenantCatalogTabProps) {
  const [products, productCount] = await Promise.all([
    db.product.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true, name: true, sku: true, basePrice: true,
        category: true, createdAt: true,
      },
    }),
    db.product.count({ where: { tenantId } }).catch(() => 0),
  ]);

  return (
    <div className="space-y-4">
      <Card padding="none" className="overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <CardHeader title="Products" description={`${productCount} on file`} />
        </div>
        {products.length === 0 ? (
          <CardBody>
            <EmptyState
              title="No products configured"
              description="Tenants build their catalog under /t/[slug]/products."
            />
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead style={{ background: "var(--surface-2)" }}>
                <tr>
                  <Th>Name</Th><Th>SKU</Th><Th>Category</Th><Th align="right">Base price</Th><Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <Td>{p.name}</Td>
                    <Td><span className="font-mono text-[11px]" style={{ color: "var(--text-faint)" }}>{p.sku ?? "—"}</span></Td>
                    <Td>{p.category ?? <span style={{ color: "var(--text-faint)" }}>—</span>}</Td>
                    <Td align="right">{p.basePrice != null ? `$${Number(p.basePrice).toLocaleString()}` : <span style={{ color: "var(--text-faint)" }}>—</span>}</Td>
                    <Td><Badge size="xs" color="success">Active</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {(["Materials", "Equipment", "Pricing formulas"] as const).map((label) => (
        <Card key={label} padding="md">
          <CardHeader title={label} />
          <CardBody>
            <div className="rounded-md border-l-4 px-3 py-2 text-[12px]"
                 style={{ background: "var(--surface-2)", borderLeftColor: "var(--amber-500)", color: "var(--text-default)" }}>
              <strong>Awaiting source · </strong>
              {label} aren't yet a separate model in the catalog schema. When they land, this card
              swaps in a read-only table identical to Products above (with a "from master template"
              badge per the spec).
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)", textAlign: align }}>{children}</th>;
}
function Td({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <td className="px-3 py-2" style={{ color: "var(--text-default)", textAlign: align, fontVariantNumeric: align === "right" ? "tabular-nums" : undefined, fontFamily: align === "right" ? "ui-monospace, Menlo, monospace" : undefined }}>{children}</td>;
}
