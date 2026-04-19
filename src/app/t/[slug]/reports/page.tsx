import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { Card, CardHeader } from "@/components/Card";

type ReportTile = {
  slug: string;
  title: string;
  blurb: string;
  financial?: boolean;
  crossBranch?: boolean;
};

const REPORTS: ReportTile[] = [
  { slug: "pipeline",   title: "Sales pipeline",    blurb: "Funnel by stage, win rate, pipeline value, lost reasons." },
  { slug: "quotes",     title: "Quote conversion",  blurb: "Draft → sent → approved → ordered. Average cycle time." },
  { slug: "production", title: "Production",        blurb: "Orders by status, backlog value, cycle time, overdue." },
  { slug: "installs",   title: "Installs",          blurb: "Scheduled vs completed, no-show rate, per-installer." },
  { slug: "products",   title: "Products & services", blurb: "Which products drive revenue and quoting volume. Quote-to-order conversion by line item." },
  { slug: "financial",  title: "Financial",          blurb: "Revenue, payments, A/R aging, top customers.", financial: true },
  // Phase 15 — comparison view sits alongside the per-domain reports but is
  // only meaningful (and only visible) to members with cross-branch sight.
  { slug: "branches",   title: "Branch comparison", blurb: "Side-by-side rollup of every branch's volume + live state.", crossBranch: true },
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          All reports respect the same date range. Share URLs to share filtered views.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {visible.map((r) => (
          <Link key={r.slug} href={`/t/${slug}/reports/${r.slug}`}>
            <Card>
              <CardHeader title={r.title} description={r.blurb} />
              <div className="px-5 py-3 text-xs" style={{ color: "var(--muted)" }}>
                View report →
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {!canFinancial && (
        <div className="rounded-md px-4 py-3 text-xs" style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--muted)" }}>
          Financial reports are visible only to owners and accounting roles.
        </div>
      )}
    </div>
  );
}
