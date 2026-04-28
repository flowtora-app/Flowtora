import * as React from "react";
import Link from "next/link";

// Tenant detail header — identity + badges + quick actions.
//
//   Tenants / acme-signs
//   ─────────────────────────────────────────────────────────────
//   Acme Signs                    [Open silently] [Sign in as ▸]
//   acme-signs · ●Healthy  ACTIVE  PRO  LIVE  PILOT
//                Active today
//
// Renders right above the tab nav. Status / plan / env / cohort all
// share the same chip shape so the eye scans them as one row.

type ChipTone = "default" | "accent" | "success" | "warning" | "danger" | "neutral";

interface Chip {
  label: string;
  tone: ChipTone;
  /** Optional ● dot, used for the health chip. */
  dot?: boolean;
  title?: string;
}

interface TenantHeaderBarProps {
  name: string;
  slug: string;
  workspaceHref: string;
  /** A list of badge chips rendered after the slug. Order matters. */
  chips: Chip[];
  /** Subtitle line below the chips, e.g. "Active 3d ago · Trial ends in 6 days". */
  subline?: string;
  /** Quick-action cluster on the right. */
  actions?: React.ReactNode;
}

export function TenantHeaderBar({
  name,
  slug,
  workspaceHref,
  chips,
  subline,
  actions,
}: TenantHeaderBarProps) {
  return (
    <header className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            <Link href="/platform/tenants" className="hover:underline">
              Tenants
            </Link>
            <span className="mx-1.5">/</span>
            <span>{slug}</span>
          </div>
          <h1
            className="mt-1 text-2xl font-semibold tracking-tight"
            style={{ color: "var(--text-default)" }}
          >
            {name}
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

        {/* Quick actions cluster */}
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={workspaceHref}
            className="ts-focus inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors"
            style={{
              background: "transparent",
              color: "var(--text-muted)",
              border: "1px solid var(--border-default)",
            }}
            title="Open the tenant workspace without starting an audited impersonation session."
          >
            Open silently ↗
          </Link>
          {actions}
        </div>
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
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: palette.fg }}
        />
      )}
      {label}
    </span>
  );
}

const TONE: Record<ChipTone, { bg: string; fg: string; border: string }> = {
  default: { bg: "var(--surface-2)",        fg: "var(--text-default)",   border: "var(--border-default)"  },
  neutral: { bg: "var(--surface-2)",        fg: "var(--text-muted)",     border: "var(--border-subtle)"   },
  accent:  { bg: "var(--accent-surface)",   fg: "var(--accent-primary)", border: "var(--accent-primary)"  },
  success: { bg: "var(--success-surface)",  fg: "var(--success-fg)",     border: "var(--success-fg)"      },
  warning: { bg: "var(--warning-surface)",  fg: "var(--warning-fg)",     border: "var(--warning-fg)"      },
  danger:  { bg: "var(--danger-surface)",   fg: "var(--danger-fg)",      border: "var(--danger-fg)"       },
};
