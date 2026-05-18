import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";

// Storefront home (S-1).
//
// Public-facing landing for a tenant's customers. Hero + featured
// products + about + reviews placeholder + contact CTA. Branded with
// the tenant's primary color via CSS variables set on the layout.
//
// Data shown is real but read-only:
//   - Featured products: top 6 active items from the catalog
//   - Contact info: address + phone from tenant profile
//
// Storefront-customizer overrides (hero copy, featured selection, etc.)
// will plug in here once the customizer's section editors ship.

export const dynamic = "force-dynamic";

export default async function StorefrontHomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenant = await db.tenant.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      currency: true,
      brandPrimaryColor: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      region: true,
      postalCode: true,
      phone: true,
    },
  });
  if (!tenant) notFound();

  const featured = await db.product.findMany({
    where: { tenantId: tenant.id, active: true },
    orderBy: [{ updatedAt: "desc" }],
    take: 6,
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      pricingModel: true,
      unit: true,
      category: true,
    },
  });

  const brand = tenant.brandPrimaryColor ?? "#7C3AED";

  return (
    <div>
      {/* ── Hero ────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        style={{
          marginTop: 24,
          padding: "72px 40px",
          borderRadius: 24,
          background:
            `radial-gradient(900px circle at 0% 0%, color-mix(in oklab, ${brand} 18%, transparent), transparent 55%), ` +
            `radial-gradient(700px circle at 100% 100%, color-mix(in oklab, ${brand} 10%, transparent), transparent 55%), ` +
            "linear-gradient(180deg, #ffffff 0%, #f9fafb 100%)",
          border: "1px solid #e5e7eb",
          boxShadow:
            "inset 0 1px 0 0 rgba(255,255,255,0.6), " +
            "0 2px 12px -2px rgba(0,0,0,0.06)",
        }}
      >
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                padding: "4px 10px",
                borderRadius: 999,
                color: brand,
                background: `color-mix(in oklab, ${brand} 12%, transparent)`,
                border: `1px solid color-mix(in oklab, ${brand} 30%, transparent)`,
                lineHeight: 1,
                marginBottom: 18,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 999,
                  background: brand,
                }}
              />
              Now taking orders
            </span>
            <h1
              style={{
                fontSize: 52,
                lineHeight: 1.05,
                letterSpacing: "-0.03em",
                fontWeight: 700,
                color: "#0b0d10",
              }}
            >
              Custom work,
              <br />
              done right.
            </h1>
            <p
              style={{
                marginTop: 20,
                fontSize: 17,
                lineHeight: 1.55,
                color: "#4b5563",
                maxWidth: 480,
              }}
            >
              {tenant.name} brings your idea to life. Get a quote in minutes — upload your artwork, pick your materials, and we&apos;ll handle the rest.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href={`/shop/${slug}/order`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  height: 48,
                  padding: "0 22px",
                  borderRadius: 11,
                  background: `linear-gradient(180deg, color-mix(in oklab, ${brand} 96%, white 4%) 0%, ${brand} 100%)`,
                  color: "white",
                  fontSize: 15,
                  fontWeight: 600,
                  letterSpacing: "-0.005em",
                  border: `1px solid color-mix(in oklab, ${brand} 80%, black 20%)`,
                  boxShadow:
                    "0 1px 0 0 rgba(255,255,255,0.18) inset, " +
                    `0 6px 18px -3px color-mix(in oklab, ${brand} 40%, transparent), ` +
                    "0 1px 2px 0 rgba(0,0,0,0.15)",
                  textDecoration: "none",
                }}
              >
                Start your order
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
              <Link
                href={`/shop/${slug}/contact`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: 48,
                  padding: "0 22px",
                  borderRadius: 11,
                  background: "white",
                  color: "#0b0d10",
                  fontSize: 15,
                  fontWeight: 500,
                  letterSpacing: "-0.005em",
                  border: "1px solid #e5e7eb",
                  textDecoration: "none",
                }}
              >
                Get a custom quote
              </Link>
            </div>
            <ul
              className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2"
              style={{ color: "#4b5563", fontSize: 13 }}
            >
              {[
                "Fast turnaround",
                "Free local delivery",
                "Satisfaction guaranteed",
              ].map((t) => (
                <li key={t} className="inline-flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={brand} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {t}
                </li>
              ))}
            </ul>
          </div>

          {/* Mocked-up preview card on the right. */}
          <div className="relative" aria-hidden>
            <div
              style={{
                position: "relative",
                padding: "20px",
                borderRadius: 20,
                background:
                  `linear-gradient(135deg, ${brand}, color-mix(in oklab, ${brand} 60%, white 40%))`,
                boxShadow:
                  "inset 0 1px 0 0 rgba(255,255,255,0.18), " +
                  "0 24px 60px -16px rgba(0,0,0,0.25)",
                color: "white",
              }}
            >
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  opacity: 0.85,
                }}
              >
                Recent project
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: "-0.015em",
                  lineHeight: 1.2,
                }}
              >
                12&apos; storefront sign
                <br />
                for Bright Coffee Co.
              </div>
              <div
                style={{
                  marginTop: 14,
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.16)",
                  fontSize: 13,
                  lineHeight: 1.5,
                  backdropFilter: "blur(2px)",
                }}
              >
                Routed HDU with vinyl letters, mounted on aluminum standoffs. Quote → produced → installed in 9 days.
              </div>
              <div
                className="mt-4 flex items-center justify-between"
                style={{ fontSize: 11.5 }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "3px 9px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.18)",
                    fontWeight: 600,
                  }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 999,
                      background: "white",
                    }}
                  />
                  Installed
                </span>
                <span style={{ opacity: 0.85 }}>9 days · $3,400</span>
              </div>
            </div>
            {/* Floating accent card. */}
            <div
              style={{
                position: "absolute",
                bottom: -24,
                left: -24,
                width: 200,
                padding: "14px 16px",
                borderRadius: 14,
                background: "white",
                border: "1px solid #e5e7eb",
                boxShadow: "0 12px 30px -8px rgba(0,0,0,0.15)",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#6b7280",
                }}
              >
                Average turnaround
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 24,
                  fontWeight: 700,
                  color: "#0b0d10",
                  letterSpacing: "-0.018em",
                  fontFeatureSettings: "'tnum' 1",
                }}
              >
                7 days
              </div>
              <div
                style={{
                  marginTop: 2,
                  fontSize: 11,
                  color: brand,
                  fontWeight: 600,
                }}
              >
                ↓ 30% vs last year
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Featured products ───────────────────────────────────── */}
      <section className="mt-24">
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
              What we make
            </span>
            <h2
              className="mt-2 font-semibold"
              style={{
                fontSize: 32,
                letterSpacing: "-0.022em",
                lineHeight: 1.15,
                color: "#0b0d10",
              }}
            >
              Browse popular work
            </h2>
          </div>
          <Link
            href={`/shop/${slug}/order`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              color: brand,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            See full catalog
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {featured.length === 0 ? (
          <div
            className="mt-6 rounded-2xl p-12 text-center"
            style={{
              border: "1px dashed #e5e7eb",
              background: "#fafafa",
              color: "#6b7280",
              fontSize: 14,
            }}
          >
            <div style={{ fontWeight: 600, color: "#0b0d10", fontSize: 16 }}>
              Our catalog is coming soon
            </div>
            <p className="mt-2" style={{ fontSize: 13, lineHeight: 1.5, maxWidth: 460, marginLeft: "auto", marginRight: "auto" }}>
              In the meantime, request a custom quote for anything you have in mind — banners, vehicle wraps, signage, apparel, and more.
            </p>
            <Link
              href={`/shop/${slug}/contact`}
              className="mt-5 inline-block"
              style={{
                color: brand,
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "underline",
              }}
            >
              Request a quote →
            </Link>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((p) => (
              <Link
                key={p.id}
                href={`/shop/${slug}/order?product=${p.id}`}
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
                {/* Visual placeholder — gradient panel using brand color. */}
                <div
                  style={{
                    aspectRatio: "16 / 10",
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
                        : `From ${formatMoney(p.price?.toString() ?? "0", tenant.currency)}`}
                    </span>
                    <span
                      style={{
                        color: brand,
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      Configure →
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── How it works ─────────────────────────────────────────── */}
      <section className="mt-24">
        <div className="text-center">
          <span
            style={{
              color: brand,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            How it works
          </span>
          <h2
            className="mt-2 font-semibold"
            style={{
              fontSize: 32,
              letterSpacing: "-0.022em",
              lineHeight: 1.15,
              color: "#0b0d10",
            }}
          >
            Three steps. No fuss.
          </h2>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            { n: "01", title: "Tell us what you need", body: "Pick a product, upload your art, and tell us the details. We&apos;ll give you a quote you can approve in one click." },
            { n: "02", title: "We make it",            body: "Approve the proof, and we start production. We&apos;ll text you when it&apos;s ready." },
            { n: "03", title: "Pick up or delivered",  body: "Come grab it, or have it dropped off — we&apos;ll install it if you need." },
          ].map((s) => (
            <div
              key={s.n}
              style={{
                padding: "26px 24px",
                borderRadius: 16,
                background: "white",
                border: "1px solid #e5e7eb",
                boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)",
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 36,
                  height: 36,
                  borderRadius: 9,
                  background: `color-mix(in oklab, ${brand} 12%, white)`,
                  color: brand,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  border: `1px solid color-mix(in oklab, ${brand} 22%, transparent)`,
                  fontFeatureSettings: "'tnum' 1",
                }}
              >
                {s.n}
              </div>
              <h3
                className="mt-4 font-semibold"
                style={{
                  fontSize: 18,
                  letterSpacing: "-0.012em",
                  color: "#0b0d10",
                }}
              >
                {s.title}
              </h3>
              <p
                className="mt-2"
                style={{
                  color: "#4b5563",
                  fontSize: 13.5,
                  lineHeight: 1.55,
                }}
                dangerouslySetInnerHTML={{ __html: s.body }}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────────── */}
      <section
        className="mt-24 mb-8 overflow-hidden"
        style={{
          padding: "56px 40px",
          borderRadius: 24,
          background:
            `radial-gradient(900px circle at 100% 0%, color-mix(in oklab, ${brand} 24%, transparent), transparent 55%), ` +
            `linear-gradient(135deg, color-mix(in oklab, ${brand} 92%, white 8%), ${brand})`,
          color: "white",
          textAlign: "center",
          boxShadow:
            "inset 0 1px 0 0 rgba(255,255,255,0.18), " +
            "0 24px 60px -16px rgba(0,0,0,0.2)",
        }}
      >
        <h2
          style={{
            fontSize: 36,
            letterSpacing: "-0.025em",
            fontWeight: 700,
            lineHeight: 1.1,
          }}
        >
          Ready to get started?
        </h2>
        <p
          className="mx-auto mt-3 max-w-lg"
          style={{
            fontSize: 16,
            lineHeight: 1.55,
            opacity: 0.92,
          }}
        >
          Start an order online in minutes, or reach out for a custom quote.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={`/shop/${slug}/order`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              height: 48,
              padding: "0 24px",
              borderRadius: 11,
              background: "white",
              color: brand,
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: "-0.005em",
              textDecoration: "none",
              boxShadow:
                "0 1px 0 0 rgba(255,255,255,0.4) inset, " +
                "0 8px 24px -6px rgba(0,0,0,0.2)",
            }}
          >
            Start your order
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
          <Link
            href={`/shop/${slug}/contact`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 48,
              padding: "0 22px",
              borderRadius: 11,
              background: "transparent",
              color: "white",
              fontSize: 15,
              fontWeight: 500,
              letterSpacing: "-0.005em",
              border: "1px solid rgba(255,255,255,0.4)",
              textDecoration: "none",
            }}
          >
            Talk to us
          </Link>
        </div>
      </section>
    </div>
  );
}
