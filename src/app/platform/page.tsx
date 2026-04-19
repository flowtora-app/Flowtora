import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { TrendChart } from "@/components/charts/TrendChart";
import { chooseBucketGranularity, bucketKey, buildTrendSeries } from "@/lib/reports";

// Estimated monthly recurring revenue per plan (USD).
// Update these when pricing changes — they feed the MRR KPI.
const PLAN_MRR: Record<string, number> = {
  STARTER:    49,
  GROWTH:     99,
  PRO:       199,
  ENTERPRISE: 499,
};

export default async function PlatformOverviewPage() {
  await requirePlatformStaff();

  const now            = new Date();
  const ninetyDaysAgo  = new Date(now.getTime() - 90  * 86_400_000);
  const thirtyDaysAgo  = new Date(now.getTime() - 30  * 86_400_000);

  const sevenDaysOut = new Date(now.getTime() + 7 * 86_400_000);

  const [
    tenantCount,
    userCount,
    trialCount,
    activeCount,
    canceledCount,
    newLast30,
    activeSessions,
    tenantsByPlanStatus,
    newTenantsInRange,
    recentTenants,
    unhealthyTenants,
    urgentUnassignedTickets,
    pendingExports,
    imminentDeletions,
    newestTenant,
  ] = await Promise.all([
    db.tenant.count(),
    db.user.count(),
    db.tenant.count({ where: { status: "TRIAL" } }),
    db.tenant.count({ where: { status: "ACTIVE" } }),
    db.tenant.count({ where: { status: { in: ["CANCELED", "ARCHIVED"] } } }),
    db.tenant.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    db.impersonationSession.findMany({
      where: { endedAt: null },
      orderBy: { startedAt: "desc" },
      take: 25,
    }),
    // Split by (plan, status) so the breakdown can show Active + Trial
    // + Past-due per plan. MRR still computes from ACTIVE only below.
    db.tenant.groupBy({
      by: ["plan", "status"],
      where: { status: { in: ["ACTIVE", "TRIAL", "PAST_DUE"] } },
      _count: { _all: true },
    }),
    db.tenant.findMany({
      where: { createdAt: { gte: ninetyDaysAgo } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    db.tenant.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, slug: true, name: true, plan: true, status: true, createdAt: true },
    }),
    // ── Needs-attention feeds ──
    db.tenant.findMany({
      where:   { status: { in: ["PAST_DUE", "SUSPENDED"] } },
      select:  { id: true, name: true, status: true, plan: true },
      orderBy: { updatedAt: "desc" },
      take:    10,
    }),
    db.supportTicket.findMany({
      where: {
        assignedTo: null,
        status:     { in: ["OPEN", "IN_PROGRESS"] },
        priority:   { in: ["HIGH", "URGENT"] },
      },
      select: {
        id: true, subject: true, priority: true, createdAt: true,
        tenant: { select: { id: true, name: true } },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 10,
    }),
    db.dataExportRequest.findMany({
      where:  { status: "PENDING" },
      select: {
        id: true, createdAt: true,
        tenant: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 10,
    }),
    db.accountDeletionRequest.findMany({
      where: {
        status:       "SCHEDULED",
        scheduledFor: { lte: sevenDaysOut },
      },
      select: {
        id: true, scheduledFor: true,
        tenant: { select: { id: true, name: true } },
      },
      orderBy: { scheduledFor: "asc" },
      take: 10,
    }),
    // Newest tenant overall — used as a "last sign-up" reference when
    // the 90-day trend chart is empty.
    db.tenant.findFirst({
      orderBy: { createdAt: "desc" },
      select:  { createdAt: true },
    }),
  ]);

  const triageCount =
    unhealthyTenants.length +
    urgentUnassignedTickets.length +
    pendingExports.length +
    imminentDeletions.length;

  // ── MRR ──────────────────────────────────────────────────────────
  // Only ACTIVE tenants count toward MRR — trials and past-due don't
  // pay today, even though they show up in the plan breakdown below.
  type PlanKey = keyof typeof PLAN_MRR;
  const planTotals: Record<
    PlanKey,
    { active: number; trial: number; pastDue: number }
  > = {
    STARTER:    { active: 0, trial: 0, pastDue: 0 },
    GROWTH:     { active: 0, trial: 0, pastDue: 0 },
    PRO:        { active: 0, trial: 0, pastDue: 0 },
    ENTERPRISE: { active: 0, trial: 0, pastDue: 0 },
  };
  for (const row of tenantsByPlanStatus) {
    const bucket = planTotals[row.plan as PlanKey];
    if (!bucket) continue;
    if (row.status === "ACTIVE")   bucket.active  += row._count._all;
    if (row.status === "TRIAL")    bucket.trial   += row._count._all;
    if (row.status === "PAST_DUE") bucket.pastDue += row._count._all;
  }

  let mrr = 0;
  for (const plan of Object.keys(planTotals) as PlanKey[]) {
    mrr += (PLAN_MRR[plan] ?? 0) * planTotals[plan].active;
  }

  // ── Churn ─────────────────────────────────────────────────────────
  // Lifetime churn ratio (no canceledAt timestamp on Tenant).
  const churnPct = tenantCount > 0
    ? Math.round((canceledCount / tenantCount) * 1000) / 10
    : 0;

  // ── Growth trend (90 days) ────────────────────────────────────────
  const granularity   = chooseBucketGranularity(ninetyDaysAgo, now);
  const signupBuckets = new Map<string, number>();
  for (const t of newTenantsInRange) {
    const k = bucketKey(t.createdAt, granularity);
    signupBuckets.set(k, (signupBuckets.get(k) ?? 0) + 1);
  }
  const growthSeries = buildTrendSeries(ninetyDaysAgo, now, granularity, signupBuckets);
  const trendData    = growthSeries.map((p) => ({ label: p.label, "New tenants": p.value }));

  // ── Impersonation session decoration ─────────────────────────────
  const userIds   = Array.from(new Set(activeSessions.map((s) => s.platformUserId)));
  const tenantIds = Array.from(new Set(activeSessions.map((s) => s.tenantId)));
  const [platformUsers, sessionTenants] = await Promise.all([
    userIds.length
      ? db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, name: true, platformRole: true },
        })
      : Promise.resolve([] as { id: string; email: string; name: string | null; platformRole: string | null }[]),
    tenantIds.length
      ? db.tenant.findMany({
          where: { id: { in: tenantIds } },
          select: { id: true, slug: true, name: true },
        })
      : Promise.resolve([] as { id: string; slug: string; name: string }[]),
  ]);
  const userById   = new Map(platformUsers.map((u) => [u.id, u]));
  const tenantById = new Map(sessionTenants.map((t) => [t.id, t]));

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-semibold">Platform overview</h1>

      {/* ── Needs attention ── */}
      {triageCount > 0 && (
        <div
          className="rounded-md"
          style={{ background: "var(--panel)", border: "1px solid #f59e0b55" }}
        >
          <div
            className="flex items-center gap-2 px-4 py-3 text-sm font-semibold"
            style={{ borderBottom: "1px solid var(--border)", color: "#f59e0b" }}
          >
            <span>Needs attention</span>
            <span
              className="rounded-full px-2 py-0.5 text-xs"
              style={{ background: "#f59e0b", color: "#1a1a1a" }}
            >
              {triageCount}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-px md:grid-cols-2" style={{ background: "var(--border)" }}>
            <TriageColumn
              title="Billing / health"
              empty="All tenants healthy."
              color="#ef4444"
              items={unhealthyTenants.map((t) => ({
                key:   t.id,
                href:  `/platform/tenants/${t.id}`,
                title: t.name,
                meta:  `${t.status} · ${t.plan}`,
              }))}
            />
            <TriageColumn
              title="Urgent tickets (unassigned)"
              empty="Triage queue is clear."
              color="#f59e0b"
              items={urgentUnassignedTickets.map((t) => ({
                key:   t.id,
                href:  `/platform/support/${t.id}`,
                title: t.subject,
                meta:  `${t.priority} · ${t.tenant.name} · ${ageLabel(t.createdAt)}`,
              }))}
            />
            <TriageColumn
              title="Pending data exports"
              empty="No export requests waiting."
              color="#6366f1"
              items={pendingExports.map((r) => ({
                key:   r.id,
                href:  `/platform/tenants/${r.tenant.id}`,
                title: r.tenant.name,
                meta:  `Requested ${ageLabel(r.createdAt)}`,
              }))}
            />
            <TriageColumn
              title="Deletions due this week"
              empty="No deletions in the next 7 days."
              color="#8b5cf6"
              items={imminentDeletions.map((r) => ({
                key:   r.id,
                href:  `/platform/tenants/${r.tenant.id}`,
                title: r.tenant.name,
                meta:  `Scheduled ${r.scheduledFor.toLocaleDateString()}`,
              }))}
            />
          </div>
        </div>
      )}

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Est. MRR"       value={`$${mrr.toLocaleString()}`} sub="active seats × plan price" />
        <Stat label="Active tenants" value={String(activeCount)}         sub={`${trialCount} on trial`} />
        <Stat label="New (30 d)"     value={String(newLast30)}           sub="new sign-ups" />
        <Stat label="Lifetime churn" value={`${churnPct}%`}             sub={`${canceledCount} canceled / archived`} />
      </div>

      {/* ── Tenant growth trend ── */}
      <div>
        <SectionHeader title="New tenant sign-ups (90 days)" />
        <div
          className="mt-3 rounded-md px-4 pt-4 pb-2"
          style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
        >
          {trendData.some((d) => d["New tenants"] > 0) ? (
            <TrendChart
              data={trendData}
              series={[{ key: "New tenants", label: "New tenants", color: "#6366f1" }]}
              height={200}
              filled
            />
          ) : (
            <p className="py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
              {newestTenant
                ? <>No sign-ups in the last 90 days. Most recent tenant joined{" "}
                    <strong style={{ color: "var(--text)" }}>
                      {newestTenant.createdAt.toLocaleDateString()}
                    </strong>
                    {" "}({Math.round((Date.now() - newestTenant.createdAt.getTime()) / 86_400_000)} days ago).
                  </>
                : "No tenants in the database yet."}
            </p>
          )}
        </div>
      </div>

      {/* ── Tenants by plan breakdown ── */}
      <div>
        <SectionHeader title="Tenants by plan" />
        <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
          Active + trialling + past-due shown per plan. Only ACTIVE tenants count toward MRR.
        </p>
        <div
          className="mt-3 overflow-hidden rounded-md"
          style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
        >
          <table className="w-full text-sm">
            <thead style={{ color: "var(--muted)" }}>
              <tr className="text-left">
                <th className="px-4 py-3 font-normal">Plan</th>
                <th className="px-4 py-3 font-normal text-right">Active</th>
                <th className="px-4 py-3 font-normal text-right">Trial</th>
                <th className="px-4 py-3 font-normal text-right">Past due</th>
                <th className="px-4 py-3 font-normal text-right">Price / mo</th>
                <th className="px-4 py-3 font-normal text-right">MRR</th>
              </tr>
            </thead>
            <tbody>
              {(["STARTER", "GROWTH", "PRO", "ENTERPRISE"] as const).map((plan) => {
                const t     = planTotals[plan];
                const price = PLAN_MRR[plan];
                return (
                  <tr key={plan} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="px-4 py-3 font-medium">{plan}</td>
                    <td className="px-4 py-3 text-right">{t.active}</td>
                    <td className="px-4 py-3 text-right" style={{ color: "var(--muted)" }}>{t.trial}</td>
                    <td
                      className="px-4 py-3 text-right"
                      style={{ color: t.pastDue > 0 ? "#f59e0b" : "var(--muted)" }}
                    >
                      {t.pastDue}
                    </td>
                    <td className="px-4 py-3 text-right" style={{ color: "var(--muted)" }}>${price}</td>
                    <td className="px-4 py-3 text-right">${(t.active * price).toLocaleString()}</td>
                  </tr>
                );
              })}
              <tr style={{ borderTop: "1px solid var(--border)", fontWeight: 600 }}>
                <td className="px-4 py-3" colSpan={5}>Total MRR</td>
                <td className="px-4 py-3 text-right">${mrr.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Recent tenants ── */}
      <div>
        <div className="flex items-center justify-between">
          <SectionHeader title="Recent sign-ups" />
          <Link href="/platform/tenants" className="text-xs underline" style={{ color: "var(--muted)" }}>
            View all →
          </Link>
        </div>
        <div
          className="mt-3 overflow-hidden rounded-md"
          style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
        >
          <table className="w-full text-sm">
            <thead style={{ color: "var(--muted)" }}>
              <tr className="text-left">
                <th className="px-4 py-3 font-normal">Tenant</th>
                <th className="px-4 py-3 font-normal">Plan</th>
                <th className="px-4 py-3 font-normal">Status</th>
                <th className="px-4 py-3 font-normal">Joined</th>
              </tr>
            </thead>
            <tbody>
              {recentTenants.map((t) => (
                <tr key={t.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="px-4 py-3">
                    <Link href={`/platform/tenants/${t.id}`} className="font-medium underline">
                      {t.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{t.plan}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--muted)" }}>
                    {t.createdAt.toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── User / tenant headline counts ── */}
      <div>
        <SectionHeader title="Platform totals" />
        <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="All tenants" value={String(tenantCount)} />
          <Stat label="Trial"       value={String(trialCount)} />
          <Stat label="Canceled"    value={String(canceledCount)} />
          <Stat label="Total users" value={String(userCount)} />
        </div>
      </div>

      {/* ── Active impersonation sessions ── */}
      <div>
        <SectionHeader title="Active impersonation sessions" />
        {activeSessions.length === 0 ? (
          <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
            No platform staff are currently signed in as a tenant.
          </p>
        ) : (
          <div
            className="mt-3 overflow-hidden rounded-md"
            style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
          >
            <table className="w-full text-sm">
              <thead style={{ color: "var(--muted)" }}>
                <tr className="text-left">
                  <th className="px-4 py-3 font-normal">Admin</th>
                  <th className="px-4 py-3 font-normal">Tenant</th>
                  <th className="px-4 py-3 font-normal">Reason</th>
                  <th className="px-4 py-3 font-normal">Started</th>
                </tr>
              </thead>
              <tbody>
                {activeSessions.map((s) => {
                  const u    = userById.get(s.platformUserId);
                  const t    = tenantById.get(s.tenantId);
                  const mins = Math.round((Date.now() - s.startedAt.getTime()) / 60000);
                  return (
                    <tr key={s.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td className="px-4 py-3">{u?.name ?? u?.email ?? "unknown"}</td>
                      <td className="px-4 py-3">
                        {t ? (
                          <Link href={`/platform/tenants/${t.id}`} className="underline">{t.name}</Link>
                        ) : (
                          <span style={{ color: "var(--muted)" }}>deleted</span>
                        )}
                      </td>
                      <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{s.reason ?? "—"}</td>
                      <td className="px-4 py-3" style={{ color: "var(--muted)" }}>
                        {mins < 1 ? "just now" : `${mins}m ago`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md px-4 py-5" style={{ background: "var(--panel)", border: "1px solid var(--border)" }}>
      <div className="text-xs" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>{sub}</div>}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
      {title}
    </h2>
  );
}

function TriageColumn({
  title,
  empty,
  color,
  items,
}: {
  title: string;
  empty: string;
  color: string;
  items: { key: string; href: string; title: string; meta: string }[];
}) {
  return (
    <div style={{ background: "var(--panel)" }}>
      <div
        className="flex items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wide"
        style={{ color: "var(--muted)" }}
      >
        <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden />
        {title}
        <span className="ml-auto text-[11px] font-normal" style={{ color: "var(--muted)" }}>
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-3 text-xs" style={{ color: "var(--muted)" }}>{empty}</p>
      ) : (
        <ul>
          {items.map((it) => (
            <li key={it.key} style={{ borderTop: "1px solid var(--border)" }}>
              <Link href={it.href} className="block px-4 py-2 hover:opacity-80">
                <div className="text-sm font-medium line-clamp-1">{it.title}</div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>{it.meta}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ageLabel(d: Date): string {
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1)    return "just now";
  if (mins < 60)   return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24)    return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ACTIVE:    "#10b981",
    TRIAL:     "#3b82f6",
    PAST_DUE:  "#f59e0b",
    SUSPENDED: "#ef4444",
    CANCELED:  "#6b7280",
    ARCHIVED:  "#6b7280",
  };
  return (
    <span style={{ color: colors[status] ?? "var(--muted)", fontSize: "0.75rem", fontWeight: 500 }}>
      {status}
    </span>
  );
}
