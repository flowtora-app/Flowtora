import type { Metadata } from "next";
import Link from "next/link";
import { Hero } from "@/components/marketing/Hero";
import { Section } from "@/components/marketing/Section";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { LogoCloud } from "@/components/marketing/LogoCloud";
import { StatRow } from "@/components/marketing/StatRow";
import { Testimonial } from "@/components/marketing/Testimonial";
import { CTA } from "@/components/marketing/CTA";
import { PricingTable } from "@/components/marketing/PricingTable";
import { ComparisonMatrix, type ComparisonRow } from "@/components/marketing/ComparisonMatrix";
import { FAQ } from "@/components/marketing/FAQ";
import { ProductMock } from "@/components/marketing/ProductMock";
import { StickyDemoCTA } from "@/components/marketing/StickyDemoCTA";
import { LANDING_TIERS } from "@/lib/marketing/pricing";

// Phase 5 — public landing page (upgraded).
//
// Narrative:
//   1. Hero — positioning + two CTAs + product mock
//   2. Logo cloud — trust signal
//   3. Product overview — feature grid
//   4. Workflow — 4-step how-it-works
//   5. Industry split
//   6. Comparison — "vs. the usual alternatives"
//   7. Stats
//   8. Testimonial
//   9. Pricing preview
//  10. FAQ — top buyer objections
//  11. Final CTA
//
// Every section answers a question a buyer has already asked in the
// scroll above it. Sticky "Book a demo" CTA trails after the user
// crosses the hero (see StickyDemoCTA).

export const metadata: Metadata = {
  title: "Tracksign — The operating system for sign and print shops",
  description:
    "Run quoting, proofing, production, installs, and invoicing in one shop-floor-grade platform. Trusted by teams who make real things.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Tracksign — Sign and print shop OS",
    description:
      "One platform for CRM, quoting, proofing, production, installs, and invoicing.",
    type: "website",
  },
};

const FEATURES = [
  {
    icon: "✏️",
    title: "Quoting that wins",
    description:
      "Build estimates customers actually understand. Sq-ft and linear-ft pricing, options, and one-click approval.",
    href: "/features",
  },
  {
    icon: "🎨",
    title: "Proof & approve",
    description:
      "Send proofs, capture sign-offs, keep a versioned history of every round. No more chasing email threads.",
    href: "/features",
  },
  {
    icon: "🏭",
    title: "Shop-floor production",
    description:
      "Department boards, checklist-driven jobs, time tracking. See where every job sits, end of day.",
    href: "/features",
  },
  {
    icon: "🚚",
    title: "Install & field",
    description:
      "Route the crew, photograph the job, capture the signature — all from a phone.",
    href: "/features",
  },
  {
    icon: "💳",
    title: "Deposits → paid in full",
    description:
      "Invoice from the same record, accept cards and ACH, reconcile against the order in a click.",
    href: "/features",
  },
  {
    icon: "📊",
    title: "Operational reports",
    description:
      "Revenue by location, WIP aging, rep leaderboards, margin snapshots. Built for the shop owner who hates spreadsheets.",
    href: "/features",
  },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Capture the lead",
    description:
      "Web inquiries, walk-ins, phone calls — every opportunity lands in one pipeline, tagged to the salesperson who owns it.",
  },
  {
    step: "02",
    title: "Quote and approve",
    description:
      "Use your price book to draft a quote in minutes. Send for e-approval; the customer clicks once.",
  },
  {
    step: "03",
    title: "Build it",
    description:
      "The job drops onto the production board. Department leads see what's theirs; nothing gets lost between desks.",
  },
  {
    step: "04",
    title: "Install and bill",
    description:
      "The install crew executes in the field app. Invoice the balance and close the loop — same record, same customer.",
  },
];

// "Tracksign vs. the three common alternatives." We name named-alternatives
// generically — a lawyer-safe, honest framing that still lands the point.
const COMPARISON_ROWS: ComparisonRow[] = [
  {
    capability: "One record from quote to install",
    subcopy: "Customer, quote, proof, order, invoice — same thread, every view.",
    cells: [
      { mark: "yes", note: "Every object linked by design." },
      { mark: "no", note: "Silos + CSV exports." },
      { mark: "partial", note: "Customer + quote, but not production." },
      { mark: "no", note: "Re-keyed into accounting." },
    ],
  },
  {
    capability: "Built-in proofing & versioned approvals",
    subcopy: "Send proof, capture signature, keep every round.",
    cells: [
      { mark: "yes", note: "First-class, audit-trail included." },
      { mark: "no", note: "Email threads + shared drives." },
      { mark: "partial", note: "Add-on, limited history." },
      { mark: "no", note: "Not in scope." },
    ],
  },
  {
    capability: "Shop-floor production board",
    subcopy: "Department queues, checklist-driven jobs, time tracked per station.",
    cells: [
      { mark: "yes", note: "Per-department routing out of the box." },
      { mark: "no", note: "Whiteboard in the back." },
      { mark: "partial", note: "Kanban, but no station logic." },
      { mark: "no", note: "No production concept." },
    ],
  },
  {
    capability: "Install field app (phone-first)",
    subcopy: "Crew executes checklist, captures GPS-tagged photos, gets sig.",
    cells: [
      { mark: "yes", note: "Same account, same record." },
      { mark: "no", note: "Text messages + camera roll." },
      { mark: "no", note: "Add a second app." },
      { mark: "no", note: "Not in scope." },
    ],
  },
  {
    capability: "Deposits, invoices, and payments",
    subcopy: "Card, ACH, reconciled against the same order.",
    cells: [
      { mark: "yes", note: "One-click from order → invoice → paid." },
      { mark: "partial", note: "Invoice tool exists; order linkage is manual." },
      { mark: "partial", note: "Separate billing module." },
      { mark: "yes", note: "Purpose-built for accounting." },
    ],
  },
  {
    capability: "Multi-location, multi-franchise ready",
    subcopy: "Per-branch scoping, shared catalogs, per-branch reporting.",
    cells: [
      { mark: "yes", note: "Designed in, not bolted on." },
      { mark: "no", note: "One sheet per shop." },
      { mark: "partial", note: "Workspaces, no branch scoping." },
      { mark: "partial", note: "Subsidiary bookkeeping, no ops." },
    ],
  },
  {
    capability: "Honest, no-hidden-tier pricing",
    subcopy: "Every plan, every feature, visible on the pricing page.",
    cells: [
      { mark: "yes", note: "Same for year 1 and year 3." },
      { mark: "yes", note: "Free." },
      { mark: "partial", note: "Enterprise = 'call us'." },
      { mark: "partial", note: "Tier-gated essentials." },
    ],
  },
];

// Top objections we hear during sales calls, answered once here so the
// rep's first hour with us is spent on their shop, not our pricing.
const LANDING_FAQ = [
  {
    q: "How is this different from a CRM plus QuickBooks plus a Google Sheet?",
    a: (
      <>
        <p>
          Three systems have three versions of the truth. When a
          customer calls, your rep has to open all three to answer a
          question. Tracksign puts the customer, quote, proof, order,
          install, and invoice on one record — so anyone in the shop
          can answer &ldquo;what&apos;s happening with this job?&rdquo;
          in ten seconds.
        </p>
        <p className="mt-2">
          Full head-to-head:{" "}
          <a href="#compare" className="underline" style={{ color: "var(--accent-primary)" }}>
            see the comparison
          </a>
          .
        </p>
      </>
    ),
  },
  {
    q: "Do I have to replace everything on day one?",
    a: (
      <>
        <p>
          No. Most shops start by moving quoting and proofing in first —
          that&apos;s where the fires live. Production boards and
          invoicing come online over the next week or two. You can keep
          QuickBooks as your accounting ledger indefinitely; we sync
          the invoice + payment data out.
        </p>
      </>
    ),
  },
  {
    q: "How long does onboarding take?",
    a: (
      <>
        <p>
          First quote out the door: 15 minutes. A full working setup
          with your price book, team, customers imported, and
          production boards configured: usually 2–4 hours spread over
          a week. We&apos;ll work with you on a live call if you want.
        </p>
      </>
    ),
  },
  {
    q: "What happens to my data if I leave?",
    a: (
      <>
        <p>
          You export everything, any time, as structured JSON. No
          held-hostage data, no export fees. After cancellation you
          keep export access for 30 days, and we permanently delete on
          your timeline.
        </p>
        <p className="mt-2">
          <a href="/security" className="underline" style={{ color: "var(--accent-primary)" }}>
            Read the full security & data-handling page →
          </a>
        </p>
      </>
    ),
  },
  {
    q: "How do you price?",
    a: (
      <>
        <p>
          Flat monthly pricing per workspace, with included seats on
          every tier. No per-user gotchas, no &ldquo;enterprise quote&rdquo;
          tax. See the{" "}
          <a href="/pricing" className="underline" style={{ color: "var(--accent-primary)" }}>
            full plan comparison
          </a>
          . If you run more than one shop, annual billing gets a 15%
          discount; multi-location franchises get a franchise plan —
          talk to us.
        </p>
      </>
    ),
  },
  {
    q: "What if I need something you don't have?",
    a: (
      <>
        <p>
          Tell us. We publish a public roadmap and a{" "}
          <a href="/changelog" className="underline" style={{ color: "var(--accent-primary)" }}>
            weekly changelog
          </a>
          . Things customers actually need — not hypothetical enterprise
          RFPs — move to the top of the queue. The core team works
          directly with accounts on pilot features.
        </p>
      </>
    ),
  },
  {
    q: "Can you connect to QuickBooks / Xero / our accountant's tool?",
    a: (
      <>
        <p>
          QuickBooks Online sync is in beta. Xero is on the near-term
          roadmap. For everything else we publish a standard CSV export
          that your accountant is already used to.
        </p>
      </>
    ),
  },
];

export default function LandingPage() {
  return (
    <>
      <Hero
        eyebrow={<>✨ Built for teams who make real things</>}
        title={<>Run your shop end-to-end, from lead to last coat.</>}
        description={
          <>
            Tracksign unifies quoting, proofing, production, installs, and
            invoicing in one system built for sign shops, print shops, and
            custom-fab studios.
          </>
        }
        primary={{ label: "Start free 14-day trial", href: "/signup" }}
        secondary={{ label: "Book a demo", href: "/book-demo" }}
        footnote="No credit card required · Full platform access · Cancel anytime"
        visual={<ProductMock className="mx-auto mt-4 max-w-4xl" />}
      />

      <LogoCloud
        label="Built with input from shops running"
        logos={["Flatbed UV", "Routers", "Vinyl", "Laser", "CNC", "Install crews"]}
      />

      <Section
        eyebrow="What you get"
        title="A purpose-built platform, not a CRM glued to a billing tool."
        description="Every screen is designed for the way sign and print shops actually work — not adapted from a SaaS stack for agencies or ecommerce."
        align="center"
      >
        <FeatureGrid features={FEATURES} columns={3} />
      </Section>

      <Section
        muted
        eyebrow="The shop workflow"
        title="From inquiry to installed — without switching apps."
        description="Four steps, one record. The customer, the quote, the order, and the invoice are all the same thread of work."
        align="center"
      >
        <ol className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.map((step) => (
            <li
              key={step.step}
              className="rounded-xl p-6"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}
            >
              <div
                className="text-xs font-semibold tracking-widest"
                style={{ color: "var(--accent-primary)" }}
              >
                {step.step}
              </div>
              <div className="mt-2 text-base font-semibold" style={{ color: "var(--text-default)" }}>
                {step.title}
              </div>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </Section>

      <Section eyebrow="Built for your shop" title="One platform, tuned for how you make things." align="center">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <IndustryCard
            title="For sign shops"
            description="Sq-ft pricing, illumination and mounting options, install routing, and shop-floor boards for routers, printers, and finishers."
            href="/for-sign-shops"
          />
          <IndustryCard
            title="For print shops"
            description="Linear-ft, sheet, and job-based pricing; bleed-aware proofs; production queues for flatbed, wide-format, and finishing."
            href="/for-print-shops"
          />
        </div>
      </Section>

      <Section
        id="compare"
        muted
        eyebrow="vs. the usual alternatives"
        title="One system vs. the patchwork you're running today."
        description="Most shops we talk to are piecing together 3–4 tools. Here's what that actually costs you — and what changes when the record stops splitting."
        align="center"
      >
        <ComparisonMatrix
          competitors={["Spreadsheets + email", "Generic CRM", "Accounting-only"]}
          rows={COMPARISON_ROWS}
        />
      </Section>

      <Section padding="sm">
        <StatRow
          stats={[
            { value: "4×", label: "faster quote-to-approval" },
            { value: "31%", label: "higher deposit capture" },
            { value: "0", label: "double-entry between apps" },
            { value: "1", label: "customer record, from lead to last dollar" },
          ]}
        />
      </Section>

      <Section align="center">
        <div className="mx-auto max-w-3xl">
          <Testimonial
            quote="We replaced three tools with Tracksign and finally have a single place to look. Our install crews know what's coming up next and our AR dropped by 22 days."
            author="Placeholder Name"
            role="Owner"
            company="Placeholder Signs Co."
          />
        </div>
      </Section>

      <Section
        muted
        eyebrow="Pricing"
        title="Simple plans, real value."
        description="Start on the free trial. No credit card required. Upgrade when you're ready."
        align="center"
      >
        <PricingTable tiers={LANDING_TIERS} />
        <div className="mt-10 text-center">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1 text-sm font-medium"
            style={{ color: "var(--accent-primary)" }}
          >
            Compare every feature →
          </Link>
        </div>
      </Section>

      <Section
        eyebrow="Common questions"
        title="Things buyers ask us, answered up front."
        description="If yours isn't here, ping us on the contact page or just book a demo."
        align="center"
        narrow
      >
        <FAQ items={LANDING_FAQ} />
      </Section>

      <CTA
        eyebrow="Ready when you are"
        title="Spin up your shop in 15 minutes."
        description="Import your customers, set your pricing, and send your first quote — today."
        primary={{ label: "Start free trial", href: "/signup" }}
        secondary={{ label: "Book a demo", href: "/book-demo" }}
      />

      {/* Sticky CTA after first scroll. Skipped on /book-demo and /contact. */}
      <StickyDemoCTA />
    </>
  );
}

function IndustryCard({ title, description, href }: { title: string; description: string; href: string }) {
  return (
    <Link
      href={href}
      className="group block rounded-xl p-8 transition-colors hover:brightness-110"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div className="text-xl font-semibold" style={{ color: "var(--text-default)" }}>
        {title}
      </div>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
        {description}
      </p>
      <span
        className="mt-4 inline-flex items-center gap-1 text-sm font-medium"
        style={{ color: "var(--accent-primary)" }}
      >
        Explore →
      </span>
    </Link>
  );
}
