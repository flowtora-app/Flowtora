import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import {
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Tabs,
} from "@/components/ui";
import { findReportByKey } from "@/server/platform/reports/registry";
import { ScheduleRowActions } from "../_components/ScheduleRowActions";

export const dynamic = "force-dynamic";

// /platform/reports/schedules — Page 3 §Active schedules tab.
//
// Lists every ReportSchedule the current user owns + every shared
// schedule across the team. Pause/resume + delete inline.

export default async function SchedulesPage() {
  const ctx = await requirePlatformStaff();

  const [mine, others] = await Promise.all([
    db.reportSchedule.findMany({
      where: { ownerUserId: ctx.userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, recipients: true, format: true, frequency: true,
        reportKey: true, reportId: true, lastDeliveredAt: true, pausedAt: true,
        timeOfDay: true, timezone: true, dayOfWeek: true, dayOfMonth: true,
        cronExpression: true,
        report: { select: { name: true } },
      },
    }),
    db.reportSchedule.findMany({
      where: { ownerUserId: { not: ctx.userId } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, recipients: true, frequency: true,
        reportKey: true, reportId: true, lastDeliveredAt: true, pausedAt: true,
        owner: { select: { name: true, email: true } },
        report: { select: { name: true } },
      },
      take: 100,
    }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <Breadcrumb
          items={[
            { label: "Platform", href: "/platform" },
            { label: "Reports", href: "/platform/reports" },
            { label: "Schedules" },
          ]}
        />
        <div className="mt-3">
          <PageHeader
            title="Scheduled reports"
            description="Every email digest your team has set up."
            actions={
              <Link href="/platform/reports">
                <Button size="sm" variant="secondary">Back to library</Button>
              </Link>
            }
          />
        </div>
      </div>

      <Tabs
        variant="line"
        activeHref="/platform/reports/schedules"
        items={[
          { label: "Library", href: "/platform/reports" },
          { label: "Schedules", href: "/platform/reports/schedules", badge: mine.length },
        ]}
      />

      <Card padding="none" className="overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <CardHeader title="My schedules" description={mine.length === 0 ? "No active schedules" : `${mine.length} ${mine.length === 1 ? "schedule" : "schedules"}`} />
        </div>
        {mine.length === 0 ? (
          <CardBody>
            <EmptyState
              title="You have no scheduled reports"
              description="Open any report and click Schedule to send it on a recurring cadence."
              action={<Link href="/platform/reports"><Button size="sm">Browse reports</Button></Link>}
            />
          </CardBody>
        ) : (
          <ul>
            {mine.map((s) => {
              const reportName = s.report?.name ?? findReportByKey(s.reportKey ?? "")?.name ?? "Custom report";
              const reportHref = s.reportId
                ? `/platform/reports/r/${s.reportId}`
                : s.reportKey
                ? `/platform/reports/${s.reportKey}`
                : "/platform/reports";
              return (
                <li key={s.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <div className="flex items-start gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium" style={{ color: "var(--text-default)" }}>{s.name}</span>
                        {s.pausedAt && <Badge size="xs" color="neutral">Paused</Badge>}
                        <Link href={reportHref} className="text-[12px] hover:underline" style={{ color: "var(--accent-primary)" }}>
                          {reportName} →
                        </Link>
                      </div>
                      <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {s.recipients} · {s.frequency.toLowerCase()}
                        {s.frequency === "CRON" && s.cronExpression ? ` (${s.cronExpression})` : ""}
                        {" · "}{s.format.replace("_", " ").toLowerCase()}
                        {" · "}{s.timeOfDay} {s.timezone}
                        {s.lastDeliveredAt ? ` · last sent ${new Date(s.lastDeliveredAt).toLocaleString()}` : " · never sent"}
                      </div>
                    </div>
                    <ScheduleRowActions id={s.id} paused={!!s.pausedAt} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {others.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <CardHeader title="Other staff schedules" description="Read-only — only the owner can pause or delete." />
          </div>
          <ul>
            {others.map((s) => {
              const reportName = s.report?.name ?? findReportByKey(s.reportKey ?? "")?.name ?? "Custom report";
              return (
                <li key={s.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <div className="flex items-start gap-3 px-4 py-3">
                    <Avatar size="xs" name={s.owner?.name ?? s.owner?.email ?? "Staff"} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium" style={{ color: "var(--text-default)" }}>{s.name}</span>
                        {s.pausedAt && <Badge size="xs" color="neutral">Paused</Badge>}
                        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                          for {reportName} · owned by {s.owner?.name ?? s.owner?.email}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {s.recipients} · {s.frequency.toLowerCase()}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
