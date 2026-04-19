import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { Card, CardHeader } from "@/components/Card";
import type { Prisma } from "@prisma/client";

// Phase 17 Slice E — platform-wide audit log viewer.
//
// Read-only: platform staff can scroll / filter every audit row across
// every tenant + every platform-level action. The filters are GET
// params so staff can share a link ("all suspensions in the last 30d").
//
// We deliberately keep this server-rendered with pagination rather than a
// client grid — audit data is append-only and low-traffic; interactive
// filtering adds complexity for little payoff.

const PAGE_SIZE = 100;

export default async function PlatformAuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    tenantId?: string;
    userId?: string;
    action?: string;
    scope?: string;  // "platform" | "tenant" | "all"
    since?: string;  // ISO date, inclusive
    until?: string;  // ISO date, exclusive
    page?: string;
  }>;
}) {
  await requirePlatformStaff();
  const sp = await searchParams;

  // Build the Prisma where clause from the query string. Keep it forgiving:
  // invalid filters (e.g. bad date strings) get silently ignored so a
  // typo doesn't render a stack trace to the user.
  const where: Prisma.AuditLogWhereInput = {};
  if (sp.tenantId) where.tenantId = sp.tenantId;
  if (sp.userId)   where.userId   = sp.userId;

  if (sp.action) {
    // Prefix match, so "platform." shows every platform.* action and
    // "team." shows every team.* mutation.
    where.action = { startsWith: sp.action };
  }

  if (sp.scope === "platform") {
    where.action = { startsWith: "platform." };
  } else if (sp.scope === "tenant") {
    // Everything that's not a platform-level action. Implemented via NOT
    // to keep it composable with other filters.
    where.NOT = { action: { startsWith: "platform." } };
  }

  const createdAt: Prisma.DateTimeFilter = {};
  if (sp.since) {
    const d = new Date(sp.since);
    if (!Number.isNaN(d.getTime())) createdAt.gte = d;
  }
  if (sp.until) {
    const d = new Date(sp.until);
    if (!Number.isNaN(d.getTime())) createdAt.lt = d;
  }
  if (createdAt.gte || createdAt.lt) where.createdAt = createdAt;

  const page = Math.max(1, Number(sp.page) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
    }),
    db.auditLog.count({ where }),
  ]);

  // Decorate with tenant and user info.
  const tenantIds = Array.from(new Set(rows.map((r) => r.tenantId).filter((x): x is string => Boolean(x))));
  const userIds   = Array.from(new Set(rows.map((r) => r.userId  ).filter((x): x is string => Boolean(x))));
  const [tenants, users] = await Promise.all([
    tenantIds.length
      ? db.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true, slug: true } })
      : Promise.resolve([] as { id: string; name: string; slug: string }[]),
    userIds.length
      ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, name: true, platformRole: true } })
      : Promise.resolve([] as { id: string; email: string; name: string | null; platformRole: string | null }[]),
  ]);
  const tenantById = new Map(tenants.map((t) => [t.id, t]));
  const userById   = new Map(users.map((u) => [u.id, u]));

  const hasNext = skip + rows.length < total;
  const hasPrev = page > 1;

  // Build a querystring preserving filters for pagination links.
  const qs = (overrides: Record<string, string | number | undefined>) => {
    const out = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...overrides })) {
      if (v === undefined || v === "" || v === null) continue;
      out.set(k, String(v));
    }
    const s = out.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Every append-only event across tenants and platform staff. Use the filters to narrow.
        </p>
      </div>

      {/* ── Filter form ── */}
      <Card>
        <CardHeader title="Filters" />
        <form className="grid grid-cols-2 gap-3 px-5 py-4 text-sm md:grid-cols-6" method="get">
          <label className="flex flex-col gap-1">
            <span className="text-xs" style={{ color: "var(--muted)" }}>Tenant ID</span>
            <input
              name="tenantId"
              defaultValue={sp.tenantId ?? ""}
              className="rounded-md px-2 py-1.5 font-mono text-xs outline-none"
              style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
              placeholder="cuid"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs" style={{ color: "var(--muted)" }}>User ID</span>
            <input
              name="userId"
              defaultValue={sp.userId ?? ""}
              className="rounded-md px-2 py-1.5 font-mono text-xs outline-none"
              style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
              placeholder="cuid"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs" style={{ color: "var(--muted)" }}>Action prefix</span>
            <input
              name="action"
              defaultValue={sp.action ?? ""}
              className="rounded-md px-2 py-1.5 font-mono text-xs outline-none"
              style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
              placeholder="team. or platform."
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs" style={{ color: "var(--muted)" }}>Scope</span>
            <select
              name="scope"
              defaultValue={sp.scope ?? ""}
              className="rounded-md px-2 py-1.5 text-xs outline-none"
              style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
            >
              <option value="">All</option>
              <option value="platform">Platform staff only</option>
              <option value="tenant">Tenant only</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs" style={{ color: "var(--muted)" }}>Since (UTC)</span>
            <input
              type="date"
              name="since"
              defaultValue={sp.since ?? ""}
              className="rounded-md px-2 py-1.5 text-xs outline-none"
              style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs" style={{ color: "var(--muted)" }}>Until (UTC)</span>
            <input
              type="date"
              name="until"
              defaultValue={sp.until ?? ""}
              className="rounded-md px-2 py-1.5 text-xs outline-none"
              style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
          </label>
          <div className="col-span-2 flex items-end gap-2 md:col-span-6">
            <button type="submit" className="rounded-md px-3 py-1.5 text-sm" style={{ background: "var(--accent)", color: "white" }}>
              Apply
            </button>
            <Link
              href="/platform/audit"
              className="rounded-md px-3 py-1.5 text-sm"
              style={{ border: "1px solid var(--border)", color: "var(--muted)" }}
            >
              Clear
            </Link>
            <span className="ml-auto text-xs" style={{ color: "var(--muted)" }}>
              {total.toLocaleString()} {total === 1 ? "event" : "events"} match
            </span>
          </div>
        </form>
      </Card>

      {/* ── Rows ── */}
      <Card>
        {rows.length === 0 ? (
          <p className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>
            No events match these filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ color: "var(--muted)" }}>
                <tr className="text-left">
                  <th className="px-4 py-3 font-normal">When (UTC)</th>
                  <th className="px-4 py-3 font-normal">Action</th>
                  <th className="px-4 py-3 font-normal">Tenant</th>
                  <th className="px-4 py-3 font-normal">Actor</th>
                  <th className="px-4 py-3 font-normal">Entity</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const tenant = r.tenantId ? tenantById.get(r.tenantId) : null;
                  const user = r.userId ? userById.get(r.userId) : null;
                  const isPlatform = r.action.startsWith("platform.");
                  return (
                    <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td className="px-4 py-2 font-mono text-xs" style={{ color: "var(--muted)" }}>
                        {r.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                      </td>
                      <td className="px-4 py-2">
                        <span style={{ color: isPlatform ? "var(--accent)" : "var(--text)" }}>
                          {r.action}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {tenant ? (
                          <Link href={`/platform/tenants/${tenant.id}`} className="underline">
                            {tenant.name}
                          </Link>
                        ) : (
                          <span style={{ color: "var(--muted)" }}>— platform —</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {user ? (
                          <>
                            {user.name ?? user.email}
                            {user.platformRole && (
                              <span style={{ color: "var(--muted)" }}> · {user.platformRole}</span>
                            )}
                          </>
                        ) : (
                          <span style={{ color: "var(--muted)" }}>system</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs font-mono" style={{ color: "var(--muted)" }}>
                        {r.entityType ?? ""}
                        {r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between px-5 py-3 text-xs" style={{ borderTop: "1px solid var(--border)", color: "var(--muted)" }}>
          <span>Page {page}</span>
          <div className="flex gap-3">
            {hasPrev && <Link href={qs({ page: page - 1 })} className="underline">← Previous</Link>}
            {hasNext && <Link href={qs({ page: page + 1 })} className="underline">Next →</Link>}
          </div>
        </div>
      </Card>
    </div>
  );
}
