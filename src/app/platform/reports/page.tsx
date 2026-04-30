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
import { ReportThumbnail } from "./_components/ReportThumbnail";
import { ReportCardMenu } from "./_components/ReportCardMenu";

export const dynamic = "force-dynamic";

// /platform/reports — Reports & Insights library (Page 3 §Library view).
//
// Two-column layout: left rail = categories with counts, main area =
// search + sort + filter + grid of report cards. Cards include
// prebuilt registry entries AND custom (saved/forked) reports.
//
// URL params:
//   ?q=… — search
//   ?category=<id> — filter to category
//   ?scope=all|favorites|pinned|ready|pending|mine|team|templates
//   ?sort=default|recent|az|za|created|viewed
//   ?owner=<userId> — filter custom reports by owner

type SearchParams = {
  q?: string;
  category?: string;
  sort?: string;
  scope?: string;
  owner?: string;
};

const SCOPES = ["all", "favorites", "pinned", "ready", "pending", "mine", "team", "templates"] as const;

interface RowItem {
  // Either prebuilt OR custom — `key` set means prebuilt, `id` set
  // means custom DB row. Both can coexist if a user forked a prebuilt.
  key?: string;
  id?: string;
  name: string;
  description: string;
  category: ReportRegistryEntry["category"];
  viz: ReportRegistryEntry["viz"];
  dataState: ReportRegistryEntry["dataState"];
  icon: string;
  href: string;
  isFavorite: boolean;
  isPinned: boolean;
  isShared?: boolean;
  ownedByMe?: boolean;
  ownerName?: string | null;
  lastViewedAt?: Date | null;
  viewCount: number;
  createdAt?: Date | null;
}

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
  const ownerFilter = (sp.owner ?? "").trim() || null;

  // Pull per-user state + custom reports + their authors in parallel.
  const [userStates, customReports] = await Promise.all([
    db.reportUserState.findMany({
      where: { userId: ctx.userId },
      select: { reportKey: true, reportId: true, isFavorite: true, isPinned: true, lastViewedAt: true, viewCount: true },
    }),
    db.report.findMany({
      where: {
        OR: [{ ownerUserId: ctx.userId }, { isShared: true }],
      },
      select: {
        id: true, key: true, name: true, description: true, category: true, isShared: true,
        ownerUserId: true, createdAt: true, updatedAt: true,
        owner: { select: { name: true, email: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  // Index user states by both key + id for cheap lookup later.
  const stateByKey = new Map<string, typeof userStates[number]>();
  const stateById  = new Map<string, typeof userStates[number]>();
  for (const s of userStates) {
    if (s.reportKey) stateByKey.set(s.reportKey, s);
    if (s.reportId)  stateById.set(s.reportId, s);
  }

  // Build the unified RowItem list.
  const items: RowItem[] = [
    ...REPORT_REGISTRY.map<RowItem>((r) => {
      const s = stateByKey.get(r.key);
      return {
        key: r.key,
        name: r.name,
        description: r.description,
        category: r.category,
        viz: r.viz,
        dataState: r.dataState,
        icon: r.icon,
        href: `/platform/reports/${r.key}`,
        isFavorite: !!s?.isFavorite,
        isPinned: !!s?.isPinned,
        ownedByMe: false,
        viewCount: s?.viewCount ?? 0,
        lastViewedAt: s?.lastViewedAt ?? null,
        createdAt: null,
      };
    }),
    ...customReports.map<RowItem>((r) => {
      const registry = r.key ? REPORT_REGISTRY.find((x) => x.key === r.key) : undefined;
      const s = stateById.get(r.id);
      return {
        id: r.id,
        name: r.name,
        description: r.description ?? registry?.description ?? "",
        category: (r.category as ReportCategory) ?? registry?.category ?? "operations",
        viz: registry?.viz ?? "table-only",
        dataState: registry?.dataState ?? "READY",
        icon: registry?.icon ?? "🧾",
        href: `/platform/reports/r/${r.id}`,
        isFavorite: !!s?.isFavorite,
        isPinned: !!s?.isPinned,
        isShared: r.isShared,
        ownedByMe: r.ownerUserId === ctx.userId,
        ownerName: r.owner?.name ?? r.owner?.email ?? null,
        viewCount: s?.viewCount ?? 0,
        lastViewedAt: s?.lastViewedAt ?? null,
        createdAt: r.createdAt,
      };
    }),
  ];

  // Apply search + category + scope filters.
  let visible = items.slice();
  if (q) {
    visible = visible.filter(
      (r) => r.name.toLowerCase().includes(q) ||
             r.description.toLowerCase().includes(q) ||
             r.category.includes(q),
    );
  }
  if (category) visible = visible.filter((r) => r.category === category);
  if (scope === "favorites")  visible = visible.filter((r) => r.isFavorite);
  if (scope === "pinned")     visible = visible.filter((r) => r.isPinned);
  if (scope === "ready")      visible = visible.filter((r) => r.dataState === "READY");
  if (scope === "pending")    visible = visible.filter((r) => r.dataState === "PENDING");
  if (scope === "mine")       visible = visible.filter((r) => r.ownedByMe);
  if (scope === "team")       visible = visible.filter((r) => r.isShared && !r.ownedByMe);
  if (scope === "templates")  visible = visible.filter((r) => !!r.key); // prebuilts only
  if (ownerFilter)            visible = visible.filter((r) => r.ownerName === ownerFilter);

  // Sort.
  if (sort === "az")           visible.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === "za")      visible.sort((a, b) => b.name.localeCompare(a.name));
  else if (sort === "recent")  visible.sort((a, b) => (b.lastViewedAt?.getTime() ?? 0) - (a.lastViewedAt?.getTime() ?? 0));
  else if (sort === "viewed")  visible.sort((a, b) => b.viewCount - a.viewCount);
  else if (sort === "created") visible.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  else {
    // Default: pinned → favorites → custom → prebuilt (stable)
    visible.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      if ((!!a.id) !== (!!b.id)) return a.id ? -1 : 1;
      return 0;
    });
  }

  // Counts for the rail.
  const counts = {
    all:       items.length,
    mine:      items.filter((r) => r.ownedByMe).length,
    team:      items.filter((r) => r.isShared && !r.ownedByMe).length,
    templates: REPORT_REGISTRY.length,
    favorites: items.filter((r) => r.isFavorite).length,
    pinned:    items.filter((r) => r.isPinned).length,
    ready:     items.filter((r) => r.dataState === "READY").length,
    pending:   items.filter((r) => r.dataState === "PENDING").length,
  };
  const categoryCounts: Record<string, number> = {};
  for (const r of items) categoryCounts[r.category] = (categoryCounts[r.category] ?? 0) + 1;

  // Distinct owners (for the owner filter dropdown). Only owners
  // visible to this user (their own + shared report owners).
  const ownerNames = Array.from(new Set(items.filter((r) => r.ownerName).map((r) => r.ownerName!)));

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
                <Link href="/platform/reports/new">
                  <Button size="sm">+ New report</Button>
                </Link>
                <Link href="/platform/reports?scope=templates">
                  <Button size="sm" variant="secondary">Browse templates</Button>
                </Link>
                <Link href="/platform/reports/schedules">
                  <Button size="sm" variant="ghost">Scheduled reports</Button>
                </Link>
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
                <RailItem label="All reports"   count={counts.all}        active={!category && scope === "all" && !ownerFilter} href="/platform/reports" />
                <RailItem label="My reports"    count={counts.mine}       active={scope === "mine"}      href="/platform/reports?scope=mine" />
                <RailItem label="Team reports"  count={counts.team}       active={scope === "team"}      href="/platform/reports?scope=team" />
                <RailItem label="Templates"     count={counts.templates}  active={scope === "templates"} href="/platform/reports?scope=templates" />
                <RailItem label="Favorites"     count={counts.favorites}  active={scope === "favorites"} href="/platform/reports?scope=favorites" />
                <RailItem label="Pinned"        count={counts.pinned}     active={scope === "pinned"}    href="/platform/reports?scope=pinned" />
                <RailItem label="Ready"         count={counts.ready}      active={scope === "ready"}     href="/platform/reports?scope=ready" />
                <RailItem label="Awaiting source" count={counts.pending}  active={scope === "pending"}   href="/platform/reports?scope=pending" />
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
                    count={categoryCounts[c.id] ?? 0}
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
              <option value="viewed">Most viewed</option>
              <option value="created">Recently created</option>
              <option value="az">A → Z</option>
              <option value="za">Z → A</option>
            </select>
            {ownerNames.length > 0 && (
              <select
                name="owner"
                defaultValue={ownerFilter ?? ""}
                className="ts-focus h-8 rounded-md border bg-transparent px-2 text-[13px]"
                style={{ background: "var(--surface-1)", borderColor: "var(--border-default)", color: "var(--text-default)" }}
              >
                <option value="">All owners</option>
                {ownerNames.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            )}
            {category && <input type="hidden" name="category" value={category} />}
            {scope !== "all" && <input type="hidden" name="scope" value={scope} />}
            <Button type="submit" size="sm" variant="secondary">Apply</Button>
            {(q || category || sort !== "default" || scope !== "all" || ownerFilter) && (
              <Link href="/platform/reports" className="text-[12px]" style={{ color: "var(--text-muted)" }}>Clear</Link>
            )}
          </form>

          {visible.length === 0 ? (
            <Card padding="lg">
              <EmptyState
                title={scope === "templates" ? "No templates match" : scope === "mine" ? "You haven't authored any reports yet" : "No reports match"}
                description={scope === "mine"
                  ? <span>Click <strong>+ New report</strong> or <strong>Duplicate</strong> on a template to fork it into your library.</span>
                  : "Try clearing filters or expanding the search."}
                action={scope === "mine"
                  ? <Link href="/platform/reports/new"><Button size="sm">+ New report</Button></Link>
                  : undefined}
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((r) => (
                <ReportCard key={r.id ?? r.key!} entry={r} />
              ))}
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

function ReportCard({ entry }: { entry: RowItem }) {
  const stateBadge = entry.dataState === "PENDING"
    ? <Badge size="xs" color="warning">Awaiting source</Badge>
    : entry.dataState === "PARTIAL"
    ? <Badge size="xs" color="info">Partial</Badge>
    : <Badge size="xs" color="success">Live</Badge>;

  return (
    <div className="relative h-full">
      <Link href={entry.href} className="block h-full">
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
                    {entry.id ? " · custom" : " · template"}
                  </div>
                </div>
              </div>
            }
            right={
              <div className="flex shrink-0 items-center gap-1">
                {entry.isPinned && <span title="Pinned" aria-label="Pinned">📌</span>}
                {entry.isFavorite && <span title="Favorite" aria-label="Favorite">⭐</span>}
              </div>
            }
          />
          <CardBody>
            <ReportThumbnail viz={entry.viz} className="mb-2" />
            <p className="line-clamp-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
              {entry.description}
            </p>
          </CardBody>
          <CardFooter>
            <div className="flex w-full items-center justify-between gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
              <div className="flex items-center gap-1.5 truncate">
                {entry.ownerName ? (
                  <>
                    <Avatar size="xs" name={entry.ownerName} />
                    <span className="truncate">{entry.ownerName}</span>
                    {entry.isShared && <Badge size="xs" color="info">Team</Badge>}
                  </>
                ) : (
                  <span>{entry.viz.replace(/-/g, " ")}</span>
                )}
              </div>
              {stateBadge}
            </div>
          </CardFooter>
        </Card>
      </Link>
      <div className="absolute right-2 top-2">
        <ReportCardMenu
          reportKey={entry.key}
          reportId={entry.id}
          reportName={entry.name}
          isCustomOwnedByMe={entry.ownedByMe}
          isShared={entry.isShared}
          scheduleEnabled={entry.dataState !== "PENDING"}
        />
      </div>
    </div>
  );
}

function labelForCategory(id: ReportCategory): string {
  return REPORT_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}
