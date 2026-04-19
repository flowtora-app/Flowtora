import { requirePermission } from "@/lib/tenant";
import { loadSampleData, clearSampleData } from "@/app/actions/sample-data";
import { Card, CardHeader } from "@/components/Card";
import { db } from "@/lib/db";

// Phase 4 Slice C — sample data settings page.
//
// A place to:
//   • see whether sample data is loaded (and when), and
//   • remove it surgically.
//
// We run a quick count(*) for demo-tagged customers and demo-SKU'd
// products so the owner sees a real number, not just a flag — it's
// common to mix real work in alongside the demo, and we want them to
// know exactly what "clear" will touch before they click.

const DEMO_TAG = "demo";
const DEMO_SKU_PREFIX = "DEMO-";

export default async function SampleDataSettings({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sample?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const { tenant } = await requirePermission(slug, "tenant:manage");

  const [demoCustomers, demoProducts] = await Promise.all([
    db.customer.count({
      where: { tenantId: tenant.id, tags: { has: DEMO_TAG } },
    }),
    db.product.count({
      where: {
        tenantId: tenant.id,
        sku: { startsWith: DEMO_SKU_PREFIX },
      },
    }),
  ]);

  const hasDemo = demoCustomers > 0 || demoProducts > 0;
  const loadAction = loadSampleData.bind(null, slug);
  const clearAction = clearSampleData.bind(null, slug);
  const justCleared = sp.sample === "cleared";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Sample data"
          description="A small demo shop you can load to explore Flowtora with pre-populated customers, products, quotes, and invoices."
        />
        <div className="space-y-4 px-5 py-5">
          {justCleared && (
            <div
              className="rounded-md px-3 py-2 text-sm"
              style={{
                background: "var(--success-surface)",
                border: "1px solid var(--success-fg)",
                color: "var(--success-fg)",
              }}
            >
              Sample data cleared.
            </div>
          )}

          <div
            className="grid gap-3 rounded-md px-4 py-3 text-sm sm:grid-cols-3"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <LabelValue
              label="Status"
              value={
                hasDemo
                  ? "Sample data present"
                  : tenant.sampleDataLoadedAt
                    ? "Previously loaded, now cleared"
                    : "Not loaded"
              }
            />
            <LabelValue
              label="Demo customers"
              value={String(demoCustomers)}
            />
            <LabelValue
              label="Demo products"
              value={String(demoProducts)}
            />
          </div>

          <div
            className="rounded-md px-3 py-2 text-xs"
            style={{
              background: "var(--surface-0)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-faint)",
            }}
          >
            Clearing only removes rows tagged <code>demo</code> (customers) or
            whose SKU starts with <code>DEMO-</code> (products), plus their
            related quotes, orders, and invoices. Anything else you&apos;ve
            created is left alone.
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            {hasDemo ? (
              <form action={clearAction}>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors hover:brightness-110"
                  style={{
                    background: "var(--danger-surface)",
                    color: "var(--danger-fg)",
                    border: "1px solid var(--danger-fg)",
                  }}
                >
                  Clear sample data
                </button>
              </form>
            ) : (
              <form action={loadAction}>
                <button
                  type="submit"
                  disabled={!!tenant.sampleDataLoadedAt}
                  className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  style={{
                    background: "var(--accent-primary)",
                    color: "var(--accent-fg)",
                  }}
                  title={
                    tenant.sampleDataLoadedAt
                      ? "Sample data can only be seeded once per workspace"
                      : undefined
                  }
                >
                  {tenant.sampleDataLoadedAt
                    ? "Already loaded once"
                    : "Load sample data"}
                </button>
              </form>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

function LabelValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        className="text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--text-faint)" }}
      >
        {label}
      </div>
      <div
        className="mt-0.5 text-sm"
        style={{ color: "var(--text-default)" }}
      >
        {value}
      </div>
    </div>
  );
}
