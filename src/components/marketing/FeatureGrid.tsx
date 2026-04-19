import * as React from "react";
import { cn } from "@/lib/cn";

// FeatureGrid — responsive grid of feature cards.
//
// Each feature is `{ icon?, title, description }`. We render as a
// responsive grid: 1 col < md, 2 cols md, 3 cols lg. The card uses a
// flat elevation on the (muted) section backgrounds and inherits
// color tokens so theme switching works automatically.

export interface Feature {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description: React.ReactNode;
  href?: string;
}

export interface FeatureGridProps {
  features: Feature[];
  columns?: 2 | 3 | 4;
  className?: string;
}

const COL_CLASS: Record<NonNullable<FeatureGridProps["columns"]>, string> = {
  2: "md:grid-cols-2",
  3: "md:grid-cols-2 lg:grid-cols-3",
  4: "md:grid-cols-2 lg:grid-cols-4",
};

export function FeatureGrid({ features, columns = 3, className }: FeatureGridProps) {
  return (
    <div className={cn("grid grid-cols-1 gap-5", COL_CLASS[columns], className)}>
      {features.map((f, i) => {
        const body = (
          <>
            {f.icon && (
              <div
                className="mb-4 flex h-10 w-10 items-center justify-center rounded-md"
                style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}
              >
                {f.icon}
              </div>
            )}
            <div className="text-base font-semibold" style={{ color: "var(--text-default)" }}>
              {f.title}
            </div>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
              {f.description}
            </p>
          </>
        );
        if (f.href) {
          return (
            <a
              key={i}
              href={f.href}
              className="group block rounded-xl p-6 transition-colors hover:brightness-110"
              style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
            >
              {body}
              <span
                className="mt-4 inline-flex items-center gap-1 text-xs font-medium"
                style={{ color: "var(--accent-primary)" }}
              >
                Learn more →
              </span>
            </a>
          );
        }
        return (
          <div
            key={i}
            className="rounded-xl p-6"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
          >
            {body}
          </div>
        );
      })}
    </div>
  );
}
