import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { getAllPlans } from "@/lib/plans";

export const dynamic = "force-dynamic";

// Phase E — Usage / adoption / engagement analytics.
//
// Platform staff care about three things here:
//   1. Which modules are getting traction across the tenant base
//      (if nobody creates invoices, that's a product problem).
//   2. Which tenants are "sticky" (lots of recent activity) and which
//      are going dormant (last login weeks ago) — signals CSMs watch.
//   3. How long new sign-ups take to reach first value (first quote,
//      first order, first invoice).
//
// Everything is computed from the core transactional tables —
// Quote/Order/Invoice/Proof + Membership.lastActiveAt + Tenant.
// No separate telemetry pipeline required.

type ModuleStat = {
  label: string;
  tenantsUsing: number;    // distinct tenants with ≥1 record
  recordsAll: number;      // lifetime records
  records30d: number;      // records created in last 30d
};

export default async function PlatformUsagePage() {
  await requirePlatformStaff();

  const now = new Date();
  const day = 86_400_000;
  const last7d = new Date(now.getTime() - 7 * day);
  const last30d = new Date(now.getTime() - 30 * day);

  const [
    tenantCountAll,
    activeTenants,
    membersActive7d,
    membersActive30d,
    newSignups30d,
    // Module usage — tenants using each + total + 30d
    quoteStats30, quoteAll, quoteTenants,
    orderStats30, orderAll, orderTenants,
    invoiceStats30, invoiceAll, invoiceTenants,
    proofStats30, proofAll, proofTenants,
    installStats30, installAll, installTenants,
    taskStats30, taskAll, taskTenants,
    customerStats30, customerAll, customerTenants,
    // Usage by plan
    usageByPlan,
    // Dormant tenants — no membership.lastActiveAt in last 30d
    dormantTenants,
    // Most engaged tenants — most Memberships active recently
    topEngagedTenants,
    // Onboarding completion
    onboardingDone,
    // Plan catalog — DB-backed (M6). Drop drafts/archived but keep HIDDEN
    // so legacy tiers (e.g. Growth) with paying tenants still show.
    allPlans,
  ] = await Promise.all([
    db.tenant.count(),
    db.tenant.count({ where: { status: { in: ["ACTIVE", "TRIAL"] } } }),
    db.user.count({
      where: { lastLoginAt: { gte: last7d }, memberships: { some: {} } },
    }),
    db.user.count({
      where: { lastLoginAt: { gte: last30d }, memberships: { some: {} } },
    }),
    db.tenant.count({ where: { createdAt: { gte: last30d } } }),

    db.quote.count({ where: { createdAt: { gte: last30d } } }),
    db.quote.count(),
    db.quote.findMany({ distinct: ["tenantId"], select: { tenantId: true } }),

    db.order.count({ where: { createdAt: { gte: last30d } } }),
    db.order.count(),
    db.order.findMany({ distinct: ["tenantId"], select: { tenantId: true } }),

    db.invoice.count({ where: { createdAt: { gte: last30d } } }),
    db.invoice.count(),
    db.invoice.findMany({ distinct: ["tenantId"], select: { tenantId: true } }),

    db.proof.count({ where: { createdAt: { gte: last30d } } }),
    db.proof.count(),
    db.proof.findMany({ distinct: ["tenantId"], select: { tenantId: true } }),

    db.installEvent.count({ where: { createdAt: { gte: last30d } } }),
    db.installEvent.count(),
    db.installEvent.findMany({ distinct: ["tenantId"], select: { tenantId: true } }),

    db.task.count({ where: { createdAt: { gte: last30d } } }),
    db.task.count(),
    db.task.findMany({ distinct: ["tenantId"], select: { tenantId: true } }),

    db.customer.count({ where: { createdAt: { gte: last30d } } }),
    db.customer.count(),
    db.customer.findMany({ distinct: ["tenantId"], select: { tenantId: true } }),

    // Memberships whose user logged in within 30 days, tagged with the
    // tenant plan so we can split "active members" by plan tier.
    db.membership.findMany({
      where: { user: { lastLoginAt: { gte: last30d } } },
      select: { tenantId: true, tenant: { select: { plan: true } } },
    }),

    db.tenant.findMany({
      where: {
        status: { in: ["ACTIVE", "TRIAL"] },
        memberships: {
          none: { user: { lastLoginAt: { gte: last30d } } },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { id: true, name: true, plan: true, status: true, createdAt: true },
    }),

    db.tenant.findMany({
      where: { status: { in: ["ACTIVE", "TRIAL"] } },
      orderBy: { memberships: { _count: "desc" } },
      take: 10,
      select: {
        id: true, name: true, plan: true, status: true,
        _count: { select: { memberships: true, quotes: true, orders: true, invoices: true } },
      },
    }),

    db.tenant.count({ where: { onboardingCompletedAt: { not: null } } }),

    getAllPlans(),
  ]);

  const planList = allPlans.filter(
    (p) => p.status !== "DRAFT" && p.status !== "ARCHIVED",
  );

  const modules: ModuleStat[] = [
    { label: "Customers",     tenantsUsing: customerTenants.length, recordsAll: customerAll, records30d: customerStats30 },
    { label: "Quotes",        tenantsUsing: quoteTenants.length,    recordsAll: quoteAll,    records30d: quoteStats30 },
    { label: "Orders",        tenantsUsing: orderTenants.length,    recordsAll: orderAll,    records30d: orderStats30 },
    { label: "Proofs",        tenantsUsing: proofTenants.length,    recordsAll: proofAll,    records30d: proofStats30 },
    { label: "Invoices",      tenantsUsing: invoiceTenants.length,  recordsAll: invoiceAll,  records30d: invoiceStats30 },
    { label: "Install events",tenantsUsing: installTenants.length,  recordsAll: installAll,  records30d: installStats30 },
    { label: "Tasks",         tenantsUsing: taskTenants.length,     recordsAll: taskAll,     records30d: taskStats30 },
  ];

  // Tenants using = distinct tenantId across that module. % of active tenants.
  for (const m of modules) {
    // noop — just documenting shape
    void m;
  }

  // Activity by plan (DAU-ish — active users in last 30d split by tenant plan)
  const activeMembersByPlan = new Map<string, number>();
  for (const m of usageByPlan) {
    const k = m.tenant.plan;
    activeMembersByPlan.set(k, (activeMembersByPlan.get(k) ?? 0) + 1);
  }

  const onboardingRate = tenantCountAll === 0
    ? 0
    : Math.round((onboardingDone / tenantCountAll) * 1000) / 10;

  return (
    <div className="space-y-10">
      <PageHeader
        title="Usage & adoption"
        description="Module adoption, active-user trends, and signs of dormancy across all tenants."
      />

      {/* ── KPI row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Active tenants"    value={String(activeTenants)}      sub={`of ${tenantCountAll} total`} />
        <Kpi label="Active members (7 d)"  value={String(membersActive7d)}    sub={`${membersActive30d} in last 30 d`} />
        <Kpi label="New sign-ups (30 d)"  value={String(newSignups30d)}      sub="Including trials" />
        <Kpi label="Onboarding completion" value={`${onboardingRate}%`}        sub={`${onboardingDone} tenants finished setup`} />
      </div>

      {/* ── Module adoption table ──────────────────────────────── */}
      <section>
        <SectionHeader title="Module adoption" />
        <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
          Records in the last 30 days, lifetime records, and the number of distinct tenants that have ever created one.
        </p>
        <div
          className="mt-3 overflow-hidden rounded-lg"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{ color: "var(--text-muted)" }}>
                <Th>Module</Th>
                <Th>Tenants using</Th>
                <Th>Adoption</Th>
                <Th>Records (30 d)</Th>
                <Th>Lifetime</Th>
              </tr>
            </thead>
            <tbody>
              {modules.map((m) => {
                const pct = activeTenants === 0 ? 0 : Math.round((m.tenantsUsing / activeTenants) * 100);
                return (
                  <tr key={m.label} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <Td className="font-medium">{m.label}</Td>
                    <Td>{m.tenantsUsing}</Td>
                    <Td>
                      <ShareBar pct={Math.min(100, pct)} />
                    </Td>
                    <Td>{m.records30d.toLocaleString()}</Td>
                    <Td muted>{m.recordsAll.toLocaleString()}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Usage by plan ──────────────────────────────────────── */}
      <section>
        <SectionHeader title="Active members by plan (30 d)" />
        <div
          className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-4"
        >
          {planList.map((plan) => {
            // The membership query groups by tenant.plan (legacy enum);
            // our slugs are lowercase mirrors of the enum per seed, so
            // slug.toUpperCase() matches the map key.
            const enumKey = plan.slug.toUpperCase();
            return (
              <div
                key={plan.id}
                className="rounded-lg px-4 py-4"
                style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
              >
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>{plan.name}</div>
                <div className="mt-1 text-2xl font-semibold">
                  {activeMembersByPlan.get(enumKey) ?? 0}
                </div>
                <div className="mt-0.5 text-xs" style={{ color: "var(--text-faint)" }}>
                  distinct active members
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Dormant + engaged ──────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section>
          <SectionHeader title="Going dormant" count={dormantTenants.length} tone="warning" />
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            Active / trial tenants where no member has been active in 30+ days. Candidate churn.
          </p>
          <div
            className="mt-3 overflow-hidden rounded-lg"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
          >
            {dormantTenants.length === 0 ? (
              <Empty>No dormant tenants. Engagement is healthy.</Empty>
            ) : (
              <ul>
                {dormantTenants.map((t) => {
                  const age = Math.ceil((Date.now() - t.createdAt.getTime()) / day);
                  return (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                      style={{ borderTop: "1px solid var(--border-subtle)" }}
                    >
                      <div className="min-w-0">
                        <Link href={`/platform/tenants/${t.id}`} className="truncate text-sm font-medium underline">
                          {t.name}
                        </Link>
                        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {t.plan} · {t.status} · created {age}d ago
                        </div>
                      </div>
                      <span
                        className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
                        style={{
                          background: "var(--warning-surface)",
                          color: "var(--warning-fg)",
                        }}
                      >
                        At risk
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section>
          <SectionHeader title="Most engaged tenants" />
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            Ordered by team size and total records. These are your "product showcases".
          </p>
          <div
            className="mt-3 overflow-hidden rounded-lg"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
          >
            {topEngagedTenants.length === 0 ? (
              <Empty>No data yet.</Empty>
            ) : (
              <ul>
                {topEngagedTenants.map((t) => {
                  const total = t._count.quotes + t._count.orders + t._count.invoices;
                  return (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                      style={{ borderTop: "1px solid var(--border-subtle)" }}
                    >
                      <div className="min-w-0">
                        <Link href={`/platform/tenants/${t.id}`} className="truncate text-sm font-medium underline">
                          {t.name}
                        </Link>
                        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {t.plan} · {t._count.memberships} members · {total} records
                        </div>
                      </div>
                      <span
                        className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
                        style={{ background: "var(--success-surface)", color: "var(--success-fg)" }}
                      >
                        {t._count.memberships} ppl
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// ── Primitives ────────────────────────────────────────────────────

function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      {description && (
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          {description}
        </p>
      )}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg px-4 py-4" style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}>
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}

function SectionHeader({
  title,
  count,
  tone = "neutral",
}: {
  title: string;
  count?: number;
  tone?: "neutral" | "warning";
}) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
      {title}
      {count != null && (
        <span
          className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
          style={{
            background: tone === "warning" ? "var(--warning-surface)" : "var(--surface-2)",
            color: tone === "warning" ? "var(--warning-fg)" : "var(--text-muted)",
          }}
        >
          {count}
        </span>
      )}
    </h2>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-xs font-normal uppercase tracking-wider">{children}</th>;
}
function Td({
  children,
  muted,
  className,
}: { children: React.ReactNode; muted?: boolean; className?: string }) {
  return (
    <td className={`px-4 py-3 ${className ?? ""}`} style={muted ? { color: "var(--text-muted)" } : undefined}>
      {children}
    </td>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>{children}</p>;
}

function ShareBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: "var(--accent-primary)" }}
        />
      </div>
      <span className="w-10 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
        {pct}%
      </span>
    </div>
  );
}
