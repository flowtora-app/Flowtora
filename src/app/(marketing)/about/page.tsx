import type { Metadata } from "next";
import { Hero } from "@/components/marketing/Hero";
import { Section } from "@/components/marketing/Section";
import { StatRow } from "@/components/marketing/StatRow";
import { CTA } from "@/components/marketing/CTA";

// Phase 5 — /about.
//
// Company page. For a premium SaaS in a craft vertical (sign & print
// shops), "who is building this" matters. Owners want to know the team
// understands a chop saw from a plotter before they hand over their
// book of business.
//
// Structure:
//   1. Hero — "why we built this"
//   2. Values — three concrete commitments
//   3. Origin story — paragraph with specifics
//   4. What we won't build — distinguishing positioning
//   5. CTA

export const metadata: Metadata = {
  title: "About Flowtora",
  description:
    "Built by a small team who grew up around vinyl cutters and UV printers. We make shop software that respects how real shops actually work.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About Flowtora",
    description:
      "A shop-floor-first SaaS for sign and print shops, built by people who've been in one.",
    type: "website",
  },
};

const VALUES = [
  {
    title: "The shop floor is the source of truth",
    body: "Every feature starts with a question asked at a desk covered in vinyl scraps, not a product-strategy deck. If a sales rep can't quote it in under two minutes or an installer can't log it from a phone in the cab of a truck, we built the wrong thing.",
  },
  {
    title: "Own your data. Own your pricing. Own your customers.",
    body: "Export everything, any time. Nothing is locked behind a tier that costs 3× more. We price like a business that wants to earn the next year, not squeeze out this one.",
  },
  {
    title: "Respect the craft",
    body: "Sign-making and printing are physical, detail-heavy, occasionally-finicky trades. We'd rather build software that disappears into the workflow than software that screams \"transformation\". Stability over novelty, every day.",
  },
];

const NOT_BUILDING = [
  {
    title: "Generic CRM features shoved at a shop.",
    body: "We don't chase feature parity with every SaaS in our sidebar. If a \"deal pipeline\" visualization doesn't help a shop close more jobs this quarter, we'd rather not build it.",
  },
  {
    title: "\"AI-powered\" everything.",
    body: "Language models are useful in a few specific places (drafting a proof-approval email, summarizing an install-day photo thread) and annoying in most others. We pick the places and we say when.",
  },
  {
    title: "A pricing page that gets worse over time.",
    body: "No surprise per-seat fees, no \"enterprise\" tier that requires a sales call to see prices, no silent downgrades of what your plan included last year.",
  },
];

export default function AboutPage() {
  return (
    <>
      <Hero
        eyebrow="About Flowtora"
        title={<>Built by people who grew up around print heads and plotters.</>}
        description={
          <>
            We started Flowtora because the shops we&apos;d worked at were
            running on a tangle of spreadsheets, shared inboxes, and a
            QuickBooks file nobody wanted to open. It was making good
            people&apos;s jobs harder than they needed to be. We decided
            to fix it.
          </>
        }
        primary={{ label: "Book a demo", href: "/book-demo" }}
        secondary={{ label: "See pricing", href: "/pricing" }}
      />

      <Section muted padding="sm">
        <StatRow
          stats={[
            { value: "Remote", label: "Distributed team across 3 timezones" },
            { value: "Shop-side", label: "Founders who've run a plotter past midnight" },
            { value: "One", label: "Product, one focus — nothing else for sale" },
            { value: "Open", label: "Weekly 'What are we shipping?' changelog" },
          ]}
        />
      </Section>

      <Section
        eyebrow="What we believe"
        title="Three commitments we'll keep."
        align="center"
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {VALUES.map((v) => (
            <div
              key={v.title}
              className="rounded-xl p-6"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div
                className="text-base font-semibold"
                style={{ color: "var(--text-default)" }}
              >
                {v.title}
              </div>
              <p
                className="mt-2 text-sm leading-relaxed"
                style={{ color: "var(--text-muted)" }}
              >
                {v.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        muted
        eyebrow="Origin"
        title="Why we're building what we're building."
        narrow
      >
        <div
          className="space-y-5 text-base leading-relaxed"
          style={{ color: "var(--text-muted)" }}
        >
          <p>
            The first version of Flowtora lived on a napkin in a
            breakroom. A shop owner had just spent forty minutes looking
            for a proof approval that three different customers swore
            they had sent. The approval was in an email thread that had
            been forwarded, replied to, and eventually dropped into a
            shared drive folder nobody remembered creating. By the time
            anyone found it, the install was a day late and the
            customer was furious — at the wrong person.
          </p>
          <p>
            That kind of avoidable chaos is the default in this
            industry. Every shop we talk to has their own baroque
            system for dealing with it: color-coded sticky notes on a
            whiteboard, a magic spreadsheet maintained by one person
            who&apos;s either on vacation or thinking about leaving, a
            Shopify checkout hacked to kind-of look like an invoice.
          </p>
          <p>
            Flowtora exists to end the workaround tax. One place for
            the customer, the quote, the proof, the order, the install,
            and the invoice — each linked to the next, every state
            visible to everyone who needs it, nothing to re-enter.
          </p>
          <p>
            We&apos;re a small team. We&apos;ll stay small longer than
            investors tell us is sensible. The product will stay
            tightly focused on shops. That&apos;s the bet.
          </p>
        </div>
      </Section>

      <Section
        eyebrow="What we won't build"
        title="Positioning, by omission."
        description="Saying no is a feature. Here's where we say it."
        align="center"
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {NOT_BUILDING.map((v) => (
            <div
              key={v.title}
              className="rounded-xl p-6"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div
                className="text-base font-semibold"
                style={{ color: "var(--text-default)" }}
              >
                {v.title}
              </div>
              <p
                className="mt-2 text-sm leading-relaxed"
                style={{ color: "var(--text-muted)" }}
              >
                {v.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <CTA
        eyebrow="See what we've built"
        title="Spin up your shop, today."
        description="14-day trial, no credit card. Or book a live walkthrough if you'd rather have a guide."
        primary={{ label: "Start free trial", href: "/signup" }}
        secondary={{ label: "Book a demo", href: "/book-demo" }}
      />
    </>
  );
}
