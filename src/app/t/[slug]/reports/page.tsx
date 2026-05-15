import Link from "next/link";
import { requirePermission } from "@/lib/tenant";

type ReportTile = {
  slug: string;
  title: string;
  blurb: string;
  icon: React.ReactNode;
  financial?: boolean;
  crossBranch?: boolean;
};

// Icon set used to anchor each tile — lightweight inline SVGs so we
// don't pull in lucide just for these.
const I = {
  funnel: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 4h18l-7 9v6l-4-2v-4z" />
    </svg>
  ),
  quote: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 4h9l5 5v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M15 4v5h5M8 13h8M8 17h5" />
    </svg>
  ),
  production: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="7" width="6" height="14" rx="1" />
      <rect x="9" y="3" width="6" height="18" rx="1" />
      <rect x="15" y="11" width="6" height="10" rx="1" />
    </svg>
  ),
  install: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </svg>
  ),
  products: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 7l9-4 9 4-9 4-9-4z" />
      <path d="M3 7v10l9 4 9-4V7M12 11v10" />
    </svg>
  ),
  financial: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M14 7h7v7" />
    </svg>
  ),
  branches: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="6" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="12" r="2" />
      <path d="M6 8v8M8 6h8a4 4 0 0 1 4 4v0M8 18h8a4 4 0 0 0 4-4v0" />
    </svg>
  ),
};

const REPORTS: ReportTile[] = [
  { slug: "pipeline",   title: "Sales pipeline",      icon: I.funnel,     blurb: "Funnel by stage, win rate, pipeline value, lost reasons." },
  { slug: "quotes",     title: "Quote conversion",    icon: I.quote,      blurb: "Draft → sent → approved → ordered. Average cycle time." },
  { slug: "production", title: "Production",          icon: I.production, blurb: "Orders by status, backlog value, cycle time, overdue." },
  { slug: "installs",   title: "Installs",            icon: I.install,    blurb: "Scheduled vs completed, no-show rate, per-installer." },
  { slug: "products",   title: "Products & services", icon: I.products,   blurb: "Which products drive revenue and quoting volume. Quote-to-order conversion by line item." },
  { slug: "financial",  title: "Financial",           icon: I.financial,  blurb: "Revenue, payments, A/R aging, top customers.", financial: true },
  { slug: "branches",   title: "Branch comparison",   icon: I.branches,   blurb: "Side-by-side rollup of every branch's volume + live state.", crossBranch: true },
];

export default async function ReportsHubPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requirePermission(slug, "reports:view");
  const canFinancial = ctx.can("reports:financial");
  const canCrossBranch = ctx.can("locations:cross_view");

  const visible = REPORTS.filter((r) => {
    if (r.financial && !canFinancial) return false;
    if (r.crossBranch && !canCrossBranch) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Premium page header — matches workspace-wide pattern. */}
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{
          padding: "18px 22px",
          background:
            "radial-gradient(880px circle at -10% -50%, var(--accent-surface), transparent 55%), " +
            "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
          border: "1px solid var(--border-subtle)",
          boxShadow:
            "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
            "0 1px 2px 0 rgba(0,0,0,0.18)",
        }}
      >
        <h1
          className="font-semibold"
          style={{
            color: "var(--text-default)",
            fontSize: 24,
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
          }}
        >
          Reports
        </h1>
        <p
          className="mt-1.5"
          style={{
            color: "var(--text-muted)",
            fontSize: 12.5,
            lineHeight: 1.45,
          }}
        >
          All reports respect the same date range. Share URLs to share filtered views.
        </p>
      </div>

      {/* Report tiles — premium gradient cards with accent halo + lift. */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((r) => (
          <Link
            key={r.slug}
            href={`/t/${slug}/reports/${r.slug}`}
            className="ts-focus group/tile relative overflow-hidden rounded-xl transition-all hover:-translate-y-px"
            style={{
              background:
                "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
              border: "1px solid var(--border-subtle)",
              boxShadow:
                "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
                "0 1px 2px 0 rgba(0,0,0,0.18)",
              padding: "16px 18px",
            }}
          >
            {/* Hover accent ring */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity group-hover/tile:opacity-100"
              style={{
                boxShadow:
                  "0 0 0 1px color-mix(in oklab, var(--accent-primary) 35%, transparent), " +
                  "0 8px 24px -10px rgba(0,0,0,0.45)",
              }}
            />
            <div className="relative flex items-start gap-3">
              <span
                aria-hidden
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 36,
                  height: 36,
                  borderRadius: 9,
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
                {r.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3
                    style={{
                      color: "var(--text-default)",
                      fontSize: 14,
                      fontWeight: 600,
                      letterSpacing: "-0.005em",
                      lineHeight: 1.2,
                    }}
                  >
                    {r.title}
                  </h3>
                  {r.financial && (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "var(--accent-primary)",
                        background: "var(--accent-surface)",
                        border:
                          "1px solid color-mix(in oklab, var(--accent-primary) 22%, transparent)",
                        padding: "1px 5px",
                        borderRadius: 4,
                        lineHeight: 1,
                      }}
                    >
                      Restricted
                    </span>
                  )}
                </div>
                <p
                  className="mt-1"
                  style={{
                    color: "var(--text-muted)",
                    fontSize: 12,
                    lineHeight: 1.4,
                  }}
                >
                  {r.blurb}
                </p>
                <div
                  className="mt-3 inline-flex items-center gap-1"
                  style={{
                    color: "var(--accent-primary)",
                    fontSize: 11.5,
                    fontWeight: 600,
                    letterSpacing: "-0.005em",
                  }}
                >
                  View report
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {!canFinancial && (
        <div
          className="rounded-lg px-4 py-3 text-xs"
          style={{
            background: "color-mix(in oklab, var(--surface-2) 50%, transparent)",
            border: "1px dashed var(--border-subtle)",
            color: "var(--text-muted)",
            fontSize: 11.5,
            lineHeight: 1.4,
          }}
        >
          Financial reports are visible only to owners and accounting roles.
        </div>
      )}
    </div>
  );
}
