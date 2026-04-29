import * as React from "react";
import { cn } from "@/lib/cn";

// Card — Spec Page 0 §0.5.18.
//
// Variants (spec):
//   default     — border + surface-1 (most common)
//   elevated    — shadow-sm, no border (floating)
//   interactive — hover shadow-md, cursor-pointer (clickable cards)
//   gradient    — brand soft tint (call-out / highlight)
//
// Backward-compat: existing `flat` elevation kept as a legacy alias.
//
// Padding: sm 12px / md 16px / lg 24px (spec §0.5.18). The legacy
// `padded` boolean still works (= "md" when true, "none" when false).
//
// CardHeader + CardBody + CardFooter give the typical vertical layout
// with separator lines. Pass `padded={false}` to the Card itself when
// the children manage their own padding (e.g. a full-bleed table).

type Elevation = "flat" | "default" | "elevated" | "interactive" | "gradient";
type Padding   = "none" | "sm" | "md" | "lg";

const ELEVATION_STYLE: Record<Elevation, React.CSSProperties> = {
  flat: {
    background: "transparent",
    border: "1px solid var(--border-subtle)",
  },
  default: {
    background: "var(--surface-1)",
    border: "1px solid var(--border-subtle)",
  },
  elevated: {
    background: "var(--surface-2)",
    border: "1px solid var(--border-default)",
    boxShadow: "var(--shadow-md)",
  },
  interactive: {
    background: "var(--surface-1)",
    border: "1px solid var(--border-subtle)",
    cursor: "pointer",
  },
  gradient: {
    background: "linear-gradient(135deg, var(--brand-50) 0%, var(--brand-100) 100%)",
    border: "1px solid var(--brand-200)",
  },
};

const PADDING_CLASS: Record<Padding, string> = {
  none: "",
  sm:   "p-3",
  md:   "p-4",
  lg:   "p-6",
};

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevation?: Elevation;
  /** Spec padding scale. `padded` (boolean) is kept as a backward-compat
   *  alias: true → "md", false → "none". Explicit `padding` wins. */
  padding?: Padding;
  /** @deprecated Use `padding` instead. */
  padded?: boolean;
  /** @deprecated Use `elevation="interactive"` instead. */
  interactive?: boolean;
}

export function Card({
  elevation = "default",
  padding,
  padded = false,
  interactive = false,
  className,
  style,
  children,
  ...rest
}: CardProps) {
  // Resolve the effective elevation: if the legacy `interactive` flag
  // is set, upgrade `default` to `interactive` so the spec hover state
  // applies without changing call sites.
  const effectiveElevation: Elevation =
    interactive && elevation === "default" ? "interactive" : elevation;

  // Resolve the effective padding from the new prop, falling back to
  // the legacy `padded` boolean.
  const effectivePadding: Padding =
    padding ?? (padded ? "md" : "none");

  return (
    <div
      {...rest}
      className={cn(
        "rounded-lg transition-shadow",
        PADDING_CLASS[effectivePadding],
        effectiveElevation === "interactive" && "ts-card-interactive hover:shadow-md",
        className,
      )}
      style={{ ...ELEVATION_STYLE[effectiveElevation], ...style }}
    >
      {children}
    </div>
  );
}

export interface CardHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}

export function CardHeader({ title, description, right, className }: CardHeaderProps) {
  return (
    <div
      className={cn("flex items-start justify-between gap-4 px-5 py-4", className)}
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
    >
      <div className="min-w-0">
        <div className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
          {title}
        </div>
        {description && (
          <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
            {description}
          </div>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

export function CardBody({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center justify-end gap-2 px-5 py-3", className)}
      style={{ borderTop: "1px solid var(--border-subtle)" }}
      {...rest}
    />
  );
}
