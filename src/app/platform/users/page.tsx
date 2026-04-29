import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { Icon } from "@/components/shell/icons";
import type { Prisma } from "@prisma/client";

// /platform/users — cross-tenant user directory.
//
// Different from /platform/staff (which is platform employees only).
// This is every End User in the system: shop owners, sales reps,
// customer-portal accounts, etc. Filterable by:
//   - q (email + name search)
//   - filter: all / banned / multi-tenant / no-tenant / merged
//   - tenant (rows only on a specific tenant's roster)
//
// Drill-down at /platform/users/[id] shows tenant memberships, ban
// history, and the merge surface.

export const dynamic = "force-dynamic";

const FILTER_OPTIONS = [
  { value: "all",          label: "All" },
  { value: "banned",       label: "Banned" },
  { value: "multi-tenant", label: "Multi-tenant" },
  { value: "no-tenant",    label: "No tenant" },
  { value: "merged",       label: "Merged (source)" },
] as const;
type FilterKey = (typeof FILTER_OPTIONS)[number]["value"];

type SP = {
  q?: string;
  filter?: string;
  tenant?: string;
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requirePlatformStaff();
  const sp = await searchParams;

  const q = (sp.q ?? "").trim();
  const filter: FilterKey = (FILTER_OPTIONS.map((o) => o.value) as readonly string[]).includes(sp.filter ?? "")
    ? (sp.filter as FilterKey) : "all";
  const tenantFilter = (sp.tenant ?? "").trim() || null;

  const where: Prisma.UserWhereInput = {
    // Exclude platform staff — they have their own /platform/staff page.
    platformRole: null,
    ...(q ? {
      OR: [
        { email: { contains: q, mode: "insensitive" } },
        { name:  { contains: q, mode: "insensitive" } },
      ],
    } : {}),
    ...(filter === "banned"       ? { bannedAt: { not: null } } : {}),
    ...(filter === "merged"       ? { mergedIntoId: { not: null } } : {}),
    ...(tenantFilter              ? { memberships: { some: { tenantId: tenantFilter } } } : {}),
  };

  const [usersRaw, kpiBanned, kpiMerged, kpiTotal, tenantsForFilter] = await Promise.all([
    db.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        lastLoginAt: true,
        bannedAt: true,
        bannedReason: true,
        mergedIntoId: true,
        twoFactorEnabled: true,
        createdAt: true,
        memberships: {
          select: {
            tenantId: true,
            role: true,
            status: true,
            tenant: { select: { id: true, name: true, slug: true, status: true } },
          },
        },
        _count: { select: { memberships: true } },
      },
      orderBy: [{ lastLoginAt: { sort: "desc", nulls: "last" } }, { email: "asc" }],
      take: 200,
    }),
    db.user.count({ where: { platformRole: null, bannedAt: { not: null } } }),
    db.user.count({ where: { platformRole: null, mergedIntoId: { not: null } } }),
    db.user.count({ where: { platformRole: null } }),
    db.tenant.findMany({
      where: { status: { not: "ARCHIVED" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
  ]);

  // Multi-tenant filter is computed in JS because Prisma doesn't have
  // an `_count gt 1` filter without a raw query.
  const users = filter === "multi-tenant"
    ? usersRaw.filter((u) => u._count.memberships > 1)
    : filter === "no-tenant"
    ? usersRaw.filter((u) => u._count.memberships === 0)
    : usersRaw;

  return (
    <div className="space-y-6">
      <Header />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="End users (total)" value={String(kpiTotal)} hint="Excludes platform staff" />
        <Kpi label="Banned"  value={String(kpiBanned)} tone={kpiBanned > 0 ? "warn" : "default"} />
        <Kpi label="Merged"  value={String(kpiMerged)} hint="Soft-deleted via merge" />
        <Kpi label="Showing" value={String(users.length)} hint="Capped at 200 rows" />
      </div>

      <FilterBar q={q} filter={filter} tenantFilter={tenantFilter} tenants={tenantsForFilter} />

      <UsersList rows={users} />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

function Header() {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          <Icon.Customers size={14} />
          <span>Phase 4 · Trust &amp; Safety</span>
        </div>
        <h1 className="mt-1 text-[26px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
          Users (cross-tenant)
        </h1>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
          Every end user across every tenant. Use this page to find duplicate
          accounts, ban abuse, or merge identities.
        </p>
      </div>
      <Link
        href="/platform/abuse"
        className="ts-focus inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-medium"
        style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)", background: "var(--surface-1)" }}
      >
        <Icon.Shield size={14} /> Ban list →
      </Link>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warn";
}) {
  return (
    <div className="rounded-lg border px-4 py-3" style={{ background: "var(--surface-1)", borderColor: tone === "warn" ? "var(--warning-fg)" : "var(--border-subtle)" }}>
      <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="mt-1 text-[22px] font-semibold leading-none" style={{ color: tone === "warn" ? "var(--warning-fg)" : "var(--text-default)" }}>{value}</div>
      {hint && <div className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>{hint}</div>}
    </div>
  );
}

function FilterBar({
  q, filter, tenantFilter, tenants,
}: {
  q: string;
  filter: FilterKey;
  tenantFilter: string | null;
  tenants: { id: string; name: string }[];
}) {
  return (
    <form className="flex flex-wrap items-end gap-2 rounded-lg border p-3" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <label className="block flex-1 min-w-[180px]">
        <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Search</span>
        <input
          type="search" name="q" defaultValue={q}
          placeholder="email or name"
          className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
        />
      </label>
      <label className="block">
        <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Filter</span>
        <select
          name="filter" defaultValue={filter}
          className="ts-focus mt-1 rounded-md border px-2 py-2 text-[13px]"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
        >
          {FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Tenant</span>
        <select
          name="tenant" defaultValue={tenantFilter ?? ""}
          className="ts-focus mt-1 rounded-md border px-2 py-2 text-[13px]"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
        >
          <option value="">— Any —</option>
          {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <button type="submit" className="ts-focus rounded-md border px-3 py-2 text-[13px] font-medium" style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)", background: "var(--surface-1)" }}>
        Apply
      </button>
    </form>
  );
}

/* ────────────────────────────────────────────────────────────── */

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  lastLoginAt: Date | null;
  bannedAt: Date | null;
  bannedReason: string | null;
  mergedIntoId: string | null;
  twoFactorEnabled: boolean;
  createdAt: Date;
  memberships: {
    tenantId: string;
    role: string;
    status: string;
    tenant: { id: string; name: string; slug: string; status: string };
  }[];
  _count: { memberships: number };
};

function UsersList({ rows }: { rows: UserRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border px-4 py-8 text-center text-[13px]" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
        No users match those filters.
      </div>
    );
  }
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>Users ({rows.length})</h2>
      </div>
      <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
        {rows.map((u) => (
          <UserRowItem key={u.id} u={u} />
        ))}
      </ul>
    </section>
  );
}

function UserRowItem({ u }: { u: UserRow }) {
  const display = u.name?.trim() || u.email;
  const initials = deriveInitials(display);
  const last = u.lastLoginAt ? formatRelative(u.lastLoginAt) : "Never";

  return (
    <li>
      <Link
        href={`/platform/users/${u.id}`}
        className="ts-focus grid grid-cols-1 gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-2)] md:grid-cols-[2fr_2fr_1fr_1fr]"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-[12px] font-semibold"
            style={{ background: "var(--accent-surface)", color: "var(--accent-primary)", border: "1px solid var(--border-subtle)" }}
          >
            {u.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={u.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : initials}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>
                {display}
              </span>
              {u.bannedAt && (
                <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase" style={{ background: "var(--danger-surface)", color: "var(--danger-fg)" }}>
                  Banned
                </span>
              )}
              {u.mergedIntoId && (
                <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                  Merged
                </span>
              )}
            </div>
            <div className="truncate text-[11px]" style={{ color: "var(--text-muted)" }}>{u.email}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 text-[11px]">
          {u._count.memberships === 0 ? (
            <span style={{ color: "var(--text-muted)" }}>No tenants</span>
          ) : (
            u.memberships.slice(0, 4).map((m) => (
              <span
                key={m.tenantId}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium"
                style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-subtle)" }}
                title={`${m.tenant.name} · ${m.role} · ${m.status}`}
              >
                {m.tenant.name}
              </span>
            ))
          )}
          {u._count.memberships > 4 && (
            <span style={{ color: "var(--text-muted)" }}>+{u._count.memberships - 4} more</span>
          )}
        </div>

        <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          <div><span style={{ color: "var(--text-default)" }}>Last login</span> · {last}</div>
          <div><span style={{ color: "var(--text-default)" }}>Joined</span> · {u.createdAt.toLocaleDateString()}</div>
        </div>

        <div className="flex flex-wrap items-center gap-1 text-[11px] justify-self-end">
          {u.twoFactorEnabled ? (
            <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
              <Icon.Shield size={10} /> 2FA
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
              No 2FA
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}

/* ────────────────────────────────────────────────────────────── */

function deriveInitials(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return "?";
  const stem = trimmed.includes("@") ? trimmed.split("@")[0]! : trimmed;
  const parts = stem.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return stem.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function formatRelative(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = 60_000, hour = 60 * min, day = 24 * hour;
  if (ms < min)        return "just now";
  if (ms < hour)       return `${Math.floor(ms / min)}m ago`;
  if (ms < day)        return `${Math.floor(ms / hour)}h ago`;
  if (ms < 30 * day)   return `${Math.floor(ms / day)}d ago`;
  return d.toLocaleDateString();
}
