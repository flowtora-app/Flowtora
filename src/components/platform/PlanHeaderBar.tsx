import * as React from "react";
import Link from "next/link";

// Header bar for the plan detail page.
//
//   Plans / acme-pro
//   ─────────────────────────────────────────────────────────────
//   Acme Pro                 [Publish] [Archive] [⋯]
//   acme-pro · ●Published   highlighted   17 tenants   3 versions
//
// The catalog → detail breadcrumb sits above the title; chips
// describe state at a glance; quick actions dock right.

type ChipTone = "default" | "accent" | "success" | "warning" | "danger" | "neutral";

interface Chip {
  label: string;
  tone: ChipTone;
  dot?: boolean;
  title?: string;
}

interface PlanHeaderBarProps {
  name: string;
  slug: string;
  /** Optional badge from the plan record, e.g. "Most popular". */
  badge?: string | null;
  highlighted: boolean;
  chips: Chip[];
  subline?: string;
  /** Right-aligned cluster of <form><button/></form> blocks. */
  actions?: React.ReactNode;
}

export function PlanHeaderBar({
  name,
  slug,
  badge,
  highlighted,
  chips,
  subline,
  actions,
}: PlanHeaderBarProps) {
  return (
    <header className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            <Link href="/platform/plans" className="hover:underline">
              Plans
            </Link>
            <span className="mx-1.5">/</span>
            <span>{slug}</span>
          </div>
          <h1
            className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight"
            style={{ color: "var(--text-default)" }}
          >
            {name || <span style={{ color: "var(--text-faint)" }}>Untitled plan</span>}
            {badge && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{
                  background: highlighted ? "var(--accent-primary)" : "var(--surface-2)",
                  color:      highlighted ? "var(--accent-fg)"      : "var(--text-default)",
                }}
              >
                {badge}
              </span>
            )}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {chips.map((c, i) => (
              <ChipPill key={`${c.label}-${i}`} {...c} />
            ))}
          </div>
          {subline && (
            <div className="mt-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
              {subline}
            </div>
          )}
        </div>

        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}

function ChipPill({ label, tone, dot, title }: Chip) {
  const palette = TONE[tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
      style={{ background: palette.bg, color: palette.fg, border: `1px solid ${palette.border}` }}
      title={title}
    >
      {dot && (
        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: palette.fg }} />
      )}
      {label}
    </span>
  );
}

const TONE: Record<ChipTone, { bg: string; fg: string; border: string }> = {
  default: { bg: "var(--surface-2)",       fg: "var(--text-default)",   border: "var(--border-default)" },
  neutral: { bg: "var(--surface-2)",       fg: "var(--text-muted)",     border: "var(--border-subtle)"  },
  accent:  { bg: "var(--accent-surface)",  fg: "var(--accent-primary)", border: "var(--accent-primary)" },
  success: { bg: "var(--success-surface)", fg: "var(--success-fg)",     border: "var(--success-fg)"     },
  warning: { bg: "var(--warning-surface)", fg: "var(--warning-fg)",     border: "var(--warning-fg)"     },
  danger:  { bg: "var(--danger-surface)",  fg: "var(--danger-fg)",      border: "var(--danger-fg)"      },
};
