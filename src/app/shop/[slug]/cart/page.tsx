import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";

// Cart (S-4).
//
// Cart persistence (server-side session-scoped cart rows) isn't wired
// up yet — the cart model lives in the schema as a future addition.
// For now this page renders an honest empty state with a CTA back to
// the catalog. As soon as the cart actions ship, this page swaps in
// the line-item table + totals card + checkout CTA.

export const dynamic = "force-dynamic";

export default async function StorefrontCartPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenant = await db.tenant.findUnique({
    where: { slug },
    select: {
      name: true,
      brandPrimaryColor: true,
    },
  });
  if (!tenant) notFound();

  const brand = tenant.brandPrimaryColor ?? "#7C3AED";

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

      {/* Empty cart state — designed as a real moment, not a stub. */}
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

      {/* Trust strip — keeps the empty cart from feeling broken. */}
      <ul
        className="mx-auto mt-8 flex max-w-xl flex-wrap items-center justify-center gap-x-6 gap-y-2"
        style={{ color: "#4b5563", fontSize: 13 }}
      >
        {[
          "Quick turnaround on standard items",
          "Free local delivery on orders $250+",
          "Satisfaction guaranteed",
        ].map((t) => (
          <li key={t} className="inline-flex items-center gap-1.5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={brand} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}
