import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { Button } from "@/components/Field";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function PackagesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requirePermission(slug, "products:view");
  const canManage = ctx.can("products:manage");

  const packages = await db.productPackage.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { _count: { select: { components: true } } },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <Link href={`/t/${slug}/products`} className="underline" style={{ color: "var(--muted)" }}>
          ← Products
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Package templates</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Reusable bundles your reps drop onto a quote in one click.{" "}
            {packages.length} {packages.length === 1 ? "template" : "templates"}.
          </p>
        </div>
        {canManage && (
          <Link href={`/t/${slug}/products/packages/new`}>
            <Button type="button">New package</Button>
          </Link>
        )}
      </div>

      {packages.length === 0 ? (
        <Card>
          <EmptyState
            icon={<span aria-hidden>📦</span>}
            title="No package templates yet"
            description={
              <>
                Bundle your common sell-togethers — &ldquo;Storefront starter&rdquo;,
                &ldquo;Trade show kit&rdquo;, &ldquo;Vehicle wrap + install&rdquo; —
                and reps can add the whole thing to a quote in one click.
                Pricing on each expanded line snapshots the catalog at the
                moment it&apos;s added, so tweaks to a package later never
                rewrite historical quotes.
              </>
            }
            action={
              canManage && (
                <Link
                  href={`/t/${slug}/products/packages/new`}
                  className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-semibold"
                  style={{
                    background: "var(--accent-primary)",
                    color: "var(--accent-fg)",
                  }}
                >
                  Create your first package
                </Link>
              )
            }
          />
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="All packages"
            right={
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Active packages appear in the quote &ldquo;Add package&rdquo; picker.
              </span>
            }
          />
          <ul>
            {packages.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between px-5 py-3 text-sm"
                style={{ borderTop: "1px solid var(--border-subtle)" }}
              >
                <div>
                  <Link
                    href={`/t/${slug}/products/packages/${p.id}`}
                    className="font-medium underline"
                  >
                    {p.name}
                  </Link>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>
                    {p._count.components}{" "}
                    {p._count.components === 1 ? "component" : "components"}
                    {p.description && <> · {p.description}</>}
                  </div>
                </div>
                <span
                  className="rounded-full px-2 py-0.5 text-xs"
                  style={{
                    background: p.active ? "var(--success-surface)" : "var(--surface-2)",
                    color: p.active ? "var(--success-fg)" : "var(--text-muted)",
                    border: p.active ? "none" : "1px solid var(--border-subtle)",
                  }}
                >
                  {p.active ? "Active" : "Archived"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
