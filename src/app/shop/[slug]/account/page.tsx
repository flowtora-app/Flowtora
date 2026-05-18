import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireCustomer } from "@/lib/customer-auth";
import { customerSignOut } from "@/app/actions/customer-auth";

// Customer account portal — dashboard (S-6).
//
// Gates on the magic-link session (see /lib/customer-auth). Reads the
// linked CRM Customer record (if any) to populate the activity counts.

export const dynamic = "force-dynamic";

const SECTIONS = [
  {
    slug: "orders",
    title: "My orders",
    blurb: "Active jobs in production + your full order history.",
    count: 0,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 9h18M9 5v14" />
      </svg>
    ),
  },
  {
    slug: "quotes",
    title: "Open quotes",
    blurb: "Pricing in your court — accept, request changes, or send a question.",
    count: 0,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M6 4h9l5 5v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
        <path d="M15 4v5h5M8 13h8M8 17h5" />
      </svg>
    ),
  },
  {
    slug: "proofs",
    title: "Pending proofs",
    blurb: "Design proofs waiting on your approval before we go to print.",
    count: 0,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M9 11l3 3 7-7" />
        <path d="M21 12v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    slug: "files",
    title: "My files",
    blurb: "Every design you've uploaded — reuse for repeat orders.",
    count: 0,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM13 2v7h7" />
      </svg>
    ),
  },
  {
    slug: "addresses",
    title: "Addresses",
    blurb: "Saved shipping + billing addresses — autofills at checkout.",
    count: 0,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
  },
  {
    slug: "payment",
    title: "Payment methods",
    blurb: "Saved cards for fast reordering. Securely tokenized via Stripe.",
    count: 0,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18" />
      </svg>
    ),
  },
];

export default async function StorefrontAccountPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenant = await db.tenant.findUnique({
    where: { slug },
    select: { id: true, name: true, brandPrimaryColor: true },
  });
  if (!tenant) notFound();
  const brand = tenant.brandPrimaryColor ?? "#7C3AED";

  // Require a signed-in customer — redirects to /signin otherwise.
  const { account } = await requireCustomer(slug);

  // Pull live counts when an attached Customer (CRM) record exists.
  let activeOrders = 0;
  let pendingProofs = 0;
  let openQuotes = 0;
  if (account.customerId) {
    [activeOrders, openQuotes] = await Promise.all([
      db.order.count({
        where: {
          tenantId: tenant.id,
          customerId: account.customerId,
          status: { in: ["NEW", "IN_PRODUCTION", "READY"] as never[] },
        },
      }).catch(() => 0),
      db.quote.count({
        where: {
          tenantId: tenant.id,
          customerId: account.customerId,
          status: { in: ["DRAFT", "SENT", "VIEWED"] as never[] },
        },
      }).catch(() => 0),
    ]);
  }

  const firstName = account.firstName ?? account.email.split("@")[0];
  const signOutAction = customerSignOut.bind(null, slug);

  return (
    <div style={{ paddingTop: 24 }}>
      {/* Welcome header. */}
      <header
        className="relative overflow-hidden"
        style={{
          padding: "32px 32px",
          borderRadius: 20,
          background:
            `radial-gradient(720px circle at 0% 0%, color-mix(in oklab, ${brand} 16%, transparent), transparent 55%), ` +
            "linear-gradient(180deg, #ffffff 0%, #f9fafb 100%)",
          border: "1px solid #e5e7eb",
          boxShadow:
            "inset 0 1px 0 0 rgba(255,255,255,0.6), " +
            "0 1px 4px 0 rgba(0,0,0,0.04)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
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
              My account
            </span>
            <h1
              className="mt-2 font-semibold"
              style={{
                color: "#0b0d10",
                fontSize: 32,
                letterSpacing: "-0.022em",
                lineHeight: 1.15,
              }}
            >
              Welcome back{firstName ? `, ${firstName}` : ""}
            </h1>
            <p
              className="mt-2 max-w-lg"
              style={{ color: "#4b5563", fontSize: 14, lineHeight: 1.55 }}
            >
              Signed in as{" "}
              <span style={{ color: "#0b0d10", fontWeight: 600 }}>{account.email}</span>
              . Your orders, quotes, proofs, and files all live here.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <form action={signOutAction}>
              <button
                type="submit"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: 42,
                  padding: "0 16px",
                  borderRadius: 11,
                  background: "white",
                  color: "#4b5563",
                  fontSize: 13,
                  fontWeight: 500,
                  border: "1px solid #e5e7eb",
                  cursor: "pointer",
                }}
              >
                Sign out
              </button>
            </form>
            <Link
              href={`/shop/${slug}/order`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                height: 42,
                padding: "0 18px",
                borderRadius: 11,
                background: `linear-gradient(180deg, color-mix(in oklab, ${brand} 96%, white 4%) 0%, ${brand} 100%)`,
                color: "white",
                fontSize: 13.5,
                fontWeight: 600,
                border: `1px solid color-mix(in oklab, ${brand} 80%, black 20%)`,
                boxShadow:
                  "0 1px 0 0 rgba(255,255,255,0.18) inset, " +
                  `0 4px 14px -2px color-mix(in oklab, ${brand} 35%, transparent), ` +
                  "0 1px 2px 0 rgba(0,0,0,0.12)",
                textDecoration: "none",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Start a new order
            </Link>
          </div>
        </div>
      </header>

      {/* Quick stats. */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          { label: "Active orders",  value: String(activeOrders),  tone: brand },
          { label: "Pending proofs", value: String(pendingProofs), tone: "#f59e0b" },
          { label: "Open quotes",    value: String(openQuotes),    tone: "#10b981" },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              padding: "18px 20px",
              borderRadius: 14,
              background: "white",
              border: "1px solid #e5e7eb",
              boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "#6b7280",
              }}
            >
              {s.label}
            </div>
            <div
              className="mt-2"
              style={{
                color: s.tone,
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: "-0.022em",
                lineHeight: 1.1,
                fontFeatureSettings: "'tnum' 1",
              }}
            >
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Section cards. */}
      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link
            key={s.slug}
            href={`/shop/${slug}/account/${s.slug}`}
            className="group/card relative overflow-hidden transition-all hover:-translate-y-px"
            style={{
              padding: "20px 22px",
              borderRadius: 16,
              background: "white",
              border: "1px solid #e5e7eb",
              boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity group-hover/card:opacity-100"
              style={{
                boxShadow:
                  `0 0 0 1px color-mix(in oklab, ${brand} 32%, transparent), ` +
                  "0 8px 24px -10px rgba(0,0,0,0.15)",
              }}
            />
            <div className="relative flex items-start gap-3">
              <span
                aria-hidden
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: `linear-gradient(135deg, color-mix(in oklab, ${brand} 18%, white), color-mix(in oklab, ${brand} 8%, white))`,
                  color: brand,
                  border: `1px solid color-mix(in oklab, ${brand} 22%, transparent)`,
                  flexShrink: 0,
                }}
              >
                {s.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3
                    style={{
                      color: "#0b0d10",
                      fontSize: 15,
                      fontWeight: 600,
                      letterSpacing: "-0.005em",
                      lineHeight: 1.25,
                    }}
                  >
                    {s.title}
                  </h3>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      color: "#6b7280",
                      background: "#f3f4f6",
                      border: "1px solid #e5e7eb",
                      padding: "1px 6px",
                      borderRadius: 999,
                      fontFeatureSettings: "'tnum' 1",
                      lineHeight: 1,
                    }}
                  >
                    {s.count}
                  </span>
                </div>
                <p
                  className="mt-1.5"
                  style={{ color: "#6b7280", fontSize: 12.5, lineHeight: 1.45 }}
                >
                  {s.blurb}
                </p>
                <div
                  className="mt-3 inline-flex items-center gap-1"
                  style={{
                    color: brand,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  Open
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Empty-history nudge. */}
      <div
        className="mt-8 mb-6 rounded-2xl text-center"
        style={{
          padding: "44px 32px",
          background:
            `radial-gradient(540px circle at 50% 0%, color-mix(in oklab, ${brand} 8%, transparent), transparent 55%), ` +
            "linear-gradient(180deg, #ffffff 0%, #f9fafb 100%)",
          border: "1px dashed #e5e7eb",
        }}
      >
        <h2
          className="font-semibold"
          style={{
            color: "#0b0d10",
            fontSize: 18,
            letterSpacing: "-0.012em",
            lineHeight: 1.25,
          }}
        >
          No order history yet
        </h2>
        <p
          className="mx-auto mt-2 max-w-md"
          style={{ color: "#6b7280", fontSize: 13.5, lineHeight: 1.55 }}
        >
          When you place an order with {tenant.name}, it&apos;ll appear here along with proofs, quotes, and reorder shortcuts.
        </p>
        <Link
          href={`/shop/${slug}/order`}
          className="mt-5 inline-block"
          style={{
            color: brand,
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "underline",
          }}
        >
          Browse the catalog →
        </Link>
      </div>
    </div>
  );
}
