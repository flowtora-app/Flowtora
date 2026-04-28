"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

// Tooltip — hover- and focus-triggered hint anchored to its trigger.
// Renders into <body> via a portal so it never gets clipped by an
// overflow-hidden ancestor. Position math is a quick measure-and-place
// pass; we don't try to be a full floating-ui replacement.
//
//   <Tooltip content="Save the proof">
//     <Button>Save</Button>
//   </Tooltip>

type Side = "top" | "bottom" | "left" | "right";

export interface TooltipProps {
  content: React.ReactNode;
  /** Where to put the tooltip relative to the trigger. */
  side?: Side;
  /** Extra px of gap between trigger and tooltip. */
  sideOffset?: number;
  /** ms before showing. */
  delay?: number;
  /** Disable the tooltip without unmounting. */
  disabled?: boolean;
  className?: string;
  children: React.ReactElement;
}

export function Tooltip({
  content,
  side = "top",
  sideOffset = 6,
  delay = 250,
  disabled = false,
  className,
  children,
}: TooltipProps) {
  const [open, setOpen] = React.useState(false);
  const [coords, setCoords] = React.useState<{ left: number; top: number } | null>(null);
  const triggerRef = React.useRef<HTMLElement>(null);
  const tipRef = React.useRef<HTMLDivElement>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactId = React.useId();
  const tipId = `tooltip-${reactId}`;

  const cancelTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const show = () => {
    if (disabled) return;
    cancelTimer();
    timerRef.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    cancelTimer();
    setOpen(false);
  };

  // Recompute position on open and on scroll/resize.
  React.useLayoutEffect(() => {
    if (!open) return;
    const compute = () => {
      const trig = triggerRef.current;
      const tip = tipRef.current;
      if (!trig || !tip) return;
      setCoords(place(trig.getBoundingClientRect(), tip.getBoundingClientRect(), side, sideOffset));
    };
    compute();
    window.addEventListener("scroll", compute, true);
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute, true);
      window.removeEventListener("resize", compute);
    };
  }, [open, side, sideOffset]);

  // Inject ref + a11y / event handlers into the child element.
  const trigger = React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      const childRef = (children as { ref?: React.Ref<HTMLElement> }).ref;
      if (typeof childRef === "function") childRef(node);
      else if (childRef && typeof childRef === "object") (childRef as React.MutableRefObject<HTMLElement | null>).current = node;
    },
    onMouseEnter: chain((children.props as { onMouseEnter?: () => void }).onMouseEnter, show),
    onMouseLeave: chain((children.props as { onMouseLeave?: () => void }).onMouseLeave, hide),
    onFocus:      chain((children.props as { onFocus?: () => void }).onFocus,      show),
    onBlur:       chain((children.props as { onBlur?: () => void }).onBlur,        hide),
    "aria-describedby": tipId,
  });

  return (
    <>
      {trigger}
      {open && coords && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={tipRef}
            id={tipId}
            role="tooltip"
            className={cn(
              "pointer-events-none fixed z-[var(--z-tooltip)] max-w-xs rounded-md px-2 py-1 text-xs shadow-md",
              className,
            )}
            style={{
              left: coords.left,
              top: coords.top,
              background: "var(--surface-inverse)",
              color: "var(--text-inverse)",
              boxShadow: "var(--shadow-md)",
            }}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}

function place(trig: DOMRect, tip: DOMRect, side: Side, gap: number): { left: number; top: number } {
  const cx = trig.left + trig.width / 2;
  const cy = trig.top + trig.height / 2;

  let left = 0;
  let top = 0;
  switch (side) {
    case "top":
      left = cx - tip.width / 2;
      top = trig.top - tip.height - gap;
      break;
    case "bottom":
      left = cx - tip.width / 2;
      top = trig.bottom + gap;
      break;
    case "left":
      left = trig.left - tip.width - gap;
      top = cy - tip.height / 2;
      break;
    case "right":
      left = trig.right + gap;
      top = cy - tip.height / 2;
      break;
  }

  // Clamp inside viewport with a small margin.
  const margin = 8;
  left = Math.max(margin, Math.min(window.innerWidth - tip.width - margin, left));
  top = Math.max(margin, Math.min(window.innerHeight - tip.height - margin, top));
  return { left, top };
}

function chain<F extends (...a: never[]) => void>(...fns: (F | undefined)[]) {
  return (...args: Parameters<F>) => {
    for (const f of fns) f?.(...args);
  };
}
