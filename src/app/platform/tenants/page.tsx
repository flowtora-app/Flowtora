import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { computeTenantHealth, environmentColor, healthColor } from "@/lib/tenant-health";
import { cohortLabel, cohortChip } from "@/lib/cohorts";
import { formatBytes, GB_IN_BYTES } from "@/lib/storage-quota";
import { PLAN_ENTITLEMENTS } from "@/lib/entitlements";
import type { BetaCohort, Prisma } from "@prisma/client";

// Phase 17 Slice A — searchable, filterable tenant list.
// Phase 1 rework — adds environment chip, structured health dot, and
// routes archived tenants behind a toggle so the default view stays
// focused on live ops.
//
// Rows link to the detail page (not the workspace). "Open workspace" is
// a button inside the detail page where impersonation landed (Slice B).

const STATUS_OPTIONS = ["ALL", "TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELED", "ARCHIVED"] as const;
const ENV_OPTIONS    = ["ALL", "LIVE", "DEMO", "TEST"] as const;
const COHORT_FILTER_OPTIONS = ["ALL", "NONE", "ALPHA", "BETA", "PILOT"] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number];
type EnvFilter    = (typeof ENV_OPTIONS)[number];
type CohortFilter = (typeof COHORT_FILTER_OPTIONS)[number];

export default async function PlatformTenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; env?: string; cohort?: string; includeArchived?: string }>;
}) {
  await requirePlatformStaff();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const statusParam = (sp.status ?? "ALL").toUpperCase();
  const envParam    = (sp.env ?? "ALL").toUpperCase();
  const cohortParam = (sp.cohort ?? "ALL").toUpperCase();
  const status: StatusFilter = (STATUS_OPTIONS as readonly string[]).includes(statusParam)
    ? (statusParam as StatusFilter)
    : "ALL";
  const env: EnvFilter = (ENV_OPTIONS as readonly string[]).includes(envParam)
    ? (envParam as EnvFilter)
    : "ALL";
  const cohort: CohortFilter = (COHORT_FILTER_OPTIONS as readonly string[]).includes(cohortParam)
    ? (cohortParam as CohortFilter)
    : "ALL";
  const showArchived = sp.includeArchived === "1" || status === "ARCHIVED";

  const where: Prisma.TenantWhereInput = {};
  if (status !== "ALL") where.status = status;
  // Hide archived by default unless the user opts in or filters explicitly.
  if (status === "ALL" && !showArchived) where.status = { not: "ARCHIVED" };
  if (env !== "ALL") where.environment = env;
  if (cohort !== "ALL") where.betaCohort = cohort as BetaCohort;
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
    ];
  }

  const tenants = await db.tenant.findMany({
    where,
    orderBy: [{ lastActivityAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    include: { _count: { select: { memberships: true } } },
    take: 200,
  });

  // Batch storage usage in a single groupBy across the listed tenants
  // — one round-trip vs 200. The admin column reads the legacy
  // PLAN_ENTITLEMENTS map for the per-plan cap (synchronous,
  // approximate but fine at this surface — the live tenant flows
  // already use the DB-backed planLimit() for hard enforcement).
  const tenantIds = tenants.map((t) => t.id);
  const usageRows = tenantIds.length
    ? await db.file.groupBy({
        by: ["tenantId"],
        where: { tenantId: { in: tenantIds } },
        _sum: { sizeBytes: true },
      })
    : [];
  const usageByTenant = new Map<string, number>();
  for (const r of usageRows) {
    usageByTenant.set(r.tenantId, r._sum.sizeBytes ?? 0);
  }

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Tenants</h1>
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          {tenants.length} shown
        </div>
      </div>

      <form className="mt-4 flex flex-wrap items-end gap-2" method="get">
        <label className="block flex-1 min-w-[200px]">
          <span className="mb-1 block text-xs" style={{ color: "var(--text-muted)" }}>Search</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="Name or slug"
            className="w-full rounded-md px-3 py-2 text-sm outline-none"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs" style={{ color: "var(--text-muted)" }}>Status</span>
          <select
            name="status"
            defaultValue={status}
            className="rounded-md px-3 py-2 text-sm outline-none"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs" style={{ color: "var(--text-muted)" }}>Environment</span>
          <select
            name="env"
            defaultValue={env}
            className="rounded-md px-3 py-2 text-sm outline-none"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
          >
            {ENV_OPTIONS.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs" style={{ color: "var(--text-muted)" }}>Cohort</span>
          <select
            name="cohort"
            defaultValue={cohort}
            className="rounded-md px-3 py-2 text-sm outline-none"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
          >
            {COHORT_FILTER_OPTIONS.map((c) => (
              <option key={c} value={c}>{c === "ALL" ? "ALL" : c === "NONE" ? "GA" : c}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
          <input type="checkbox" name="includeArchived" value="1" defaultChecked={showArchived} />
          Show archived
        </label>
        <button
          type="submit"
          className="rounded-md px-4 py-2 text-sm font-medium"
          style={{ background: "var(--accent-primary)", color: "white" }}
        >
          Filter
        </button>
        {(q || status !== "ALL" || env !== "ALL" || cohort !== "ALL" || showArchived) && (
          <Link href="/platform/tenants" className="text-xs underline" style={{ color: "var(--text-muted)" }}>
            Clear
          </Link>
        )}
      </form>

      <div
        className="mt-4 overflow-hidden rounded-md"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
      >
        <table className="w-full text-sm">
          <thead style={{ color: "var(--text-muted)" }}>
            <tr className="text-left">
              <th className="px-4 py-3 font-normal">Shop</th>
              <th className="px-4 py-3 font-normal">Env</th>
              <th className="px-4 py-3 font-normal">Cohort</th>
              <th className="px-4 py-3 font-normal">Plan</th>
              <th className="px-4 py-3 font-normal">Status</th>
              <th className="px-4 py-3 font-normal">Health</th>
              <th className="px-4 py-3 font-normal">Users</th>
              <th className="px-4 py-3 font-normal">Storage</th>
              <th className="px-4 py-3 font-normal">Last activity</th>
              <th className="px-4 py-3 font-normal">Created</th>
            </tr>
          </thead>
          <tbody>
            {tenants.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-6 text-center" style={{ color: "var(--text-muted)" }}>
                  No tenants match.
                </td>
              </tr>
            )}
            {tenants.map((t) => {
              const health = computeTenantHealth(t);
              const envChip = environmentColor(t.environment);
              const hc = healthColor(health.level);
              return (
                <tr key={t.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <td className="px-4 py-3">
                    <Link href={`/platform/tenants/${t.id}`} className="font-medium underline">
                      {t.name}
                    </Link>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>{t.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                      style={{ background: envChip.bg, color: envChip.fg }}
                    >
                      {envChip.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {t.betaCohort !== "NONE" ? (
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                        style={{ background: cohortChip(t.betaCohort).bg, color: cohortChip(t.betaCohort).fg }}
                      >
                        {cohortLabel(t.betaCohort)}
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{t.plan}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={t.status} />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs"
                      style={{ background: hc.bg, color: hc.fg }}
                      title={health.signals.join(" · ")}
                    >
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full"
                        style={{ background: hc.fg }}
                      />
                      {health.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">{t._count.memberships}</td>
                  <td className="px-4 py-3 text-xs">
                    <StorageCell
                      usedBytes={usageByTenant.get(t.id) ?? 0}
                      quotaGB={PLAN_ENTITLEMENTS[t.plan].limits.storageQuotaGB}
                    />
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
                    {health.daysInactive === 0 ? "today" : `${health.daysInactive}d ago`}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
                    {t.createdAt.toISOString().slice(0, 10)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const { bg, fg } =
    status === "ACTIVE"    ? { bg: "var(--success-surface)", fg: "var(--success-fg)" } :
    status === "TRIAL"     ? { bg: "var(--accent-surface)",  fg: "var(--accent-primary)" } :
    status === "PAST_DUE"  ? { bg: "var(--warning-surface)", fg: "var(--warning-fg)" } :
    status === "SUSPENDED" ? { bg: "var(--danger-surface)",  fg: "var(--danger-fg)" } :
    status === "ARCHIVED"  ? { bg: "var(--surface-2)",       fg: "var(--text-muted)" } :
    { bg: "var(--surface-2)", fg: "var(--text-muted)" };
  return (
    <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: bg, color: fg }}>
      {status}
    </span>
  );
}

function StorageCell({
  usedBytes,
  quotaGB,
}: {
  usedBytes: number;
  quotaGB: number | null;
}) {
  const used = formatBytes(usedBytes);
  // null = unlimited (Enterprise / unlimited tier)
  if (quotaGB === null) {
    return (
      <div>
        <div style={{ color: "var(--text-default)" }}>{used}</div>
        <div style={{ color: "var(--text-faint)" }}>of unlimited</div>
      </div>
    );
  }
  const quotaBytes = quotaGB * GB_IN_BYTES;
  const pct = Math.min(1, usedBytes / quotaBytes);
  const tone =
    pct >= 1 ? "var(--danger-fg)" : pct >= 0.85 ? "var(--warning-fg)" : "var(--text-muted)";
  return (
    <div>
      <div style={{ color: tone, fontWeight: pct >= 0.85 ? 600 : 400 }}>
        {used}
      </div>
      <div style={{ color: "var(--text-faint)" }}>
        {Math.round(pct * 100)}% of {quotaGB} GB
      </div>
    </div>
  );
}
