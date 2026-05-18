import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";

// About page (part of storefront S-shell IA).
//
// Customer-facing "About us" — pulls the shop's basic identity
// (name + contact) and presents it cleanly. Tenants can extend the
// copy from the Storefront Customizer (T-12) once that ships.

export const dynamic = "force-dynamic";

export default async function StorefrontAboutPage({
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
      addressLine1: true,
      city: true,
      region: true,
      phone: true,
      emailReplyTo: true,
      createdAt: true,
    },
  });
  if (!tenant) notFound();

  const brand = tenant.brandPrimaryColor ?? "#7C3AED";
  const yearsServing = Math.max(
    1,
    new Date().getFullYear() - tenant.createdAt.getFullYear(),
  );

  return (
    <div style={{ paddingTop: 24 }}>
      <header
        className="relative overflow-hidden"
        style={{
          padding: "56px 40px",
          borderRadius: 20,
          background:
            `radial-gradient(720px circle at 100% 0%, color-mix(in oklab, ${brand} 16%, transparent), transparent 55%), ` +
            "linear-gradient(180deg, #ffffff 0%, #f9fafb 100%)",
          border: "1px solid #e5e7eb",
          boxShadow:
            "inset 0 1px 0 0 rgba(255,255,255,0.6), " +
            "0 1px 4px 0 rgba(0,0,0,0.04)",
        }}
      >
        <span
          style={{
            color: brand,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          About us
        </span>
        <h1
          className="mt-2 font-semibold"
          style={{
            color: "#0b0d10",
            fontSize: 44,
            letterSpacing: "-0.025em",
            lineHeight: 1.1,
          }}
        >
          {tenant.name}
        </h1>
        <p
          className="mt-4 max-w-xl"
          style={{
            color: "#4b5563",
            fontSize: 16,
            lineHeight: 1.6,
          }}
        >
          We&apos;ve been making custom signs, banners, and branded work for{" "}
          <span style={{ color: brand, fontWeight: 600 }}>
            {yearsServing}+ years
          </span>
          {tenant.city ? <> in {tenant.city}</> : null}. From a single yard sign to a full storefront rebrand, we&apos;re here to make your idea look the way you imagined it.
        </p>
      </header>

      {/* Stats strip */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          { value: `${yearsServing}+`, label: "Years in business" },
          { value: "2,400+",            label: "Projects delivered" },
          { value: "4.9 ★",             label: "Customer rating" },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              padding: "22px 24px",
              borderRadius: 14,
              background: "white",
              border: "1px solid #e5e7eb",
              boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)",
            }}
          >
            <div
              style={{
                color: brand,
                fontSize: 30,
                fontWeight: 700,
                letterSpacing: "-0.022em",
                fontFeatureSettings: "'tnum' 1",
                lineHeight: 1.1,
              }}
            >
              {s.value}
            </div>
            <div
              className="mt-1"
              style={{
                color: "#6b7280",
                fontSize: 12.5,
                fontWeight: 500,
              }}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Values section */}
      <section className="mt-16">
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
            How we work
          </span>
          <h2
            className="mt-2 font-semibold"
            style={{
              color: "#0b0d10",
              fontSize: 30,
              letterSpacing: "-0.022em",
              lineHeight: 1.15,
            }}
          >
            Quality, on time, no surprises
          </h2>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            {
              title: "Quote in 24 hours",
              body: "Most quotes come back within one business day — often faster. No phone-tag back-and-forth.",
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
              ),
            },
            {
              title: "Proof before we print",
              body: "Every order gets a digital proof you sign off on. If it doesn&apos;t look right, we make it right.",
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9 11l3 3 7-7" />
                  <path d="M21 12v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11" />
                </svg>
              ),
            },
            {
              title: "Local, hands-on",
              body: "Your work is made by people you can call and walk in to see. No outsourcing, no surprises on delivery day.",
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              ),
            },
          ].map((v) => (
            <div
              key={v.title}
              style={{
                padding: "24px",
                borderRadius: 16,
                background: "white",
                border: "1px solid #e5e7eb",
                boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)",
              }}
            >
              <span
                aria-hidden
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: `color-mix(in oklab, ${brand} 12%, white)`,
                  color: brand,
                  border: `1px solid color-mix(in oklab, ${brand} 22%, transparent)`,
                }}
              >
                {v.icon}
              </span>
              <h3
                className="mt-4 font-semibold"
                style={{
                  color: "#0b0d10",
                  fontSize: 17,
                  letterSpacing: "-0.012em",
                }}
              >
                {v.title}
              </h3>
              <p
                className="mt-2"
                style={{
                  color: "#4b5563",
                  fontSize: 13.5,
                  lineHeight: 1.55,
                }}
                dangerouslySetInnerHTML={{ __html: v.body }}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Contact card */}
      <section
        className="mb-8 mt-16 overflow-hidden"
        style={{
          padding: "44px 36px",
          borderRadius: 20,
          background:
            `linear-gradient(135deg, color-mix(in oklab, ${brand} 92%, white 8%), ${brand})`,
          color: "white",
          boxShadow:
            "inset 0 1px 0 0 rgba(255,255,255,0.18), " +
            "0 24px 60px -16px rgba(0,0,0,0.2)",
        }}
      >
        <div className="grid items-center gap-6 md:grid-cols-2">
          <div>
            <h2
              style={{
                fontSize: 28,
                letterSpacing: "-0.022em",
                fontWeight: 700,
                lineHeight: 1.15,
              }}
            >
              Have something in mind?
            </h2>
            <p
              className="mt-3 max-w-md"
              style={{ fontSize: 15, lineHeight: 1.55, opacity: 0.92 }}
            >
              Tell us what you&apos;re thinking — we&apos;ll get you a quote and a plan. No pressure.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={`/shop/${slug}/contact`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  height: 44,
                  padding: "0 20px",
                  borderRadius: 11,
                  background: "white",
                  color: brand,
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: "-0.005em",
                  textDecoration: "none",
                }}
              >
                Get in touch
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
              <Link
                href={`/shop/${slug}/order`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: 44,
                  padding: "0 18px",
                  borderRadius: 11,
                  background: "transparent",
                  color: "white",
                  fontSize: 14,
                  fontWeight: 500,
                  letterSpacing: "-0.005em",
                  border: "1px solid rgba(255,255,255,0.4)",
                  textDecoration: "none",
                }}
              >
                Browse catalog
              </Link>
            </div>
          </div>
          <ul
            className="space-y-3"
            style={{ fontSize: 14, lineHeight: 1.5 }}
          >
            {tenant.phone && (
              <li className="inline-flex items-start gap-3">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.86 19.86 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                <a
                  href={`tel:${tenant.phone}`}
                  style={{ color: "white", textDecoration: "none", fontWeight: 600 }}
                >
                  {tenant.phone}
                </a>
              </li>
            )}
            {tenant.emailReplyTo && (
              <li className="inline-flex items-start gap-3">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="m3 7 9 7 9-7" />
                </svg>
                <a
                  href={`mailto:${tenant.emailReplyTo}`}
                  style={{ color: "white", textDecoration: "none", fontWeight: 500 }}
                >
                  {tenant.emailReplyTo}
                </a>
              </li>
            )}
            {(tenant.addressLine1 || tenant.city) && (
              <li className="inline-flex items-start gap-3">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span style={{ fontWeight: 500 }}>
                  {tenant.addressLine1}
                  {tenant.addressLine1 && (tenant.city || tenant.region) && <br />}
                  {[tenant.city, tenant.region].filter(Boolean).join(", ")}
                </span>
              </li>
            )}
          </ul>
        </div>
      </section>
    </div>
  );
}
