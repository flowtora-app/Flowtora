import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Sparkline } from "@/components/dashboard/Sparkline";

// Premium-redesign KPI tile used by every persona dashboard.
//
// Visual upgrade over the original tile:
//   • Gradient surface that subtly tints by tone (accent gets an accent
//     halo, danger gets a rose halo)
//   • Inset 1px highlight on the top edge for premium depth
//   • Larger headline number (28-32px) with tighter tracking
//   • Hover lift (1px translateY) + accent ring + brightness 105%
//   • Icon container styled as a small gradient tile to match the
//     redesigned sidebar/topbar language
//   • Sparkline sits at the bottom right with proper baseline spacing
//
// Props are unchanged from the previous version — callers don't need
// updates. Existing pages light up with the new look automatically.

export type StatTone = "default" | "success" | "warning" | "danger" | "accent";

const TONE_COLOR: Record<StatTone, string> = {
  default: "var(--text-default)",
  success: "var(--success-fg, var(--emerald-500))",
  warning: "var(--warning-fg, var(--amber-500))",
  danger:  "var(--danger-fg, var(--rose-500))",
  accent:  "var(--accent-primary)",
};

const TONE_STROKE: Record<StatTone, string> = {
  default: "var(--accent-primary)",
  success: "var(--success-fg, var(--emerald-500))",
  warning: "var(--warning-fg, var(--amber-500))",
  danger:  "var(--danger-fg, var(--rose-500))",
  accent:  "var(--accent-primary)",
};

/** Subtle background halo by tone. Default tiles stay neutral; accent
 *  and danger tiles get a faint corner glow that telegraphs meaning. */
const TONE_HALO: Record<StatTone, string> = {
  default: "transparent",
  success: "radial-gradient(420px circle at 100% -20%, color-mix(in oklab, var(--emerald-500) 12%, transparent), transparent 55%)",
  warning: "radial-gradient(420px circle at 100% -20%, color-mix(in oklab, var(--amber-500) 12%, transparent), transparent 55%)",
  danger:  "radial-gradient(420px circle at 100% -20%, color-mix(in oklab, var(--rose-500) 14%, transparent), transparent 55%)",
  accent:  "radial-gradient(420px circle at 100% -20%, var(--accent-surface), transparent 55%)",
};

export interface DashboardStatProps {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  href?: string;
  tone?: StatTone;
  icon?: React.ReactNode;
  compact?: boolean;
  className?: string;
  spark?: number[];
  sparkLabel?: string;
}

export function DashboardStat({
  label,
  value,
  hint,
  href,
  tone = "default",
  icon,
  compact,
  className,
  spark,
  sparkLabel,
}: DashboardStatProps) {
  const showSpark = !compact && spark && spark.length >= 2;
  const inner = (
    <div
      className={cn(
        "group/stat relative overflow-hidden rounded-xl transition-all",
        compact ? "p-4" : "px-5 py-5",
        href && "hover:-translate-y-px",
        className,
      )}
      style={{
        background:
          `${TONE_HALO[tone]}, linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)`,
        border: "1px solid var(--border-subtle)",
        boxShadow:
          "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
          "0 1px 2px 0 rgba(0,0,0,0.18)",
      }}
    >
      {/* Hover ring — only visible on hover when href is set. */}
      {href && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity group-hover/stat:opacity-100"
          style={{
            boxShadow:
              "0 0 0 1px color-mix(in oklab, var(--accent-primary) 35%, transparent), " +
              "0 8px 24px -10px rgba(0,0,0,0.45)",
          }}
        />
      )}

      <div className="relative flex items-center justify-between gap-3">
        <span
          style={{
            color: "var(--text-muted)",
            fontSize: 10.5,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            lineHeight: 1.1,
          }}
        >
          {label}
        </span>
        {icon && (
          <span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded-md text-xs"
            style={{
              background:
                tone === "accent" || tone === "default"
                  ? "linear-gradient(135deg, var(--accent-surface-strong), var(--accent-surface))"
                  : "var(--surface-2)",
              color:
                tone === "accent" || tone === "default"
                  ? "var(--accent-primary)"
                  : TONE_COLOR[tone],
              border:
                tone === "accent" || tone === "default"
                  ? "1px solid color-mix(in oklab, var(--accent-primary) 22%, transparent)"
                  : "1px solid var(--border-subtle)",
            }}
          >
            {icon}
          </span>
        )}
      </div>
      <div
        className={cn(
          "relative mt-2 font-semibold",
          compact ? "text-xl" : "text-[28px] leading-[1.1]",
        )}
        style={{
          color: TONE_COLOR[tone],
          letterSpacing: "-0.02em",
          fontFeatureSettings: "'tnum' 1, 'cv11' 1",
        }}
      >
        {value}
      </div>
      {(hint || showSpark) && (
        <div className="relative mt-3 flex items-end justify-between gap-3">
          {hint && (
            <div
              style={{
                color: "var(--text-faint)",
                fontSize: 11.5,
                lineHeight: 1.35,
              }}
            >
              {hint}
            </div>
          )}
          {showSpark && (
            <div className="ml-auto shrink-0" style={{ opacity: 0.9 }}>
              <Sparkline
                values={spark!}
                stroke={TONE_STROKE[tone]}
                ariaLabel={sparkLabel}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="ts-focus block rounded-xl">
      {inner}
    </Link>
  ) : (
    inner
  );
}
