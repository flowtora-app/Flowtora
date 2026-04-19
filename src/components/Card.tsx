import * as React from "react";

export function Card({ children, className = "", ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={`rounded-md ${className}`}
      style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
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
    <div className="flex items-start justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        {description && <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>{description}</div>}
      </div>
      {right && <div>{right}</div>}
    </div>
  );
}
