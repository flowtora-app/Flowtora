import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Button } from "@/components/Field";
import { Card } from "@/components/Card";
import { formatMoney, humanize } from "@/lib/format";
import { pricingMeta, marginPercent } from "@/lib/pricing";
import { PRODUCT_KINDS, kindLabel } from "@/lib/catalog";
import { getGroupContext } from "@/lib/franchise";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Prisma, Product, ProductKind } from "@prisma/client";

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; category?: string; active?: string; kind?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "products:view");
  const canManage = ctx.can("products:manage");

  // Phase 15 Slice D — if this tenant inherits from a franchisor, mix in the
  // parent's shared products (read-only). Inherited rows participate in the
  // same search/filter UI; we just tag them so the table can mark them.
  const group = await getGroupContext(ctx.tenant.id);

  // Phase 8 Slice E — kind filter. We validate against the known enum so a
  // crafted URL can't leak a Prisma error. Empty / unknown value → ignored.
  const kindFilter =
    sp.kind && PRODUCT_KINDS.some((k) => k.value === sp.kind)
      ? (sp.kind as ProductKind)
      : null;

  const buildWhere = (tenantId: string, includeInactiveFilter = true): Prisma.ProductWhereInput => {
    const w: Prisma.ProductWhereInput = { tenantId };
    if (sp.category) w.category = sp.category;
    if (kindFilter) w.kind = kindFilter;
    if (includeInactiveFilter) {
      if (sp.active === "active") w.active = true;
      else if (sp.active === "inactive") w.active = false;
    }
    if (sp.q) {
      w.OR = [
        { name: { contains: sp.q, mode: "insensitive" } },
        { sku: { contains: sp.q, mode: "insensitive" } },
        { description: { contains: sp.q, mode: "insensitive" } },
      ];
    }
    return w;
  };

  const ownWhere = buildWhere(ctx.tenant.id);

  const [ownProducts, sharedProducts, categoryRows] = await Promise.all([
    db.product.findMany({
      where: ownWhere,
      orderBy: [{ active: "desc" }, { name: "asc" }],
      take: 300,
      // Phase 8 Slice E — we pull quoteItems count to surface usage, and
      // cost stays on the row already so we can compute a margin badge.
      include: { _count: { select: { optionGroups: true, quoteItems: true } } },
    }),
    // Inherited shared products from the parent — only when the active filter
    // doesn't exclude active rows (parent rows are required-active to inherit).
    group.parentTenantId && sp.active !== "inactive"
      ? db.product.findMany({
          where: { ...buildWhere(group.parentTenantId, false), shared: true, active: true },
          orderBy: [{ name: "asc" }],
          take: 300,
          include: { _count: { select: { optionGroups: true, quoteItems: true } } },
        })
      : Promise.resolve(
          [] as Array<Product & { _count: { optionGroups: number; quoteItems: number } }>,
        ),
    db.product.findMany({
      where: { tenantId: ctx.tenant.id, category: { not: null } },
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
    }),
  ]);

  type RowProduct = (typeof ownProducts)[number] & { inherited: boolean };
  const products: RowProduct[] = [
    ...ownProducts.map((p) => ({ ...p, inherited: false })),
    ...sharedProducts.map((p) => ({ ...p, inherited: true })),
  ];

  const categories = categoryRows.map((c) => c.category!).filter(Boolean);

  // Phase 4 Slice E — teaching empty state vs. filtered-no-results.
  const hasFilters = !!(sp.q || sp.category || sp.active || sp.kind);
  const isFirstRun = products.length === 0 && !hasFilters;

  const fieldStyle = {
    background: "var(--surface-2)",
    border: "1px solid var(--border-subtle)",
    color: "var(--text-default)",
    fontSize: 12.5,
    fontWeight: 500 as const,
    padding: "6px 10px",
    height: 34,
    borderRadius: 8,
  };

  return (
    <div>
      {/* Premium page header. */}
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
                Products &amp; services
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
                {products.length}
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
              Your catalog — products, services, and anything priced by the unit or job. Faster quotes with every item you add.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/t/${slug}/products/packages`}
              className="ts-focus inline-flex items-center gap-1.5 rounded-lg transition-colors hover:bg-[var(--surface-3)]"
              style={{
                height: 32,
                padding: "0 12px",
                background: "color-mix(in oklab, var(--surface-2) 75%, transparent)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-default)",
                fontSize: 12.5,
                fontWeight: 500,
                letterSpacing: "-0.005em",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 7l9-4 9 4-9 4-9-4z" />
                <path d="M3 7v10l9 4 9-4V7" />
              </svg>
              Packages
            </Link>
            {canManage && (
              <Link
                href={`/t/${slug}/products/new`}
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
                New product
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Premium filter form. */}
      <form className="mt-5 flex flex-wrap items-center gap-2" method="get">
        <div
          className="flex flex-1 min-w-[260px]"
          style={{
            position: "relative",
            alignItems: "center",
            gap: 8,
            height: 34,
            padding: "0 10px",
            borderRadius: 8,
            background: "color-mix(in oklab, var(--surface-2) 75%, transparent)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--text-faint)", flexShrink: 0 }}>
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Search name, SKU, description…"
            style={{
              flex: 1,
              minWidth: 0,
              background: "transparent",
              border: 0,
              outline: "none",
              color: "var(--text-default)",
              fontSize: 12.5,
              fontWeight: 500,
              letterSpacing: "-0.005em",
            }}
          />
        </div>
        <select name="category" defaultValue={sp.category ?? ""} className="ts-focus outline-none" style={fieldStyle}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select name="kind" defaultValue={sp.kind ?? ""} className="ts-focus outline-none" style={fieldStyle}>
          <option value="">All kinds</option>
          {PRODUCT_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <select name="active" defaultValue={sp.active ?? ""} className="ts-focus outline-none" style={fieldStyle}>
          <option value="">All statuses</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>
        <button
          type="submit"
          className="ts-focus inline-flex items-center gap-1.5 rounded-lg transition-colors hover:bg-[var(--surface-3)]"
          style={{
            height: 34,
            padding: "0 14px",
            background: "var(--surface-2)",
            color: "var(--text-default)",
            border: "1px solid var(--border-subtle)",
            fontSize: 12.5,
            fontWeight: 600,
            letterSpacing: "-0.005em",
          }}
        >
          Filter
        </button>
      </form>

      {isFirstRun ? (
        <Card className="mt-4">
          <EmptyState
            icon={<span aria-hidden>🏷️</span>}
            title="Your catalog is empty"
            description={
              <>
                Products and services live here — banners, business cards,
                design hours, anything priced by the unit or job. Load your
                top sellers first; quoting gets faster with every item you
                add.
              </>
            }
            action={
              canManage && (
                <Link
                  href={`/t/${slug}/products/new`}
                  className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-semibold transition-colors hover:brightness-110"
                  style={{
                    background: "var(--accent-primary)",
                    color: "var(--accent-fg)",
                  }}
                >
                  Add a product
                </Link>
              )
            }
            secondary={
              canManage && !ctx.tenant.sampleDataLoadedAt ? (
                <Link
                  href={`/t/${slug}/settings/sample-data`}
                  className="text-xs underline"
                  style={{ color: "var(--text-muted)" }}
                >
                  Or load a demo catalog to explore
                </Link>
              ) : undefined
            }
          />
        </Card>
      ) : (
      <Card className="mt-4 overflow-hidden">
        <table className="w-full text-sm">
          <thead style={{ color: "var(--muted)" }}>
            <tr className="text-left">
              <th className="px-4 py-3 font-normal">Name</th>
              <th className="px-4 py-3 font-normal">Kind</th>
              <th className="px-4 py-3 font-normal">Category</th>
              <th className="px-4 py-3 font-normal">Pricing</th>
              <th className="px-4 py-3 font-normal">Base price</th>
              <th className="px-4 py-3 font-normal">Margin</th>
              <th className="px-4 py-3 font-normal">Usage</th>
              <th className="px-4 py-3 font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && hasFilters && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>
                  No products match these filters. <Link href={`/t/${slug}/products`} className="underline">Clear filters</Link>
                </td>
              </tr>
            )}
            {products.map((p) => {
              const meta = pricingMeta(p.pricingModel);
              const priceN = Number(p.basePrice);
              const costN = p.cost != null ? Number(p.cost) : null;
              // Phase 8 Slice E — margin badge. Custom-quoted products don't
              // have a list price to compute from, so we just show a dash.
              const marginN =
                p.pricingModel === "CUSTOM_QUOTE" ? null : marginPercent(priceN, costN);
              const usage = p._count.quoteItems;
              return (
                <tr key={p.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="px-4 py-3">
                    {p.inherited ? (
                      // Inherited rows are read-only — no link into a detail
                      // page that would let an unsuspecting user try to edit.
                      <span className="font-medium">{p.name}</span>
                    ) : (
                      <Link href={`/t/${slug}/products/${p.id}`} className="font-medium underline">
                        {p.name}
                      </Link>
                    )}
                    <div className="text-xs" style={{ color: "var(--muted)" }}>
                      {p._count.optionGroups > 0 ? `${p._count.optionGroups} option group${p._count.optionGroups === 1 ? "" : "s"}` : "No options"}
                      {p.inherited && group.parentName && (
                        <> · <span style={{ color: "var(--accent)" }}>Shared from {group.parentName}</span></>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--muted)" }}>
                    <span
                      className="rounded-full px-2 py-0.5 text-xs"
                      style={{
                        background: "var(--surface-2)",
                        border: "1px solid var(--border-subtle)",
                        color: "var(--text-muted)",
                      }}
                    >
                      {kindLabel(p.kind)}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{p.category ?? "—"}</td>
                  <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{meta.label}</td>
                  <td className="px-4 py-3">
                    {p.pricingModel === "CUSTOM_QUOTE"
                      ? <span style={{ color: "var(--muted)" }}>Custom</span>
                      : <>{formatMoney(p.basePrice.toString(), ctx.tenant.currency)}<span style={{ color: "var(--muted)" }}> / {p.unit || meta.unitDefault}</span></>
                    }
                    {p.priceFormula !== "MANUAL" && (
                      <div className="mt-0.5 text-[10px]" style={{ color: "var(--accent-primary)" }}>
                        {p.priceFormula === "COST_PLUS_PCT" && p.markupPct != null
                          ? `Cost × ${Number(p.markupPct).toFixed(0)}%`
                          : p.priceFormula === "COST_PLUS_FIXED" && p.markupFixed != null
                            ? `Cost + ${formatMoney(Number(p.markupFixed), ctx.tenant.currency)}`
                            : "Formula"}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {marginN == null ? (
                      <span style={{ color: "var(--muted)" }}>—</span>
                    ) : (
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          background:
                            marginN >= 40
                              ? "var(--success-surface)"
                              : marginN >= 20
                                ? "var(--accent-surface)"
                                : "var(--danger-surface)",
                          color:
                            marginN >= 40
                              ? "var(--success-fg)"
                              : marginN >= 20
                                ? "var(--accent-primary)"
                                : "var(--danger-fg)",
                        }}
                        title={
                          costN != null
                            ? `Cost ${formatMoney(costN, ctx.tenant.currency)}, margin ${marginN.toFixed(1)}%`
                            : undefined
                        }
                      >
                        {marginN.toFixed(0)}%
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--muted)" }}>
                    {usage === 0 ? (
                      <span title="This product has never been used on a quote.">unused</span>
                    ) : (
                      <span title={`Used on ${usage} quote line${usage === 1 ? "" : "s"}`}>
                        {usage} {usage === 1 ? "use" : "uses"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.inherited ? (
                      <span
                        className="rounded-full px-2 py-0.5 text-xs"
                        style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--muted)" }}
                        title="Inherited from parent group"
                      >
                        Inherited
                      </span>
                    ) : (
                      <span
                        className="rounded-full px-2 py-0.5 text-xs"
                        style={{
                          background: p.active ? "var(--accent)" : "var(--panel)",
                          border: p.active ? "none" : "1px solid var(--border)",
                          color: p.active ? "white" : "var(--muted)",
                        }}
                      >
                        {p.active ? "Active" : humanize("INACTIVE")}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      )}
    </div>
  );
}
