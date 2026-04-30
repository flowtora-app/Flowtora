import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import {
  Badge,
  Breadcrumb,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  EmptyState,
  Input,
  PageHeader,
} from "@/components/ui";
import {
  REPORT_REGISTRY,
  REPORT_CATEGORIES,
  type ReportRegistryEntry,
  type ReportCategory,
} from "@/server/platform/reports/registry";

export const dynamic = "force-dynamic";

// /platform/reports — Reports & Insights library (Page 3 §Library view).
//
// Two-column layout: left rail = categories with counts, main area =
// search + sort + grid of report cards. Cards link to the detail
// page at /platform/reports/[key].

type SearchParams = {
  q?: string;
  category?: string;
  sort?: string;
  scope?: string;
};

const SCOPES = ["all", "favorites", "pinned", "ready", "pending"] as const;

export default async function ReportsLibraryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const category = (sp.category as ReportCategory | undefined) ?? undefined;
  const sort = sp.sort ?? "default";
  const scope = (SCOPES as readonly string[]).includes(sp.scope ?? "") ? sp.scope! : "all";

  // Pull per-user state so the cards know what's pinned / favorited.
  const userStates = await db.reportUserState.findMany({
    where: { userId: ctx.userId, reportKey: { not: null } },
    select: { reportKey: true, isFavorite: true, isPinned: true, lastViewedAt: true },
  });
  const stateByKey = new Map(
    userStates.map((s) => [s.reportKey!, { isFavorite: s.isFavorite, isPinned: s.isPinned, lastViewedAt: s.lastViewedAt }]),
  );

  let visible: ReportRegistryEntry[] = REPORT_REGISTRY.slice();
  if (q) {
    visible = visible.filter(
      (r) => r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || r.category.includes(q),
    );
  }
  if (category) {
    visible = visible.filter((r) => r.category === category);
  }
  if (scope === "favorites") visible = visible.filter((r) => stateByKey.get(r.key)?.isFavorite);
  if (scope === "pinned")    visible = visible.filter((r) => stateByKey.get(r.key)?.isPinned);
  if (scope === "ready")     visible = visible.filter((r) => r.dataState === "READY");
  if (scope === "pending")   visible = visible.filter((r) => r.dataState === "PENDING");

  if (sort === "az") {
    visible.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sort === "za") {
    visible.sort((a, b) => b.name.localeCompare(a.name));
  } else if (sort === "recent") {
    visible.sort((a, b) => {
      const ax = stateByKey.get(a.key)?.lastViewedAt?.getTime() ?? 0;
      const bx = stateByKey.get(b.key)?.lastViewedAt?.getTime() ?? 0;
      return bx - ax;
    });
  } else {
    // Default sort: pinned first, then favorites, then category order.
    visible.sort((a, b) => {
      const ap = stateByKey.get(a.key);
      const bp = stateByKey.get(b.key);
      if (!!bp?.isPinned !== !!ap?.isPinned) return bp?.isPinned ? 1 : -1;
      if (!!bp?.isFavorite !== !!ap?.isFavorite) return bp?.isFavorite ? 1 : -1;
      return 0;
    });
  }

  const counts = countByCategory();
  const myCount = countByMe();

  function countByCategory(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const r of REPORT_REGISTRY) {
      out[r.category] = (out[r.category] ?? 0) + 1;
    }
    return out;
  }

  function countByMe(): { favorites: number; pinned: number; ready: number; pending: number } {
    return {
      favorites: REPORT_REGISTRY.filter((r) => stateByKey.get(r.key)?.isFavorite).length,
      pinned:    REPORT_REGISTRY.filter((r) => stateByKey.get(r.key)?.isPinned).length,
      ready:     REPORT_REGISTRY.filter((r) => r.dataState === "READY").length,
      pending:   REPORT_REGISTRY.filter((r) => r.dataState === "PENDING").length,
    };
  }

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumb items={[{ label: "Platform", href: "/platform" }, { label: "Reports & Insights" }]} />
        <div className="mt-3">
          <PageHeader
            title="Reports & Insights"
            description="Build, save, and schedule reports across financials, subscriptions, tenants, and operations."
            actions={
              <>
                <Button size="sm" variant="ghost" disabled title="Custom builder lands in a future slice — pre-built reports cover the spec catalog today">
                  + New report
                </Button>
                <Button size="sm" variant="secondary" disabled>Browse templates</Button>
              </>
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
        {/* Left rail */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="space-y-4">
            <Card padding="sm">
              <ul className="flex flex-col gap-1">
                <RailItem label="All reports" count={REPORT_REGISTRY.length} active={!category && scope === "all"} href="/platform/reports" />
                <RailItem label="Favorites"    count={myCount.favorites} active={scope === "favorites"}        href="/platform/reports?scope=favorites" />
                <RailItem label="Pinned"       count={myCount.pinned}    active={scope === "pinned"}           href="/platform/reports?scope=pinned" />
                <RailItem label="Ready"        count={myCount.ready}     active={scope === "ready"}            href="/platform/reports?scope=ready" />
                <RailItem label="Awaiting source" count={myCount.pending} active={scope === "pending"}         href="/platform/reports?scope=pending" />
              </ul>
            </Card>
            <Card padding="sm">
              <div className="px-2 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                Categories
              </div>
              <ul className="flex flex-col gap-1">
                {REPORT_CATEGORIES.map((c) => (
                  <RailItem
                    key={c.id}
                    label={c.label}
                    count={counts[c.id] ?? 0}
                    active={category === c.id}
                    href={`/platform/reports?category=${c.id}`}
                  />
                ))}
              </ul>
            </Card>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex flex-col gap-4">
          <form className="flex flex-wrap items-center gap-2" method="get">
            <div className="min-w-[260px] flex-1">
              <Input name="q" defaultValue={sp.q ?? ""} placeholder="Search reports…" size="sm" />
            </div>
            <select
              name="sort"
              defaultValue={sort}
              className="ts-focus h-8 rounded-md border bg-transparent px-2 text-[13px]"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-default)", color: "var(--text-default)" }}
            >
              <option value="default">Default</option>
              <option value="recent">Recently viewed</option>
              <option value="az">A → Z</option>
              <option value="za">Z → A</option>
            </select>
            {category && <input type="hidden" name="category" value={category} />}
            {scope !== "all" && <input type="hidden" name="scope" value={scope} />}
            <Button type="submit" size="sm" variant="secondary">Apply</Button>
            {(q || category || sort !== "default" || scope !== "all") && (
              <Link href="/platform/reports" className="text-[12px]" style={{ color: "var(--text-muted)" }}>Clear</Link>
            )}
          </form>

          {visible.length === 0 ? (
            <Card padding="lg">
              <EmptyState
                title="No reports match"
                description="Try clearing filters or expanding the search."
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((r) => {
                const state = stateByKey.get(r.key);
                return (
                  <ReportCard key={r.key} entry={r} isFavorite={!!state?.isFavorite} isPinned={!!state?.isPinned} />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RailItem({ label, count, active, href }: { label: string; count: number; active: boolean; href: string }) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors"
        style={{
          background: active ? "var(--surface-2)" : "transparent",
          color: active ? "var(--text-default)" : "var(--text-muted)",
          fontWeight: active ? 600 : 400,
        }}
      >
        <span className="truncate">{label}</span>
        <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--text-faint)" }}>{count}</span>
      </Link>
    </li>
  );
}

function ReportCard({ entry, isFavorite, isPinned }: { entry: ReportRegistryEntry; isFavorite: boolean; isPinned: boolean }) {
  const stateBadge = entry.dataState === "PENDING"
    ? <Badge size="xs" color="warning">Awaiting source</Badge>
    : entry.dataState === "PARTIAL"
    ? <Badge size="xs" color="info">Partial</Badge>
    : <Badge size="xs" color="success">Live</Badge>;

  return (
    <Link href={`/platform/reports/${entry.key}`} className="block h-full">
      <Card elevation="interactive" padding="md" className="flex h-full flex-col">
        <CardHeader
          title={
            <div className="flex items-start gap-2">
              <span aria-hidden style={{ fontSize: 22 }}>{entry.icon}</span>
              <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
                  {entry.name}
                </div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                  {labelForCategory(entry.category)}
                </div>
              </div>
            </div>
          }
          right={
            <div className="flex shrink-0 items-center gap-1">
              {isPinned && <span title="Pinned" aria-label="Pinned">📌</span>}
              {isFavorite && <span title="Favorite" aria-label="Favorite">⭐</span>}
            </div>
          }
        />
        <CardBody>
          <p className="line-clamp-3 text-[12px]" style={{ color: "var(--text-muted)" }}>
            {entry.description}
          </p>
        </CardBody>
        <CardFooter>
          <div className="flex items-center justify-between gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
            <span>{entry.viz.replace(/-/g, " ")}</span>
            {stateBadge}
          </div>
        </CardFooter>
      </Card>
    </Link>
  );
}

function labelForCategory(id: ReportCategory): string {
  return REPORT_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}
