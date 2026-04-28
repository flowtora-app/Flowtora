import * as React from "react";
import { cn } from "@/lib/cn";

// Avatar — circular user/tenant image with initials fallback. Pair with
// <AvatarGroup max={3}> to render a stack with a "+N" overflow chip.

type Size = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_PX: Record<Size, number> = {
  xs: 20,
  sm: 24,
  md: 32,
  lg: 40,
  xl: 56,
};

const SIZE_FONT: Record<Size, string> = {
  xs: "10px",
  sm: "11px",
  md: "13px",
  lg: "15px",
  xl: "20px",
};

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  name?: string | null;
  size?: Size;
  alt?: string;
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
  className,
  style,
  ...rest
}: AvatarProps) {
  const px = SIZE_PX[size];
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
        <img
          src={src}
          alt={alt ?? name ?? ""}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <span aria-hidden>{deriveInitials(name)}</span>
      )}
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
