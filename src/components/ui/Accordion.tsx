"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// Accordion — Spec Page 0 §0.5.23.
//
// Variants:
//   single-open / multi-open (controlled by `mode`)
// Visual variants:
//   boxed     — each item rendered as its own card (default)
//   bordered  — full-width with horizontal dividers between items
//   ghost     — borderless, dividers only
// Anatomy: trigger row (chevron + label + optional helper) + animated
// panel (height transition 200ms).
//
// Imperative content slot — pass children as <AccordionItem> children.
// Internally uses uncontrolled <details>-like state via React, with
// chevron animation + height-transition body. Native <details> would
// give us free a11y but doesn't animate panels well across browsers.

type Mode = "single" | "multi";
type Variant = "boxed" | "bordered" | "ghost";

interface AccordionContextValue {
  open: Set<string>;
  toggle: (id: string) => void;
  variant: Variant;
}

const AccordionContext = React.createContext<AccordionContextValue | null>(null);

export interface AccordionProps {
  /** Default-open item ids. */
  defaultOpen?: string[];
  /** Controlled open ids — pair with `onOpenChange`. */
  open?: string[];
  onOpenChange?: (next: string[]) => void;
  mode?: Mode;
  variant?: Variant;
  className?: string;
  children: React.ReactNode;
}

export function Accordion({
  defaultOpen = [],
  open,
  onOpenChange,
  mode = "single",
  variant = "boxed",
  className,
  children,
}: AccordionProps) {
  const [internalOpen, setInternalOpen] = React.useState<string[]>(defaultOpen);
  const isControlled = open !== undefined;
  const openIds = isControlled ? open : internalOpen;
  const openSet = React.useMemo(() => new Set(openIds), [openIds]);

  const toggle = React.useCallback(
    (id: string) => {
      const next = (() => {
        if (mode === "single") {
          return openSet.has(id) ? [] : [id];
        }
        if (openSet.has(id)) return openIds.filter((x) => x !== id);
        return [...openIds, id];
      })();
      if (isControlled) {
        onOpenChange?.(next);
      } else {
        setInternalOpen(next);
      }
    },
    [mode, openSet, openIds, isControlled, onOpenChange],
  );

  const ctx = React.useMemo(() => ({ open: openSet, toggle, variant }), [openSet, toggle, variant]);

  return (
    <AccordionContext.Provider value={ctx}>
      <div
        className={cn(
          variant === "boxed"    && "flex flex-col gap-2",
          variant === "bordered" && "flex flex-col rounded-lg border",
          variant === "ghost"    && "flex flex-col",
          className,
        )}
        style={
          variant === "bordered"
            ? { background: "var(--surface-1)", borderColor: "var(--border-subtle)" }
            : undefined
        }
      >
        {children}
      </div>
    </AccordionContext.Provider>
  );
}

export interface AccordionItemProps {
  id: string;
  trigger: React.ReactNode;
  /** Optional helper rendered to the right of the label. */
  helper?: React.ReactNode;
  /** Optional leading icon. */
  icon?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function AccordionItem({
  id,
  trigger,
  helper,
  icon,
  disabled,
  className,
  children,
}: AccordionItemProps) {
  const ctx = React.useContext(AccordionContext);
  if (!ctx) throw new Error("AccordionItem must be used inside Accordion");
  const open = ctx.open.has(id);
  const variant = ctx.variant;

  const itemClass = (() => {
    if (variant === "boxed") {
      return "rounded-lg border";
    }
    if (variant === "bordered") {
      // Dividers above each item except the first.
      return "first:border-t-0 border-t";
    }
    return "border-t first:border-t-0";
  })();

  const itemStyle: React.CSSProperties =
    variant === "boxed"
      ? { background: "var(--surface-1)", borderColor: "var(--border-subtle)" }
      : { borderColor: "var(--border-subtle)" };

  return (
    <div className={cn(itemClass, className)} style={itemStyle}>
      <button
        type="button"
        onClick={() => !disabled && ctx.toggle(id)}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={`accordion-panel-${id}`}
        id={`accordion-trigger-${id}`}
        className={cn(
          "ts-focus flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors",
          "disabled:cursor-not-allowed disabled:opacity-50",
          !disabled && "hover:bg-[var(--surface-2)]",
        )}
      >
        <span
          aria-hidden
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center transition-transform"
          style={{
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            transitionDuration: "200ms",
            color: "var(--text-muted)",
          }}
        >
          <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6,3 11,8 6,13" />
          </svg>
        </span>
        {icon && <span className="inline-flex shrink-0">{icon}</span>}
        <span className="min-w-0 flex-1 font-medium" style={{ color: "var(--text-default)" }}>
          {trigger}
        </span>
        {helper && (
          <span className="shrink-0 text-xs" style={{ color: "var(--text-muted)" }}>
            {helper}
          </span>
        )}
      </button>
      {/* Panel: spec §0.5.23 height transition 200ms. We can't animate
          height: auto, so we lean on grid-rows-[0fr→1fr] which works
          in modern browsers and falls back to a snap on older ones. */}
      <div
        id={`accordion-panel-${id}`}
        role="region"
        aria-labelledby={`accordion-trigger-${id}`}
        className="grid transition-[grid-template-rows] duration-200"
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
        }}
      >
        <div className="overflow-hidden">
          <div
            className="px-4 pb-3 text-sm"
            style={{
              color: "var(--text-default)",
              borderTop: open ? "1px solid var(--border-subtle)" : "1px solid transparent",
              paddingTop: open ? "0.75rem" : 0,
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
