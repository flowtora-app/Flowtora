import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import {
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
import { ReportVizRenderer } from "../_components/ReportViz";
import { ReportHeaderActions, type ScheduleRow } from "../_components/ReportHeaderActions";

export const dynamic = "force-dynamic";

type SearchParams = { since?: string; until?: string };

// /platform/reports/[key] — Page 3 §Selected report view.
//
// Header (with favorite/pin/schedule/export) + filter bar (date
// range) + main viz + data table + insights panel.

export default async function ReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requirePlatformStaff();
  const { key } = await params;
  const sp = await searchParams;
  const entry = findReportByKey(key);
  if (!entry) notFound();

  // Touch lastViewedAt + load existing per-user state.
  await db.reportUserState.upsert({
    where: { userId_reportKey: { userId: ctx.userId, reportKey: key } },
    update: { lastViewedAt: new Date() },
    create: { userId: ctx.userId, reportKey: key, lastViewedAt: new Date() },
  });
  const userState = await db.reportUserState.findUnique({
    where: { userId_reportKey: { userId: ctx.userId, reportKey: key } },
    select: { isFavorite: true, isPinned: true },
  });

  const filters: ReportFilters = {};
  if (sp.since) {
    const d = new Date(sp.since);
    if (!Number.isNaN(d.getTime())) filters.since = d;
  }
  if (sp.until) {
    const d = new Date(sp.until);
    if (!Number.isNaN(d.getTime())) filters.until = d;
  }

  const filterQs = (() => {
    const u = new URLSearchParams();
    if (sp.since) u.set("since", sp.since);
    if (sp.until) u.set("until", sp.until);
    return u.toString();
  })();

  const [payload, schedules] = await Promise.all([
    loadReport(key, filters),
    db.reportSchedule.findMany({
      where: { ownerUserId: ctx.userId, reportKey: key },
      orderBy: { createdAt: "desc" },
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

  const categoryLabel = REPORT_CATEGORIES.find((c) => c.id === entry.category)?.label ?? entry.category;

  return (
    <div className="relative space-y-5">
      <div>
        <Breadcrumb
          items={[
            { label: "Platform", href: "/platform" },
            { label: "Reports", href: "/platform/reports" },
            { label: entry.name },
          ]}
        />
        <div className="mt-3">
          <PageHeader
            eyebrow={`${categoryLabel} · ${entry.viz.replace(/-/g, " ")}`}
            title={
              <span className="inline-flex items-center gap-2">
                <span aria-hidden style={{ fontSize: 22 }}>{entry.icon}</span>
                {entry.name}
              </span>
            }
            description={entry.description}
            actions={
              <ReportHeaderActions
                reportKey={entry.key}
                reportName={entry.name}
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
          <Button type="submit" size="sm">Apply</Button>
          {(sp.since || sp.until) && (
            <Link href={`/platform/reports/${entry.key}`} className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              Reset
            </Link>
          )}
          <span className="ml-auto text-[11px]" style={{ color: "var(--text-faint)" }}>
            Tip — most reports default to the last 30, 90, or 365 days. Set bounds to override.
          </span>
        </form>
      </Card>

      {/* Data state banner */}
      {payload.state === "PARTIAL" && (
        <Banner variant="info" title="Partial data source">
          {payload.note ?? entry.dataNote}
        </Banner>
      )}

      {payload.state === "PENDING" ? (
        <Card padding="lg">
          <EmptyState
            title="Awaiting data source"
            description={
              <span>
                {payload.note}
                <br />
                <span style={{ color: "var(--text-muted)" }}>
                  Once the source lands, this report turns on with no UI change.
                </span>
              </span>
            }
            action={
              <Link href="/platform/reports">
                <Button size="sm" variant="secondary">Back to library</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_280px]">
          <div className="flex flex-col gap-4">
            {entry.viz !== "table-only" && (
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
                  description={`${payload.rows.length.toLocaleString()} rows`}
                />
              </div>
              <DataTable rows={payload.rows} />
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
              <CardHeader title="About this report" />
              <CardBody>
                <div className="space-y-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                  <div><span className="font-semibold" style={{ color: "var(--text-default)" }}>Category</span> · {categoryLabel}</div>
                  <div><span className="font-semibold" style={{ color: "var(--text-default)" }}>Viz</span> · {entry.viz.replace(/-/g, " ")}</div>
                  <div><span className="font-semibold" style={{ color: "var(--text-default)" }}>Status</span> · <Badge size="xs" color={entry.dataState === "READY" ? "success" : entry.dataState === "PARTIAL" ? "info" : "warning"}>{entry.dataState}</Badge></div>
                </div>
              </CardBody>
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
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

function DataTable({ rows }: { rows: { [k: string]: string | number | null }[] }) {
  if (rows.length === 0) {
    return (
      <div className="p-6 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>No rows — try widening the filter window.</div>
    );
  }
  const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr style={{ background: "var(--surface-2)" }}>
            {columns.map((c) => (
              <th key={c} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)" }}>
                {humanizeKey(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 250).map((r, i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              {columns.map((c) => {
                const v = r[c];
                const isNum = typeof v === "number";
                return (
                  <td key={c} className={`px-3 py-1.5 ${isNum ? "text-right font-mono tabular-nums" : ""}`} style={{ color: "var(--text-default)" }}>
                    {v == null ? <span style={{ color: "var(--text-faint)" }}>—</span> : String(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 250 && (
        <div className="px-3 py-2 text-[11px]" style={{ color: "var(--text-faint)" }}>
          Showing 250 of {rows.length.toLocaleString()} rows. Use Export CSV for the full dataset.
        </div>
      )}
    </div>
  );
}

function humanizeKey(k: string): string {
  return k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).replace(/_/g, " ");
}
