"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

// Small "Updated Ns ago · Refresh" control shown in the dashboard top
// bar. Ticks every 15s so the operator knows when the view is stale.
// Clicking "Refresh" forces a router.refresh() to re-run server
// components and re-query metrics.

function age(ms: number): string {
  if (ms < 15_000) return "just now";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  const hrs = Math.round(ms / 3_600_000);
  return `${hrs}h ago`;
}

export function FreshnessBadge({ computedAt }: { computedAt: Date | string }) {
  const at = React.useMemo(
    () => (computedAt instanceof Date ? computedAt : new Date(computedAt)),
    [computedAt],
  );
  const [, tick] = React.useState(0);
  const router = useRouter();
  const [refreshing, setRefreshing] = React.useState(false);

  React.useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 800);
  };

  const label = age(Date.now() - at.getTime());

  return (
    <div className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{
          background: "var(--success-fg)",
          boxShadow: "0 0 0 3px var(--success-surface)",
        }}
      />
      <span>Updated {label}</span>
      <span style={{ color: "var(--text-faint)" }}>·</span>
      <button
        type="button"
        onClick={handleRefresh}
        disabled={refreshing}
        className="rounded-md px-1.5 py-0.5 text-xs font-medium transition-colors hover:brightness-110 disabled:opacity-50"
        style={{ color: "var(--accent-primary)" }}
      >
        {refreshing ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}
