import Link from "next/link";
import { requireTenant } from "@/lib/tenant";

// In-app help center (T-105).
//
// Searchable docs surface inside the workspace. Categories + popular
// articles + contact-support fallback. Backend wiring (real article
// content + search index) lands when the help knowledge base ships;
// for now this is a polished navigable scaffold.

export const dynamic = "force-dynamic";

type HelpCategory = {
  slug: string;
  title: string;
  blurb: string;
  count: number;
  icon: React.ReactNode;
};

const CATEGORIES: HelpCategory[] = [
  {
    slug: "getting-started",
    title: "Getting started",
    blurb: "First quote, first job, your shop brand — the day-one setup essentials.",
    count: 12,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="m12 3 2.7 5.6 6.3.9-4.5 4.4 1 6.1-5.5-2.9-5.5 2.9 1-6.1L3 9.5l6.3-.9z" />
      </svg>
    ),
  },
  {
    slug: "quotes-and-invoicing",
    title: "Quotes & invoicing",
    blurb: "Build a quote, send it for approval, convert to a job, collect payment.",
    count: 18,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M6 4h9l5 5v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
        <path d="M15 4v5h5M8 13h8M8 17h5" />
      </svg>
    ),
  },
  {
    slug: "production",
    title: "Production",
    blurb: "Job queue, kanban board, production stages, blockers, equipment.",
    count: 14,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="7" width="6" height="14" rx="1" />
        <rect x="9" y="3" width="6" height="18" rx="1" />
        <rect x="15" y="11" width="6" height="10" rx="1" />
      </svg>
    ),
  },
  {
    slug: "customers-and-portal",
    title: "Customers & portal",
    blurb: "Customer records, proof approval, the customer portal, online ordering.",
    count: 16,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-1a8 8 0 0 1 16 0v1" />
      </svg>
    ),
  },
  {
    slug: "team-and-roles",
    title: "Team & roles",
    blurb: "Invite teammates, role permissions, branch access, audit trail.",
    count: 9,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="9" cy="7" r="3" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M3 21v-1a6 6 0 0 1 12 0v1M15 21v-1a4.5 4.5 0 0 1 7.5-3.3" />
      </svg>
    ),
  },
  {
    slug: "billing-and-plans",
    title: "Billing & plans",
    blurb: "Subscription, plan comparison, add-ons, invoices, cancelling.",
    count: 11,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18" />
      </svg>
    ),
  },
  {
    slug: "integrations",
    title: "Integrations",
    blurb: "QuickBooks, Stripe, Google Calendar, ShipStation, Slack, webhooks.",
    count: 22,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="6" cy="6" r="2" />
        <circle cx="18" cy="6" r="2" />
        <circle cx="12" cy="18" r="2" />
        <path d="M8 6h8M7 8l4 8M17 8l-4 8" />
      </svg>
    ),
  },
  {
    slug: "settings",
    title: "Workspace settings",
    blurb: "Branding, locale, numbering, financial defaults, automations.",
    count: 19,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

const POPULAR = [
  { title: "How do I send a quote for approval?",   category: "Quotes & invoicing",  read: "3 min" },
  { title: "Setting up your customer portal link",  category: "Customers & portal",  read: "5 min" },
  { title: "Production blockers vs hold status",    category: "Production",          read: "4 min" },
  { title: "Connecting QuickBooks for accounting",  category: "Integrations",        read: "8 min" },
  { title: "Inviting your team — permissions guide", category: "Team & roles",        read: "6 min" },
  { title: "Switching plans mid-cycle",             category: "Billing & plans",     read: "3 min" },
];

export default async function HelpCenterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireTenant(slug);

  return (
    <div className="space-y-5">
      {/* Hero with search. */}
      <div
        className="relative overflow-hidden rounded-2xl text-center"
        style={{
          padding: "48px 24px",
          background:
            "radial-gradient(720px circle at 50% 0%, var(--accent-surface), transparent 55%), " +
            "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
          border: "1px solid var(--border-subtle)",
          boxShadow:
            "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
            "0 1px 2px 0 rgba(0,0,0,0.18)",
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
              "linear-gradient(135deg, var(--accent-surface-strong), var(--accent-surface))",
            color: "var(--accent-primary)",
            border:
              "1px solid color-mix(in oklab, var(--accent-primary) 28%, transparent)",
            boxShadow:
              "inset 0 1px 0 0 color-mix(in oklab, white 6%, transparent), " +
              "0 0 32px -4px color-mix(in oklab, var(--accent-primary) 30%, transparent)",
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="9" />
            <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" />
          </svg>
        </div>
        <h1
          className="mt-5 font-semibold"
          style={{
            color: "var(--text-default)",
            fontSize: 32,
            letterSpacing: "-0.022em",
            lineHeight: 1.15,
          }}
        >
          How can we help?
        </h1>
        <p
          className="mx-auto mt-2 max-w-md"
          style={{
            color: "var(--text-muted)",
            fontSize: 14,
            lineHeight: 1.55,
          }}
        >
          Search guides for setup, day-to-day operations, integrations, and more.
        </p>

        {/* Search input. */}
        <form className="mx-auto mt-6" style={{ maxWidth: 520 }}>
          <div
            className="flex items-center"
            style={{
              height: 48,
              padding: "0 18px",
              borderRadius: 12,
              background: "color-mix(in oklab, var(--surface-2) 75%, transparent)",
              border: "1px solid var(--border-subtle)",
              boxShadow:
                "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
                "0 1px 2px 0 rgba(0,0,0,0.06)",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--text-faint)", flexShrink: 0 }}>
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              name="q"
              placeholder="Search the help center…"
              style={{
                flex: 1,
                marginLeft: 12,
                background: "transparent",
                border: 0,
                outline: "none",
                color: "var(--text-default)",
                fontSize: 14,
                letterSpacing: "-0.005em",
              }}
            />
            <kbd
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "var(--text-faint)",
                background: "var(--surface-1)",
                border: "1px solid var(--border-subtle)",
                padding: "2px 6px",
                borderRadius: 5,
                fontFamily: "var(--font-mono, ui-monospace, monospace)",
                marginLeft: 8,
                flexShrink: 0,
              }}
            >
              ⌘K
            </kbd>
          </div>
        </form>
      </div>

      {/* Category grid. */}
      <section>
        <div className="flex items-center gap-1.5 mb-4">
          <span
            aria-hidden
            style={{ width: 3, height: 3, borderRadius: 1, background: "var(--accent-primary)" }}
          />
          <h2
            style={{
              color: "var(--text-default)",
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            Browse by topic
          </h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              href={`/t/${slug}/help/${c.slug}`}
              className="ts-focus group/cat relative block overflow-hidden rounded-xl transition-all hover:-translate-y-px"
              style={{
                padding: "16px 18px",
                background:
                  "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
                border: "1px solid var(--border-subtle)",
                boxShadow:
                  "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
                  "0 1px 2px 0 rgba(0,0,0,0.18)",
                textDecoration: "none",
              }}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity group-hover/cat:opacity-100"
                style={{
                  boxShadow:
                    "0 0 0 1px color-mix(in oklab, var(--accent-primary) 35%, transparent), " +
                    "0 8px 24px -10px rgba(0,0,0,0.45)",
                }}
              />
              <div className="relative">
                <span
                  aria-hidden
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 36,
                    height: 36,
                    borderRadius: 9,
                    background:
                      "linear-gradient(135deg, var(--accent-surface-strong), var(--accent-surface))",
                    color: "var(--accent-primary)",
                    border:
                      "1px solid color-mix(in oklab, var(--accent-primary) 22%, transparent)",
                  }}
                >
                  {c.icon}
                </span>
                <h3
                  className="mt-3 font-semibold"
                  style={{
                    color: "var(--text-default)",
                    fontSize: 13.5,
                    letterSpacing: "-0.005em",
                    lineHeight: 1.25,
                  }}
                >
                  {c.title}
                </h3>
                <p
                  className="mt-1"
                  style={{ color: "var(--text-muted)", fontSize: 11.5, lineHeight: 1.4 }}
                >
                  {c.blurb}
                </p>
                <div
                  className="mt-3"
                  style={{
                    color: "var(--text-faint)",
                    fontSize: 10.5,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    fontFeatureSettings: "'tnum' 1",
                  }}
                >
                  {c.count} articles
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Popular articles + contact sidebar. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section
          className="rounded-xl overflow-hidden"
          style={{
            background:
              "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
            border: "1px solid var(--border-subtle)",
            boxShadow:
              "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
              "0 1px 2px 0 rgba(0,0,0,0.18)",
          }}
        >
          <div
            className="flex items-center gap-1.5 px-5 py-4"
            style={{ borderBottom: "1px solid var(--border-subtle)" }}
          >
            <span aria-hidden style={{ width: 3, height: 3, borderRadius: 1, background: "var(--accent-primary)" }} />
            <h2
              style={{
                color: "var(--text-default)",
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Popular this week
            </h2>
          </div>
          <ul>
            {POPULAR.map((a, i) => (
              <li
                key={i}
                style={{
                  borderTop: i === 0 ? undefined : "1px solid var(--border-subtle)",
                }}
              >
                <button
                  type="button"
                  className="block w-full text-left transition-colors hover:bg-[color-mix(in_oklab,var(--surface-3)_50%,transparent)]"
                  style={{ padding: "12px 18px" }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div
                        style={{
                          color: "var(--text-default)",
                          fontSize: 13,
                          fontWeight: 600,
                          letterSpacing: "-0.005em",
                        }}
                      >
                        {a.title}
                      </div>
                      <div
                        className="mt-0.5"
                        style={{
                          color: "var(--text-muted)",
                          fontSize: 11,
                        }}
                      >
                        {a.category}
                        <span style={{ color: "var(--text-faint)" }}> · </span>
                        {a.read} read
                      </div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--text-faint)", flexShrink: 0 }}>
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Contact + status. */}
        <aside className="space-y-3">
          <div
            className="relative overflow-hidden rounded-xl"
            style={{
              padding: "20px 22px",
              background:
                "radial-gradient(540px circle at 100% 0%, var(--accent-surface), transparent 55%), " +
                "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
              border: "1px solid var(--border-subtle)",
              boxShadow:
                "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
                "0 1px 2px 0 rgba(0,0,0,0.18)",
            }}
          >
            <h3
              style={{
                color: "var(--text-default)",
                fontSize: 14.5,
                fontWeight: 600,
                letterSpacing: "-0.005em",
                lineHeight: 1.25,
              }}
            >
              Still stuck?
            </h3>
            <p
              className="mt-2"
              style={{ color: "var(--text-muted)", fontSize: 12.5, lineHeight: 1.45 }}
            >
              Our team responds within a few hours during business hours.
            </p>
            <Link
              href={`/t/${slug}/support/new`}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg font-semibold transition-transform"
              style={{
                height: 36,
                padding: "0 14px",
                background:
                  "linear-gradient(180deg, color-mix(in oklab, var(--accent-primary) 96%, white 4%) 0%, var(--accent-primary) 100%)",
                color: "var(--accent-fg)",
                border:
                  "1px solid color-mix(in oklab, var(--accent-primary) 80%, black 20%)",
                boxShadow:
                  "0 1px 0 0 rgba(255,255,255,0.15) inset, " +
                  "0 1px 2px 0 rgba(0,0,0,0.35)",
                fontSize: 12.5,
                letterSpacing: "-0.005em",
                textDecoration: "none",
              }}
            >
              Contact support
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          <div
            className="rounded-xl"
            style={{
              padding: "16px 18px",
              background: "color-mix(in oklab, var(--surface-2) 50%, transparent)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div className="flex items-center gap-1.5">
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: "var(--emerald-500)",
                  boxShadow: "0 0 0 2px color-mix(in oklab, var(--emerald-500) 25%, transparent)",
                }}
              />
              <span
                style={{
                  color: "var(--text-default)",
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "-0.005em",
                }}
              >
                All systems normal
              </span>
            </div>
            <p
              className="mt-1.5"
              style={{ color: "var(--text-muted)", fontSize: 11.5, lineHeight: 1.45 }}
            >
              Check{" "}
              <a
                href="/status"
                style={{ color: "var(--accent-primary)", fontWeight: 500 }}
                className="hover:underline"
              >
                status.flowtora.com
              </a>{" "}
              for live updates.
            </p>
          </div>
          <div
            className="rounded-xl"
            style={{
              padding: "16px 18px",
              background: "color-mix(in oklab, var(--surface-2) 50%, transparent)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div
              style={{
                color: "var(--text-faint)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Power-user tip
            </div>
            <p
              className="mt-1.5"
              style={{ color: "var(--text-muted)", fontSize: 11.5, lineHeight: 1.45 }}
            >
              Press{" "}
              <kbd
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--text-default)",
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-subtle)",
                  padding: "1px 5px",
                  borderRadius: 4,
                  fontFamily: "var(--font-mono, ui-monospace, monospace)",
                }}
              >?</kbd>{" "}
              anywhere in the workspace for keyboard shortcuts.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
