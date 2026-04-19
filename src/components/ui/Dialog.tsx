"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// Dialog — modal built on native <dialog>. We reach for it because:
//   1. It's accessible by default (focus trap, ESC handling, inert bg).
//   2. No portal plumbing; sits in DOM where declared.
//   3. Zero runtime deps.
//
// The API intentionally tracks `open` state externally so callers can
// drive it from a parent (e.g. `useState`, URL state, confirmation
// pattern). We auto-call showModal()/close() to keep DOM in sync.
//
// Three layout parts compose via slots rather than children:
//   <Dialog open={o} onClose={() => setO(false)}>
//     <DialogHeader title="Delete account" description="…" />
//     <DialogBody>…</DialogBody>
//     <DialogFooter>
//       <Button variant="secondary">Cancel</Button>
//       <Button variant="danger">Delete</Button>
//     </DialogFooter>
//   </Dialog>

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  dismissible?: boolean; // allow backdrop/ESC close; default true
  className?: string;
}

const SIZE_CLASS: Record<NonNullable<DialogProps["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
};

export function Dialog({
  open,
  onClose,
  children,
  size = "md",
  dismissible = true,
  className,
}: DialogProps) {
  const ref = React.useRef<HTMLDialogElement>(null);

  // Sync external `open` → DOM method calls. We can't just rely on the
  // `open` attribute because dialogs need showModal() to get a backdrop
  // and focus trap.
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  // Listen for native close events (ESC, dialog.close() elsewhere) so
  // the parent state stays in lockstep.
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onNativeClose = () => onClose();
    el.addEventListener("close", onNativeClose);
    return () => el.removeEventListener("close", onNativeClose);
  }, [onClose]);

  // Click-outside to dismiss. Native <dialog> fires click on the
  // element itself when the backdrop is clicked; we detect by checking
  // whether the click target equals the dialog (not a descendant).
  const onClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (!dismissible) return;
    if (e.target === ref.current) onClose();
  };

  return (
    <>
      <dialog
        ref={ref}
        onClick={onClick}
        onCancel={(e) => {
          if (!dismissible) e.preventDefault();
        }}
        className={cn(
          "ts-dialog w-[calc(100vw-2rem)] rounded-xl p-0 backdrop:backdrop-blur-sm",
          SIZE_CLASS[size],
          className,
        )}
        style={{
          background: "var(--surface-2)",
          color: "var(--text-default)",
          border: "1px solid var(--border-default)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        {/* Inner wrapper so backdrop click detection isn't confused by
            children clicks. The outer <dialog> handles only backdrop.
            Phase 23 — role="presentation" keeps AT from treating the
            div's onClick as interactive; ESC + the header close button
            remain the semantic dismiss paths. */}
        <div role="presentation" onClick={(e) => e.stopPropagation()}>{children}</div>
      </dialog>
      <style>{`
        .ts-dialog::backdrop {
          background: rgba(0, 0, 0, 0.55);
        }
      `}</style>
    </>
  );
}

export interface DialogHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  onClose?: () => void;
}

export function DialogHeader({ title, description, onClose }: DialogHeaderProps) {
  return (
    <div
      className="flex items-start justify-between gap-4 px-5 py-4"
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
    >
      <div className="min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        {description && (
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
            {description}
          </p>
        )}
      </div>
      {onClose && (
        <button
          type="button"
          aria-label="Close dialog"
          onClick={onClose}
          className="ts-focus inline-flex h-6 w-6 items-center justify-center rounded-md text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          ×
        </button>
      )}
    </div>
  );
}

export function DialogBody({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4 text-sm", className)} {...rest} />;
}

export function DialogFooter({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center justify-end gap-2 px-5 py-3", className)}
      style={{ borderTop: "1px solid var(--border-subtle)" }}
      {...rest}
    />
  );
}
