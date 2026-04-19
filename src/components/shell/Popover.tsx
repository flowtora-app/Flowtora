"use client";

import * as React from "react";

// Small controlled-popover primitive used by the TopBar menus. We build
// our own rather than pull in Radix because we only need:
//   - Click-outside to dismiss
//   - ESC to dismiss
//   - Focus the first focusable child on open
//   - Render below the anchor, right-aligned by default
//
// Callers pass `trigger` (a button ref-forwarded) and `content` (the
// popover body). Open state is controlled via `open` + `onOpenChange`
// so the parent can coordinate (e.g. close one popover before opening
// another).

export interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactElement;
  children: React.ReactNode;
  align?: "start" | "end";
  width?: number;
}

export function Popover({
  open,
  onOpenChange,
  trigger,
  children,
  align = "end",
  width,
}: PopoverProps) {
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);

  // Click-outside + ESC.
  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  // Focus the first focusable child when the popover opens.
  React.useEffect(() => {
    if (!open) return;
    const el = panelRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    el?.focus();
  }, [open]);

  // Inject a ref into the trigger so we can hit-test clicks against it.
  const TriggerEl = trigger as React.ReactElement<{ ref?: React.Ref<HTMLElement> }>;
  const triggerWithRef = React.cloneElement(TriggerEl, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      const orig = (TriggerEl as unknown as { ref?: React.Ref<HTMLElement> }).ref;
      if (typeof orig === "function") orig(node);
      else if (orig && typeof orig === "object") {
        (orig as React.MutableRefObject<HTMLElement | null>).current = node;
      }
    },
  });

  return (
    <span className="relative inline-flex">
      {triggerWithRef}
      {open && (
        <div
          ref={panelRef}
          role="menu"
          className="absolute top-full mt-1 overflow-hidden rounded-lg"
          style={{
            [align === "end" ? "right" : "left"]: 0,
            width,
            minWidth: width ?? 200,
            background: "var(--surface-2)",
            border: "1px solid var(--border-default)",
            boxShadow: "var(--shadow-md)",
            zIndex: "var(--z-dropdown)",
          }}
        >
          {children}
        </div>
      )}
    </span>
  );
}

// Row primitives for building menu content.
export function PopoverItem({
  children,
  onClick,
  href,
  asForm,
  destructive,
  leftIcon,
  rightSlot,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  asForm?: React.ReactNode;
  destructive?: boolean;
  leftIcon?: React.ReactNode;
  /** Trailing content — status chips, meta timestamps, etc. */
  rightSlot?: React.ReactNode;
}) {
  const style: React.CSSProperties = {
    color: destructive ? "var(--danger-fg)" : "var(--text-default)",
  };
  const baseClass =
    "ts-focus flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-[color:var(--surface-3)]";
  const inner = (
    <>
      {leftIcon && <span style={{ color: "var(--text-muted)" }}>{leftIcon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {rightSlot && <span className="ml-auto inline-flex shrink-0 items-center">{rightSlot}</span>}
    </>
  );

  if (asForm) return <div className={baseClass} style={style}>{asForm}</div>;
  if (href) {
    return (
      <a href={href} className={baseClass} style={style} role="menuitem">
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={baseClass} style={style} role="menuitem">
      {inner}
    </button>
  );
}

export function PopoverSection({
  label,
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ borderTop: "1px solid var(--border-subtle)" }}>
      {label && (
        <div
          className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-faint)" }}
        >
          {label}
        </div>
      )}
      {children}
    </div>
  );
}
