import Link from "next/link";
import { requirePermission } from "@/lib/tenant";

// Marketing module hub (T-14).
//
// First scaffolded surface for the Marketing module - a premium landing
// page that establishes the six sub-features per spec:
//
//   Email campaigns - Composer + sends + per-campaign stats
//   Automations    - Pre-built workflows + custom builder (Pro+)
//   Forms          - Embeddable lead capture forms
//   Reviews        - Aggregated review feed + reply composer
//   Referrals      - Referral program toggle + rewards + tracking
//   Loyalty        - Punch-card or points-based with storefront UI
//
// Each sub-feature has its own status:
//   AVAILABLE - shipped, link works
//   BETA      - shipped but rough, link works with a beta chip
//   COMING    - planned, card visible but no link (so the IA reads
//               the same way as future state)
//
// As each tab gets built we just bump its status. The hub stays one
// file. The sidebar links here under /marketing.

type ModuleStatus = "AVAILABLE" | "BETA" | "COMING";

type MarketingModule = {
  slug: string;
  title: string;
  blurb: string;
  status: ModuleStatus;
  /** Plain SVG path data — kept inline so we don't pull in lucide
   *  for what amounts to 6 decorative tiles. */
  icon: React.ReactNode;
  bullets: string[];
};

const I = {
  email: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 7 9-7" />
    </svg>
  ),
  automation: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="12" cy="18" r="2" />
      <path d="M8 6h8M7 8l4 8M17 8l-4 8" />
    </svg>
  ),
  forms: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  ),
  reviews: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="m12 3 2.7 5.6 6.3.9-4.5 4.4 1 6.1-5.5-2.9-5.5 2.9 1-6.1L3 9.5l6.3-.9z" />
    </svg>
  ),
  referrals: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="9" cy="7" r="3" />
      <path d="M3 21v-1a6 6 0 0 1 12 0v1" />
      <path d="M17 8h4M19 6v4M16 14l3 3 4-5" />
    </svg>
  ),
  loyalty: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 2v4M12 18v4M5 12H1M23 12h-4M19.78 4.22l-2.83 2.83M7.05 16.95l-2.83 2.83M19.78 19.78l-2.83-2.83M7.05 7.05 4.22 4.22" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  ),
};

const MODULES: MarketingModule[] = [
  {
    slug: "campaigns",
    title: "Email campaigns",
    status: "COMING",
    icon: I.email,
    blurb:
      "Compose, schedule, and send to segmented audiences. Track opens, clicks, and revenue attributed.",
    bullets: [
      "Rich composer with merge tags",
      "Audience segments by stage, tag, lifetime value",
      "Per-campaign stats: sent, opened, clicked, unsubscribed, revenue",
    ],
  },
  {
    slug: "automations",
    title: "Automations",
    status: "COMING",
    icon: I.automation,
    blurb:
      "Pre-built workflows for the moments that matter — review requests, win-backs, follow-ups, birthdays.",
    bullets: [
      "Review request 3 days after delivery",
      "Win-back when a customer goes inactive 90+ days",
      "Quote follow-up at 3, 7, 14 days · birthday discount",
    ],
  },
  {
    slug: "forms",
    title: "Forms & lead capture",
    status: "COMING",
    icon: I.forms,
    blurb:
      "Embed lead capture forms on your storefront or website. Submissions create customer records automatically.",
    bullets: [
      "Drag-drop form builder",
      "Hosted form pages with a clean URL",
      "HTML embed snippet for your own site",
    ],
  },
  {
    slug: "reviews",
    title: "Reviews",
    status: "COMING",
    icon: I.reviews,
    blurb:
      "Aggregate Google, Facebook, and internal reviews into one feed. Reply from inside Flowtora.",
    bullets: [
      "Configurable post-job review requests",
      "One reply composer across platforms",
      "Featured reviews auto-syndicated to your storefront",
    ],
  },
  {
    slug: "referrals",
    title: "Referrals",
    status: "COMING",
    icon: I.referrals,
    blurb:
      "Turn happy customers into a sales channel. Track attribution from first share to first paid invoice.",
    bullets: [
      "Reward as % discount or $ credit",
      "Customer-facing referral page on your storefront",
      "Attribution + payout tracking, end to end",
    ],
  },
  {
    slug: "loyalty",
    title: "Loyalty",
    status: "COMING",
    icon: I.loyalty,
    blurb:
      "Punch-card or points-based loyalty that rewards your repeat customers.",
    bullets: [
      "Configurable rewards (free X after N jobs · % off next order)",
      "Customer-facing loyalty dashboard on your storefront",
      "Auto-applies at checkout when criteria are met",
    ],
  },
];

const STATUS_META: Record<ModuleStatus, { label: string; tone: "accent" | "amber" | "muted" }> = {
  AVAILABLE: { label: "Available", tone: "accent" },
  BETA:      { label: "Beta",      tone: "amber"  },
  COMING:    { label: "Coming soon", tone: "muted" },
};

export default async function MarketingHubPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Anyone with customer visibility can see the Marketing hub — gates
  // on the individual sub-features will tighten once they're built.
  await requirePermission(slug, "customers:view");

  return (
    <div className="space-y-5">
      {/* Premium page header — same pattern as every other workspace page. */}
      <header
        className="relative overflow-hidden rounded-2xl"
        style={{
          padding: "20px 24px",
          background:
            "radial-gradient(880px circle at -10% -50%, var(--accent-surface), transparent 55%), " +
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
              <path d="m3 11 18-8-8 18-2-8z" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <h1
              className="font-semibold"
              style={{
                color: "var(--text-default)",
                fontSize: 24,
                letterSpacing: "-0.02em",
                lineHeight: 1.15,
              }}
            >
              Marketing
            </h1>
            <p
              className="mt-1.5"
              style={{
                color: "var(--text-muted)",
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              Stay top-of-mind with your customers — campaigns, automations, forms, reviews, referrals, and loyalty. Six tools, one cohesive growth engine.
            </p>
          </div>
        </div>
      </header>

      {/* Module grid — 2 columns on tablet, 3 on desktop. */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {MODULES.map((m) => {
          const status = STATUS_META[m.status];
          const isClickable = m.status !== "COMING";
          const href = `/t/${slug}/marketing/${m.slug}`;
          const tile = (
            <div
              className={
                isClickable
                  ? "group/tile relative overflow-hidden rounded-xl transition-all hover:-translate-y-px"
                  : "relative overflow-hidden rounded-xl"
              }
              style={{
                padding: "18px 20px",
                background:
                  "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
                border: "1px solid var(--border-subtle)",
                boxShadow:
                  "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
                  "0 1px 2px 0 rgba(0,0,0,0.18)",
                opacity: m.status === "COMING" ? 0.85 : 1,
              }}
            >
              {isClickable && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity group-hover/tile:opacity-100"
                  style={{
                    boxShadow:
                      "0 0 0 1px color-mix(in oklab, var(--accent-primary) 35%, transparent), " +
                      "0 8px 24px -10px rgba(0,0,0,0.45)",
                  }}
                />
              )}
              <div className="relative flex items-start gap-3">
                <span
                  aria-hidden
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background:
                      "linear-gradient(135deg, var(--accent-surface-strong), var(--accent-surface))",
                    color: "var(--accent-primary)",
                    border:
                      "1px solid color-mix(in oklab, var(--accent-primary) 22%, transparent)",
                    flexShrink: 0,
                    boxShadow:
                      "inset 0 1px 0 0 color-mix(in oklab, white 6%, transparent)",
                  }}
                >
                  {m.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3
                      style={{
                        color: "var(--text-default)",
                        fontSize: 14.5,
                        fontWeight: 600,
                        letterSpacing: "-0.005em",
                        lineHeight: 1.2,
                      }}
                    >
                      {m.title}
                    </h3>
                    <StatusPill label={status.label} tone={status.tone} />
                  </div>
                  <p
                    className="mt-1.5"
                    style={{
                      color: "var(--text-muted)",
                      fontSize: 12,
                      lineHeight: 1.45,
                    }}
                  >
                    {m.blurb}
                  </p>
                  <ul
                    className="mt-3 space-y-1"
                    style={{
                      color: "var(--text-muted)",
                      fontSize: 11.5,
                      lineHeight: 1.4,
                    }}
                  >
                    {m.bullets.map((b, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span
                          aria-hidden
                          style={{
                            width: 3,
                            height: 3,
                            borderRadius: 999,
                            background: "var(--accent-primary)",
                            marginTop: 7,
                            flexShrink: 0,
                            opacity: 0.7,
                          }}
                        />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                  {isClickable && (
                    <div
                      className="mt-3 inline-flex items-center gap-1"
                      style={{
                        color: "var(--accent-primary)",
                        fontSize: 11.5,
                        fontWeight: 600,
                        letterSpacing: "-0.005em",
                      }}
                    >
                      Open
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
          return isClickable ? (
            <Link key={m.slug} href={href} className="ts-focus block">
              {tile}
            </Link>
          ) : (
            <div key={m.slug}>{tile}</div>
          );
        })}
      </div>

      {/* Footnote — sets expectations honestly. */}
      <p
        className="text-center"
        style={{
          color: "var(--text-faint)",
          fontSize: 11.5,
          lineHeight: 1.5,
        }}
      >
        Marketing tools roll out over the coming weeks. Each module above is on the roadmap with the behavior described.
      </p>
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "accent" | "amber" | "muted" }) {
  const styles = {
    accent: {
      color: "var(--accent-primary)",
      bg: "var(--accent-surface)",
      border: "color-mix(in oklab, var(--accent-primary) 28%, transparent)",
    },
    amber: {
      color: "var(--amber-500)",
      bg: "color-mix(in oklab, var(--amber-500) 14%, transparent)",
      border: "color-mix(in oklab, var(--amber-500) 30%, transparent)",
    },
    muted: {
      color: "var(--text-muted)",
      bg: "var(--surface-2)",
      border: "var(--border-subtle)",
    },
  }[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        padding: "2px 6px",
        borderRadius: 999,
        color: styles.color,
        background: styles.bg,
        border: `1px solid ${styles.border}`,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}
