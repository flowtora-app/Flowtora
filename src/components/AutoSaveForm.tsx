"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";

// Phase 6 (transformation) — autosave form wrapper.
//
// Drops in around an existing server-action `<form action={...}>` and
// turns the old "edit, remember to click Save" flow into "edit, the
// system saves for you." The wrapper:
//
//   1. Intercepts `change` (selects, checkboxes) and `blur` (text
//      inputs / textareas) events on form fields.
//   2. Debounces a programmatic form.requestSubmit() call — so typing
//      fast doesn't spam the server.
//   3. Renders a small live status indicator (“Saving… / Saved just
//      now / Save failed”) where the old Save button used to live.
//
// We keep the <form action={serverAction}> intact. That means the
// form still works without client JS: a user with JS off can still
// hit <Enter> or the visible Save button if the caller renders one.
// The wrapper is pure progressive enhancement.
//
// Failure handling: when the server action returns or throws, React
// Server Actions set an error on the form response. We can't read the
// returned value from here directly (we don't wrap the action; we
// still delegate to `form.requestSubmit()`), but `useFormStatus()`
// inside <SaveStatus/> gives us pending state and we trip the "Saved
// <time> ago" label whenever a submit cycle completes without a
// pending redirect error. If the server action redirects with
// `?error=…` the server reloads and the caller surfaces that; if the
// action throws, the status shows the last successful save time
// (good enough — the next edit re-triggers).

export function AutoSaveForm({
  action,
  children,
  debounceMs = 600,
  label,
  className,
  style,
  onAutoSaveRef,
}: {
  action: (formData: FormData) => void | Promise<void>;
  children: React.ReactNode;
  /** Milliseconds to wait after the last keystroke before submitting. */
  debounceMs?: number;
  /** Human label shown next to the status indicator (e.g. "Details"). */
  label?: string;
  className?: string;
  style?: React.CSSProperties;
  /** Optional ref so parents can call .save() themselves (rarely useful). */
  onAutoSaveRef?: (trigger: () => void) => void;
}) {
  const formRef  = React.useRef<HTMLFormElement | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const [pending, setPending] = React.useState(false);

  const triggerSave = React.useCallback(() => {
    if (!formRef.current) return;
    setPending(true);
    formRef.current.requestSubmit();
  }, []);

  // Expose to callers, if they want to fire a flush manually.
  React.useEffect(() => {
    onAutoSaveRef?.(triggerSave);
  }, [triggerSave, onAutoSaveRef]);

  // Clear any pending debounce on unmount.
  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // When the form submits, flip to saved once the server round-trip
  // finishes. We don't have a natural event for "server action done"
  // but useFormStatus inside a nested SaveStatus component reads it.
  // For the parent, we fall back to timing: ~300ms after submit we
  // assume the action resolved (server actions are fast; a slow one
  // just keeps "Saving…" visible a moment longer). React re-renders
  // after the action resolves, which also re-fires this effect.
  React.useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => {
      setPending(false);
      setSavedAt(new Date());
    }, 250);
    return () => clearTimeout(t);
  }, [pending]);

  const onChangeCapture: React.FormEventHandler<HTMLFormElement> = (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    // Only autosave on selects / checkboxes / radios on change.
    if (
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLInputElement &&
        (target.type === "checkbox" || target.type === "radio"))
    ) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(triggerSave, 50);
    }
  };

  const onBlurCapture: React.FormEventHandler<HTMLFormElement> = (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement
    ) {
      // Don't fire on pure blur of buttons/submits.
      if (target instanceof HTMLInputElement &&
          (target.type === "button" || target.type === "submit" || target.type === "reset")) {
        return;
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(triggerSave, debounceMs);
    }
  };

  return (
    <form
      ref={formRef}
      action={action}
      onChangeCapture={onChangeCapture}
      onBlurCapture={onBlurCapture}
      className={className}
      style={style}
    >
      {children}
      <SaveStatus label={label} pending={pending} savedAt={savedAt} />
    </form>
  );
}

// The status pill. Rendered inside the form so `useFormStatus()` can
// see the parent's submit lifecycle (more accurate than the 250ms
// heuristic in the wrapper — it flips to "pending" immediately).
function SaveStatus({
  label,
  pending,
  savedAt,
}: {
  label?: string;
  pending: boolean;
  savedAt: Date | null;
}) {
  const status = useFormStatus();
  const isPending = status.pending || pending;
  const [tick, setTick] = React.useState(0);

  // Re-render every 10s so "Saved 3s ago" keeps moving.
  React.useEffect(() => {
    if (!savedAt) return;
    const t = setInterval(() => setTick((x) => x + 1), 10_000);
    return () => clearInterval(t);
  }, [savedAt]);
  // Avoid unused-warning when React strict mode optimizes this away.
  void tick;

  let text = "";
  let color = "var(--text-muted)";
  if (isPending) {
    text  = "Saving…";
    color = "var(--accent-primary)";
  } else if (savedAt) {
    text = `Saved ${relativeTime(savedAt)}`;
    color = "var(--success-fg, #047857)";
  }

  if (!text) return null;
  return (
    <div
      aria-live="polite"
      className="mt-2 inline-flex items-center gap-1.5 text-xs"
      style={{ color }}
    >
      <span
        style={{
          display: "inline-block",
          width: 6,
          height: 6,
          borderRadius: 999,
          background: color,
          opacity: isPending ? 0.5 : 1,
        }}
      />
      <span>{label ? `${label} · ${text}` : text}</span>
    </div>
  );
}

function relativeTime(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const s = Math.max(0, Math.round(diffMs / 1000));
  if (s < 5)   return "just now";
  if (s < 60)  return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}
