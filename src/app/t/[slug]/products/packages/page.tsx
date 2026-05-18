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
    <div className="space-y-5">
      <div style={{ fontSize: 12 }}>
        <Link
          href={`/t/${slug}/products`}
          className="ts-focus inline-flex items-center gap-1 transition-colors hover:text-[var(--text-default)]"
          style={{ color: "var(--text-muted)" }}
        >
          ← Products
        </Link>
      </div>

      <div
        className="relative overflow-hidden rounded-2xl"
        style={{
          padding: "18px 22px",
          background:
            "radial-gradient(880px circle at -10% -50%, var(--accent-surface), transparent 55%), " +
            "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
          border: "1px solid var(--border-subtle)",
          boxShadow:
            "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
            "0 1px 2px 0 rgba(0,0,0,0.18)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1
                className="font-semibold"
                style={{
                  color: "var(--text-default)",
                  fontSize: 24,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.15,
                }}
              >
                Package templates
              </h1>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  color: "var(--accent-primary)",
                  background: "var(--accent-surface)",
                  border:
                    "1px solid color-mix(in oklab, var(--accent-primary) 22%, transparent)",
                  padding: "3px 8px",
                  borderRadius: 999,
                  fontFeatureSettings: "'tnum' 1",
                  lineHeight: 1,
                }}
              >
                {packages.length}
              </span>
            </div>
            <p
              className="mt-1.5"
              style={{
                color: "var(--text-muted)",
                fontSize: 12.5,
                lineHeight: 1.45,
              }}
            >
              Reusable bundles your reps drop onto a quote in one click.
            </p>
          </div>
          {canManage && (
            <Link
              href={`/t/${slug}/products/packages/new`}
              className="ts-focus inline-flex items-center gap-1.5 rounded-lg font-semibold transition-transform"
              style={{
                height: 32,
                padding: "0 14px",
                background:
                  "linear-gradient(180deg, color-mix(in oklab, var(--accent-primary) 96%, white 4%) 0%, var(--accent-primary) 100%)",
                color: "var(--accent-fg)",
                border:
                  "1px solid color-mix(in oklab, var(--accent-primary) 80%, black 20%)",
                boxShadow:
                  "0 1px 0 0 rgba(255,255,255,0.15) inset, " +
                  "0 1px 2px 0 rgba(0,0,0,0.35)",
                fontSize: 12.5,
                letterSpacing: "-0.005em",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New package
            </Link>
          )}
        </div>
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
