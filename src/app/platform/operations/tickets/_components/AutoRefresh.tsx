"use client";

// Page 33 — real-time refresh + collision indicator.
//
// True WebSockets would need infrastructure we don't have yet, so we
// approximate with a 10s polling refresh that calls router.refresh()
// — Next.js then re-runs the server component tree against the same
// URL, so KPIs / charts / queue rows pick up new data without a hard
// reload. The toggle persists to localStorage so admins can pause it.

import * as React from "react";
import { useRouter } from "next/navigation";

const STORAGE_KEY = "flowtora.tickets.live";
const TICK_MS = 10_000;

export function AutoRefresh() {
  const router = useRouter();
  const [live, setLive] = React.useState(false);
  const [hydrated, setHydrated] = React.useState(false);
  const [lastTick, setLastTick] = React.useState<Date | null>(null);

  // Hydrate from localStorage on mount.
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      setLive(stored === "1");
    } catch {
      // localStorage may be unavailable (private mode, SSR, etc.)
    }
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      router.refresh();
      setLastTick(new Date());
    }, TICK_MS);
    return () => clearInterval(id);
  }, [live, router]);

  const toggle = () => {
    const next = !live;
    setLive(next);
    try { localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch { /* noop */ }
    if (next) {
      router.refresh();
      setLastTick(new Date());
    }
  };

  if (!hydrated) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px]"
        style={{
          background: "var(--surface-1)",
          color: "var(--text-muted)",
          border: "1px solid var(--border-default)",
        }}
        aria-hidden
      >
        Live
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="ts-focus inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium transition-colors"
      style={{
        background: live ? "var(--success-surface)" : "var(--surface-1)",
        color: live ? "var(--success-fg)" : "var(--text-default)",
        border: `1px solid ${live ? "var(--emerald-200, var(--border-default))" : "var(--border-default)"}`,
      }}
      title={live ? `Live updates every ${TICK_MS / 1000}s` : "Click to enable live updates"}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{
          background: live ? "var(--success-fg)" : "var(--text-faint)",
          animation: live ? "ts-pulse 1.4s ease-in-out infinite" : undefined,
        }}
      />
      {live ? "Live" : "Paused"}
      {live && lastTick && (
        <span style={{ color: "var(--text-faint)" }}>
          · {lastTick.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      )}
      <style jsx>{`
        @keyframes ts-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.5; transform: scale(1.4); }
        }
      `}</style>
    </button>
  );
}
