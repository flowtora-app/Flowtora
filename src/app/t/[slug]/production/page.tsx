import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { OrdersViewToggle } from "@/components/orders/OrdersViewToggle";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { Button } from "@/components/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { memberLookup } from "@/lib/members";
import { applyBranchScope, listActiveLocations } from "@/lib/locations";
import { formatDate } from "@/lib/format";
import { priorityColor, priorityLabel } from "@/lib/orders";
import {
  ACTIVE_STAGE_STATUSES,
  formatMinutes,
  isStageOverdue,
  stageDwellMinutes,
  stageStatusColor,
  stageStatusLabel,
} from "@/lib/production";
import {
  blockStage,
  completeStage,
  pauseStage,
  skipStage,
  startStage,
} from "@/app/actions/production";
import type { Prisma, ProductionStageStatus } from "@prisma/client";

// Phase 12 Slice C — production board.
//
// This is the daily-driver screen for the shop. Swimlanes per department,
// stage cards inside each lane, quick-action buttons (Start / Done / Block
// / Pause / Skip) on each card so the technician doesn't have to open
// the order detail page to punch the clock.
//
// Design decisions worth calling out:
//
//   * Lenses (due-today / overdue / blocked / ready / rush / mine) are
//     query params so they're bookmarkable and survive a reload. The
//     shop-floor screen usually lives on the "due today + mine" view.
//
//   * DONE and SKIPPED are hidden by default — those stages belong to the
//     order's history, not the live board. A toggle surfaces them for
//     "what did we ship yesterday?" review.
//
//   * We keep stages with a null department under an "Unassigned" lane
//     rather than silently dropping them. Missing a department means
//     "nobody's told the system who runs this" — the board should show
//     it, not hide it.
//
//   * Rush orders get a prominent red chip so they jump off even in a
//     crowded lane.

type Lens = "all" | "due_today" | "overdue" | "blocked" | "ready" | "rush" | "mine";
const LENSES: { value: Lens; label: string; hint: string }[] = [
  { value: "all",       label: "All",          hint: "Every open stage across departments."            },
  { value: "due_today", label: "Due today",    hint: "Stages whose due date is today — nothing tomorrow."  },
  { value: "overdue",   label: "Overdue",      hint: "Stages past their due date (or the order's)."       },
  { value: "blocked",   label: "Blocked",      hint: "Stages sitting in BLOCKED — need unsticking."       },
  { value: "ready",     label: "Ready to run", hint: "PENDING stages whose upstream work is done."        },
  { value: "rush",      label: "Rush / High",  hint: "Stages on orders flagged RUSH or HIGH priority."   },
  { value: "mine",      label: "Mine",         hint: "Assigned to me specifically."                       },
];

// A "ready to run" stage is a PENDING stage with no open upstream stage
// on the same order — i.e. every earlier (lower sortOrder) stage is DONE
// or SKIPPED. We compute this client-side from the full stage set we
// already loaded to avoid N+1 lookups.
function stageIsReady(stage: { orderId: string; sortOrder: number; status: ProductionStageStatus }, byOrder: Map<string, { sortOrder: number; status: ProductionStageStatus }[]>): boolean {
  if (stage.status !== "PENDING") return false;
  const siblings = byOrder.get(stage.orderId) ?? [];
  return siblings
    .filter((s) => s.sortOrder < stage.sortOrder)
    .every((s) => s.status === "DONE" || s.status === "SKIPPED");
}

export default async function ProductionBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    lens?: Lens;
    dept?: string;
    assignee?: string;
    branch?: string;
    showClosed?: "1";
  }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "production:view");
  const canManage = ctx.can("production:manage");

  const lens: Lens = LENSES.some((l) => l.value === sp.lens) ? (sp.lens as Lens) : "all";
  const showClosed = sp.showClosed === "1";

  // Base where: always tenant-scoped. We load every stage that could
  // possibly be visible under any lens the user might flip to next, then
  // filter in memory for the lens counts — so switching filters feels
  // instant and the hot-paths count (e.g. Overdue: 3) stays accurate.
  //
  // Closed stages are only loaded when the user explicitly opts in —
  // otherwise the query set would balloon on long-running shops.
  let where: Prisma.ProductionStageWhereInput = {
    tenantId: ctx.tenant.id,
    ...(showClosed
      ? {}
      : { status: { in: ACTIVE_STAGE_STATUSES } }),
  };
  // Branch scope — production lives at the Order level, so we scope via
  // the order's location. Only attach the filter when there's an actual
  // restriction, so unrestricted callers don't pay for a redundant join
  // clause.
  if (ctx.branchScope && ctx.branchScope.length > 0) {
    where.order = applyBranchScope(
      { tenantId: ctx.tenant.id } as Prisma.OrderWhereInput,
      ctx.branchScope,
    );
  }

  // Extra server-side filters from the URL — department and assignee are
  // standalone query params (not lenses) so they stack with any lens.
  if (sp.dept)     where.departmentId = sp.dept === "none" ? null : sp.dept;
  if (sp.assignee) where.assigneeId   = sp.assignee === "me" ? ctx.userId : sp.assignee;

  const [stages, departments, branches, members, memberMap] = await Promise.all([
    db.productionStage.findMany({
      where,
      orderBy: [
        { dueAt: "asc" },
        { sortOrder: "asc" },
        { createdAt: "asc" },
      ],
      include: {
        department:  { select: { id: true, name: true, color: true, icon: true } },
        workStation: { select: { id: true, name: true } },
        order: {
          select: {
            id: true, number: true, status: true, priority: true,
            dueDate: true, locationId: true,
            customer: { select: { id: true, name: true } },
          },
        },
      },
    }),
    db.department.findMany({
      where: { tenantId: ctx.tenant.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true, color: true, icon: true, active: true },
    }),
    listActiveLocations(ctx.tenant.id),
    // Distinct assignees on current stages — used to populate the filter.
    db.productionStage
      .findMany({
        where: { tenantId: ctx.tenant.id, status: { in: ACTIVE_STAGE_STATUSES }, assigneeId: { not: null } },
        select: { assigneeId: true },
        distinct: ["assigneeId"],
      })
      .then((rows) => rows.map((r) => r.assigneeId).filter((x): x is string => !!x)),
    memberLookup(ctx.tenant.id),
  ]);

  const branchChoices =
    ctx.branchScope === null ? branches : branches.filter((b) => ctx.branchScope!.includes(b.id));

  // Pre-compute "ready" set — which PENDING stages have no open upstream
  // on the same order.
  const allByOrder = new Map<string, { sortOrder: number; status: ProductionStageStatus }[]>();
  for (const s of stages) {
    const arr = allByOrder.get(s.orderId) ?? [];
    arr.push({ sortOrder: s.sortOrder, status: s.status });
    allByOrder.set(s.orderId, arr);
  }

  // Apply the lens filter in-memory. Each lens answers a specific
  // shop-floor question; only one lens is active at a time.
  const now = new Date();
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const endOfToday   = new Date(now); endOfToday.setHours(23, 59, 59, 999);

  const lensed = stages.filter((s) => {
    const effectiveDue = s.dueAt ?? s.order.dueDate ?? null;
    switch (lens) {
      case "all":
        return true;
      case "due_today":
        return effectiveDue != null && effectiveDue >= startOfToday && effectiveDue <= endOfToday;
      case "overdue":
        return (isStageOverdue(s)) ||
               (effectiveDue != null && effectiveDue < now && s.status !== "DONE" && s.status !== "SKIPPED");
      case "blocked":
        return s.status === "BLOCKED";
      case "ready":
        return stageIsReady(s, allByOrder);
      case "rush":
        return s.order.priority === "RUSH" || s.order.priority === "HIGH";
      case "mine":
        return s.assigneeId === ctx.userId;
      default:
        return true;
    }
  });

  // Also compute the counts for each lens up-front so the chip labels
  // can show a "due today (3)" style hint. Cheap — same in-memory pass.
  const lensCounts: Record<Lens, number> = {
    all:       stages.length,
    due_today: 0,
    overdue:   0,
    blocked:   0,
    ready:     0,
    rush:      0,
    mine:      0,
  };
  for (const s of stages) {
    const effectiveDue = s.dueAt ?? s.order.dueDate ?? null;
    if (effectiveDue != null && effectiveDue >= startOfToday && effectiveDue <= endOfToday) lensCounts.due_today++;
    if ((effectiveDue != null && effectiveDue < now && s.status !== "DONE" && s.status !== "SKIPPED")) lensCounts.overdue++;
    if (s.status === "BLOCKED")               lensCounts.blocked++;
    if (stageIsReady(s, allByOrder))          lensCounts.ready++;
    if (s.order.priority === "RUSH" || s.order.priority === "HIGH") lensCounts.rush++;
    if (s.assigneeId === ctx.userId)          lensCounts.mine++;
  }

  // Group for swimlane render: by department id (with "none" bucket).
  type StageRow = typeof lensed[number];
  const byDept = new Map<string, StageRow[]>();
  for (const s of lensed) {
    const key = s.departmentId ?? "__none__";
    const arr = byDept.get(key) ?? [];
    arr.push(s);
    byDept.set(key, arr);
  }

  // Build ordered lane list from the department list. We show a lane
  // even if it's currently empty so the floor can see "we've got no work
  // in CNC today" rather than the lane disappearing.
  const lanes: {
    key: string;
    name: string;
    color: string;
    icon: string | null;
    active: boolean;
    stages: StageRow[];
  }[] = [];
  for (const d of departments) {
    // If a specific department filter is applied, only render that lane.
    if (sp.dept && sp.dept !== "none" && d.id !== sp.dept) continue;
    lanes.push({
      key:    d.id,
      name:   d.name,
      color:  d.color,
      icon:   d.icon,
      active: d.active,
      stages: byDept.get(d.id) ?? [],
    });
  }
  // Unassigned lane — always last, and only when either there's work in
  // it OR the user explicitly filtered to it.
  const unassigned = byDept.get("__none__") ?? [];
  if ((sp.dept === "none" || (unassigned.length > 0 && !sp.dept))) {
    lanes.push({
      key:    "__none__",
      name:   "Unassigned",
      color:  "#6b7280",
      icon:   null,
      active: true,
      stages: unassigned,
    });
  }

  // Assignee filter options — bring in member names for everyone with
  // current work.
  const assigneeChoices = members
    .map((id) => memberMap.get(id))
    .filter((m): m is { userId: string; name: string; email: string } => !!m)
    .sort((a, b) => a.name.localeCompare(b.name));

  // Preserve current filters when a chip builds a new link.
  const baseParams = new URLSearchParams();
  if (sp.dept)       baseParams.set("dept",       sp.dept);
  if (sp.assignee)   baseParams.set("assignee",   sp.assignee);
  if (sp.branch)     baseParams.set("branch",     sp.branch);
  if (showClosed)    baseParams.set("showClosed", "1");
  const buildLensHref = (v: Lens) => {
    const p = new URLSearchParams(baseParams);
    if (v !== "all") p.set("lens", v);
    const qs = p.toString();
    return `/t/${slug}/production${qs ? `?${qs}` : ""}`;
  };

  // Top-line summary numbers. Shown in the page header as small stats.
  const activeCount   = stages.filter((s) => s.status === "ACTIVE").length;
  const pendingCount  = stages.filter((s) => s.status === "PENDING").length;
  const blockedCount  = stages.filter((s) => s.status === "BLOCKED").length;
  const deptHasNone   = departments.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Production board</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            {lensed.length} visible · {activeCount} active · {pendingCount} pending · {blockedCount} blocked
          </p>
        </div>
        <div className="flex items-center gap-2">
          <OrdersViewToggle slug={slug} active="board" />
          <Link
            href={`/t/${slug}/settings/production`}
            className="rounded-md px-3 py-1.5 text-sm"
            style={{ border: "1px solid var(--border)" }}
          >
            Settings
          </Link>
        </div>
      </div>

      {/* Empty tenant state — no departments configured yet. Redirect to
          settings where the one-click seed lives. */}
      {deptHasNone && (
        <Card>
          <EmptyState
            title="No departments configured yet"
            description="The production board groups stages by department. Seed a starter list (Design, Print, Vinyl, CNC…) from settings to get running in 10 seconds."
            actionHref={`/t/${slug}/settings/production`}
            actionLabel="Set up departments"
          />
        </Card>
      )}

      {/* Lens chips — mutually exclusive lenses that answer the three
          shop-floor questions: what's due, what's stuck, what's mine. */}
      {!deptHasNone && (
        <nav className="flex flex-wrap gap-1 text-sm">
          {LENSES.map((l) => {
            const active = l.value === lens;
            const count  = lensCounts[l.value];
            return (
              <Link
                key={l.value}
                href={buildLensHref(l.value)}
                title={l.hint}
                className="rounded-md px-3 py-1.5"
                style={{
                  background: active ? "var(--accent-surface)" : "transparent",
                  border: "1px solid var(--border)",
                  color: active ? "var(--accent-primary)" : "var(--text)",
                  fontWeight: active ? 600 : undefined,
                }}
              >
                {l.label}
                <span className="ml-1.5 text-xs" style={{ color: active ? "var(--accent-primary)" : "var(--muted)" }}>
                  {count}
                </span>
              </Link>
            );
          })}
        </nav>
      )}

      {/* Secondary filters — dept / assignee / branch / show-closed */}
      {!deptHasNone && (
        <Card>
          <form className="flex flex-wrap items-end gap-3 px-5 py-3" method="get">
            {lens !== "all" && <input type="hidden" name="lens" value={lens} />}
            <label className="text-sm">
              <span className="mb-1 block" style={{ color: "var(--muted)" }}>Department</span>
              <select
                name="dept"
                defaultValue={sp.dept ?? ""}
                className="rounded-md px-2 py-1.5 text-sm"
                style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
              >
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}{d.active ? "" : " (inactive)"}</option>
                ))}
                <option value="none">— Unassigned —</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block" style={{ color: "var(--muted)" }}>Assignee</span>
              <select
                name="assignee"
                defaultValue={sp.assignee ?? ""}
                className="rounded-md px-2 py-1.5 text-sm"
                style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
              >
                <option value="">Anyone</option>
                <option value="me">Me</option>
                {assigneeChoices.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.name}</option>
                ))}
              </select>
            </label>
            {branchChoices.length > 1 && (
              <label className="text-sm">
                <span className="mb-1 block" style={{ color: "var(--muted)" }}>Branch</span>
                <select
                  name="branch"
                  defaultValue={sp.branch ?? ""}
                  className="rounded-md px-2 py-1.5 text-sm"
                  style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
                >
                  <option value="">All branches</option>
                  {branchChoices.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="showClosed" value="1" defaultChecked={showClosed} />
              Show closed
            </label>
            <button
              type="submit"
              className="rounded-md px-3 py-1.5 text-sm"
              style={{ border: "1px solid var(--border)", color: "var(--text)" }}
            >
              Apply
            </button>
            {(sp.dept || sp.assignee || sp.branch || showClosed) && (
              <Link
                href={buildLensHref(lens)}
                className="text-xs underline"
                style={{ color: "var(--muted)" }}
              >
                Clear
              </Link>
            )}
          </form>
        </Card>
      )}

      {/* Swimlanes */}
      {!deptHasNone && lanes.length === 0 && (
        <Card>
          <EmptyState
            title="No stages match this view"
            description={
              lens === "all"
                ? "Nothing's in production right now. Orders get stages when you apply a template from the order detail page, or add them manually."
                : "Try switching to All, or clearing your department/assignee filters."
            }
            actionHref={lens === "all" ? `/t/${slug}/orders` : buildLensHref("all")}
            actionLabel={lens === "all" ? "Go to orders" : "Clear filters"}
          />
        </Card>
      )}

      {!deptHasNone && lanes.length > 0 && (
        <div className="space-y-4">
          {lanes.map((lane) => (
            <LaneCard
              key={lane.key}
              slug={slug}
              lane={lane}
              canManage={canManage}
              readyOrderIds={new Set(
                lane.stages.filter((s) => stageIsReady(s, allByOrder)).map((s) => s.id),
              )}
              memberMap={memberMap}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Lane (swimlane) — one per department. Renders a colored header with a
// stage count and the stage cards grouped by status.
// ────────────────────────────────────────────────────────────
function LaneCard({
  slug,
  lane,
  canManage,
  readyOrderIds,
  memberMap,
}: {
  slug: string;
  lane: {
    key: string;
    name: string;
    color: string;
    icon: string | null;
    active: boolean;
    stages: {
      id: string;
      title: string;
      description: string | null;
      status: ProductionStageStatus;
      sortOrder: number;
      assigneeId: string | null;
      estimatedMinutes: number | null;
      dueAt: Date | null;
      startedAt: Date | null;
      blockedAt: Date | null;
      blockedReason: string | null;
      createdAt: Date;
      updatedAt: Date;
      orderId: string;
      workStation: { id: string; name: string } | null;
      order: {
        id: string;
        number: string;
        priority: "NORMAL" | "HIGH" | "RUSH";
        dueDate: Date | null;
        customer: { id: string; name: string };
      };
    }[];
  };
  canManage: boolean;
  readyOrderIds: Set<string>;
  memberMap: Map<string, { userId: string; name: string; email: string }>;
}) {
  // Group within the lane by status so a busy lane still reads at a
  // glance: "3 active, 5 pending, 2 blocked".
  const buckets: { status: ProductionStageStatus; stages: typeof lane.stages }[] = [
    { status: "ACTIVE",  stages: lane.stages.filter((s) => s.status === "ACTIVE")  },
    { status: "BLOCKED", stages: lane.stages.filter((s) => s.status === "BLOCKED") },
    { status: "PENDING", stages: lane.stages.filter((s) => s.status === "PENDING") },
    { status: "DONE",    stages: lane.stages.filter((s) => s.status === "DONE")    },
    { status: "SKIPPED", stages: lane.stages.filter((s) => s.status === "SKIPPED") },
  ];

  return (
    <Card>
      <div
        className="flex items-center justify-between px-5 py-3"
        style={{
          borderBottom: "1px solid var(--border)",
          borderLeft:   `4px solid ${lane.color}`,
        }}
      >
        <div className="flex items-center gap-2">
          {lane.icon && <span className="text-base">{lane.icon}</span>}
          <div className="text-sm font-semibold">{lane.name}</div>
          {!lane.active && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px]"
              style={{ background: "var(--surface-3)", color: "var(--muted)" }}
            >
              inactive
            </span>
          )}
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            · {lane.stages.length} {lane.stages.length === 1 ? "stage" : "stages"}
          </span>
        </div>
      </div>

      {lane.stages.length === 0 ? (
        <div className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>
          Nothing in this lane right now.
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {buckets.map((bucket) =>
            bucket.stages.length === 0 ? null : (
              <div key={bucket.status} className="px-5 py-3">
                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: stageStatusColor(bucket.status) }}
                  />
                  {stageStatusLabel(bucket.status)}
                  <span className="opacity-60">· {bucket.stages.length}</span>
                </div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {bucket.stages.map((s) => (
                    <StageCard
                      key={s.id}
                      slug={slug}
                      stage={s}
                      ready={readyOrderIds.has(s.id)}
                      canManage={canManage}
                      assigneeName={
                        s.assigneeId ? memberMap.get(s.assigneeId)?.name ?? null : null
                      }
                    />
                  ))}
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// Stage card — the unit a technician interacts with. Shows the minimum
// needed for a glance (order#, customer, status, due, dwell time,
// machine, assignee) plus quick-action buttons.
// ────────────────────────────────────────────────────────────
function StageCard({
  slug,
  stage,
  ready,
  canManage,
  assigneeName,
}: {
  slug: string;
  stage: {
    id: string;
    title: string;
    description: string | null;
    status: ProductionStageStatus;
    assigneeId: string | null;
    estimatedMinutes: number | null;
    dueAt: Date | null;
    startedAt: Date | null;
    blockedAt: Date | null;
    blockedReason: string | null;
    createdAt: Date;
    updatedAt: Date;
    orderId: string;
    workStation: { id: string; name: string } | null;
    order: {
      id: string;
      number: string;
      priority: "NORMAL" | "HIGH" | "RUSH";
      dueDate: Date | null;
      customer: { id: string; name: string };
    };
  };
  ready: boolean;
  canManage: boolean;
  assigneeName: string | null;
}) {
  const effectiveDue = stage.dueAt ?? stage.order.dueDate ?? null;
  const overdue =
    effectiveDue != null &&
    stage.status !== "DONE" &&
    stage.status !== "SKIPPED" &&
    effectiveDue.getTime() < Date.now();

  const dwell = stageDwellMinutes(stage);

  // Dwell color — stale stages glow. Under 2h = muted, 2–8h = amber,
  // 8h+ = red. Blocked stages have their own red chip so we dial the
  // dwell severity back one step for them.
  const dwellColor = (() => {
    if (dwell == null) return "var(--muted)";
    if (dwell < 120)   return "var(--muted)";
    if (dwell < 480)   return "#f59e0b";
    return stage.status === "BLOCKED" ? "#f59e0b" : "#ef4444";
  })();

  const priority = stage.order.priority;

  return (
    <div
      className="rounded-md p-3 text-sm"
      style={{
        background: "var(--surface-1, var(--panel))",
        border:     "1px solid var(--border)",
        borderLeft: `3px solid ${stageStatusColor(stage.status)}`,
      }}
    >
      {/* Top row — order number + priority + ready pill */}
      <div className="mb-1 flex items-center gap-2">
        <Link
          href={`/t/${slug}/orders/${stage.order.id}`}
          className="text-xs font-semibold underline"
        >
          {stage.order.number}
        </Link>
        {priority !== "NORMAL" && (
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
            style={{ background: priorityColor(priority), color: "white" }}
            title={`Priority: ${priorityLabel(priority)}`}
          >
            {priority === "RUSH" ? "⚡ RUSH" : "HIGH"}
          </span>
        )}
        {ready && stage.status === "PENDING" && (
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
            style={{ background: "#10b981", color: "white" }}
            title="Upstream work is done — ready to start."
          >
            READY
          </span>
        )}
      </div>

      {/* Title + dept-free description */}
      <div className="font-medium">{stage.title}</div>
      <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
        <Link href={`/t/${slug}/customers/${stage.order.customer.id}`} className="underline">
          {stage.order.customer.name}
        </Link>
        {stage.workStation && <> · {stage.workStation.name}</>}
      </div>

      {stage.description && (
        <div className="mt-1.5 line-clamp-2 text-xs" style={{ color: "var(--muted)" }}>
          {stage.description}
        </div>
      )}

      {/* Meta row — due, dwell, est, assignee */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: "var(--muted)" }}>
        {effectiveDue && (
          <span
            title={stage.dueAt ? "Stage due" : "Falling back to order due date"}
            style={{ color: overdue ? "var(--danger-fg, #ef4444)" : undefined, fontWeight: overdue ? 600 : undefined }}
          >
            due {formatDate(effectiveDue)}{overdue ? " · overdue" : ""}
          </span>
        )}
        {dwell != null && (
          <span title={`In ${stageStatusLabel(stage.status)} for ${formatMinutes(dwell)}`} style={{ color: dwellColor }}>
            {formatMinutes(dwell)} in {stageStatusLabel(stage.status).toLowerCase()}
          </span>
        )}
        {stage.estimatedMinutes != null && stage.estimatedMinutes > 0 && (
          <span title="Estimated duration">est {formatMinutes(stage.estimatedMinutes)}</span>
        )}
        <span title="Assignee">
          {assigneeName ? `👤 ${assigneeName}` : "👤 Unassigned"}
        </span>
      </div>

      {/* Block reason callout — only when BLOCKED */}
      {stage.status === "BLOCKED" && stage.blockedReason && (
        <div
          className="mt-2 rounded px-2 py-1.5 text-xs"
          style={{
            background: "var(--danger-surface, rgba(239,68,68,0.08))",
            color:       "var(--danger-fg, #ef4444)",
            border:      "1px solid rgba(239,68,68,0.25)",
          }}
        >
          <strong>Blocked:</strong> {stage.blockedReason}
        </div>
      )}

      {/* Quick actions — primary CTA depends on current status */}
      {canManage && (
        <StageActions slug={slug} stage={stage} />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// StageActions — the little row of buttons on each stage card. Kept
// as a subcomponent so the card itself stays readable.
//
// Form-per-button is the cleanest way to POST a server action from a
// server component. Each form submits independently; Next's router
// handles the revalidation via the action's revalidatePath calls.
// ────────────────────────────────────────────────────────────
function StageActions({
  slug,
  stage,
}: {
  slug: string;
  stage: {
    id: string;
    status: ProductionStageStatus;
  };
}) {
  const btnStyle = "rounded-md px-2 py-1 text-xs";
  const primaryStyle = {
    background: "var(--accent)",
    color: "white",
  } as React.CSSProperties;
  const secondaryStyle = {
    border: "1px solid var(--border)",
    color:  "var(--text)",
  } as React.CSSProperties;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {/* Start — only when the stage isn't already ACTIVE or DONE/SKIPPED */}
      {(stage.status === "PENDING" || stage.status === "BLOCKED") && (
        <form action={startStage.bind(null, slug, stage.id)}>
          <button type="submit" className={btnStyle} style={primaryStyle}>
            ▶ Start
          </button>
        </form>
      )}

      {/* Mark done — active stages, and also pending/blocked as a
          shortcut for "it's already done, catch up the board". */}
      {(stage.status === "ACTIVE" || stage.status === "PENDING" || stage.status === "BLOCKED") && (
        <form action={completeStage.bind(null, slug, stage.id)}>
          <button
            type="submit"
            className={btnStyle}
            style={stage.status === "ACTIVE" ? primaryStyle : secondaryStyle}
          >
            ✓ Done
          </button>
        </form>
      )}

      {/* Block — surfaces a tiny inline reason input. Collapsed by default
          so the button row stays tidy; uses <details> for zero-JS disclosure. */}
      {(stage.status === "ACTIVE" || stage.status === "PENDING") && (
        <details className="relative">
          <summary className={`${btnStyle} cursor-pointer list-none`} style={secondaryStyle}>
            ⏸ Block
          </summary>
          <form
            action={blockStage.bind(null, slug, stage.id)}
            className="absolute right-0 z-10 mt-1 w-64 rounded-md p-2 shadow-lg"
            style={{
              background: "var(--panel)",
              border: "1px solid var(--border)",
            }}
          >
            <label className="block text-xs" style={{ color: "var(--muted)" }}>
              Reason
            </label>
            <input
              name="reason"
              required
              autoFocus
              placeholder="Why is this blocked?"
              className="mt-1 w-full rounded-md px-2 py-1 text-xs outline-none"
              style={{
                background: "var(--surface-1, var(--panel))",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            />
            <div className="mt-2 flex justify-end gap-1.5">
              <Button type="submit" variant="secondary" className="!px-2 !py-1 !text-xs">
                Block
              </Button>
            </div>
          </form>
        </details>
      )}

      {/* Pause — only shown on ACTIVE */}
      {stage.status === "ACTIVE" && (
        <form action={pauseStage.bind(null, slug, stage.id)}>
          <button type="submit" className={btnStyle} style={secondaryStyle}>
            Pause
          </button>
        </form>
      )}

      {/* Skip — only on PENDING/BLOCKED */}
      {(stage.status === "PENDING" || stage.status === "BLOCKED") && (
        <form action={skipStage.bind(null, slug, stage.id)}>
          <button type="submit" className={btnStyle} style={secondaryStyle}>
            Skip
          </button>
        </form>
      )}

      {/* Reopen — only on DONE. Puts it back to ACTIVE so rework can start. */}
      {stage.status === "DONE" && (
        <Link
          href={`/t/${slug}/orders`}
          className={btnStyle}
          style={{ ...secondaryStyle, opacity: 0.6 }}
          title="Reopen from the order page."
        >
          done
        </Link>
      )}
    </div>
  );
}
