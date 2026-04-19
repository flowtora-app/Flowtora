import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button, Field, SelectField, TextArea } from "@/components/Field";
import { memberLookup, listActiveMembers } from "@/lib/members";
import { formatDate } from "@/lib/format";
import {
  INSTALL_KINDS,
  INSTALL_STATUSES,
  OPEN_INSTALL_STATUSES,
  installKindColor,
  installKindLabel,
  installStatusColor,
  installStatusLabel,
  startOfWeekMonday,
  addDays,
  weekDays,
  sameDay,
  formatDayHeader,
  formatTimeRange,
  toLocalInputValue,
} from "@/lib/installs";
import { createInstallEvent } from "@/app/actions/installs";
import { applyBranchScope, listActiveLocations } from "@/lib/locations";
import type { Prisma, InstallEventStatus } from "@prisma/client";

export default async function InstallsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    week?: string;       // YYYY-MM-DD — any day within the target week
    status?: string;
    kind?: string;       // Phase 13 — filter by event kind
    mine?: "1";
    branch?: string;
    attention?: "1";     // Phase 13 — events with open blockers/issues
    error?: string;
  }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "installs:view");
  const canManage = ctx.can("installs:manage");

  // Week navigation — defaults to the week containing today.
  const anchor = sp.week ? new Date(sp.week) : new Date();
  const weekStart = startOfWeekMonday(anchor);
  const weekEnd   = addDays(weekStart, 7); // exclusive upper bound
  const prevWeek  = formatDate(addDays(weekStart, -7));
  const nextWeek  = formatDate(addDays(weekStart, 7));
  const thisWeek  = formatDate(startOfWeekMonday(new Date()));
  const days      = weekDays(weekStart);

  let where: Prisma.InstallEventWhereInput = {
    tenantId: ctx.tenant.id,
    scheduledStart: { gte: weekStart, lt: weekEnd },
  };
  if (sp.status) where.status = sp.status as InstallEventStatus;
  if (sp.kind && INSTALL_KINDS.some((k) => k.value === sp.kind)) {
    where.kind = sp.kind as typeof INSTALL_KINDS[number]["value"];
  }
  if (sp.mine === "1") {
    where.OR = [
      { installerId: ctx.userId },
      { crewIds: { has: ctx.userId } },
    ];
  }
  // Phase 13 — "needs attention" lens. Keep this loose: any open issue on
  // an event that isn't terminal. The detail page shows severity.
  if (sp.attention === "1") {
    where.issues = { some: { status: { not: "RESOLVED" } } };
    where.status = { notIn: ["COMPLETED", "CANCELED"] };
  }
  where = applyBranchScope(where, ctx.branchScope);
  const branches = await listActiveLocations(ctx.tenant.id);
  const branchChoices =
    ctx.branchScope === null ? branches : branches.filter((b) => ctx.branchScope!.includes(b.id));
  if (sp.branch && branchChoices.some((b) => b.id === sp.branch)) {
    where.locationId = sp.branch;
  }

  // Upcoming + assignable-orders queries inherit the branch scope so an
  // installer scoped to one branch only sees orders from that branch in the
  // schedule-a-job dropdown.
  const upcomingWhere = applyBranchScope({
    tenantId: ctx.tenant.id,
    status: { in: OPEN_INSTALL_STATUSES },
    scheduledStart: { gte: new Date() },
  } as Prisma.InstallEventWhereInput, ctx.branchScope);
  const orderWhere = applyBranchScope({
    tenantId: ctx.tenant.id,
    status: { notIn: ["CANCELED", "COMPLETED"] },
  } as Prisma.OrderWhereInput, ctx.branchScope);

  const [events, upcoming, members, memberMap, assignableOrders, attentionCount] = await Promise.all([
    db.installEvent.findMany({
      where,
      orderBy: [{ scheduledStart: "asc" }],
      include: {
        customer: { select: { id: true, name: true } },
        order:    { select: { id: true, number: true } },
        // Phase 13 — surface readiness hints on the grid. We don't need
        // the full rows here, just counts.
        _count: { select: { photos: true, signatures: true, issues: true } },
        issues: {
          where: { status: { not: "RESOLVED" } },
          select: { id: true, severity: true, blocksCompletion: true },
        },
      },
    }),
    // A small "next 5" panel for context beyond the visible week.
    db.installEvent.findMany({
      where: upcomingWhere,
      orderBy: { scheduledStart: "asc" },
      take: 5,
      include: {
        customer: { select: { id: true, name: true } },
        order:    { select: { id: true, number: true } },
        issues: {
          where: { status: { not: "RESOLVED" } },
          select: { id: true, blocksCompletion: true },
        },
      },
    }),
    listActiveMembers(ctx.tenant.id),
    memberLookup(ctx.tenant.id),
    canManage
      ? db.order.findMany({
          where: orderWhere,
          orderBy: { updatedAt: "desc" },
          take: 100,
          select: { id: true, number: true, customer: { select: { name: true } } },
        })
      : Promise.resolve([]),
    // Phase 13 — lens count for the "Needs attention" chip. Ignores the
    // week filter on purpose: this is an "is there something blowing up
    // somewhere" indicator.
    db.installEvent.count({
      where: applyBranchScope({
        tenantId: ctx.tenant.id,
        status: { notIn: ["COMPLETED", "CANCELED"] },
        issues: { some: { status: { not: "RESOLVED" } } },
      } as Prisma.InstallEventWhereInput, ctx.branchScope),
    }),
  ]);

  // Default start for the new-event form: Monday 9am of the visible week.
  const defaultStart = new Date(weekStart);
  defaultStart.setHours(9, 0, 0, 0);
  const defaultEnd = new Date(defaultStart);
  defaultEnd.setHours(11, 0, 0, 0);

  // Group events by their scheduled day for the week grid.
  const byDay = new Map<string, typeof events>();
  for (const e of events) {
    const key = formatDate(e.scheduledStart);
    const arr = byDay.get(key) ?? [];
    arr.push(e);
    byDay.set(key, arr);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Install calendar</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Week of {formatDate(weekStart)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/t/${slug}/installs?week=${prevWeek}`} className="rounded-md px-3 py-1.5 text-sm" style={{ border: "1px solid var(--border-subtle)" }}>
            ← Prev
          </Link>
          <Link href={`/t/${slug}/installs?week=${thisWeek}`} className="rounded-md px-3 py-1.5 text-sm" style={{ border: "1px solid var(--border-subtle)" }}>
            This week
          </Link>
          <Link href={`/t/${slug}/installs?week=${nextWeek}`} className="rounded-md px-3 py-1.5 text-sm" style={{ border: "1px solid var(--border-subtle)" }}>
            Next →
          </Link>
        </div>
      </div>

      {sp.error && (
        <div
          className="rounded-md px-3 py-2 text-sm"
          style={{
            background: "var(--danger-surface)",
            color: "var(--danger-fg)",
            border: "1px solid var(--danger-fg)",
          }}
        >
          {sp.error}
        </div>
      )}

      {/* Filters */}
      <Card>
        <form className="flex flex-wrap items-end gap-3 px-5 py-3">
          <input type="hidden" name="week" value={formatDate(weekStart)} />
          <label className="text-sm">
            <span className="mb-1 block">Status</span>
            <select
              name="status"
              defaultValue={sp.status ?? ""}
              className="rounded-md px-2 py-1.5 text-sm"
              style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
            >
              <option value="">All</option>
              {INSTALL_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block">Kind</span>
            <select
              name="kind"
              defaultValue={sp.kind ?? ""}
              className="rounded-md px-2 py-1.5 text-sm"
              style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
            >
              <option value="">All</option>
              {INSTALL_KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="mine" value="1" defaultChecked={sp.mine === "1"} /> Mine only
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="attention" value="1" defaultChecked={sp.attention === "1"} /> Needs attention
            {attentionCount > 0 && (
              <span
                className="rounded-full px-1.5 text-[10px]"
                style={{ background: "var(--danger-surface)", color: "var(--danger-fg)", border: "1px solid var(--danger-fg)" }}
              >
                {attentionCount}
              </span>
            )}
          </label>
          {branchChoices.length > 1 && (
            <label className="text-sm">
              <span className="mb-1 block">Branch</span>
              <select
                name="branch"
                defaultValue={sp.branch ?? ""}
                className="rounded-md px-2 py-1.5 text-sm"
                style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
              >
                <option value="">All</option>
                {branchChoices.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
          )}
          <button type="submit" className="rounded-md px-3 py-1.5 text-sm" style={{ border: "1px solid var(--border-subtle)" }}>Apply</button>
          {(sp.status || sp.kind || sp.mine || sp.branch || sp.attention) && (
            <Link href={`/t/${slug}/installs?week=${formatDate(weekStart)}`} className="text-xs underline" style={{ color: "var(--text-muted)" }}>
              Clear
            </Link>
          )}
        </form>
      </Card>

      {/* Phase 23 — if the entire visible week has zero events AND no
          filters are narrowing the result, show a teaching empty state
          above the calendar so first-run shops aren't staring at seven
          empty columns wondering what to do. */}
      {events.length === 0 && !sp.status && !sp.kind && !sp.mine && !sp.branch && !sp.attention && (
        <Card className="mb-4">
          <EmptyState
            title="Nothing scheduled this week"
            description="Install events, surveys, and service visits show up here on the week they're scheduled. Schedule one from an order to get started."
            actionHref={`/t/${slug}/orders`}
            actionLabel="Go to orders"
          />
        </Card>
      )}

      {/* Week grid */}
      <div className="grid grid-cols-7 gap-2">
        {days.map((day) => {
          const key = formatDate(day);
          const header = formatDayHeader(day);
          const isToday = sameDay(day, new Date());
          const dayEvents = byDay.get(key) ?? [];
          return (
            <div
              key={key}
              className="rounded-md"
              style={{
                background: isToday ? "var(--accent-surface)" : "var(--surface-1)",
                border: `1px solid ${isToday ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                minHeight: 180,
              }}
            >
              <div className="px-3 py-2 text-xs" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <div style={{ color: "var(--text-muted)" }}>{header.dow}</div>
                <div className="font-medium">{header.date}</div>
              </div>
              <div className="space-y-1 px-2 py-2">
                {dayEvents.length === 0 && (
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>—</div>
                )}
                {dayEvents.map((e) => {
                  const openIssues   = e.issues.length;
                  const openBlockers = e.issues.filter((i) => i.blocksCompletion).length;
                  const hasEvidence  = e._count.photos > 0 || e._count.signatures > 0;
                  return (
                  <Link
                    key={e.id}
                    href={`/t/${slug}/installs/${e.id}`}
                    className="block rounded px-2 py-1 text-xs"
                    style={{
                      background: "var(--surface-0)",
                      borderLeft: `3px solid ${installKindColor(e.kind)}`,
                      outline: openBlockers > 0 ? "1px solid var(--danger-fg)" : undefined,
                    }}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-medium">{formatTimeRange(e.scheduledStart, e.scheduledEnd)}</span>
                      {/* Phase 13 — tiny evidence / issue hints. */}
                      <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {openBlockers > 0 && (
                          <span
                            className="rounded-full px-1"
                            style={{ background: "var(--danger-fg)", color: "white" }}
                            title={`${openBlockers} blocker${openBlockers === 1 ? "" : "s"}`}
                          >
                            !{openBlockers}
                          </span>
                        )}
                        {openBlockers === 0 && openIssues > 0 && (
                          <span title={`${openIssues} open issue${openIssues === 1 ? "" : "s"}`}>
                            ⚠{openIssues}
                          </span>
                        )}
                        {hasEvidence && (
                          <span title="Evidence on file">📎</span>
                        )}
                      </span>
                    </div>
                    <div className="truncate">
                      {e.title || `${installKindLabel(e.kind)} · ${e.order.number}`}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 truncate" style={{ color: "var(--text-muted)" }}>
                      <span
                        className="rounded-full px-1.5 text-[10px]"
                        style={{ background: installStatusColor(e.status), color: "white" }}
                      >
                        {installStatusLabel(e.status)}
                      </span>
                      <span className="truncate">{e.customer.name}</span>
                    </div>
                    {e.installerId && memberMap.get(e.installerId) && (
                      <div className="truncate text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {memberMap.get(e.installerId)!.name}
                      </div>
                    )}
                  </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Upcoming panel */}
      <Card>
        <CardHeader title="Upcoming" description="Next 5 open events, regardless of week" />
        <ul>
          {upcoming.length === 0 && (
            <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
              Nothing scheduled ahead.
            </li>
          )}
          {upcoming.map((e) => {
            const blockers = e.issues.filter((i) => i.blocksCompletion).length;
            const nonBlockers = e.issues.length - blockers;
            return (
            <li key={e.id} className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center gap-3">
                <Link href={`/t/${slug}/installs/${e.id}`} className="text-sm font-medium underline">
                  {formatDate(e.scheduledStart)} · {formatTimeRange(e.scheduledStart, e.scheduledEnd)}
                </Link>
                <span
                  className="rounded-full px-2 py-0.5 text-xs"
                  style={{ background: installKindColor(e.kind), color: "white" }}
                >
                  {installKindLabel(e.kind)}
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-xs"
                  style={{ background: installStatusColor(e.status), color: "white" }}
                >
                  {installStatusLabel(e.status)}
                </span>
                {blockers > 0 && (
                  <span
                    className="rounded-full px-2 py-0.5 text-xs"
                    style={{ background: "var(--danger-surface)", color: "var(--danger-fg)", border: "1px solid var(--danger-fg)" }}
                  >
                    {blockers} blocker{blockers === 1 ? "" : "s"}
                  </span>
                )}
                {blockers === 0 && nonBlockers > 0 && (
                  <span
                    className="rounded-full px-2 py-0.5 text-xs"
                    style={{ background: "#3a2a15", color: "#ffc98b", border: "1px solid #5b4b20" }}
                  >
                    {nonBlockers} issue{nonBlockers === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                {e.customer.name} · order {e.order.number}
                {e.installerId && memberMap.get(e.installerId) && <> · {memberMap.get(e.installerId)!.name}</>}
              </div>
            </li>
            );
          })}
        </ul>
      </Card>

      {/* New event */}
      {canManage && (
        <Card>
          <CardHeader title="Schedule new event" description="Attach to an existing order. Address is snapshotted from the customer if you leave it blank." />
          {assignableOrders.length === 0 ? (
            <div className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
              No active orders to schedule against. Create an order first.
            </div>
          ) : (
            <form action={createInstallEvent.bind(null, slug)} className="grid grid-cols-2 gap-3 px-5 py-4">
              <input type="hidden" name="redirectTo" value={`/t/${slug}/installs?week=${formatDate(weekStart)}`} />
              <SelectField
                label="Order"
                name="orderId"
                required
                defaultValue=""
                options={[
                  { value: "", label: "Select order…" },
                  ...assignableOrders.map((o) => ({
                    value: o.id,
                    label: `${o.number} — ${o.customer.name}`,
                  })),
                ]}
              />
              <SelectField
                label="Kind"
                name="kind"
                defaultValue="INSTALL"
                options={INSTALL_KINDS.map((k) => ({ value: k.value, label: k.label }))}
              />
              <Field
                label="Start"
                name="scheduledStart"
                type="datetime-local"
                required
                defaultValue={toLocalInputValue(defaultStart)}
              />
              <Field
                label="End"
                name="scheduledEnd"
                type="datetime-local"
                required
                defaultValue={toLocalInputValue(defaultEnd)}
              />
              <Field
                label="Title (optional)"
                name="title"
                placeholder="e.g. Channel letter install"
              />
              <SelectField
                label="Installer (primary)"
                name="installerId"
                defaultValue=""
                options={[
                  { value: "", label: "Unassigned" },
                  ...members.map((m) => ({ value: m.userId, label: m.name })),
                ]}
              />
              <div className="col-span-2">
                <Field
                  label="Crew userIds (optional)"
                  name="crewIds"
                  placeholder="comma-separated userIds"
                  hint="Temporary until a crew picker lands — paste userIds from the staff page."
                />
              </div>
              <div className="col-span-2">
                <TextArea label="Install notes" name="notes" rows={2} />
              </div>
              <div className="col-span-2">
                <Button type="submit">Schedule</Button>
              </div>
            </form>
          )}
        </Card>
      )}
    </div>
  );
}
