import * as React from "react";
import Link from "next/link";

// Phase 6 — role-scoped quick actions.
//
// A small, horizontally-scrolling strip of high-frequency shortcuts for
// the current persona. The goal is "do what you came here to do" in one
// click, not hunt through the nav.
//
// Each action is `{ label, href, hint, icon? }`. The composition is
// persona-defined; this component just renders a consistent strip.

export type QuickAction = {
  label: string;
  href: string;
  hint?: string;
  icon?: React.ReactNode;
  /** If true, renders as the primary (filled) action. At most one per strip. */
  primary?: boolean;
};

export function QuickActions({ actions }: { actions: QuickAction[] }) {
  if (actions.length === 0) return null;
  return (
    <section aria-label="Quick actions">
      <h2
        className="mb-3 text-xs font-semibold uppercase tracking-wider"
        style={{ color: "var(--text-muted)" }}
      >
        Quick actions
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map((a) => (
          <ActionTile key={a.href + a.label} action={a} />
        ))}
      </div>
    </section>
  );
}

function ActionTile({ action }: { action: QuickAction }) {
  const primary = action.primary;
  return (
    <Link
      href={action.href}
      className="group flex items-start gap-3 rounded-lg px-4 py-3 transition-colors hover:brightness-110"
      style={{
        background: primary ? "var(--accent-surface)" : "var(--surface-1)",
        border: primary
          ? "1px solid var(--accent-surface-strong, var(--accent-primary))"
          : "1px solid var(--border-subtle)",
      }}
    >
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm"
        style={{
          background: primary ? "var(--accent-primary)" : "var(--surface-2)",
          color: primary ? "var(--accent-fg)" : "var(--text-default)",
        }}
      >
        {action.icon ?? "→"}
      </span>
      <div className="min-w-0 flex-1">
        <div
          className="text-sm font-medium"
          style={{
            color: primary ? "var(--accent-primary)" : "var(--text-default)",
          }}
        >
          {action.label}
        </div>
        {action.hint && (
          <div
            className="mt-0.5 truncate text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            {action.hint}
          </div>
        )}
      </div>
    </Link>
  );
}
