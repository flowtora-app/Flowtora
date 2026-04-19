import Link from "next/link";
import { requirePortalToken, portalPath } from "@/lib/portal";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { formatDate } from "@/lib/format";
import {
  installKindLabel,
  installStatusColor,
  installStatusLabel,
  formatTimeRange,
  OPEN_INSTALL_STATUSES,
} from "@/lib/installs";

export default async function PortalInstallsPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await requirePortalToken(token);

  const now = new Date();

  const [upcoming, past] = await Promise.all([
    db.installEvent.findMany({
      where: {
        tenantId:   ctx.tenant.id,
        customerId: ctx.customer.id,
        status:     { in: OPEN_INSTALL_STATUSES },
        scheduledStart: { gte: now },
      },
      include: { order: { select: { id: true, number: true } } },
      orderBy: { scheduledStart: "asc" },
    }),
    db.installEvent.findMany({
      where: {
        tenantId:   ctx.tenant.id,
        customerId: ctx.customer.id,
        OR: [
          { status: { in: ["COMPLETED", "CANCELED", "NO_SHOW"] } },
          { scheduledStart: { lt: now } },
        ],
      },
      include: { order: { select: { id: true, number: true } } },
      orderBy: { scheduledStart: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Install schedule</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Upcoming and past visits for your projects.
        </p>
      </div>

      <Card>
        <CardHeader title="Upcoming" description={`${upcoming.length} scheduled`} />
        <ul>
          {upcoming.length === 0 && (
            <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
              Nothing on the calendar right now.
            </li>
          )}
          {upcoming.map((ev) => (
            <li key={ev.id} className="px-5 py-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-sm font-medium">
                    {ev.title ?? installKindLabel(ev.kind)}
                  </div>
                  <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: installStatusColor(ev.status), color: "white" }}>
                    {installStatusLabel(ev.status)}
                  </span>
                </div>
                <Link href={portalPath(token, `orders/${ev.order.id}`)} className="text-xs underline" style={{ color: "var(--text-muted)" }}>
                  Order {ev.order.number}
                </Link>
              </div>
              <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                {formatDate(ev.scheduledStart, ctx.tenant.dateFormat)} · {formatTimeRange(ev.scheduledStart, ev.scheduledEnd)}
                {(ev.addressLine1 || ev.city) && (
                  <>
                    {" · "}
                    {[ev.addressLine1, ev.city, ev.region, ev.postalCode].filter(Boolean).join(", ")}
                  </>
                )}
              </div>
              {ev.notes && (
                <div className="mt-2 whitespace-pre-wrap text-xs" style={{ color: "var(--text-muted)" }}>
                  {ev.notes}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Past visits" description={`${past.length} in recent history`} />
        <ul>
          {past.length === 0 && (
            <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
              No past visits yet.
            </li>
          )}
          {past.map((ev) => (
            <li key={ev.id} className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center gap-3">
                <div className="text-sm">{ev.title ?? installKindLabel(ev.kind)}</div>
                <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: installStatusColor(ev.status), color: "white" }}>
                  {installStatusLabel(ev.status)}
                </span>
              </div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                {formatDate(ev.scheduledStart, ctx.tenant.dateFormat)}
                {" · "}
                <Link href={portalPath(token, `orders/${ev.order.id}`)} className="underline">
                  Order {ev.order.number}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
