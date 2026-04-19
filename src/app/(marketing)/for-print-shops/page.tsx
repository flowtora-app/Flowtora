import type { Metadata } from "next";
import { Hero } from "@/components/marketing/Hero";
import { Section } from "@/components/marketing/Section";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { Testimonial } from "@/components/marketing/Testimonial";
import { StatRow } from "@/components/marketing/StatRow";
import { CTA } from "@/components/marketing/CTA";

// Phase 18 Slice C — /for-print-shops.
//
// Industry-specific landing. Parallel structure to /for-sign-shops but
// every blurb is print-shop-specific: linear-ft and sheet pricing,
// bleed-aware proofing, flatbed / wide-format queues, finishing.

export const metadata: Metadata = {
  title: "Tracksign for print shops — From file to finished in one platform",
  description:
    "Purpose-built for print shops. Linear-ft, sheet, and job-based pricing; bleed-aware proofs; production queues for flatbed, wide-format, and finishing.",
  openGraph: {
    title: "Tracksign for print shops",
    description:
      "Estimate, proof, print, and finish in one platform. Built for print shops.",
    type: "website",
  },
};

const PAIN_POINTS = [
  {
    icon: "📐",
    title: "Estimating jobs that mix sheet, roll, and piece pricing",
    description:
      "Sheet counts with imposition math, linear-ft for roll media, piece pricing for finishing. Mix them on one quote without spreadsheet hackery.",
  },
  {
    icon: "🎨",
    title: "Proofs that match the press, not the monitor",
    description:
      "Bleed-aware proof viewer, color-check notes, round comparison. Customers approve once; the press doesn't guess.",
  },
  {
    icon: "🏭",
    title: "Queue-per-press with real WIP visibility",
    description:
      "Flatbed UV, wide-format, digital sheet, finishing — each has its own board. Dwell-time alerts surface jobs that are slipping.",
  },
  {
    icon: "💳",
    title: "Deposits on short-run, balance at pickup",
    description:
      "Shorter cycles, tighter cash flow. Deposit on approval, balance on pickup or delivery — both invoices auto-trigger from the order.",
  },
];

const WORKFLOW = [
  {
    step: "01",
    title: "File in, estimate out",
    description:
      "Upload artwork, pick substrate and finishing options. Price book math runs live. Send a proposal in minutes.",
  },
  {
    step: "02",
    title: "Proof & approve",
    description:
      "Customer reviews the bleed-aware proof, marks up, approves with a typed name. Every round archived.",
  },
  {
    step: "03",
    title: "Press and finish",
    description:
      "Order drops onto the right press queue. Finishing picks it up next. Operator sees gang opportunities.",
  },
  {
    step: "04",
    title: "Pickup or ship, invoice in full",
    description:
      "Balance invoice fires at handoff. Customer pays through the portal. Closed loop.",
  },
];

export default function ForPrintShopsPage() {
  return (
    <>
      <Hero
        eyebrow={<>For print shops</>}
        title={<>From file to finished — the print shop OS.</>}
        description={
          <>
            Tracksign is built for print shops running flatbed UV, wide-format,
            digital sheet, and finishing. Quote mixed pricing models, proof
            with bleed awareness, route jobs across every press, bill on
            pickup — all on one record.
          </>
        }
        primary={{ label: "Start free trial", href: "/signup" }}
        secondary={{ label: "Book a demo", href: "/contact" }}
        footnote="Trusted by shops running flatbed, roll, sheet, and bindery."
      />

      <Section muted padding="sm">
        <StatRow
          stats={[
            { value: "38%", label: "faster file-to-proof turnaround" },
            { value: "2.4×", label: "more repeat-order revenue captured" },
            { value: "0", label: "lost proof rounds once customers use the portal" },
            { value: "12 days", label: "faster AR collection on short-run jobs" },
          ]}
        />
      </Section>

      <Section
        eyebrow="Why print shops pick Tracksign"
        title="Built for the way a print shop actually runs."
        description="Proofing, pressing, finishing, and billing don't live in four apps anymore. They live in one order record."
        align="center"
      >
        <FeatureGrid features={PAIN_POINTS} columns={2} />
      </Section>

      <Section
        muted
        eyebrow="How it flows"
        title="From file to finished — one thread, one record."
        align="center"
      >
        <ol className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {WORKFLOW.map((step) => (
            <li
              key={step.step}
              className="rounded-xl p-6"
              style={{
                background: "var(--surface-0)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div
                className="text-xs font-semibold tracking-widest"
                style={{ color: "var(--accent-primary)" }}
              >
                {step.step}
              </div>
              <div
                className="mt-2 text-base font-semibold"
                style={{ color: "var(--text-default)" }}
              >
                {step.title}
              </div>
              <p
                className="mt-2 text-sm leading-relaxed"
                style={{ color: "var(--text-muted)" }}
              >
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </Section>

      <Section align="center">
        <div className="mx-auto max-w-3xl">
          <Testimonial
            quote="Our flatbed was always three jobs behind because the estimator and the press operator lived in different worlds. Tracksign put them on the same queue. Revenue per flatbed hour is up 28% and we stopped losing proofs in email."
            author="Placeholder Name"
            role="Operations Manager"
            company="Placeholder Print Works"
          />
        </div>
      </Section>

      <Section
        muted
        eyebrow="What's built in"
        title="Print-shop specifics the generic SaaS stack doesn't have."
        align="center"
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {[
            {
              title: "Sheet, roll, and piece pricing",
              body: "Mix all three on one quote with live imposition math.",
            },
            {
              title: "Bleed-aware proofing",
              body: "Proof viewer respects trim, bleed, and safe zones.",
            },
            {
              title: "Per-press queues",
              body: "Flatbed, wide-format, digital sheet, finishing — each board its own.",
            },
            {
              title: "Gang-run suggestions",
              body: "Surface compatible jobs for press-operator gang decisions.",
            },
            {
              title: "File management",
              body: "Versioned artwork, linked to the order. No 'final-final-v3.pdf'.",
            },
            {
              title: "Pickup + ship invoicing",
              body: "Balance invoice fires at handoff or shipment. Stripe + ACH.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-xl p-6"
              style={{
                background: "var(--surface-0)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div
                className="text-base font-semibold"
                style={{ color: "var(--text-default)" }}
              >
                {item.title}
              </div>
              <p
                className="mt-2 text-sm leading-relaxed"
                style={{ color: "var(--text-muted)" }}
              >
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <CTA
        eyebrow="Ready to try it?"
        title="Run your print shop's next week in Tracksign."
        description="Import customers, seed your price book, send your first quote — today."
        primary={{ label: "Start free trial", href: "/signup" }}
        secondary={{ label: "Book a demo", href: "/contact" }}
      />
    </>
  );
}
