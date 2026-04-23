import * as React from "react";

// Shared wrapper for dashboard section cards: titled container with
// consistent padding, rounded corners, optional action in the header.

type Props = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function SectionCard({ title, subtitle, action, children, className }: Props) {
  return (
    <section
      className={`rounded-2xl ${className ?? ""}`}
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.02)",
      }}
    >
      <header className="flex items-start justify-between gap-3 px-5 pt-4">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              {subtitle}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="px-5 pb-5 pt-4">{children}</div>
    </section>
  );
}
