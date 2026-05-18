import Link from "next/link";
import { requirePermission } from "@/lib/tenant";

// Storefront customizer hub (T-12).
//
// The full spec calls for a split view (customization panel + live
// preview iframe). This first scaffold establishes the IA: the nine
// customization sections per spec, each presented as a card with a
// status pill.
//
// As each section's editor gets built, flip its status from COMING
// to AVAILABLE and the card becomes clickable into the editor.

type SectionStatus = "AVAILABLE" | "BETA" | "COMING";

type SfSection = {
  slug: string;
  title: string;
  blurb: string;
  status: SectionStatus;
  icon: React.ReactNode;
  bullets: string[];
};

const I = {
  general: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 9l9-7 9 7v11a1 1 0 0 1-1 1h-5v-7H10v7H5a1 1 0 0 1-1-1V11z" />
    </svg>
  ),
  theme: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18 5 5 0 0 0 0-10 5 5 0 0 1 0-10z" />
    </svg>
  ),
  header: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
    </svg>
  ),
  sections: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="5" rx="1" />
      <rect x="3" y="11" width="18" height="3" rx="1" />
      <rect x="3" y="17" width="18" height="4" rx="1" />
    </svg>
  ),
  products: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 7l9-4 9 4-9 4-9-4z" />
      <path d="M3 7v10l9 4 9-4V7M12 11v10" />
    </svg>
  ),
  contact: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  footer: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 17h18" />
    </svg>
  ),
  seo: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3M11 8v6M8 11h6" />
    </svg>
  ),
  domain: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  ),
};

const SECTIONS: SfSection[] = [
  {
    slug: "general",
    title: "General",
    status: "COMING",
    icon: I.general,
    blurb:
      "The first thing visitors see — your storefront name, tagline, hero image, and primary call to action.",
    bullets: [
      "Storefront name + tagline",
      "Hero image + headline",
      "Primary CTA text + destination",
    ],
  },
  {
    slug: "theme",
    title: "Theme",
    status: "COMING",
    icon: I.theme,
    blurb:
      "Brand colors, fonts, and corner radius. Your storefront feels like your shop, not a generic SaaS template.",
    bullets: [
      "Brand color + accent color with WCAG contrast guardrails",
      "Font family (curated options)",
      "Button corner radius",
    ],
  },
  {
    slug: "header",
    title: "Header",
    status: "COMING",
    icon: I.header,
    blurb:
      "Logo, nav links, and at-a-glance contact info — the top of every page on your storefront.",
    bullets: [
      "Logo (light + dark variants)",
      "Nav link order + visibility",
      "Phone, email, hours displayed inline",
    ],
  },
  {
    slug: "sections",
    title: "Sections",
    status: "COMING",
    icon: I.sections,
    blurb:
      "Drag-drop the building blocks of your home page. Enable, reorder, and customize each one.",
    bullets: [
      "Hero · About · Products · How it works",
      "Reviews · Contact · Custom HTML",
      "Drag to reorder; toggle visibility",
    ],
  },
  {
    slug: "products",
    title: "Featured products",
    status: "COMING",
    icon: I.products,
    blurb:
      "Choose which catalog items appear on your storefront and what order they show in.",
    bullets: [
      "Pick from your live product catalog",
      "Reorder by drag-drop",
      "Optional: highlight a hero product",
    ],
  },
  {
    slug: "contact",
    title: "Contact",
    status: "COMING",
    icon: I.contact,
    blurb:
      "Address, hours, phone, email, and social profiles — everything a visitor needs to reach you.",
    bullets: [
      "Address + map embed",
      "Open hours by day of week",
      "Social profiles (Instagram, Facebook, LinkedIn, etc.)",
    ],
  },
  {
    slug: "footer",
    title: "Footer",
    status: "COMING",
    icon: I.footer,
    blurb:
      "Customizable links and the optional “Powered by Flowtora” badge. Locked on Starter.",
    bullets: [
      "Up to 12 custom links in 3 columns",
      "Newsletter signup (uses your Email campaigns audience)",
      "“Powered by Flowtora” toggle (Pro+)",
    ],
  },
  {
    slug: "seo",
    title: "SEO",
    status: "COMING",
    icon: I.seo,
    blurb:
      "Help your storefront get found. Meta tags, Open Graph image, and structured data.",
    bullets: [
      "Meta title + description",
      "Open Graph image for social sharing",
      "Automatic sitemap + robots.txt",
    ],
  },
  {
    slug: "domain",
    title: "Domain",
    status: "COMING",
    icon: I.domain,
    blurb:
      "Use a free Flowtora subdomain or connect your own custom domain with one-click SSL.",
    bullets: [
      "Free shop subdomain (e.g., acme-signs.flowtora-shops.com)",
      "Custom domain via CNAME (Pro+)",
      "Auto-renewing TLS — no certificate fiddling",
    ],
  },
];

const STATUS_META: Record<SectionStatus, { label: string; tone: "accent" | "amber" | "muted" }> = {
  AVAILABLE: { label: "Available", tone: "accent" },
  BETA:      { label: "Beta",      tone: "amber"  },
  COMING:    { label: "Coming soon", tone: "muted" },
};

export default async function StorefrontCustomizerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requirePermission(slug, "customers:view");

  // For now we don't know the actual storefront URL — when the
  // public storefront ships this becomes a real per-tenant URL.
  const previewHref = `/t/${slug}/storefront`;

  return (
    <div className="space-y-5">
      {/* Premium page header. */}
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
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3.5">
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
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M9 21V9" />
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
                Storefront customizer
              </h1>
              <p
                className="mt-1.5"
                style={{
                  color: "var(--text-muted)",
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                Design the customer-facing storefront for{" "}
                <span style={{ color: "var(--text-default)", fontWeight: 600 }}>
                  your shop
                </span>{" "}
                — brand, layout, products, and connected domain.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={previewHref}
              className="ts-focus inline-flex items-center gap-1.5 rounded-lg transition-colors hover:bg-[var(--surface-3)]"
              style={{
                height: 32,
                padding: "0 12px",
                background: "color-mix(in oklab, var(--surface-2) 75%, transparent)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-default)",
                fontSize: 12.5,
                fontWeight: 500,
                letterSpacing: "-0.005em",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
              </svg>
              Preview storefront
            </Link>
            <button
              type="button"
              disabled
              className="ts-focus inline-flex items-center gap-1.5 rounded-lg font-semibold"
              title="Publish becomes available once your customizer is live"
              style={{
                height: 32,
                padding: "0 14px",
                background:
                  "linear-gradient(180deg, color-mix(in oklab, var(--accent-primary) 96%, white 4%) 0%, var(--accent-primary) 100%)",
                color: "var(--accent-fg)",
                border:
                  "1px solid color-mix(in oklab, var(--accent-primary) 80%, black 20%)",
                boxShadow:
                  "0 1px 0 0 rgba(255,255,255,0.15) inset, " +
                  "0 1px 2px 0 rgba(0,0,0,0.35)",
                fontSize: 12.5,
                letterSpacing: "-0.005em",
                opacity: 0.55,
                cursor: "not-allowed",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12l5 5L20 7" />
              </svg>
              Publish
            </button>
          </div>
        </div>
      </header>

      {/* Future split-view notice — a small honest banner explaining what's coming. */}
      <div
        className="rounded-xl px-4 py-3"
        style={{
          background:
            "radial-gradient(540px circle at 0% 0%, var(--accent-surface), transparent 55%), " +
            "color-mix(in oklab, var(--surface-1) 80%, transparent)",
          border:
            "1px solid color-mix(in oklab, var(--accent-primary) 28%, transparent)",
          fontSize: 12.5,
          lineHeight: 1.45,
          color: "var(--text-muted)",
        }}
      >
        <div className="flex items-start gap-2.5">
          <span
            aria-hidden
            style={{
              flexShrink: 0,
              width: 18,
              height: 18,
              borderRadius: 5,
              background: "var(--accent-surface)",
              color: "var(--accent-primary)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 11,
              border:
                "1px solid color-mix(in oklab, var(--accent-primary) 30%, transparent)",
              marginTop: 1,
            }}
          >
            i
          </span>
          <div>
            <span style={{ color: "var(--text-default)", fontWeight: 600 }}>
              Coming soon: split-view editor.
            </span>{" "}
            Each section below opens an inline editor with a live preview on the right — you&apos;ll see your storefront update as you change brand colors, swap the hero image, or reorder products.
          </div>
        </div>
      </div>

      {/* Section grid — 9 customization tiles. */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {SECTIONS.map((s) => {
          const status = STATUS_META[s.status];
          const isClickable = s.status !== "COMING";
          const href = `/t/${slug}/storefront/${s.slug}`;
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
                opacity: s.status === "COMING" ? 0.85 : 1,
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
                  {s.icon}
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
                      {s.title}
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
                    {s.blurb}
                  </p>
                  <ul
                    className="mt-3 space-y-1"
                    style={{
                      color: "var(--text-muted)",
                      fontSize: 11.5,
                      lineHeight: 1.4,
                    }}
                  >
                    {s.bullets.map((b, i) => (
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
                </div>
              </div>
            </div>
          );
          return isClickable ? (
            <Link key={s.slug} href={href} className="ts-focus block">
              {tile}
            </Link>
          ) : (
            <div key={s.slug}>{tile}</div>
          );
        })}
      </div>

      <p
        className="text-center"
        style={{
          color: "var(--text-faint)",
          fontSize: 11.5,
          lineHeight: 1.5,
        }}
      >
        Sections roll out one by one. Each one above is on the roadmap with the behavior described.
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
