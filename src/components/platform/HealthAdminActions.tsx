"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { endAllActiveImpersonations } from "@/app/actions/platform";

// Admin actions panel for /platform/health.
//
// Three buttons + a live-refresh toggle:
//
//   • End all active impersonations  — bulk kill switch, audit-logged
//   • Refresh now                    — router.refresh() to re-query
//   • Open critical announcement     — link to the announcements
//                                       composer with priority pre-set
//
// The auto-refresh toggle ticks router.refresh() every 30s so the
// page reflects current health without needing a manual reload. Off
// by default; the user opts in.

interface HealthAdminActionsProps {
  /** Number of currently-active impersonations. Drives the End-All button label. */
  activeImpersonationCount: number;
  /** True when the viewer is platformAdmin (canWrite). */
  canMutate: boolean;
}

export function HealthAdminActions({
  activeImpersonationCount,
  canMutate,
}: HealthAdminActionsProps) {
  const router = useRouter();
  const [autoRefresh, setAutoRefresh] = React.useState(false);
  const [refreshingAt, setRefreshingAt] = React.useState<Date | null>(null);

  // Tick a router.refresh every 30s when autoRefresh is on.
  React.useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      setRefreshingAt(new Date());
      router.refresh();
    }, 30_000);
    return () => clearInterval(id);
  }, [autoRefresh, router]);

  const onManualRefresh = () => {
    setRefreshingAt(new Date());
    router.refresh();
  };

  return (
    <section
      className="overflow-hidden rounded-xl"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <header
        className="flex items-baseline justify-between gap-3 px-5 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
            Admin actions
          </h2>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
            Levers for incident response. Kill-switches are audit-logged.
          </p>
        </div>
        <label
          className="ts-focus inline-flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1 text-xs"
          style={{
            background: autoRefresh ? "var(--accent-surface)" : "var(--surface-2)",
            color:      autoRefresh ? "var(--accent-primary)" : "var(--text-muted)",
            border: `1px solid ${autoRefresh ? "var(--accent-primary)" : "var(--border-default)"}`,
          }}
        >
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="h-3 w-3"
          />
          {autoRefresh ? "Live (30s)" : "Live off"}
          {refreshingAt && (
            <span className="hidden md:inline" style={{ color: "var(--text-muted)" }}>
              · last {refreshingAt.toLocaleTimeString()}
            </span>
          )}
        </label>
      </header>

      <div className="grid gap-3 p-5 md:grid-cols-3">
        {/* End all impersonations */}
        <form action={endAllActiveImpersonations}>
          <ActionTile
            tone="danger"
            disabled={!canMutate || activeImpersonationCount === 0}
            title="End all impersonations"
            body={
              activeImpersonationCount === 0
                ? "No active sessions"
                : `${activeImpersonationCount} active session${activeImpersonationCount === 1 ? "" : "s"}`
            }
            cta="End all now"
            type="submit"
            tooltip={!canMutate
              ? "Requires admin role"
              : activeImpersonationCount === 0
              ? "Nothing to end"
              : "Closes every open ImpersonationSession and audits each one"}
          />
        </form>

        {/* Manual refresh */}
        <ActionTile
          tone="accent"
          title="Refresh health data"
          body="Re-query every metric on this page."
          cta={refreshingAt ? "Refresh again" : "Refresh now"}
          onClick={onManualRefresh}
          tooltip="Triggers a server re-render of the page"
        />

        {/* Publish critical announcement */}
        <Link href="/platform/announcements" className="block">
          <ActionTile
            tone="warning"
            title="Open critical announcement"
            body="Notify every tenant via in-app banner + email."
            cta="Compose →"
            asLink
            tooltip="Goes to /platform/announcements"
          />
        </Link>
      </div>
    </section>
  );
}

function ActionTile({
  tone,
  title,
  body,
  cta,
  onClick,
  type,
  disabled,
  asLink,
  tooltip,
}: {
  tone: "accent" | "warning" | "danger";
  title: string;
  body: string;
  cta: string;
  onClick?: () => void;
  type?: "submit" | "button";
  disabled?: boolean;
  asLink?: boolean;
  tooltip?: string;
}) {
  const palette =
    tone === "accent"  ? { fg: "var(--accent-primary)", bg: "var(--accent-surface)"  } :
    tone === "warning" ? { fg: "var(--warning-fg)",     bg: "var(--warning-surface)" } :
                          { fg: "var(--danger-fg)",      bg: "var(--danger-surface)"  };

  // The "asLink" path is a div nested inside <Link> — no button wrapper.
  if (asLink) {
    return (
      <div
        className="rounded-lg p-4 transition-colors hover:opacity-90"
        style={{
          background: palette.bg,
          border: `1px solid ${palette.fg}`,
          cursor: "pointer",
        }}
        title={tooltip}
      >
        <div className="text-sm font-semibold" style={{ color: palette.fg }}>{title}</div>
        <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{body}</div>
        <div className="mt-3 text-xs font-semibold" style={{ color: palette.fg }}>{cta}</div>
      </div>
    );
  }

  return (
    <button
      type={type ?? "button"}
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
      className="ts-focus block w-full rounded-lg p-4 text-left transition-colors disabled:opacity-50"
      style={{
        background: palette.bg,
        border: `1px solid ${palette.fg}`,
      }}
    >
      <div className="text-sm font-semibold" style={{ color: palette.fg }}>{title}</div>
      <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{body}</div>
      <div className="mt-3 text-xs font-semibold" style={{ color: palette.fg }}>{cta}</div>
    </button>
  );
}
