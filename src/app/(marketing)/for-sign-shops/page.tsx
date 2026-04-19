import type { Metadata } from "next";
import { Hero } from "@/components/marketing/Hero";
import { Section } from "@/components/marketing/Section";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { Testimonial } from "@/components/marketing/Testimonial";
import { StatRow } from "@/components/marketing/StatRow";
import { CTA } from "@/components/marketing/CTA";

// Phase 18 Slice C — /for-sign-shops.
//
// Industry-specific landing. Same narrative shape as the home page,
// but every blurb is sign-shop-specific: illumination options, permit
// tracking, install routing, substrate pricing, etc.

export const metadata: Metadata = {
  title: "Tracksign for sign shops — Quote, build, and install in one system",
  description:
    "Purpose-built for sign shops. Sq-ft pricing, illumination and mounting options, permit tracking, install routing, and shop-floor boards for routers, printers, and finishers.",
  openGraph: {
    title: "Tracksign for sign shops",
    description:
      "Quote, build, and install signage in one platform. Built for sign shops.",
    type: "website",
  },
};

const PAIN_POINTS = [
  {
    icon: "📏",
    title: "Quoting illuminated signs without a calculator crawl",
    description:
      "Sq-ft base + illumination up-charge + mounting hardware + install labor. Tracksign handles the stack in one line item with explicit cost visibility.",
  },
  {
    icon: "📄",
    title: "Permit packets and landlord approvals in the same thread",
    description:
      "Store survey photos, elevation drawings, and landlord sign-offs on the project record. Send permit packets straight from the customer page.",
  },
  {
    icon: "🏭",
    title: "Routing, printing, and finishing on one board",
    description:
      "Department queues for CNC router, flatbed UV, vinyl cut, and finishing. Every station knows what's next without morning stand-ups.",
  },
  {
    icon: "🚚",
    title: "Crews that install right, with paperwork intact",
    description:
      "Install day runs on the field app. Routed stops, required photos, on-site signature, balance invoice triggered from the truck.",
  },
];

const WORKFLOW = [
  {
    step: "01",
    title: "Site survey",
    description:
      "Capture site photos and measurements on a phone. Attach to the project. No more lost sticky notes.",
  },
  {
    step: "02",
    title: "Quote with options",
    description:
      "Build illuminated vs. non-illuminated, mounting, and install-labor options. Customer picks, approves, deposits — in one portal.",
  },
  {
    step: "03",
    title: "Production runs",
    description:
      "Job lands on the router queue, then finishing, then loaded for install. Each department checklist gates the next.",
  },
  {
    step: "04",
    title: "Install and close",
    description:
      "Field app routes the crew, captures photos + signature, pushes the balance invoice. Customer pays through the portal.",
  },
];

export default function ForSignShopsPage() {
  return (
    <>
      <Hero
        eyebrow={<>For sign shops</>}
        title={<>Run the shop the way you actually make signs.</>}
        description={
          <>
            Tracksign is built for sign shops that do channel letters, monument
            signs, storefront graphics, and wayfinding. Quote by sq-ft, route
            through CNC and finishing, install in the field — one system, one
            record per job.
          </>
        }
        primary={{ label: "Start free trial", href: "/signup" }}
        secondary={{ label: "Book a demo", href: "/contact" }}
        footnote="Trusted by shops running routers, flatbed UV, vinyl, and install crews."
      />

      <Section muted padding="sm">
        <StatRow
          stats={[
            { value: "47%", label: "faster quote-to-approval on illuminated jobs" },
            { value: "3.2×", label: "more quotes out per sales rep per week" },
            { value: "18 days", label: "faster average AR on balance invoices" },
            { value: "100%", label: "of install jobs photographed at handoff" },
          ]}
        />
      </Section>

      <Section
        eyebrow="Why sign shops pick Tracksign"
        title="The shape of a sign shop's day, baked in."
        description="Every sign-shop owner we've talked to spends half their week stitching email, spreadsheets, QuickBooks, and a whiteboard. We replaced all four."
        align="center"
      >
        <FeatureGrid features={PAIN_POINTS} columns={2} />
      </Section>

      <Section
        muted
        eyebrow="How it flows"
        title="From survey to installed — one record the whole way."
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
            quote="We do a lot of channel-letter work. Tracksign's illumination options and mounting templates cut quote time from an hour to fifteen minutes. The install crew never loses a job photo anymore — it's all in the app."
            author="Placeholder Name"
            role="Owner"
            company="Placeholder Sign & Fabrication"
          />
        </div>
      </Section>

      <Section
        muted
        eyebrow="What's built in"
        title="The sign-shop specifics other platforms don't have."
        align="center"
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {[
            {
              title: "Sq-ft and linear-ft pricing",
              body: "Waste-factor-aware. Substrate-scoped. No pocket calculators.",
            },
            {
              title: "Illumination + mounting options",
              body: "Build option groups once, reuse across every storefront quote.",
            },
            {
              title: "Permit & survey attachments",
              body: "Photos, drawings, and approvals attached to the project record.",
            },
            {
              title: "CNC, print, vinyl, finishing queues",
              body: "Each department sees only what's theirs.",
            },
            {
              title: "Install routing + field app",
              body: "Route the crew, photograph, sign, invoice — from a phone.",
            },
            {
              title: "Deposit → balance billing",
              body: "Deposit at approval. Balance on install. Stripe + ACH.",
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
        title="Set up your sign shop in an afternoon."
        description="Import customers, seed your price book, send your first quote — today."
        primary={{ label: "Start free trial", href: "/signup" }}
        secondary={{ label: "Book a demo", href: "/contact" }}
      />
    </>
  );
}
