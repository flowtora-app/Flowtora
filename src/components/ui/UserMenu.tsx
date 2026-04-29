"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Avatar } from "./Avatar";

// UserMenu — Spec Page 0 §0.5.47.
//
// Header: avatar + name + email + role + tenant context.
// Items: View profile, Account settings, Switch organization
// (submenu), View as tenant (impersonation), Notifications
// preferences, API keys, Theme (Light/Dark/System), Keyboard
// shortcuts, Documentation, Sign out (red).
// Footer: version + status dot + "What's new" badge.
//
// Caller drives the trigger + handles all actions. This component
// owns dropdown state + layout.

export interface UserMenuProps {
  name: string;
  email: string;
  role?: string;
  tenantName?: string;
  avatarUrl?: string | null;
  /** Render the trigger via render-prop. Receives onClick + open state. */
  trigger?: (api: { open: boolean; onClick: () => void }) => React.ReactNode;
  /** Sections under the header. Defaults to a sensible set. */
  items?: UserMenuSection[];
  /** Footer slot — typically version + status. */
  footer?: React.ReactNode;
  className?: string;
}

export interface UserMenuItem {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  /** When set, item shows a kbd shortcut chip on the right. */
  kbd?: string;
  /** Destructive (rose). */
  destructive?: boolean;
  onClick?: () => void;
  href?: string;
  /** Sub-items render as a submenu on hover. */
  children?: UserMenuItem[];
}

export interface UserMenuSection {
  items: UserMenuItem[];
}

export function UserMenu({
  name,
  email,
  role,
  tenantName,
  avatarUrl,
  trigger,
  items = [],
  footer,
  className,
}: UserMenuProps) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const onClick = () => setOpen((o) => !o);

  return (
    <div ref={containerRef} className={cn("relative inline-block", className)}>
      {trigger
        ? trigger({ open, onClick })
        : (
          <button
            type="button"
            onClick={onClick}
            aria-expanded={open}
            aria-haspopup="menu"
            className="ts-focus inline-flex items-center gap-2 rounded-md px-2 py-1 hover:bg-[var(--surface-3)]"
          >
            <Avatar src={avatarUrl ?? undefined} name={name} size="sm" />
            <span className="hidden text-[13px] font-medium md:inline" style={{ color: "var(--text-default)" }}>{name}</span>
            <span aria-hidden style={{ color: "var(--text-muted)" }}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="3,4 5,6 7,4" /></svg>
            </span>
          </button>
        )}
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-[var(--z-dropdown,100)] mt-2 w-72 rounded-lg border"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-lg)" }}
        >
          {/* Header */}
          <div className="flex items-start gap-3 border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
            <Avatar src={avatarUrl ?? undefined} name={name} size="md" />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>{name}</div>
              <div className="truncate text-[11px]" style={{ color: "var(--text-muted)" }}>{email}</div>
              {(role || tenantName) && (
                <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {role}{role && tenantName ? " · " : ""}{tenantName}
                </div>
              )}
            </div>
          </div>
          {/* Sections */}
          {items.map((section, si) => (
            <ul
              key={si}
              role="group"
              className={cn("py-1", si > 0 && "border-t")}
              style={{ borderColor: "var(--border-subtle)" }}
            >
              {section.items.map((item) => (
                <UserMenuRow key={item.id} item={item} onPick={() => setOpen(false)} />
              ))}
            </ul>
          ))}
          {/* Footer */}
          {footer && (
            <div className="border-t px-4 py-2 text-[11px]" style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
              {footer}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UserMenuRow({ item, onPick }: { item: UserMenuItem; onPick: () => void }) {
  const [submenuOpen, setSubmenuOpen] = React.useState(false);
  const className = cn(
    "ts-focus flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors",
    item.destructive ? "hover:bg-[var(--rose-50,var(--danger-surface))]" : "hover:bg-[var(--surface-3)]",
  );
  const fg = item.destructive ? "var(--rose-700, var(--danger-fg))" : "var(--text-default)";

  if (item.children && item.children.length > 0) {
    return (
      <li
        role="none"
        onMouseEnter={() => setSubmenuOpen(true)}
        onMouseLeave={() => setSubmenuOpen(false)}
        className="relative"
      >
        <button type="button" role="menuitem" className={className} style={{ color: fg }}>
          {item.icon && <span className="inline-flex shrink-0" style={{ color: "var(--text-muted)" }}>{item.icon}</span>}
          <span className="min-w-0 flex-1">{item.label}</span>
          <span aria-hidden style={{ color: "var(--text-muted)" }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="4,3 7,5 4,7" /></svg>
          </span>
        </button>
        {submenuOpen && (
          <ul
            role="menu"
            className="absolute left-full top-0 ml-1 w-56 rounded-lg border py-1"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-lg)" }}
          >
            {item.children.map((child) => (
              <UserMenuRow key={child.id} item={child} onPick={onPick} />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const inner = (
    <>
      {item.icon && <span className="inline-flex shrink-0" style={{ color: "var(--text-muted)" }}>{item.icon}</span>}
      <span className="min-w-0 flex-1">{item.label}</span>
      {item.kbd && (
        <kbd className="inline-flex items-center rounded bg-[var(--surface-2)] px-1.5 font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>{item.kbd}</kbd>
      )}
    </>
  );

  if (item.href) {
    return (
      <li role="none">
        <a
          role="menuitem"
          href={item.href}
          onClick={onPick}
          className={className}
          style={{ color: fg }}
        >
          {inner}
        </a>
      </li>
    );
  }
  return (
    <li role="none">
      <button
        type="button"
        role="menuitem"
        onClick={() => { item.onClick?.(); onPick(); }}
        className={className}
        style={{ color: fg }}
      >
        {inner}
      </button>
    </li>
  );
}
