"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";

// SubmitButton — a low-style submit button that automatically reads its
// parent form's pending state via `useFormStatus()` and swaps in a small
// inline spinner while the action is in flight. Use it as a drop-in
// replacement for `<button type="submit">` in row-action forms, dropdown
// menu items, and other places where the chunky <Button> primitive is
// visually too heavy.
//
//   <form action={archive}>
//     <SubmitButton className="text-xs underline">Archive</SubmitButton>
//   </form>
//
// Caller fully controls className/style. We only override `disabled`
// and `aria-busy` while pending so the user can't double-submit and
// assistive tech announces the in-flight state.

export interface SubmitButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  /**
   * Replacement label rendered while pending. Defaults to a small
   * inline spinner that picks up the surrounding text color.
   */
  pendingLabel?: React.ReactNode;
}

export function SubmitButton({
  pendingLabel,
  disabled,
  children,
  className,
  style,
  ...rest
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button
      {...rest}
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={className}
      style={{
        ...style,
        cursor: pending ? "not-allowed" : style?.cursor,
        opacity: pending ? 0.7 : style?.opacity,
      }}
    >
      {pending ? (pendingLabel ?? <InlineSpinner />) : children}
    </button>
  );
}

function InlineSpinner() {
  return (
    <span className="inline-flex items-center gap-1">
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        className="animate-spin"
        aria-hidden
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span>Working…</span>
    </span>
  );
}
