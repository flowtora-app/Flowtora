import type { Metadata } from "next";
import { Section } from "@/components/marketing/Section";
import { Container } from "@/components/marketing/Container";
import { ContactForm } from "@/components/marketing/ContactForm";

// Phase 18 Slice C — /contact.
//
// Split layout: form on the left, talking points + alt-contact on the
// right. We deliberately offer three paths (sales, support, careers)
// so people with the wrong request still land somewhere reasonable.

export const metadata: Metadata = {
  title: "Contact — Tracksign",
  description:
    "Questions about Tracksign? Book a demo, talk to sales, or get support. We respond within one business day.",
  openGraph: {
    title: "Contact Tracksign",
    description: "Book a demo, talk to sales, or get support.",
    type: "website",
  },
};

const CONTACT_PATHS = [
  {
    eyebrow: "Sales",
    title: "Book a demo",
    description:
      "A 30-minute walkthrough tailored to your shop. We'll use your pricing and your workflow, not a scripted demo.",
    action: { label: "sales@tracksign.com", href: "mailto:sales@tracksign.com" },
  },
  {
    eyebrow: "Support",
    title: "Need a hand with your account?",
    description:
      "Existing customer? Send questions to support — we respond within one business day, or same-hour for Enterprise SLAs.",
    action: { label: "support@tracksign.com", href: "mailto:support@tracksign.com" },
  },
  {
    eyebrow: "Careers",
    title: "Want to work on this?",
    description:
      "We're small, remote-first, and hiring engineers and designers who've lived on a shop floor.",
    action: { label: "See open roles", href: "/careers" },
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
              Drop us a note below — a real human will reply within one business
              day. Prefer email? Jump straight to one of the addresses on the
              right.
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

            <div
              className="rounded-xl p-6"
              style={{
                background: "var(--surface-0)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                Headquarters
              </div>
              <div
                className="mt-2 text-sm"
                style={{ color: "var(--text-default)" }}
              >
                Tracksign, Inc.
              </div>
              <div
                className="mt-1 text-sm leading-relaxed"
                style={{ color: "var(--text-muted)" }}
              >
                Remote-first, headquartered in the United States.
                <br />
                Monday–Friday · 8am–6pm CT
              </div>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
