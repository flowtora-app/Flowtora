import * as React from "react";
import { Skeleton, SkeletonText } from "./Skeleton";

// Phase 18 Slice D — reusable loading.tsx layouts.
//
// Next's `loading.tsx` files are the cleanest place to show a skeleton
// during route transitions. These helpers give each kind of page
// (list view, detail view, dashboard, form) a shape that roughly
// matches what's about to render — so users see structure, not a
// blank panel.

/** Page header stub: a title skeleton + a couple of action-button stubs. */
export function PageHeaderSkeleton({ actions = 1 }: { actions?: number }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="flex items-center gap-2">
        {Array.from({ length: actions }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-28" rounded="md" />
        ))}
      </div>
    </div>
  );
}

/** List view: header + filter bar + row skeletons inside a card. */
export function ListPageSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton actions={2} />
      <div
        className="rounded-lg p-4"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
      >
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div
        className="divide-y rounded-lg"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
          borderColor: "var(--border-subtle)",
        }}
      >
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="h-9 w-9" rounded="full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="mt-2 h-3 w-64" />
            </div>
            <Skeleton className="h-6 w-20" rounded="pill" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Detail view: header + tabs stub + 2-col body (main + side). */
export function DetailPageSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton actions={3} />
      <div className="flex gap-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div
            className="rounded-lg p-5"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <Skeleton className="h-5 w-40" />
            <div className="mt-4">
              <SkeletonText lines={4} />
            </div>
          </div>
          <div
            className="rounded-lg p-5"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <Skeleton className="h-5 w-40" />
            <div className="mt-4">
              <SkeletonText lines={6} />
            </div>
          </div>
        </div>
        <aside className="space-y-4">
          <div
            className="rounded-lg p-5"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <Skeleton className="h-4 w-24" />
            <div className="mt-3 space-y-2">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Dashboard: 4 KPI tiles + two chart/list cards. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton actions={1} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg p-5"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-8 w-28" />
            <Skeleton className="mt-2 h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg p-5"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <Skeleton className="h-5 w-40" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8" rounded="full" />
                  <div className="flex-1">
                    <Skeleton className="h-3 w-40" />
                    <Skeleton className="mt-1.5 h-3 w-24" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Form page: header + a tall card with labeled field rows. */
export function FormPageSkeleton({ fields = 6 }: { fields?: number }) {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton actions={2} />
      <div
        className="rounded-lg p-6"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
      >
        <div className="space-y-5">
          {Array.from({ length: fields }).map((_, i) => (
            <div key={i}>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2 h-10 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
