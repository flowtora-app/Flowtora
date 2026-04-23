import type { Metadata } from "next";
import Link from "next/link";
import { Hero } from "@/components/marketing/Hero";
import { Section } from "@/components/marketing/Section";
import { LogoCloud } from "@/components/marketing/LogoCloud";
import { Testimonial } from "@/components/marketing/Testimonial";
import { CTA } from "@/components/marketing/CTA";
import { PricingToggle } from "@/components/marketing/PricingToggle";
import { FAQ } from "@/components/marketing/FAQ";
import { ProductMock } from "@/components/marketing/ProductMock";
import { ScreenshotFrame } from "@/components/marketing/ScreenshotFrame";
import { ProductOrbit } from "@/components/marketing/ProductOrbit";
import { FeatureShowcase } from "@/components/marketing/FeatureShowcase";
import { FeatureMock } from "@/components/marketing/FeatureMock";
import { IndustryPath } from "@/components/marketing/IndustryPath";
import { KpiStrip } from "@/components/marketing/KpiStrip";
import { StickyDemoCTA } from "@/components/marketing/StickyDemoCTA";
import { getPublishedPlans, planToPricingTier } from "@/lib/plans";

// Landing page (Phase 2 upgrade) — the premium 14-section narrative.
//
//    1. Hero (split layout)
//    2. Logo cloud
//    3. Product orbit — the whole product at a glance
//    4. How it works (4 steps)
//    5. Feature spotlight #1 — Quoting & proofs (visual right)
//    6. Feature spotlight #2 — Production & installs (visual left, muted)
//    7. Feature spotlight #3 — Invoicing & portal (visual right)
//    8. Industry split (deep IndustryPath cards)
//    9. Outcomes (KpiStrip)
//   10. Testimonial
//   11. Pricing preview
//   12. FAQ
//   13. Final CTA
//   14. Footer (rendered by marketing layout)
//
// Rationale: each section answers a question the previous one leaves
// open. Orbit shows breadth; spotlights show depth; KPIs prove it;
// testimonial validates it; pricing monetizes it; FAQ closes it.

export const metadata: Metadata = {
  title: "Flowtora — The operating system for sign and print shops",
  description:
    "Run quoting, proofing, production, installs, and invoicing in one shop-floor-grade platform. Trusted by teams who make real things.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Flowtora — Sign and print shop OS",
    description:
      "One platform for CRM, quoting, proofing, production, installs, and invoicing.",
    type: "website",
  },
};

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Capture the lead",
    description:
      "Web inquiries, walk-ins, phone calls — every opportunity lands in one pipeline, tagged to the rep who owns it.",
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

const LANDING_FAQ = [
  {
    q: "How is this different from a CRM plus QuickBooks plus a Google Sheet?",
    a: (
      <>
        <p>
          Three systems have three versions of the truth. When a
          customer calls, your rep has to open all three to answer a
          question. Flowtora puts the customer, quote, proof, order,
          install, and invoice on one record — so anyone in the shop
          can answer &ldquo;what&apos;s happening with this job?&rdquo;
          in ten seconds.
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
          . Annual billing gets 20% off; multi-location franchises get
          a franchise plan — talk to us.
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

export default async function LandingPage() {
  // Landing pricing teaser — DB-backed since M2. Filter to plans flagged
  // `showOnLanding` (keeps legacy Growth out) and render a compact
  // bullet list via the landing-mode adapter.
  const plans = await getPublishedPlans();
  const landingTiers = plans
    .filter((p) => p.showOnLanding)
    .map((p) => planToPricingTier(p, { mode: "landing", maxFeatures: 5 }));

  return (
    <>
      {/* 1. HERO */}
      <Hero
        layout="split"
        eyebrow={<>Built for sign &amp; print shops</>}
        title={<>Run your shop like a modern software team.</>}
        description={
          <>
            Quotes, proofs, production, installs, and invoicing — one platform
            your whole crew actually uses. No more chasing emails, spreadsheets,
            or whiteboards.
          </>
        }
        primary={{ label: "Start free 14-day trial", href: "/signup" }}
        secondary={{ label: "Book a demo", href: "/book-demo" }}
        footnote="No credit card required · Set up in under 5 minutes"
        visual={
          <ScreenshotFrame chromeless>
            <ProductMock className="w-full" />
          </ScreenshotFrame>
        }
      />

      {/* 2. LOGO CLOUD */}
      <LogoCloud
        label="Built with input from shops running"
        logos={["Flatbed UV", "Routers", "Vinyl", "Laser", "CNC", "Install crews"]}
      />

      {/* 3. PRODUCT ORBIT */}
      <Section
        eyebrow="The whole product"
        title="Every object in your shop, linked by design."
        description="The customer, the quote, the proof, the order, the install, the invoice — same thread, every view. Click anything and see where it came from and what happens next."
        align="center"
      >
        <ProductOrbit
          visual={
            <ScreenshotFrame caption="flowtora.app/t/signshop">
              <ProductMock className="w-full" />
            </ScreenshotFrame>
          }
          chips={[
            {
              anchor: "tl",
              tone: "accent",
              label: "CRM",
              detail: "Every customer, every touch, one timeline.",
            },
            {
              anchor: "tr",
              tone: "info",
              label: "Proofs",
              detail: "Versioned rounds, one-click sign-off.",
            },
            {
              anchor: "bl",
              tone: "warning",
              label: "Production",
              detail: "Shop-floor board by department.",
            },
            {
              anchor: "br",
              tone: "success",
              label: "Invoices",
              detail: "Deposits, cards, ACH — reconciled.",
            },
          ]}
        />
      </Section>

      {/* 4. HOW IT WORKS */}
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
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border-subtle)",
              }}
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

      {/* 5. FEATURE SPOTLIGHT — QUOTING & PROOFS */}
      <FeatureShowcase
        eyebrow="Quoting & proofs"
        title="Send quotes your customers actually understand."
        description="Sq-ft, linear-ft, sheet, and job pricing with options baked in. Capture proof rounds and e-signatures inside the same record — no more hunting through email threads."
        bullets={[
          {
            title: "Price books, not calculators",
            detail:
              "Materials, labor, and finishes priced once. Drop them into any quote — markup, margin, and tax just work.",
          },
          {
            title: "Versioned proofs with audit trail",
            detail:
              "Every revision saved. Customer click-signs. Your rep doesn't re-send the last PDF anymore.",
          },
          {
            title: "One-click approval → order",
            detail:
              "Approved quote becomes a production-ready order without a rekey.",
          },
        ]}
        cta={{ label: "See quoting in depth", href: "/features" }}
        visual={<FeatureMock kind="quote" className="w-full" />}
      />

      {/* 6. FEATURE SPOTLIGHT — PRODUCTION & INSTALLS */}
      <FeatureShowcase
        muted
        reverse
        eyebrow="Production & installs"
        title="A shop-floor board your whole crew will actually open."
        description="Department queues for routers, printers, and finishing. Phone-first field app for the install crew. Everyone sees what's theirs, when it's due, and what's blocking them."
        bullets={[
          {
            title: "Department-aware routing",
            detail:
              "Jobs flow through print → finish → QC based on what they need, not a generic kanban.",
          },
          {
            title: "Install crews in the field",
            detail:
              "Checklist-driven install records, GPS-tagged photos, customer signature — from a phone.",
          },
          {
            title: "WIP aging, one glance",
            detail:
              "Old jobs float to the top. You catch stalled work before the customer calls to ask.",
          },
        ]}
        cta={{ label: "See production in depth", href: "/features" }}
        visual={<FeatureMock kind="production" className="w-full" />}
      />

      {/* 7. FEATURE SPOTLIGHT — INVOICING & PORTAL */}
      <FeatureShowcase
        eyebrow="Invoicing & portal"
        title="Deposits to paid-in-full, on the same record."
        description="Accept cards and ACH, reconcile against the order in a click, and give customers a branded portal to see status and pay balances without another login."
        bullets={[
          {
            title: "Deposit + balance out of the box",
            detail:
              "Send the deposit invoice when the quote is approved. Bill the balance when install completes.",
          },
          {
            title: "Reconciliation without spreadsheets",
            detail:
              "Every payment is linked to the order. Your AR page shows what's owed — and who to call.",
          },
          {
            title: "Tenant-branded customer portal",
            detail:
              "Your logo. Your subdomain. Customers see their quotes, proofs, and invoices in one place.",
          },
        ]}
        cta={{ label: "See invoicing in depth", href: "/features" }}
        visual={<FeatureMock kind="invoice" className="w-full" />}
      />

      {/* 8. INDUSTRY SPLIT */}
      <Section
        eyebrow="Built for your shop"
        title="Two industries. One platform. Tuned for how you make things."
        description="The shape of a sign-shop job is not the shape of a print-shop job. We built for both, natively — not as a theme."
        align="center"
      >
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <IndustryPath
            tone="primary"
            eyebrow="For sign shops"
            title="Signage that ships."
            lede="Site surveys, permit tracking, install routing, and shop-floor boards for routers, printers, and finishers. Plus the install field app your crew will actually use."
            bullets={[
              { label: "Sq-ft & linear-ft pricing" },
              { label: "Permit & city-fee tracking" },
              { label: "Install routing + field app" },
              { label: "Mounting, illumination, wraps" },
            ]}
            icon={<span aria-hidden>⚡</span>}
            href="/for-sign-shops"
          />
          <IndustryPath
            tone="secondary"
            eyebrow="For print shops"
            title="Print runs, made simple."
            lede="SKUs, bulk-run pricing, bleed-aware proofs, and production queues for flatbed, wide-format, and finishing. Reorders become one-click, not one-quote."
            bullets={[
              { label: "SKU & reorder templates" },
              { label: "Bulk pricing tiers" },
              { label: "Bleed-aware proofs" },
              { label: "Finishing + multi-shipment" },
            ]}
            icon={<span aria-hidden>◩</span>}
            href="/for-print-shops"
          />
        </div>
      </Section>

      {/* 9. OUTCOMES (KPI STRIP) */}
      <Section
        muted
        eyebrow="Outcomes, not features"
        title="What changes when your shop runs on one record."
        align="center"
      >
        <KpiStrip
          kpis={[
            {
              value: "4×",
              label: "Faster quote-to-approval",
              caption: "vs. email + spreadsheet workflow",
            },
            {
              value: "+31%",
              label: "Deposit capture rate",
              caption: "from one-click e-signatures",
            },
            {
              value: "−22d",
              label: "AR aging",
              caption: "balance billed on install, not next month",
            },
            {
              value: "0",
              label: "Double-entry between apps",
              caption: "quote, order, invoice — same record",
            },
          ]}
        />
      </Section>

      {/* 10. TESTIMONIAL */}
      <Section align="center">
        <div className="mx-auto max-w-3xl">
          <Testimonial
            quote="We replaced three tools with Flowtora and finally have a single place to look. Our install crews know what's coming up next and our AR dropped by 22 days."
            author="Placeholder Name"
            role="Owner"
            company="Placeholder Signs Co."
          />
        </div>
      </Section>

      {/* 11. PRICING PREVIEW */}
      <Section
        muted
        eyebrow="Pricing"
        title="Simple plans, real value."
        description="Start on the free trial. No credit card required. Upgrade when you're ready."
        align="center"
      >
        <PricingToggle tiers={landingTiers} />
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

      {/* 12. FAQ */}
      <Section
        eyebrow="Common questions"
        title="Things buyers ask us, answered up front."
        description="If yours isn't here, ping us on the contact page or just book a demo."
        align="center"
        narrow
      >
        <FAQ items={LANDING_FAQ} />
      </Section>

      {/* 13. FINAL CTA */}
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
