import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";

// Phase 17 Slice D — tenant-side list of their own support tickets.
//
// Everyone in the tenant can see every ticket (no per-user scoping) because
// shops are small and "who owns this issue" is rarely sensitive. If that
// assumption breaks in larger shops we can add a privacy flag later.

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  OPEN:              { label: "Open",              color: "#8bb9ff" },
  IN_PROGRESS:       { label: "In progress",       color: "#ffc98b" },
  WAITING_CUSTOMER:  { label: "Waiting on you",    color: "#ffc98b" },
  RESOLVED:          { label: "Resolved",          color: "#7dd688" },
  CLOSED:            { label: "Closed",            color: "var(--muted)" },
};

export default async function TenantSupportListPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireTenant(slug);

  const tickets = await db.supportTicket.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 200,
    include: { _count: { select: { messages: true } } },
  });

  const open = tickets.filter((t) => t.status !== "CLOSED" && t.status !== "RESOLVED");
  const done = tickets.filter((t) => t.status === "CLOSED" || t.status === "RESOLVED");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Support</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Open a ticket — the Flowtora team replies here and you'll get a notification.
          </p>
        </div>
        <Link
          href={`/t/${slug}/support/new`}
          className="rounded-md px-4 py-2 text-sm font-medium"
          style={{ background: "var(--accent)", color: "var(--bg)" }}
        >
          New ticket
        </Link>
      </div>

      <Card>
        <CardHeader title="Active" />
        {open.length === 0 ? (
          <p className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>
            Nothing open right now.
          </p>
        ) : (
          <ul>
            {open.map((t) => <TicketRow key={t.id} slug={slug} t={t} />)}
          </ul>
        )}
      </Card>

      {done.length > 0 && (
        <Card>
          <CardHeader title="History" />
          <ul>
            {done.map((t) => <TicketRow key={t.id} slug={slug} t={t} />)}
          </ul>
        </Card>
      )}
    </div>
  );
}

function TicketRow({
  slug,
  t,
}: {
  slug: string;
  t: {
    id: string;
    subject: string;
    status: string;
    priority: string;
    category: string;
    updatedAt: Date;
    _count: { messages: number };
  };
}) {
  const meta = STATUS_LABELS[t.status] ?? { label: t.status, color: "var(--muted)" };
  return (
    <li style={{ borderTop: "1px solid var(--border)" }}>
      <Link
        href={`/t/${slug}/support/${t.id}`}
        className="flex items-center justify-between px-5 py-3 text-sm"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{t.subject}</div>
          <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
            {t.category.replace(/_/g, " ")} · {t._count.messages} message{t._count.messages === 1 ? "" : "s"} ·
            {" "}updated {relative(t.updatedAt)}
          </div>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-xs"
          style={{ color: meta.color, border: `1px solid ${meta.color}` }}
        >
          {meta.label}
        </span>
      </Link>
    </li>
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
