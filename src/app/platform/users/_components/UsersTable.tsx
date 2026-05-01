"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Avatar } from "@/components/ui";
import type {
  UserListRow,
  UsersSortDir,
  UsersSortKey,
} from "@/server/platform/users-list";
import { UserRowMenu } from "./UserRowMenu";

// UsersTable — sortable, paged, with per-row 3-dot menu.

const TENANT_ROLE_LABEL: Record<string, string> = {
  OWNER: "Owner", ADMIN: "Admin", SALES_REP: "Sales", CSR: "CSR",
  DESIGNER: "Designer", PRODUCTION_MANAGER: "Production",
  INSTALLER: "Installer", ACCOUNTING: "Accounting", EMPLOYEE: "Employee",
  CUSTOMER_PORTAL: "Customer",
};

export function UsersTable({
  rows,
  total,
  filteredTotal,
  page,
  pageSize,
  sortKey,
  sortDir,
  canImpersonate,
  canBan,
}: {
  rows: UserListRow[];
  total: number;
  filteredTotal: number;
  page: number;
  pageSize: number;
  sortKey: UsersSortKey;
  sortDir: UsersSortDir;
  canImpersonate: boolean;
  canBan: boolean;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const setSort = (key: UsersSortKey) => {
    const u = new URLSearchParams(sp.toString());
    if (sortKey === key) u.set("dir", sortDir === "asc" ? "desc" : "asc");
    else { u.set("sort", key); u.set("dir", "desc"); }
    u.delete("page");
    router.replace(`/platform/users?${u.toString()}`);
  };

  const goToPage = (n: number) => {
    const u = new URLSearchParams(sp.toString());
    u.set("page", String(n));
    router.replace(`/platform/users?${u.toString()}`);
  };

  const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border" style={{ borderColor: "var(--border-subtle)" }}>
        <table className="w-full text-[12px]">
          <thead style={{ background: "var(--surface-2)" }}>
            <tr>
              <SortHeader label="Name"      active={sortKey === "name"}      dir={sortDir} onClick={() => setSort("name")} />
              <SortHeader label="Email"     active={sortKey === "email"}     dir={sortDir} onClick={() => setSort("email")} />
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Tenant(s)</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Role</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Status</th>
              <th className="px-3 py-2 text-center font-semibold" style={{ color: "var(--text-muted)" }}>MFA</th>
              <SortHeader label="Last login" active={sortKey === "lastLogin"} dir={sortDir} onClick={() => setSort("lastLogin")} />
              <SortHeader label="Country"   active={sortKey === "country"}   dir={sortDir} onClick={() => setSort("country")} />
              <SortHeader label="Created"   active={sortKey === "created"}   dir={sortDir} onClick={() => setSort("created")} />
              <th className="w-10 px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center" style={{ color: "var(--text-faint)" }}>
                  No users match the current filters.
                </td>
              </tr>
            ) : rows.map((u) => (
              <tr key={u.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Avatar size="xs" name={u.name ?? u.email} src={u.image ?? undefined} />
                    <Link href={`/platform/users/${u.id}`} className="font-semibold hover:underline"
                          style={{ color: "var(--text-default)" }}>
                      {u.name?.trim() || <span style={{ color: "var(--text-faint)" }}>(no name)</span>}
                    </Link>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span style={{ color: "var(--text-muted)" }}>{u.email}</span>
                    {u.emailVerified ? (
                      <span title="Email verified" aria-label="verified"
                            className="inline-flex h-3 w-3 items-center justify-center rounded-full text-[8px] font-bold"
                            style={{ background: "var(--emerald-50)", color: "var(--emerald-700)" }}>
                        ✓
                      </span>
                    ) : (
                      <span title="Email not verified" aria-label="unverified"
                            className="inline-flex h-3 w-3 items-center justify-center rounded-full text-[8px] font-bold"
                            style={{ background: "var(--amber-50)", color: "var(--amber-700)" }}>
                        !
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">
                  {u.tenants.length === 0 ? (
                    <span style={{ color: "var(--text-faint)" }}>—</span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1">
                      {u.tenants.map((t) => (
                        <Link key={t.id} href={`/platform/tenants/${t.id}`}
                              className="inline-flex items-center rounded-full px-1.5 text-[10px] hover:underline"
                              style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                              title={`${t.name} · ${TENANT_ROLE_LABEL[t.role] ?? t.role}`}>
                          {t.name}
                        </Link>
                      ))}
                      {u.totalTenantCount > u.tenants.length && (
                        <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                          +{u.totalTenantCount - u.tenants.length}
                        </span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                  {u.platformRole ? (
                    <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold"
                          style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}>
                      {u.platformRole.replaceAll("_", " ").toLowerCase()}
                    </span>
                  ) : u.tenants[0] ? (
                    TENANT_ROLE_LABEL[u.tenants[0].role] ?? u.tenants[0].role
                  ) : (
                    <span style={{ color: "var(--text-faint)" }}>—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <StatusPill status={u.status} />
                </td>
                <td className="px-3 py-2 text-center">
                  <span title={u.twoFactorEnabled ? "MFA enabled" : "MFA disabled"} aria-label={u.twoFactorEnabled ? "MFA enabled" : "MFA disabled"}
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: u.twoFactorEnabled ? "var(--emerald-500)" : "var(--rose-500)" }} />
                </td>
                <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                  {u.lastLoginAt ? relativeTime(new Date(u.lastLoginAt)) : <span style={{ color: "var(--text-faint)" }}>never</span>}
                </td>
                <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                  {u.country ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
                </td>
                <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                  {u.createdAt.toLocaleDateString()}
                </td>
                <td className="px-2 py-2 text-right">
                  <UserRowMenu
                    userId={u.id}
                    userName={u.name?.trim() || u.email}
                    userEmail={u.email}
                    canImpersonate={canImpersonate}
                    canBan={canBan}
                    isDeactivated={u.status === "deactivated"}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between gap-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
        <span>
          {filteredTotal === total
            ? `${total.toLocaleString()} user${total === 1 ? "" : "s"}`
            : `${filteredTotal.toLocaleString()} of ${total.toLocaleString()} users`}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button type="button" disabled={page <= 1}
                    onClick={() => goToPage(page - 1)}
                    className="ts-focus inline-flex h-7 items-center rounded-md border px-2 text-[12px] font-medium hover:bg-[var(--surface-2)] disabled:opacity-50"
                    style={{ borderColor: "var(--border-default)", color: "var(--text-default)" }}>
              ← Prev
            </button>
            <span className="px-2">{page} / {totalPages}</span>
            <button type="button" disabled={page >= totalPages}
                    onClick={() => goToPage(page + 1)}
                    className="ts-focus inline-flex h-7 items-center rounded-md border px-2 text-[12px] font-medium hover:bg-[var(--surface-2)] disabled:opacity-50"
                    style={{ borderColor: "var(--border-default)", color: "var(--text-default)" }}>
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SortHeader({
  label, active, dir, onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>
      <button type="button" onClick={onClick} className="ts-focus inline-flex items-center gap-1 hover:underline">
        {label}
        {active && <span aria-hidden>{dir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}

function StatusPill({ status }: { status: UserListRow["status"] }) {
  const palette =
    status === "banned"      ? { bg: "var(--rose-50)",    fg: "var(--rose-700)" } :
    status === "deactivated" ? { bg: "var(--surface-2)",  fg: "var(--text-muted)" } :
    status === "merged"      ? { bg: "var(--surface-2)",  fg: "var(--text-muted)" } :
    status === "locked"      ? { bg: "var(--amber-50)",   fg: "var(--amber-700)" } :
                                { bg: "var(--emerald-50)", fg: "var(--emerald-700)" };
  return (
    <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: palette.bg, color: palette.fg }}>
      {status}
    </span>
  );
}

function relativeTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = 60_000, hour = 60 * min, day = 24 * hour;
  if (ms < min) return "just now";
  if (ms < hour) return `${Math.floor(ms / min)}m`;
  if (ms < day) return `${Math.floor(ms / hour)}h`;
  return `${Math.floor(ms / day)}d`;
}
