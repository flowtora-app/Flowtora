import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";

// Customer-facing storefront layout (S-shell).
//
// Lives at /shop/[slug] (production will likely move to subdomain
// routing — {slug}.flowtora-shops.com — but we keep it path-based for
// now to avoid the wildcard-domain + middleware lift before the
// product is even visibly working).
//
// Crucial point: this layout is PUBLIC. No auth, no admin shell. The
// shop's customers visit these URLs to browse products, request
// quotes, approve proofs, and pay invoices. The design language is
// light-themed by default, tenant-branded, and friendlier than the
// workspace.
//
// Design tokens:
//   - --tenant-brand   tenant.brandPrimaryColor or fallback accent
//   - --tenant-accent  tenant.brandAccentColor or cyan-500
//
// We avoid pulling in @/lib/tenant's requireTenant() because that
// requires an authenticated session. Storefront uses a thin direct
// DB lookup instead.

export const dynamic = "force-dynamic";

export default async function ShopLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenant = await db.tenant.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      brandPrimaryColor: true,
      phone: true,
      addressLine1: true,
      city: true,
      region: true,
    },
  });
  if (!tenant) notFound();

  const initial = (tenant.name ?? "?").trim().charAt(0).toUpperCase() || "?";
  const brand = tenant.brandPrimaryColor ?? "#7C3AED"; // brand-600 default

  return (
    <div
      style={{
        // Tenant brand tokens — scoped to the storefront subtree.
        // CSS variables override the workspace defaults here.
        // Casting because TS doesn't know about CSS custom properties.
        ["--tenant-brand" as string]: brand,
        ["--tenant-accent" as string]: "#06B6D4",
        minHeight: "100vh",
        background: "#ffffff",
        color: "#0b0d10",
      }}
    >
      {/* Topbar */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          background: "rgba(255,255,255,0.94)",
          borderBottom: "1px solid #e5e7eb",
          backdropFilter: "saturate(140%) blur(8px)",
        }}
      >
        <div
          className="mx-auto flex items-center justify-between gap-4 px-6"
          style={{ maxWidth: 1200, height: 64 }}
        >
          <Link
            href={`/shop/${slug}`}
            className="flex items-center gap-2.5"
            style={{ textDecoration: "none" }}
          >
            <span
              aria-hidden
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 34,
                height: 34,
                borderRadius: 9,
                background: `linear-gradient(135deg, ${brand}, color-mix(in oklab, ${brand} 70%, white 30%))`,
                color: "white",
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "0.02em",
                boxShadow:
                  "inset 0 1px 0 0 rgba(255,255,255,0.18), " +
                  "0 1px 2px 0 rgba(0,0,0,0.08)",
              }}
            >
              {tenant.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={tenant.logoUrl}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                initial
              )}
            </span>
            <span
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: "#0b0d10",
                letterSpacing: "-0.015em",
              }}
            >
              {tenant.name}
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            <ShopNavLink href={`/shop/${slug}`}>Home</ShopNavLink>
            <ShopNavLink href={`/shop/${slug}/order`}>Order</ShopNavLink>
            <ShopNavLink href={`/shop/${slug}/about`}>About</ShopNavLink>
            <ShopNavLink href={`/shop/${slug}/contact`}>Contact</ShopNavLink>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href={`/shop/${slug}/cart`}
              className="inline-flex items-center justify-center"
              style={{
                width: 38,
                height: 38,
                borderRadius: 9,
                background: "#f3f4f6",
                color: "#0b0d10",
                border: "1px solid #e5e7eb",
              }}
              aria-label="Cart"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
              </svg>
            </Link>
            <Link
              href={`/shop/${slug}/order`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 38,
                padding: "0 16px",
                borderRadius: 9,
                background: `linear-gradient(180deg, color-mix(in oklab, ${brand} 96%, white 4%) 0%, ${brand} 100%)`,
                color: "white",
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: "-0.005em",
                border: `1px solid color-mix(in oklab, ${brand} 80%, black 20%)`,
                boxShadow:
                  "0 1px 0 0 rgba(255,255,255,0.18) inset, " +
                  "0 1px 2px 0 rgba(0,0,0,0.12)",
                textDecoration: "none",
              }}
            >
              Start an order
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto px-6" style={{ maxWidth: 1200 }}>
        {children}
      </main>

      {/* Footer */}
      <footer
        className="mt-24"
        style={{
          borderTop: "1px solid #e5e7eb",
          background: "#f9fafb",
        }}
      >
        <div className="mx-auto grid gap-8 px-6 py-10 md:grid-cols-3" style={{ maxWidth: 1200 }}>
          <div>
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 28,
                  height: 28,
                  borderRadius: 7,
                  background: `linear-gradient(135deg, ${brand}, color-mix(in oklab, ${brand} 70%, white 30%))`,
                  color: "white",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {initial}
              </span>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#0b0d10",
                }}
              >
                {tenant.name}
              </span>
            </div>
            {(tenant.addressLine1 || tenant.city) && (
              <p
                className="mt-3"
                style={{ color: "#4b5563", fontSize: 13, lineHeight: 1.5 }}
              >
                {tenant.addressLine1}
                {tenant.addressLine1 && (tenant.city || tenant.region) && <br />}
                {[tenant.city, tenant.region].filter(Boolean).join(", ")}
              </p>
            )}
            {tenant.phone && (
              <p
                className="mt-2"
                style={{ color: "#4b5563", fontSize: 13 }}
              >
                <a href={`tel:${tenant.phone}`} style={{ color: "#0b0d10", textDecoration: "none" }}>
                  {tenant.phone}
                </a>
              </p>
            )}
          </div>
          <div>
            <div
              style={{
                color: "#0b0d10",
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 12,
              }}
            >
              Shop
            </div>
            <ul className="space-y-2" style={{ fontSize: 13 }}>
              <li><Link href={`/shop/${slug}`} style={{ color: "#4b5563", textDecoration: "none" }}>Home</Link></li>
              <li><Link href={`/shop/${slug}/order`} style={{ color: "#4b5563", textDecoration: "none" }}>Order online</Link></li>
              <li><Link href={`/shop/${slug}/about`} style={{ color: "#4b5563", textDecoration: "none" }}>About us</Link></li>
              <li><Link href={`/shop/${slug}/contact`} style={{ color: "#4b5563", textDecoration: "none" }}>Contact</Link></li>
            </ul>
          </div>
          <div>
            <div
              style={{
                color: "#0b0d10",
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 12,
              }}
            >
              Account
            </div>
            <ul className="space-y-2" style={{ fontSize: 13 }}>
              <li><Link href={`/shop/${slug}/account`} style={{ color: "#4b5563", textDecoration: "none" }}>My orders</Link></li>
              <li><Link href={`/shop/${slug}/account/signin`} style={{ color: "#4b5563", textDecoration: "none" }}>Sign in</Link></li>
            </ul>
          </div>
        </div>
        <div
          className="mx-auto flex flex-wrap items-center justify-between gap-3 px-6 py-5"
          style={{
            maxWidth: 1200,
            borderTop: "1px solid #e5e7eb",
            color: "#6b7280",
            fontSize: 12,
          }}
        >
          <span>© {new Date().getFullYear()} {tenant.name}. All rights reserved.</span>
          <span>
            Powered by{" "}
            <a href="https://flowtora.com" style={{ color: "#0b0d10", fontWeight: 600 }}>
              Flowtora
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}

function ShopNavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 34,
        padding: "0 14px",
        borderRadius: 7,
        color: "#4b5563",
        fontSize: 13,
        fontWeight: 500,
        letterSpacing: "-0.005em",
        textDecoration: "none",
      }}
      className="hover:bg-[#f3f4f6]"
    >
      {children}
    </Link>
  );
}
