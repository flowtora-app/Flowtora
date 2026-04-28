"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

// Popover — anchored floating panel. Mounts a portal at the body so the
// content escapes overflow-hidden ancestors. Closes on outside click,
// Escape, or scroll on a parent. Use the convenience component:
//
//   <Popover trigger={<button>Filters</button>}>
//     <FilterPanel />
//   </Popover>
//
// Or the compositional API for more control:
//
//   <PopoverRoot open={open} onOpenChange={setOpen}>
//     <PopoverTrigger asChild><button>…</button></PopoverTrigger>
//     <PopoverContent>…</PopoverContent>
//   </PopoverRoot>

type Align = "start" | "center" | "end";
type Side = "top" | "bottom" | "left" | "right";

interface PopoverContextValue {
  open: boolean;
  setOpen: (next: boolean) => void;
  triggerRef: React.MutableRefObject<HTMLElement | null>;
  contentRef: React.MutableRefObject<HTMLDivElement | null>;
  side: Side;
  align: Align;
  sideOffset: number;
  contentId: string;
}
const PopoverContext = React.createContext<PopoverContextValue | null>(null);

export interface PopoverRootProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (next: boolean) => void;
  side?: Side;
  align?: Align;
  sideOffset?: number;
  children: React.ReactNode;
}

export function PopoverRoot({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  side = "bottom",
  align = "start",
  sideOffset = 6,
  children,
}: PopoverRootProps) {
  const isControlled = controlledOpen !== undefined;
  const [internal, setInternal] = React.useState(defaultOpen);
  const open = isControlled ? !!controlledOpen : internal;
  const setOpen = (next: boolean) => {
    if (!isControlled) setInternal(next);
    onOpenChange?.(next);
  };
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const reactId = React.useId();
  const ctx = React.useMemo<PopoverContextValue>(
    () => ({ open, setOpen, triggerRef, contentRef, side, align, sideOffset, contentId: `popover-${reactId}` }),
    [open, side, align, sideOffset, reactId],
  );
  return <PopoverContext.Provider value={ctx}>{children}</PopoverContext.Provider>;
}

export interface PopoverTriggerProps extends React.HTMLAttributes<HTMLElement> {
  asChild?: boolean;
  children: React.ReactNode;
}

export function PopoverTrigger({ asChild, children, onClick, ...rest }: PopoverTriggerProps) {
  const ctx = React.useContext(PopoverContext);
  if (!ctx) throw new Error("PopoverTrigger must be used inside <PopoverRoot>");

  const handleClick = (e: React.MouseEvent) => {
    onClick?.(e as never);
    ctx.setOpen(!ctx.open);
  };

  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<Record<string, unknown>>;
    const childOnClick = (child.props as { onClick?: (e: React.MouseEvent) => void }).onClick;
    return React.cloneElement(child, {
      ref: (node: HTMLElement | null) => {
        ctx.triggerRef.current = node;
        const cr = (child as { ref?: React.Ref<HTMLElement> }).ref;
        if (typeof cr === "function") cr(node);
        else if (cr && typeof cr === "object") (cr as React.MutableRefObject<HTMLElement | null>).current = node;
      },
      onClick: (e: React.MouseEvent) => {
        childOnClick?.(e);
        handleClick(e);
      },
      "aria-expanded": ctx.open,
      "aria-controls": ctx.contentId,
    });
  }

  return (
    <button
      type="button"
      ref={(node) => {
        ctx.triggerRef.current = node;
      }}
      onClick={handleClick}
      aria-expanded={ctx.open}
      aria-controls={ctx.contentId}
      {...rest}
    >
      {children}
    </button>
  );
}

export interface PopoverContentProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Override side/align set on the root. */
  side?: Side;
  align?: Align;
  sideOffset?: number;
  className?: string;
  children: React.ReactNode;
}

export function PopoverContent({
  side: sideProp,
  align: alignProp,
  sideOffset: offsetProp,
  className,
  style,
  children,
  ...rest
}: PopoverContentProps) {
  const ctx = React.useContext(PopoverContext);
  if (!ctx) throw new Error("PopoverContent must be used inside <PopoverRoot>");
  const side = sideProp ?? ctx.side;
  const align = alignProp ?? ctx.align;
  const offset = offsetProp ?? ctx.sideOffset;

  const [coords, setCoords] = React.useState<{ left: number; top: number } | null>(null);

  React.useLayoutEffect(() => {
    if (!ctx.open) return;
    const compute = () => {
      const trig = ctx.triggerRef.current;
      const cont = ctx.contentRef.current;
      if (!trig || !cont) return;
      setCoords(place(trig.getBoundingClientRect(), cont.getBoundingClientRect(), side, align, offset));
    };
    compute();
    window.addEventListener("scroll", compute, true);
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute, true);
      window.removeEventListener("resize", compute);
    };
  }, [ctx.open, ctx.triggerRef, ctx.contentRef, side, align, offset]);

  // Outside click + escape close.
  React.useEffect(() => {
    if (!ctx.open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      const c = ctx.contentRef.current;
      const t = ctx.triggerRef.current;
      if (c && target && c.contains(target)) return;
      if (t && target && t.contains(target)) return;
      ctx.setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") ctx.setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ctx]);

  if (!ctx.open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={ctx.contentRef}
      id={ctx.contentId}
      role="dialog"
      className={cn(
        "fixed z-[var(--z-overlay)] rounded-md py-1",
        className,
      )}
      style={{
        left: coords?.left ?? -9999,
        top: coords?.top ?? -9999,
        background: "var(--surface-2)",
        border: "1px solid var(--border-default)",
        boxShadow: "var(--shadow-lg)",
        color: "var(--text-default)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>,
    document.body,
  );
}

// Convenience wrapper — most callers don't need the compositional API.
export interface PopoverProps {
  trigger: React.ReactNode;
  /** Defaults to wrapping `trigger` in a <button>. Set true if it's already one. */
  asChild?: boolean;
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  side?: Side;
  align?: Align;
  sideOffset?: number;
  className?: string;
  children: React.ReactNode;
}

export function Popover({
  trigger,
  asChild,
  open,
  onOpenChange,
  side,
  align,
  sideOffset,
  className,
  children,
}: PopoverProps) {
  return (
    <PopoverRoot open={open} onOpenChange={onOpenChange} side={side} align={align} sideOffset={sideOffset}>
      <PopoverTrigger asChild={asChild}>{trigger}</PopoverTrigger>
      <PopoverContent className={className}>{children}</PopoverContent>
    </PopoverRoot>
  );
}

function place(
  trig: DOMRect,
  cont: DOMRect,
  side: Side,
  align: Align,
  gap: number,
): { left: number; top: number } {
  let left = 0;
  let top = 0;

  if (side === "bottom" || side === "top") {
    if (align === "start") left = trig.left;
    else if (align === "end") left = trig.right - cont.width;
    else left = trig.left + trig.width / 2 - cont.width / 2;
    top = side === "bottom" ? trig.bottom + gap : trig.top - cont.height - gap;
  } else {
    if (align === "start") top = trig.top;
    else if (align === "end") top = trig.bottom - cont.height;
    else top = trig.top + trig.height / 2 - cont.height / 2;
    left = side === "right" ? trig.right + gap : trig.left - cont.width - gap;
  }

  // Clamp into the viewport.
  const m = 8;
  left = Math.max(m, Math.min(window.innerWidth - cont.width - m, left));
  top = Math.max(m, Math.min(window.innerHeight - cont.height - m, top));
  return { left, top };
}
