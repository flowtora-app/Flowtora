import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { RangePicker, Stat, Bar } from "@/components/Reports";
import { resolveRange, resolveBranch, reportQueryString, pct, formatPct } from "@/lib/reports";
import { applyBranchScope } from "@/lib/locations";
import {
  INSTALL_STATUSES,
  INSTALL_KINDS,
  installStatusColor,
  installStatusLabel,
  installKindColor,
  installKindLabel,
  OPEN_INSTALL_STATUSES,
} from "@/lib/installs";
import { memberLookup } from "@/lib/members";
import { formatDate } from "@/lib/format";
import type { InstallEventStatus, InstallEventKind, Prisma } from "@prisma/client";

export default async function InstallsReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string; from?: string; to?: string; branch?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "reports:view");
  const range = resolveRange(sp);
  const branch = await resolveBranch(ctx.tenant.id, ctx.branchScope, sp.branch);

  // Install events are scoped by `scheduledStart` — that's the calendar-relevant
  // date, not createdAt. A manager asking "how did last week look" means the
  // events that were scheduled for last week.
  const inRangeWhere = applyBranchScope({
    tenantId: ctx.tenant.id,
    scheduledStart: { gte: range.from, lte: range.to },
  } as Prisma.InstallEventWhereInput, branch.effectiveScope);

  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 86_400_000);

  const [byStatus, byKind, completedInRange, noShowCount, upcoming7d, byInstaller] = await Promise.all([
    db.installEvent.groupBy({
      by: ["status"],
      where: inRangeWhere,
      _count: { _all: true },
    }),
    db.installEvent.groupBy({
      by: ["kind"],
      where: inRangeWhere,
      _count: { _all: true },
    }),
    db.installEvent.count({
      where: { ...inRangeWhere, status: "COMPLETED" },
    }),
    db.installEvent.count({
      where: { ...inRangeWhere, status: "NO_SHOW" },
    }),
    db.installEvent.count({
      where: applyBranchScope({
        tenantId: ctx.tenant.id,
        status: { in: OPEN_INSTALL_STATUSES },
        scheduledStart: { gte: now, lte: in7Days },
      } as Prisma.InstallEventWhereInput, branch.effectiveScope),
    }),
    db.installEvent.groupBy({
      by: ["installerId"],
      where: { ...inRangeWhere, installerId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { installerId: "desc" } },
      take: 10,
    }),
  ]);

  const statusMap = new Map<InstallEventStatus, number>();
  for (const s of INSTALL_STATUSES) statusMap.set(s.value, 0);
  for (const row of byStatus) statusMap.set(row.status, row._count._all);

  const kindMap = new Map<InstallEventKind, number>();
  for (const k of INSTALL_KINDS) kindMap.set(k.value, 0);
  for (const row of byKind) kindMap.set(row.kind, row._count._all);

  const totalEvents = byStatus.reduce((n, r) => n + r._count._all, 0);
  const noShowRate = pct(noShowCount, completedInRange + noShowCount);

  // Per-installer completed rate.
  const memberMap = await memberLookup(ctx.tenant.id);
  const installerIds = byInstaller.map((r) => r.installerId).filter((id): id is string => !!id);
  const completedPerInstaller = installerIds.length > 0
    ? await db.installEvent.groupBy({
        by: ["installerId"],
        where: { ...inRangeWhere, status: "COMPLETED", installerId: { in: installerIds } },
        _count: { _all: true },
      })
    : [];
  const completedByInstaller = new Map(
    completedPerInstaller.map((r) => [r.installerId ?? "", r._count._all] as const),
  );

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <Link href={`/t/${slug}/reports`} className="underline" style={{ color: "var(--muted)" }}>
          ← Reports
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Installs</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Install events scheduled within {range.label}.
          </p>
        </div>
        <a
          href={`/api/t/${slug}/reports/installs/export?${reportQueryString(range, branch)}`}
          className="shrink-0 rounded-md px-3 py-1.5 text-xs font-medium"
          style={{ border: "1px solid var(--border)", color: "var(--text)" }}
        >
          Export CSV
        </a>
      </div>

      <RangePicker range={range} basePath={`/t/${slug}/reports/installs`} branch={branch} />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Events scheduled" value={String(totalEvents)} />
        <Stat label="Completed" value={String(completedInRange)} sub={formatPct(pct(completedInRange, totalEvents))} />
        <Stat label="No-shows" value={String(noShowCount)} sub={formatPct(noShowRate)} />
        <Stat label="Upcoming (7 days)" value={String(upcoming7d)} href={`/t/${slug}/installs`} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="By status" />
          <div className="space-y-2 px-5 py-4">
            {INSTALL_STATUSES.map((s) => (
              <Bar
                key={s.value}
                label={s.label}
                value={statusMap.get(s.value) ?? 0}
                max={Math.max(1, ...Array.from(statusMap.values()))}
                meta={`${statusMap.get(s.value) ?? 0}`}
                color={s.color}
              />
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="By kind" />
          <div className="space-y-2 px-5 py-4">
            {INSTALL_KINDS.map((k) => (
              <Bar
                key={k.value}
                label={k.label}
                value={kindMap.get(k.value) ?? 0}
                max={Math.max(1, ...Array.from(kindMap.values()))}
                color={k.color}
              />
            ))}
          </div>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader title="Top installers" description="By events scheduled in range" />
          <ul>
            {byInstaller.length === 0 && (
              <li className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>No assigned events in range.</li>
            )}
            {byInstaller.map((r) => {
              const uid = r.installerId ?? "";
              const name = memberMap.get(uid)?.name ?? uid;
              const total = r._count._all;
              const done = completedByInstaller.get(uid) ?? 0;
              const rate = pct(done, total);
              return (
                <li key={uid} className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                  <div className="text-sm font-medium">{name}</div>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>
                    {done}/{total} completed · {formatPct(rate)}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <div className="text-xs" style={{ color: "var(--muted)" }}>
        Range: {formatDate(range.from)} → {formatDate(range.to)} ·
        {" "}<span style={{ color: installStatusColor("COMPLETED") }}>{installStatusLabel("COMPLETED")}</span> /
        {" "}<span style={{ color: installKindColor("INSTALL") }}>{installKindLabel("INSTALL")}</span>
      </div>
    </div>
  );
}
