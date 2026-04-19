import type { Metadata } from "next";
import Link from "next/link";
import { Hero } from "@/components/marketing/Hero";
import { Section } from "@/components/marketing/Section";
import { PricingToggle } from "@/components/marketing/PricingToggle";
import { CTA } from "@/components/marketing/CTA";
import { FULL_TIERS } from "@/lib/marketing/pricing";

// Phase 18 Slice C — /pricing.
//
// The detailed pricing page. Landing only teases plans; here we expose
// the full per-feature matrix via FULL_TIERS and a monthly/annual
// toggle. FAQ answers the three questions every prospect asks before
// swiping their card.

export const metadata: Metadata = {
  title: "Pricing — Flowtora",
  description:
    "Simple plans that scale with your shop. Starter for single-location teams, Pro for growing operations, Enterprise for multi-location franchise networks.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Flowtora pricing",
    description:
      "Starter, Pro, and Enterprise plans. 14-day free trial, no credit card required.",
    type: "website",
  },
};

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "Is there a free trial?",
    a: (
      <>
        Yes — every plan includes a 14-day free trial with full platform
        access. No credit card required to start. You can invite your team,
        import customers, and send real quotes during the trial.
      </>
    ),
  },
  {
    q: "Can I change plans later?",
    a: (
      <>
        Anytime. Upgrades take effect immediately and we pro-rate the
        difference. Downgrades take effect at the next renewal so you keep
        paid features through the period you already paid for.
      </>
    ),
  },
  {
    q: "What counts as a user seat?",
    a: (
      <>
        A seat is one active login — salespeople, production leads,
        installers, admins. Customers using the portal to approve proofs or
        pay invoices don&apos;t count as seats; they&apos;re always free.
      </>
    ),
  },
  {
    q: "Do you offer discounts for nonprofits or educational institutions?",
    a: (
      <>
        Yes, qualifying nonprofits and schools get 30% off any plan.{" "}
        <Link href="/contact" style={{ color: "var(--accent-primary)" }}>
          Contact us
        </Link>{" "}
        with your 501(c)(3) letter or institutional email and we&apos;ll
        apply the discount to your account.
      </>
    ),
  },
  {
    q: "How does billing work?",
    a: (
      <>
        We bill monthly or annually via credit card or ACH. Annual plans
        save roughly 17% vs. month-to-month. Enterprise customers can
        request invoice-based billing with net-30 terms.
      </>
    ),
  },
  {
    q: "What happens to my data if I cancel?",
    a: (
      <>
        Your data is yours. You can export customers, quotes, orders, and
        invoices to CSV at any time. After cancellation we retain your
        records for 30 days in case you come back, then permanently delete.
      </>
    ),
  },
  {
    q: "Do you support multiple locations or franchise groups?",
    a: (
      <>
        Pro supports up to 3 locations under one account. Enterprise
        unlocks unlimited locations, franchise-group hierarchy, central
        billing roll-up, and branch-scoped roles. Each location gets its
        own queues, price book, and reports.
      </>
    ),
  },
  {
    q: "How does SSO / SAML work?",
    a: (
      <>
        Enterprise plans include SSO via SAML 2.0 or OIDC. We support
        Okta, Azure AD, Google Workspace, and any standards-compliant
        identity provider. Just-in-time user provisioning and SCIM are
        included.
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
        footnote="All plans include unlimited customers, quotes, orders, and invoices."
      />

      <Section padding="sm">
        <PricingToggle tiers={FULL_TIERS} />
      </Section>

      <Section
        muted
        eyebrow="What's included"
        title="Every plan ships with the full Flowtora foundation."
        description="We don't gate the basics. Every customer gets quoting, proofing, payments, and the customer portal — because a half-working shop is no shop at all."
        align="center"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          <IncludedItem label="Unlimited customers" />
          <IncludedItem label="Unlimited quotes & invoices" />
          <IncludedItem label="Customer portal + e-approval" />
          <IncludedItem label="Stripe + bank-transfer payments" />
          <IncludedItem label="Deposit + full-payment flows" />
          <IncludedItem label="Email templates & library" />
          <IncludedItem label="Mobile-responsive everywhere" />
          <IncludedItem label="Daily backups + audit log" />
          <IncludedItem label="Human support by email" />
        </div>
      </Section>

      <Section
        eyebrow="Frequently asked questions"
        title="Answers to what prospects actually ask."
        align="center"
        narrow
      >
        <div className="mt-4 space-y-4">
          {FAQ.map((item) => (
            <FAQItem key={item.q} q={item.q} a={item.a} />
          ))}
        </div>
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

function IncludedItem({ label }: { label: string }) {
  return (
    <div
      className="flex items-center gap-3 rounded-lg px-4 py-3"
      style={{
        background: "var(--surface-0)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <span
        aria-hidden
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px]"
        style={{ background: "var(--success-surface)", color: "var(--success-fg)" }}
      >
        ✓
      </span>
      <span className="text-sm" style={{ color: "var(--text-default)" }}>
        {label}
      </span>
    </div>
  );
}

function FAQItem({ q, a }: { q: string; a: React.ReactNode }) {
  return (
    <details
      className="group rounded-xl p-5"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <summary
        className="flex cursor-pointer items-center justify-between gap-4 text-base font-medium"
        style={{ color: "var(--text-default)" }}
      >
        <span>{q}</span>
        <span
          aria-hidden
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs transition-transform group-open:rotate-45"
          style={{
            background: "var(--surface-2)",
            color: "var(--text-muted)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          +
        </span>
      </summary>
      <div
        className="mt-3 text-sm leading-relaxed"
        style={{ color: "var(--text-muted)" }}
      >
        {a}
      </div>
    </details>
  );
}
