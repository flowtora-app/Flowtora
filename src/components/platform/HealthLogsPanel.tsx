"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Unified log viewer + filter bar for /platform/health. The server
// fetches from three sources (AuditLog, SecurityEvent, EmailEvent
// failures), merges into a single LogEntry[], and passes them in
// here. This component renders the filter chips + search input and
// the timeline. Filtering is client-side (the dataset is capped at
// 50 entries) for snappy UX.

export type LogSource = "ALL" | "AUDIT" | "SECURITY" | "EMAIL";

export interface LogEntry {
  id: string;
  source: Exclude<LogSource, "ALL">;
  /** "platform.tenant_suspended", "LOGIN_FAILED", "send.failed", … */
  action: string;
  /** Pre-formatted summary line, e.g. "Acme Signs · suspended". */
  summary: string;
  /** Optional details: error reason, user email, …*/
  detail?: string;
  /** Severity drives the row dot color. */
  severity: "info" | "warning" | "danger";
  createdAt: string; // ISO — client-side parses
  /** Optional href for "open in detail page". */
  href?: string;
}

const SOURCE_LABEL: Record<Exclude<LogSource, "ALL">, string> = {
  AUDIT:    "Audit",
  SECURITY: "Security",
  EMAIL:    "Email",
};

const SOURCE_TONE: Record<Exclude<LogSource, "ALL">, { bg: string; fg: string }> = {
  AUDIT:    { bg: "var(--accent-surface)",  fg: "var(--accent-primary)" },
  SECURITY: { bg: "var(--warning-surface)", fg: "var(--warning-fg)"     },
  EMAIL:    { bg: "var(--danger-surface)",  fg: "var(--danger-fg)"      },
};

const SEVERITY_COLOR: Record<LogEntry["severity"], string> = {
  info:    "var(--accent-primary)",
  warning: "var(--warning-fg)",
  danger:  "var(--danger-fg)",
};

export function HealthLogsPanel({ entries }: { entries: LogEntry[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const sourceParam = (params.get("logSource") ?? "ALL").toUpperCase();
  const source: LogSource = (["ALL", "AUDIT", "SECURITY", "EMAIL"] as const).includes(
    sourceParam as LogSource,
  )
    ? (sourceParam as LogSource)
    : "ALL";
  const [q, setQ] = React.useState(params.get("logQ") ?? "");

  const onSelectSource = (next: LogSource) => {
    const sp = new URLSearchParams(params.toString());
    if (next === "ALL") sp.delete("logSource");
    else sp.set("logSource", next);
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  // Apply filters client-side. The dataset is capped at 50 entries by
  // the server; that's small enough to filter on each keystroke.
  const filtered = entries.filter((e) => {
    if (source !== "ALL" && e.source !== source) return false;
    if (q) {
      const haystack = `${e.action} ${e.summary} ${e.detail ?? ""}`.toLowerCase();
      if (!haystack.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  // Counts for the chip badges.
  const counts = {
    AUDIT:    entries.filter((e) => e.source === "AUDIT").length,
    SECURITY: entries.filter((e) => e.source === "SECURITY").length,
    EMAIL:    entries.filter((e) => e.source === "EMAIL").length,
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
        className="px-5 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
              Logs &amp; diagnostics
            </h2>
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              Unified feed from audit, security, and email-delivery sources. Latest 50 in window.
            </p>
          </div>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {filtered.length} of {entries.length}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SourceChip
            label="All"
            count={entries.length}
            active={source === "ALL"}
            onClick={() => onSelectSource("ALL")}
          />
          {(["AUDIT", "SECURITY", "EMAIL"] as const).map((src) => (
            <SourceChip
              key={src}
              label={SOURCE_LABEL[src]}
              count={counts[src]}
              tone={SOURCE_TONE[src]}
              active={source === src}
              onClick={() => onSelectSource(src)}
            />
          ))}

          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search action, summary, detail…"
            className="ts-focus ml-auto min-w-[200px] flex-1 rounded-md px-2.5 py-1.5 text-xs outline-none"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
              color: "var(--text-default)",
            }}
          />
        </div>
      </header>

      {filtered.length === 0 ? (
        <div
          className="px-5 py-10 text-center text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          {entries.length === 0 ? "No log entries in the active window." : "No entries match the current filter."}
        </div>
      ) : (
        <ol className="px-5 py-4">
          {filtered.map((e, idx) => (
            <LogRow key={e.id} entry={e} isLast={idx === filtered.length - 1} />
          ))}
        </ol>
      )}
    </section>
  );
}

function SourceChip({
  label,
  count,
  tone,
  active,
  onClick,
}: {
  label: string;
  count: number;
  tone?: { bg: string; fg: string };
  active: boolean;
  onClick: () => void;
}) {
  const idleFg = tone?.fg ?? "var(--text-default)";
  return (
    <button
      type="button"
      onClick={onClick}
      className="ts-focus inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
      style={{
        background: active ? "var(--accent-primary)" : "var(--surface-1)",
        color:      active ? "var(--accent-fg)"      : idleFg,
        border: `1px solid ${active ? "var(--accent-primary)" : "var(--border-default)"}`,
      }}
    >
      {label}
      <span
        className="rounded-full px-1.5 py-0.5 text-[10px] tabular-nums"
        style={{
          background: active ? "rgba(0,0,0,0.18)" : "var(--surface-2)",
          color:      active ? "var(--accent-fg)" : "var(--text-muted)",
        }}
      >
        {count}
      </span>
    </button>
  );
}

function LogRow({ entry, isLast }: { entry: LogEntry; isLast: boolean }) {
  const sourceTone = SOURCE_TONE[entry.source];
  return (
    <li
      className="grid grid-cols-[16px_1fr] gap-3 py-2.5"
    >
      <div className="relative flex flex-col items-center">
        <span
          aria-hidden
          className="z-[1] mt-1.5 inline-block h-2.5 w-2.5 rounded-full"
          style={{ background: SEVERITY_COLOR[entry.severity] }}
        />
        {!isLast && (
          <span
            aria-hidden
            className="absolute top-3 h-full w-px"
            style={{ background: "var(--border-subtle)" }}
          />
        )}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-2 text-xs">
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{ background: sourceTone.bg, color: sourceTone.fg }}
          >
            {SOURCE_LABEL[entry.source]}
          </span>
          <span
            className="font-mono"
            style={{ color: "var(--text-default)", fontWeight: 500 }}
          >
            {entry.action}
          </span>
          <span className="ml-auto whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
            {ageLabel(new Date(entry.createdAt))}
          </span>
        </div>
        <div className="mt-0.5 text-sm" style={{ color: "var(--text-default)" }}>
          {entry.summary}
        </div>
        {entry.detail && (
          <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
            {entry.detail}
          </div>
        )}
      </div>
    </li>
  );
}

function ageLabel(d: Date): string {
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
