import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  Badge,
  Breadcrumb,
  Button,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
} from "@/components/ui";
import { REPORT_REGISTRY, REPORT_CATEGORIES } from "@/server/platform/reports/registry";
import { ReportThumbnail } from "../_components/ReportThumbnail";
import { ForkButton } from "../_components/ForkButton";

export const dynamic = "force-dynamic";

// /platform/reports/new — Page 3 §Report builder.
//
// We don't have a from-scratch builder yet (drag fields onto a canvas
// is a multi-week feature). Today, "+ New report" surfaces every
// prebuilt report as a fork target — pick one and we copy it into a
// custom Report row that you can rename, set default filters on,
// schedule, and share. Once forked, you land on the editable detail
// page at /platform/reports/r/[id].
//
// When the from-scratch builder lands, it'll live alongside this
// page — pick "Start from scratch" or fork a template.

export default async function NewReportPage() {
  await requirePlatformStaff();

  const byCategory = new Map<string, typeof REPORT_REGISTRY>();
  for (const r of REPORT_REGISTRY) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, []);
    byCategory.get(r.category)!.push(r);
  }

  return (
    <div className="space-y-5">
      <div>
        <Breadcrumb
          items={[
            { label: "Platform", href: "/platform" },
            { label: "Reports", href: "/platform/reports" },
            { label: "New report" },
          ]}
        />
        <div className="mt-3">
          <PageHeader
            eyebrow="Builder"
            title="Start a new report"
            description="Fork a template into your library. Customise the name, default filters, schedule, and sharing."
            actions={
              <Link href="/platform/reports">
                <Button size="sm" variant="secondary">Cancel</Button>
              </Link>
            }
          />
        </div>
      </div>

      <Card padding="md">
        <div className="rounded-md border p-3 text-[12px]"
             style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)", color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--text-default)" }}>Note · </strong>
          The from-scratch report builder (drag fields onto a canvas, pick measures + dimensions + chart type) lands in a future slice.
          Today every report ships with a hand-tuned data loader; the builder will sit on top of those loaders so the moment it lands,
          your forked reports keep working without changes.
        </div>
      </Card>

      {Array.from(byCategory.entries()).map(([catId, list]) => {
        const catLabel = REPORT_CATEGORIES.find((c) => c.id === catId)?.label ?? catId;
        return (
          <div key={catId}>
            <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              {catLabel}
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {list.map((r) => (
                <Card key={r.key} padding="md" className="flex h-full flex-col">
                  <CardHeader
                    title={
                      <div className="flex items-start gap-2">
                        <span aria-hidden style={{ fontSize: 22 }}>{r.icon}</span>
                        <div className="min-w-0">
                          <div className="truncate text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>{r.name}</div>
                          <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>{r.viz.replace(/-/g, " ")}</div>
                        </div>
                      </div>
                    }
                    right={
                      r.dataState === "PENDING"
                        ? <Badge size="xs" color="warning">Awaiting source</Badge>
                        : r.dataState === "PARTIAL"
                        ? <Badge size="xs" color="info">Partial</Badge>
                        : <Badge size="xs" color="success">Live</Badge>
                    }
                  />
                  <CardBody>
                    <ReportThumbnail viz={r.viz} className="mb-2" />
                    <p className="line-clamp-2 text-[12px]" style={{ color: "var(--text-muted)" }}>{r.description}</p>
                  </CardBody>
                  <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3" style={{ borderColor: "var(--border-subtle)" }}>
                    <Link href={`/platform/reports/${r.key}`}>
                      <Button size="xs" variant="ghost">Preview</Button>
                    </Link>
                    <ForkButton fromKey={r.key} sourceName={r.name} />
                  </div>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
