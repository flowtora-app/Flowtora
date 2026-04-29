import * as React from "react";
import { cn } from "@/lib/cn";

// Avatar — Spec Page 0 §0.5.14.
//
// Sizes (spec): xs 20, sm 24, md 32 (default), lg 40, xl 48, 2xl 64,
// 3xl 96.
// Status dot (spec): bottom-right; colors emerald (online), amber
// (away), rose (offline-error), gray (offline), brand (impersonating).
// Group: stacked, max display N then "+X" pill, ring-2 surface
// between avatars.

type Size = "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";
type StatusDot = "online" | "away" | "offline" | "error" | "impersonating";

const SIZE_PX: Record<Size, number> = {
  xs:  20,
  sm:  24,
  md:  32,
  lg:  40,
  xl:  48,
  "2xl": 64,
  "3xl": 96,
};

const SIZE_FONT: Record<Size, string> = {
  xs:  "10px",
  sm:  "11px",
  md:  "13px",
  lg:  "15px",
  xl:  "18px",
  "2xl": "22px",
  "3xl": "32px",
};

const DOT_PX: Record<Size, number> = {
  xs: 6, sm: 7, md: 8, lg: 10, xl: 12, "2xl": 14, "3xl": 18,
};

const DOT_COLOR: Record<StatusDot, string> = {
  online:        "var(--emerald-500, var(--success))",
  away:          "var(--amber-500, var(--warning))",
  offline:       "var(--slate-400, var(--text-faint))",
  error:         "var(--rose-500, var(--danger))",
  impersonating: "var(--brand-500, var(--accent-primary))",
};

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  name?: string | null;
  size?: Size;
  alt?: string;
  /** Spec §0.5.14 — status dot at bottom-right. */
  status?: StatusDot;
}

function deriveInitials(name?: string | null): string {
  const source = (name ?? "").trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function Avatar({
  src,
  name,
  size = "md",
  alt,
  status,
  className,
  style,
  ...rest
}: AvatarProps) {
  const px = SIZE_PX[size];
  const dot = DOT_PX[size];

  // Wrapper exists only when we need a status dot — keeps the simple
  // case (no status) at the same DOM cost as before.
  if (!status) {
    return (
      <div
        {...rest}
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
          className,
        )}
        style={{
          width: px,
          height: px,
          background: "var(--accent-surface)",
          color: "var(--accent-primary)",
          border: "1px solid var(--border-subtle)",
          fontSize: SIZE_FONT[size],
          fontWeight: 600,
          ...style,
        }}
        aria-label={alt ?? name ?? "Avatar"}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt ?? name ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span aria-hidden>{deriveInitials(name)}</span>
        )}
      </div>
    );
  }

  return (
    <div
      {...rest}
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: px, height: px, ...style }}
    >
      <div
        className="inline-flex h-full w-full items-center justify-center overflow-hidden rounded-full"
        style={{
          background: "var(--accent-surface)",
          color: "var(--accent-primary)",
          border: "1px solid var(--border-subtle)",
          fontSize: SIZE_FONT[size],
          fontWeight: 600,
        }}
        aria-label={alt ?? name ?? "Avatar"}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt ?? name ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span aria-hidden>{deriveInitials(name)}</span>
        )}
      </div>
      <span
        aria-label={`Status: ${status}`}
        className="absolute rounded-full"
        style={{
          width: dot,
          height: dot,
          right: 0,
          bottom: 0,
          background: DOT_COLOR[status],
          boxShadow: "0 0 0 2px var(--surface-0)",
        }}
      />
    </div>
  );
}

export interface AvatarGroupProps {
  /** Maximum visible avatars before collapsing into "+N". */
  max?: number;
  size?: Size;
  className?: string;
  children: React.ReactNode;
}

export function AvatarGroup({ max = 3, size = "md", className, children }: AvatarGroupProps) {
  const items = React.Children.toArray(children);
  const visible = items.slice(0, max);
  const overflow = items.length - visible.length;
  const px = SIZE_PX[size];

  return (
    <div className={cn("inline-flex items-center", className)}>
      {visible.map((child, i) => (
        <div
          key={i}
          style={{
            marginLeft: i === 0 ? 0 : -Math.round(px * 0.3),
            // Each avatar gets a ring matching the page bg so they
            // appear visibly separated when overlapped.
            boxShadow: "0 0 0 2px var(--surface-0)",
            borderRadius: "9999px",
          }}
        >
          {child}
        </div>
      ))}
      {overflow > 0 && (
        <div
          className="inline-flex items-center justify-center rounded-full"
          style={{
            marginLeft: -Math.round(px * 0.3),
            width: px,
            height: px,
            background: "var(--surface-2)",
            color: "var(--text-muted)",
            border: "1px solid var(--border-default)",
            boxShadow: "0 0 0 2px var(--surface-0)",
            fontSize: SIZE_FONT[size],
            fontWeight: 600,
          }}
          aria-label={`+${overflow} more`}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
