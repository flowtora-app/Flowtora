import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button, Field, SelectField, TextArea } from "@/components/Field";
import { createTask, toggleTask, deleteTask } from "@/app/actions/customers";
import { listActiveMembers, memberLookup } from "@/lib/members";
import { formatDate, relativeDays, humanize } from "@/lib/format";

// Tasks chip — team to-do list. Gated on customers:view for read, and
// customers:edit for the "Add task" form + delete buttons. Ported from
// /t/[slug]/tasks with filter moved under chip=tasks&view=<mine|all|completed>.

type View = "mine" | "all" | "completed";

export async function InboxTasksView({
  slug,
  searchParams,
}: {
  slug: string;
  searchParams: Record<string, string | undefined>;
}) {
  const ctx = await requirePermission(slug, "customers:view");
  const view: View =
    searchParams.view === "all"       ? "all"
  : searchParams.view === "completed" ? "completed"
  :                                    "mine";

  const where: { tenantId: string; assignedTo?: string; completedAt?: null | { not: null } } = {
    tenantId: ctx.tenant.id,
  };
  if (view === "mine") {
    where.assignedTo = ctx.userId;
    where.completedAt = null;
  } else if (view === "completed") {
    where.completedAt = { not: null };
  } else {
    where.completedAt = null;
  }

  const [tasks, members, memberMap, customers] = await Promise.all([
    db.task.findMany({
      where,
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      include: {
        customer: true,
        order:    { select: { id: true, number: true } },
      },
      take: 200,
    }),
    listActiveMembers(ctx.tenant.id),
    memberLookup(ctx.tenant.id),
    db.customer.findMany({
      where: { tenantId: ctx.tenant.id, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const create   = createTask.bind(null, slug);
  const canEdit  = ctx.can("customers:edit");

  const viewHref = (v: View) => {
    const sp = new URLSearchParams();
    sp.set("chip", "tasks");
    if (v !== "mine") sp.set("view", v);
    return `/t/${slug}/inbox?${sp.toString()}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Quick reminders tied to a customer, an order, or nothing in particular.
        </p>
        <nav className="flex gap-1 text-sm">
          {(["mine", "all", "completed"] as const).map((f) => (
            <Link
              key={f}
              href={viewHref(f)}
              className="rounded-md px-3 py-1.5"
              style={{
                background: view === f ? "var(--surface-2)" : "transparent",
                border: "1px solid var(--border-default)",
                color: "var(--text-default)",
              }}
            >
              {f === "mine" ? "My open" : f === "all" ? "All open" : "Completed"}
            </Link>
          ))}
        </nav>
      </div>

      {canEdit && (
        <Card>
          <CardHeader title="Add task" />
          <form action={create} className="space-y-3 px-5 py-4">
            <Field label="Title" name="title" required />
            <div className="grid grid-cols-4 gap-3">
              <SelectField
                label="Customer"
                name="customerId"
                defaultValue=""
                options={[{ value: "", label: "—" }, ...customers.map((c) => ({ value: c.id, label: c.name }))]}
              />
              <SelectField
                label="Assignee"
                name="assignedTo"
                defaultValue={ctx.userId}
                options={[{ value: "", label: "Unassigned" }, ...members.map((m) => ({ value: m.userId, label: m.name }))]}
              />
              <Field label="Due date" name="dueDate" type="date" />
              <SelectField
                label="Priority"
                name="priority"
                defaultValue="NORMAL"
                options={[
                  { value: "LOW",    label: "Low"    },
                  { value: "NORMAL", label: "Normal" },
                  { value: "HIGH",   label: "High"   },
                ]}
              />
            </div>
            <TextArea label="Description" name="description" rows={2} />
            <Button type="submit" variant="secondary">Add task</Button>
          </form>
        </Card>
      )}

      <Card>
        <CardHeader title={`${tasks.length} task${tasks.length === 1 ? "" : "s"}`} />
        <ul>
          {tasks.length === 0 && (
            <li className="px-5 py-2">
              <EmptyState
                title={
                  view === "mine"      ? "You're all caught up"
                : view === "completed" ? "No completed tasks yet"
                :                        "No open tasks"
                }
                description={
                  view === "mine"
                    ? "Tasks assigned to you will show up here. Create one below or check All tasks for anything unassigned."
                    : view === "completed"
                    ? "Tasks you've ticked off will collect here — a useful audit trail of what the team got done."
                    : "Tasks are the shop's to-do list — quick reminders tied to a customer, order, or nothing in particular."
                }
              />
            </li>
          )}
          {tasks.map((t) => {
            const toggle  = toggleTask.bind(null, slug, t.id);
            const remove  = deleteTask.bind(null, slug, t.id);
            const overdue = t.dueDate && !t.completedAt && t.dueDate < new Date();
            return (
              <li
                key={t.id}
                className="flex items-start gap-3 px-5 py-3"
                style={{ borderTop: "1px solid var(--border-subtle)" }}
              >
                <form action={toggle} className="mt-0.5">
                  <button type="submit" aria-label="toggle">
                    <span
                      style={{
                        display: "inline-block", width: 16, height: 16, borderRadius: 4,
                        border: "1px solid var(--border-default)",
                        background: t.completedAt ? "var(--accent-primary)" : "transparent",
                      }}
                    />
                  </button>
                </form>
                <div className="flex-1">
                  <div className={`text-sm ${t.completedAt ? "line-through opacity-60" : ""}`}>
                    {t.title}
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: overdue ? "#ff8b8b" : "var(--text-muted)" }}
                  >
                    {[
                      t.order    ? <Link key="o" href={`/t/${slug}/orders/${t.order.id}`}       className="underline">{t.order.number}</Link> : null,
                      t.customer ? <Link key="c" href={`/t/${slug}/customers/${t.customer.id}`} className="underline">{t.customer.name}</Link> : null,
                      t.assignedTo ? memberMap.get(t.assignedTo)?.name : "Unassigned",
                      t.dueDate  ? `due ${formatDate(t.dueDate)} (${relativeDays(t.dueDate)})` : null,
                      humanize(t.priority),
                    ].filter(Boolean).map((part, i, arr) => (
                      <span key={i}>{part}{i < arr.length - 1 ? " · " : ""}</span>
                    ))}
                  </div>
                </div>
                {canEdit && (
                  <form action={remove}>
                    <button
                      type="submit"
                      className="text-xs underline"
                      style={{ color: "#ff6b6b" }}
                    >
                      Delete
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
