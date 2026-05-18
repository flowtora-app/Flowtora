import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";

// Online ordering — product catalog (S-2).
//
// Public-facing storefront catalog. Shows every active product with
// search, category filter, and per-tile "Order" CTA that will deep-
// link into the configurator (S-3) once that ships.

export const dynamic = "force-dynamic";

export default async function StorefrontCatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  const tenant = await db.tenant.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      currency: true,
      brandPrimaryColor: true,
    },
  });
  if (!tenant) notFound();

  const brand = tenant.brandPrimaryColor ?? "#7C3AED";

  // Real catalog query against active products.
  const where: Record<string, unknown> = {
    tenantId: tenant.id,
    active: true,
  };
  if (sp.category) where.category = sp.category;
  if (sp.q) {
    where.OR = [
      { name: { contains: sp.q, mode: "insensitive" } },
      { description: { contains: sp.q, mode: "insensitive" } },
    ];
  }

  const [products, categoryRows] = await Promise.all([
    db.product.findMany({
      where: where as never,
      orderBy: [{ name: "asc" }],
      take: 60,
      select: {
        id: true,
        name: true,
        description: true,
        basePrice: true,
        pricingModel: true,
        category: true,
      },
    }),
    db.product.findMany({
      where: { tenantId: tenant.id, active: true, category: { not: null } },
      distinct: ["category"],
      select: { category: true },
    }),
  ]);

  const categories = categoryRows
    .map((c) => c.category)
    .filter((c): c is string => !!c)
    .sort();

  return (
    <div>
      {/* Page header — branded but lighter than the home hero. */}
      <header
        className="relative overflow-hidden"
        style={{
          marginTop: 24,
          padding: "44px 32px",
          borderRadius: 20,
          background:
            `radial-gradient(720px circle at 0% 0%, color-mix(in oklab, ${brand} 14%, transparent), transparent 55%), ` +
            "linear-gradient(180deg, #ffffff 0%, #f9fafb 100%)",
          border: "1px solid #e5e7eb",
          boxShadow:
            "inset 0 1px 0 0 rgba(255,255,255,0.6), " +
            "0 1px 4px 0 rgba(0,0,0,0.04)",
        }}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span
              style={{
                color: brand,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              Online ordering
            </span>
            <h1
              className="mt-2 font-semibold"
              style={{
                color: "#0b0d10",
                fontSize: 40,
                letterSpacing: "-0.025em",
                lineHeight: 1.1,
              }}
            >
              Shop our work
            </h1>
            <p
              className="mt-2 max-w-lg"
              style={{ color: "#4b5563", fontSize: 14.5, lineHeight: 1.55 }}
            >
              Pick a product to configure size, material, and quantity. Don&apos;t see what you need?{" "}
              <Link
                href={`/shop/${slug}/contact`}
                style={{ color: brand, fontWeight: 500, textDecoration: "none" }}
                className="hover:underline"
              >
                Ask for a custom quote
              </Link>
              .
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm" style={{ color: "#6b7280" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m12 3 2.7 5.6 6.3.9-4.5 4.4 1 6.1-5.5-2.9-5.5 2.9 1-6.1L3 9.5l6.3-.9z" />
            </svg>
            <span style={{ color: "#0b0d10", fontWeight: 600 }}>4.9</span>
            <span>· 380 reviews</span>
          </div>
        </div>
      </header>

      {/* Search + category filter row. */}
      <form
        method="get"
        className="mt-6 flex flex-wrap items-center gap-3"
      >
        <div
          className="flex flex-1 min-w-[260px] items-center gap-2"
          style={{
            height: 44,
            padding: "0 14px",
            borderRadius: 11,
            background: "white",
            border: "1px solid #e5e7eb",
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "#9ca3af", flexShrink: 0 }}>
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Search products…"
            style={{
              flex: 1,
              minWidth: 0,
              background: "transparent",
              border: 0,
              outline: "none",
              color: "#0b0d10",
              fontSize: 14,
              letterSpacing: "-0.005em",
            }}
          />
        </div>
        {sp.category && (
          <input type="hidden" name="category" value={sp.category} />
        )}
        <button
          type="submit"
          style={{
            height: 44,
            padding: "0 20px",
            borderRadius: 11,
            background: `linear-gradient(180deg, color-mix(in oklab, ${brand} 96%, white 4%) 0%, ${brand} 100%)`,
            color: "white",
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: "-0.005em",
            border: `1px solid color-mix(in oklab, ${brand} 80%, black 20%)`,
            boxShadow:
              "0 1px 0 0 rgba(255,255,255,0.18) inset, " +
              "0 1px 2px 0 rgba(0,0,0,0.12)",
          }}
        >
          Search
        </button>
      </form>

      {/* Category chips. */}
      {categories.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { value: "", label: "All products" },
            ...categories.map((c) => ({ value: c, label: c })),
          ].map((c) => {
            const active = (sp.category ?? "") === c.value;
            const qs = new URLSearchParams();
            if (sp.q) qs.set("q", sp.q);
            if (c.value) qs.set("category", c.value);
            const href = `/shop/${slug}/order${qs.toString() ? `?${qs.toString()}` : ""}`;
            return (
              <Link
                key={c.value || "all"}
                href={href}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: 32,
                  padding: "0 14px",
                  borderRadius: 999,
                  fontSize: 12.5,
                  fontWeight: active ? 700 : 500,
                  letterSpacing: "-0.005em",
                  color: active ? brand : "#4b5563",
                  background: active
                    ? `color-mix(in oklab, ${brand} 12%, white)`
                    : "white",
                  border: active
                    ? `1px solid color-mix(in oklab, ${brand} 30%, transparent)`
                    : "1px solid #e5e7eb",
                  textDecoration: "none",
                }}
              >
                {c.label}
              </Link>
            );
          })}
        </div>
      )}

      {/* Product grid or empty state. */}
      {products.length === 0 ? (
        <div
          className="mt-10 rounded-2xl p-14 text-center"
          style={{
            border: "1px dashed #e5e7eb",
            background: "#fafafa",
            color: "#6b7280",
            fontSize: 14,
          }}
        >
          <div style={{ fontWeight: 600, color: "#0b0d10", fontSize: 18, letterSpacing: "-0.012em" }}>
            {sp.q || sp.category
              ? "No products match those filters"
              : "Catalog coming soon"}
          </div>
          <p
            className="mx-auto mt-2"
            style={{ fontSize: 13.5, lineHeight: 1.55, maxWidth: 460 }}
          >
            {sp.q || sp.category
              ? "Try clearing your filters or searching for something else."
              : "We&apos;re finalizing our online catalog. In the meantime, request a custom quote for anything you have in mind."}
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            {(sp.q || sp.category) && (
              <Link
                href={`/shop/${slug}/order`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: 40,
                  padding: "0 18px",
                  borderRadius: 10,
                  background: "white",
                  color: "#0b0d10",
                  fontSize: 13.5,
                  fontWeight: 500,
                  border: "1px solid #e5e7eb",
                  textDecoration: "none",
                }}
              >
                Clear filters
              </Link>
            )}
            <Link
              href={`/shop/${slug}/contact`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                height: 40,
                padding: "0 18px",
                borderRadius: 10,
                background: `linear-gradient(180deg, color-mix(in oklab, ${brand} 96%, white 4%) 0%, ${brand} 100%)`,
                color: "white",
                fontSize: 13.5,
                fontWeight: 600,
                border: `1px solid color-mix(in oklab, ${brand} 80%, black 20%)`,
                textDecoration: "none",
              }}
            >
              Request a custom quote →
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <Link
              key={p.id}
              href={`/shop/${slug}/order/${p.id}`}
              className="group/card"
              style={{
                display: "block",
                borderRadius: 16,
                background: "white",
                border: "1px solid #e5e7eb",
                overflow: "hidden",
                textDecoration: "none",
                color: "inherit",
                transition: "transform 140ms ease, box-shadow 140ms ease",
              }}
            >
              {/* Visual panel. */}
              <div
                style={{
                  aspectRatio: "4 / 3",
                  background:
                    `radial-gradient(420px circle at 80% 20%, color-mix(in oklab, ${brand} 18%, transparent), transparent 55%), ` +
                    `linear-gradient(135deg, color-mix(in oklab, ${brand} 10%, #f9fafb), #f3f4f6)`,
                  borderBottom: "1px solid #e5e7eb",
                  position: "relative",
                }}
              >
                {p.category && (
                  <span
                    style={{
                      position: "absolute",
                      top: 12,
                      left: 12,
                      fontSize: 9.5,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: "white",
                      border: "1px solid #e5e7eb",
                      color: "#4b5563",
                    }}
                  >
                    {p.category}
                  </span>
                )}
              </div>
              <div style={{ padding: "16px 18px" }}>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: "#0b0d10",
                    letterSpacing: "-0.005em",
                    lineHeight: 1.3,
                  }}
                >
                  {p.name}
                </div>
                {p.description && (
                  <p
                    className="mt-1 line-clamp-2"
                    style={{
                      color: "#6b7280",
                      fontSize: 12.5,
                      lineHeight: 1.45,
                    }}
                  >
                    {p.description}
                  </p>
                )}
                <div
                  className="mt-3 flex items-center justify-between"
                  style={{ fontSize: 13 }}
                >
                  <span
                    style={{
                      color: "#0b0d10",
                      fontWeight: 600,
                      fontFeatureSettings: "'tnum' 1",
                    }}
                  >
                    {p.pricingModel === "CUSTOM_QUOTE"
                      ? "Custom quote"
                      : `From ${formatMoney(p.basePrice?.toString() ?? "0", tenant.currency)}`}
                  </span>
                  <span
                    style={{
                      color: brand,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    Order →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div
        className="mt-10 mb-8 text-center"
        style={{ color: "#6b7280", fontSize: 13 }}
      >
        Showing{" "}
        <span style={{ color: "#0b0d10", fontWeight: 600 }}>
          {products.length}
        </span>{" "}
        {products.length === 1 ? "product" : "products"}
        {sp.category && (
          <>
            {" in "}
            <span style={{ color: brand, fontWeight: 600 }}>{sp.category}</span>
          </>
        )}
      </div>
    </div>
  );
}
