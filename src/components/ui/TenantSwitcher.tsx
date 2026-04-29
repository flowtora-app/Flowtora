"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Avatar } from "./Avatar";

// TenantSwitcher — Spec Page 0 §0.5.48.
//
// Trigger: chip in top bar (when impersonating) or in user dropdown.
// Popover: searchable list of tenants admin can access; recent at
// top; "Create new tenant" footer link.

export interface TenantOption {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  /** Optional plan/role label rendered to the right. */
  meta?: React.ReactNode;
}

export interface TenantSwitcherProps {
  current: TenantOption | null;
  options: TenantOption[];
  /** Recent tenant ids — surfaced at the top of the list. */
  recentIds?: string[];
  onPick: (tenant: TenantOption) => void;
  /** Footer "Create new tenant" handler. */
  onCreate?: () => void;
  /** Render the trigger chip — receives onClick + open state. */
  trigger?: (api: { open: boolean; onClick: () => void; current: TenantOption | null }) => React.ReactNode;
  /** Show the impersonation indicator (badge + brand bar). */
  impersonating?: boolean;
  className?: string;
}

export function TenantSwitcher({
  current,
  options,
  recentIds,
  onPick,
  onCreate,
  trigger,
  impersonating,
  className,
}: TenantSwitcherProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  React.useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
    else setQuery("");
  }, [open]);

  const onClick = () => setOpen((o) => !o);

  const recentSet = new Set(recentIds ?? []);
  const filtered = options.filter((t) =>
    t.name.toLowerCase().includes(query.toLowerCase()) ||
    t.slug.toLowerCase().includes(query.toLowerCase())
  );
  const recents = filtered.filter((t) => recentSet.has(t.id) && t.id !== current?.id);
  const rest = filtered.filter((t) => !recentSet.has(t.id) && t.id !== current?.id);

  return (
    <div ref={containerRef} className={cn("relative inline-block", className)}>
      {trigger
        ? trigger({ open, onClick, current })
        : (
          <button
            type="button"
            onClick={onClick}
            aria-expanded={open}
            aria-haspopup="listbox"
            className="ts-focus inline-flex items-center gap-2 rounded-md border px-2 py-1 text-[13px]"
            style={{
              background: "var(--surface-1)",
              borderColor: impersonating ? "var(--brand-500, var(--accent-primary))" : "var(--border-default)",
              color: "var(--text-default)",
            }}
          >
            {current ? (
              <>
                <Avatar size="xs" src={current.logoUrl ?? undefined} name={current.name} />
                <span className="font-medium">{current.name}</span>
                {impersonating && (
                  <span className="rounded px-1 text-[10px] font-bold uppercase" style={{ background: "var(--brand-100, var(--accent-surface))", color: "var(--brand-700, var(--accent-primary))" }}>
                    Impersonating
                  </span>
                )}
              </>
            ) : (
              <span style={{ color: "var(--text-muted)" }}>Pick a tenant</span>
            )}
            <span aria-hidden style={{ color: "var(--text-muted)" }}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="3,4 5,6 7,4" /></svg>
            </span>
          </button>
        )}
      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-[var(--z-dropdown,100)] mt-2 w-80 rounded-lg border"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-lg)" }}
        >
          <div className="border-b p-2" style={{ borderColor: "var(--border-subtle)" }}>
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tenants…"
              className="ts-focus h-8 w-full rounded-md border bg-transparent px-2 text-[13px] outline-none"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-default)", color: "var(--text-default)" }}
            />
          </div>
          <div className="max-h-72 overflow-y-auto">
            {current && query === "" && (
              <Section label="Current">
                <Row tenant={current} active onPick={() => setOpen(false)} />
              </Section>
            )}
            {recents.length > 0 && (
              <Section label="Recent">
                {recents.map((t) => <Row key={t.id} tenant={t} onPick={() => { onPick(t); setOpen(false); }} />)}
              </Section>
            )}
            {rest.length > 0 && (
              <Section label={recents.length > 0 || (current && query === "") ? "All tenants" : ""}>
                {rest.map((t) => <Row key={t.id} tenant={t} onPick={() => { onPick(t); setOpen(false); }} />)}
              </Section>
            )}
            {filtered.length === 0 && (
              <div className="px-3 py-6 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
                No tenants match.
              </div>
            )}
          </div>
          {onCreate && (
            <div className="border-t p-2" style={{ borderColor: "var(--border-subtle)" }}>
              <button
                type="button"
                onClick={() => { onCreate(); setOpen(false); }}
                className="ts-focus flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-[var(--surface-3)]"
                style={{ color: "var(--accent-primary)" }}
              >
                <span aria-hidden>+</span>
                Create new tenant
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      {label && (
        <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          {label}
        </div>
      )}
      <ul>{children}</ul>
    </div>
  );
}

function Row({ tenant, active, onPick }: { tenant: TenantOption; active?: boolean; onPick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className="ts-focus flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-[var(--surface-3)]"
        style={{
          background: active ? "var(--surface-2)" : "transparent",
          color: "var(--text-default)",
        }}
      >
        <Avatar size="xs" src={tenant.logoUrl ?? undefined} name={tenant.name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{tenant.name}</span>
          <span className="block truncate text-[10px]" style={{ color: "var(--text-muted)" }}>{tenant.slug}</span>
        </span>
        {tenant.meta && (
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{tenant.meta}</span>
        )}
        {active && <span aria-hidden style={{ color: "var(--accent-primary)" }}>✓</span>}
      </button>
    </li>
  );
}
