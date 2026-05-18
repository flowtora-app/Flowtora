import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";

// Checkout confirmation (S-5).
//
// Shown after either:
//   1. A successful "Request quote" submission (no payment)
//   2. A successful Stripe Checkout payment (?checkout=success)
//   3. Stripe being unavailable at request time (?note=stripe-unavailable)
//
// Renders the order # + sets honest expectations on next steps.

export const dynamic = "force-dynamic";

export default async function CheckoutConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ quote?: string; checkout?: string; note?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  const tenant = await db.tenant.findUnique({
    where: { slug },
    select: { name: true, brandPrimaryColor: true },
  });
  if (!tenant) notFound();

  const brand = tenant.brandPrimaryColor ?? "#7C3AED";
  const paid = sp.checkout === "success";
  const stripeUnavailable = sp.note === "stripe-unavailable";

  return (
    <div
      className="flex items-center justify-center"
      style={{ minHeight: "calc(100vh - 200px)", paddingTop: 24, paddingBottom: 24 }}
    >
      <div className="w-full" style={{ maxWidth: 560 }}>
        <div
          className="relative overflow-hidden text-center"
          style={{
            padding: "48px 36px",
            borderRadius: 20,
            background:
              `radial-gradient(720px circle at 50% 0%, color-mix(in oklab, ${brand} 14%, transparent), transparent 55%), ` +
              `radial-gradient(520px circle at 50% 110%, color-mix(in oklab, #10b981 10%, transparent), transparent 55%), ` +
              "linear-gradient(180deg, #ffffff 0%, #f9fafb 100%)",
            border: "1px solid #e5e7eb",
            boxShadow:
              "inset 0 1px 0 0 rgba(255,255,255,0.6), " +
              "0 4px 18px -4px rgba(0,0,0,0.06)",
          }}
        >
          {/* Success icon. */}
          <div
            aria-hidden
            className="mx-auto flex items-center justify-center"
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background:
                "linear-gradient(135deg, color-mix(in oklab, #10b981 22%, white), color-mix(in oklab, #10b981 10%, white))",
              color: "#10b981",
              border: "1px solid color-mix(in oklab, #10b981 32%, transparent)",
              boxShadow:
                "inset 0 1px 0 0 rgba(255,255,255,0.8), " +
                "0 0 32px -2px color-mix(in oklab, #10b981 32%, transparent)",
            }}
          >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <h1
            className="mt-6 font-semibold"
            style={{
              color: "#0b0d10",
              fontSize: 30,
              letterSpacing: "-0.022em",
              lineHeight: 1.15,
            }}
          >
            {paid
              ? "Deposit received — you're in!"
              : "Got it — we'll be in touch"}
          </h1>

          <p
            className="mx-auto mt-3 max-w-md"
            style={{ color: "#4b5563", fontSize: 14.5, lineHeight: 1.55 }}
          >
            {paid
              ? `Your reservation deposit is paid. ${tenant.name} will send a full quote within one business day.`
              : `${tenant.name} got your request and will send a quote within one business day.`}
          </p>

          {/* Reference card. */}
          {sp.quote && (
            <div
              className="mx-auto mt-7 inline-flex items-center gap-3"
              style={{
                padding: "12px 18px",
                borderRadius: 12,
                background: "white",
                border: "1px solid #e5e7eb",
                boxShadow: "0 1px 2px 0 rgba(0,0,0,0.05)",
              }}
            >
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#6b7280",
                }}
              >
                Reference
              </span>
              <span
                style={{
                  color: "#0b0d10",
                  fontSize: 18,
                  fontWeight: 700,
                  letterSpacing: "-0.015em",
                  fontFamily: "var(--font-mono, ui-monospace, monospace)",
                  fontFeatureSettings: "'tnum' 1",
                }}
              >
                {sp.quote}
              </span>
            </div>
          )}

          {stripeUnavailable && (
            <div
              className="mx-auto mt-5 max-w-md rounded-lg px-4 py-3"
              style={{
                background: "color-mix(in oklab, #f59e0b 14%, white)",
                border: "1px solid color-mix(in oklab, #f59e0b 30%, transparent)",
                color: "#92400e",
                fontSize: 12.5,
                lineHeight: 1.5,
                fontWeight: 500,
              }}
            >
              Online payment isn&apos;t available right now — but your request is in. {tenant.name} will follow up with payment instructions.
            </div>
          )}

          {/* What happens next. */}
          <div
            className="mx-auto mt-8 max-w-md text-left"
            style={{
              padding: "20px 22px",
              borderRadius: 14,
              background: `color-mix(in oklab, ${brand} 4%, white)`,
              border: `1px solid color-mix(in oklab, ${brand} 18%, transparent)`,
            }}
          >
            <div
              style={{
                color: brand,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              What happens next
            </div>
            <ol className="space-y-3" style={{ fontSize: 13.5, color: "#0b0d10", lineHeight: 1.55 }}>
              {[
                paid
                  ? "We start reviewing your request right away."
                  : "We review your request and put together a quote.",
                "You'll get an email with the full quote within one business day.",
                "Approve the quote with one click, and we kick off production.",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span
                    aria-hidden
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 22,
                      height: 22,
                      borderRadius: 7,
                      flexShrink: 0,
                      background: brand,
                      color: "white",
                      fontSize: 11,
                      fontWeight: 700,
                      fontFeatureSettings: "'tnum' 1",
                    }}
                  >
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={`/shop/${slug}/account`}
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
                  "0 1px 2px 0 rgba(0,0,0,0.15)",
                textDecoration: "none",
              }}
            >
              Track this order
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
            <Link
              href={`/shop/${slug}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 44,
                padding: "0 22px",
                borderRadius: 11,
                background: "white",
                color: "#0b0d10",
                fontSize: 14,
                fontWeight: 500,
                letterSpacing: "-0.005em",
                border: "1px solid #e5e7eb",
                textDecoration: "none",
              }}
            >
              Back to {tenant.name}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
