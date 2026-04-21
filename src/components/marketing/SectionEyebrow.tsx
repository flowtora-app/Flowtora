import * as React from "react";
import { cn } from "@/lib/cn";

// SectionEyebrow — the small accent label that sits above a section
// title. Section already renders one when you pass `eyebrow`, but we
// need a standalone version for composite layouts (ProductOrbit,
// FeatureShowcase copy columns, etc.) where the heading is local to
// the block rather than owned by Section.
//
// Two flavors:
//   • "accent" (default) — accent-color text, no dot. The sober,
//     marketing-standard look we use in Section's own header slot.
//   • "dot" — leading accent dot, more editorial. Used inside bento
//     cards and feature-showcase copy where the eyebrow competes with
//     richer visuals and needs a micro-anchor.

export interface SectionEyebrowProps {
  children: React.ReactNode;
  variant?: "accent" | "dot";
  className?: string;
  as?: "span" | "div" | "p";
}

export function SectionEyebrow({
  children,
  variant = "accent",
  className,
  as: Tag = "div",
}: SectionEyebrowProps) {
  return (
    <Tag
      className={cn(
        "inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em]",
        className,
      )}
      style={{ color: "var(--accent-primary)" }}
    >
      {variant === "dot" && (
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--accent-primary)" }}
        />
      )}
      {children}
    </Tag>
  );
}
