import * as React from "react";
import { cn } from "@/lib/cn";
import { Container } from "./Container";

// Section — vertical rhythm primitive for marketing pages.
//
// Wraps children in consistent top/bottom padding and an optional
// alternating background. Passing `muted` swaps to surface-1 so we can
// create visual zones without ad-hoc divs.
//
// `eyebrow`, `title`, `description` render a standardized header above
// the body. Omit them for a section that owns its own heading.

// We omit `title` from HTMLAttributes because we repurpose it for the
// section heading (ReactNode), not the native HTML tooltip string.
export interface SectionProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  muted?: boolean;
  narrow?: boolean;
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  align?: "left" | "center";
  size?: "sm" | "md" | "lg";
  /** Vertical padding preset. `sm` is for between tight clusters. */
  padding?: "sm" | "md" | "lg";
}

const PADDING: Record<NonNullable<SectionProps["padding"]>, string> = {
  sm: "py-14",
  md: "py-20 md:py-24",
  lg: "py-24 md:py-32",
};

export function Section({
  muted,
  narrow,
  eyebrow,
  title,
  description,
  align = "left",
  size = "lg",
  padding = "md",
  className,
  children,
  ...rest
}: SectionProps) {
  return (
    <section
      className={cn(PADDING[padding], className)}
      style={{ background: muted ? "var(--surface-1)" : "transparent" }}
      {...rest}
    >
      <Container size={narrow ? "sm" : size}>
        {(eyebrow || title || description) && (
          <div
            className={cn(
              "mb-10",
              align === "center" && "mx-auto max-w-2xl text-center",
              narrow && "mx-auto max-w-2xl",
            )}
          >
            {eyebrow && (
              <div
                className="mb-3 text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--accent-primary)" }}
              >
                {eyebrow}
              </div>
            )}
            {title && (
              <h2
                className="text-3xl font-semibold tracking-tight md:text-4xl"
                style={{ color: "var(--text-default)" }}
              >
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-4 text-base leading-relaxed md:text-lg" style={{ color: "var(--text-muted)" }}>
                {description}
              </p>
            )}
          </div>
        )}
        {children}
      </Container>
    </section>
  );
}
