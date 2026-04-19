import type { Metadata } from "next";
import { Container } from "@/components/marketing/Container";
import { DemoForm } from "@/components/marketing/DemoForm";

// Phase 5 — /book-demo.
//
// Separate from /contact for a reason: a demo request is a high-intent
// path that deserves its own form + page + URL. Sales can route
// lead kind=DEMO differently from kind=INQUIRY (faster SLA, pre-filled
// calendar invite template) and we can measure conversion independently
// of general contact form noise.
//
// Layout is a two-column split on desktop — form left, trust/value
// panel right — collapsed to a single column on mobile. The panel is
// there to reduce abandonment: a visitor staring at a ten-field form
// needs to be reminded why they started filling it out.

export const metadata: Metadata = {
  title: "Book a demo — Flowtora",
  description:
    "See Flowtora in action with a live walkthrough tailored to your shop. 30 minutes, no obligation.",
  alternates: { canonical: "/book-demo" },
  openGraph: {
    title: "Book a Flowtora demo",
    description:
      "A 30-minute live walkthrough tailored to your shop. No slides — just the real product with your workflow.",
    type: "website",
  },
};

const VALUE_PROPS = [
  {
    title: "30 minutes, zero slides",
    body: "A real product walkthrough in your browser, not a deck. We'll focus on the parts of your day you want to unbury.",
  },
  {
    title: "Tailored to your shop",
    body: "Tell us whether you run signs, print, or both. We'll come in with the workflow that fits — not a generic tour.",
  },
  {
    title: "Your data, your call",
    body: "Want to try it with your own quote numbers and customer list? We'll spin up a sandbox with your import during the call.",
  },
  {
    title: "No pushy follow-up",
    body: "If the timing isn't right, say so. We'll stop emailing and check back when you're ready — no drip nurturing.",
  },
];

export default function BookDemoPage() {
  return (
    <section className="pb-24 pt-16 md:pt-24">
      <Container size="lg">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* Form column */}
          <div>
            <div
              className="mb-3 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider"
              style={{
                background: "var(--accent-surface)",
                color: "var(--accent-primary)",
                border: "1px solid var(--accent-surface-strong)",
              }}
            >
              Book a demo
            </div>
            <h1
              className="text-3xl font-semibold tracking-tight md:text-4xl"
              style={{ color: "var(--text-default)" }}
            >
              See it running, end to end.
            </h1>
            <p
              className="mt-3 max-w-xl text-base leading-relaxed md:text-lg"
              style={{ color: "var(--text-muted)" }}
            >
              Pick a time window and we&apos;ll propose 2–3 concrete slots
              within one business day. Bring a real quote or install job
              and we&apos;ll walk it through the system live.
            </p>

            <div className="mt-8">
              <DemoForm />
            </div>
          </div>

          {/* Trust/value panel */}
          <aside className="space-y-6 lg:pl-6">
            <div
              className="rounded-xl p-6"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-faint)" }}
              >
                What to expect
              </div>
              <ul className="mt-4 space-y-4">
                {VALUE_PROPS.map((prop) => (
                  <li key={prop.title}>
                    <div
                      className="text-sm font-semibold"
                      style={{ color: "var(--text-default)" }}
                    >
                      {prop.title}
                    </div>
                    <p
                      className="mt-1 text-xs leading-relaxed"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {prop.body}
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            <div
              className="rounded-xl p-6 text-sm leading-relaxed"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-muted)",
              }}
            >
              <div
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-faint)" }}
              >
                Prefer to start on your own?
              </div>
              <p className="mt-3">
                The free 14-day trial gets you the full platform with
                demo data loaded. No credit card.
              </p>
              <a
                href="/signup"
                className="mt-4 inline-flex items-center gap-1 text-sm font-semibold"
                style={{ color: "var(--accent-primary)" }}
              >
                Start free trial →
              </a>
            </div>
          </aside>
        </div>
      </Container>
    </section>
  );
}
