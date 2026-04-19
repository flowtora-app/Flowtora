import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { Card } from "@/components/Card";
import { computeReadiness, type ReadinessReport } from "@/lib/readiness";
import { cohortChip, cohortLabel } from "@/lib/cohorts";

// Phase 19 — launch readiness inventory.
//
// One row per non-archived tenant, sorted by "needs attention" first
// (lowest completion percent, then by required-missing count). Clicking
// a row drops you into the tenant detail where the same checks render
// with action links inline.

const FILTER_OPTIONS = [
  { value: "all",       label: "All" },
  { value: "blocked",   label: "Blocked (required missing)" },
  { value: "ready",     label: "Ready to launch" },
  { value: "partial",   label: "In progress" },
] as const;
type Filter = (typeof FILTER_OPTIONS)[number]["value"];

export default async function PlatformReadinessPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; env?: string }>;
}) {
  await requirePlatformStaff();
  const sp = await searchParams;
  const filter: Filter = (FILTER_OPTIONS.map((o) => o.value) as readonly string[]).includes(sp.filter ?? "")
    ? (sp.filter as Filter)
    : "all";
  const env = (sp.env ?? "ALL").toUpperCase();

  // Pull the fields readiness needs, along with the counts. One query per
  // aggregate keeps this scan-friendly for the small tenant populations
  // we're running at today; revisit if this page gets slow.
  const tenants = await db.tenant.findMany({
    where: {
      status: { not: "ARCHIVED" },
      ...(env !== "ALL" ? { environment: env as "LIVE" | "DEMO" | "TEST" } : {}),
    },
    select: {
      id:                    true,
      name:                  true,
      slug:                  true,
      status:                true,
      environment:           true,
      betaCohort:            true,
      phone:                 true,
      addressLine1:          true,
      city:                  true,
      country:               true,
      logoUrl:               true,
      brandPrimaryColor:     true,
      onboardingCompletedAt: true,
      sampleDataLoadedAt:    true,
      sampleDataClearedAt:   true,
      stripeCustomerId:      true,
      stripeSubscriptionId:  true,
    },
    take: 300,
  });

  const ids = tenants.map((t) => t.id);
  const [members, customers, products, quotes, orders] = await Promise.all([
    db.membership.groupBy({ by: ["tenantId"], where: { tenantId: { in: ids }, status: "ACTIVE" }, _count: { _all: true } }),
    db.customer.groupBy({ by: ["tenantId"], where: { tenantId: { in: ids } }, _count: { _all: true } }),
    db.product.groupBy({ by: ["tenantId"], where: { tenantId: { in: ids } }, _count: { _all: true } }),
    db.quote.groupBy({ by: ["tenantId"], where: { tenantId: { in: ids } }, _count: { _all: true } }),
    db.order.groupBy({ by: ["tenantId"], where: { tenantId: { in: ids } }, _count: { _all: true } }),
  ]);
  const countMap = (rows: { tenantId: string; _count: { _all: number } }[]) =>
    new Map(rows.map((r) => [r.tenantId, r._count._all]));
  const m = countMap(members);
  const c = countMap(customers);
  const p = countMap(products);
  const q = countMap(quotes);
  const o = countMap(orders);

  type Row = (typeof tenants)[number] & { report: ReadinessReport };
  const rows: Row[] = tenants.map((t) => ({
    ...t,
    report: computeReadiness({
      tenant:        t,
      memberCount:   m.get(t.id) ?? 0,
      customerCount: c.get(t.id) ?? 0,
      productCount:  p.get(t.id) ?? 0,
      quoteCount:    q.get(t.id) ?? 0,
      orderCount:    o.get(t.id) ?? 0,
    }),
  }));

  const filtered = rows.filter((r) => {
    if (filter === "ready")   return r.report.ready;
    if (filter === "blocked") return !r.report.ready;
    if (filter === "partial") return !r.report.ready && r.report.doneCount > 0;
    return true;
  });

  filtered.sort((a, b) => {
    // "Needs attention" first: unready before ready, then lowest percent.
    if (a.report.ready !== b.report.ready) return a.report.ready ? 1 : -1;
    return a.report.percent - b.report.percent;
  });

  const readyCount   = rows.filter((r) => r.report.ready).length;
  const blockedCount = rows.length - readyCount;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Launch readiness</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          One row per live tenant. <b>{readyCount}</b> ready to launch ·{" "}
          <b>{blockedCount}</b> still missing required setup.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-2" method="get">
        <label className="block">
          <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Filter</span>
          <select
            name="filter"
            defaultValue={filter}
            className="rounded-md px-3 py-2 text-sm outline-none"
            style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            {FILTER_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Environment</span>
          <select
            name="env"
            defaultValue={env}
            className="rounded-md px-3 py-2 text-sm outline-none"
            style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            {["ALL", "LIVE", "DEMO", "TEST"].map((e) => (<option key={e} value={e}>{e}</option>))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md px-4 py-2 text-sm font-medium"
          style={{ background: "var(--accent)", color: "white" }}
        >
          Apply
        </button>
      </form>

      <Card>
        {filtered.length === 0 ? (
          <p className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>No tenants match.</p>
        ) : (
          <ul>
            {filtered.map((t) => (
              <li key={t.id} style={{ borderTop: "1px solid var(--border)" }}>
                <Link href={`/platform/tenants/${t.id}`} className="block px-5 py-3 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{t.name}</span>
                        <span className="text-xs" style={{ color: "var(--muted)" }}>{t.slug}</span>
                        {t.betaCohort !== "NONE" && (() => {
                          const chip = cohortChip(t.betaCohort);
                          return (
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide"
                              style={{ background: chip.bg, color: chip.fg }}
                            >
                              {cohortLabel(t.betaCohort)}
                            </span>
                          );
                        })()}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
                        {t.report.checks.filter((c) => !c.done).slice(0, 4).map((c) => (
                          <span
                            key={c.id}
                            className="rounded-full px-2 py-0.5"
                            style={{
                              background: c.required ? "#3a1517" : "var(--panel)",
                              color:      c.required ? "#ff8b8b" : "var(--muted)",
                              border:     `1px solid ${c.required ? "#5b2024" : "var(--border)"}`,
                            }}
                          >
                            {c.required ? "✖ " : "· "}{c.label}
                          </span>
                        ))}
                        {t.report.checks.filter((c) => !c.done).length > 4 && (
                          <span>+{t.report.checks.filter((c) => !c.done).length - 4} more</span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div
                        className="text-sm font-semibold"
                        style={{ color: t.report.ready ? "#7dd688" : t.report.percent >= 60 ? "#ffc98b" : "#ff8b8b" }}
                      >
                        {t.report.percent}%
                      </div>
                      <div className="text-[10px]" style={{ color: "var(--muted)" }}>
                        {t.report.requiredDone}/{t.report.requiredTotal} required
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
