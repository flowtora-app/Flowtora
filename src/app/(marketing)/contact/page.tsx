import type { Metadata } from "next";
import { Section } from "@/components/marketing/Section";
import { Container } from "@/components/marketing/Container";
import { ContactForm } from "@/components/marketing/ContactForm";

// Phase 7 — /contact.
//
// 4-part structure per the marketing redesign plan:
//   1. Compact hero
//   2. Two-column (form + 3 stacked sidebar cards: Demo / Sales / Support)
//   3. HQ strip — humanizes the form; single full-width row
//   4. Trust strip — "reply in 4 business hours · SOC-2-ready · your data stays yours"
//
// The sidebar used to carry the HQ card too, but the plan calls for HQ
// to live as its own strip (full width, below the form) so the page
// gets a horizontal rhythm instead of two tall columns.

export const metadata: Metadata = {
  title: "Contact — Flowtora",
  description:
    "Questions about Flowtora? Book a demo, talk to sales, or get support. We respond within one business day.",
  openGraph: {
    title: "Contact Flowtora",
    description: "Book a demo, talk to sales, or get support.",
    type: "website",
  },
};

const CONTACT_PATHS = [
  {
    eyebrow: "Demo",
    title: "Book a walkthrough",
    description:
      "A 30-minute walkthrough tailored to your shop. We'll use your pricing and your workflow, not a scripted demo.",
    action: { label: "Schedule a demo", href: "/book-demo" },
  },
  {
    eyebrow: "Sales",
    title: "Talk to sales",
    description:
      "Pricing, seats, or enterprise questions? We'll pair you with someone who knows signs and print, not just software.",
    action: { label: "sales@flowtora.com", href: "mailto:sales@flowtora.com" },
  },
  {
    eyebrow: "Support",
    title: "Existing customer?",
    description:
      "Send questions to support — we reply within four business hours, or same-hour for Enterprise SLAs.",
    action: {
      label: "support@flowtora.com",
      href: "mailto:support@flowtora.com",
    },
  },
];

const TRUST_ITEMS = [
  {
    title: "Reply in 4 business hours",
    detail: "A real human reads every inquiry and routes it the same day.",
  },
  {
    title: "SOC-2-ready by design",
    detail: "RBAC, audit logs, 2FA, encrypted at rest and in transit.",
  },
  {
    title: "Your data stays yours",
    detail: "No data resale, no cross-tenant training — export anytime.",
  },
];

export default function ContactPage() {
  return (
    <>
      <section className="relative overflow-hidden pb-12 pt-20 md:pb-16 md:pt-24">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-64"
          style={{
            background:
              "radial-gradient(ellipse at 50% 0%, var(--accent-surface) 0%, transparent 60%)",
          }}
        />
        <Container size="lg" className="relative">
          <div className="mx-auto max-w-2xl text-center">
            <span
              className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
              style={{
                background: "var(--accent-surface)",
                color: "var(--accent-primary)",
                border: "1px solid var(--accent-surface-strong)",
              }}
            >
              We&apos;d love to hear from you
            </span>
            <h1
              className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight md:text-5xl"
              style={{ color: "var(--text-default)" }}
            >
              Let&apos;s talk about your shop.
            </h1>
            <p
              className="mx-auto mt-4 max-w-xl text-lg leading-relaxed"
              style={{ color: "var(--text-muted)" }}
            >
              Drop us a note below — a real human will reply within four
              business hours. Prefer email? Jump straight to one of the
              addresses on the right.
            </p>
          </div>
        </Container>
      </section>

      <Section padding="sm">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-5">
          <div
            className="rounded-xl p-6 md:p-8 lg:col-span-3"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <h2
              className="text-xl font-semibold"
              style={{ color: "var(--text-default)" }}
            >
              Tell us what you need
            </h2>
            <p
              className="mt-1 text-sm"
              style={{ color: "var(--text-muted)" }}
            >
              We read every inquiry and route it to the right person.
            </p>
            <div className="mt-6">
              <ContactForm />
            </div>
          </div>

          <div className="space-y-5 lg:col-span-2">
            {CONTACT_PATHS.map((path) => (
              <div
                key={path.eyebrow}
                className="rounded-xl p-6"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--accent-primary)" }}
                >
                  {path.eyebrow}
                </div>
                <h3
                  className="mt-2 text-base font-semibold"
                  style={{ color: "var(--text-default)" }}
                >
                  {path.title}
                </h3>
                <p
                  className="mt-2 text-sm leading-relaxed"
                  style={{ color: "var(--text-muted)" }}
                >
                  {path.description}
                </p>
                <a
                  href={path.action.href}
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium"
                  style={{ color: "var(--accent-primary)" }}
                >
                  {path.action.label} →
                </a>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* HQ strip */}
      <Section padding="sm">
        <div
          className="rounded-2xl p-6 md:p-8"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div className="grid grid-cols-1 gap-6 md:grid-cols-4 md:items-center">
            <div className="md:col-span-2">
              <div
                className="text-xs font-semibold uppercase tracking-[0.12em]"
                style={{ color: "var(--accent-primary)" }}
              >
                Headquarters
              </div>
              <div
                className="mt-2 text-lg font-semibold tracking-tight md:text-xl"
                style={{ color: "var(--text-default)" }}
              >
                Flowtora, Inc. — remote-first, US-based
              </div>
              <div
                className="mt-1 text-sm leading-relaxed"
                style={{ color: "var(--text-muted)" }}
              >
                We&apos;re distributed across North America with a small crew.
                Real humans, not a call center.
              </div>
            </div>

            <div>
              <div
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                Hours
              </div>
              <div
                className="mt-1 text-sm"
                style={{ color: "var(--text-default)" }}
              >
                Monday – Friday
                <br />
                8am – 6pm Central
              </div>
            </div>

            <div>
              <div
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                Mailing
              </div>
              <div
                className="mt-1 text-sm"
                style={{ color: "var(--text-default)" }}
              >
                hello@flowtora.com
                <br />
                <span style={{ color: "var(--text-muted)" }}>
                  Postal on request
                </span>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* Trust strip */}
      <Section padding="sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {TRUST_ITEMS.map((item) => (
            <div
              key={item.title}
              className="rounded-xl p-5"
              style={{
                background: "var(--surface-0)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold"
                  style={{
                    background: "var(--success-surface)",
                    color: "var(--success-fg)",
                  }}
                >
                  ✓
                </span>
                <div
                  className="text-sm font-semibold"
                  style={{ color: "var(--text-default)" }}
                >
                  {item.title}
                </div>
              </div>
              <p
                className="mt-2 text-sm leading-relaxed"
                style={{ color: "var(--text-muted)" }}
              >
                {item.detail}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs">
          <a
            href="/security"
            className="font-medium"
            style={{ color: "var(--accent-primary)" }}
          >
            Security overview →
          </a>
          <a
            href="/legal"
            className="font-medium"
            style={{ color: "var(--accent-primary)" }}
          >
            DPA &amp; legal →
          </a>
          <a
            href="/changelog"
            className="font-medium"
            style={{ color: "var(--accent-primary)" }}
          >
            What we shipped →
          </a>
        </div>
      </Section>
    </>
  );
}
