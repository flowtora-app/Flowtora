import type { Metadata } from "next";
import Link from "next/link";
import { Hero } from "@/components/marketing/Hero";
import { Section } from "@/components/marketing/Section";
import { PricingToggle } from "@/components/marketing/PricingToggle";
import { PricingCompareTable, type CompareCategory } from "@/components/marketing/PricingCompareTable";
import { FAQ } from "@/components/marketing/FAQ";
import { CTA } from "@/components/marketing/CTA";
import { FULL_TIERS } from "@/lib/marketing/pricing";

// Pricing page (Phase 4 upgrade).
//
// Structure:
//   1. Hero + monthly/yearly toggle (20% off yearly)
//   2. 3 tier cards (PricingTable via PricingToggle)
//   3. Grouped feature-comparison table with sticky category headers
//   4. Enterprise / Custom strip
//   5. Pricing-objection FAQ (6 items focused on the money questions)
//   6. Final CTA
//
// The comparison table is purpose-built here (not shared with /features)
// because it's tier-vs-tier, not vs.-competitor. Categories match the
// high-level capability buckets the buyer cares about.

export const metadata: Metadata = {
  title: "Pricing — Flowtora",
  description:
    "Simple plans that scale with your shop. Starter for single-location teams, Pro for growing operations, Enterprise for multi-location franchise networks.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Flowtora pricing",
    description:
      "Starter, Pro, and Enterprise. 14-day free trial, no credit card required. Save 20% annually.",
    type: "website",
  },
};

// Feature-by-feature comparison. Each row compares what Starter /
// Pro / Enterprise get. Cells may be boolean, literal string, or
// { text, highlight } to emphasize an upgrade moment. Length of
// `cells` must equal `tiers.length` (= 3).
const COMPARE_CATEGORIES: CompareCategory[] = [
  {
    title: "Seats & workspaces",
    rows: [
      {
        label: "User seats",
        detail: "Customer-portal logins are free and don't count toward the limit.",
        cells: ["3 seats", "15 seats", { text: "Unlimited", highlight: true }],
      },
      {
        label: "Extra seats",
        cells: ["not available", "$12 /seat /mo", "included"],
      },
      {
        label: "Locations / branches",
        cells: ["1", "up to 3", { text: "Unlimited", highlight: true }],
      },
      {
        label: "Franchise / group hierarchy",
        cells: [false, false, true],
      },
    ],
  },
  {
    title: "Core workflow",
    rows: [
      {
        label: "Customer & project records",
        cells: ["Unlimited", "Unlimited", "Unlimited"],
      },
      {
        label: "Quotes & proposals",
        cells: ["Unlimited", "Unlimited", "Unlimited"],
      },
      {
        label: "Proofs & e-approval",
        cells: [true, true, true],
      },
      {
        label: "Invoices & payments",
        cells: [true, true, true],
      },
      {
        label: "Customer portal (branded)",
        cells: ["Subdomain", "Subdomain", { text: "Custom domain", highlight: true }],
      },
    ],
  },
  {
    title: "Production & field",
    rows: [
      {
        label: "Production boards (department queues)",
        cells: [false, true, true],
      },
      {
        label: "Install routing + mobile field app",
        cells: [false, true, true],
      },
      {
        label: "Station time tracking",
        cells: [false, true, true],
      },
      {
        label: "WIP aging alerts",
        cells: [false, true, true],
      },
    ],
  },
  {
    title: "Analytics",
    rows: [
      {
        label: "Basic reports (revenue, pipeline)",
        cells: [true, true, true],
      },
      {
        label: "Margin analytics",
        cells: [false, true, true],
      },
      {
        label: "Saved views + scheduled delivery",
        cells: [false, true, true],
      },
      {
        label: "Cross-location roll-up",
        cells: [false, false, true],
      },
    ],
  },
  {
    title: "Platform & admin",
    rows: [
      {
        label: "Audit log",
        cells: ["30 days", "1 year", { text: "Unlimited", highlight: true }],
      },
      {
        label: "RBAC",
        cells: ["Basic", "Standard", { text: "Advanced + branch scoping", highlight: true }],
      },
      {
        label: "Workflow automations",
        cells: [false, "50/mo", { text: "Unlimited", highlight: true }],
      },
      {
        label: "API + webhooks",
        cells: [false, "Read-only", { text: "Full read/write", highlight: true }],
      },
      {
        label: "SSO / SAML",
        cells: [false, false, true],
      },
    ],
  },
  {
    title: "Support",
    rows: [
      {
        label: "Channel",
        cells: ["Email", "Email + chat", "Email + chat + phone"],
      },
      {
        label: "Response SLA",
        cells: ["24 business hrs", "8 business hrs", "4 business hrs"],
      },
      {
        label: "Dedicated success manager",
        cells: [false, false, true],
      },
      {
        label: "Onboarding",
        cells: ["Self-serve", "Guided call", { text: "White-glove + training", highlight: true }],
      },
    ],
  },
];

// Pricing-objection FAQ. Six items — the money / transition questions
// that block a signup. Product / capability questions live on the
// home page FAQ and /features comparison matrix.
const PRICING_FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "How does the free trial work?",
    a: (
      <>
        <p>
          Every plan gets a full-access 14-day trial. No credit card
          required. You can invite your team, import customers, and
          send real quotes during the trial — nothing is demo-mode.
          At the end you pick a plan (or walk away and your data is
          safe for 30 days).
        </p>
      </>
    ),
  },
  {
    q: "What counts as a seat?",
    a: (
      <>
        <p>
          A seat is one human who logs in — salespeople, production
          leads, installers, admins. Customers who use the portal to
          approve proofs or pay invoices are always free. Field-crew
          members share a seat if they use the same login.
        </p>
      </>
    ),
  },
  {
    q: "Can I change plans later?",
    a: (
      <>
        <p>
          Upgrade anytime; the difference is pro-rated to the day.
          Downgrade at your next renewal so you keep paid features
          through the period you already paid for. Cancel anytime —
          we don&apos;t do lock-in contracts outside of Enterprise
          annual agreements you explicitly sign.
        </p>
      </>
    ),
  },
  {
    q: "How does annual billing save 20%?",
    a: (
      <>
        <p>
          Commit for a year, pay up front, get two-point-four months
          free. Enterprise customers can arrange invoice-based net-30
          billing instead. Nonprofits and schools get an additional
          30% off any plan — send us your 501(c)(3) letter or
          institutional email from{" "}
          <Link
            href="/contact"
            className="underline"
            style={{ color: "var(--accent-primary)" }}
          >
            the contact page
          </Link>
          .
        </p>
      </>
    ),
  },
  {
    q: "What happens to my data if I cancel?",
    a: (
      <>
        <p>
          It&apos;s yours. You can export everything (customers,
          quotes, orders, invoices, proofs) as structured CSV or JSON
          any time — no export fees, no &ldquo;premium export&rdquo;
          tier. After cancellation we retain your records for 30 days
          in case you come back, then permanently delete per your
          request.
        </p>
        <p className="mt-2">
          Read the full{" "}
          <Link
            href="/security"
            className="underline"
            style={{ color: "var(--accent-primary)" }}
          >
            security &amp; data-handling page →
          </Link>
        </p>
      </>
    ),
  },
  {
    q: "Do you offer multi-location or franchise pricing?",
    a: (
      <>
        <p>
          Pro includes up to 3 locations under one account.
          Enterprise unlocks unlimited locations, franchise-group
          hierarchy, central billing roll-up, branch-scoped RBAC, and
          SSO. We price franchise networks per-location with a
          network discount — reach out and we&apos;ll quote your
          specific shape.
        </p>
      </>
    ),
  },
];

export default function PricingPage() {
  return (
    <>
      <Hero
        eyebrow={<>Simple, transparent pricing</>}
        title={<>Plans that scale from a single shop to a franchise network.</>}
        description={
          <>
            Start on the 14-day free trial. No credit card required. Upgrade,
            downgrade, or cancel anytime — we don&apos;t do lock-in.
          </>
        }
        primary={{ label: "Start free trial", href: "/signup" }}
        secondary={{ label: "Book a demo", href: "/book-demo" }}
        footnote="All plans include unlimited customers, quotes, and invoices. Save 20% on annual billing."
      />

      <Section padding="sm">
        <PricingToggle tiers={FULL_TIERS} />
      </Section>

      <Section
        muted
        eyebrow="Every feature, every plan"
        title="Compare plans side by side."
        description="The full feature matrix. Seats, workflow, production, analytics, platform, and support — all laid out so you can pick the tier that fits your shop."
        align="center"
      >
        <PricingCompareTable
          tiers={[
            { name: "Starter", tagline: "$79 /mo" },
            { name: "Pro", tagline: "$199 /mo", highlight: true },
            { name: "Enterprise", tagline: "Custom" },
          ]}
          categories={COMPARE_CATEGORIES}
        />
      </Section>

      {/* Enterprise / Custom strip — answers "we need something you
          don't show on the table" without sending people to the
          contact page cold. */}
      <Section padding="md">
        <div
          className="relative overflow-hidden rounded-2xl p-8 md:p-10"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in oklab, var(--accent-surface) 60%, var(--surface-1)) 0%, var(--surface-1) 60%)",
            border: "1px solid var(--border-default)",
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full"
            style={{
              background: "var(--accent-surface-strong)",
              filter: "blur(80px)",
              opacity: 0.5,
            }}
          />
          <div className="relative grid grid-cols-1 items-center gap-6 md:grid-cols-[1.3fr_1fr]">
            <div>
              <div
                className="text-xs font-semibold uppercase tracking-[0.12em]"
                style={{ color: "var(--accent-primary)" }}
              >
                Enterprise &amp; franchise
              </div>
              <h3
                className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl"
                style={{ color: "var(--text-default)" }}
              >
                Running 4+ locations? We&apos;ll build your plan.
              </h3>
              <p
                className="mt-3 max-w-xl text-sm leading-relaxed md:text-base"
                style={{ color: "var(--text-muted)" }}
              >
                Franchise-group hierarchy, central billing roll-up,
                branch-scoped RBAC, SSO, custom onboarding, and a
                named success manager. Talk to us about volume pricing.
              </p>
            </div>
            <div className="flex flex-col gap-3 md:items-end">
              <Link
                href="/contact"
                className="inline-flex h-11 items-center rounded-md px-6 text-sm font-semibold transition-colors hover:brightness-110"
                style={{
                  background: "var(--accent-primary)",
                  color: "var(--accent-fg)",
                }}
              >
                Talk to sales
              </Link>
              <Link
                href="/book-demo"
                className="inline-flex h-11 items-center rounded-md px-6 text-sm font-medium transition-colors"
                style={{
                  background: "var(--surface-1)",
                  color: "var(--text-default)",
                  border: "1px solid var(--border-default)",
                }}
              >
                Book a demo
              </Link>
            </div>
          </div>
        </div>
      </Section>

      <Section
        muted
        eyebrow="Pricing questions"
        title="Answers to the money questions buyers actually ask."
        align="center"
        narrow
      >
        <FAQ items={PRICING_FAQ} />
        <div className="mt-12 text-center">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Still have questions?{" "}
            <Link
              href="/contact"
              className="font-medium"
              style={{ color: "var(--accent-primary)" }}
            >
              Talk to our team →
            </Link>
          </p>
        </div>
      </Section>

      <CTA
        eyebrow="Ready to try it?"
        title="Your free trial takes about 15 minutes to set up."
        description="Import your customers, seed your price book, send your first quote — today."
        primary={{ label: "Start free trial", href: "/signup" }}
        secondary={{ label: "Book a demo", href: "/book-demo" }}
      />
    </>
  );
}
