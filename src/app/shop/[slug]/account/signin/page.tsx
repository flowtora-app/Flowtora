import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requestMagicLink } from "@/app/actions/customer-auth";

// Customer account sign-in (S-6).
//
// Passwordless flow per spec — email-only sign-in that mails a magic
// link. The form posts to `requestMagicLink` which mints a token and
// emails the visitor a one-tap link (via Resend in prod, console log
// in dev). On submit the user is redirected to /signin/sent.

export const dynamic = "force-dynamic";

export default async function StorefrontSignInPage({
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
    select: { name: true, brandPrimaryColor: true },
  });
  if (!tenant) notFound();
  const brand = tenant.brandPrimaryColor ?? "#7C3AED";
  const action = requestMagicLink.bind(null, slug);

  return (
    <div
      className="flex items-center justify-center"
      style={{ minHeight: "calc(100vh - 200px)", paddingTop: 24, paddingBottom: 24 }}
    >
      <div className="w-full" style={{ maxWidth: 420 }}>
        <div
          className="relative overflow-hidden"
          style={{
            padding: "36px 32px",
            borderRadius: 18,
            background:
              `radial-gradient(540px circle at 0% 0%, color-mix(in oklab, ${brand} 14%, transparent), transparent 55%), ` +
              "linear-gradient(180deg, #ffffff 0%, #f9fafb 100%)",
            border: "1px solid #e5e7eb",
            boxShadow:
              "inset 0 1px 0 0 rgba(255,255,255,0.6), " +
              "0 4px 18px -4px rgba(0,0,0,0.08)",
          }}
        >
          <div
            aria-hidden
            className="mx-auto flex items-center justify-center"
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: `linear-gradient(135deg, color-mix(in oklab, ${brand} 18%, white), color-mix(in oklab, ${brand} 8%, white))`,
              color: brand,
              border: `1px solid color-mix(in oklab, ${brand} 22%, transparent)`,
              boxShadow:
                "inset 0 1px 0 0 rgba(255,255,255,0.8), " +
                `0 0 20px -2px color-mix(in oklab, ${brand} 25%, transparent)`,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 7 9-7" />
            </svg>
          </div>
          <h1
            className="mt-5 text-center font-semibold"
            style={{
              color: "#0b0d10",
              fontSize: 24,
              letterSpacing: "-0.018em",
              lineHeight: 1.2,
            }}
          >
            Sign in to {tenant.name}
          </h1>
          <p
            className="mx-auto mt-2 text-center"
            style={{ color: "#4b5563", fontSize: 13.5, lineHeight: 1.55 }}
          >
            Enter your email and we&apos;ll send you a one-tap sign-in link.
          </p>

          {sp.error && (
            <div
              className="mt-5 rounded-lg px-3.5 py-2.5"
              style={{
                background: "color-mix(in oklab, #ef4444 14%, white)",
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

          <form action={action} className="mt-7 space-y-4">
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
                style={{
                  width: "100%",
                  height: 46,
                  padding: "0 14px",
                  borderRadius: 11,
                  background: "white",
                  border: "1px solid #e5e7eb",
                  color: "#0b0d10",
                  fontSize: 14,
                  outline: "none",
                  letterSpacing: "-0.005em",
                }}
              />
            </label>
            <button
              type="submit"
              className="w-full"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
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
                cursor: "pointer",
              }}
            >
              Email me a sign-in link
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </form>

          <div
            className="my-6 flex items-center gap-3"
            style={{ color: "#9ca3af", fontSize: 11, fontWeight: 600, letterSpacing: "0.06em" }}
          >
            <span style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
            <span style={{ textTransform: "uppercase" }}>or</span>
            <span style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
          </div>

          <Link
            href={`/shop/${slug}/order`}
            className="block w-full"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: 44,
              padding: "0 16px",
              borderRadius: 11,
              background: "white",
              color: "#0b0d10",
              fontSize: 13.5,
              fontWeight: 500,
              border: "1px solid #e5e7eb",
              textDecoration: "none",
            }}
          >
            Continue shopping without an account
          </Link>
        </div>

        <p
          className="mt-5 text-center"
          style={{ color: "#6b7280", fontSize: 11.5, lineHeight: 1.5 }}
        >
          New here?{" "}
          <span style={{ color: "#0b0d10", fontWeight: 600 }}>
            We&apos;ll create your account automatically
          </span>{" "}
          when you check out — no extra step.
        </p>
      </div>
    </div>
  );
}
