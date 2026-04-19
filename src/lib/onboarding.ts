// Phase 17 Slice D — onboarding-progress checklist.
//
// The tenant's onboarding wizard sets `onboardingCompletedAt` when they
// finish the initial setup questions — but that only captures the
// "account configured" milestone. The six-step checklist here measures
// "are you actually USING the product" and powers the dashboard tile so
// shops have a visible nudge toward activation.
//
// Each check is a cheap count(*); total page cost = 6 × COUNT which
// Postgres answers in single-digit ms for our volumes. We could cache
// on Tenant later if the dashboard load profile warrants it.

import { db } from "@/lib/db";

export type OnboardingStep = {
  key:
    | "setup_finished"
    | "first_customer"
    | "first_product"
    | "first_quote"
    | "first_teammate"
    | "first_invoice";
  label: string;
  description: string;
  href: string;       // relative to /t/[slug], e.g. "/customers/new"
  done: boolean;
};

export type OnboardingProgress = {
  steps: OnboardingStep[];
  completed: number;
  total: number;
  percent: number;
  allDone: boolean;
};

export async function loadOnboardingProgress(tenant: {
  id: string;
  onboardingCompletedAt: Date | null;
}): Promise<OnboardingProgress> {
  const [customerCount, productCount, sentQuoteCount, memberCount, invoiceCount] = await Promise.all([
    db.customer.count({ where: { tenantId: tenant.id } }),
    db.product.count({ where: { tenantId: tenant.id, active: true } }),
    // "Sent a quote" = at least one quote past DRAFT. That's the meaningful
    // activation signal — creating a DRAFT and abandoning it doesn't count.
    db.quote.count({ where: { tenantId: tenant.id, status: { not: "DRAFT" } } }),
    // >1 means they invited at least one teammate. Owner-only workspaces are
    // still valid; the checklist nudges them to try the collaboration features.
    db.membership.count({ where: { tenantId: tenant.id, status: "ACTIVE" } }),
    db.invoice.count({ where: { tenantId: tenant.id } }),
  ]);

  const steps: OnboardingStep[] = [
    {
      key: "setup_finished",
      label: "Finish account setup",
      description: "Shop profile, timezone, tax rate, branding.",
      href: "/onboarding",
      done: tenant.onboardingCompletedAt !== null,
    },
    {
      key: "first_customer",
      label: "Add your first customer",
      description: "Pull a real lead or walk-in into the CRM.",
      href: "/customers/new",
      done: customerCount > 0,
    },
    {
      key: "first_product",
      label: "Add a product",
      description: "Load at least one item you sell so quoting works.",
      href: "/products/new",
      done: productCount > 0,
    },
    {
      key: "first_quote",
      label: "Send a quote",
      description: "Email or link-share a quote to a customer.",
      href: "/quotes",
      done: sentQuoteCount > 0,
    },
    {
      key: "first_teammate",
      label: "Invite a teammate",
      description: "Bring in one more user — designer, CSR, or production.",
      href: "/settings/team",
      done: memberCount > 1,
    },
    {
      key: "first_invoice",
      label: "Generate an invoice",
      description: "Convert an accepted quote or paid order into an invoice.",
      href: "/invoices",
      done: invoiceCount > 0,
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  const total = steps.length;
  return {
    steps,
    completed,
    total,
    percent: Math.round((completed / total) * 100),
    allDone: completed === total,
  };
}
