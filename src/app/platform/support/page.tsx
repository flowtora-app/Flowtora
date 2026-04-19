import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { Card, CardHeader } from "@/components/Card";
import { slaChip, slaChipStyle } from "@/lib/support-sla";
import type { Prisma, SupportTicketStatus } from "@prisma/client";

// Phase 17 Slice D — platform support queue.
//
// A single view of every open ticket across every tenant. Triage happens
// here: status filter via querystring, newest-update-first. Clicking a
// row jumps to the ticket detail page where platform staff can reply,
// change status, or assign.

const STATUS_COLORS: Record<string, string> = {
  OPEN:              "#8bb9ff",
  IN_PROGRESS:       "#ffc98b",
  WAITING_CUSTOMER:  "#a8a8a8",
  RESOLVED:          "#7dd688",
  CLOSED:            "var(--muted)",
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW:    "var(--muted)",
  NORMAL: "var(--text)",
  HIGH:   "#ffc98b",
  URGENT: "#ff8b8b",
};

const TABS = ["ACTIVE", "ALL", "RESOLVED", "CLOSED"] as const;

export default async function PlatformSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; mine?: string }>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const scope = (TABS as readonly string[]).includes(sp.scope ?? "") ? (sp.scope as typeof TABS[number]) : "ACTIVE";
  const onlyMine = sp.mine === "1";

  const where: Prisma.SupportTicketWhereInput = {};
  if (scope === "ACTIVE") {
    where.status = { in: ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER"] as SupportTicketStatus[] };
  } else if (scope === "RESOLVED") {
    where.status = "RESOLVED";
  } else if (scope === "CLOSED") {
    where.status = "CLOSED";
  }
  if (onlyMine) where.assignedTo = ctx.userId;

  const tickets = await db.supportTicket.findMany({
    where,
    orderBy: [
      // URGENT / HIGH to the top, then most-recently-updated.
      { priority: "desc" },
      { updatedAt: "desc" },
    ],
    take: 200,
    include: { _count: { select: { messages: true } } },
  });

  const tenantIds = Array.from(new Set(tickets.map((t) => t.tenantId)));
  const assigneeIds = Array.from(
    new Set(tickets.map((t) => t.assignedTo).filter((x): x is string => Boolean(x))),
  );
  const [tenants, assignees] = await Promise.all([
    tenantIds.length
      ? db.tenant.findMany({
          where: { id: { in: tenantIds } },
          select: { id: true, name: true, slug: true, plan: true, status: true },
        })
      : Promise.resolve([] as { id: string; name: string; slug: string; plan: string; status: string }[]),
    assigneeIds.length
      ? db.user.findMany({
          where: { id: { in: assigneeIds } },
          select: { id: true, email: true, name: true },
        })
      : Promise.resolve([] as { id: string; email: string; name: string | null }[]),
  ]);
  const tenantById = new Map(tenants.map((t) => [t.id, t]));
  const assigneeById = new Map(assignees.map((u) => [u.id, u]));

  // Quick counts for tabs — the user wants to know "how many open" at a glance
  // without clicking the tab. One grouped query.
  const counts = await db.supportTicket.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));
  const activeCount = (byStatus.OPEN ?? 0) + (byStatus.IN_PROGRESS ?? 0) + (byStatus.WAITING_CUSTOMER ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Support queue</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Every tenant ticket in one place. Urgent first, then most-recently-updated.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/platform/support/templates"
            className="rounded-md px-3 py-2 text-xs"
            style={{ border: "1px solid var(--border)", color: "var(--muted)" }}
          >
            Canned replies
          </Link>
          <Link
            href={`/platform/support?scope=${scope}&${onlyMine ? "" : "mine=1"}`}
            className="rounded-md px-3 py-2 text-xs"
            style={{ border: "1px solid var(--border)", color: onlyMine ? "var(--accent)" : "var(--muted)" }}
          >
            {onlyMine ? "Showing: mine only" : "Show only mine"}
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 text-sm" style={{ borderBottom: "1px solid var(--border)" }}>
        {TABS.map((s) => {
          const label =
            s === "ACTIVE"   ? `Active (${activeCount})`
            : s === "ALL"    ? "All"
            : s === "RESOLVED" ? `Resolved (${byStatus.RESOLVED ?? 0})`
            : `Closed (${byStatus.CLOSED ?? 0})`;
          const active = scope === s;
          return (
            <Link
              key={s}
              href={`/platform/support?scope=${s}${onlyMine ? "&mine=1" : ""}`}
              className="px-3 py-2"
              style={{
                color: active ? "var(--text)" : "var(--muted)",
                borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                marginBottom: "-1px",
              }}
            >
              {label}
            </Link>
          );
        })}
      </div>

      <Card>
        {tickets.length === 0 ? (
          <p className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>
            No tickets match this view.
          </p>
        ) : (
          <ul>
            {tickets.map((t) => {
              const tenant = tenantById.get(t.tenantId);
              const assignee = t.assignedTo ? assigneeById.get(t.assignedTo) : null;
              return (
                <li key={t.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <Link href={`/platform/support/${t.id}`} className="block px-5 py-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="rounded-full px-2 py-0.5 text-xs"
                            style={{ color: STATUS_COLORS[t.status], border: `1px solid ${STATUS_COLORS[t.status]}` }}
                          >
                            {t.status.replace(/_/g, " ")}
                          </span>
                          <span
                            className="text-xs font-medium uppercase tracking-wide"
                            style={{ color: PRIORITY_COLORS[t.priority] }}
                          >
                            {t.priority}
                          </span>
                          {(() => {
                            const chip = slaChip({
                              dueBy: t.dueBy,
                              status: t.status,
                              firstStaffReplyAt: t.firstStaffReplyAt,
                            });
                            if (!chip) return null;
                            const s = slaChipStyle(chip.tone);
                            return (
                              <span
                                className="rounded-full px-2 py-0.5 text-xs"
                                style={{ color: s.color, border: `1px solid ${s.border}` }}
                              >
                                SLA · {chip.label}
                              </span>
                            );
                          })()}
                          <span className="text-xs" style={{ color: "var(--muted)" }}>
                            {t.category.replace(/_/g, " ")}
                          </span>
                        </div>
                        <div className="mt-1 truncate font-medium">{t.subject}</div>
                        <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                          {tenant ? (
                            <>{tenant.name} <span style={{ opacity: 0.7 }}>({tenant.plan})</span></>
                          ) : (
                            "deleted tenant"
                          )}
                          {" · "}
                          {t._count.messages} message{t._count.messages === 1 ? "" : "s"}
                          {" · "}
                          updated {relative(t.updatedAt)}
                          {t.satisfactionRating && (
                            <>
                              {" · "}
                              <span style={{ color: t.satisfactionRating >= 4 ? "#7dd688" : t.satisfactionRating <= 2 ? "#ff8b8b" : "#ffc98b" }}>
                                ★ {t.satisfactionRating}/5
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-xs" style={{ color: "var(--muted)" }}>
                        {assignee ? `→ ${assignee.name ?? assignee.email}` : "unassigned"}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function relative(d: Date): string {
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
