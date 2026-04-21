import type { Metadata } from "next";
import { Hero } from "@/components/marketing/Hero";
import { Section } from "@/components/marketing/Section";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { ShopSnapshot } from "@/components/marketing/ShopSnapshot";
import { WorkflowStep } from "@/components/marketing/WorkflowStep";
import { WorkflowMock } from "@/components/marketing/WorkflowMock";
import { ComparisonMatrix, type ComparisonRow } from "@/components/marketing/ComparisonMatrix";
import { FAQ } from "@/components/marketing/FAQ";
import { CTA } from "@/components/marketing/CTA";
import { ScreenshotFrame } from "@/components/marketing/ScreenshotFrame";
import { ProductMock } from "@/components/marketing/ProductMock";

// For Sign Shops (Phase 5 upgrade).
//
// Eight-section narrative:
//   1. Hero — industry-specific screenshot
//   2. Pain-point strip (3 "before" cards)
//   3. Workflow walkthrough — 6 alternating L/R steps
//   4. Shop snapshot (representative case study)
//   5. Industry feature grid — 6 cards (survey, permits, materials, wraps, ADA, photos)
//   6. Comparison block (vs. spreadsheets / generic CRM)
//   7. Sign-shop FAQ
//   8. Final CTA

export const metadata: Metadata = {
  title: "Flowtora for sign shops — Quote, build, and install signage in one system",
  description:
    "Purpose-built for sign shops. Sq-ft + linear-ft pricing, site survey capture, permit tracking, install routing, and shop-floor boards for routers, printers, and finishers.",
  openGraph: {
    title: "Flowtora for sign shops",
    description:
      "Quote, build, and install signage in one platform. Built for sign shops.",
    type: "website",
  },
};

const PAIN_POINTS = [
  {
    icon: "📏",
    title: "Quotes that take an hour each",
    description:
      "Sq-ft, illumination, mounting hardware, permit fees, install labor — every line in a different tab. One missed add-on and the margin is gone.",
  },
  {
    icon: "📂",
    title: "Survey photos in three apps",
    description:
      "Some on the sales rep's phone, some in the shared drive, some in email. When the permit reviewer asks, nobody can find them fast.",
  },
  {
    icon: "📞",
    title: "The office calls every install",
    description:
      "Did they get the signature? Were before/after photos taken? What sizes went on the truck? The crew stops to answer, the office stops to ask.",
  },
];

// Sign-shop-specific feature grid — 6 cards tuned to the things
// sign shops ask about first on a demo call.
const INDUSTRY_FEATURES = [
  {
    icon: "📐",
    title: "Site survey capture",
    description:
      "Photos, measurements, electrical notes, clearance, and fascia dimensions — on a phone, attached to the project.",
  },
  {
    icon: "📄",
    title: "Permit & landlord tracking",
    description:
      "Permit fee line-items on the quote. Landlord approvals + city submissions logged on the project record with due-date reminders.",
  },
  {
    icon: "🎨",
    title: "Material + finish library",
    description:
      "Acrylic, aluminum, ACM, vinyl, 3M wrap film — priced once, with substrate-specific waste factors. Add new materials in seconds.",
  },
  {
    icon: "🚚",
    title: "Wraps + fleet graphics",
    description:
      "Linear-ft pricing with wrap-film options. Vehicle spec cards attached to the quote so installers see exactly what they're wrapping.",
  },
  {
    icon: "♿",
    title: "ADA + wayfinding",
    description:
      "Raster/braille line-items, tactile options, and code-compliance notes pinned to the product so estimators don't re-research for every job.",
  },
  {
    icon: "📸",
    title: "Install photo enforcement",
    description:
      "Required before/after shots per install. Missed photos block the push-to-bill. The archive makes warranty claims trivial.",
  },
];

const COMPARISON_ROWS: ComparisonRow[] = [
  {
    capability: "Sq-ft + linear-ft pricing in one quote",
    subcopy: "Channel letters, banners, and wraps on the same proposal.",
    cells: [
      { mark: "yes", note: "Built-in, with waste factor." },
      { mark: "partial", note: "Manual math, every time." },
      { mark: "no", note: "Generic line items only." },
    ],
  },
  {
    capability: "Site survey capture on a phone",
    subcopy: "Photos, measurements, electrical — all attached to the project.",
    cells: [
      { mark: "yes", note: "Field-first, offline-tolerant." },
      { mark: "no", note: "Phone roll + email yourself." },
      { mark: "no", note: "Not a CRM feature." },
    ],
  },
  {
    capability: "Permit + landlord tracking",
    subcopy: "Line items + project-level due dates.",
    cells: [
      { mark: "yes", note: "Trackable, renewable." },
      { mark: "no", note: "A shared spreadsheet." },
      { mark: "partial", note: "You build it yourself." },
    ],
  },
  {
    capability: "CNC / print / finishing queues",
    subcopy: "Per-station checklists and time tracking.",
    cells: [
      { mark: "yes", note: "Out of the box." },
      { mark: "no", note: "A whiteboard." },
      { mark: "partial", note: "Generic kanban." },
    ],
  },
  {
    capability: "Install routing + field app",
    subcopy: "Day view, required photos, signature, push-to-bill.",
    cells: [
      { mark: "yes", note: "Same record, end to end." },
      { mark: "no", note: "Text messages." },
      { mark: "no", note: "Add a second app." },
    ],
  },
  {
    capability: "Deposit + balance invoicing",
    subcopy: "Deposit at approval, balance at install.",
    cells: [
      { mark: "yes", note: "One record, one click." },
      { mark: "partial", note: "Manual in QuickBooks." },
      { mark: "partial", note: "Separate billing module." },
    ],
  },
];

const SIGN_SHOP_FAQ = [
  {
    q: "Can I price illuminated vs. non-illuminated as one quote with options?",
    a: (
      <p>
        Yes. Option groups are first-class. Build &quot;illumination&quot; as
        an option group with LED, neon, and non-illuminated selections,
        each with its own material + labor cost. The customer sees the
        choice and the impact on the total, on one proposal.
      </p>
    ),
  },
  {
    q: "How does permit tracking work?",
    a: (
      <p>
        Permit fees are line items on the quote (pass-through or
        marked-up — your call). The project record has a permit tab
        with submission dates, approval dates, and expiration
        reminders. When a permit is denied or resubmitted, the history
        is logged and visible to anyone on the account.
      </p>
    ),
  },
  {
    q: "What does the install crew need to use the field app?",
    a: (
      <p>
        Any iOS or Android phone. No native app install required — it
        runs as a PWA (web app you can &quot;add to home screen&quot;). Works
        in a spotty signal too: photos and signatures queue offline
        and sync when the crew hits a cell tower.
      </p>
    ),
  },
  {
    q: "Can we put our own logo on the customer portal?",
    a: (
      <p>
        Yes. Every workspace gets a branded portal at
        yourshop.flowtora.app with your logo, colors, and copy on the
        portal + proposal PDFs. Custom domain (portal.yourshop.com)
        ships on the Pro plan with automatic TLS.
      </p>
    ),
  },
  {
    q: "How do multi-location sign franchises work?",
    a: (
      <p>
        Each location gets its own queues, price book, and reports,
        while HQ sees the consolidated roll-up. Branch-scoped RBAC
        means a regional manager only sees their region. Ships on
        Enterprise — reach out and we&apos;ll scope your specific
        hierarchy.
      </p>
    ),
  },
  {
    q: "What if my estimator already has a spreadsheet they love?",
    a: (
      <p>
        Import it. We&apos;ll help you translate the formulas into
        Flowtora&apos;s price book during onboarding (usually a
        two-hour call). After that the spreadsheet becomes a backup,
        then it disappears.
      </p>
    ),
  },
];

export default function ForSignShopsPage() {
  return (
    <>
      {/* 1. HERO */}
      <Hero
        layout="split"
        eyebrow={<>For sign shops</>}
        title={<>Run the shop the way you actually make signs.</>}
        description={
          <>
            Channel letters, monument signs, storefront graphics, wayfinding,
            wraps. Quote by sq-ft, route through CNC and finishing, install in
            the field — one record per job, from survey to signoff.
          </>
        }
        primary={{ label: "Start free trial", href: "/signup" }}
        secondary={{ label: "Book a demo", href: "/book-demo" }}
        footnote="Trusted by shops running routers, flatbed UV, vinyl, and install crews."
        visual={
          <ScreenshotFrame chromeless>
            <ProductMock className="w-full" />
          </ScreenshotFrame>
        }
      />

      {/* 2. PAIN POINTS */}
      <Section
        muted
        eyebrow="What you're probably living with"
        title="Three tax-on-time every sign shop pays."
        description="Every owner we talk to nods on at least two of these. We built Flowtora to make all three cost zero."
        align="center"
      >
        <FeatureGrid features={PAIN_POINTS} columns={3} />
      </Section>

      {/* 3. WORKFLOW WALKTHROUGH — 6 steps */}
      <Section
        eyebrow="How it runs, step by step"
        title="Survey → quote → proof → production → install → paid."
        description="Six steps, one record, every department on the same page. Here's exactly what the flow looks like inside Flowtora."
        align="center"
      >
        <div className="mx-auto mt-4 max-w-5xl divide-y" style={{ borderColor: "var(--border-subtle)" }}>
          <WorkflowStep
            step={1}
            eyebrow="Lead &amp; survey"
            title="Capture the site, on the phone, on the way back."
            description="Field reps snap photos, measure the fascia, note electrical, and attach everything to a new project — no second app, no email-it-to-yourself."
            bullets={[
              "Inbound web forms create the project automatically",
              "Site-survey photos + measurements in one form",
              "Landlord contact captured for later approval",
            ]}
            visual={<WorkflowMock kind="survey" className="w-full" />}
          />
          <WorkflowStep
            step={2}
            reverse
            eyebrow="Signage quote"
            title="Quote illuminated, mounted, permitted — all priced in one pass."
            description="Option groups for illumination, mounting, and finish. Permit fees as pass-through line items. Customer sees a clean proposal and approves in the portal."
            bullets={[
              "Sq-ft + linear-ft in the same quote",
              "Illumination + mounting option groups",
              "Permit fee pass-through lines",
            ]}
            visual={<WorkflowMock kind="quote" className="w-full" />}
          />
          <WorkflowStep
            step={3}
            eyebrow="Proof &amp; approve"
            title="Send the proof, get a pinned markup back, lock the round."
            description="Customer pins notes on the artwork, picks color, signs off. Every round is archived — no more &quot;which PDF was latest&quot; during fabrication."
            bullets={[
              "In-browser markup (pin, comment, strike-through)",
              "Typed e-signature with audit trail",
              "Side-by-side round comparison",
            ]}
            visual={<WorkflowMock kind="proofing" className="w-full" />}
          />
          <WorkflowStep
            step={4}
            reverse
            eyebrow="Production board"
            title="CNC, flatbed, vinyl, finishing — each lane knows what's next."
            description="Jobs flow through the departments they actually need. QC checklists gate the next station. Owners see the whole floor, end-of-day."
            bullets={[
              "Per-department Kanban + list view",
              "Station clock-in + time tracking",
              "WIP aging alerts before the customer calls",
            ]}
            visual={<WorkflowMock kind="production" className="w-full" />}
          />
          <WorkflowStep
            step={5}
            eyebrow="Install scheduling"
            title="Route the crew, pack the truck, hit the day."
            description="Route-optimized day view, materials pulled against the install, landlord + city notifications queued automatically."
            bullets={[
              "Optimized crew day with travel estimates",
              "Materials-pull list per install",
              "Auto-reminder to landlord + city",
            ]}
            visual={<WorkflowMock kind="install-schedule" className="w-full" />}
          />
          <WorkflowStep
            step={6}
            reverse
            eyebrow="Field sign-off"
            title="Photo it, sign it, bill it — from the lift."
            description="Required before/after photos. GPS-tagged signature. Push-to-bill triggers the balance invoice. The crew moves on; the office gets the final on the same record."
            bullets={[
              "Required photo checklist per install type",
              "Customer signature + GPS stamp",
              "Push-to-bill generates the balance invoice",
            ]}
            visual={<WorkflowMock kind="field-signoff" className="w-full" />}
          />
        </div>
      </Section>

      {/* 4. SHOP SNAPSHOT */}
      <Section muted eyebrow="A shop like yours" title="What one sign shop's week looks like on Flowtora." align="center">
        <div className="mx-auto max-w-5xl">
          <ShopSnapshot
            placeholder
            shop="Harbor Signs Co."
            meta="8-person shop · Portland, OR · Channel letters, storefront, wraps"
            narrative={
              <>
                <p>
                  Harbor is a representative 8-person sign shop. Before
                  Flowtora, their estimator ran a spreadsheet, their
                  proofs lived in email threads, and the install crew
                  texted the office for every job.
                </p>
                <p className="mt-3">
                  After moving quoting + proofing onto Flowtora in week
                  one, then production + installs in week three, the
                  whole shop runs on a single record per job. Balance
                  invoices go out from the lift, not from the office
                  the following Monday.
                </p>
              </>
            }
            stats={[
              { value: "47%", label: "Faster quote-approval" },
              { value: "−18d", label: "Average AR aging" },
              { value: "100%", label: "Installs photographed" },
            ]}
            before={[
              "Price-book spreadsheet",
              "Email proof threads",
              "QuickBooks for invoices",
              "Text messages from the field",
            ]}
          />
        </div>
      </Section>

      {/* 5. INDUSTRY FEATURE GRID */}
      <Section
        eyebrow="The sign-shop specifics"
        title="Six things other platforms don't build for you."
        description="Generic SaaS doesn't know what a permit packet is. We do — because we built for sign shops first."
        align="center"
      >
        <FeatureGrid features={INDUSTRY_FEATURES} columns={3} />
      </Section>

      {/* 6. COMPARISON BLOCK */}
      <Section
        muted
        eyebrow="vs. the patchwork"
        title="What a sign shop gains by moving off the spreadsheet."
        align="center"
      >
        <ComparisonMatrix
          competitors={["Spreadsheets + email", "Generic CRM"]}
          rows={COMPARISON_ROWS}
        />
      </Section>

      {/* 7. SIGN-SHOP FAQ */}
      <Section
        eyebrow="Sign-shop questions"
        title="The six questions every sign-shop owner asks on a demo."
        align="center"
        narrow
      >
        <FAQ items={SIGN_SHOP_FAQ} />
      </Section>

      {/* 8. FINAL CTA */}
      <CTA
        eyebrow="Ready to try it?"
        title="Set up your sign shop in an afternoon."
        description="Import customers, seed your price book, send your first quote — today."
        primary={{ label: "Start free trial", href: "/signup" }}
        secondary={{ label: "Book a demo", href: "/book-demo" }}
      />
    </>
  );
}
