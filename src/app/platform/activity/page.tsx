import { Suspense } from "react";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import {
  Breadcrumb,
  Button,
  Card,
  PageHeader,
  Skeleton,
} from "@/components/ui";
import {
  loadActivityPage,
  loadEventsPerMinute,
  parseActivityFilters,
  serializeActivityFilters,
  QUICK_PRESETS,
  resolvePresetFilters,
  type ActivityFilters,
} from "@/server/platform/activity-feed";
import { ActivityFeedClient } from "./_components/ActivityFeedClient";
import { ActivityFilters as ActivityFiltersForm } from "./_components/ActivityFilters";
import { ActivityRightRail, type SavedViewItem, type SubscriptionItem } from "./_components/ActivityRightRail";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

// Page 2 — Activity Feed (docs/flowtora-admin-spec.md §Page 2).
//
// Server component owns: auth, initial-page fetch, filter parsing,
// combobox option lookups, saved views + subscriptions for the
// right rail. The client owns: live polling, infinite scroll,
// JSON expand, grouping, debounced filter UI, modals.

export default async function ActivityFeedPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const filters = parseActivityFilters(sp);
  const filterQs = serializeActivityFilters(filters);

  return (
    <div className="space-y-6">
      <Header filterQs={filterQs} />

      <Suspense fallback={<FiltersSkeleton />}>
        <FiltersBlock filters={filters} />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <Suspense fallback={<FeedSkeleton />}>
          <FeedBlock filters={filters} filterQs={filterQs} />
        </Suspense>
        <Suspense fallback={<RailSkeleton />}>
          <RailBlock filters={filters} filterQs={filterQs} userId={ctx.userId} userEmail={ctx.email} />
        </Suspense>
      </div>
    </div>
  );
}

/* ── Header ────────────────────────────────────────────── */

function Header({ filterQs }: { filterQs: string }) {
  const exportUrl = `/api/platform/activity/export?${filterQs}&format=csv`;
  return (
    <div>
      <Breadcrumb
        items={[
          { label: "Platform", href: "/platform" },
          { label: "Activity" },
        ]}
      />
      <div className="mt-3">
        <PageHeader
          eyebrow="Live stream"
          title="Activity feed"
          description="Live event stream across every tenant and every platform action — append-only, never edited."
          actions={
            <>
              <Link href={exportUrl}>
                <Button size="sm" variant="secondary">Export CSV</Button>
              </Link>
              <Link href={`/api/platform/activity/export?${filterQs}&format=json`}>
                <Button size="sm" variant="ghost">Export JSON</Button>
              </Link>
            </>
          }
        />
      </div>
    </div>
  );
}

/* ── Filters block ─────────────────────────────────────── */

async function FiltersBlock({ filters }: { filters: ActivityFilters }) {
  // Pull combobox options server-side so the dropdowns are populated
  // on first paint.
  const [tenants, users] = await Promise.all([
    db.tenant.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
      take: 200,
    }),
    db.user.findMany({
      where: { OR: [{ platformRole: { not: null } }, { customPlatformRoleId: { not: null } }] },
      orderBy: { email: "asc" },
      select: { id: true, name: true, email: true },
      take: 100,
    }),
  ]);

  return (
    <Card padding="md">
      <ActivityFiltersForm
        initial={{
          q: filters.q,
          types: filters.types,
          severities: filters.severities,
          sources: filters.sources,
          tenantIds: filters.tenantIds,
          userIds: filters.userIds,
          since: filters.since?.toISOString(),
          until: filters.until?.toISOString(),
          ip: filters.ip,
          country: filters.country,
        }}
        tenants={tenants}
        users={users}
      />
    </Card>
  );
}

/* ── Feed block ────────────────────────────────────────── */

async function FeedBlock({ filters, filterQs }: { filters: ActivityFilters; filterQs: string }) {
  const initialRows = await loadActivityPage({ filters, take: 50 });
  const cursor = initialRows.length === 50 ? initialRows[initialRows.length - 1]!.createdAtIso : null;

  return (
    <Card padding="none" className="overflow-hidden">
      <ActivityFeedClient
        initialRows={initialRows}
        filterQs={filterQs}
        initialCursor={cursor}
      />
    </Card>
  );
}

/* ── Right rail ─────────────────────────────────────────── */

async function RailBlock({ filters, filterQs, userId, userEmail }: { filters: ActivityFilters; filterQs: string; userId: string; userEmail: string }) {
  const [spark, savedViews, subscriptions] = await Promise.all([
    loadEventsPerMinute(filters),
    db.platformSavedView.findMany({
      where: {
        kind: "activity",
        OR: [{ userId }, { isShared: true }],
      },
      orderBy: [{ isShared: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
      take: 30,
      select: {
        id: true, name: true, filters: true, isShared: true, userId: true,
        user: { select: { name: true, email: true } },
      },
    }),
    db.activitySubscription.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true, name: true, filters: true, email: true, frequency: true, pausedAt: true, lastDeliveredAt: true,
      },
    }),
  ]);

  const savedItems: SavedViewItem[] = savedViews.map((v) => ({
    id: v.id,
    name: v.name,
    filters: v.filters,
    isShared: v.isShared,
    ownedByMe: v.userId === userId,
    ownerName: v.user?.name ?? v.user?.email ?? null,
  }));

  const subItems: SubscriptionItem[] = subscriptions.map((s) => ({
    id: s.id,
    name: s.name,
    filters: s.filters,
    email: s.email,
    frequency: s.frequency,
    paused: !!s.pausedAt,
    lastDeliveredAt: s.lastDeliveredAt?.toISOString() ?? null,
  }));

  const presets = QUICK_PRESETS.map((p) => {
    const resolved = resolvePresetFilters(p.filters, p.id);
    return { id: p.id, label: p.label, href: `/platform/activity?${serializeActivityFilters(resolved)}` };
  });

  return (
    <ActivityRightRail
      filterQs={filterQs}
      presets={presets}
      spark60m={spark}
      savedViews={savedItems}
      subscriptions={subItems}
      defaultEmail={userEmail}
    />
  );
}

/* ── Skeletons ─────────────────────────────────────────── */

function FiltersSkeleton() {
  return <Skeleton className="h-32 w-full rounded-lg" />;
}
function FeedSkeleton() {
  return <Skeleton className="h-[600px] w-full rounded-lg" />;
}
function RailSkeleton() {
  return (
    <div className="space-y-4">
      {[160, 120, 200, 200].map((h, i) => (
        <Skeleton key={i} className="w-full rounded-lg" style={{ height: h }} />
      ))}
    </div>
  );
}
