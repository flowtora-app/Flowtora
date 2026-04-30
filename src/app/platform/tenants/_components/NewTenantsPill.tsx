"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

// "X new tenants" pill — polls /api/platform/tenants/recent every
// 30s. When new tenants land we show the pill; clicking it triggers a
// router.refresh() so the table prepends them server-side. The pill
// is tiny on purpose — admins tend to leave the page open all day,
// and a more intrusive "new row appearing" animation would be noisier
// than useful.

const POLL_MS_BASE = 30_000;
const POLL_MS_MAX  = 120_000;

export function NewTenantsPill({
  initialMostRecentIso,
}: {
  /** ISO of the most-recent tenant.createdAt at server-render time.
   *  Polling asks for tenants created strictly after this. */
  initialMostRecentIso: string | null;
}) {
  const router = useRouter();
  const [count, setCount] = React.useState(0);
  const [names, setNames] = React.useState<string[]>([]);
  const sinceRef = React.useRef<string | null>(initialMostRecentIso);

  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let consecutiveErrors = 0;

    const nextDelay = () => {
      if (consecutiveErrors === 0) return POLL_MS_BASE;
      const factor = Math.min(8, 2 ** consecutiveErrors);
      return Math.min(POLL_MS_MAX, POLL_MS_BASE * factor);
    };

    const tick = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) {
        timer = setTimeout(tick, nextDelay());
        return;
      }
      const since = sinceRef.current;
      if (!since) {
        timer = setTimeout(tick, nextDelay());
        return;
      }
      try {
        const res = await fetch(`/api/platform/tenants/recent?since=${encodeURIComponent(since)}`, { cache: "no-store" });
        if (!res.ok) throw new Error("poll failed");
        const data = (await res.json()) as { count: number; names: string[]; newestCreatedAt: string | null };
        consecutiveErrors = 0;
        if (cancelled) return;
        if (data.count > 0) {
          setCount(data.count);
          setNames(data.names);
        }
      } catch {
        consecutiveErrors += 1;
      } finally {
        if (!cancelled) timer = setTimeout(tick, nextDelay());
      }
    };

    timer = setTimeout(tick, POLL_MS_BASE);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (count === 0) return null;

  return (
    <button
      type="button"
      onClick={() => {
        // Move the watermark forward so the pill doesn't reappear
        // immediately after refresh.
        sinceRef.current = new Date().toISOString();
        setCount(0);
        setNames([]);
        router.refresh();
      }}
      className="ts-focus inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold animate-pulse"
      style={{ background: "var(--brand-600)", color: "white" }}
      title={names.length > 0 ? `New: ${names.slice(0, 3).join(", ")}${names.length > 3 ? `… +${names.length - 3}` : ""}` : undefined}
      aria-label={`${count} new tenants since you opened this page`}
    >
      ↑ {count} new {count === 1 ? "tenant" : "tenants"} · click to refresh
    </button>
  );
}
