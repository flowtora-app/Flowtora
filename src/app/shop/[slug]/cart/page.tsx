import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { getCartSummary, resolveOrCreateCart } from "@/lib/cart";
import { removeCartLine, updateCartLine } from "@/app/actions/customer-cart";

// Cart (S-4).
//
// Real cart wired through to /lib/cart. Shows items with editable
// quantity + remove + a totals card with a brand-gradient Continue
// to checkout CTA. Falls back to an honest empty state when the
// shopper hasn't added anything yet.

export const dynamic = "force-dynamic";

export default async function StorefrontCartPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const tenant = await db.tenant.findUnique({
    where: { slug },
    select: { name: true, currency: true, brandPrimaryColor: true },
  });
  if (!tenant) notFound();

  const brand = tenant.brandPrimaryColor ?? "#7C3AED";

  const { cartId } = await resolveOrCreateCart(slug);
  const { items, subtotal, itemCount } = await getCartSummary(cartId);

  return (
    <div style={{ paddingTop: 24 }}>
      <div className="flex items-end justify-between gap-4">
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
            Your cart
          </span>
          <h1
            className="mt-2 font-semibold"
            style={{
              color: "#0b0d10",
              fontSize: 36,
              letterSpacing: "-0.025em",
              lineHeight: 1.1,
            }}
          >
            Review your order
          </h1>
          {items.length > 0 && (
            <p
              className="mt-2"
              style={{ color: "#4b5563", fontSize: 13.5, lineHeight: 1.55 }}
            >
              <span style={{ color: "#0b0d10", fontWeight: 600 }}>
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </span>{" "}
              in your cart.
            </p>
          )}
        </div>
        <Link
          href={`/shop/${slug}/order`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            color: "#4b5563",
            fontSize: 13.5,
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          ← Continue shopping
        </Link>
      </div>

      {sp.error && (
        <div
          className="mt-4 rounded-lg px-3.5 py-2.5"
          style={{
            background: "color-mix(in oklab, #ef4444 12%, white)",
            color: "#b91c1c",
            border: "1px solid color-mix(in oklab, #ef4444 32%, transparent)",
            fontSize: 12.5,
            fontWeight: 500,
            lineHeight: 1.4,
          }}
        >
          {decodeURIComponent(sp.error)}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyCart slug={slug} brand={brand} />
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Line items list. */}
          <div
            className="overflow-hidden"
            style={{
              borderRadius: 16,
              background: "white",
              border: "1px solid #e5e7eb",
              boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)",
            }}
          >
            <ul>
              {items.map((it, i) => {
                const updateAction = updateCartLine.bind(null, slug, it.id);
                const removeAction = removeCartLine.bind(null, slug, it.id);
                return (
                  <li
                    key={it.id}
                    style={{
                      padding: "18px 22px",
                      borderTop: i === 0 ? "none" : "1px solid #f3f4f6",
                    }}
                  >
                    <div className="flex items-start gap-4">
                      {/* Visual placeholder. */}
                      <span
                        aria-hidden
                        style={{
                          flexShrink: 0,
                          width: 64,
                          height: 64,
                          borderRadius: 11,
                          background:
                            `radial-gradient(160px circle at 80% 20%, color-mix(in oklab, ${brand} 22%, transparent), transparent 55%), ` +
                            `linear-gradient(135deg, color-mix(in oklab, ${brand} 10%, #f9fafb), #f3f4f6)`,
                          border: "1px solid #e5e7eb",
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            {it.productId ? (
                              <Link
                                href={`/shop/${slug}/order/${it.productId}`}
                                style={{
                                  color: "#0b0d10",
                                  fontSize: 15,
                                  fontWeight: 600,
                                  letterSpacing: "-0.005em",
                                  textDecoration: "none",
                                }}
                                className="hover:underline"
                              >
                                {it.name}
                              </Link>
                            ) : (
                              <span
                                style={{
                                  color: "#0b0d10",
                                  fontSize: 15,
                                  fontWeight: 600,
                                  letterSpacing: "-0.005em",
                                }}
                              >
                                {it.name}
                              </span>
                            )}
                            {it.description && (
                              <p
                                className="mt-1"
                                style={{
                                  color: "#6b7280",
                                  fontSize: 12.5,
                                  lineHeight: 1.4,
                                }}
                              >
                                {it.description}
                              </p>
                            )}
                          </div>
                          <span
                            style={{
                              color: "#0b0d10",
                              fontSize: 15,
                              fontWeight: 700,
                              letterSpacing: "-0.005em",
                              fontFeatureSettings: "'tnum' 1",
                              flexShrink: 0,
                            }}
                          >
                            {it.unitPrice === 0
                              ? "Custom"
                              : formatMoney(it.total, tenant.currency)}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <form action={updateAction} className="inline-flex items-center gap-1.5">
                            <input
                              type="number"
                              name="qty"
                              defaultValue={it.quantity}
                              step="1"
                              min="1"
                              style={{
                                width: 72,
                                height: 32,
                                padding: "0 10px",
                                borderRadius: 7,
                                background: "#f9fafb",
                                border: "1px solid #e5e7eb",
                                color: "#0b0d10",
                                fontSize: 13,
                                outline: "none",
                                fontFeatureSettings: "'tnum' 1",
                              }}
                            />
                            <span style={{ color: "#6b7280", fontSize: 11.5 }}>
                              {it.unit}
                            </span>
                            <button
                              type="submit"
                              style={{
                                marginLeft: 4,
                                height: 32,
                                padding: "0 10px",
                                borderRadius: 7,
                                background: "white",
                                color: "#4b5563",
                                fontSize: 11.5,
                                fontWeight: 500,
                                border: "1px solid #e5e7eb",
                                cursor: "pointer",
                              }}
                            >
                              Update
                            </button>
                          </form>
                          <form action={removeAction}>
                            <button
                              type="submit"
                              style={{
                                color: "#9ca3af",
                                fontSize: 11.5,
                                fontWeight: 500,
                                background: "transparent",
                                border: 0,
                                cursor: "pointer",
                                textDecoration: "underline",
                              }}
                            >
                              Remove
                            </button>
                          </form>
                          {it.unitPrice > 0 && (
                            <span
                              className="ml-auto"
                              style={{
                                color: "#9ca3af",
                                fontSize: 11.5,
                                fontFeatureSettings: "'tnum' 1",
                              }}
                            >
                              {formatMoney(it.unitPrice, tenant.currency)} / {it.unit}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Totals + checkout CTA. */}
          <aside
            style={{
              padding: "22px",
              borderRadius: 16,
              background:
                `radial-gradient(540px circle at 100% 0%, color-mix(in oklab, ${brand} 12%, transparent), transparent 55%), ` +
                "linear-gradient(180deg, #ffffff 0%, #f9fafb 100%)",
              border: "1px solid #e5e7eb",
              boxShadow:
                "inset 0 1px 0 0 rgba(255,255,255,0.6), " +
                "0 1px 4px 0 rgba(0,0,0,0.04)",
              position: "sticky",
              top: 88,
              alignSelf: "start",
            }}
          >
            <div className="flex items-center gap-1.5 mb-3">
              <span aria-hidden style={{ width: 3, height: 3, borderRadius: 1, background: brand }} />
              <h2
                style={{
                  color: "#0b0d10",
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Summary
              </h2>
            </div>
            <dl className="space-y-2.5" style={{ fontSize: 13 }}>
              <div className="flex items-center justify-between">
                <dt style={{ color: "#6b7280" }}>Subtotal</dt>
                <dd
                  style={{
                    color: "#0b0d10",
                    fontWeight: 600,
                    fontFeatureSettings: "'tnum' 1",
                  }}
                >
                  {formatMoney(subtotal, tenant.currency)}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt style={{ color: "#6b7280" }}>Shipping</dt>
                <dd style={{ color: "#9ca3af" }}>Calculated next</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt style={{ color: "#6b7280" }}>Tax</dt>
                <dd style={{ color: "#9ca3af" }}>Calculated next</dd>
              </div>
            </dl>
            <div
              className="mt-4 flex items-center justify-between"
              style={{ paddingTop: 14, borderTop: "1px solid #e5e7eb" }}
            >
              <span
                style={{
                  color: "#0b0d10",
                  fontSize: 13,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Estimated total
              </span>
              <span
                style={{
                  color: "#0b0d10",
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: "-0.018em",
                  fontFeatureSettings: "'tnum' 1",
                }}
              >
                {formatMoney(subtotal, tenant.currency)}
              </span>
            </div>
            <Link
              href={`/shop/${slug}/checkout?step=contact`}
              className="mt-5 inline-flex w-full items-center justify-center"
              style={{
                gap: 6,
                height: 46,
                padding: "0 18px",
                borderRadius: 11,
                background: `linear-gradient(180deg, color-mix(in oklab, ${brand} 96%, white 4%) 0%, ${brand} 100%)`,
                color: "white",
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: "-0.005em",
                border: `1px solid color-mix(in oklab, ${brand} 80%, black 20%)`,
                boxShadow:
                  "0 1px 0 0 rgba(255,255,255,0.18) inset, " +
                  `0 4px 14px -2px color-mix(in oklab, ${brand} 40%, transparent), ` +
                  "0 1px 2px 0 rgba(0,0,0,0.12)",
                textDecoration: "none",
              }}
            >
              Continue to checkout
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
            <p
              className="mt-3 text-center"
              style={{ color: "#6b7280", fontSize: 11, lineHeight: 1.45 }}
            >
              Final price is set after we review artwork and sizing.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}

function EmptyCart({ slug, brand }: { slug: string; brand: string }) {
  return (
    <div
      className="mx-auto mt-10 max-w-2xl rounded-2xl text-center"
      style={{
        padding: "64px 32px",
        background:
          `radial-gradient(540px circle at 50% 0%, color-mix(in oklab, ${brand} 10%, transparent), transparent 55%), ` +
          "linear-gradient(180deg, #ffffff 0%, #f9fafb 100%)",
        border: "1px solid #e5e7eb",
        boxShadow:
          "inset 0 1px 0 0 rgba(255,255,255,0.6), " +
          "0 1px 4px 0 rgba(0,0,0,0.04)",
      }}
    >
      <div
        aria-hidden
        className="mx-auto flex items-center justify-center"
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: `linear-gradient(135deg, color-mix(in oklab, ${brand} 18%, white), color-mix(in oklab, ${brand} 8%, white))`,
          color: brand,
          border: `1px solid color-mix(in oklab, ${brand} 22%, transparent)`,
          boxShadow:
            "inset 0 1px 0 0 rgba(255,255,255,0.8), " +
            `0 0 24px -2px color-mix(in oklab, ${brand} 25%, transparent)`,
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
        </svg>
      </div>
      <h2
        className="mt-5 font-semibold"
        style={{
          color: "#0b0d10",
          fontSize: 22,
          letterSpacing: "-0.018em",
          lineHeight: 1.25,
        }}
      >
        Your cart is empty
      </h2>
      <p
        className="mx-auto mt-2 max-w-md"
        style={{
          color: "#4b5563",
          fontSize: 14,
          lineHeight: 1.55,
        }}
      >
        Browse our catalog to pick a product, or reach out for something custom.
      </p>
      <div className="mt-7 flex items-center justify-center gap-3">
        <Link
          href={`/shop/${slug}/order`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            height: 44,
            padding: "0 22px",
            borderRadius: 11,
            background: `linear-gradient(180deg, color-mix(in oklab, ${brand} 96%, white 4%) 0%, ${brand} 100%)`,
            color: "white",
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: "-0.005em",
            border: `1px solid color-mix(in oklab, ${brand} 80%, black 20%)`,
            boxShadow:
              "0 1px 0 0 rgba(255,255,255,0.18) inset, " +
              `0 4px 14px -2px color-mix(in oklab, ${brand} 40%, transparent), ` +
              "0 1px 2px 0 rgba(0,0,0,0.12)",
            textDecoration: "none",
          }}
        >
          Browse the catalog
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </Link>
        <Link
          href={`/shop/${slug}/contact`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 44,
            padding: "0 20px",
            borderRadius: 11,
            background: "white",
            color: "#0b0d10",
            fontSize: 14,
            fontWeight: 500,
            border: "1px solid #e5e7eb",
            textDecoration: "none",
          }}
        >
          Custom quote
        </Link>
      </div>
    </div>
  );
}
