import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { formatDateTime } from "@/lib/format";

// Audit log viewer — owner/admin only.
//
// Renders the last N AuditLog rows for the tenant with a simple action-
// name search and cursor pagination. The log itself is written by every
// mutating action via `logAudit()`; this page is just a reader.
//
// We cap the page at 100 rows so a noisy tenant doesn't blow out the
// render; older rows are reachable via "Load older".
//
// Visibility rule: OWNER and ADMIN. CSR/Accounting/etc. don't see this
// in the sidebar (filtered by the settings layout), but we also re-
// check here so a direct URL is blocked.

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type SP = {
  q?: string;
  before?: string; // ISO timestamp cursor for pagination
};

export default async function AuditLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SP>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireTenant(slug);

  // Double-guard in case someone deep-links. The sidebar already hides
  // this for non-OWNER/ADMIN roles.
  if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
    return (
      <Card>
        <CardHeader
          title="Audit log"
          description="Workspace-wide activity. Only owners and admins can view this."
        />
        <p className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
          You don&apos;t have permission to view the audit log.
        </p>
      </Card>
    );
  }

  const q = (sp.q ?? "").trim();
  const before = sp.before ? new Date(sp.before) : null;

  const rows = await db.auditLog.findMany({
    where: {
      tenantId: ctx.tenant.id,
      ...(q ? { action: { contains: q, mode: "insensitive" } } : {}),
      ...(before && !Number.isNaN(before.getTime())
        ? { createdAt: { lt: before } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE + 1,
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      createdAt: true,
      userId: true,
      ipAddress: true,
    },
  });

  const hasMore = rows.length > PAGE_SIZE;
  const visible = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const nextCursor = hasMore ? visible[visible.length - 1]!.createdAt.toISOString() : null;

  // Batch-load actor names so the table doesn't N+1.
  const actorIds = Array.from(new Set(visible.map((r) => r.userId).filter((x): x is string => !!x)));
  const actors = actorIds.length
    ? await db.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const actorById = new Map(actors.map((a) => [a.id, a] as const));

  // Query-string builder for filter + pagination links. Kept local so
  // the page stays a single file.
  const base = `/t/${slug}/settings/audit-log`;
  const buildHref = (opts: { q?: string; before?: string | null }) => {
    const qp = new URLSearchParams();
    const nq = opts.q ?? q;
    if (nq) qp.set("q", nq);
    if (opts.before) qp.set("before", opts.before);
    const s = qp.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <Card>
      <CardHeader
        title="Audit log"
        description={`Everything that happens in ${ctx.tenant.name}. Shown newest first.`}
      />

      {/* Search — GET form, server-side filter. Keeps the URL
          shareable/copy-pastable. */}
      <form action={base} method="get" className="px-5 py-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Filter by action (e.g. quote, invoice.paid, settings)"
            className="ts-focus w-full rounded-md px-3 py-1.5 text-sm outline-none"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-default)",
            }}
          />
          <button
            type="submit"
            className="rounded-md px-3 py-1.5 text-sm font-medium"
            style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
          >
            Filter
          </button>
          {q && (
            <Link
              href={base}
              className="text-xs underline"
              style={{ color: "var(--text-muted)" }}
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      {visible.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          {q
            ? `No events match "${q}".`
            : "No audit events yet. Activity will appear here as the workspace is used."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="text-left text-xs uppercase tracking-wide"
                style={{ color: "var(--text-faint)", borderBottom: "1px solid var(--border-subtle)" }}
              >
                <th className="px-5 py-2 font-semibold">When</th>
                <th className="px-5 py-2 font-semibold">Who</th>
                <th className="px-5 py-2 font-semibold">Action</th>
                <th className="px-5 py-2 font-semibold">Entity</th>
                <th className="px-5 py-2 font-semibold">IP</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const actor = r.userId ? actorById.get(r.userId) : null;
                return (
                  <tr
                    key={r.id}
                    className="align-top"
                    style={{ borderBottom: "1px solid var(--border-subtle)" }}
                  >
                    <td
                      className="px-5 py-2 whitespace-nowrap text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {formatDateTime(r.createdAt)}
                    </td>
                    <td className="px-5 py-2" style={{ color: "var(--text-default)" }}>
                      {actor ? (actor.name ?? actor.email) : (
                        <span style={{ color: "var(--text-faint)" }}>system</span>
                      )}
                    </td>
                    <td className="px-5 py-2 font-mono text-xs" style={{ color: "var(--text-default)" }}>
                      {r.action}
                    </td>
                    <td className="px-5 py-2 text-xs" style={{ color: "var(--text-muted)" }}>
                      {r.entityType ? `${r.entityType}${r.entityId ? ` #${r.entityId.slice(0, 8)}` : ""}` : "—"}
                    </td>
                    <td
                      className="px-5 py-2 font-mono text-xs"
                      style={{ color: "var(--text-faint)" }}
                    >
                      {r.ipAddress ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {nextCursor && (
        <div className="px-5 py-3 text-center" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <Link
            href={buildHref({ before: nextCursor })}
            className="text-xs underline"
            style={{ color: "var(--accent-primary)" }}
          >
            Load older
          </Link>
        </div>
      )}
    </Card>
  );
}
