"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// Dialog — Spec Page 0 §0.5.28.
//
// Built on native <dialog> because:
//   1. Accessible by default (focus trap, ESC, inert bg).
//   2. No portal plumbing; lives where declared.
//   3. Zero runtime deps.
//
// Sizes (spec): sm 400, md 560 (default), lg 720, xl 960, 2xl 1200,
// full (100% minus 64px gutter).
// Variants (spec): standard, confirmation (icon + heading + 2 buttons),
// destructive (rose icon + type-to-confirm input).
// Behavior: focus trap, return focus, ESC to close, click backdrop to
// close (configurable), prevent close while submitting (`busy`).
//
// Body is scrollable with max-height 70vh per spec.
//
// Slot pattern:
//   <Dialog open={o} onClose={() => setO(false)}>
//     <DialogHeader title="…" description="…" onClose={...} />
//     <DialogBody>…</DialogBody>
//     <DialogFooter>...</DialogFooter>
//   </Dialog>
// Or use the shorthand confirmation/destructive variants below.

type DialogSize = "sm" | "md" | "lg" | "xl" | "2xl" | "full";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  size?: DialogSize;
  /** Allow backdrop / ESC close. Defaults to true. Set false on
   *  destructive flows. */
  dismissible?: boolean;
  /** Spec §0.5.28 — when true, ESC + backdrop are blocked even if
   *  `dismissible` is true. Use during async submit so the user
   *  cannot dismiss mid-mutation. */
  busy?: boolean;
  className?: string;
}

// Spec sizes use raw pixels, not Tailwind max-w shortcuts (which don't
// hit the spec values). 1rem * 100 ≠ 1600px without arbitrary classes.
const SIZE_PX: Record<DialogSize, string> = {
  sm:    "400px",
  md:    "560px",
  lg:    "720px",
  xl:    "960px",
  "2xl": "1200px",
  full:  "calc(100vw - 64px)",
};

export function Dialog({
  open,
  onClose,
  children,
  size = "md",
  dismissible = true,
  busy = false,
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
    if (!dismissible || busy) return;
    if (e.target === ref.current) onClose();
  };

  return (
    <>
      <dialog
        ref={ref}
        onClick={onClick}
        onCancel={(e) => {
          if (!dismissible || busy) e.preventDefault();
        }}
        className={cn(
          "ts-dialog rounded-xl p-0 backdrop:backdrop-blur-sm",
          className,
        )}
        style={{
          background: "var(--surface-2)",
          color: "var(--text-default)",
          border: "1px solid var(--border-default)",
          boxShadow: "var(--shadow-xl, var(--shadow-lg))",
          width: `min(${SIZE_PX[size]}, calc(100vw - 32px))`,
        }}
      >
        {/* Inner wrapper so backdrop click detection isn't confused by
            children clicks. The outer <dialog> handles only backdrop.
            role="presentation" keeps AT from treating the div's
            onClick as interactive; ESC + the header close button
            remain the semantic dismiss paths. */}
        <div
          role="presentation"
          onClick={(e) => e.stopPropagation()}
          style={{ display: "flex", flexDirection: "column", maxHeight: "85vh" }}
        >
          {children}
        </div>
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
  // Spec §0.5.28 — body is scrollable with max-height 70vh. We split
  // the height between header/footer (sticky) and body (scrolling).
  return (
    <div
      className={cn("px-5 py-4 text-sm", className)}
      style={{ overflowY: "auto", maxHeight: "70vh" }}
      {...rest}
    />
  );
}

export interface DialogFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Spec §0.5.28 — left-side slot (typically Cancel / secondary). */
  left?: React.ReactNode;
}

export function DialogFooter({ left, className, children, ...rest }: DialogFooterProps) {
  if (left) {
    return (
      <div
        className={cn("flex items-center gap-2 px-5 py-3", className)}
        style={{ borderTop: "1px solid var(--border-subtle)" }}
        {...rest}
      >
        <div className="flex items-center gap-2">{left}</div>
        <div className="ml-auto flex items-center gap-2">{children}</div>
      </div>
    );
  }
  return (
    <div
      className={cn("flex items-center justify-end gap-2 px-5 py-3", className)}
      style={{ borderTop: "1px solid var(--border-subtle)" }}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  /** Heading text. */
  title: string;
  /** Body copy. */
  description?: React.ReactNode;
  /** Confirm button label. Spec convention: matches the verb (e.g. "Delete tenant"). */
  confirmLabel?: string;
  /** Cancel button label. */
  cancelLabel?: string;
  /** Click handler for confirm. Can be async — `busy` is set while awaiting. */
  onConfirm: () => void | Promise<void>;
  /** Spec §0.5.28 destructive variant: rose icon + "type to confirm" input. */
  variant?: "confirmation" | "destructive";
  /** When `variant="destructive"`, the user must type this exact string
   *  before the confirm button enables. Spec example: tenant slug. */
  typeToConfirm?: string;
}

/**
 * Confirmation / destructive dialog shorthand. Implements the spec's
 * "confirmation" + "destructive" variants without forcing every call
 * site to wire up DialogHeader/Body/Footer manually.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  variant = "confirmation",
  typeToConfirm,
}: ConfirmDialogProps) {
  const [busy, setBusy] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const isDestructive = variant === "destructive";
  const typeOk = typeToConfirm ? typed.trim() === typeToConfirm : true;
  const canConfirm = typeOk && !busy;

  React.useEffect(() => {
    if (!open) {
      setTyped("");
      setBusy(false);
    }
  }, [open]);

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} size="sm" busy={busy} dismissible={!busy}>
      <div className="flex items-start gap-3 px-5 pt-5">
        <span
          aria-hidden
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{
            background: isDestructive ? "var(--rose-100, var(--danger-surface))" : "var(--brand-100, var(--accent-surface))",
            color:      isDestructive ? "var(--rose-600, var(--danger-fg))"     : "var(--brand-700, var(--accent-primary))",
            fontSize: 18,
          }}
        >
          {isDestructive ? "!" : "?"}
        </span>
        <div className="flex-1">
          <div className="text-base font-semibold" style={{ color: "var(--text-default)" }}>
            {title}
          </div>
          {description && (
            <div className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              {description}
            </div>
          )}
        </div>
      </div>
      {typeToConfirm && (
        <div className="px-5 pb-1 pt-4">
          <label className="block">
            <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Type <code style={{ color: "var(--text-default)" }}>{typeToConfirm}</code> to confirm
            </span>
            <input
              type="text"
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={busy}
              className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none"
              style={{
                background: "var(--surface-1)",
                borderColor: "var(--border-default)",
                color: "var(--text-default)",
              }}
            />
          </label>
        </div>
      )}
      <DialogFooter
        left={
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="ts-focus rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            style={{
              background: "var(--surface-1)",
              borderColor: "var(--border-default)",
              color: "var(--text-default)",
            }}
          >
            {cancelLabel}
          </button>
        }
      >
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!canConfirm}
          className="ts-focus rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: isDestructive ? "var(--rose-600, var(--danger))" : "var(--brand-600, var(--accent-primary))",
            color: "#ffffff",
          }}
        >
          {busy ? "Working…" : (confirmLabel ?? (isDestructive ? "Delete" : "Confirm"))}
        </button>
      </DialogFooter>
    </Dialog>
  );
}
