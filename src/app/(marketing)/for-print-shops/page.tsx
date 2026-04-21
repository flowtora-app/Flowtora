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

// For Print Shops (Phase 6 upgrade).
//
// Eight-section narrative mirroring /for-sign-shops but tuned to print
// shops: SKUs + bulk runs, press scheduling, bindery/finishing,
// multi-shipment orders. Sign shops think permits and install crews;
// print shops think press time, run cost, and shipping.
//
// Structure:
//   1. Hero (industry-specific)
//   2. Pain-point strip (3 print-shop "before" cards)
//   3. Workflow walkthrough — 6 alternating steps:
//        catalog → quote → proof → press run → bindery → shipping
//   4. Shop snapshot (representative case study)
//   5. Industry feature grid — 6 cards (SKUs, reorders, stock library,
//        bulk pricing, finishing, multi-shipment)
//   6. Comparison block (mini matrix, print-centric)
//   7. Print-shop FAQ
//   8. Final CTA

export const metadata: Metadata = {
  title: "Flowtora for print shops — From file to finished in one platform",
  description:
    "Purpose-built for print shops. SKU + bulk-run pricing, bleed-aware proofs, press + bindery queues, and multi-shipment orders on one record.",
  openGraph: {
    title: "Flowtora for print shops",
    description:
      "Estimate, proof, press, finish, and ship in one platform. Built for print shops.",
    type: "website",
  },
};

const PAIN_POINTS = [
  {
    icon: "🧮",
    title: "Estimating that mixes sheet, roll, and piece",
    description:
      "Run of 5,000 business cards plus a banner plus a 250-piece flyer reorder. Different cost models per line, stitched by hand every time.",
  },
  {
    icon: "🎯",
    title: "Proof versions lost between rounds",
    description:
      "Round 1 is in email. Round 2 is a DM. Round 3 is \"the PDF on the shared drive\". Who approved what? Nobody is totally sure.",
  },
  {
    icon: "📦",
    title: "Finishing queues and ship-outs in two systems",
    description:
      "The bindery schedule is on a whiteboard. Shipping labels come from a third tool. Tracking numbers get emailed to the customer by hand.",
  },
];

const INDUSTRY_FEATURES = [
  {
    icon: "🏷️",
    title: "SKU + variant catalog",
    description:
      "House products with size / stock / finish variants. One SKU, many variants, priced by break-point tier. Reorders start from the last spec.",
  },
  {
    icon: "🔁",
    title: "One-click reorder templates",
    description:
      "The customer's last run — size, stock, quantity, bleed — saved as a template. Reorder is literally one click from the portal.",
  },
  {
    icon: "📚",
    title: "Stock + substrate library",
    description:
      "Coated, uncoated, gloss, matte, synthetics — priced once with waste factors. New stock adds in seconds, flows into every quote.",
  },
  {
    icon: "📊",
    title: "Bulk pricing tiers",
    description:
      "Automatic break-point logic. 500 / 1,000 / 2,500 / 5,000 each with their own price per piece. Customers see the full ladder on the quote.",
  },
  {
    icon: "✂️",
    title: "Finishing + bindery options",
    description:
      "Trim, score, saddle-stitch, perfect-bind, laminate, die-cut. Option groups attached to the product so estimators don't rebuild them each time.",
  },
  {
    icon: "📮",
    title: "Multi-shipment orders",
    description:
      "One order, many shipments — drop-ship to ten offices, kitting to a warehouse, pickup for the rest. Tracking per box, all on the record.",
  },
];

const COMPARISON_ROWS: ComparisonRow[] = [
  {
    capability: "SKU catalog with break-point pricing",
    subcopy: "500 / 1,000 / 2,500 priced automatically.",
    cells: [
      { mark: "yes", note: "Built-in tiered pricing." },
      { mark: "partial", note: "A spreadsheet tab." },
      { mark: "no", note: "Generic line items." },
    ],
  },
  {
    capability: "Bleed-aware proofing",
    subcopy: "Preflight + bleed check visible on the proof.",
    cells: [
      { mark: "yes", note: "Flagged before the round is sent." },
      { mark: "no", note: "Prepress emails the customer." },
      { mark: "no", note: "Not a CRM feature." },
    ],
  },
  {
    capability: "Press + bindery queues",
    subcopy: "Department routing with time tracking per run.",
    cells: [
      { mark: "yes", note: "Per-press, per-station." },
      { mark: "no", note: "A whiteboard in prepress." },
      { mark: "partial", note: "Generic Kanban." },
    ],
  },
  {
    capability: "Reorder templates",
    subcopy: "Customer's last spec, saved and one-click.",
    cells: [
      { mark: "yes", note: "From portal or office." },
      { mark: "partial", note: "Copy the old email." },
      { mark: "no", note: "Rebuild every time." },
    ],
  },
  {
    capability: "Multi-shipment per order",
    subcopy: "Drop-ship + kitting + pickup on one record.",
    cells: [
      { mark: "yes", note: "Tracking per box." },
      { mark: "no", note: "A separate spreadsheet." },
      { mark: "no", note: "One address per quote." },
    ],
  },
  {
    capability: "Deposit + balance invoicing",
    subcopy: "Deposit at approval, balance at shipping.",
    cells: [
      { mark: "yes", note: "One-click invoice." },
      { mark: "partial", note: "Manual in QuickBooks." },
      { mark: "partial", note: "Separate billing module." },
    ],
  },
];

const PRINT_SHOP_FAQ = [
  {
    q: "How do I price a job that mixes sheet, roll, and piece?",
    a: (
      <p>
        Each line item picks its own pricing model. A postcard run
        uses per-piece break points; a banner uses linear-ft; a
        saddle-stitched booklet uses piece + finishing labor. The
        total rolls up cleanly even when the lines think in different
        units.
      </p>
    ),
  },
  {
    q: "Can customers reorder from a portal?",
    a: (
      <p>
        Yes. Every completed order becomes a one-click reorder
        template on the customer&apos;s portal — same stock, same
        finishing, same quantity ladder. They click Reorder, they
        pick a ship-to, you see it in the pipeline.
      </p>
    ),
  },
  {
    q: "How does bleed checking work?",
    a: (
      <p>
        When prepress uploads artwork to a proof round, Flowtora
        flags missing bleed or low resolution on the proof itself —
        so the customer sees the concern before they sign off. Hard
        rejections block the proof from going out.
      </p>
    ),
  },
  {
    q: "Can I track multiple shipments per order?",
    a: (
      <p>
        Yes. An order can have N shipments, each with its own
        ship-to, carrier, tracking number, and drop date. Mix a
        bulk drop-ship to a warehouse with individual office
        shipments on the same order; every box lives on the record.
      </p>
    ),
  },
  {
    q: "Do you support kitting and mail-merge runs?",
    a: (
      <p>
        Variable-data runs are supported via CSV upload against the
        order. Kitting is modeled as a multi-shipment order with a
        packing slip per destination. We&apos;re not a full mail-
        merge engine, so very deep mailings still pair us with a
        dedicated tool — most shops don&apos;t need one.
      </p>
    ),
  },
  {
    q: "What about trade print partners and outsourced runs?",
    a: (
      <p>
        Outsourced lines are first-class. Mark the line as
        trade-print, attach the partner&apos;s PO, and Flowtora
        tracks it through the press-partner&apos;s promised ship
        date so your CSR doesn&apos;t lose visibility.
      </p>
    ),
  },
];

export default function ForPrintShopsPage() {
  return (
    <>
      {/* 1. HERO */}
      <Hero
        layout="split"
        eyebrow={<>For print shops</>}
        title={<>From file to finished, on one record.</>}
        description={
          <>
            Commercial printers, wide-format shops, promo-product suppliers.
            SKU-aware estimating, bleed-checked proofs, press + bindery
            queues, and multi-shipment orders — all tied to one customer
            record per run.
          </>
        }
        primary={{ label: "Start free trial", href: "/signup" }}
        secondary={{ label: "Book a demo", href: "/book-demo" }}
        footnote="Trusted by shops running flatbed UV, digital sheetfed, wide-format, and bindery."
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
        title="Three things that slow every print shop down."
        description="Estimating, proofing, and finishing — in different tools, in different places. It doesn't have to be."
        align="center"
      >
        <FeatureGrid features={PAIN_POINTS} columns={3} />
      </Section>

      {/* 3. WORKFLOW WALKTHROUGH — 6 steps */}
      <Section
        eyebrow="How it runs, step by step"
        title="Catalog → quote → proof → press → bindery → ship."
        description="Six steps, one record. From the SKU that kicks off the quote to the tracking number that hits the customer&apos;s inbox, every handoff is the same thread."
        align="center"
      >
        <div className="mx-auto mt-4 max-w-5xl divide-y" style={{ borderColor: "var(--border-subtle)" }}>
          <WorkflowStep
            step={1}
            eyebrow="Catalog &amp; order entry"
            title="Start from a SKU, not a blank quote."
            description="House products with size, stock, and finishing variants, priced by break-point. CSRs pick the SKU, fill the options, and the quote is 80% done."
            bullets={[
              "Variants (size, stock, finish) under one SKU",
              "Break-point tiers priced automatically",
              "Reorder templates saved per customer",
            ]}
            visual={<WorkflowMock kind="catalog" className="w-full" />}
          />
          <WorkflowStep
            step={2}
            reverse
            eyebrow="Quote &amp; approve"
            title="Mix sheet, roll, piece — in one proposal."
            description="Each line item brings its own cost model. The customer sees a clean proposal with an approve button; the order lands on the production side in seconds."
            bullets={[
              "Per-line pricing models",
              "Quantity ladder visible on the proposal",
              "One-click approval + deposit",
            ]}
            visual={<WorkflowMock kind="quote" className="w-full" />}
          />
          <WorkflowStep
            step={3}
            eyebrow="Proof &amp; bleed check"
            title="Prepress flags the issues before the customer sees a round."
            description="Upload artwork, get bleed + resolution flags, send the round. Every revision is archived with audit trail; hard rejections block a proof from being sent."
            bullets={[
              "Automated bleed + resolution checks",
              "Markup + pin comments in the browser",
              "Typed e-signature with audit log",
            ]}
            visual={<WorkflowMock kind="proofing" className="w-full" />}
          />
          <WorkflowStep
            step={4}
            reverse
            eyebrow="Press run"
            title="Assign the press, track the run, log the waste."
            description="Operators clock into the run, the progress bar updates as sheets finish, and waste + substrate pulled are reconciled against the estimate."
            bullets={[
              "Press-level queue + time tracking",
              "Substrate pulled + waste reconciled",
              "Operator-level productivity visible",
            ]}
            visual={<WorkflowMock kind="press-run" className="w-full" />}
          />
          <WorkflowStep
            step={5}
            eyebrow="Bindery &amp; finishing"
            title="Trim, score, stitch — every station knows what's next."
            description="Finishing queues are department-aware. A saddle-stitched booklet knows it needs the folder first, then the stitcher, then the trim — in that order, gated by QC."
            bullets={[
              "Department-routed finishing",
              "Per-station checklists + QC",
              "Ready-to-ship trigger on completion",
            ]}
            visual={<WorkflowMock kind="bindery" className="w-full" />}
          />
          <WorkflowStep
            step={6}
            reverse
            eyebrow="Ship &amp; bill"
            title="Multi-shipment, tracked, auto-notified."
            description="An order can have many shipments — drop-ship, kitting, pickup. Each gets a carrier, a tracking number, and an automatic email to the recipient when it&apos;s dropped."
            bullets={[
              "Carrier integration with label print",
              "Multi-shipment per order",
              "Push-to-bill on final shipment",
            ]}
            visual={<WorkflowMock kind="shipping" className="w-full" />}
          />
        </div>
      </Section>

      {/* 4. SHOP SNAPSHOT */}
      <Section muted eyebrow="A shop like yours" title="What one print shop's week looks like on Flowtora." align="center">
        <div className="mx-auto max-w-5xl">
          <ShopSnapshot
            placeholder
            shop="Beacon Print Works"
            meta="14-person shop · Minneapolis, MN · Digital, wide-format, bindery"
            narrative={
              <>
                <p>
                  Beacon is a representative 14-person commercial
                  printer. Before Flowtora, SKUs lived in a legacy
                  MIS, proofs in email, and bindery schedule on a
                  whiteboard. Reorders meant rebuilding the quote.
                </p>
                <p className="mt-3">
                  With Flowtora, CSRs start from SKUs, proofs carry
                  bleed checks, press runs log waste, and a third of
                  their revenue now comes from one-click reorders
                  triggered by the customer portal.
                </p>
              </>
            }
            stats={[
              { value: "33%", label: "Revenue from reorders" },
              { value: "−2.4d", label: "Avg. proof cycle" },
              { value: "+18%", label: "CSR throughput" },
            ]}
            before={[
              "Legacy MIS for SKUs",
              "Email proof threads",
              "Whiteboard finishing schedule",
              "Manual carrier labels",
            ]}
          />
        </div>
      </Section>

      {/* 5. INDUSTRY FEATURE GRID */}
      <Section
        eyebrow="The print-shop specifics"
        title="Six things generic SaaS won't have on day one."
        description="We built quoting, production, and billing for shops that think in press time and break-point pricing — not in sales-rep pipelines."
        align="center"
      >
        <FeatureGrid features={INDUSTRY_FEATURES} columns={3} />
      </Section>

      {/* 6. COMPARISON BLOCK */}
      <Section
        muted
        eyebrow="vs. the patchwork"
        title="What a print shop gains by moving off the legacy stack."
        align="center"
      >
        <ComparisonMatrix
          competitors={["Legacy MIS + email", "Generic CRM"]}
          rows={COMPARISON_ROWS}
        />
      </Section>

      {/* 7. PRINT-SHOP FAQ */}
      <Section
        eyebrow="Print-shop questions"
        title="The six questions every print-shop owner asks on a demo."
        align="center"
        narrow
      >
        <FAQ items={PRINT_SHOP_FAQ} />
      </Section>

      {/* 8. FINAL CTA */}
      <CTA
        eyebrow="Ready to try it?"
        title="Set up your print shop in an afternoon."
        description="Import customers, seed your SKU catalog, send your first reorder — today."
        primary={{ label: "Start free trial", href: "/signup" }}
        secondary={{ label: "Book a demo", href: "/book-demo" }}
      />
    </>
  );
}
