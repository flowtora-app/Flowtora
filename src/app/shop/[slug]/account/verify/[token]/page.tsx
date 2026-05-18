import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { consumeMagicLink } from "@/lib/customer-auth";

// Magic-link consumption.
//
// Visiting /shop/{slug}/account/verify/{token} swaps the token for a
// session cookie and bounces to the originally-requested page (or
// the account dashboard if there's no redirect target).
//
// On error (expired, replayed, malformed) we render a polished
// "ask for a new link" page rather than throwing.

export const dynamic = "force-dynamic";

export default async function VerifyMagicLinkPage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;
  const tenant = await db.tenant.findUnique({
    where: { slug },
    select: { id: true, name: true, brandPrimaryColor: true },
  });
  if (!tenant) notFound();

  const result = await consumeMagicLink(tenant.id, token);

  // Success → drop the cookie + redirect.
  if ("redirectTo" in result) {
    redirect(result.redirectTo ?? `/shop/${slug}/account`);
  }

  // Error path — render a friendly recovery page.
  const brand = tenant.brandPrimaryColor ?? "#7C3AED";
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
              background:
                "linear-gradient(135deg, color-mix(in oklab, #f59e0b 18%, white), color-mix(in oklab, #f59e0b 8%, white))",
              color: "#f59e0b",
              border: "1px solid color-mix(in oklab, #f59e0b 30%, transparent)",
              boxShadow:
                "inset 0 1px 0 0 rgba(255,255,255,0.8), " +
                "0 0 20px -2px color-mix(in oklab, #f59e0b 25%, transparent)",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h1
            className="mt-5 text-center font-semibold"
            style={{
              color: "#0b0d10",
              fontSize: 22,
              letterSpacing: "-0.018em",
              lineHeight: 1.2,
            }}
          >
            Couldn&rsquo;t sign you in
          </h1>
          <p
            className="mx-auto mt-2 text-center"
            style={{ color: "#4b5563", fontSize: 13.5, lineHeight: 1.55 }}
          >
            {result.error}.
          </p>
          <p
            className="mx-auto mt-1 text-center"
            style={{ color: "#6b7280", fontSize: 12.5, lineHeight: 1.55 }}
          >
            Magic links expire after 15 minutes and can only be used once. Request a new one to try again.
          </p>

          <Link
            href={`/shop/${slug}/account/signin`}
            className="mt-6 inline-flex w-full items-center justify-center"
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
            Request a new sign-in link
          </Link>
        </div>
      </div>
    </div>
  );
}
