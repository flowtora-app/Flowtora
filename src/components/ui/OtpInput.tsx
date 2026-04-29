"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// OtpInput — Spec Page 0 §0.5.12.
//
// 6 separate boxes (or N), 40×48px each, monospace, auto-advance,
// paste support spreads digits, Backspace moves back.
// States: focus (border-focus), filled, error (rose), success (emerald).

export interface OtpInputProps {
  value: string;
  onChange: (next: string) => void;
  /** Number of boxes. Default 6. */
  length?: number;
  /** "numeric" (default) limits to 0-9; "alphanumeric" allows letters too. */
  inputMode?: "numeric" | "alphanumeric";
  state?: "default" | "error" | "success";
  /** Fired with the full value once all boxes are filled. */
  onComplete?: (value: string) => void;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

export function OtpInput({
  value,
  onChange,
  length = 6,
  inputMode = "numeric",
  state = "default",
  onComplete,
  className,
  disabled,
  "aria-label": ariaLabel = "One-time code",
}: OtpInputProps) {
  const refs = React.useRef<(HTMLInputElement | null)[]>([]);
  const chars = value.padEnd(length, " ").slice(0, length).split("");

  const focusAt = (i: number) => {
    const el = refs.current[i];
    if (el) {
      el.focus();
      el.select();
    }
  };

  const setChar = (i: number, ch: string) => {
    const v = value.padEnd(length, " ").split("");
    v[i] = ch;
    const trimmed = v.join("").replace(/\s+$/, "");
    onChange(trimmed);
    if (ch && trimmed.length === length) onComplete?.(trimmed);
  };

  const onChangeBox = (i: number, raw: string) => {
    const want = inputMode === "numeric" ? raw.replace(/\D/g, "") : raw.replace(/[^a-zA-Z0-9]/g, "");
    if (want.length === 0) {
      setChar(i, "");
      return;
    }
    // If user typed multiple chars (e.g. paste landed in one box), spread.
    const upper = want.toUpperCase();
    if (upper.length === 1) {
      setChar(i, upper);
      if (i < length - 1) focusAt(i + 1);
    } else {
      const merged = (value.slice(0, i) + upper).slice(0, length);
      onChange(merged);
      const next = Math.min(length - 1, i + upper.length);
      focusAt(next);
      if (merged.length === length) onComplete?.(merged);
    }
  };

  const onKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (chars[i] && chars[i] !== " ") {
        setChar(i, "");
      } else if (i > 0) {
        focusAt(i - 1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (i > 0) focusAt(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (i < length - 1) focusAt(i + 1);
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text");
    const want = inputMode === "numeric" ? text.replace(/\D/g, "") : text.replace(/[^a-zA-Z0-9]/g, "");
    if (!want) return;
    onChange(want.toUpperCase().slice(0, length));
    focusAt(Math.min(length - 1, want.length - 1));
    if (want.length >= length) onComplete?.(want.slice(0, length));
  };

  const borderColor =
    state === "error"   ? "var(--rose-500, var(--danger))" :
    state === "success" ? "var(--emerald-500, var(--success))" :
                          "var(--border-default)";

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("inline-flex items-center gap-2", className)}
    >
      {chars.map((c, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text"
          inputMode={inputMode === "numeric" ? "numeric" : "text"}
          autoComplete={i === 0 ? "one-time-code" : "off"}
          value={c.trim()}
          maxLength={6 /* allow paste-spread */}
          onChange={(e) => onChangeBox(i, e.target.value.slice(-1) || e.target.value)}
          onKeyDown={(e) => onKey(i, e)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()}
          disabled={disabled}
          className="ts-focus rounded-md border bg-transparent text-center font-mono"
          style={{
            width: 40,
            height: 48,
            fontSize: 18,
            fontWeight: 600,
            color: "var(--text-default)",
            background: "var(--surface-1)",
            borderColor,
          }}
        />
      ))}
    </div>
  );
}
