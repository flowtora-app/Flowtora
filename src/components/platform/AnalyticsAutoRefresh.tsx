"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

// Tiny client component that re-fetches the parent server component
// every N seconds via router.refresh(). Sits inside the analytics
// page and lets the (server-rendered) live map + live count stay
// fresh without WebSockets or polling endpoints.

export function AnalyticsAutoRefresh({ intervalMs = 15_000 }: { intervalMs?: number }) {
  const router = useRouter();
  React.useEffect(() => {
    const id = window.setInterval(() => router.refresh(), intervalMs);
    return () => window.clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
