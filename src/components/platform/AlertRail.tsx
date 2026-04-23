import Link from "next/link";
import type { Alert, AlertSeverity } from "@/server/platform/overview-metrics";

// Horizontal severity-colored pill rail shown above the fold when any
// critical / warning / info alerts are active. Renders nothing when
// alerts are empty — no "all clear" card.
//
// Severity styling:
//   critical → red surface + red fg
//   warning  → amber surface + amber fg
//   info     → blue surface + blue fg

const SEVERITY_ORDER: AlertSeverity[] = ["critical", "warning", "info"];
const SEVERITY_PALETTE: Record<AlertSeverity, { bg: string; fg: string; ring: string }> = {
  critical: { bg: "var(--danger-surface)",  fg: "var(--danger-fg)",  ring: "var(--danger)"  },
  warning:  { bg: "var(--warning-surface)", fg: "var(--warning-fg)", ring: "var(--warning)" },
  info:     { bg: "var(--info-surface)",    fg: "var(--info-fg)",    ring: "var(--info)"    },
};

const SEVERITY_ICON: Record<AlertSeverity, string> = {
  critical: "●",
  warning:  "▲",
  info:     "i",
};

export function AlertRail({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) return null;

  const sorted = [...alerts].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );
  const shown = sorted.slice(0, 6);
  const overflow = sorted.length - shown.length;
  const criticalCount = alerts.filter((a) => a.severity === "critical").length;

  const borderColor = criticalCount > 0 ? "var(--danger)" : "var(--warning)";
  const bgColor = criticalCount > 0 ? "var(--danger-surface)" : "var(--warning-surface)";

  return (
    <section
      aria-label="Platform alerts"
      className="rounded-xl px-4 py-3"
      style={{ background: bgColor, border: `1px solid ${borderColor}` }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: criticalCount > 0 ? "var(--danger-fg)" : "var(--warning-fg)" }}
        >
          Needs attention
        </span>
        <span className="mx-1 text-xs" style={{ color: "var(--text-faint)" }}>·</span>
        {shown.map((a) => {
          const palette = SEVERITY_PALETTE[a.severity];
          return (
            <Link
              key={a.id}
              href={a.href}
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:brightness-110"
              style={{
                background: "var(--surface-1)",
                borderColor: palette.ring,
                color: palette.fg,
              }}
            >
              <span aria-hidden style={{ color: palette.ring }}>{SEVERITY_ICON[a.severity]}</span>
              <span>{a.label}</span>
            </Link>
          );
        })}
        {overflow > 0 && (
          <span
            className="inline-flex items-center rounded-full px-2 py-1 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            +{overflow} more
          </span>
        )}
      </div>
    </section>
  );
}
