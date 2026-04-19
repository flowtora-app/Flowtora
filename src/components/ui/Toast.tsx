"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// Toast — ephemeral feedback primitive.
//
// Consumption:
//   const toast = useToast();
//   toast.success("Saved.");
//   toast.error("Couldn't save", { description: err.message });
//   toast.info("Invite sent", { action: { label: "Undo", onClick: undo } });
//
// Design choices:
// - One <ToastProvider> mounted in the app shell; children share the queue.
// - Auto-dismiss defaults to 4s; errors stay up until dismissed (6s).
// - Stacks vertically bottom-right; newest at the bottom.
// - Keyboard: ESC dismisses the topmost toast.
// - Respects prefers-reduced-motion (no slide-in, just fade).
//
// The imperative API (toast.success/error/info) is deliberately small so
// call sites don't have to import a Variant enum. For an undo button, pass
// `action: { label, onClick }` — the toast dismisses after onClick.

type Variant = "success" | "error" | "info" | "warning";

export interface ToastOptions {
  description?: React.ReactNode;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastRecord extends ToastOptions {
  id: number;
  variant: Variant;
  title: React.ReactNode;
}

interface ToastContextValue {
  push: (variant: Variant, title: React.ReactNode, opts?: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION: Record<Variant, number> = {
  success: 4000,
  info: 4000,
  warning: 5000,
  error: 6000,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastRecord[]>([]);
  const nextIdRef = React.useRef(1);

  const dismiss = React.useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = React.useCallback<ToastContextValue["push"]>(
    (variant, title, opts) => {
      const id = nextIdRef.current++;
      const rec: ToastRecord = { id, variant, title, ...opts };
      setToasts((prev) => [...prev, rec]);
      const duration = opts?.duration ?? DEFAULT_DURATION[variant];
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
      return id;
    },
    [dismiss],
  );

  // Global ESC dismisses the most recent toast.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setToasts((prev) => (prev.length === 0 ? prev : prev.slice(0, -1)));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = React.useMemo<ToastContextValue>(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/**
 * Hook API. Must be inside <ToastProvider>. If someone calls it outside
 * the provider, the calls become no-ops rather than throwing — it's safer
 * to silently swallow a toast than crash the page on a missing provider.
 */
export function useToast() {
  const ctx = React.useContext(ToastContext);

  return React.useMemo(
    () => ({
      success: (title: React.ReactNode, opts?: ToastOptions) => ctx?.push("success", title, opts) ?? -1,
      error: (title: React.ReactNode, opts?: ToastOptions) => ctx?.push("error", title, opts) ?? -1,
      info: (title: React.ReactNode, opts?: ToastOptions) => ctx?.push("info", title, opts) ?? -1,
      warning: (title: React.ReactNode, opts?: ToastOptions) => ctx?.push("warning", title, opts) ?? -1,
      dismiss: (id: number) => ctx?.dismiss(id),
    }),
    [ctx],
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastRecord[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div
      role="region"
      aria-label="Notifications"
      className="pointer-events-none fixed inset-0 z-[var(--z-toast,60)] flex flex-col items-end justify-end gap-2 p-4 sm:p-6"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

const VARIANT_STYLE: Record<Variant, { bg: string; fg: string; icon: string; ring: string }> = {
  success: {
    bg: "var(--success-surface)",
    fg: "var(--success-fg)",
    icon: "✓",
    ring: "var(--success-fg)",
  },
  error: {
    bg: "var(--danger-surface)",
    fg: "var(--danger-fg)",
    icon: "!",
    ring: "var(--danger-fg)",
  },
  warning: {
    bg: "var(--warning-surface, var(--accent-surface))",
    fg: "var(--warning-fg, var(--accent-primary))",
    icon: "!",
    ring: "var(--warning-fg, var(--accent-primary))",
  },
  info: {
    bg: "var(--accent-surface)",
    fg: "var(--accent-primary)",
    icon: "i",
    ring: "var(--accent-primary)",
  },
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastRecord;
  onDismiss: (id: number) => void;
}) {
  const v = VARIANT_STYLE[toast.variant];
  return (
    <div
      role={toast.variant === "error" ? "alert" : "status"}
      className={cn(
        "ts-toast pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg px-4 py-3 shadow-lg",
      )}
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-default)",
        boxShadow: "var(--shadow-lg, 0 10px 30px rgba(0,0,0,0.2))",
      }}
    >
      <span
        aria-hidden
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold"
        style={{ background: v.bg, color: v.fg }}
      >
        {v.icon}
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-medium leading-snug" style={{ color: "var(--text-default)" }}>
          {toast.title}
        </div>
        {toast.description && (
          <div className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
            {toast.description}
          </div>
        )}
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action?.onClick();
              onDismiss(toast.id);
            }}
            className="mt-2 text-xs font-medium underline"
            style={{ color: v.fg }}
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
        className="shrink-0 rounded p-1 text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        ×
      </button>
      <style>{`
        .ts-toast {
          animation: ts-toast-in 200ms ease-out;
        }
        @keyframes ts-toast-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .ts-toast { animation: none; }
        }
      `}</style>
    </div>
  );
}
