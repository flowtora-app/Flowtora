import type { Metadata } from "next";
import { Container } from "@/components/marketing/Container";

// Phase 5 — /changelog.
//
// Ongoing release-notes stream. We commit to weekly posts in /about;
// this page is where those posts live. For the pre-launch period it's
// seeded with a handful of entries that describe what's already built,
// so the link in the footer lands on something real, not an empty
// "Coming soon" page.
//
// Structure is deliberately MDX-free (no library dep) — entries are
// an array of {date, title, tags, body} items we can add to from any
// engineer's editor. When the list crosses ~40 items we'll migrate to
// MDX or a CMS; not before.

export const metadata: Metadata = {
  title: "Changelog — Tracksign",
  description:
    "What's new in Tracksign. Release notes, shipped each week.",
  alternates: { canonical: "/changelog" },
  openGraph: {
    title: "Tracksign changelog",
    description: "What's new, what's changing, what's coming.",
    type: "website",
  },
};

interface ChangelogEntry {
  date: string;            // ISO date
  title: string;
  tags?: string[];
  body: React.ReactNode;
}

const ENTRIES: ChangelogEntry[] = [
  {
    date: "2026-04-15",
    title: "Business onboarding, activation score, and sample data",
    tags: ["onboarding", "activation"],
    body: (
      <>
        <p>
          New workspaces now get smart defaults based on the shop type
          they pick — a sign shop starts with 50% deposit and NET_30,
          a print shop with 30% deposit and NET_15. You can adjust any
          default anytime, but we stop making you fish for the right
          answer on day one.
        </p>
        <p>
          Replaced the old onboarding checklist with an activation
          score (0–100) and a next-best-action suggestion on the
          dashboard. Owners who want a faster start can load a demo
          shop with realistic customers, products, quotes, orders, and
          invoices in one click; clear it just as fast when you&apos;re
          ready to go live.
        </p>
        <p>
          Non-admin members get a one-time welcome card on first sign-in
          so designers and installers aren&apos;t just dropped into
          a dashboard with no orientation.
        </p>
      </>
    ),
  },
  {
    date: "2026-04-03",
    title: "Command palette, pinned records, and cross-tenant switching",
    tags: ["nav", "productivity"],
    body: (
      <>
        <p>
          ⌘K opens a palette for jumping to customers, quotes, orders,
          invoices, and settings without the cursor leaving the
          keyboard. Pin the records you touch daily and they show up
          first.
        </p>
        <p>
          Users who belong to multiple workspaces can switch between
          them from the top-right menu without logging out.
        </p>
      </>
    ),
  },
  {
    date: "2026-03-20",
    title: "Per-branch location scoping",
    tags: ["multi-location"],
    body: (
      <>
        <p>
          Franchise and multi-location shops can now scope a member to
          specific branches. The member only sees customers, quotes,
          orders, and invoices that belong to branches they&apos;re
          assigned to — no cross-branch leakage, no flimsy filtering
          layer on top of shared data.
        </p>
      </>
    ),
  },
  {
    date: "2026-03-05",
    title: "Proof workflow with versioned history",
    tags: ["proofs"],
    body: (
      <>
        <p>
          The proofing system now tracks every round of a proof as a
          distinct version. Customers click once to approve; if they
          request changes, the new version is appended to the history
          rather than overwriting. You can see who approved what and
          when, even six months later.
        </p>
      </>
    ),
  },
  {
    date: "2026-02-20",
    title: "Installer field app + GPS-tagged photo capture",
    tags: ["install"],
    body: (
      <>
        <p>
          The install crew now runs the job from their phone: arrive,
          capture photos of the pre-install condition, execute the
          checklist, capture the customer signature, and submit.
          Photos carry GPS stamps and upload silently in the
          background — no &ldquo;did the install actually happen?&rdquo;
          ambiguity.
        </p>
      </>
    ),
  },
];

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default function ChangelogPage() {
  return (
    <section className="py-16 md:py-20">
      <Container size="md">
        <div
          className="mb-2 text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--accent-primary)" }}
        >
          Changelog
        </div>
        <h1
          className="text-3xl font-semibold tracking-tight md:text-4xl"
          style={{ color: "var(--text-default)" }}
        >
          What&apos;s new in Tracksign.
        </h1>
        <p
          className="mt-3 max-w-2xl text-base leading-relaxed"
          style={{ color: "var(--text-muted)" }}
        >
          Release notes, shipped each week. Want them in your inbox?{" "}
          <a
            href="/#newsletter"
            style={{ color: "var(--accent-primary)" }}
            className="underline"
          >
            Subscribe below.
          </a>
        </p>

        <ol className="mt-14 space-y-14">
          {ENTRIES.map((entry, idx) => (
            <li
              key={idx}
              className="relative pl-8"
              style={{ borderLeft: "1px solid var(--border-subtle)" }}
            >
              <span
                className="absolute -left-[5px] top-1 h-2 w-2 rounded-full"
                style={{ background: "var(--accent-primary)" }}
              />
              <time
                className="block text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-faint)" }}
              >
                {formatDate(entry.date)}
              </time>
              <h2
                className="mt-2 text-xl font-semibold"
                style={{ color: "var(--text-default)" }}
              >
                {entry.title}
              </h2>
              {entry.tags && entry.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {entry.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                      style={{
                        background: "var(--surface-2)",
                        color: "var(--text-muted)",
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <div
                className="mt-4 space-y-3 text-sm leading-relaxed"
                style={{ color: "var(--text-muted)" }}
              >
                {entry.body}
              </div>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
