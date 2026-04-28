"use client";

import * as React from "react";
import Link from "next/link";

// Per-row "⋯" actions menu for the tenants table.
//
// Renders a 3-dots icon button; clicking opens an anchored menu with
// quick-jump links — view tenant detail, open the workspace via slug,
// copy the tenant ID. Closes on outside click + Escape.
//
// Lives as a client component because the menu's open/closed state
// + outside-click detection need browser APIs. The menu items
// themselves are simple Links + buttons; no server state.

interface TenantRowActionsProps {
  tenantId: string;
  tenantSlug: string;
}

export function TenantRowActions({ tenantId, tenantSlug }: TenantRowActionsProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  // Close on outside click + Escape.
  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (ref.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(tenantId);
      setOpen(false);
    } catch {
      // Older browsers: silently no-op rather than throw a banner.
    }
  };

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Tenant actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="ts-focus inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors"
        style={{
          background: open ? "var(--surface-2)" : "transparent",
          color: "var(--text-muted)",
          border: `1px solid ${open ? "var(--border-default)" : "transparent"}`,
        }}
      >
        <svg width={14} height={14} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <circle cx="3" cy="8" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="13" cy="8" r="1.5" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-md py-1 text-sm"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-default)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <Link
            href={`/platform/tenants/${tenantId}`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 transition-colors hover:opacity-80"
            style={{ color: "var(--text-default)" }}
          >
            View tenant detail
          </Link>
          <Link
            href={`/t/${tenantSlug}/dashboard`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 transition-colors hover:opacity-80"
            style={{ color: "var(--text-default)" }}
          >
            Open workspace
          </Link>
          <div
            aria-hidden
            className="my-1 h-px"
            style={{ background: "var(--border-subtle)" }}
          />
          <button
            type="button"
            role="menuitem"
            onClick={copyId}
            className="block w-full px-3 py-2 text-left transition-colors hover:opacity-80"
            style={{ color: "var(--text-muted)" }}
          >
            Copy tenant ID
          </button>
        </div>
      )}
    </div>
  );
}
