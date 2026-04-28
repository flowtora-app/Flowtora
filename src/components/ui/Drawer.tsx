"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

// Drawer — sheet-style overlay anchored to the right or bottom of the
// viewport. Useful for filter panels, mobile-style quick actions, and
// detail flyouts. Closes on backdrop click, Escape, or the close button
// in the header.
//
//   <Drawer open={open} onOpenChange={setOpen} side="right" size="md" title="Filters">
//     <FilterPanel />
//   </Drawer>

type Side = "right" | "bottom";
type Size = "sm" | "md" | "lg" | "xl" | "full";

const RIGHT_WIDTH: Record<Size, string> = {
  sm:   "320px",
  md:   "440px",
  lg:   "560px",
  xl:   "720px",
  full: "100vw",
};

const BOTTOM_HEIGHT: Record<Size, string> = {
  sm:   "30vh",
  md:   "50vh",
  lg:   "70vh",
  xl:   "85vh",
  full: "100vh",
};

export interface DrawerProps {
  open: boolean;
  onOpenChange?: (next: boolean) => void;
  side?: Side;
  size?: Size;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Hide the default header (title + close). When false caller renders header inside children. */
  showHeader?: boolean;
  /** Hide the default footer wrapper. */
  footer?: React.ReactNode;
  /** Disable backdrop click + escape close. */
  dismissible?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Drawer({
  open,
  onOpenChange,
  side = "right",
  size = "md",
  title,
  description,
  showHeader = true,
  footer,
  dismissible = true,
  className,
  children,
}: DrawerProps) {
  // Lock body scroll while open.
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Escape close.
  React.useEffect(() => {
    if (!open || !dismissible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange?.(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, dismissible, onOpenChange]);

  if (!open || typeof document === "undefined") return null;

  const panelStyle: React.CSSProperties =
    side === "right"
      ? {
          top: 0,
          right: 0,
          bottom: 0,
          width: RIGHT_WIDTH[size],
          maxWidth: "100vw",
          background: "var(--surface-1)",
          borderInlineStart: "1px solid var(--border-default)",
          boxShadow: "var(--shadow-lg)",
        }
      : {
          left: 0,
          right: 0,
          bottom: 0,
          height: BOTTOM_HEIGHT[size],
          maxHeight: "100vh",
          background: "var(--surface-1)",
          borderTop: "1px solid var(--border-default)",
          boxShadow: "var(--shadow-lg)",
          borderTopLeftRadius: "var(--radius-xl)",
          borderTopRightRadius: "var(--radius-xl)",
        };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === "string" ? title : undefined}
      className="fixed inset-0 z-[var(--z-modal)]"
    >
      <div
        onClick={() => dismissible && onOpenChange?.(false)}
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.45)" }}
      />
      <div
        className={cn("absolute flex flex-col", className)}
        style={panelStyle}
      >
        {showHeader && (
          <div
            className="flex items-start justify-between gap-4 px-5 py-4"
            style={{ borderBottom: "1px solid var(--border-subtle)" }}
          >
            <div className="min-w-0">
              {title && (
                <div className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
                  {title}
                </div>
              )}
              {description && (
                <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                  {description}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => onOpenChange?.(false)}
              aria-label="Close"
              className="rounded p-1 transition-colors"
              style={{ color: "var(--text-muted)" }}
            >
              <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <line x1="4" y1="4" x2="12" y2="12" />
                <line x1="12" y1="4" x2="4" y2="12" />
              </svg>
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {children}
        </div>
        {footer && (
          <div
            className="flex items-center justify-end gap-2 px-5 py-3"
            style={{ borderTop: "1px solid var(--border-subtle)" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
