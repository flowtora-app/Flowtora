import type { Metadata } from "next";
import Link from "next/link";
import { Hero } from "@/components/marketing/Hero";
import { Section } from "@/components/marketing/Section";
import { CTA } from "@/components/marketing/CTA";
import { BentoGrid, type BentoCard } from "@/components/marketing/BentoGrid";
import { ComparisonMatrix, type ComparisonRow } from "@/components/marketing/ComparisonMatrix";
import { FeatureMock } from "@/components/marketing/FeatureMock";

// Features page (Phase 3 upgrade) — 9-category bento narrative.
//
// Structure:
//   1. Compact hero + jump-nav (sticky)
//   2. Nine category sections, each rendered as a bento grid:
//      CRM · Products · Quotes · Proofs · Production · Installs ·
//      Invoicing · Portal · Platform
//   3. Comparison matrix ("Flowtora vs. spreadsheets vs. generic CRM")
//   4. Final CTA
//
// Each category uses a mixed-size grid so the page reads as composed,
// not templated. Hero cards carry the rich visual; small cards are
// the scanning supplement; metric (tall) cards are the proof points.

export const metadata: Metadata = {
  title: "Features — Flowtora",
  description:
    "Every capability in Flowtora — CRM, products, quoting, proofing, production, installs, invoicing, portal, and platform — explained with screenshots and proof points.",
  openGraph: {
    title: "Flowtora features",
    description:
      "One platform for quoting, proofing, production, installs, invoicing, and reports.",
    type: "website",
  },
};

// Nine category sections. Each has an id used by the jump-nav, a
// label for the nav chip, a section-level heading, and an array of
// bento cards that make up its body.
const CATEGORIES: {
  id: string;
  navLabel: string;
  eyebrow: string;
  title: string;
  lede: string;
  cards: BentoCard[];
}[] = [
  {
    id: "crm",
    navLabel: "CRM",
    eyebrow: "Customer & sales",
    title: "A CRM that actually knows what a sign order is.",
    lede: "Contacts, companies, locations, projects — linked the way a shop thinks. Every touch on one page.",
    cards: [
      {
        size: "hero",
        eyebrow: "Unified customer record",
        title: "Every quote, proof, install, and invoice on one timeline.",
        description:
          "When a customer calls, you don't need five tabs. Every action taken on their account is already in the thread — with who did it and when.",
        bullets: [
          "Inbound web inquiry → round-robin assignment",
          "Billing + install address per location",
          "Attachments and notes, versioned with authorship",
        ],
      },
      {
        size: "small",
        eyebrow: "Pipeline",
        title: "Deal stages your reps don't have to fake.",
        description: "Probability, owner, expected close — visible on one Kanban.",
      },
      {
        size: "tall",
        eyebrow: "Concrete",
        title: "",
        metric: { value: "1", label: "Customer record" },
        description:
          "Quote, proof, order, install, invoice — the same thread of work. Zero double-entry between apps.",
      },
      {
        size: "small",
        eyebrow: "Multi-contact",
        title: "AP, ops, and marketing on the same account.",
        description: "Different people care about different things. Route reminders accordingly.",
      },
      {
        size: "wide",
        eyebrow: "Auto-capture",
        title: "Inbound inquiries land with the right rep, already tagged.",
        description:
          "Web form → customer, project, and attachments created in one shot. Round-robin, source tagging, and dedup built in.",
      },
    ],
  },
  {
    id: "products",
    navLabel: "Products",
    eyebrow: "Catalog",
    title: "A product catalog that mirrors your shop floor.",
    lede: "Substrates, hardware, finishes, labor — priced once, reused everywhere. Your price book becomes your quoting superpower.",
    cards: [
      {
        size: "hero",
        eyebrow: "Price book",
        title: "Substrates, finishes, hardware, and labor — all in one place.",
        description:
          "Set a base price, attach a waste factor, and your quotes will use it forever. Update the catalog and every future quote inherits.",
        bullets: [
          "Sq-ft / linear-ft / sheet / piece pricing",
          "Labor rates per department",
          "Option groups (illumination, mounting, wraps)",
        ],
      },
      {
        size: "small",
        eyebrow: "SKUs",
        title: "Reorder templates that save the customer's last spec.",
      },
      {
        size: "small",
        eyebrow: "Variants",
        title: "One product, many finishes — without duplicating the record.",
      },
      {
        size: "tall",
        eyebrow: "Proof",
        title: "",
        metric: { value: "−90%", label: "Re-keying new quotes" },
        description:
          "Shops with a real price book quote in minutes, not hours. The catalog does the math — you pick the options.",
      },
      {
        size: "small",
        eyebrow: "Bulk pricing",
        title: "Tiered runs with automatic break-point logic.",
      },
    ],
  },
  {
    id: "quotes",
    navLabel: "Quotes",
    eyebrow: "Estimating",
    title: "Quotes customers actually read.",
    lede: "Sq-ft, linear-ft, sheet, and piece pricing mix on one quote. Branded PDFs and live web proposals with one-click approval.",
    cards: [
      {
        size: "hero",
        eyebrow: "Quote builder",
        title: "Build a quote in minutes, not hours.",
        description:
          "Start from a template or a previous quote. Line items pull from the price book. Waste factor, markup, and tax just work.",
        visual: <FeatureMock kind="quote" className="w-full" />,
      },
      {
        size: "small",
        eyebrow: "Proposal PDF",
        title: "Branded, on your subdomain — not 'someone-else.com'.",
      },
      {
        size: "small",
        eyebrow: "E-approval",
        title: "One click from your customer, signed + time-stamped.",
      },
      {
        size: "tall",
        eyebrow: "Outcome",
        title: "",
        metric: { value: "4×", label: "Faster quote-to-approval" },
        description: "Measured across shops that moved from email + PDFs to Flowtora proposals.",
        accent: true,
      },
      {
        size: "small",
        eyebrow: "Revisions",
        title: "Copy-from-previous, side-by-side compare.",
      },
    ],
  },
  {
    id: "proofs",
    navLabel: "Proofs",
    eyebrow: "Proofing & approvals",
    title: "Chase fewer approvals. Lose zero rounds.",
    lede: "Share proofs via link, capture annotated sign-offs, keep every round in one thread. Customer sees a clean portal — not five forwarded emails.",
    cards: [
      {
        size: "hero",
        eyebrow: "Proof rounds",
        title: "Pin comments, strike through, approve — in the browser.",
        description:
          "No tools to install. Your customer gets a link, leaves their notes, and signs off when it's right. Every round is archived with a locked audit trail.",
        bullets: [
          "Pin, comment, strike markup tools",
          "Side-by-side round comparison",
          "Legally-sufficient typed e-signature",
        ],
      },
      {
        size: "small",
        eyebrow: "Locked history",
        title: "Approved proofs can't be silently replaced.",
      },
      {
        size: "small",
        eyebrow: "Reminders",
        title: "Auto-nudge on pending proofs — opt-in, off-by-default.",
      },
      {
        size: "wide",
        eyebrow: "Outcome",
        title: "The round count drops. The drama drops with it.",
        description:
          "Customers see one link, one thread, one source of truth. Fewer \"which PDF is latest?\" moments during approval week.",
      },
    ],
  },
  {
    id: "production",
    navLabel: "Production",
    eyebrow: "Shop floor",
    title: "A production board every department actually opens.",
    lede: "Department queues for router, print, vinyl, finishing, and install — each with the fields that department cares about.",
    cards: [
      {
        size: "hero",
        eyebrow: "Department boards",
        title: "Kanban + list view, per department, per station.",
        description:
          "Leads see what's theirs. Owners see the whole floor. Jobs flow through print → finish → QC based on what they need, not a generic kanban.",
        visual: <FeatureMock kind="production" className="w-full" />,
      },
      {
        size: "small",
        eyebrow: "Time tracking",
        title: "Clock-in/clock-out from the station.",
      },
      {
        size: "tall",
        eyebrow: "WIP aging",
        title: "",
        metric: { value: "−22d", label: "AR aging" },
        description:
          "Jobs don't stall silently. When a job sits past its target dwell in a department, it floats to the top.",
      },
      {
        size: "small",
        eyebrow: "Station view",
        title: "Wall-tablet optimized for the shop floor.",
      },
      {
        size: "small",
        eyebrow: "Checklists",
        title: "Per-department QC checklists built in.",
      },
    ],
  },
  {
    id: "installs",
    navLabel: "Installs",
    eyebrow: "Install & field",
    title: "Route the crew, capture the install, push to billing.",
    lede: "The field app runs on any phone. Today's stops with routing, photos, signature on site, and a push-to-bill trigger when install completes.",
    cards: [
      {
        size: "hero",
        eyebrow: "Field app",
        title: "The install crew's job, on their phone.",
        description:
          "Day view with route-optimized stop order and travel estimates. Before/after photos with required-photo enforcement. GPS-stamped sign-off that triggers the balance invoice.",
        bullets: [
          "Route-optimized day view",
          "Required photo checklist per install",
          "On-site customer signature",
        ],
      },
      {
        size: "small",
        eyebrow: "Reconciliation",
        title: "Material pulled vs. returned, per install.",
      },
      {
        size: "small",
        eyebrow: "Push-to-bill",
        title: "Install complete → balance invoice, one tap.",
      },
      {
        size: "wide",
        eyebrow: "Outcome",
        title: "Your crew stops calling the office from the field.",
        description:
          "Completion, photos, signature, and material reconciliation all go through the app. The office sees the install the moment it ends.",
      },
    ],
  },
  {
    id: "invoicing",
    navLabel: "Invoicing",
    eyebrow: "Billing",
    title: "Deposits on the quote, balance on the install, paid in full.",
    lede: "Invoice from the same record. Card + ACH through the portal. AR aging lives in one dashboard — no spreadsheet reconciliation.",
    cards: [
      {
        size: "hero",
        eyebrow: "Invoice + payments",
        title: "One-click from order → invoice → paid.",
        description:
          "Deposit invoice auto-created when quote is approved. Balance invoice auto-created when install completes. Customers pay in the portal.",
        visual: <FeatureMock kind="invoice" className="w-full" />,
      },
      {
        size: "small",
        eyebrow: "Methods",
        title: "Card + ACH via Stripe, plus bank wire reconciliation.",
      },
      {
        size: "small",
        eyebrow: "AR aging",
        title: "Receivables by bucket with one-click 'send reminder'.",
      },
      {
        size: "tall",
        eyebrow: "Outcome",
        title: "",
        metric: { value: "+31%", label: "Deposit capture" },
        description: "Shops that moved from \"net-30, hope for the best\" to deposit-on-approval see immediate AR improvement.",
        accent: true,
      },
      {
        size: "small",
        eyebrow: "Adjustments",
        title: "Credit notes, write-offs, partial payments — audit-logged.",
      },
    ],
  },
  {
    id: "portal",
    navLabel: "Portal",
    eyebrow: "Customer portal",
    title: "A customer portal that looks like your shop, not ours.",
    lede: "Branded subdomain, your logo, your colors. Customers see their quotes, proofs, invoices, and install status in one place.",
    cards: [
      {
        size: "hero",
        eyebrow: "Tenant branding",
        title: "yourshop.flowtora.app — or your own domain.",
        description:
          "Logo, palette, and hero copy per workspace. Custom domain with automatic TLS on the Pro plan. The portal reads as your shop; the tech disappears.",
        bullets: [
          "Per-tenant logo + palette",
          "Custom domain + TLS",
          "Tenant-scoped login + password reset emails",
        ],
      },
      {
        size: "small",
        eyebrow: "What customers see",
        title: "Quotes, proofs, orders, invoices — and nothing else.",
      },
      {
        size: "small",
        eyebrow: "Pay online",
        title: "Balance invoices paid via card or ACH, no extra login.",
      },
      {
        size: "wide",
        eyebrow: "Self-service",
        title: "Reorder templates + project status, so customers stop emailing to ask.",
        description:
          "The phone calls drop off. Customers pull up their own history. Your rep only gets the calls that actually matter.",
      },
    ],
  },
  {
    id: "platform",
    navLabel: "Platform",
    eyebrow: "Platform foundations",
    title: "The cross-cutting pieces that make it work at scale.",
    lede: "RBAC, multi-location, API, audit log — the boring-but-essential infrastructure every growing shop needs.",
    cards: [
      {
        size: "hero",
        eyebrow: "Role-based access",
        title: "Sales can't see payroll. Installers can't edit quotes.",
        description:
          "Granular permissions per role, with branch scoping on Enterprise. The audit log captures every create, update, and delete with user + timestamp.",
        bullets: [
          "Role + permission matrix",
          "Branch scoping (Enterprise)",
          "Immutable audit log",
        ],
      },
      {
        size: "small",
        eyebrow: "Multi-location",
        title: "Every record branch-tagged; HQ rolls it all up.",
      },
      {
        size: "small",
        eyebrow: "Open API",
        title: "REST + webhooks for every entity and lifecycle event.",
      },
      {
        size: "tall",
        eyebrow: "Security",
        title: "",
        metric: { value: "SOC-2", label: "Path documented" },
        description:
          "Encryption at rest, TLS in flight, per-tenant data isolation, and a public security page you can forward to your buyer's IT team.",
      },
      {
        size: "small",
        eyebrow: "Import / export",
        title: "CSV in, CSV out, any time. Your data stays yours.",
      },
    ],
  },
];

// Comparison matrix — Flowtora vs. spreadsheets vs. generic CRM.
// Lifted from the home page earlier; trimmed to what belongs on the
// deep-feature page (no pricing row, focus on capability).
const COMPARISON_ROWS: ComparisonRow[] = [
  {
    capability: "One record from quote to install",
    subcopy: "Customer, quote, proof, order, invoice — same thread.",
    cells: [
      { mark: "yes", note: "Every object linked by design." },
      { mark: "no", note: "Silos + CSV exports." },
      { mark: "partial", note: "Customer + quote, not production." },
    ],
  },
  {
    capability: "Built-in proofing & versioned approvals",
    subcopy: "Send proof, capture signature, keep every round.",
    cells: [
      { mark: "yes", note: "First-class, audit trail included." },
      { mark: "no", note: "Email threads + shared drives." },
      { mark: "partial", note: "Add-on, limited history." },
    ],
  },
  {
    capability: "Shop-floor production board",
    subcopy: "Department queues, checklist-driven jobs, time tracked.",
    cells: [
      { mark: "yes", note: "Per-department routing, out of the box." },
      { mark: "no", note: "Whiteboard in the back." },
      { mark: "partial", note: "Kanban, but no station logic." },
    ],
  },
  {
    capability: "Install field app (phone-first)",
    subcopy: "Crew executes checklist, photo-tags the job, gets sig.",
    cells: [
      { mark: "yes", note: "Same account, same record." },
      { mark: "no", note: "Text messages + camera roll." },
      { mark: "no", note: "Add a second app." },
    ],
  },
  {
    capability: "Deposits + balance from one order",
    subcopy: "Card, ACH, reconciled against the order.",
    cells: [
      { mark: "yes", note: "One-click invoice → paid." },
      { mark: "partial", note: "Invoice tool, no linkage." },
      { mark: "partial", note: "Separate billing module." },
    ],
  },
  {
    capability: "Multi-location, branch-scoped",
    subcopy: "Per-branch catalogs, shared reporting roll-up.",
    cells: [
      { mark: "yes", note: "Designed in." },
      { mark: "no", note: "One sheet per shop." },
      { mark: "partial", note: "Workspaces, no branch scoping." },
    ],
  },
  {
    capability: "Branded customer portal",
    subcopy: "Your logo, your subdomain, one login.",
    cells: [
      { mark: "yes", note: "Tenant-branded, custom domain." },
      { mark: "no", note: "Portal? What portal." },
      { mark: "partial", note: "Generic, not tenant-branded." },
    ],
  },
  {
    capability: "Open API + webhooks",
    subcopy: "REST for every entity, webhook for every event.",
    cells: [
      { mark: "yes", note: "Documented + versioned." },
      { mark: "no", note: "Copy-paste only." },
      { mark: "partial", note: "Some endpoints, no webhooks." },
    ],
  },
  {
    capability: "SOC-2 path + audit log",
    subcopy: "Documented controls, immutable audit trail.",
    cells: [
      { mark: "yes", note: "Public security page + log." },
      { mark: "no", note: "Not in scope." },
      { mark: "partial", note: "Log, no security page." },
    ],
  },
  {
    capability: "Honest, no-hidden-tier pricing",
    subcopy: "Every plan, every feature, visible.",
    cells: [
      { mark: "yes", note: "Same for year 1 and year 3." },
      { mark: "yes", note: "Free." },
      { mark: "partial", note: "Enterprise = 'call us'." },
    ],
  },
  {
    capability: "Import & export, always",
    subcopy: "CSV in, CSV out, any time.",
    cells: [
      { mark: "yes", note: "Your data stays yours." },
      { mark: "yes", note: "It's a spreadsheet." },
      { mark: "partial", note: "Export-on-cancel only." },
    ],
  },
  {
    capability: "Built for shops, not agencies",
    subcopy: "The vocabulary and workflows match how you actually work.",
    cells: [
      { mark: "yes", note: "Purpose-built from day one." },
      { mark: "partial", note: "You customize it yourself." },
      { mark: "no", note: "Generic SaaS vocabulary." },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <Hero
        eyebrow={<>Every corner of the shop</>}
        title={<>The full platform, explained.</>}
        description={
          <>
            Nine deep categories — CRM, products, quotes, proofs,
            production, installs, invoicing, portal, and platform —
            with screenshots and proof points for each.
          </>
        }
        primary={{ label: "Start free trial", href: "/signup" }}
        secondary={{ label: "See pricing", href: "/pricing" }}
      />

      {/* Sticky jump-nav — 9 category chips. Only the active section
          highlights; we use a CSS-only pseudo-active via anchor hover
          for now and skip scroll-spy to keep this page static. */}
      <div
        className="sticky top-16 z-20 backdrop-blur"
        style={{
          background: "color-mix(in oklab, var(--surface-0) 90%, transparent)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div className="mx-auto flex w-full max-w-6xl items-center gap-1.5 overflow-x-auto px-6 py-3 text-xs">
          {CATEGORIES.map((c) => (
            <a
              key={c.id}
              href={`#${c.id}`}
              className="whitespace-nowrap rounded-full px-3 py-1.5 font-medium transition-colors hover:brightness-110"
              style={{
                background: "var(--surface-2)",
                color: "var(--text-muted)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              {c.navLabel}
            </a>
          ))}
        </div>
      </div>

      {CATEGORIES.map((cat, i) => (
        <Section
          key={cat.id}
          id={cat.id}
          muted={i % 2 === 1}
          eyebrow={cat.eyebrow}
          title={cat.title}
          description={cat.lede}
          align="left"
        >
          <BentoGrid cards={cat.cards} />
        </Section>
      ))}

      <Section
        muted
        id="compare"
        eyebrow="vs. the usual alternatives"
        title="What you get that the patchwork can't."
        description="Most shops we talk to are piecing together 3–4 tools. Here's how a single purpose-built platform stacks against that."
        align="center"
      >
        <ComparisonMatrix
          competitors={["Spreadsheets + email", "Generic CRM"]}
          rows={COMPARISON_ROWS}
        />
      </Section>

      <Section align="center">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            className="text-2xl font-semibold tracking-tight md:text-3xl"
            style={{ color: "var(--text-default)" }}
          >
            Want to see it running on your data?
          </h2>
          <p
            className="mt-3 text-base leading-relaxed"
            style={{ color: "var(--text-muted)" }}
          >
            Start the free trial and import your customers, or book a demo and
            we&apos;ll walk through your exact workflow.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/signup"
              className="inline-flex h-11 items-center rounded-md px-6 text-sm font-medium"
              style={{
                background: "var(--accent-primary)",
                color: "var(--accent-fg)",
              }}
            >
              Start free trial
            </Link>
            <Link
              href="/book-demo"
              className="inline-flex h-11 items-center rounded-md px-6 text-sm font-medium"
              style={{
                background: "var(--surface-1)",
                color: "var(--text-default)",
                border: "1px solid var(--border-default)",
              }}
            >
              Book a demo
            </Link>
          </div>
        </div>
      </Section>

      <CTA
        eyebrow="Start today"
        title="Your 14-day trial is fully loaded."
        description="Every feature on this page is available during the trial. No credit card. No feature-gating tricks."
        primary={{ label: "Start free trial", href: "/signup" }}
        secondary={{ label: "See pricing", href: "/pricing" }}
      />
    </>
  );
}
