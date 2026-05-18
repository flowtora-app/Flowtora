import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";

// Contact page (part of storefront S-shell IA).
//
// Public-facing contact surface. Renders the shop's reach-out methods
// + a quote-request form placeholder. Form submission wiring lands
// when the lead-capture (T-14 Forms) backend ships; until then the
// form is read-only with a clear "Tell us what you need" CTA that
// can route to a mailto: as a fallback.

export const dynamic = "force-dynamic";

export default async function StorefrontContactPage({
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
      addressLine2: true,
      city: true,
      region: true,
      postalCode: true,
      phone: true,
      emailReplyTo: true,
    },
  });
  if (!tenant) notFound();

  const brand = tenant.brandPrimaryColor ?? "#7C3AED";
  const mailto = tenant.emailReplyTo
    ? `mailto:${tenant.emailReplyTo}?subject=${encodeURIComponent(`Quote request — ${tenant.name}`)}`
    : null;

  const inputStyle = {
    width: "100%",
    height: 44,
    padding: "0 14px",
    borderRadius: 10,
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
    color: "#0b0d10",
    fontSize: 14,
    outline: "none",
    letterSpacing: "-0.005em",
  } as const;

  return (
    <div style={{ paddingTop: 24 }}>
      <header
        className="relative overflow-hidden"
        style={{
          padding: "44px 36px",
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
        <span
          style={{
            color: brand,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Contact
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
          Let&apos;s talk
        </h1>
        <p
          className="mt-3 max-w-xl"
          style={{
            color: "#4b5563",
            fontSize: 15,
            lineHeight: 1.6,
          }}
        >
          Tell us what you need — banners, signs, vehicle wraps, business cards, branded apparel. We&apos;ll respond within one business day with a quote and a plan.
        </p>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* Quote request form (placeholder — submission wiring lands
            with the T-14 Forms backend). */}
        <form
          action={mailto ?? undefined}
          method={mailto ? "get" : undefined}
          target={mailto ? "_blank" : undefined}
          style={{
            padding: "28px",
            borderRadius: 16,
            background: "white",
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)",
          }}
        >
          <div className="flex items-center gap-1.5">
            <span
              aria-hidden
              style={{
                width: 3,
                height: 3,
                borderRadius: 1,
                background: brand,
              }}
            />
            <h2
              style={{
                color: "#0b0d10",
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Quote request
            </h2>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span
                style={{
                  display: "block",
                  marginBottom: 6,
                  color: "#0b0d10",
                  fontSize: 12.5,
                  fontWeight: 600,
                  letterSpacing: "-0.005em",
                }}
              >
                Your name
              </span>
              <input
                type="text"
                name="name"
                placeholder="Sarah Johnson"
                style={inputStyle}
              />
            </label>
            <label className="block">
              <span
                style={{
                  display: "block",
                  marginBottom: 6,
                  color: "#0b0d10",
                  fontSize: 12.5,
                  fontWeight: 600,
                  letterSpacing: "-0.005em",
                }}
              >
                Email
              </span>
              <input
                type="email"
                name="email"
                required
                placeholder="you@example.com"
                style={inputStyle}
              />
            </label>
            <label className="block">
              <span
                style={{
                  display: "block",
                  marginBottom: 6,
                  color: "#0b0d10",
                  fontSize: 12.5,
                  fontWeight: 600,
                  letterSpacing: "-0.005em",
                }}
              >
                Phone (optional)
              </span>
              <input
                type="tel"
                name="phone"
                placeholder="(555) 123-4567"
                style={inputStyle}
              />
            </label>
            <label className="block">
              <span
                style={{
                  display: "block",
                  marginBottom: 6,
                  color: "#0b0d10",
                  fontSize: 12.5,
                  fontWeight: 600,
                  letterSpacing: "-0.005em",
                }}
              >
                Project type
              </span>
              <select name="project" style={inputStyle}>
                <option>Signs &amp; banners</option>
                <option>Vehicle wraps</option>
                <option>Business cards</option>
                <option>Apparel</option>
                <option>Custom / something else</option>
              </select>
            </label>
          </div>
          <label className="mt-4 block">
            <span
              style={{
                display: "block",
                marginBottom: 6,
                color: "#0b0d10",
                fontSize: 12.5,
                fontWeight: 600,
                letterSpacing: "-0.005em",
              }}
            >
              Tell us about your project
            </span>
            <textarea
              name="body"
              rows={5}
              required
              placeholder="Size, materials, deadline, where it&rsquo;s going — anything that helps us quote it."
              style={{
                ...inputStyle,
                height: "auto",
                paddingTop: 12,
                paddingBottom: 12,
                resize: "vertical",
                lineHeight: 1.5,
              }}
            />
          </label>
          <div className="mt-5 flex items-center justify-between gap-3">
            <p
              style={{
                color: "#6b7280",
                fontSize: 11.5,
                lineHeight: 1.4,
                maxWidth: 320,
              }}
            >
              {mailto
                ? "We&rsquo;ll get back to you within one business day."
                : "Email isn&rsquo;t set up yet for this shop — call us directly with the number on the right."}
            </p>
            <button
              type="submit"
              disabled={!mailto}
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
                opacity: mailto ? 1 : 0.5,
                cursor: mailto ? "pointer" : "not-allowed",
              }}
            >
              Send request
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </form>

        {/* Sidebar — direct contact methods. */}
        <aside
          style={{
            padding: "28px",
            borderRadius: 16,
            background:
              `radial-gradient(540px circle at 100% 0%, color-mix(in oklab, ${brand} 14%, transparent), transparent 55%), ` +
              "linear-gradient(180deg, #ffffff 0%, #f9fafb 100%)",
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)",
            height: "fit-content",
          }}
        >
          <div className="flex items-center gap-1.5">
            <span
              aria-hidden
              style={{
                width: 3,
                height: 3,
                borderRadius: 1,
                background: brand,
              }}
            />
            <h2
              style={{
                color: "#0b0d10",
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Reach us directly
            </h2>
          </div>
          <ul className="mt-4 space-y-4">
            {tenant.phone && (
              <li>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#6b7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 4,
                  }}
                >
                  Phone
                </div>
                <a
                  href={`tel:${tenant.phone}`}
                  style={{
                    color: "#0b0d10",
                    fontSize: 18,
                    fontWeight: 700,
                    letterSpacing: "-0.015em",
                    textDecoration: "none",
                    fontFeatureSettings: "'tnum' 1",
                  }}
                >
                  {tenant.phone}
                </a>
              </li>
            )}
            {tenant.emailReplyTo && (
              <li>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#6b7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 4,
                  }}
                >
                  Email
                </div>
                <a
                  href={`mailto:${tenant.emailReplyTo}`}
                  style={{
                    color: "#0b0d10",
                    fontSize: 14,
                    fontWeight: 500,
                    textDecoration: "none",
                    wordBreak: "break-word",
                  }}
                >
                  {tenant.emailReplyTo}
                </a>
              </li>
            )}
            {(tenant.addressLine1 || tenant.city) && (
              <li>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#6b7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 4,
                  }}
                >
                  Visit
                </div>
                <address
                  style={{
                    color: "#0b0d10",
                    fontSize: 14,
                    fontWeight: 500,
                    fontStyle: "normal",
                    lineHeight: 1.5,
                  }}
                >
                  {tenant.addressLine1}
                  {tenant.addressLine2 && <><br />{tenant.addressLine2}</>}
                  {(tenant.city || tenant.region) && <br />}
                  {[tenant.city, tenant.region, tenant.postalCode].filter(Boolean).join(", ")}
                </address>
              </li>
            )}
          </ul>

          <div
            className="mt-5 rounded-xl px-4 py-3"
            style={{
              background: `color-mix(in oklab, ${brand} 8%, white)`,
              border: `1px solid color-mix(in oklab, ${brand} 22%, transparent)`,
              fontSize: 12.5,
              lineHeight: 1.5,
              color: "#4b5563",
            }}
          >
            <span
              style={{
                color: brand,
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Tip
            </span>
            <p className="mt-1">
              Already know what you want?{" "}
              <Link
                href={`/shop/${slug}/order`}
                style={{ color: brand, fontWeight: 600, textDecoration: "none" }}
                className="hover:underline"
              >
                Browse the catalog
              </Link>{" "}
              to start an order online.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
