import * as React from "react";

// Premium-redesign card primitives — shared across every workspace page.
//
// Same API as before (children, className, title, description, right):
// callers don't change. The visual upgrade gives every card:
//   • Subtle gradient surface with inset top-edge highlight
//   • Refined 1px border using the design-token border-subtle
//   • Premium shadow + rounded-xl corner radius
//
// CardHeader picks up the accent-dot indicator pattern used by the
// sidebar section headers + DetailSection so titles read with
// consistent visual rhythm across the app.

export function Card({ children, className = "", style, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={`overflow-hidden rounded-xl ${className}`}
      style={{
        background:
          "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
        border: "1px solid var(--border-subtle)",
        boxShadow:
          "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
          "0 1px 2px 0 rgba(0,0,0,0.18)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  right,
}: {
  title: string;
  description?: string;
  right?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-start justify-between gap-4 px-5 py-3.5"
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          style={{
            width: 4,
            height: 4,
            borderRadius: 1,
            background: "var(--accent-primary)",
            flexShrink: 0,
          }}
        />
        <div className="min-w-0">
          <div
            style={{
              color: "var(--text-default)",
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "-0.005em",
              lineHeight: 1.25,
            }}
          >
            {title}
          </div>
          {description && (
            <div
              className="mt-0.5"
              style={{
                color: "var(--text-muted)",
                fontSize: 11.5,
                lineHeight: 1.4,
              }}
            >
              {description}
            </div>
          )}
        </div>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
