import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  Breadcrumb,
  Button,
  Card,
  PageHeader,
} from "@/components/ui";
import {
  loadUsersKpi,
  loadUsersList,
  type UsersFilters,
  type UsersSortDir,
  type UsersSortKey,
} from "@/server/platform/users-list";
import type { PlatformRole, TenantRole } from "@prisma/client";
import { db } from "@/lib/db";
import { UsersTable } from "./_components/UsersTable";
import { UsersFiltersBar } from "./_components/UsersFiltersBar";
import { UsersBulkMenu } from "./_components/UsersBulkMenu";

// Page 9 — All Users.
// Cross-tenant directory with KPI strip + filters + paged table.

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
const PAGE_SIZE = 50;

const VALID_SORT: Record<UsersSortKey, true> = {
  name: true, email: true, lastLogin: true, created: true, tenants: true, country: true,
};
const TENANT_ROLES: TenantRole[] = [
  "OWNER", "ADMIN", "SALES_REP", "CSR", "DESIGNER",
  "PRODUCTION_MANAGER", "INSTALLER", "ACCOUNTING", "EMPLOYEE",
];
const PLATFORM_ROLES: PlatformRole[] = [
  "SUPER_ADMIN", "SITE_MANAGER", "SUPPORT_AGENT", "ADMIN", "MANAGER",
  "SUPPORT_LEAD", "BILLING_MANAGER", "DEVELOPER", "MARKETING_MANAGER",
  "CONTENT_MANAGER", "ANALYST", "READ_ONLY_VIEWER",
];

function parseFilters(sp: SearchParams): UsersFilters {
  const f: UsersFilters = {};
  if (typeof sp.q === "string" && sp.q.trim()) f.q = sp.q.trim();
  if (typeof sp.tenant === "string" && sp.tenant) f.tenantId = sp.tenant;
  if (typeof sp.tRole === "string" && (TENANT_ROLES as string[]).includes(sp.tRole)) {
    f.tenantRole = sp.tRole as TenantRole;
  }
  if (typeof sp.pRole === "string" && (PLATFORM_ROLES as string[]).includes(sp.pRole)) {
    f.platformRole = sp.pRole as PlatformRole;
  }
  if (typeof sp.status === "string") {
    if (["active", "deactivated", "banned", "merged", "locked"].includes(sp.status)) {
      f.status = sp.status as UsersFilters["status"];
    }
  }
  if (sp.mfa === "1") f.mfaEnabled = true;
  else if (sp.mfa === "0") f.mfaEnabled = false;
  if (sp.verified === "1") f.emailVerified = true;
  else if (sp.verified === "0") f.emailVerified = false;
  if (typeof sp.country === "string" && sp.country) f.country = sp.country.toUpperCase();
  if (typeof sp.signin === "string" && sp.signin) {
    if (["credentials", "google", "microsoft", "sso", "other"].includes(sp.signin)) {
      f.signInMethod = sp.signin as UsersFilters["signInMethod"];
    }
  }
  if (typeof sp.lastSince === "string" && sp.lastSince) {
    const d = new Date(sp.lastSince); if (!Number.isNaN(d.getTime())) f.lastLoginSince = d;
  }
  if (typeof sp.lastUntil === "string" && sp.lastUntil) {
    const d = new Date(sp.lastUntil); if (!Number.isNaN(d.getTime())) f.lastLoginUntil = d;
  }
  return f;
}

function buildQs(sp: SearchParams, override: Record<string, string | null> = {}): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k in override) continue;
    if (typeof v === "string") u.set(k, v);
    else if (Array.isArray(v)) for (const x of v) u.append(k, x);
  }
  for (const [k, v] of Object.entries(override)) {
    if (v != null && v !== "") u.set(k, v);
  }
  const q = u.toString();
  return q ? `?${q}` : "";
}

export default async function PlatformUsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;

  const canImpersonate = ctx.can("tenant.impersonate");
  const canBan = ctx.can("users.ban");

  const filters = parseFilters(sp);
  const sortKeyRaw = typeof sp.sort === "string" ? sp.sort : "lastLogin";
  const sortKey: UsersSortKey = (VALID_SORT[sortKeyRaw as UsersSortKey] ? sortKeyRaw : "lastLogin") as UsersSortKey;
  const sortDir: UsersSortDir = sp.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : "1") || 1);

  const [kpi, list, tenantOptions, countries] = await Promise.all([
    loadUsersKpi(),
    loadUsersList({ filters, sortKey, sortDir, page, pageSize: PAGE_SIZE }),
    db.tenant.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
      take: 500,
    }),
    db.user.findMany({
      where: { country: { not: null } },
      select: { country: true },
      distinct: ["country"],
      take: 200,
    }),
  ]);

  const countryOptions = Array.from(
    new Set(countries.map((c) => c.country!.toUpperCase())),
  ).sort();

  const filterQs = buildQs(sp, { page: null });

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Users" },
        ]} />
        <div className="mt-3">
          <PageHeader
            title="All Users"
            description="Every user across every Flowtora tenant."
            actions={
              <>
                <Link href={`/api/platform/users/export${filterQs}`}>
                  <Button size="sm" variant="secondary">Export</Button>
                </Link>
                {canBan && (
                  <UsersBulkMenu
                    tenantOptions={tenantOptions.map((t) => ({ id: t.id, label: `${t.name} (${t.slug})` }))}
                  />
                )}
              </>
            }
          />
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Total users"     value={kpi.total.toLocaleString()} />
        <KpiCard label="Active · 30d"    value={kpi.activeLast30d.toLocaleString()}
                 sub={kpi.total === 0 ? "—" : `${Math.round((kpi.activeLast30d / kpi.total) * 100)}% of total`} />
        <KpiCard label="MFA enabled"     value={`${kpi.mfaEnabledPct}%`}
                 tone={kpi.mfaEnabledPct < 50 ? "warning" : "good"} />
        <KpiCard label="Pending invites" value={kpi.pendingInvites.toLocaleString()} />
        <KpiCard label="Suspicious · 24h" value={kpi.suspiciousLast24h.toLocaleString()}
                 tone={kpi.suspiciousLast24h > 0 ? "danger" : "default"} />
      </div>

      {/* Filters */}
      <Card padding="md">
        <UsersFiltersBar
          tenantOptions={tenantOptions.map((t) => ({ id: t.id, label: `${t.name} (${t.slug})` }))}
          countryOptions={countryOptions}
          tenantRoleOptions={TENANT_ROLES}
          platformRoleOptions={PLATFORM_ROLES}
        />
      </Card>

      {/* Table */}
      <UsersTable
        rows={list.rows}
        total={list.total}
        filteredTotal={list.filteredTotal}
        page={page}
        pageSize={PAGE_SIZE}
        sortKey={sortKey}
        sortDir={sortDir}
        canImpersonate={canImpersonate}
        canBan={canBan}
      />
    </div>
  );
}

function KpiCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "default" | "good" | "warning" | "danger" }) {
  const palette =
    tone === "good"    ? { borderColor: "var(--emerald-200)" } :
    tone === "warning" ? { borderColor: "var(--amber-200)" } :
    tone === "danger"  ? { borderColor: "var(--rose-200)" } :
                          undefined;
  return (
    <Card padding="md" className="h-full" style={palette}>
      <div className="flex h-full flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
        <div className="text-[24px] font-semibold leading-none tabular-nums" style={{ color: "var(--text-default)" }}>
          {value}
        </div>
        {sub && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{sub}</div>}
      </div>
    </Card>
  );
}
