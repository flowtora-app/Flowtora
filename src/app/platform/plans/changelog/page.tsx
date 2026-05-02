import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";

// /platform/plans/changelog — Page 19 §"Pricing changelog page".
//
// Cross-plan timeline of every PlanVersion row. Each PricingPlan
// snapshots its full state on publish; this page lists those rows
// newest-first across all plans, grouped by week, with a diff hint
// against the previous version.
//
// Honest limit: rendering 1k+ versions is slow + noisy. Cap at 200
// most-recent rows. Per-plan history (with rollback) lives at
// /platform/plans/[id]/versions — link to it from each row.

export const dynamic = "force-dynamic";

type SnapshotShape = {
  plan?: {
    name?: string;
    status?: string;
    priceMonthly?: string | null;
    priceAnnual?: string | null;
    isContactSales?: boolean;
    highlight?: boolean;
  };
  featureValues?: Array<unknown>;
};

function weekKey(d: Date) {
  // ISO week-ish — Monday-anchored.
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (dt.getUTCDay() + 6) % 7; // 0 = Mon
  dt.setUTCDate(dt.getUTCDate() - dayNum);
  return dt.toISOString().slice(0, 10);
}

function diffSummary(curr: SnapshotShape | null, prev: SnapshotShape | null): string[] {
  if (!curr?.plan) return [];
  const out: string[] = [];
  if (!prev?.plan) {
    out.push("Initial version published");
    return out;
  }
  const cp = curr.plan, pp = prev.plan;
  if (cp.status !== pp.status) out.push(`Status: ${pp.status ?? "—"} → ${cp.status ?? "—"}`);
  if ((cp.priceMonthly ?? null) !== (pp.priceMonthly ?? null)) {
    out.push(`Monthly: ${pp.priceMonthly ?? "—"} → ${cp.priceMonthly ?? "—"}`);
  }
  if ((cp.priceAnnual ?? null) !== (pp.priceAnnual ?? null)) {
    out.push(`Annual: ${pp.priceAnnual ?? "—"} → ${cp.priceAnnual ?? "—"}`);
  }
  if (!!cp.isContactSales !== !!pp.isContactSales) {
    out.push(`Contact-sales: ${pp.isContactSales ? "on" : "off"} → ${cp.isContactSales ? "on" : "off"}`);
  }
  if (!!cp.highlight !== !!pp.highlight) {
    out.push(`Highlight: ${pp.highlight ? "on" : "off"} → ${cp.highlight ? "on" : "off"}`);
  }
  const cFeatures = (curr.featureValues ?? []).length;
  const pFeatures = (prev.featureValues ?? []).length;
  if (cFeatures !== pFeatures) out.push(`Feature cells: ${pFeatures} → ${cFeatures}`);
  if (out.length === 0) out.push("Re-published with no field changes");
  return out;
}

export default async function PricingChangelogPage() {
  await requirePlatformStaff();

  const versions = await db.planVersion.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      version: true,
      snapshot: true,
      publishedByUserId: true,
      note: true,
      createdAt: true,
      planId: true,
      plan: { select: { id: true, slug: true, name: true } },
    },
  });

  // For each row, fetch its previous version so we can diff. One query
  // per plan keeps it simple — 200 rows max so this isn't pathological.
  const planIds = Array.from(new Set(versions.map((v) => v.planId)));
  const allByPlan = new Map<string, { version: number; snapshot: unknown }[]>();
  await Promise.all(planIds.map(async (pid) => {
    const all = await db.planVersion.findMany({
      where: { planId: pid },
      orderBy: { version: "asc" },
      select: { version: true, snapshot: true },
    });
    allByPlan.set(pid, all);
  }));

  // Resolve user emails for the "by" column.
  const userIds = Array.from(new Set(versions.map((v) => v.publishedByUserId).filter((x): x is string => !!x)));
  const users = userIds.length === 0 ? [] : await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, name: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  // Group by week.
  type Row = typeof versions[number];
  const groups = new Map<string, Row[]>();
  for (const v of versions) {
    const k = weekKey(v.createdAt);
    const list = groups.get(k) ?? [];
    list.push(v);
    groups.set(k, list);
  }
  const weekKeys = Array.from(groups.keys()).sort((a, b) => (a < b ? 1 : -1));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/platform/plans" className="text-xs underline" style={{ color: "var(--text-muted)" }}>
          ← Plans &amp; pricing
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight" style={{ color: "var(--text-default)" }}>
          Pricing changelog
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Every plan publication, newest first. Jump into any plan&apos;s detail to roll back
          a specific version. Showing up to 200 most-recent events.
        </p>
      </div>

      {versions.length === 0 ? (
        <div className="rounded-xl border p-10 text-center"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No published versions yet. Plans become versioned once you click Publish on the plan editor.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {weekKeys.map((wk) => {
            const rows = groups.get(wk) ?? [];
            const wkLabel = new Date(wk).toLocaleDateString(undefined, {
              month: "short", day: "numeric", year: "numeric",
            });
            return (
              <section key={wk}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide"
                    style={{ color: "var(--text-muted)" }}>
                  Week of {wkLabel}
                </h2>
                <ul className="divide-y rounded-xl border"
                    style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
                  {rows.map((v) => {
                    const all = allByPlan.get(v.planId) ?? [];
                    const idx = all.findIndex((x) => x.version === v.version);
                    const prev = idx > 0 ? all[idx - 1] : null;
                    const curr = (v.snapshot ?? null) as SnapshotShape | null;
                    const prevShape = (prev?.snapshot ?? null) as SnapshotShape | null;
                    const diffs = diffSummary(curr, prevShape);
                    const u = v.publishedByUserId ? userById.get(v.publishedByUserId) : null;
                    const actor = u?.name ?? u?.email ?? "system";

                    return (
                      <li key={v.id} className="grid grid-cols-1 gap-2 p-4 md:grid-cols-[180px_1fr_140px]">
                        <div>
                          <div className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
                            {v.plan.name}{" "}
                            <span className="font-normal" style={{ color: "var(--text-muted)" }}>
                              · v{v.version}
                            </span>
                          </div>
                          <div className="mt-0.5 text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                            {v.createdAt.toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <ul className="space-y-1 text-[12px]">
                            {diffs.map((d, i) => (
                              <li key={i} style={{ color: "var(--text-default)" }}>
                                <span className="mr-2" style={{ color: "var(--text-muted)" }}>•</span>{d}
                              </li>
                            ))}
                          </ul>
                          {v.note && (
                            <blockquote className="mt-2 border-l-2 pl-3 text-[11px] italic"
                                        style={{ borderColor: "var(--accent-primary)", color: "var(--text-muted)" }}>
                              {v.note}
                            </blockquote>
                          )}
                          <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                            by {actor}
                          </div>
                        </div>
                        <div className="flex items-start justify-end">
                          <Link href={`/platform/plans/${v.planId}/versions`}
                                className="text-[11px] hover:underline"
                                style={{ color: "var(--accent-primary)" }}>
                            View / roll back →
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
