// Phase 4 Slice B — activation score + next-best-action engine.
//
// `loadOnboardingProgress` in src/lib/onboarding.ts already counts the
// six binary milestones (setup finished, first customer, first product,
// first sent quote, first teammate, first invoice). That's useful as a
// visible checklist but it's a poor signal on its own — "6 of 6" could
// mean "this shop is thriving" OR "they created one dummy customer,
// one dummy quote, and one $0 invoice to make the checklist go green".
//
// This module layers on a WEIGHTED activation score that captures both
// completion AND depth. The score is the sum of each dimension's weight
// × its 0-1 saturation. Example: a shop with 15 customers, 8 products,
// 3 sent quotes and 1 paid invoice gets a much higher score than one
// with 1-1-1-0 even though both would read "4 of 6" on the old list.
//
// We use the score for two things:
//   1. An activation gauge on the dashboard (replacing the ring).
//   2. Picking up to three CONTEXTUAL next-best actions — not just the
//      next undone milestone, but the action that will most move the
//      needle given the current saturations.
//
// Everything still fits in one Promise.all of count()s. We deliberately
// avoid joins; the goal is "runs on every dashboard load without a
// measurable hit."

import { db } from "@/lib/db";
import type { Tenant, TenantRole } from "@prisma/client";

export type ActivationDimensionKey =
  | "setup"
  | "customers"
  | "products"
  | "quotes_sent"
  | "quotes_won"
  | "team"
  | "invoices"
  | "paid";

export interface ActivationDimension {
  key: ActivationDimensionKey;
  label: string;
  /** How many "done" units exist right now. */
  count: number;
  /** The target at which the dimension is considered fully saturated. */
  target: number;
  /** 0–1 saturation. Clamped. */
  saturation: number;
  /** Weight toward the overall score. Sum across all dims = 100. */
  weight: number;
}

export interface NextBestAction {
  id: string;
  title: string;
  body: string;
  href: string;
  /** Primary (accent) or secondary (neutral) styling. */
  emphasis: "primary" | "secondary";
  /** For analytics / telemetry later. */
  dimension: ActivationDimensionKey;
}

export interface ActivationReport {
  dimensions: ActivationDimension[];
  /** Weighted score 0–100. */
  score: number;
  /** Qualitative tier — drives widget color + banner behavior. */
  tier: "new" | "early" | "growing" | "established";
  /** Up to three recommended actions, ordered most-impact first. */
  actions: NextBestAction[];
  /** Retained for the legacy ordered checklist view. */
  milestones: { key: string; label: string; done: boolean; href: string }[];
}

// Weight table. Total = 100.
//
// The shape is opinionated:
//   - Setup is a small up-front weight — once it's done it's done forever,
//     so keeping it low leaves room for the score to grow as they use
//     the product.
//   - Customers + products form the foundation. They should dominate early.
//   - Quotes SENT and WON are separate dimensions: sending is an
//     activation signal, winning is a retention signal.
//   - Team + invoicing + paid cash each carry meaningful weight because
//     they're the harder-to-reach milestones.
const WEIGHTS: Record<ActivationDimensionKey, number> = {
  setup: 8,
  customers: 15,
  products: 15,
  quotes_sent: 15,
  quotes_won: 12,
  team: 10,
  invoices: 10,
  paid: 15,
};

// Targets that count as "fully saturated" for each dimension.
//
// These are tuned to reflect what a healthy shop looks like in the first
// 2-4 weeks of using Flowtora — NOT their steady state. A shop running
// 15 customers and 8 products through the system has crossed the chasm
// from "evaluating" to "committed".
const TARGETS: Record<ActivationDimensionKey, number> = {
  setup: 1,
  customers: 15,
  products: 8,
  quotes_sent: 5,
  quotes_won: 2,
  team: 3, // owner + 2 teammates
  invoices: 3,
  paid: 1,
};

export async function loadActivationReport(
  tenant: Pick<Tenant, "id" | "onboardingCompletedAt">,
  role: TenantRole,
): Promise<ActivationReport> {
  const [
    customerCount,
    productCount,
    sentQuoteCount,
    wonQuoteCount,
    memberCount,
    invoiceCount,
    paidInvoiceCount,
  ] = await Promise.all([
    db.customer.count({ where: { tenantId: tenant.id } }),
    db.product.count({ where: { tenantId: tenant.id, active: true } }),
    db.quote.count({
      where: { tenantId: tenant.id, status: { not: "DRAFT" } },
    }),
    db.quote.count({
      where: { tenantId: tenant.id, status: "APPROVED" },
    }),
    db.membership.count({
      where: { tenantId: tenant.id, status: "ACTIVE" },
    }),
    db.invoice.count({ where: { tenantId: tenant.id } }),
    db.invoice.count({
      where: { tenantId: tenant.id, status: "PAID" },
    }),
  ]);

  const dims: ActivationDimension[] = [
    dim("setup", "Account setup", tenant.onboardingCompletedAt ? 1 : 0),
    dim("customers", "Customers added", customerCount),
    dim("products", "Products in catalog", productCount),
    dim("quotes_sent", "Quotes sent", sentQuoteCount),
    dim("quotes_won", "Quotes won", wonQuoteCount),
    dim("team", "Team members active", memberCount),
    dim("invoices", "Invoices generated", invoiceCount),
    dim("paid", "Payments collected", paidInvoiceCount),
  ];

  const score = Math.round(
    dims.reduce((acc, d) => acc + d.saturation * d.weight, 0),
  );

  const tier: ActivationReport["tier"] =
    score >= 85 ? "established" : score >= 60 ? "growing" : score >= 30 ? "early" : "new";

  const actions = pickActions(dims, tenant, role);
  const milestones = buildMilestones(dims, tenant);

  return { dimensions: dims, score, tier, actions, milestones };
}

function dim(
  key: ActivationDimensionKey,
  label: string,
  count: number,
): ActivationDimension {
  const target = TARGETS[key];
  const saturation = Math.max(0, Math.min(1, count / target));
  return { key, label, count, target, saturation, weight: WEIGHTS[key] };
}

function pickActions(
  dims: ActivationDimension[],
  tenant: Pick<Tenant, "id">,
  role: TenantRole,
): NextBestAction[] {
  // Priority ordering: pick the dimensions with the biggest weighted gap
  // (weight × (1 - saturation)). The highest gap is the most impactful
  // recommendation — doing *that* one thing moves the score the most.
  const canManage = role === "OWNER" || role === "ADMIN";
  const scored = dims
    .map((d) => ({ d, gap: d.weight * (1 - d.saturation) }))
    .filter((x) => x.gap > 0)
    .sort((a, b) => b.gap - a.gap);

  const actions: NextBestAction[] = [];
  const base = ""; // hrefs are tenant-relative, layer prepends /t/[slug]

  for (const { d } of scored) {
    if (actions.length >= 3) break;
    const action = buildAction(d, { base, canManage });
    if (action) actions.push(action);
  }

  // Ensure at least one action if dims are all fully saturated — point
  // them at the reports page as a "next level" nudge.
  if (actions.length === 0) {
    actions.push({
      id: "explore-reports",
      title: "You're fully activated — dig into reports",
      body: "Your workspace is humming. Head to Reports to see win-rate, aged receivables, and production throughput.",
      href: `/reports`,
      emphasis: "secondary",
      dimension: "paid",
    });
  }
  return actions;
}

function buildAction(
  d: ActivationDimension,
  opts: { base: string; canManage: boolean },
): NextBestAction | null {
  const emphasis: "primary" | "secondary" = d.saturation === 0 ? "primary" : "secondary";
  switch (d.key) {
    case "setup":
      if (!opts.canManage) return null;
      return {
        id: "finish-setup",
        title: "Finish account setup",
        body: "Branding, tax rate, and numbering — the basics customers see on every quote.",
        href: `/onboarding`,
        emphasis,
        dimension: "setup",
      };
    case "customers":
      return {
        id: "add-customer",
        title:
          d.count === 0
            ? "Add your first customer"
            : `Grow your customer list (${d.count} of ~${d.target})`,
        body:
          d.count === 0
            ? "Everything else in Flowtora hangs off a customer. Enter a walk-in or import your first lead."
            : "Most shops have a dozen or more active customers in their first month — keep building out your CRM.",
        href: `/customers/new`,
        emphasis,
        dimension: "customers",
      };
    case "products":
      return {
        id: "add-product",
        title:
          d.count === 0
            ? "Add a product to the catalog"
            : `Expand your catalog (${d.count} items)`,
        body:
          d.count === 0
            ? "Load at least one item you sell — with pricing and options — so quoting works without typing every line from scratch."
            : "Quoting gets 10× faster once your top sellers are one click away. Aim for your 8 most common items first.",
        href: `/products/new`,
        emphasis,
        dimension: "products",
      };
    case "quotes_sent":
      return {
        id: "send-quote",
        title:
          d.count === 0 ? "Send your first quote" : `Keep the quotes flowing (${d.count} sent)`,
        body:
          d.count === 0
            ? "Create a quote and email it — customers can approve from a link, no login needed."
            : "Sending more quotes is the #1 predictor of a healthy sales pipeline.",
        href: `/quotes`,
        emphasis,
        dimension: "quotes_sent",
      };
    case "quotes_won":
      return {
        id: "win-quote",
        title: "Close a quote",
        body:
          "Once a customer accepts, convert the quote into an order in one click. That's where Flowtora pays for itself.",
        href: `/quotes?status=SENT`,
        emphasis,
        dimension: "quotes_won",
      };
    case "team":
      if (!opts.canManage) return null;
      return {
        id: "invite-teammate",
        title:
          d.count <= 1
            ? "Invite a teammate"
            : `Add another seat (${d.count} active)`,
        body:
          d.count <= 1
            ? "Bring in one more user — designer, CSR, or production lead. Flowtora gets more valuable with every collaborator."
            : "Each additional role (sales, design, install) unlocks workflows the solo user can't see.",
        href: `/settings/team`,
        emphasis,
        dimension: "team",
      };
    case "invoices":
      return {
        id: "issue-invoice",
        title: d.count === 0 ? "Issue your first invoice" : "Invoice more of your work",
        body:
          d.count === 0
            ? "Convert an accepted quote into an invoice — deposit, final, or single-shot, your call."
            : "Shops that invoice every completed order see 40 % faster cash collection.",
        href: `/invoices`,
        emphasis,
        dimension: "invoices",
      };
    case "paid":
      return {
        id: "collect-payment",
        title: d.count === 0 ? "Collect your first payment" : "Keep cash moving",
        body:
          d.count === 0
            ? "Record a payment (card, ACH, check) against an open invoice and watch your aging drop."
            : "Mark recent payments so dashboards stay accurate and overdue nudges don't fire on already-paid invoices.",
        href: `/invoices?scope=open`,
        emphasis,
        dimension: "paid",
      };
  }
  return null;
}

function buildMilestones(
  dims: ActivationDimension[],
  tenant: Pick<Tenant, "onboardingCompletedAt">,
): ActivationReport["milestones"] {
  const findCount = (k: ActivationDimensionKey) =>
    dims.find((d) => d.key === k)?.count ?? 0;

  return [
    {
      key: "setup_finished",
      label: "Finish account setup",
      done: tenant.onboardingCompletedAt !== null,
      href: "/onboarding",
    },
    { key: "first_customer", label: "Add your first customer", done: findCount("customers") > 0, href: "/customers/new" },
    { key: "first_product", label: "Add a product", done: findCount("products") > 0, href: "/products/new" },
    { key: "first_quote", label: "Send a quote", done: findCount("quotes_sent") > 0, href: "/quotes" },
    { key: "first_teammate", label: "Invite a teammate", done: findCount("team") > 1, href: "/settings/team" },
    { key: "first_invoice", label: "Generate an invoice", done: findCount("invoices") > 0, href: "/invoices" },
    { key: "first_payment", label: "Collect a payment", done: findCount("paid") > 0, href: "/invoices?scope=open" },
  ];
}

/**
 * Whether the persistent "finish setup" banner should appear for the
 * given tenant + role. Owner/admin only; score below 50; dismissal
 * older than 7 days OR never dismissed.
 */
export function shouldShowActivationBanner(
  tenant: Pick<Tenant, "activationDismissedAt">,
  role: TenantRole,
  score: number,
): boolean {
  if (role !== "OWNER" && role !== "ADMIN") return false;
  if (score >= 50) return false;
  const dismissed = tenant.activationDismissedAt;
  if (!dismissed) return true;
  const ageMs = Date.now() - dismissed.getTime();
  return ageMs > 7 * 24 * 60 * 60 * 1000;
}
