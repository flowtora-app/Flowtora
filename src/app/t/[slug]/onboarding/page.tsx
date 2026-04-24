import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";

// Phase 4 (transformation) — onboarding is now a checklist, not a
// wizard.
//
// The old flow had 5 sub-route pages (business / branding / defaults /
// team / sample) each with their own form. Every form duplicated a
// settings surface that already existed — same fields, same actions,
// different copy. That's two places to maintain one piece of data, and
// it made "did I set this up already?" unknowable without hunting.
//
// Now: a single /onboarding landing renders a 5-item checklist. Each
// item deep-links to the real Settings page with `?hl=<stepId>` so the
// OnboardingBanner can surface the onboarding context on the settings
// page and link back here. The five legacy sub-routes
// (/onboarding/business etc.) still answer — see each route's
// page.tsx; they now redirect to the corresponding settings page so
// bookmarks and stored links keep working.
//
// Completion is inferred from data: logo present? team seats used?
// demo loaded? We don't track a separate "onboarding_completed" flag
// because the signal lives in the underlying records and mirrors the
// settings page's source-of-truth.

type ChecklistItem = {
  id: string;
  title: string;
  description: string;
  /** Where to send the user. The ?hl= param lights up the banner on
   *  arrival so they know they're in an onboarding context. */
  href: (slug: string) => string;
  /** True when the underlying data proves this step is done. */
  done: boolean;
};

export default async function OnboardingChecklist({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant } = await requireTenant(slug);

  // Data-driven progress signals.
  const [memberCount, demoCustomerCount] = await Promise.all([
    db.membership.count({ where: { tenantId: tenant.id } }),
    db.customer.count({ where: { tenantId: tenant.id, tags: { has: "demo" } } }),
  ]);

  const hasBrandedProfile =
    !!tenant.logoUrl || !!tenant.brandPrimaryColor || !!tenant.phone;
  const hasAddress = !!tenant.addressLine1;
  const hasNumberingPrefix =
    !!tenant.quoteNumberPrefix || !!tenant.invoiceNumberPrefix;

  const items: ChecklistItem[] = [
    {
      id: "business",
      title: "Shop identity",
      description: "Name, brand color, and customer-facing sender on emails.",
      href: (s) => `/t/${s}/settings/profile?hl=business`,
      done: hasBrandedProfile,
    },
    {
      id: "branding",
      title: "Contact & location",
      description: "Logo, address, phone, website — what prints on quotes and invoices.",
      href: (s) => `/t/${s}/settings/profile?hl=branding`,
      done: hasAddress && !!tenant.logoUrl,
    },
    {
      id: "defaults",
      title: "Numbering & financial defaults",
      description: "Prefixes for quotes/orders/invoices, default tax rate, deposits, and payment terms.",
      href: (s) => `/t/${s}/settings/numbering?hl=defaults`,
      done: hasNumberingPrefix,
    },
    {
      id: "team",
      title: "Invite your team",
      description: "Add the people who'll run Flowtora alongside you.",
      href: (s) => `/t/${s}/settings/team?hl=team`,
      done: memberCount > 1,
    },
    {
      id: "sample",
      title: "Demo data (optional)",
      description: "Load a demo shop so you can explore the full product before real data exists.",
      href: (s) => `/t/${s}/settings/sample-data?hl=sample`,
      done: demoCustomerCount > 0,
    },
  ];

  const completedCount = items.filter((i) => i.done).length;

  return (
    <div className="space-y-6">
      <section
        className="rounded-xl p-6"
        style={{
          background: "var(--accent-surface)",
          border: "1px solid var(--accent-surface-strong, var(--accent-primary))",
        }}
      >
        <h2
          className="text-base font-semibold"
          style={{ color: "var(--accent-primary)" }}
        >
          Welcome to Flowtora
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--text-default)" }}>
          Five short steps to set up {tenant.name}. Each one opens the
          matching settings page so there's one place to change this
          later — no wizard-only forms to re-find.
        </p>
        <p
          className="mt-2 text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          {completedCount} of {items.length} complete.
        </p>
      </section>

      <ol className="grid gap-3">
        {items.map((item, i) => (
          <li key={item.id}>
            <Link
              href={item.href(slug)}
              className="flex items-start gap-4 rounded-lg p-4 transition-colors"
              style={{
                background: "var(--surface-1)",
                border: `1px solid ${item.done ? "var(--accent-primary)" : "var(--border-subtle)"}`,
              }}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                style={{
                  background: item.done ? "var(--accent-primary)" : "var(--surface-2)",
                  color: item.done ? "var(--accent-fg)" : "var(--text-default)",
                }}
                aria-hidden
              >
                {item.done ? "✓" : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className="text-sm font-semibold"
                  style={{ color: "var(--text-default)" }}
                >
                  {item.title}
                </div>
                <div
                  className="mt-0.5 text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  {item.description}
                </div>
              </div>
              <span
                className="shrink-0 text-sm"
                style={{ color: "var(--text-faint)" }}
                aria-hidden
              >
                →
              </span>
            </Link>
          </li>
        ))}
      </ol>

      <div className="flex items-center justify-between pt-2">
        <p className="text-xs" style={{ color: "var(--text-faint)" }}>
          Everything on this list is editable in Settings at any time.
        </p>
        <Link
          href={`/t/${slug}/onboarding/done`}
          className="text-sm underline"
          style={{ color: "var(--accent-primary)" }}
        >
          Skip the rest &amp; finish
        </Link>
      </div>
    </div>
  );
}
