import * as React from "react";
import Link from "next/link";

// Phase 6 — per-persona empty states.
//
// When a persona has zero KPIs to show (zero leads, zero WIP, zero
// installs assigned), we don't want a wall of "0 — 0 — 0" tiles. This
// component renders a friendly card that teaches the first action to
// take. The persona view decides when to swap its KPI grid for this.
//
// Shape:
//   icon:         small decorative glyph (emoji or ReactNode)
//   title:        short imperative headline
//   body:         one-sentence explanation
//   primary:      filled CTA
//   secondary?:   optional ghost CTA (often "Explore a demo shop")

type Cta = { label: string; href: string };

export function EmptyStateCard({
  icon,
  title,
  body,
  primary,
  secondary,
}: {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
  primary: Cta;
  secondary?: Cta;
}) {
  return (
    <section
      className="flex flex-col items-center gap-3 rounded-2xl px-6 py-12 text-center"
      style={{
        background: "var(--surface-1)",
        border: "1px dashed var(--border-default)",
      }}
    >
      <span
        aria-hidden
        className="flex h-12 w-12 items-center justify-center rounded-full text-xl"
        style={{
          background: "var(--accent-surface)",
          color: "var(--accent-primary)",
        }}
      >
        {icon}
      </span>
      <h3
        className="text-base font-semibold"
        style={{ color: "var(--text-default)" }}
      >
        {title}
      </h3>
      <p
        className="max-w-md text-sm"
        style={{ color: "var(--text-muted)" }}
      >
        {body}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <Link
          href={primary.href}
          className="inline-flex h-9 items-center rounded-md px-4 text-sm font-medium"
          style={{
            background: "var(--accent-primary)",
            color: "var(--accent-fg)",
          }}
        >
          {primary.label}
        </Link>
        {secondary && (
          <Link
            href={secondary.href}
            className="inline-flex h-9 items-center rounded-md px-4 text-sm font-medium"
            style={{
              background: "var(--surface-2)",
              color: "var(--text-default)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            {secondary.label}
          </Link>
        )}
      </div>
    </section>
  );
}
