import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/Card";
import { formatMoney, formatDate } from "@/lib/format";
import {
  ACTIVE_ORDER_STATUSES,
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  priorityColor,
  priorityLabel,
  statusColor,
  statusLabel,
} from "@/lib/orders";
import { memberLookup } from "@/lib/members";
import { applyBranchScope, listActiveLocations } from "@/lib/locations";
import { OrdersTable, type OrdersTableRow } from "@/components/orders/OrdersTable";
import { SavedViewPicker } from "@/components/ui/SavedViewPicker";
import { listSavedViews } from "@/app/actions/saved-views";
import type { Prisma, OrderStatus } from "@prisma/client";

type View = "all" | "queue" | "blocked" | "hotlist" | "overdue";
const VIEWS: { value: View; label: string; hint: string }[] = [
  { value: "all",     label: "All",              hint: "Every order, any status."                    },
  { value: "queue",   label: "Production queue", hint: "Not yet completed or canceled."              },
  { value: "blocked", label: "Blocked",          hint: "Has at least one unresolved blocker."        },
  { value: "hotlist", label: "High / Rush",      hint: "Priority is HIGH or RUSH."                   },
  { value: "overdue", label: "Overdue",          hint: "Due date has passed and not yet completed."  },
];

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    q?: string;
    status?: string;
    assignee?: "mine";
    branch?: string;
    view?: View;
  }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "orders:view");
  const canManage = ctx.can("orders:manage");

  const view: View = VIEWS.some((v) => v.value === sp.view) ? (sp.view as View) : "all";

  let where: Prisma.OrderWhereInput = { tenantId: ctx.tenant.id };
  if (sp.status) where.status = sp.status as never;
  if (sp.assignee === "mine") {
    where.OR = [
      { productionManagerId: ctx.userId },
      { installerId: ctx.userId },
    ];
  }
  if (sp.q) {
    const textMatch: Prisma.OrderWhereInput = {
      OR: [
        { number: { contains: sp.q, mode: "insensitive" } },
        { customer: { name: { contains: sp.q, mode: "insensitive" } } },
      ],
    };
    where.AND = where.AND ? [...(Array.isArray(where.AND) ? where.AND : [where.AND]), textMatch] : [textMatch];
  }

  if (view === "queue") {
    where.status = { in: ACTIVE_ORDER_STATUSES };
  } else if (view === "blocked") {
    where.blockers = { some: { resolvedAt: null } };
  } else if (view === "hotlist") {
    where.priority = { in: ["HIGH", "RUSH"] };
  } else if (view === "overdue") {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      { dueDate: { lt: new Date() } },
      { status: { in: ACTIVE_ORDER_STATUSES } },
    ];
  }

  where = applyBranchScope(where, ctx.branchScope);
  const branches = await listActiveLocations(ctx.tenant.id);
  const branchChoices =
    ctx.branchScope === null ? branches : branches.filter((b) => ctx.branchScope!.includes(b.id));
  if (sp.branch && branchChoices.some((b) => b.id === sp.branch)) {
    where.locationId = sp.branch;
  }

  const [orders, members, savedViews] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }, { updatedAt: "desc" }],
      take: 200,
      include: {
        customer: { select: { id: true, name: true } },
        _count: {
          select: {
            items:    true,
            blockers: { where: { resolvedAt: null } },
          },
        },
        blockers: {
          where:   { resolvedAt: null },
          select:  { reason: true },
          take:    3,
        },
      },
    }),
    memberLookup(ctx.tenant.id),
    listSavedViews(slug, "orders"),
  ]);

  const baseParams = new URLSearchParams();
  if (sp.q)                   baseParams.set("q",        sp.q);
  if (sp.status)              baseParams.set("status",   sp.status);
  if (sp.assignee === "mine") baseParams.set("assignee", "mine");
  if (sp.branch)              baseParams.set("branch",   sp.branch);
  const buildHref = (v: View) => {
    const p = new URLSearchParams(baseParams);
    if (v !== "all") p.set("view", v);
    const qs = p.toString();
    return `/t/${slug}/orders${qs ? `?${qs}` : ""}`;
  };

  const rows: OrdersTableRow[] = orders.map((o) => {
    const isActive = ACTIVE_ORDER_STATUSES.includes(o.status);
    const overdue  = !!(o.dueDate && isActive && o.dueDate < new Date());
    const blockerHint =
      o.blockers.length > 0
        ? o.blockers.map((b) => b.reason.replace(/_/g, " ").toLowerCase()).join(", ")
        : null;
    // Phase A Slice 1 — surface a "deposit owed" chip on rows that are still
    // NEW and gated by tenant policy, so production can see at a glance why
    // they can't start the job.
    const depositDue = Number(o.total) * (o.depositPercent / 100);
    const depositOwed = Math.max(0, depositDue - Number(o.paidAmount));
    const depositOwedLabel =
      ctx.tenant.requireDepositBeforeProduction &&
      o.status === "NEW" &&
      o.depositPercent > 0 &&
      depositOwed > 0.005
        ? formatMoney(depositOwed, ctx.tenant.currency)
        : null;
    const transitions = ORDER_TRANSITIONS[o.status as OrderStatus];
    // Current + legal next statuses. We keep current at the head so the
    // select renders something sensible even when there's no legal next.
    const nextStatuses: OrdersTableRow["nextStatuses"] = [
      { value: o.status, label: statusLabel(o.status) },
      ...transitions.map((s) => ({ value: s, label: statusLabel(s) })),
    ];
    return {
      id: o.id,
      number: o.number,
      status: o.status,
      statusLabel: statusLabel(o.status),
      statusColor: statusColor(o.status),
      priority: o.priority,
      priorityColor: priorityColor(o.priority),
      priorityLabel: priorityLabel(o.priority),
      blockerCount: o._count.blockers,
      blockerHint,
      depositOwedLabel,
      customerId: o.customer.id,
      customerName: o.customer.name,
      dueLabel: o.dueDate ? formatDate(o.dueDate) : null,
      overdue,
      productionManagerName: o.productionManagerId
        ? members.get(o.productionManagerId)?.name ?? null
        : null,
      installerName: o.installerId ? members.get(o.installerId)?.name ?? null : null,
      itemsCount: o._count.items,
      total: formatMoney(o.total.toString(), ctx.tenant.currency),
      nextStatuses,
    };
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Orders</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            {orders.length} {orders.length === 1 ? "order" : "orders"}
            {" · "}
            <span style={{ color: "var(--text-muted)" }}>Orders are created automatically when a quote is approved.</span>
          </p>
        </div>
        <SavedViewPicker
          slug={slug}
          entityKind="orders"
          views={savedViews}
          canShare={ctx.role === "OWNER" || ctx.role === "ADMIN"}
        />
      </div>

      <nav className="mt-4 flex gap-1 text-sm">
        {(["all", "mine"] as const).map((f) => {
          const active = f === "mine" ? sp.assignee === "mine" : !sp.assignee;
          const params = new URLSearchParams(baseParams);
          if (f === "mine") params.set("assignee", "mine");
          else              params.delete("assignee");
          if (view !== "all") params.set("view", view);
          const qs = params.toString();
          const href = `/t/${slug}/orders${qs ? `?${qs}` : ""}`;
          return (
            <Link
              key={f}
              href={href}
              className="rounded-md px-3 py-1.5"
              style={{
                background: active ? "var(--accent-surface)" : "transparent",
                border: "1px solid var(--border-subtle)",
                color: active ? "var(--accent-primary)" : "var(--text-default)",
                fontWeight: active ? 600 : undefined,
              }}
            >
              {f === "mine" ? "Assigned to me" : "All"}
            </Link>
          );
        })}
      </nav>

      <nav className="mt-3 flex flex-wrap gap-1 text-sm">
        {VIEWS.map((v) => {
          const active = v.value === view;
          return (
            <Link
              key={v.value}
              href={buildHref(v.value)}
              title={v.hint}
              className="rounded-md px-3 py-1.5"
              style={{
                background: active ? "var(--accent-surface)" : "transparent",
                border: "1px solid var(--border-subtle)",
                color: active ? "var(--accent-primary)" : "var(--text-default)",
                fontWeight: active ? 600 : undefined,
              }}
            >
              {v.label}
            </Link>
          );
        })}
      </nav>

      <form className="mt-4 flex gap-2 text-sm" method="get">
        {sp.assignee === "mine" && <input type="hidden" name="assignee" value="mine" />}
        {view !== "all" && <input type="hidden" name="view" value={view} />}
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search order # or customer…"
          className="flex-1 rounded-md px-3 py-2 outline-none"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
        />
        <select
          name="status"
          defaultValue={sp.status ?? ""}
          className="rounded-md px-3 py-2"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
        >
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {branchChoices.length > 1 && (
          <select name="branch" defaultValue={sp.branch ?? ""} className="rounded-md px-3 py-2"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}>
            <option value="">All branches</option>
            {branchChoices.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        <button type="submit" className="rounded-md px-4 py-2" style={{ border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}>
          Filter
        </button>
      </form>

      {orders.length === 0 ? (
        <Card className="mt-4">
          <EmptyState
            title={view === "all" ? "No orders yet" : "No orders match this view"}
            description={
              view === "all"
                ? "Orders appear here once a customer approves a quote. Send a quote to get the pipeline moving."
                : "Try switching to All, or adjust your filters."
            }
            actionHref={view === "all" ? `/t/${slug}/quotes` : `/t/${slug}/orders`}
            actionLabel={view === "all" ? "Go to quotes" : "Clear filters"}
          />
        </Card>
      ) : (
        <div className="mt-4">
          <OrdersTable
            slug={slug}
            canEdit={canManage}
            rows={rows}
            empty={
              <div
                className="px-4 py-8 text-center text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                No orders match these filters.{" "}
                <Link href={`/t/${slug}/orders`} className="underline">
                  Clear filters
                </Link>
              </div>
            }
          />
        </div>
      )}
    </div>
  );
}
