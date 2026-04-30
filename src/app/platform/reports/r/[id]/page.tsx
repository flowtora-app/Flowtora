import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import {
  Avatar,
  Badge,
  Banner,
  Breadcrumb,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { findReportByKey, REPORT_CATEGORIES } from "@/server/platform/reports/registry";
import { loadReport, type ReportFilters } from "@/server/platform/reports/loaders";
import { ReportVizRenderer } from "../../_components/ReportViz";
import { ReportHeaderActions, type ScheduleRow } from "../../_components/ReportHeaderActions";
import { ReportEditableName } from "../../_components/ReportEditableName";
import { ReportVersions } from "../../_components/ReportVersions";
import { ReportDataTable } from "../../_components/ReportDataTable";

export const dynamic = "force-dynamic";

type SearchParams = { since?: string; until?: string; tab?: string };

// Custom-report detail page. Same layout as the prebuilt detail
// (/platform/reports/[key]) but the title is editable, schedules
// + favourites bind to the custom Report row, and the right rail
// surfaces the version history.

export default async function CustomReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requirePlatformStaff();
  const { id } = await params;
  const sp = await searchParams;

  const report = await db.report.findUnique({
    where: { id },
    select: {
      id: true, key: true, name: true, description: true, category: true,
      filters: true, chartConfig: true, isShared: true, ownerUserId: true,
      createdAt: true, updatedAt: true,
      owner: { select: { id: true, name: true, email: true } },
    },
  });
  if (!report) notFound();

  const ownedByMe = report.ownerUserId === ctx.userId;
  const canSee = ownedByMe || report.isShared;
  if (!canSee) notFound();

  // Fall back to the registry entry for icon + viz when the user
  // hasn't overridden them.
  const registry = report.key ? findReportByKey(report.key) : undefined;
  const icon = registry?.icon ?? "🧾";
  const viz  = registry?.viz ?? "table-only";
  const dataState = registry?.dataState ?? "READY";
  const categoryId = (report.category as keyof typeof Object) ?? registry?.category ?? "operations";
  const categoryLabel = REPORT_CATEGORIES.find((c) => c.id === report.category)?.label ?? report.category ?? "—";

  // Resolve filters: report's saved querystring + any URL overrides.
  const baseQs = new URLSearchParams(report.filters);
  if (sp.since) baseQs.set("since", sp.since);
  if (sp.until) baseQs.set("until", sp.until);
  const since = baseQs.get("since") ? new Date(baseQs.get("since")!) : undefined;
  const until = baseQs.get("until") ? new Date(baseQs.get("until")!) : undefined;
  const filters: ReportFilters = {};
  if (since && !Number.isNaN(since.getTime())) filters.since = since;
  if (until && !Number.isNaN(until.getTime())) filters.until = until;

  // Touch user state on view.
  await db.reportUserState.upsert({
    where: { userId_reportId: { userId: ctx.userId, reportId: id } },
    update: { lastViewedAt: new Date(), viewCount: { increment: 1 } },
    create: { userId: ctx.userId, reportId: id, lastViewedAt: new Date(), viewCount: 1 },
  });
  const userState = await db.reportUserState.findUnique({
    where: { userId_reportId: { userId: ctx.userId, reportId: id } },
    select: { isFavorite: true, isPinned: true },
  });

  // We only run the loader if the registry knows the key — custom
  // reports without a registry-backed loader (the from-scratch builder
  // hasn't landed) just render the empty state below.
  const payload = report.key
    ? await loadReport(report.key, filters)
    : { state: "PENDING" as const, note: "From-scratch reports don't have a data loader yet — the custom report builder is reserved for a future slice. For now, this report is a metadata + schedule shell." };

  // Schedules + versions for this report.
  const [schedules, versions] = await Promise.all([
    db.reportSchedule.findMany({
      where: { ownerUserId: ctx.userId, reportId: id },
      orderBy: { createdAt: "desc" },
    }),
    db.reportVersion.findMany({
      where: { reportId: id },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true, name: true, description: true, filters: true,
        authorUserId: true, note: true, createdAt: true,
      },
    }),
  ]);
  const schedRows: ScheduleRow[] = schedules.map((s) => ({
    id: s.id,
    name: s.name,
    recipients: s.recipients,
    format: s.format,
    frequency: s.frequency,
    paused: !!s.pausedAt,
    lastDeliveredAt: s.lastDeliveredAt?.toISOString() ?? null,
    cronExpression: s.cronExpression,
    timeOfDay: s.timeOfDay,
    timezone: s.timezone,
    dayOfWeek: s.dayOfWeek,
    dayOfMonth: s.dayOfMonth,
  }));

  const filterQs = baseQs.toString();
  const tab = sp.tab ?? "report";

  return (
    <div className="relative space-y-5">
      <div>
        <Breadcrumb
          items={[
            { label: "Platform", href: "/platform" },
            { label: "Reports", href: "/platform/reports" },
            { label: report.name },
          ]}
        />
        <div className="mt-3">
          <PageHeader
            eyebrow={
              <span className="inline-flex items-center gap-1.5">
                <span>{categoryLabel}</span>
                <span style={{ color: "var(--text-faint)" }}>·</span>
                <span>{viz.replace(/-/g, " ")}</span>
                {report.isShared && <Badge size="xs" color="info">Shared with team</Badge>}
              </span>
            }
            title={
              ownedByMe ? (
                <ReportEditableName reportId={report.id} initialName={report.name} icon={icon} />
              ) : (
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden style={{ fontSize: 22 }}>{icon}</span>
                  {report.name}
                </span>
              )
            }
            description={
              <span className="flex flex-wrap items-center gap-2 text-[12px]">
                {report.description ?? registry?.description ?? "Custom report"}
                {report.owner && (
                  <span className="inline-flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                    · owned by
                    <Avatar size="xs" name={report.owner.name ?? report.owner.email} />
                    <span>{report.owner.name ?? report.owner.email}</span>
                  </span>
                )}
              </span>
            }
            actions={
              <ReportHeaderActions
                reportKey={report.key ?? `r:${report.id}`}
                reportId={report.id}
                ownedByMe={ownedByMe}
                isShared={report.isShared}
                reportName={report.name}
                isFavorite={!!userState?.isFavorite}
                isPinned={!!userState?.isPinned}
                filterQs={filterQs}
                schedules={schedRows}
                defaultRecipientEmail={ctx.email}
              />
            }
          />
        </div>
      </div>

      {/* Filter bar */}
      <Card padding="md">
        <form className="flex flex-wrap items-end gap-3" method="get">
          <FilterField label="Since" name="since" defaultValue={sp.since ?? ""} />
          <FilterField label="Until" name="until" defaultValue={sp.until ?? ""} />
          <Button type="submit" size="sm">Run now</Button>
          {(sp.since || sp.until) && (
            <Link href={`/platform/reports/r/${id}`} className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              Reset
            </Link>
          )}
          <span className="ml-auto text-[11px]" style={{ color: "var(--text-faint)" }}>
            Stored default: <code>?{report.filters || "(none)"}</code>
          </span>
        </form>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <TabLink active={tab === "report"}   href={`/platform/reports/r/${id}?tab=report`}>Report</TabLink>
        <TabLink active={tab === "versions"} href={`/platform/reports/r/${id}?tab=versions`}>Versions <span className="ml-1 font-mono text-[10px]" style={{ color: "var(--text-faint)" }}>{versions.length}</span></TabLink>
      </div>

      {tab === "versions" ? (
        <ReportVersions versions={versions} ownedByMe={ownedByMe} />
      ) : payload.state === "PENDING" ? (
        <Card padding="lg">
          <EmptyState
            title="Awaiting data source"
            description={
              <span>
                {payload.note}
                <br />
                <span style={{ color: "var(--text-muted)" }}>
                  Schedules + sharing still work — when the source lands the report will start delivering real numbers without UI changes.
                </span>
              </span>
            }
          />
        </Card>
      ) : (
        <>
          {payload.state === "PARTIAL" && (
            <Banner variant="info" title="Partial data source">
              {payload.note ?? registry?.dataNote}
            </Banner>
          )}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_280px]">
            <div className="flex flex-col gap-4">
              {viz !== "table-only" && (
                <Card padding="md">
                  <CardHeader title="Visualization" />
                  <CardBody>
                    <ReportVizRenderer viz={payload.viz} />
                  </CardBody>
                </Card>
              )}
              <Card padding="none" className="overflow-hidden">
                <div className="px-4 pt-4 pb-2">
                  <CardHeader
                    title="Data"
                    description={`${payload.rows.length.toLocaleString()} rows · click a column header to sort`}
                  />
                </div>
                <ReportDataTable rows={payload.rows} />
              </Card>
            </div>

            <aside className="space-y-3">
              <Card padding="md">
                <CardHeader title="Insights" description="Auto-generated from this run" />
                <CardBody>
                  <ul className="flex flex-col gap-3">
                    {payload.insights.map((it, i) => (
                      <li key={i} className="rounded-md border p-2"
                          style={{
                            background: it.tone === "positive" ? "var(--emerald-50)"
                                      : it.tone === "warning" ? "var(--amber-50)"
                                      : "var(--surface-2)",
                            borderColor: it.tone === "positive" ? "var(--emerald-200)"
                                       : it.tone === "warning" ? "var(--amber-200)"
                                       : "var(--border-subtle)",
                          }}>
                        <div className="text-[12px] font-semibold" style={{
                          color: it.tone === "positive" ? "var(--emerald-700)"
                               : it.tone === "warning" ? "var(--amber-700)"
                               : "var(--text-default)",
                        }}>
                          {it.title}
                        </div>
                        <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                          {it.body}
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
              <Card padding="md">
                <CardHeader title="About" />
                <CardBody>
                  <div className="space-y-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                    <div><span className="font-semibold" style={{ color: "var(--text-default)" }}>Source</span> · {report.key ? `Forked from ${report.key}` : "Custom"}</div>
                    <div><span className="font-semibold" style={{ color: "var(--text-default)" }}>Visibility</span> · {report.isShared ? "Shared with team" : "Private"}</div>
                    <div><span className="font-semibold" style={{ color: "var(--text-default)" }}>Created</span> · {report.createdAt.toLocaleDateString()}</div>
                    <div><span className="font-semibold" style={{ color: "var(--text-default)" }}>Status</span> · <Badge size="xs" color={dataState === "READY" ? "success" : dataState === "PARTIAL" ? "info" : "warning"}>{dataState}</Badge></div>
                  </div>
                </CardBody>
              </Card>
            </aside>
          </div>
        </>
      )}
    </div>
  );
  void categoryId;
}

function FilterField({ label, name, defaultValue }: { label: string; name: string; defaultValue: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>{label}</span>
      <input
        type="date"
        name={name}
        defaultValue={defaultValue}
        className="ts-focus h-8 rounded-md border px-2 text-[13px]"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-default)", color: "var(--text-default)" }}
      />
    </label>
  );
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="ts-focus inline-flex h-8 items-center rounded-md px-3 text-[13px] font-medium"
      style={{
        background: active ? "var(--surface-2)" : "transparent",
        color: active ? "var(--text-default)" : "var(--text-muted)",
        border: `1px solid ${active ? "var(--border-default)" : "transparent"}`,
      }}
    >
      {children}
    </Link>
  );
}

