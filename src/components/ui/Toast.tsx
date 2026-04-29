"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// Toast — Spec Page 0 §0.5.30.
//
// Variants: info (sky), success (emerald), warning (amber), error
// (rose), loading (with spinner), promise (chains pending → resolved
// or rejected).
// Position: top-right (default; configurable via ToastProvider prop).
// Behavior: auto-dismiss after 5s (10s for error), pause on hover,
// max stack 5. Promise toast persists until resolved.
//
// Consumption:
//   const toast = useToast();
//   toast.success("Saved.");
//   toast.error("Couldn't save", { description: err.message });
//   toast.info("Invite sent", { action: { label: "Undo", onClick: undo } });
//   const id = toast.loading("Importing tenants…");
//   toast.dismiss(id);
//   await toast.promise(fetchSomething(), {
//     loading: "Fetching…",
//     success: (data) => `Got ${data.count}`,
//     error: (err)  => `Failed: ${err.message}`,
//   });

type Variant = "success" | "error" | "info" | "warning" | "loading";

type ToastPosition = "top-right" | "top-left" | "bottom-right" | "bottom-left";

export interface ToastOptions {
  description?: React.ReactNode;
  /** Override default duration. 0 disables auto-dismiss (use for loading). */
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastRecord extends ToastOptions {
  id: number;
  variant: Variant;
  title: React.ReactNode;
  /** True while the user is hovering — pauses auto-dismiss timer. */
  paused?: boolean;
  /** Internal: ms remaining when paused. */
  remaining?: number;
}

interface ToastContextValue {
  push: (variant: Variant, title: React.ReactNode, opts?: ToastOptions) => number;
  update: (id: number, variant: Variant, title: React.ReactNode, opts?: ToastOptions) => void;
  dismiss: (id: number) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

// Spec §0.5.30 default durations.
const DEFAULT_DURATION: Record<Variant, number> = {
  success: 5000,
  info:    5000,
  warning: 5000,
  error:   10000,
  loading: 0, // never auto-dismiss
};

// Spec §0.5.30 — max stack 5. Older toasts are dropped on overflow.
const MAX_STACK = 5;

export function ToastProvider({
  children,
  position = "top-right",
}: {
  children: React.ReactNode;
  position?: ToastPosition;
}) {
  const [toasts, setToasts] = React.useState<ToastRecord[]>([]);
  const nextIdRef = React.useRef(1);
  // Per-toast dismissal timer registry. Allows pause-on-hover by
  // clearing + recreating the timer.
  const timersRef = React.useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = React.useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const scheduleDismiss = React.useCallback(
    (id: number, ms: number) => {
      if (ms <= 0) return;
      const handle = setTimeout(() => dismiss(id), ms);
      timersRef.current.set(id, handle);
    },
    [dismiss],
  );

  const push = React.useCallback<ToastContextValue["push"]>(
    (variant, title, opts) => {
      const id = nextIdRef.current++;
      const rec: ToastRecord = { id, variant, title, ...opts };
      setToasts((prev) => {
        const next = [...prev, rec];
        // Spec §0.5.30 — max stack 5; oldest are dropped first.
        return next.length <= MAX_STACK ? next : next.slice(next.length - MAX_STACK);
      });
      const duration = opts?.duration ?? DEFAULT_DURATION[variant];
      scheduleDismiss(id, duration);
      return id;
    },
    [scheduleDismiss],
  );

  const update = React.useCallback<ToastContextValue["update"]>(
    (id, variant, title, opts) => {
      // Clear any existing timer for this id; re-schedule with the new
      // duration. Used by toast.promise when a pending toast resolves.
      const existing = timersRef.current.get(id);
      if (existing) clearTimeout(existing);
      timersRef.current.delete(id);
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, variant, title, ...opts } : t)));
      const duration = opts?.duration ?? DEFAULT_DURATION[variant];
      scheduleDismiss(id, duration);
    },
    [scheduleDismiss],
  );

  // Pause-on-hover: clear the dismissal timer when entering, resume on
  // leave. Implemented as helpers below; ToastItem calls them via prop.
  const pause = React.useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);
  const resume = React.useCallback((id: number) => {
    const t = toasts.find((x) => x.id === id);
    if (!t) return;
    const ms = t.duration ?? DEFAULT_DURATION[t.variant];
    scheduleDismiss(id, ms);
  }, [toasts, scheduleDismiss]);

  // Global ESC dismisses the most recent toast.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setToasts((prev) => (prev.length === 0 ? prev : prev.slice(0, -1)));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Cleanup all timers on unmount.
  React.useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const value = React.useMemo<ToastContextValue>(
    () => ({ push, update, dismiss }),
    [push, update, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport
        toasts={toasts}
        position={position}
        onDismiss={dismiss}
        onPause={pause}
        onResume={resume}
      />
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
      error:   (title: React.ReactNode, opts?: ToastOptions) => ctx?.push("error",   title, opts) ?? -1,
      info:    (title: React.ReactNode, opts?: ToastOptions) => ctx?.push("info",    title, opts) ?? -1,
      warning: (title: React.ReactNode, opts?: ToastOptions) => ctx?.push("warning", title, opts) ?? -1,
      /** Spec §0.5.30 — persistent loading toast. Returns the id so the
       *  caller can dismiss / replace it. */
      loading: (title: React.ReactNode, opts?: ToastOptions) =>
        ctx?.push("loading", title, opts) ?? -1,
      /** Spec §0.5.30 — chains pending → resolved/rejected. Renders a
       *  loading toast immediately, then morphs to success/error when
       *  the promise settles. */
      promise: async <T,>(
        promise: Promise<T>,
        msgs: {
          loading: React.ReactNode;
          success: React.ReactNode | ((value: T) => React.ReactNode);
          error:   React.ReactNode | ((err: unknown) => React.ReactNode);
        },
      ): Promise<T> => {
        const id = ctx?.push("loading", msgs.loading) ?? -1;
        try {
          const value = await promise;
          const title = typeof msgs.success === "function"
            ? (msgs.success as (v: T) => React.ReactNode)(value)
            : msgs.success;
          ctx?.update(id, "success", title);
          return value;
        } catch (err) {
          const title = typeof msgs.error === "function"
            ? (msgs.error as (e: unknown) => React.ReactNode)(err)
            : msgs.error;
          ctx?.update(id, "error", title);
          throw err;
        }
      },
      dismiss: (id: number) => ctx?.dismiss(id),
    }),
    [ctx],
  );
}

function ToastViewport({
  toasts,
  position,
  onDismiss,
  onPause,
  onResume,
}: {
  toasts: ToastRecord[];
  position: ToastPosition;
  onDismiss: (id: number) => void;
  onPause: (id: number) => void;
  onResume: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  // Position decides flex direction + alignment so newest renders at
  // the visible "front" of the stack (top for top-* positions, bottom
  // for bottom-*).
  const positionClass: Record<ToastPosition, string> = {
    "top-right":    "items-end justify-start",
    "top-left":     "items-start justify-start",
    "bottom-right": "items-end justify-end",
    "bottom-left":  "items-start justify-end",
  };
  return (
    <div
      role="region"
      aria-label="Notifications"
      className={cn(
        "pointer-events-none fixed inset-0 z-[var(--z-toast,60)] flex flex-col gap-2 p-4 sm:p-6",
        positionClass[position],
      )}
    >
      {toasts.map((t) => (
        <ToastItem
          key={t.id}
          toast={t}
          onDismiss={onDismiss}
          onPause={onPause}
          onResume={onResume}
        />
      ))}
    </div>
  );
}

const VARIANT_STYLE: Record<Variant, { bg: string; fg: string; icon: string }> = {
  success: { bg: "var(--emerald-100, var(--success-surface))", fg: "var(--emerald-700, var(--success-fg))", icon: "✓" },
  error:   { bg: "var(--rose-100, var(--danger-surface))",     fg: "var(--rose-700, var(--danger-fg))",     icon: "!" },
  warning: { bg: "var(--amber-100, var(--warning-surface))",   fg: "var(--amber-700, var(--warning-fg))",   icon: "!" },
  info:    { bg: "var(--sky-100, var(--info-surface))",        fg: "var(--sky-700, var(--info-fg))",        icon: "i" },
  loading: { bg: "var(--surface-2)",                            fg: "var(--text-muted)",                     icon: "" },
};

function ToastItem({
  toast,
  onDismiss,
  onPause,
  onResume,
}: {
  toast: ToastRecord;
  onDismiss: (id: number) => void;
  onPause: (id: number) => void;
  onResume: (id: number) => void;
}) {
  const v = VARIANT_STYLE[toast.variant];
  return (
    <div
      role={toast.variant === "error" ? "alert" : "status"}
      onMouseEnter={() => onPause(toast.id)}
      onMouseLeave={() => onResume(toast.id)}
      className={cn(
        "ts-toast pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg px-4 py-3",
      )}
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-default)",
        boxShadow: "var(--shadow-lg, 0 10px 30px rgba(0,0,0,0.2))",
      }}
    >
      {toast.variant === "loading" ? (
        <span
          role="status"
          aria-label="Loading"
          className="mt-0.5 inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
          style={{ color: "var(--accent-primary)" }}
        />
      ) : (
        <span
          aria-hidden
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold"
          style={{ background: v.bg, color: v.fg }}
        >
          {v.icon}
        </span>
      )}
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
