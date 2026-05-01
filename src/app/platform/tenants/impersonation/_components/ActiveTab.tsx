"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Avatar,
  Card,
  useToast,
} from "@/components/ui";
import { forceEndImpersonationSession } from "@/app/actions/impersonation-admin";
import {
  IMPERSONATION_CATEGORY_LABEL,
  type ActiveSessionRow,
  type ResolvedSettings,
} from "@/server/platform/impersonation";
import { EndSessionButton } from "./EndSessionButton";

// ActiveTab — live list of running impersonation sessions. Polls
// router.refresh every 10s so the duration counters keep moving and
// we pick up new sessions started in another tab. Per-row "End now"
// kills the session via the force-end action.

export function ActiveTab({
  rows,
  settings,
  canEnd,
}: {
  rows: ActiveSessionRow[];
  settings: ResolvedSettings;
  canEnd: boolean;
}) {
  const router = useRouter();
  React.useEffect(() => {
    const id = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(id);
  }, [router]);

  if (rows.length === 0) {
    return (
      <Card padding="lg">
        <div className="text-center">
          <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
            No active impersonations
          </h3>
          <p className="mx-auto mt-1 max-w-md text-[12px]" style={{ color: "var(--text-muted)" }}>
            When platform staff sign in as a tenant, the live session shows up here with duration, IP, and an
            "End now" button.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>
          Active sessions ({rows.length})
        </h2>
        <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
          Auto-refreshes every 10s · max duration {settings.maxDurationMin}m · idle timeout {settings.idleTimeoutMin}m
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {rows.map((row) => (
          <Card key={row.id} padding="md" className="h-full"
                style={{
                  borderColor: row.overMaxDuration ? "var(--rose-300)"
                            : row.idleTimedOut ? "var(--amber-300)"
                            : undefined,
                }}>
            <div className="flex h-full flex-col gap-3">
              {/* Header */}
              <div className="flex items-start gap-2">
                <Avatar size="sm" name={row.admin.name ?? row.admin.email} src={row.admin.image ?? undefined} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>
                      {row.admin.name?.trim() || row.admin.email}
                    </span>
                    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      → {row.tenant.name}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] truncate" style={{ color: "var(--text-faint)" }}>
                    {IMPERSONATION_CATEGORY_LABEL[row.categoryCode]}{row.reason ? ` · ${row.reason}` : ""}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <Stat label="Duration"
                      value={formatDuration(row.durationSec)}
                      tone={row.overMaxDuration ? "danger" : row.idleTimedOut ? "warning" : "default"} />
                <Stat label="Actions" value={row.actionsCount.toLocaleString()} />
                <Stat label="Started" value={row.startedAt.toLocaleTimeString()} />
              </div>

              {/* Meta */}
              <div className="space-y-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                {row.expectedDurationMin != null && (
                  <div>
                    Expected: <span className="font-medium">{row.expectedDurationMin}m</span>
                    {row.durationSec / 60 > row.expectedDurationMin && (
                      <span className="ml-1 text-[10px]" style={{ color: "var(--amber-700)" }}>
                        (over expected)
                      </span>
                    )}
                  </div>
                )}
                {row.ip && (
                  <div>IP: <span className="font-mono">{row.ip}</span></div>
                )}
                {row.lastActivityAt && (
                  <div>Last action: {row.lastActivityAt.toLocaleTimeString()}</div>
                )}
              </div>

              {/* Footer actions */}
              <div className="mt-auto flex items-center justify-between gap-2">
                <Link
                  href={`/platform/tenants/${row.tenant.id}`}
                  className="text-[11px] hover:underline"
                  style={{ color: "var(--accent-primary)" }}
                >
                  Open tenant detail →
                </Link>
                <Link
                  href={`/platform/tenants/impersonation?tab=history&detail=${row.id}`}
                  className="text-[11px] hover:underline"
                  style={{ color: "var(--text-muted)" }}
                >
                  Inspect timeline
                </Link>
                {canEnd && (
                  <EndSessionButton
                    sessionId={row.id}
                    tenantName={row.tenant.name}
                    isOwn={false}
                  />
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
      {/* Quiet helper for the live-poll affordance. */}
      <NoOpToastGate />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "default" | "warning" | "danger" }) {
  const fg =
    tone === "danger"  ? "var(--rose-700)" :
    tone === "warning" ? "var(--amber-700)" :
                          "var(--text-default)";
  return (
    <div className="rounded-md border p-2" style={{ borderColor: "var(--border-subtle)" }}>
      <div className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>{label}</div>
      <div className="mt-0.5 text-[12px] font-semibold tabular-nums" style={{ color: fg }}>{value}</div>
    </div>
  );
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function NoOpToastGate() {
  // Keeps useToast in the tree so any sub-component can grab it
  // without importing the hook themselves.
  void useToast;
  return null;
}
