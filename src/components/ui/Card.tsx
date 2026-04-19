import * as React from "react";
import { cn } from "@/lib/cn";

// Card — primary container primitive. Three elevation levels:
//   flat     — transparent/subtle, for inline groupings
//   default  — surface-1 panel (the vast majority of cards)
//   elevated — surface-2 with shadow, for floating blocks / modal-like
//
// CardHeader + CardBody + CardFooter give the typical vertical layout
// with a separator line. Pass `padded={false}` to the Card itself when
// the children manage their own padding (e.g. a full-bleed table).

type Elevation = "flat" | "default" | "elevated";

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
};

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevation?: Elevation;
  padded?: boolean;
  interactive?: boolean;
}

export function Card({
  elevation = "default",
  padded = false,
  interactive = false,
  className,
  style,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      {...rest}
      className={cn(
        "rounded-lg",
        padded && "p-5",
        interactive && "ts-card-interactive",
        className,
      )}
      style={{ ...ELEVATION_STYLE[elevation], ...style }}
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
