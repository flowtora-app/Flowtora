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
  const progressPct = Math.round((completedCount / items.length) * 100);

  return (
    <div className="space-y-5">
      {/* Welcome header — premium card with accent halo + progress bar. */}
      <section
        className="relative overflow-hidden rounded-2xl"
        style={{
          padding: "24px 26px",
          background:
            "radial-gradient(720px circle at -8% -40%, var(--accent-surface), transparent 55%), " +
            "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
          border: "1px solid var(--border-subtle)",
          boxShadow:
            "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
            "0 1px 2px 0 rgba(0,0,0,0.18)",
        }}
      >
        <div className="flex items-start gap-3.5">
          <span
            aria-hidden
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              height: 44,
              borderRadius: 11,
              background:
                "linear-gradient(135deg, var(--accent-surface-strong), var(--accent-surface))",
              color: "var(--accent-primary)",
              border:
                "1px solid color-mix(in oklab, var(--accent-primary) 30%, transparent)",
              flexShrink: 0,
              boxShadow:
                "inset 0 1px 0 0 color-mix(in oklab, white 6%, transparent)",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 12h4l3-8 4 16 3-8h4" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <h2
              className="font-semibold"
              style={{
                color: "var(--text-default)",
                fontSize: 22,
                letterSpacing: "-0.018em",
                lineHeight: 1.2,
              }}
            >
              Welcome to Flowtora
            </h2>
            <p
              className="mt-1.5"
              style={{
                color: "var(--text-muted)",
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              Five short steps to set up{" "}
              <span style={{ color: "var(--text-default)", fontWeight: 600 }}>
                {tenant.name}
              </span>
              . Each one opens the matching settings page so there&apos;s one place to change this later.
            </p>
          </div>
        </div>

        {/* Progress bar — visual confirmation of how far along they are. */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <span
              style={{
                color: "var(--text-faint)",
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Setup progress
            </span>
            <span
              style={{
                color: completedCount === items.length ? "var(--emerald-500)" : "var(--accent-primary)",
                fontSize: 11.5,
                fontWeight: 700,
                fontFeatureSettings: "'tnum' 1",
                letterSpacing: "-0.005em",
              }}
            >
              {completedCount} of {items.length} · {progressPct}%
            </span>
          </div>
          <div
            style={{
              position: "relative",
              height: 8,
              borderRadius: 999,
              background: "color-mix(in oklab, var(--surface-2) 70%, transparent)",
              border: "1px solid var(--border-subtle)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                width: `${progressPct}%`,
                background: completedCount === items.length
                  ? "linear-gradient(90deg, var(--emerald-500), color-mix(in oklab, var(--emerald-500) 70%, white 30%))"
                  : "linear-gradient(90deg, var(--accent-primary), color-mix(in oklab, var(--accent-primary) 70%, white 30%))",
                borderRadius: 999,
                transition: "width 320ms cubic-bezier(0.22, 1, 0.36, 1)",
                boxShadow: completedCount === items.length
                  ? "0 0 12px color-mix(in oklab, var(--emerald-500) 50%, transparent)"
                  : "0 0 12px color-mix(in oklab, var(--accent-primary) 50%, transparent)",
              }}
            />
          </div>
        </div>
      </section>

      {/* Checklist — each item a premium card with hover lift + completion state. */}
      <ol className="grid gap-2.5">
        {items.map((item, i) => (
          <li key={item.id}>
            <Link
              href={item.href(slug)}
              className="ts-focus group/step relative flex items-start gap-4 overflow-hidden rounded-xl transition-all hover:-translate-y-px"
              style={{
                padding: "14px 18px",
                background: item.done
                  ? "radial-gradient(540px circle at 0% 0%, color-mix(in oklab, var(--emerald-500) 10%, transparent), transparent 55%), " +
                    "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)"
                  : "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
                border: item.done
                  ? "1px solid color-mix(in oklab, var(--emerald-500) 35%, transparent)"
                  : "1px solid var(--border-subtle)",
                boxShadow:
                  "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
                  "0 1px 2px 0 rgba(0,0,0,0.18)",
              }}
            >
              {/* Hover accent ring. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity group-hover/step:opacity-100"
                style={{
                  boxShadow:
                    "0 0 0 1px color-mix(in oklab, var(--accent-primary) 35%, transparent), " +
                    "0 8px 24px -10px rgba(0,0,0,0.45)",
                }}
              />
              <span
                className="flex items-center justify-center"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 9,
                  flexShrink: 0,
                  background: item.done
                    ? "linear-gradient(135deg, color-mix(in oklab, var(--emerald-500) 28%, transparent), color-mix(in oklab, var(--emerald-500) 14%, transparent))"
                    : "var(--surface-2)",
                  color: item.done ? "var(--emerald-500)" : "var(--text-default)",
                  border: item.done
                    ? "1px solid color-mix(in oklab, var(--emerald-500) 35%, transparent)"
                    : "1px solid var(--border-subtle)",
                  fontSize: 13,
                  fontWeight: 700,
                  fontFeatureSettings: "'tnum' 1",
                  boxShadow: item.done
                    ? "inset 0 1px 0 0 color-mix(in oklab, white 6%, transparent), 0 0 12px -2px color-mix(in oklab, var(--emerald-500) 40%, transparent)"
                    : "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent)",
                }}
                aria-hidden
              >
                {item.done ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <div className="relative min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    style={{
                      color: "var(--text-default)",
                      fontSize: 14,
                      fontWeight: 600,
                      letterSpacing: "-0.005em",
                      lineHeight: 1.25,
                    }}
                  >
                    {item.title}
                  </span>
                  {item.done && (
                    <span
                      style={{
                        fontSize: 9.5,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "var(--emerald-500)",
                        background:
                          "color-mix(in oklab, var(--emerald-500) 14%, transparent)",
                        border:
                          "1px solid color-mix(in oklab, var(--emerald-500) 30%, transparent)",
                        padding: "1px 6px",
                        borderRadius: 999,
                        lineHeight: 1,
                      }}
                    >
                      Done
                    </span>
                  )}
                </div>
                <div
                  className="mt-1"
                  style={{
                    color: "var(--text-muted)",
                    fontSize: 12.5,
                    lineHeight: 1.4,
                  }}
                >
                  {item.description}
                </div>
              </div>
              <span
                aria-hidden
                style={{
                  color: "var(--text-faint)",
                  flexShrink: 0,
                  alignSelf: "center",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </span>
            </Link>
          </li>
        ))}
      </ol>

      <div className="flex items-center justify-between pt-2">
        <p
          style={{
            color: "var(--text-faint)",
            fontSize: 11.5,
            lineHeight: 1.4,
          }}
        >
          Everything on this list is editable in Settings at any time.
        </p>
        <Link
          href={`/t/${slug}/onboarding/done`}
          className="ts-focus inline-flex items-center gap-1 transition-colors hover:text-[var(--text-default)]"
          style={{
            color: "var(--accent-primary)",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "-0.005em",
          }}
        >
          Skip the rest &amp; finish →
        </Link>
      </div>
    </div>
  );
}
