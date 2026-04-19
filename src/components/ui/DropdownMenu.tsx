"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// DropdownMenu — anchored menu primitive for row actions, bulk actions,
// and "more" overflow. Differs from shell/Popover by being driven with
// a render-prop trigger (button or icon) and supporting roving keyboard
// focus across items. Same visual language as Popover (surface-2 panel,
// border-default, shadow-md), so they feel like a family.
//
//   <DropdownMenu
//     trigger={<button aria-label="Actions">⋯</button>}
//     items={[
//       { label: "Edit", onClick: ... },
//       { type: "separator" },
//       { label: "Delete", destructive: true, onClick: ... },
//     ]}
//   />
//
// Items can also be `{ label, href }` for navigation, or wrap a <form>
// via `{ label, form: <form action={...}>...</form> }` for server-action
// mutations.

export type DropdownItem =
  | {
      type?: "item";
      label: React.ReactNode;
      leftIcon?: React.ReactNode;
      rightSlot?: React.ReactNode;
      onClick?: () => void;
      href?: string;
      form?: React.ReactNode;
      destructive?: boolean;
      disabled?: boolean;
    }
  | { type: "separator" }
  | { type: "label"; label: React.ReactNode };

export interface DropdownMenuProps {
  trigger: React.ReactElement;
  items: DropdownItem[];
  align?: "start" | "end";
  width?: number;
  /** Called after any item click so a parent can close a containing dialog etc. */
  onAfterItemClick?: () => void;
}

export function DropdownMenu({
  trigger,
  items,
  align = "end",
  width = 200,
  onAfterItemClick,
}: DropdownMenuProps) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);

  // Click-outside + ESC.
  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
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

  // Roving focus with arrow keys.
  React.useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const firstItem = panel.querySelector<HTMLElement>('[role="menuitem"]');
    firstItem?.focus();

    const onKey = (e: KeyboardEvent) => {
      const items = Array.from(panel.querySelectorAll<HTMLElement>('[role="menuitem"]'));
      const idx = items.indexOf(document.activeElement as HTMLElement);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        items[(idx + 1) % items.length]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        items[(idx - 1 + items.length) % items.length]?.focus();
      } else if (e.key === "Home") {
        e.preventDefault();
        items[0]?.focus();
      } else if (e.key === "End") {
        e.preventDefault();
        items[items.length - 1]?.focus();
      }
    };
    panel.addEventListener("keydown", onKey);
    return () => panel.removeEventListener("keydown", onKey);
  }, [open]);

  // Attach ref to trigger via cloneElement.
  const TriggerEl = trigger as React.ReactElement<{
    ref?: React.Ref<HTMLElement>;
    onClick?: (e: React.MouseEvent) => void;
  }>;
  const triggerWithRef = React.cloneElement(TriggerEl, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
    },
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      setOpen((o) => !o);
      TriggerEl.props.onClick?.(e);
    },
  });

  const closeAndNotify = () => {
    setOpen(false);
    onAfterItemClick?.();
  };

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
            minWidth: width,
            background: "var(--surface-2)",
            border: "1px solid var(--border-default)",
            boxShadow: "var(--shadow-md)",
            zIndex: "var(--z-dropdown)",
          }}
        >
          {items.map((it, i) => {
            if (it.type === "separator") {
              return (
                <div
                  key={`sep-${i}`}
                  aria-hidden
                  style={{ borderTop: "1px solid var(--border-subtle)" }}
                />
              );
            }
            if (it.type === "label") {
              return (
                <div
                  key={`label-${i}`}
                  className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-faint)" }}
                >
                  {it.label}
                </div>
              );
            }
            return (
              <DropdownItemRow key={i} item={it} onAfter={closeAndNotify} />
            );
          })}
        </div>
      )}
    </span>
  );
}

function DropdownItemRow({
  item,
  onAfter,
}: {
  item: Extract<DropdownItem, { type?: "item" }>;
  onAfter: () => void;
}) {
  const style: React.CSSProperties = {
    color: item.destructive
      ? "var(--danger-fg)"
      : item.disabled
      ? "var(--text-faint)"
      : "var(--text-default)",
    opacity: item.disabled ? 0.6 : 1,
  };
  const className = cn(
    "ts-focus flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
    !item.disabled && "hover:bg-[color:var(--surface-3)]",
  );
  const inner = (
    <>
      {item.leftIcon && (
        <span style={{ color: item.destructive ? "var(--danger-fg)" : "var(--text-muted)" }}>
          {item.leftIcon}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.rightSlot && (
        <span className="ml-auto inline-flex shrink-0 items-center">{item.rightSlot}</span>
      )}
    </>
  );

  if (item.form) {
    // Form item: render the children inline; the form's own submit button
    // carries role="menuitem". Consumers pass their <button type="submit">
    // with label text via renderProp pattern would be overkill — for now
    // assume the form mirrors the item label internally and we just close
    // on click so the menu doesn't stick around during the server action.
    return (
      <div role="menuitem" tabIndex={-1} className={className} style={style} onClick={onAfter}>
        {item.form}
      </div>
    );
  }
  if (item.href) {
    return (
      <a
        role="menuitem"
        href={item.href}
        tabIndex={-1}
        className={className}
        style={style}
        onClick={() => onAfter()}
      >
        {inner}
      </a>
    );
  }
  return (
    <button
      role="menuitem"
      type="button"
      tabIndex={-1}
      disabled={item.disabled}
      onClick={() => {
        if (item.disabled) return;
        item.onClick?.();
        onAfter();
      }}
      className={className}
      style={style}
    >
      {inner}
    </button>
  );
}
