import * as React from "react";

// Service status grid for /platform/health.
//
//   ┌── Auth ──────────┬── Email ─────────┬── Stripe billing ─┐
//   │ ● Operational    │ ● Degraded       │ ● Operational     │
//   │ 18 fails / 96 OK │ 92.4% delivered  │ 0 webhook failures│
//   │ 1.4% fail rate   │ 7 bounces 7d     │                    │
//   ├── Storage ───────┼── Background ────┼── Database ────────┤
//   │ ● Operational    │ ● Operational    │ ● Operational      │
//   │ 0 upload errors  │ 2 jobs queued    │ 12ms median        │
//   └──────────────────┴──────────────────┴────────────────────┘
//
// Status is derived from the same observable signals already used by
// the broader health page (no new probes). Each card is purely
// presentational — the page computes status/notes and passes them in.

export type ServiceStatus = "operational" | "degraded" | "down" | "unknown";

export interface ServiceCard {
  /** Stable id, used as key. */
  id: string;
  /** "Auth", "Email", "Stripe billing", etc. */
  name: string;
  /** Color-coded status. */
  status: ServiceStatus;
  /** Headline metric, e.g. "98.4% delivered" or "12ms median". */
  primary: string;
  /** Optional subline explaining the underlying numbers. */
  secondary?: string;
  /** Optional footnote — e.g. "data: derived from EmailEvent". */
  footnote?: string;
}

const STATUS_TONE: Record<ServiceStatus, { bg: string; fg: string; label: string }> = {
  operational: { bg: "var(--success-surface)", fg: "var(--success-fg)",     label: "Operational" },
  degraded:    { bg: "var(--warning-surface)", fg: "var(--warning-fg)",     label: "Degraded"    },
  down:        { bg: "var(--danger-surface)",  fg: "var(--danger-fg)",      label: "Down"        },
  unknown:     { bg: "var(--surface-2)",       fg: "var(--text-muted)",     label: "Unknown"     },
};

export function ServiceStatusGrid({ services }: { services: ServiceCard[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {services.map((s) => (
        <Card key={s.id} service={s} />
      ))}
    </div>
  );
}

function Card({ service }: { service: ServiceCard }) {
  const tone = STATUS_TONE[service.status];
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "var(--surface-1)",
        border: `1px solid ${
          service.status === "operational" ? "var(--border-subtle)" : tone.fg
        }`,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
            {service.name}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs">
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: tone.fg }}
            />
            <span style={{ color: tone.fg, fontWeight: 600 }}>
              {tone.label}
            </span>
          </div>
        </div>
      </div>
      <div className="mt-3 text-xl font-semibold tabular-nums tracking-tight" style={{ color: "var(--text-default)" }}>
        {service.primary}
      </div>
      {service.secondary && (
        <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
          {service.secondary}
        </div>
      )}
      {service.footnote && (
        <div className="mt-2 border-t pt-2 text-[10px]" style={{ color: "var(--text-faint)", borderColor: "var(--border-subtle)" }}>
          {service.footnote}
        </div>
      )}
    </div>
  );
}
