import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/format";
import { applyBranchScope } from "@/lib/locations";
import type { Prisma, ProofStatus } from "@prisma/client";

// Proofs list — promoted out of the order-detail nesting so the design
// approval queue is reachable in one click from the sidebar. This is
// the shop's "what's waiting on customer signoff?" screen.
//
// Why this exists as its own page: in a typical day the designer needs
// to answer "which proofs are overdue for a customer reply" without
// clicking into each order. We surface the same Proof rows the order
// page already handles; the detail view still lives under the order.

const PROOF_STATUSES: {
  value: ProofStatus;
  label: string;
  color: string;
  hint: string;
}[] = [
  { value: "DRAFT",             label: "Draft",             color: "#6b7280", hint: "Being prepared" },
  { value: "SENT",              label: "Sent",              color: "#3b82f6", hint: "Awaiting customer response" },
  { value: "CHANGES_REQUESTED", label: "Changes requested", color: "#f59e0b", hint: "Customer asked for edits" },
  { value: "APPROVED",          label: "Approved",          color: "#10b981", hint: "Signed off" },
  { value: "REJECTED",          label: "Rejected",          color: "#ef4444", hint: "Customer rejected" },
];

type View = "all" | "open" | "attention" | "approved";

const VIEWS: { value: View; label: string; hint: string }[] = [
  { value: "all",       label: "All",               hint: "Every proof, any status." },
  { value: "open",      label: "Open",              hint: "Draft, sent, or changes requested." },
  { value: "attention", label: "Needs attention",   hint: "Past due date or sitting 5+ days with customer." },
  { value: "approved",  label: "Approved",          hint: "Signed off by customer." },
];

const ATTN_STALE_DAYS = 5;

export default async function ProofsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    q?: string;
    status?: string;
    view?: View;
  }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "proofs:view");

  const view: View = VIEWS.some((v) => v.value === sp.view) ? (sp.view as View) : "open";
  const now = new Date();
  const staleCutoff = new Date(now.getTime() - ATTN_STALE_DAYS * 24 * 60 * 60 * 1000);

  let where: Prisma.ProofWhereInput = {
    tenantId: ctx.tenant.id,
    supersededAt: null,
  };
  if (sp.status) where.status = sp.status as ProofStatus;
  if (sp.q) {
    where.OR = [
      { title: { contains: sp.q, mode: "insensitive" } },
      { order: { number: { contains: sp.q, mode: "insensitive" } } },
      { order: { customer: { name: { contains: sp.q, mode: "insensitive" } } } },
    ];
  }

  if (view === "open") {
    where.status = { in: ["DRAFT", "SENT", "CHANGES_REQUESTED"] };
  } else if (view === "attention") {
    where.status = { in: ["SENT", "CHANGES_REQUESTED"] };
    where.AND = [
      {
        OR: [
          { dueAt: { lt: now } },
          { sentAt: { lte: staleCutoff } },
        ],
      },
    ];
  } else if (view === "approved") {
    where.status = "APPROVED";
  }

  // Proofs inherit tenant/branch through the Order. We scope by order's
  // locationId to honor branch-scoped roles.
  const orderFilter = applyBranchScope(
    { tenantId: ctx.tenant.id } as Prisma.OrderWhereInput,
    ctx.branchScope,
  );
  where.order = orderFilter;

  const [proofs, statusCountsRaw] = await Promise.all([
    db.proof.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      take: 200,
      include: {
        order: {
          select: {
            id: true,
            number: true,
            customer: { select: { id: true, name: true } },
          },
        },
      },
    }),
    db.proof.groupBy({
      by: ["status"],
      where: { tenantId: ctx.tenant.id, supersededAt: null },
      _count: { _all: true },
    }),
  ]);

  const statusCounts: Record<string, number> = {};
  let totalCount = 0;
  for (const r of statusCountsRaw) {
    statusCounts[r.status] = r._count._all;
    totalCount += r._count._all;
  }

  const hasFilters = !!(sp.q || sp.status || (sp.view && sp.view !== "open"));

  const viewHref = (v: View) => {
    const p = new URLSearchParams();
    if (sp.q) p.set("q", sp.q);
    if (sp.status) p.set("status", sp.status);
    if (v !== "open") p.set("view", v);
    const qs = p.toString();
    return `/t/${slug}/proofs${qs ? `?${qs}` : ""}`;
  };

  const statusHref = (status: string | null): string => {
    const p = new URLSearchParams();
    if (sp.q) p.set("q", sp.q);
    if (sp.view && sp.view !== "open") p.set("view", sp.view);
    if (status) p.set("status", status);
    const qs = p.toString();
    return `/t/${slug}/proofs${qs ? `?${qs}` : ""}`;
  };

  return (
    <div>
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{
          padding: "18px 22px",
          background:
            "radial-gradient(880px circle at -10% -50%, var(--accent-surface), transparent 55%), " +
            "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
          border: "1px solid var(--border-subtle)",
          boxShadow:
            "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
            "0 1px 2px 0 rgba(0,0,0,0.18)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <h1
            className="font-semibold"
            style={{
              color: "var(--text-default)",
              fontSize: 24,
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
            }}
          >
            Proofs
          </h1>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.04em",
              color: "var(--accent-primary)",
              background: "var(--accent-surface)",
              border:
                "1px solid color-mix(in oklab, var(--accent-primary) 22%, transparent)",
              padding: "3px 8px",
              borderRadius: 999,
              fontFeatureSettings: "'tnum' 1",
              lineHeight: 1,
            }}
          >
            {proofs.length}
          </span>
        </div>
        <p
          className="mt-1.5"
          style={{
            color: "var(--text-muted)",
            fontSize: 12.5,
            lineHeight: 1.45,
          }}
        >
          Design approvals across every open order — keep customer sign-offs moving.
        </p>
      </div>

      <nav className="mt-5 flex flex-wrap gap-1.5" aria-label="View">
        {VIEWS.map((v) => {
          const active = view === v.value;
          return (
            <Link
              key={v.value}
              href={viewHref(v.value)}
              title={v.hint}
              className="ts-focus inline-flex items-center rounded-md transition-colors"
              style={{
                background: active
                  ? "var(--accent-surface)"
                  : "color-mix(in oklab, var(--surface-2) 60%, transparent)",
                border: active
                  ? "1px solid color-mix(in oklab, var(--accent-primary) 28%, transparent)"
                  : "1px solid var(--border-subtle)",
                color: active ? "var(--accent-primary)" : "var(--text-muted)",
                fontWeight: active ? 700 : 500,
                fontSize: 11.5,
                letterSpacing: "-0.005em",
                padding: "4px 12px",
                height: 28,
              }}
            >
              {v.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StatusChip href={statusHref(null)} active={!sp.status} count={totalCount}>
          All statuses
        </StatusChip>
        {PROOF_STATUSES.map((s) => (
          <StatusChip
            key={s.value}
            href={statusHref(s.value)}
            active={sp.status === s.value}
            count={statusCounts[s.value] ?? 0}
            color={s.color}
          >
            {s.label}
          </StatusChip>
        ))}
      </div>

      <form className="mt-4 flex flex-wrap items-center gap-2 text-sm" method="get">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search order #, customer, or proof title…"
          className="flex-1 min-w-[220px] rounded-md px-3 py-2 outline-none"
          style={{
            background: "var(--surface-0)",
            border: "1px solid var(--border-default)",
            color: "var(--text-default)",
          }}
        />
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        {sp.view && sp.view !== "open" && <input type="hidden" name="view" value={sp.view} />}
        <button
          type="submit"
          className="ts-btn-secondary rounded-md px-3 py-2"
        >
          Filter
        </button>
        {hasFilters && (
          <Link href={`/t/${slug}/proofs`} className="rounded-md px-3 py-2 text-sm underline" style={{ color: "var(--text-muted)" }}>
            Clear
          </Link>
        )}
      </form>

      {proofs.length === 0 ? (
        <Card className="mt-6">
          {hasFilters ? (
            <EmptyState
              title="No proofs match this view"
              description="Try clearing filters or switching to All."
              actionHref={`/t/${slug}/proofs`}
              actionLabel="Clear filters"
            />
          ) : (
            <EmptyState
              title="No proofs yet"
              description="Proofs appear here after designers upload art to an order. Open an order and start a proof from its detail page."
              actionHref={`/t/${slug}/orders`}
              actionLabel="Go to orders"
            />
          )}
        </Card>
      ) : (
        <Card className="mt-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="text-left"
                  style={{
                    color: "var(--text-faint)",
                    background: "var(--surface-1)",
                    borderBottom: "1px solid var(--border-subtle)",
                  }}
                >
                  <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider">Order</th>
                  <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider">Proof</th>
                  <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider">Status</th>
                  <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider">Sent / Due</th>
                  <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider">Updated</th>
                </tr>
              </thead>
              <tbody>
                {proofs.map((p) => {
                  const statusMeta = PROOF_STATUSES.find((s) => s.value === p.status);
                  const overdue = p.dueAt && p.dueAt < now && (p.status === "SENT" || p.status === "CHANGES_REQUESTED");
                  const stale =
                    (p.status === "SENT" || p.status === "CHANGES_REQUESTED") &&
                    p.sentAt &&
                    p.sentAt.getTime() <= staleCutoff.getTime();
                  return (
                    <tr
                      key={p.id}
                      className="transition-colors hover:bg-[color:var(--surface-2)]"
                      style={{ borderTop: "1px solid var(--border-subtle)" }}
                    >
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/t/${slug}/orders/${p.order.id}`}
                          className="font-medium hover:underline"
                          style={{ color: "var(--text-default)" }}
                        >
                          {p.order.number}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5" style={{ color: "var(--text-default)" }}>
                        {p.order.customer.name}
                      </td>
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/t/${slug}/orders/${p.order.id}/proofs/${p.id}`}
                          className="hover:underline"
                          style={{ color: "var(--text-default)" }}
                        >
                          {p.title ?? `v${p.version}`}
                          {p.revisionRound > 1 && (
                            <span
                              className="ml-1.5 text-[11px]"
                              style={{ color: "var(--text-muted)" }}
                            >
                              round {p.revisionRound}
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                          style={{
                            background: `${statusMeta?.color ?? "#6b7280"}1a`,
                            color: statusMeta?.color ?? "#6b7280",
                          }}
                        >
                          {statusMeta?.label ?? p.status}
                        </span>
                        {(overdue || stale) && (
                          <span
                            className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                            style={{
                              background: "#ef44441a",
                              color: "#ef4444",
                            }}
                          >
                            {overdue ? "Overdue" : "Stale"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5" style={{ color: "var(--text-muted)" }}>
                        {p.dueAt ? (
                          <>
                            <span>Due </span>
                            <span style={{ color: overdue ? "#ef4444" : "var(--text-default)" }}>
                              {formatDate(p.dueAt)}
                            </span>
                          </>
                        ) : p.sentAt ? (
                          <>Sent {formatDate(p.sentAt)}</>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-2.5" style={{ color: "var(--text-muted)" }}>
                        {formatDate(p.updatedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function StatusChip({
  href,
  active,
  count,
  color,
  children,
}: {
  href: string;
  active: boolean;
  count: number;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="ts-focus inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
      style={{
        background: active ? "var(--surface-3)" : "var(--surface-1)",
        color: active ? "var(--text-default)" : "var(--text-muted)",
        border: `1px solid ${active ? "var(--border-default)" : "var(--border-subtle)"}`,
      }}
    >
      {color && (
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: color }}
        />
      )}
      <span>{children}</span>
      <span style={{ color: "var(--text-faint)" }}>{count}</span>
    </Link>
  );
}
