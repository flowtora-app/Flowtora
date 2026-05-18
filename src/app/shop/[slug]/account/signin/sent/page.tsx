import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";

// "Check your inbox" confirmation after a magic link has been
// requested. Lives at /shop/{slug}/account/signin/sent?email=...

export const dynamic = "force-dynamic";

export default async function MagicLinkSentPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ email?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const tenant = await db.tenant.findUnique({
    where: { slug },
    select: { name: true, brandPrimaryColor: true },
  });
  if (!tenant) notFound();
  const brand = tenant.brandPrimaryColor ?? "#7C3AED";
  const email = sp.email ?? "";

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
              width: 56,
              height: 56,
              borderRadius: 14,
              background:
                "linear-gradient(135deg, color-mix(in oklab, #10b981 22%, white), color-mix(in oklab, #10b981 10%, white))",
              color: "#10b981",
              border: "1px solid color-mix(in oklab, #10b981 32%, transparent)",
              boxShadow:
                "inset 0 1px 0 0 rgba(255,255,255,0.8), " +
                "0 0 24px -2px color-mix(in oklab, #10b981 30%, transparent)",
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 8v13H3V8" />
              <path d="m1 5 11 8 11-8" />
              <path d="M21 5H3l9 7z" />
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
            Check your inbox
          </h1>
          <p
            className="mx-auto mt-2 text-center"
            style={{ color: "#4b5563", fontSize: 13.5, lineHeight: 1.55 }}
          >
            We sent a one-tap sign-in link to{" "}
            {email ? (
              <span style={{ color: "#0b0d10", fontWeight: 600 }}>{email}</span>
            ) : (
              "your inbox"
            )}
            . It expires in 15 minutes.
          </p>

          <div
            className="mt-6 rounded-lg px-4 py-3"
            style={{
              background: `color-mix(in oklab, ${brand} 8%, white)`,
              border: `1px solid color-mix(in oklab, ${brand} 22%, transparent)`,
              fontSize: 12.5,
              color: "#4b5563",
              lineHeight: 1.5,
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
              Don&rsquo;t see it? Check spam, or{" "}
              <Link
                href={`/shop/${slug}/account/signin`}
                style={{ color: brand, fontWeight: 600 }}
              >
                request another link
              </Link>
              .
            </p>
          </div>

          <Link
            href={`/shop/${slug}`}
            className="mt-5 inline-block w-full text-center"
            style={{
              color: "#6b7280",
              fontSize: 13,
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            ← Back to {tenant.name}
          </Link>
        </div>
      </div>
    </div>
  );
}
