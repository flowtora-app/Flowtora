import type { Metadata } from "next";
import Link from "next/link";
import { Hero } from "@/components/marketing/Hero";
import { Section } from "@/components/marketing/Section";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { CTA } from "@/components/marketing/CTA";

// Phase 18 Slice C — /features.
//
// Deep-dive feature page. The landing page lists six headline
// capabilities with one-sentence blurbs; this page takes the same six
// and gives each its own anchored section with screenshots, sub-feature
// lists, and "how it fits your day" framing.

export const metadata: Metadata = {
  title: "Features — Flowtora",
  description:
    "Every capability in Flowtora, explained. CRM, quoting, proofing, production boards, install routing, invoicing, and reporting — purpose-built for sign and print shops.",
  openGraph: {
    title: "Flowtora features",
    description:
      "One platform for quoting, proofing, production, installs, invoicing, and reports.",
    type: "website",
  },
};

// Sections are anchored so the sub-nav can jump to them.
const PILLARS = [
  {
    id: "crm",
    eyebrow: "Customer & sales",
    title: "A CRM that actually knows what a sign order is.",
    blurb:
      "Contacts, companies, locations, projects — all linked the way a shop thinks. Phone logs, emails, quote history, and payment status on a single page for every customer.",
    bullets: [
      "Unified customer timeline: calls, emails, quotes, orders, invoices, proofs, installs.",
      "Multiple contacts and billing vs. install addresses per customer.",
      "Pipeline view with stage probability and rep ownership.",
      "Attachments and notes on every record, versioned with authorship.",
      "Auto-capture for inbound web inquiries, with rep round-robin.",
    ],
  },
  {
    id: "quoting",
    eyebrow: "Estimating",
    title: "Quotes the way you price, not the way software wants you to.",
    blurb:
      "Sq-ft, linear-ft, sheet, and piece pricing mix freely on one quote. Build a price book with substrates, finishes, and add-ons — customers see a clean proposal with one-click e-approval.",
    bullets: [
      "Price book with substrates, finishes, hardware, and labor rates.",
      "Sq-ft and linear-ft line items with built-in waste factor math.",
      "Option groups (illumination, mounting, finishing) as optional line items.",
      "Branded proposal PDFs and a live web proposal with e-approval.",
      "Revision history, comparison view, and copy-from-previous-quote.",
    ],
  },
  {
    id: "proofing",
    eyebrow: "Proofing & approvals",
    title: "Chase fewer approvals. Lose zero rounds.",
    blurb:
      "Send proofs with a share link, capture the customer's annotated sign-off, keep every round in one thread. The customer sees one portal — not five forwarded emails.",
    bullets: [
      "Proof rounds with markup tools: pin comments, strikethrough, approve.",
      "Approve-with-typed-name e-signature (legally sufficient, audit-logged).",
      "Side-by-side round comparison for fast review meetings.",
      "Automatic reminder cadence on pending proofs.",
      "Locked history: approved proofs can't be silently replaced.",
    ],
  },
  {
    id: "production",
    eyebrow: "Shop floor",
    title: "A production board every department actually uses.",
    blurb:
      "Department queues for router, print, vinyl, finishing, and install — each with the fields that department cares about. Leads see what's theirs. Owners see the whole floor, end-of-day.",
    bullets: [
      "Department boards (Kanban + list) with per-department checklists.",
      "Job-level time tracking with clock-in/clock-out from the station.",
      "Material linkage so substrates auto-deduct from on-hand inventory.",
      "WIP aging alerts when a job sits past its target dwell time.",
      "Mobile-optimized station view for wall-mounted tablets.",
    ],
  },
  {
    id: "installs",
    eyebrow: "Install & field",
    title: "Route the crew, capture the install, invoice the balance.",
    blurb:
      "The field app runs on any phone. Crews see today's stops with routing, upload install photos, capture the customer signature on site, and push the job to 'installed' without calling the office.",
    bullets: [
      "Day view with route-optimized stop order and travel estimates.",
      "Photo capture (before/after) with required-photo enforcement.",
      "On-site signature + GPS-stamped completion record.",
      "Material pulled vs. returned reconciliation per install.",
      "Push-to-bill trigger that auto-generates the balance invoice.",
    ],
  },
  {
    id: "invoicing",
    eyebrow: "Billing",
    title: "Deposits on the quote, balance on the install, paid in full.",
    blurb:
      "Invoice from the same record that started as a quote. Customers pay via card or ACH through the portal. AR aging lives in one dashboard — no spreadsheet reconciliation.",
    bullets: [
      "Deposit invoices auto-created from approved quotes.",
      "Balance invoices auto-created from completed installs.",
      "Stripe card + ACH, plus bank transfer with remittance reconciliation.",
      "Partial payments, credit notes, and write-offs with audit trail.",
      "AR aging dashboard with one-click 'send reminder' for overdue accounts.",
    ],
  },
  {
    id: "reports",
    eyebrow: "Analytics",
    title: "Reports written by someone who's run a shop.",
    blurb:
      "Revenue by location, margin by product family, rep leaderboards, WIP aging, install efficiency. The shop-owner dashboard, not the consultant deck.",
    bullets: [
      "Revenue: by month, by rep, by location, by product family.",
      "Margin: gross margin per order with materials + labor rolled in.",
      "WIP aging: jobs stuck in a department past target dwell.",
      "AR aging: receivables by bucket with per-customer drill-down.",
      "Saved views and scheduled CSV/PDF email delivery.",
    ],
  },
];

const CROSS_CUTTING = [
  {
    icon: "🔐",
    title: "Role-based access control",
    description:
      "Granular permissions per role. Sales can't see payroll. Installers can't edit quotes. Advanced RBAC with branch scoping ships on Enterprise.",
  },
  {
    icon: "🏢",
    title: "Multi-location ready",
    description:
      "Every record is branch-tagged. Each location runs its own queues, price book, and reports, while HQ sees the consolidated roll-up.",
  },
  {
    icon: "🔗",
    title: "Open API + webhooks",
    description:
      "REST API for every entity, webhook events for every lifecycle change. Pipe Flowtora into QuickBooks, Slack, or your BI stack.",
  },
  {
    icon: "📥",
    title: "Import & export",
    description:
      "CSV import for customers, products, and price books. Export anything to CSV, anytime. Your data is always yours.",
  },
  {
    icon: "🕒",
    title: "Audit log",
    description:
      "Every create/update/delete tagged with user, timestamp, and before/after. Compliance-friendly and indispensable when you're debugging a 'who changed this?' moment.",
  },
  {
    icon: "💬",
    title: "Human support",
    description:
      "Real humans with shop-floor background on email and chat. Enterprise plans get a named success manager and a priority SLA.",
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
            Seven integrated pillars — CRM, quoting, proofing, production,
            installs, invoicing, and reports — plus the cross-cutting pieces
            (RBAC, multi-location, API) that make Flowtora work at scale.
          </>
        }
        primary={{ label: "Start free trial", href: "/signup" }}
        secondary={{ label: "See pricing", href: "/pricing" }}
      />

      {/* Sub-nav strip — anchors for the seven pillars. */}
      <div
        className="sticky top-16 z-20 backdrop-blur"
        style={{
          background: "color-mix(in oklab, var(--surface-0) 90%, transparent)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div className="mx-auto flex w-full max-w-6xl items-center gap-1 overflow-x-auto px-6 py-3 text-xs">
          {PILLARS.map((p) => (
            <a
              key={p.id}
              href={`#${p.id}`}
              className="whitespace-nowrap rounded-full px-3 py-1 font-medium transition-colors hover:brightness-110"
              style={{
                background: "var(--surface-2)",
                color: "var(--text-muted)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              {p.eyebrow}
            </a>
          ))}
        </div>
      </div>

      {PILLARS.map((p, i) => (
        <Section
          key={p.id}
          id={p.id}
          muted={i % 2 === 1}
          eyebrow={p.eyebrow}
          title={p.title}
          description={p.blurb}
          align="left"
        >
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-5">
            <ul className="space-y-4 lg:col-span-3">
              {p.bullets.map((b, bi) => (
                <li key={bi} className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                    style={{
                      background: "var(--success-surface)",
                      color: "var(--success-fg)",
                    }}
                  >
                    ✓
                  </span>
                  <span
                    className="text-base leading-relaxed"
                    style={{ color: "var(--text-default)" }}
                  >
                    {b}
                  </span>
                </li>
              ))}
            </ul>
            <div
              className="flex min-h-[240px] items-center justify-center rounded-xl p-6 lg:col-span-2"
              style={{
                background:
                  "linear-gradient(135deg, var(--accent-surface) 0%, var(--surface-1) 100%)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div className="text-center">
                <div
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--accent-primary)" }}
                >
                  {p.eyebrow}
                </div>
                <div
                  className="mt-2 text-sm"
                  style={{ color: "var(--text-muted)" }}
                >
                  Screenshot coming soon
                </div>
              </div>
            </div>
          </div>
        </Section>
      ))}

      <Section
        muted
        eyebrow="Platform foundations"
        title="The cross-cutting pieces that make it work at scale."
        description="The boring-but-essential infrastructure every growing shop ends up needing."
        align="center"
      >
        <FeatureGrid features={CROSS_CUTTING} columns={3} />
      </Section>

      <Section align="center">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            className="text-2xl font-semibold tracking-tight md:text-3xl"
            style={{ color: "var(--text-default)" }}
          >
            Want to see how your shop would use it?
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
              href="/contact"
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
